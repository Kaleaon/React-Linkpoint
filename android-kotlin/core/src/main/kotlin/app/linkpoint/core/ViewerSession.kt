package app.linkpoint.core

import app.linkpoint.core.login.LoginResult
import app.linkpoint.core.model.*
import app.linkpoint.core.net.*
import java.net.InetSocketAddress
import java.util.UUID
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.*

/**
 * A live Second Life session: one UDP circuit, the capability event queue, and the state the UI
 * shows. The UI observes the StateFlows and calls the suspend/plain functions; it never touches
 * packets.
 *
 * Not yet exercised against a live grid (see android-kotlin/README.md): behaviour is covered by
 * unit tests and a loopback fake simulator.
 */
class ViewerSession(
    private val http: Http,
    private val scope: CoroutineScope,
    private val circuitFactory: (CoroutineScope, String, Int) -> Circuit = { s, h, p -> Circuit.to(s, h, p) },
    private val clock: () -> Long = System::currentTimeMillis,
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
    private val _capabilities = MutableStateFlow<Map<String, String>>(emptyMap())
    val capabilities: StateFlow<Map<String, String>> = _capabilities

    private var login: LoginResult? = null
    private lateinit var agentId: UUID
    private lateinit var sessionId: UUID
    private var circuit: Circuit? = null
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
        try {
            login = result
            agentId = UUID.fromString(result.agentId)
            sessionId = UUID.fromString(result.sessionId)
            names[agentId] = result.fullName
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

    /** Open a circuit to a simulator and complete the handshake. Used at login, teleport and region crossing. */
    private suspend fun enterSimulator(ip: String, port: Int, seedCapability: String) {
        val code = login!!.circuitCode
        val fresh = circuitFactory(scope, ip, port)
        val done = CompletableDeferred<Unit>()
        val previous = circuit
        val previousJobs = circuitJobs
        movementDone = done
        circuitJobs = mutableListOf()
        circuit = fresh
        fresh.start()
        circuitJobs += scope.launch { fresh.messages.collect { onMessage(it) } }
        circuitJobs += scope.launch { fresh.lost.collect { if (it == Msg.UseCircuitCode) _notices.tryEmit(ViewerNotice.Error("The simulator did not answer the circuit request")) } }
        fresh.send(Messages.useCircuitCode(code, sessionId, agentId))
        fresh.send(Messages.completeAgentMovement(agentId, sessionId, code))
        try {
            withTimeout(30_000) { done.await() }
        } catch (e: TimeoutCancellationException) {
            fresh.close(); circuitJobs.forEach { it.cancel() }
            circuit = previous; circuitJobs = previousJobs
            throw java.io.IOException("The simulator did not complete the handshake in 30 seconds")
        }
        previous?.close()
        previousJobs.forEach { it.cancel() }
        _nearby.value = emptyList()
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
                try { enterSimulator(ip, port, seed) } catch (ex: Exception) {
                    _notices.tryEmit(ViewerNotice.Error("Teleport failed: ${ex.message}"))
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

    private fun onMessage(rx: Received) {
        _raw.tryEmit(rx)
        when (val m = Messages.parse(rx.id, rx.body)) {
            is Incoming.ChatFromSimulator -> if (m.message.isNotBlank()) addChat(
                ChatEntry(nextId(), if (m.sourceType == 2) ChatKind.OBJECT_IM else ChatKind.LOCAL, m.sourceId, m.fromName, m.message, m.chatType, null, false, clock()),
            )
            is Incoming.InstantMessage -> onInstantMessage(m)
            is Incoming.RegionHandshake -> {
                circuit?.send(Messages.regionHandshakeReply(agentId, sessionId))
                circuit?.send(Messages.agentThrottle(agentId, sessionId, login!!.circuitCode))
                _region.update { RegionInfo(m.regionName, m.simAccess, it?.handle ?: 0, it?.position) }
            }
            is Incoming.AgentMovementComplete -> {
                _region.update { RegionInfo(it?.name, it?.access, m.regionHandle, m.position) }
                movementDone?.complete(Unit)
                circuit?.send(Messages.agentUpdate(agentId, sessionId))
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
            is Incoming.TeleportStart -> _notices.tryEmit(ViewerNotice.Teleport("Teleport started"))
            is Incoming.TeleportProgress -> _notices.tryEmit(ViewerNotice.Teleport(m.message.ifBlank { "Teleporting…" }))
            is Incoming.TeleportFailed -> _notices.tryEmit(ViewerNotice.Error("Teleport failed: ${m.reason}"))
            is Incoming.TeleportLocal -> _notices.tryEmit(ViewerNotice.Teleport("Teleported within the region"))
            is Incoming.MapBlocks -> mapReply?.complete(m.blocks)
            is Incoming.KickUser -> {
                _notices.tryEmit(ViewerNotice.Disconnected(m.reason.ifBlank { "You were disconnected by the simulator" }))
                scope.launch { teardown() }
            }
            Incoming.LogoutReply -> logoutDone?.complete(Unit)
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
            22 -> system("${m.fromName} offered you a teleport: $text")
            38, 41 -> system("${m.fromName} sent a friendship offer: $text")
            else -> Unit // typing indicators, group sessions and other dialogs are not shown
        }
    }

    private fun applyCoarse(c: Incoming.CoarseLocations) {
        val me = c.locations.getOrNull(c.youIndex)
        val missing = ArrayList<UUID>()
        val out = ArrayList<NearbyAvatar>()
        // The AgentData list skips "you", so list index i corresponds to location index i, except that
        // our own slot is absent from the id list.
        var idIx = 0
        for ((i, loc) in c.locations.withIndex()) {
            if (i == c.youIndex) continue
            val id = c.ids.getOrNull(idIx++) ?: break
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

    fun refreshBalance() { requireConnected(); circuit!!.send(Messages.moneyBalanceRequest(agentId, sessionId)) }

    /** Teleport to a region by name. Looks the region up on the grid map first; throws if it is unknown. */
    suspend fun teleport(regionName: String, x: Float = 128f, y: Float = 128f, z: Float = 30f) {
        requireConnected()
        val wait = CompletableDeferred<List<MapBlockInfo>>().also { mapReply = it }
        circuit!!.send(Messages.mapNameRequest(agentId, sessionId, regionName.trim()))
        val blocks = withTimeoutOrNull(15_000) { wait.await() } ?: throw java.io.IOException("The grid did not answer the region lookup")
        val block = blocks.firstOrNull { it.name.equals(regionName.trim(), true) } ?: throw IllegalArgumentException("No region named \"$regionName\"")
        val handle = ((block.x * 256L) shl 32) or (block.y * 256L)
        circuit!!.send(Messages.teleportLocationRequest(agentId, sessionId, handle, x, y, z))
    }

    fun teleportHome() { requireConnected(); circuit!!.send(Messages.teleportHome(agentId, sessionId)) }

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
        _nearby.value = emptyList()
        _state.value = ConnectionState.DISCONNECTED
    }

    private suspend fun agentUpdateLoop() {
        while (currentCoroutineContext().isActive) {
            circuit?.send(Messages.agentUpdate(agentId, sessionId))
            delay(1_000)
        }
    }

    private suspend fun watchdog() {
        while (currentCoroutineContext().isActive) {
            delay(5_000)
            val c = circuit ?: continue
            if (_state.value == ConnectionState.CONNECTED && clock() - c.lastReceivedAt > 60_000) {
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
