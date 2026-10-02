package app.linkpoint.core

import app.linkpoint.core.env.RegionEnvironment
import app.linkpoint.core.llsd.Llsd
import app.linkpoint.core.llsd.asLlsdList
import app.linkpoint.core.llsd.asLlsdMap
import app.linkpoint.core.login.LoginResult
import app.linkpoint.core.model.*
import app.linkpoint.core.net.*
import app.linkpoint.core.scene.ObjectDecoder
import app.linkpoint.core.scene.SceneStore
import app.linkpoint.core.terrain.Heightmap
import app.linkpoint.core.terrain.TerrainDecoder
import java.net.InetSocketAddress
import java.util.UUID
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.sync.withLock

/**
 * A live Second Life session: one UDP circuit, the capability event queue, and the state the UI
 * shows. The UI observes the StateFlows and calls the suspend/plain functions; it never touches
 * packets.
 *
 * Not yet exercised against a live grid (see android-kotlin/README.md): behaviour is covered by
 * unit tests and a loopback fake simulator.
 */
private const val ARRIVAL_GRACE_MS = 2_500L

/** How long after a re-request a TeleportFailed (before the next TeleportStart) is taken to belong to the replaced attempt. */
private const val STALE_FAILURE_WINDOW_MS = 45_000L

/** How long to wait for a teleport destination to accept us when the teleport can still be re-requested. */
private const val TELEPORT_ARRIVAL_TIMEOUT_MS = 12_000L


class ViewerSession(
    private val http: Http,
    private val scope: CoroutineScope,
    private val circuitFactory: (CoroutineScope, String, Int) -> Circuit = { s, h, p -> Circuit.to(s, h, p) },
    private val clock: () -> Long = System::currentTimeMillis,
    private val handshakeTimeoutMs: Long = 30_000,
    private val silenceTimeoutMs: Long = 60_000,
    private val watchdogIntervalMs: Long = 5_000,
) {
    private val ids = AtomicLong(1)
    private val _state = MutableStateFlow(ConnectionState.DISCONNECTED)
    val state: StateFlow<ConnectionState> = _state
    private val _chat = MutableStateFlow<List<ChatEntry>>(emptyList())
    val chat: StateFlow<List<ChatEntry>> = _chat
    private val _friends = MutableStateFlow<List<Friend>>(emptyList())
    val friends: StateFlow<List<Friend>> = _friends
    private val _nearby = MutableStateFlow<List<NearbyAvatar>>(emptyList())
    val nearby: StateFlow<List<NearbyAvatar>> = _nearby
    private val _region = MutableStateFlow<RegionInfo?>(null)
    val region: StateFlow<RegionInfo?> = _region
    private val _balance = MutableStateFlow<Int?>(null)
    val balance: StateFlow<Int?> = _balance
    private val _notices = MutableSharedFlow<ViewerNotice>(extraBufferCapacity = 32)
    val notices: SharedFlow<ViewerNotice> = _notices
    /** Raw simulator messages the 3D layer subscribes to (object updates etc.). */
    private val _raw = MutableSharedFlow<Received>(extraBufferCapacity = 2048, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    val rawMessages: SharedFlow<Received> = _raw
    private val _inventory = MutableStateFlow(InventoryState())
    val inventory: StateFlow<InventoryState> = _inventory
    private val _groups = MutableStateFlow<List<GroupInfo>>(emptyList())
    val groups: StateFlow<List<GroupInfo>> = _groups
    private val _parcel = MutableStateFlow<ParcelInfo?>(null)
    val parcel: StateFlow<ParcelInfo?> = _parcel
    private val _offers = MutableStateFlow<List<PendingOffer>>(emptyList())
    val offers: StateFlow<List<PendingOffer>> = _offers
    private val profileWaits = java.util.concurrent.ConcurrentHashMap<UUID, CompletableDeferred<Incoming.AvatarProperties>>()
    private val _environment = MutableStateFlow(RegionEnvironment.FALLBACK)
    /** The region's sky/water settings, or an estimated Windlight sky until the region answers. */
    val environment: StateFlow<RegionEnvironment> = _environment
    private val _soundEvents = MutableSharedFlow<app.linkpoint.core.audio.SoundEvent>(extraBufferCapacity = 256, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    /** Sounds the simulator asks us to play; object sounds that arrive inside object updates are in [scene] instead. */
    val soundEvents: SharedFlow<app.linkpoint.core.audio.SoundEvent> = _soundEvents
    private val _parcelMedia = MutableStateFlow<ParcelMedia?>(null)
    /** The media (stream, video or page) of the parcel we are on, or null when it has none. */
    val parcelMedia: StateFlow<ParcelMedia?> = _parcelMedia
    private val _mediaPlayback = MutableStateFlow(MediaPlayback())
    /** Play / pause / seek commands the simulator has sent for that media. */
    val mediaPlayback: StateFlow<MediaPlayback> = _mediaPlayback
    private val _capabilities = MutableStateFlow<Map<String, String>>(emptyMap())
    val capabilities: StateFlow<Map<String, String>> = _capabilities

    /** Objects of the current region, kept up to date from the simulator's object messages. */
    val scene = SceneStore()

    /** Terrain heights of the current region, filled in as LayerData arrives. */
    val heightmap = Heightmap()

    private var login: LoginResult? = null
    private lateinit var agentId: UUID
    private lateinit var sessionId: UUID
    @Volatile private var circuit: Circuit? = null
    private var jobs = mutableListOf<Job>()
    private var circuitJobs = mutableListOf<Job>()
    private val names = HashMap<UUID, String>()
    private val requestedNames = HashSet<UUID>()
    private var movementDone: CompletableDeferred<Unit>? = null
    private var logoutDone: CompletableDeferred<Unit>? = null
    private var mapReply: CompletableDeferred<List<MapBlockInfo>>? = null
    private var coarse: Incoming.CoarseLocations? = null

    val selfId: UUID? get() = if (::agentId.isInitialized) agentId else null
    val selfName: String? get() = login?.fullName
    val currentCircuit: Circuit? get() = circuit

    suspend fun connect(result: LoginResult) {
        check(_state.value == ConnectionState.DISCONNECTED) { "Already connected" }
        _state.value = ConnectionState.CONNECTING
        _chat.value = emptyList(); _region.value = null; _balance.value = null; scene.clear(); heightmap.clear()
        _groups.value = emptyList(); _parcel.value = null; _offers.value = emptyList()
        _parcelMedia.value = null; _mediaPlayback.value = MediaPlayback()
        try {
            login = result
            agentId = UUID.fromString(result.agentId)
            sessionId = UUID.fromString(result.sessionId)
            names[agentId] = result.fullName
            _inventory.value = InventoryState(
                rootId = result.inventoryRootId?.let { runCatching { UUID.fromString(it) }.getOrNull() },
                folders = result.inventorySkeleton.associateBy { it.id },
            )
            _friends.value = result.buddies.mapNotNull { b ->
                runCatching { Friend(UUID.fromString(b.id), null, null, b.rightsGiven, b.rightsHas) }.getOrNull()
            }
            enterSimulator(result.simIp, result.simPort, result.seedCapability)
            _state.value = ConnectionState.CONNECTED
            jobs += scope.launch { agentUpdateLoop() }
            jobs += scope.launch { watchdog() }
            requestNames(_friends.value.map { it.id })
            circuit?.send(Messages.moneyBalanceRequest(agentId, sessionId))
        } catch (e: Throwable) {
            teardown()
            throw e
        }
    }

    private val switchLock = kotlinx.coroutines.sync.Mutex()

    /**
     * Circuits to neighbouring simulators ("child agents"). A grid tells us about them with EnableSimulator and expects
     * us to open a circuit to each (UseCircuitCode) so that a region crossing or teleport can hand our agent over;
     * without them OpenSim answers a crossing with "agent update failed".
     */
    private class Child(val circuit: Circuit, val job: Job, val openedAt: Long, @Volatile var handshake: Received?) {
        /** True once the neighbour has sent us anything: its side of the child agent exists. */
        @Volatile var heard = false
    }
    private val children = java.util.concurrent.ConcurrentHashMap<String, Child>()

    @Volatile private var arrivedAt = 0L

    /**
     * The teleport request we last sent (by name or home), kept for one automatic retry. OpenSim can accept the teleport
     * (TeleportFinish) and then drop our connection into a region that still holds a stale presence of ours; its
     * arrival authorisation is spent, so reconnecting cannot help, but asking for the teleport again works at once.
     */
    @Volatile private var lastTeleportRequest: Outgoing? = null
    @Volatile private var teleportRetriesLeft = 0
    @Volatile private var retriedAt = -STALE_FAILURE_WINDOW_MS
    /** After a re-request: true until OpenSim announces the new attempt (TeleportStart); a failure before that is the old one. */
    @Volatile private var awaitingRetryStart = false
    private fun sendTeleportRequest(msg: Outgoing) {
        lastTeleportRequest = msg; teleportRetriesLeft = 1
        teleportAskedAt = clock()
        circuit?.send(msg)
    }

    /** Set when we have asked for a teleport and not yet arrived or heard that it failed. */
    @Volatile private var teleportAskedAt = 0L
    private val teleportInFlight get() = teleportAskedAt != 0L && clock() - teleportAskedAt < 60_000

    private fun enableChild(ip: String, port: Int) {
        // Opening a child circuit while a teleport is under way makes OpenSim race our UseCircuitCode against the
        // teleport's agent update (it throws and the teleport fails); we will be told about the neighbours again on arrival.
        if (teleportInFlight) return
        val key = "$ip:$port"
        val root = circuit?.remote
        if (children.containsKey(key) || (root != null && root.address.hostAddress == ip && root.port == port)) return
        val c = circuitFactory(scope, ip, port)
        lateinit var child: Child
        c.start()
        val job = scope.launch(start = CoroutineStart.UNDISPATCHED) {
            c.messages.collect { rx ->
                child.heard = true
                if (rx.id == Msg.RegionHandshake) {
                    child.handshake = rx
                    c.send(Messages.regionHandshakeReply(agentId, sessionId))
                }
            }
        }
        child = Child(c, job, clock(), null)
        children[key] = child
        c.send(Messages.useCircuitCode(login!!.circuitCode, sessionId, agentId))
    }

    /**
     * Give child circuits that were opened a moment ago time to be accepted before a teleport request goes out. OpenSim
     * handles a UseCircuitCode for a region and a teleport into that same region concurrently, throws, drops our
     * presence there and fails the teleport 25 s later ("UpdateAgent failed"); seen live when a viewer teleports within
     * a second of arriving next to the target. Bounded so a silent neighbour cannot stall a teleport.
     */
    private suspend fun settleChildren(maxWaitMs: Long = 3_000) {
        // Right after arriving, the new region's event queue has usually not announced its neighbours yet; if we sent the
        // request now they would be announced (and connected) in the middle of the teleport. Let that happen first.
        val grace = arrivedAt + ARRIVAL_GRACE_MS - clock()
        if (arrivedAt != 0L && grace > 0) delay(grace)
        val end = clock() + maxWaitMs
        while (clock() < end && children.values.any { !it.heard && clock() - it.openedAt < maxWaitMs }) delay(50)
        if (children.isNotEmpty()) delay(150) // the neighbour answered; let its presence finish setting up
    }

    private fun closeChildren() {
        for (k in children.keys.toList()) children.remove(k)?.let { it.job.cancel(); it.circuit.close() }
    }

    /** Open a circuit to a simulator and complete the handshake. Used at login, teleport and region crossing. */
    private suspend fun enterSimulator(ip: String, port: Int, seedCapability: String, timeoutMs: Long = handshakeTimeoutMs) = switchLock.withLock {
        val code = login!!.circuitCode
        val previous = circuit
        val previousJobs = circuitJobs
        // Stop listening to the old simulator and forget its region *before* the new circuit starts: the new
        // simulator begins streaming terrain and objects as soon as it accepts us, and those must not be wiped.
        previousJobs.forEach { it.cancel() }
        scene.clear(); heightmap.clear(); _nearby.value = emptyList()
        _parcel.value = null; _parcelMedia.value = null; _mediaPlayback.value = MediaPlayback() // the old parcel's stream must not follow us

        // A neighbour we already hold a circuit to is promoted: it has seen UseCircuitCode, so only the movement completes.
        val promoted = children.remove("$ip:$port")
        promoted?.job?.cancel()
        val fresh = promoted?.circuit ?: circuitFactory(scope, ip, port)
        val done = CompletableDeferred<Unit>()
        movementDone = done
        circuitJobs = mutableListOf()
        circuit = fresh
        if (promoted == null) fresh.start()
        // UNDISPATCHED: the flows do not replay, so we must be subscribed before the first packet can arrive.
        circuitJobs += scope.launch(start = CoroutineStart.UNDISPATCHED) { fresh.messages.collect { onMessage(it) } }
        circuitJobs += scope.launch(start = CoroutineStart.UNDISPATCHED) { fresh.lost.collect { if (it == Msg.UseCircuitCode && !(lastTeleportRequest != null && teleportRetriesLeft > 0)) _notices.tryEmit(ViewerNotice.Error("The simulator did not answer the circuit request")) } }
        // The region handshake may already have arrived while this simulator was only a neighbour: process it now.
        promoted?.handshake?.let { onMessage(it) }
        if (promoted == null) fresh.send(Messages.useCircuitCode(code, sessionId, agentId))
        fresh.send(Messages.completeAgentMovement(agentId, sessionId, code))
        try {
            withTimeout(timeoutMs) { done.await() }
        } catch (e: TimeoutCancellationException) {
            fresh.close(); circuitJobs.forEach { it.cancel() }
            // Go back to listening to the old simulator, if there was one.
            circuit = previous
            circuitJobs = if (previous != null) mutableListOf(scope.launch(start = CoroutineStart.UNDISPATCHED) { previous.messages.collect { onMessage(it) } }) else mutableListOf()
            throw java.io.IOException("The simulator did not complete the handshake in ${timeoutMs / 1000.0} seconds".replace(".0 ", " "))
        }
        previous?.close()
        teleportAskedAt = 0
        arrivedAt = clock()
        // The grid announces the new neighbours (including the region we just left) once we are in.
        closeChildren()
        startCaps(seedCapability)
    }

    private var capsJob: Job? = null
    private fun startCaps(seed: String) {
        capsJob?.cancel()
        if (seed.isBlank()) return
        capsJob = scope.launch {
            try {
                val caps = Caps.fetch(http, seed)
                _capabilities.value = caps
                caps["ExtEnvironment"]?.let { url ->
                    launch {
                        try {
                            val r = http.get("$url?parcelid=-1", mapOf("Accept" to "application/llsd+xml"), 30_000)
                            if (r.ok) RegionEnvironment.fromLlsd(Llsd.parseXml(r.body).asLlsdMap())?.let { _environment.value = it }
                        } catch (e: CancellationException) { throw e } catch (_: Exception) { /* keep the estimated sky */ }
                    }
                }
                val eq = caps["EventQueueGet"] ?: return@launch
                EventQueue(http, eq).run(this, ::onEvent) { _notices.tryEmit(ViewerNotice.Error(it)) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _notices.tryEmit(ViewerNotice.Error("Could not reach the region's capabilities: ${e.message}"))
            }
        }
    }

    private suspend fun onEvent(e: SimEvent) {
        when (e.message) {
            "TeleportFinish" -> {
                val info = (e.body["Info"] as? List<*>)?.firstOrNull() as? Map<*, *> ?: return
                val ip = (info["SimIP"] as? ByteArray)?.joinToString(".") { (it.toInt() and 0xFF).toString() } ?: return
                val port = (info["SimPort"] as? Number)?.toInt() ?: return
                val seed = info["SeedCapability"]?.toString() ?: ""
                _notices.tryEmit(ViewerNotice.Teleport("Arriving at the new region…"))
                val retry = lastTeleportRequest?.takeIf { teleportRetriesLeft > 0 }
                try {
                    // With a retry available, do not wait the full handshake budget on a connection that is not going to work.
                    enterSimulator(ip, port, seed, if (retry != null) minOf(handshakeTimeoutMs, TELEPORT_ARRIVAL_TIMEOUT_MS) else handshakeTimeoutMs)
                    lastTeleportRequest = null
                } catch (ex: Exception) {
                    if (retry != null && teleportRetriesLeft > 0) {
                        teleportRetriesLeft--
                        _notices.tryEmit(ViewerNotice.Teleport("The teleport did not complete; trying again…"))
                        delay(1_000)
                        teleportAskedAt = clock()
                        retriedAt = clock(); awaitingRetryStart = true
                        circuit?.send(retry)
                    } else {
                        lastTeleportRequest = null
                        _notices.tryEmit(ViewerNotice.Error("Teleport failed: ${ex.message}"))
                    }
                }
            }
            "AgentGroupDataUpdate" -> {
                val list = e.body["GroupData"].asLlsdList().orEmpty().mapNotNull { g ->
                    val m = g.asLlsdMap() ?: return@mapNotNull null
                    GroupInfo(m["GroupID"] as? UUID ?: return@mapNotNull null, m["GroupName"]?.toString() ?: "", m["AcceptNotices"] == true)
                }
                if (list.isNotEmpty()) _groups.value = list.sortedBy { it.name.lowercase() }
            }
            "ParcelProperties" -> {
                val d = e.body["ParcelData"].asLlsdList()?.firstOrNull().asLlsdMap() ?: return
                fun int(k: String) = (d[k] as? Number)?.toInt()
                _parcel.value = ParcelInfo(
                    int("LocalID") ?: -1, d["Name"]?.toString() ?: "", d["Desc"]?.toString() ?: "", int("Area") ?: 0,
                    (d["OwnerID"] as? UUID)?.takeIf { it.mostSignificantBits != 0L || it.leastSignificantBits != 0L },
                    int("MaxPrims"), int("TotalPrims"), d["MusicURL"]?.toString() ?: "", d["MediaURL"]?.toString() ?: "",
                    media = parcelMediaOf(d, e.body["MediaData"].asLlsdList()?.firstOrNull().asLlsdMap()),
                ).also { info ->
                    val old = _parcelMedia.value
                    _parcelMedia.value = info.media
                    if (info.media == null || old?.url != info.media.url) _mediaPlayback.value = MediaPlayback()
                }
            }
            "EnableSimulator" -> {
                for (info in e.body["SimulatorInfo"].asLlsdList().orEmpty()) {
                    val m = info.asLlsdMap() ?: continue
                    val ip = (m["IP"] as? ByteArray)?.takeIf { it.size == 4 }?.joinToString(".") { (it.toInt() and 0xFF).toString() } ?: continue
                    val port = (m["Port"] as? Number)?.toInt() ?: continue
                    if (_state.value != ConnectionState.DISCONNECTED) enableChild(ip, port)
                }
            }
            "CrossedRegion" -> {
                val rd = (e.body["RegionData"] as? List<*>)?.firstOrNull() as? Map<*, *> ?: return
                val ip = (rd["SimIP"] as? ByteArray)?.joinToString(".") { (it.toInt() and 0xFF).toString() } ?: return
                val port = (rd["SimPort"] as? Number)?.toInt() ?: return
                try { enterSimulator(ip, port, rd["SeedCapability"]?.toString() ?: "") } catch (ex: Exception) {
                    _notices.tryEmit(ViewerNotice.Error("Crossing into the next region failed: ${ex.message}"))
                }
            }
        }
    }

    /** Media settings from ParcelProperties: the basics live in ParcelData, description/size/type/loop in MediaData (or alongside, on some grids). */
    private fun parcelMediaOf(d: Map<*, *>, extra: Map<*, *>?): ParcelMedia? {
        fun str(k: String) = (extra?.get(k) ?: d[k])?.toString().orEmpty()
        fun int(k: String) = ((extra?.get(k) ?: d[k]) as? Number)?.toInt() ?: 0
        fun bool(k: String) = when (val v = extra?.get(k) ?: d[k]) { is Boolean -> v; is Number -> v.toInt() != 0; else -> false }
        val url = d["MediaURL"]?.toString().orEmpty()
        val id = (d["MediaID"] as? UUID)?.takeIf { it.mostSignificantBits != 0L || it.leastSignificantBits != 0L }
        if (url.isBlank() && id == null) return null
        return ParcelMedia(url, id, bool("MediaAutoScale"), str("MediaType"), str("MediaDesc"), int("MediaWidth"), int("MediaHeight"), bool("MediaLoop"))
    }

    private fun applyMediaCommand(c: Incoming.ParcelMediaCommand) {
        _mediaPlayback.update { cur ->
            when (c.command) {
                0L -> MediaPlayback(MediaState.STOPPED, 0f, cur.loop)            // STOP
                1L -> cur.copy(state = MediaState.PAUSED)                        // PAUSE
                2L -> cur.copy(state = MediaState.PLAYING)                       // PLAY
                3L -> MediaPlayback(MediaState.PLAYING, cur.timeSeconds, true)   // LOOP
                6L -> cur.copy(timeSeconds = c.time.coerceAtLeast(0f))           // TIME: seek
                8L -> MediaPlayback()                                            // UNLOAD
                13L -> cur.copy(loop = c.time != 0f)                             // LOOP_SET
                else -> cur // texture/url/agent/align/type/size/desc arrive as a ParcelMediaUpdate
            }
        }
        if (c.command == 8L) _parcelMedia.value = null
    }

    private fun onMessage(rx: Received) {
        _raw.tryEmit(rx)
        if (rx.id in ObjectDecoder.MESSAGE_IDS) {
            // Objects announced by id only (we keep no cache) must be requested in full.
            for (chunk in scene.process(rx).chunked(255)) circuit?.send(Messages.requestMultipleObjects(agentId, sessionId, chunk))
            return
        }
        when (val m = Messages.parse(rx.id, rx.body)) {
            is Incoming.ChatFromSimulator -> if (m.message.isNotBlank()) addChat(
                ChatEntry(nextId(), if (m.sourceType == 2) ChatKind.OBJECT_IM else ChatKind.LOCAL, m.sourceId, m.fromName, m.message, m.chatType, null, false, clock()),
            )
            is Incoming.InstantMessage -> onInstantMessage(m)
            is Incoming.RegionHandshake -> {
                circuit?.send(Messages.regionHandshakeReply(agentId, sessionId))
                circuit?.send(Messages.agentThrottle(agentId, sessionId, login!!.circuitCode))
                _region.update {
                    val t = if (m.terrainStartHeights != null && m.terrainHeightRanges != null && m.terrainDetail.size == 4) TerrainInfo(m.terrainDetail, m.terrainStartHeights, m.terrainHeightRanges) else null
                    RegionInfo(m.regionName, m.simAccess, it?.handle ?: 0, it?.position, m.waterHeight, t)
                }
            }
            is Incoming.AgentMovementComplete -> {
                _region.update { RegionInfo(it?.name, it?.access, m.regionHandle, m.position, it?.waterHeight, it?.terrain) }
                movementDone?.complete(Unit)
                sendAgentUpdate()
            }
            is Incoming.OnlineStatus -> _friends.update { list ->
                list.map { f -> if (f.id in m.ids) f.copy(online = m.online) else f }
            }
            is Incoming.UuidNames -> {
                for ((id, first, last) in m.names) names[id] = "$first $last".trim()
                _friends.update { list -> list.map { f -> names[f.id]?.let { f.copy(name = it) } ?: f } }
                coarse?.let { applyCoarse(it) }
            }
            is Incoming.CoarseLocations -> { coarse = m; applyCoarse(m) }
            is Incoming.MoneyBalance -> if (m.success) _balance.value = m.balance
            is Incoming.TeleportStart -> { awaitingRetryStart = false; _notices.tryEmit(ViewerNotice.Teleport("Teleport started")) }
            is Incoming.TeleportProgress -> _notices.tryEmit(ViewerNotice.Teleport(m.message.ifBlank { "Teleporting…" }))
            is Incoming.TeleportFailed -> if (awaitingRetryStart && clock() - retriedAt < STALE_FAILURE_WINDOW_MS) {
                // OpenSim reports the abandoned first attempt as failed before it starts the one we re-requested
                // (it handles the new request only once the old transfer has timed out).
                awaitingRetryStart = false
                _notices.tryEmit(ViewerNotice.Teleport("Continuing with the new teleport request"))
            } else { teleportAskedAt = 0; lastTeleportRequest = null; _notices.tryEmit(ViewerNotice.Error("Teleport failed: ${m.reason}")) }
            is Incoming.TeleportLocal -> {
                // Same region, new spot: our position (which is also the camera we report) must follow.
                teleportAskedAt = 0; lastTeleportRequest = null
                _region.update { it?.copy(position = m.position) }
                _notices.tryEmit(ViewerNotice.Teleport("Teleported within the region"))
            }
            is Incoming.MapBlocks -> mapReply?.complete(m.blocks)
            is Incoming.KickUser -> {
                _notices.tryEmit(ViewerNotice.Disconnected(m.reason.ifBlank { "You were disconnected by the simulator" }))
                scope.launch { teardown() }
            }
            Incoming.LogoutReply -> logoutDone?.complete(Unit)
            is Incoming.TerrainLayer -> try {
                TerrainDecoder.decode(m.data).patches.forEach(heightmap::put)
            } catch (_: IllegalArgumentException) { /* a damaged layer packet: keep what we have */ }
            is Incoming.AvatarProperties -> profileWaits.remove(m.avatarId)?.complete(m)
            is Incoming.SoundTrigger -> _soundEvents.tryEmit(app.linkpoint.core.audio.SoundEvent.Trigger(m.soundId, m.objectId, m.ownerId, app.linkpoint.core.scene.Vec3(m.position[0], m.position[1], m.position[2]), m.gain.coerceIn(0f, 1f)))
            is Incoming.AttachedSound -> _soundEvents.tryEmit(app.linkpoint.core.audio.SoundEvent.Attached(m.soundId, m.objectId, m.gain.coerceIn(0f, 1f), m.flags))
            is Incoming.AttachedSoundGainChange -> _soundEvents.tryEmit(app.linkpoint.core.audio.SoundEvent.GainChange(m.objectId, m.gain.coerceIn(0f, 1f)))
            is Incoming.PreloadSound -> _soundEvents.tryEmit(app.linkpoint.core.audio.SoundEvent.Preload(m.entries.map { it.third }.distinct()))
            is Incoming.ParcelMediaUpdate -> {
                val id = m.mediaId.takeIf { it.mostSignificantBits != 0L || it.leastSignificantBits != 0L }
                _parcelMedia.value = if (m.url.isBlank() && id == null) null else ParcelMedia(m.url, id, m.autoScale, m.type, m.description, m.width, m.height, m.loop)
            }
            is Incoming.ParcelMediaCommand -> applyMediaCommand(m)
            is Incoming.Unhandled -> Unit
        }
    }

    private fun onInstantMessage(m: Incoming.InstantMessage) {
        val from = m.fromAgentId
        val text = m.message
        when (m.dialog) {
            0 -> if (!m.fromGroup) addChat(ChatEntry(nextId(), ChatKind.IM, from, m.fromName, text, 1, m.sessionId, false, clock()))
            19 -> addChat(ChatEntry(nextId(), ChatKind.OBJECT_IM, m.fromAgentId, m.fromName, text, 1, null, false, clock()))
            4, 9 -> system("${m.fromName} offered you an item: $text")
            22 -> { system("${m.fromName} offered you a teleport: $text"); _offers.update { it + PendingOffer.Lure(m.sessionId, m.fromName, text) } }
            39 -> {
                system("${m.fromName} accepted your friendship offer")
                _friends.update { list -> if (list.any { it.id == from }) list else list + Friend(from, m.fromName, null, 0, 0) }
                names[from] = m.fromName
            }
            40 -> system("${m.fromName} declined your friendship offer")
            38, 41 -> { system("${m.fromName} sent a friendship offer: $text"); _offers.update { it + PendingOffer.Friend(m.sessionId, m.fromName, text) } }
            else -> Unit // typing indicators, group sessions and other dialogs are not shown
        }
    }

    /** Ask [toId] to be friends. The answer arrives later as a friendship accepted/declined message. */
    fun sendFriendRequest(toId: UUID, message: String = "Would you like to be my friend?") {
        requireConnected()
        require(toId != agentId) { "You cannot befriend yourself" }
        // The transaction id of a friendship offer is carried in the IM session id field.
        circuit!!.send(Messages.instantMessage(agentId, sessionId, login!!.fullName, toId, message.trim(), dialog = 38, sessionIdForIm = UUID.randomUUID()))
        system("Friend request sent")
    }

    /** Offer [toId] a teleport to where we are. */
    fun offerTeleport(toId: UUID, message: String = "Join me") {
        requireConnected()
        require(toId != agentId) { "You cannot offer a teleport to yourself" }
        circuit!!.send(Messages.startLure(agentId, sessionId, toId, message.trim()))
        system("Teleport offer sent")
    }

    private fun applyCoarse(c: Incoming.CoarseLocations) {
        val me = c.locations.getOrNull(c.youIndex)
        val missing = ArrayList<UUID>()
        val out = ArrayList<NearbyAvatar>()
        // AgentData is parallel to Location and includes our own slot (verified against a live OpenSim 0.9.3; the
        // official viewer also reads the two lists by the same index). A location without an id is skipped.
        for ((i, loc) in c.locations.withIndex()) {
            if (i == c.youIndex) continue
            val id = c.ids.getOrNull(i) ?: continue
            if (id == agentId) continue
            val z = loc[2] * 4
            val dist = me?.let { Math.sqrt(Math.pow((loc[0] - it[0]).toDouble(), 2.0) + Math.pow((loc[1] - it[1]).toDouble(), 2.0) + Math.pow((z - it[2] * 4).toDouble(), 2.0)) }
            out += NearbyAvatar(id, names[id], loc[0], loc[1], z, dist)
            if (id !in names) missing += id
        }
        _nearby.value = out.sortedBy { it.distance ?: Double.MAX_VALUE }
        requestNames(missing)
    }

    private fun requestNames(wanted: List<UUID>) {
        val fresh = wanted.filter { it !in names && requestedNames.add(it) }
        for (chunk in fresh.chunked(50)) circuit?.send(Messages.uuidNameRequest(chunk))
    }

    // ---- actions ---------------------------------------------------------------------------------

    fun sendChat(text: String, chatType: Int = 1, channel: Int = 0) {
        requireConnected()
        val t = text.trim()
        if (t.isEmpty()) return
        circuit!!.send(Messages.chatFromViewer(agentId, sessionId, t, chatType, channel))
    }

    fun sendInstantMessage(toId: UUID, text: String) {
        requireConnected()
        val t = text.trim()
        if (t.isEmpty()) return
        val sid = Messages.imSessionId(agentId, toId)
        circuit!!.send(Messages.instantMessage(agentId, sessionId, login!!.fullName, toId, t))
        addChat(ChatEntry(nextId(), ChatKind.IM, toId, login!!.fullName, t, 1, sid, true, clock()))
    }

    /** Fetch the contents of one inventory folder through the region's inventory capability. */
    suspend fun fetchInventoryFolder(folderId: UUID) {
        requireConnected()
        val cap = _capabilities.value["FetchInventoryDescendents2"] ?: throw java.io.IOException("This region does not offer inventory fetching")
        val request = Llsd.toXml(mapOf("folders" to listOf(mapOf("folder_id" to folderId, "owner_id" to agentId, "fetch_folders" to true, "fetch_items" to true, "sort_order" to 1))))
        val r = http.post(cap, request.toByteArray(), "application/llsd+xml", mapOf("Accept" to "application/llsd+xml"), 60_000)
        if (!r.ok) throw java.io.IOException("Inventory service answered HTTP ${r.status}")
        val folders = Llsd.parseXml(r.body).asLlsdMap()?.get("folders").asLlsdList().orEmpty()
        var folderUpdates = emptyList<InventoryFolder>()
        val newItems = HashMap<UUID, List<InventoryItem>>()
        for (f in folders) {
            val fm = f.asLlsdMap() ?: continue
            val fid = fm["folder_id"] as? UUID ?: continue
            folderUpdates = folderUpdates + fm["categories"].asLlsdList().orEmpty().mapNotNull { c ->
                val cm = c.asLlsdMap() ?: return@mapNotNull null
                InventoryFolder(cm["category_id"] as? UUID ?: return@mapNotNull null, (cm["parent_id"] as? UUID) ?: fid, cm["name"]?.toString() ?: "", (cm["type_default"] as? Number)?.toInt() ?: -1, (cm["version"] as? Number)?.toInt() ?: 0)
            }
            newItems[fid] = fm["items"].asLlsdList().orEmpty().mapNotNull { i ->
                val im = i.asLlsdMap() ?: return@mapNotNull null
                InventoryItem(
                    im["item_id"] as? UUID ?: return@mapNotNull null, (im["parent_id"] as? UUID) ?: fid, im["name"]?.toString() ?: "",
                    (im["type"] as? Number)?.toInt() ?: -1, (im["inv_type"] as? Number)?.toInt() ?: -1, im["desc"]?.toString() ?: "",
                    (im["asset_id"] as? UUID)?.takeIf { it.mostSignificantBits != 0L || it.leastSignificantBits != 0L },
                )
            }.sortedBy { it.name.lowercase() }
        }
        _inventory.update { st ->
            // Replace the folder's contents wholesale rather than merging, so deleted items disappear.
            st.copy(folders = st.folders + folderUpdates.associateBy { it.id }, items = st.items + newItems, loaded = st.loaded + newItems.keys)
        }
    }

    /** Ask the grid for a resident's profile; null if it does not answer in time. */
    suspend fun requestProfile(avatarId: UUID): AvatarProfile? {
        requireConnected()
        val wait = profileWaits.getOrPut(avatarId) { CompletableDeferred() }
        circuit!!.send(Messages.avatarPropertiesRequest(agentId, sessionId, avatarId))
        val p = withTimeoutOrNull(15_000) { wait.await() } ?: run { profileWaits.remove(avatarId); return null }
        return AvatarProfile(
            p.avatarId, p.aboutText, p.bornOn, p.partnerId.takeIf { it.mostSignificantBits != 0L || it.leastSignificantBits != 0L },
            p.profileUrl, p.flags,
        )
    }

    fun acceptOffer(offer: PendingOffer) {
        requireConnected()
        when (offer) {
            is PendingOffer.Lure -> { val lure = offer.id; scope.launch { settleChildren(); sendTeleportRequest(Messages.teleportLureRequest(agentId, sessionId, lure)) } }
            is PendingOffer.Friend -> {
                val inv = _inventory.value
                val cards = inv.folders.values.firstOrNull { it.typeDefault == 2 }?.id ?: inv.rootId ?: UUID(0, 0)
                circuit!!.send(Messages.acceptFriendship(agentId, sessionId, offer.id, cards))
            }
        }
        _offers.update { list -> list.filterNot { it.id == offer.id } }
    }

    fun declineOffer(offer: PendingOffer) {
        requireConnected()
        if (offer is PendingOffer.Friend) circuit!!.send(Messages.declineFriendship(agentId, sessionId, offer.id))
        _offers.update { list -> list.filterNot { it.id == offer.id } }
    }

    fun refreshBalance() { requireConnected(); circuit!!.send(Messages.moneyBalanceRequest(agentId, sessionId)) }

    /** Teleport to a region by name. Looks the region up on the grid map first; throws if it is unknown. */
    suspend fun teleport(regionName: String, x: Float = 128f, y: Float = 128f, z: Float = 30f) {
        requireConnected()
        val wait = CompletableDeferred<List<MapBlockInfo>>().also { mapReply = it }
        circuit!!.send(Messages.mapNameRequest(agentId, sessionId, regionName.trim()))
        val blocks = withTimeoutOrNull(15_000) { wait.await() } ?: throw java.io.IOException("The grid did not answer the region lookup")
        val block = blocks.firstOrNull { it.name.equals(regionName.trim(), true) } ?: throw IllegalArgumentException("No region named \"$regionName\"")
        val handle = ((block.x * 256L) shl 32) or (block.y * 256L)
        settleChildren()
        sendTeleportRequest(Messages.teleportLocationRequest(agentId, sessionId, handle, x, y, z))
    }

    fun teleportHome() { requireConnected(); scope.launch { settleChildren(); sendTeleportRequest(Messages.teleportHome(agentId, sessionId)) } }

    suspend fun logout() {
        if (_state.value == ConnectionState.DISCONNECTED) return
        _state.value = ConnectionState.LOGGING_OUT
        val done = CompletableDeferred<Unit>().also { logoutDone = it }
        circuit?.send(Messages.logoutRequest(agentId, sessionId))
        withTimeoutOrNull(5_000) { done.await() }
        teardown()
    }

    private suspend fun teardown() {
        jobs.forEach { it.cancel() }; jobs.clear()
        capsJob?.cancel()
        circuitJobs.forEach { it.cancel() }; circuitJobs.clear()
        circuit?.close(); circuit = null
        closeChildren()
        _nearby.value = emptyList()
        _state.value = ConnectionState.DISCONNECTED
    }

    @Volatile private var controlFlags = 0L
    @Volatile private var bodyYaw = 0f

    /**
     * Walk the avatar. [forward] and [strafe] are -1, 0 or 1 (strafe positive = left), [up] is 1 to
     * rise or -1 to descend when flying, and [yaw] is the heading in radians (0 faces +X, east).
     */
    fun setMovement(forward: Int, strafe: Int, up: Int = 0, yaw: Float = bodyYaw, fly: Boolean = false) {
        var f = 0L
        if (forward > 0) f = f or AgentControl.AT_POS else if (forward < 0) f = f or AgentControl.AT_NEG
        if (strafe > 0) f = f or AgentControl.LEFT_POS else if (strafe < 0) f = f or AgentControl.LEFT_NEG
        if (up > 0) f = f or AgentControl.UP_POS else if (up < 0) f = f or AgentControl.UP_NEG
        if (fly) f = f or AgentControl.FLY
        controlFlags = f
        bodyYaw = yaw
        if (_state.value == ConnectionState.CONNECTED) sendAgentUpdate()
    }

    /** Keep the camera at our avatar so the simulator streams the objects around us. */
    private fun sendAgentUpdate() {
        val p = _region.value?.position
        circuit?.send(Messages.agentUpdate(agentId, sessionId, p?.get(0) ?: 128f, p?.get(1) ?: 128f, p?.get(2) ?: 30f, controlFlags = controlFlags, bodyYaw = bodyYaw))
    }

    /** The simulator tells us where our avatar is through ordinary object updates; follow it (not while seated on something). */
    private fun followOwnAvatar() {
        val me = scene.findByFullId(agentId)?.takeIf { it.parentId == 0L } ?: return
        val p = _region.value?.position
        val x = me.position.x; val y = me.position.y; val z = me.position.z
        if (p != null && kotlin.math.abs(p[0] - x) < 0.01f && kotlin.math.abs(p[1] - y) < 0.01f && kotlin.math.abs(p[2] - z) < 0.01f) return
        _region.update { it?.copy(position = floatArrayOf(x, y, z)) }
    }

    private suspend fun agentUpdateLoop() {
        while (currentCoroutineContext().isActive) {
            followOwnAvatar()
            sendAgentUpdate()
            delay(if (controlFlags != 0L) 100 else 1_000)
        }
    }

    private suspend fun watchdog() {
        while (currentCoroutineContext().isActive) {
            delay(watchdogIntervalMs)
            val c = circuit ?: continue
            if (_state.value == ConnectionState.CONNECTED && clock() - c.lastReceivedAt > silenceTimeoutMs) {
                _notices.tryEmit(ViewerNotice.Disconnected("The simulator stopped responding"))
                teardown()
                return
            }
        }
    }

    private fun requireConnected() = check(_state.value == ConnectionState.CONNECTED) { "Not connected to Second Life" }
    private fun nextId() = ids.getAndIncrement()
    private fun system(text: String) = addChat(ChatEntry(nextId(), ChatKind.SYSTEM, null, "System", text, 1, null, false, clock()))
    private fun addChat(e: ChatEntry) { _chat.update { (it + e).takeLast(1000) } }
}
