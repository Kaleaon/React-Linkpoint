package app.linkpoint.core.mock

import app.linkpoint.core.llsd.Llsd
import app.linkpoint.core.net.*
import app.linkpoint.core.scene.*
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetSocketAddress
import java.util.UUID
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * A small fake Second Life grid for tests and demos: an XML-RPC login service, a seed capability
 * with an event queue and texture/mesh services, and a UDP simulator that streams a populated
 * region (terrain, prims, a mesh, a sculpt, textures, particles, avatars, one moving object).
 *
 * Everything the simulator sends is built with the encoders in this package, so the viewer's real
 * decoders are exercised end to end.
 */
class MockGrid(
    private val httpPort: Int = 0,
    private val simPort: Int = 0,
    /** The address the client should use to reach this machine (10.0.2.2 from an Android emulator). */
    private val advertisedHost: String = "127.0.0.1",
    private val bindAddress: String = "0.0.0.0",
) : AutoCloseable {
    val agent: UUID = UUID.fromString("11111111-2222-3333-4444-555555555555")
    val session: UUID = UUID.fromString("66666666-7777-8888-9999-000000000000")
    val circuitCode = 424242
    val regionName = "Mock Isle"

    private lateinit var http: HttpServer
    private lateinit var udp: DatagramSocket
    val loginUrl: String get() = "http://$advertisedHost:${http.address.port}/login"
    val udpPort: Int get() = udp.localPort

    @Volatile private var running = true
    private var client: java.net.SocketAddress? = null
    private var seq = 0
    val chatReceived = java.util.concurrent.CopyOnWriteArrayList<String>()
    val packetsReceived = java.util.concurrent.CopyOnWriteArrayList<Int>()
    val lureAccepted = java.util.concurrent.CopyOnWriteArrayList<UUID>()
    val friendshipAccepted = java.util.concurrent.CopyOnWriteArrayList<UUID>()
    val friendshipDeclined = java.util.concurrent.CopyOnWriteArrayList<UUID>()
    val textureRequests = java.util.concurrent.CopyOnWriteArrayList<String>()
    val meshRequests = java.util.concurrent.CopyOnWriteArrayList<String>()

    companion object {
        val TEX_CHECKER = UUID.fromString("c0c0c0c0-0000-4000-8000-000000000001")
        val TEX_PLASMA = UUID.fromString("c0c0c0c0-0000-4000-8000-000000000002")
        val TEX_SCULPT = UUID.fromString("c0c0c0c0-0000-4000-8000-000000000003")
        val TERRAIN_DETAIL = listOf(4, 5, 6, 7).map { UUID.fromString("c0c0c0c0-0000-4000-8000-00000000000$it") }
        val MESH_PYRAMID = UUID.fromString("d0d0d0d0-0000-4000-8000-000000000001")
        const val WATER = 20f
        val INV_ROOT: UUID = UUID.fromString("e0e0e0e0-0000-4000-8000-000000000000")
        val INV_TEXTURES: UUID = UUID.fromString("e0e0e0e0-0000-4000-8000-000000000001")
        val INV_OBJECTS: UUID = UUID.fromString("e0e0e0e0-0000-4000-8000-000000000002")
        val INV_NOTES: UUID = UUID.fromString("e0e0e0e0-0000-4000-8000-000000000003")
        val INV_CARDS: UUID = UUID.fromString("e0e0e0e0-0000-4000-8000-000000000004")
        val LURE_ID: UUID = UUID.fromString("f0f0f0f0-0000-4000-8000-000000000001")
        val FRIEND_OFFER_ID: UUID = UUID.fromString("f0f0f0f0-0000-4000-8000-000000000002")
        val GROUP_ID: UUID = UUID.fromString("a0a0a0a0-0000-4000-8000-000000000001")

        /** The mock region's ground height at a region position. */
        fun height(x: Float, y: Float): Float = 26f + 6f * sin(x / 37f) * cos(y / 29f) + 4f * sin((x + y) / 53f)

        fun resource(name: String): ByteArray =
            MockGrid::class.java.getResourceAsStream("/mock/$name")?.use { it.readBytes() } ?: error("missing fixture $name")

        private val TEXTURE_FILES = mapOf(
            TEX_CHECKER to "checker.j2k", TEX_PLASMA to "tex_plasma.j2k", TEX_SCULPT to "sculpt_sphere.j2k",
            TERRAIN_DETAIL[0] to "dirt.j2k", TERRAIN_DETAIL[1] to "grass.j2k", TERRAIN_DETAIL[2] to "mount.j2k", TERRAIN_DETAIL[3] to "rock.j2k",
        )
    }

    fun start(): MockGrid {
        http = HttpServer.create(InetSocketAddress(java.net.InetAddress.getByName(bindAddress), httpPort), 0)
        http.executor = java.util.concurrent.Executors.newCachedThreadPool()
        http.createContext("/login") { ex -> reply(ex, 200, "text/xml", loginResponse().toByteArray()) }
        http.createContext("/seed") { ex ->
            val base = "http://$advertisedHost:${http.address.port}"
            val caps = mapOf("EventQueueGet" to "$base/eq", "GetTexture" to "$base/tex", "GetMesh2" to "$base/mesh", "FetchInventoryDescendents2" to "$base/inv")
            reply(ex, 200, "application/llsd+xml", Llsd.toXml(caps).toByteArray())
        }
        val eqPolls = java.util.concurrent.atomic.AtomicInteger()
        http.createContext("/eq") { ex ->
            ex.requestBody.readBytes()
            if (eqPolls.getAndIncrement() == 0) {
                // The first poll carries the events a region sends on arrival: groups and the parcel.
                val events = listOf(
                    mapOf("message" to "AgentGroupDataUpdate", "body" to mapOf(
                        "GroupData" to listOf(
                            mapOf("GroupID" to GROUP_ID, "GroupName" to "Mock Builders", "AcceptNotices" to true),
                            mapOf("GroupID" to UUID(7, 7), "GroupName" to "Alpha Club", "AcceptNotices" to false),
                        ))),
                    mapOf("message" to "ParcelProperties", "body" to mapOf(
                        "ParcelData" to listOf(mapOf(
                            "LocalID" to 3, "Name" to "Mock Parcel", "Desc" to "A parcel for testing", "Area" to 4096, "OwnerID" to agent,
                            "MaxPrims" to 468, "TotalPrims" to 15, "MusicURL" to "http://music.example/stream", "MediaURL" to ""))))
                )
                reply(ex, 200, "application/llsd+xml", Llsd.toXml(mapOf("id" to 1, "events" to events)).toByteArray())
            } else {
                // Long poll: nothing to report; answer after a pause like a real event queue timing out.
                try { Thread.sleep(8000) } catch (_: InterruptedException) { }
                reply(ex, 200, "application/llsd+xml", Llsd.toXml(mapOf("id" to eqPolls.get(), "events" to emptyList<Any>())).toByteArray())
            }
        }
        http.createContext("/inv") { ex ->
            val req = Llsd.parseXml(ex.requestBody.readBytes()) as? Map<*, *>
            val asked = ((req?.get("folders") as? List<*>)?.firstOrNull() as? Map<*, *>)?.get("folder_id") as? UUID
            val children = when (asked) {
                INV_ROOT -> listOf(INV_TEXTURES to "Textures", INV_OBJECTS to "Objects", INV_NOTES to "Notecards", INV_CARDS to "Calling Cards")
                else -> emptyList()
            }
            val items = when (asked) {
                INV_TEXTURES -> listOf(Triple(UUID(100, 1), "Checker board", 0), Triple(UUID(100, 2), "Grass", 0))
                INV_NOTES -> listOf(Triple(UUID(100, 3), "Read me", 7))
                INV_OBJECTS -> listOf(Triple(UUID(100, 4), "Red box", 6))
                else -> emptyList()
            }
            val body = mapOf("folders" to listOf(mapOf(
                "folder_id" to asked, "owner_id" to agent, "version" to 1, "descendents" to children.size + items.size,
                "categories" to children.map { (id, name) -> mapOf("category_id" to id, "parent_id" to asked, "name" to name, "type_default" to -1, "version" to 1) },
                "items" to items.map { (id, name, type) -> mapOf("item_id" to id, "parent_id" to asked, "name" to name, "type" to type, "inv_type" to type, "desc" to "$name (mock)", "asset_id" to UUID(200, id.leastSignificantBits)) },
            )))
            reply(ex, 200, "application/llsd+xml", Llsd.toXml(body).toByteArray())
        }
        http.createContext("/tex") { ex ->
            val id = ex.requestURI.query?.substringAfter("texture_id=")?.substringBefore('&').orEmpty()
            textureRequests += id
            val file = runCatching { TEXTURE_FILES[UUID.fromString(id)] }.getOrNull()
            if (file == null) reply(ex, 404, "text/plain", ByteArray(0)) else reply(ex, 200, "image/x-j2c", resource(file))
        }
        http.createContext("/mesh") { ex ->
            val id = ex.requestURI.query?.substringAfter("mesh_id=")?.substringBefore('&').orEmpty()
            meshRequests += id
            if (id == MESH_PYRAMID.toString()) reply(ex, 200, "application/vnd.ll.mesh", Wire.pyramidMesh()) else reply(ex, 404, "text/plain", ByteArray(0))
        }
        http.start()

        udp = DatagramSocket(simPort, java.net.InetAddress.getByName(bindAddress)).apply { soTimeout = 200 }
        Thread(::udpLoop, "mockgrid-udp").apply { isDaemon = true; start() }
        return this
    }

    private fun reply(ex: HttpExchange, status: Int, type: String, body: ByteArray) {
        try {
            ex.responseHeaders.add("Content-Type", type)
            ex.sendResponseHeaders(status, if (body.isEmpty()) -1 else body.size.toLong())
            if (body.isNotEmpty()) ex.responseBody.use { it.write(body) }
            ex.close()
        } catch (_: java.io.IOException) { /* client went away */ }
    }

    private fun loginResponse(): String = """<?xml version="1.0"?><methodResponse><params><param><value><struct>
        <member><name>login</name><value><string>true</string></value></member>
        <member><name>agent_id</name><value><string>$agent</string></value></member>
        <member><name>session_id</name><value><string>$session</string></value></member>
        <member><name>secure_session_id</name><value><string>${UUID.randomUUID()}</string></value></member>
        <member><name>circuit_code</name><value><i4>$circuitCode</i4></value></member>
        <member><name>sim_ip</name><value><string>$advertisedHost</string></value></member>
        <member><name>sim_port</name><value><i4>${udp.localPort}</i4></value></member>
        <member><name>seed_capability</name><value><string>http://$advertisedHost:${http.address.port}/seed</string></value></member>
        <member><name>first_name</name><value><string>"Mock"</string></value></member>
        <member><name>last_name</name><value><string>Resident</string></value></member>
        <member><name>region_x</name><value><i4>256000</i4></value></member>
        <member><name>region_y</name><value><i4>256256</i4></value></member>
        <member><name>message</name><value><string>Welcome to the mock grid</string></value></member>
        <member><name>inventory-root</name><value><array><data><value><struct>
          <member><name>folder_id</name><value><string>$INV_ROOT</string></value></member></struct></value></data></array></value></member>
        <member><name>inventory-skeleton</name><value><array><data>
          ${folderXml(INV_ROOT, UUID(0, 0), "My Inventory", 8)}
          ${folderXml(INV_TEXTURES, INV_ROOT, "Textures", 0)}
          ${folderXml(INV_OBJECTS, INV_ROOT, "Objects", 6)}
          ${folderXml(INV_NOTES, INV_ROOT, "Notecards", 7)}
          ${folderXml(INV_CARDS, INV_ROOT, "Calling Cards", 2)}
        </data></array></value></member>
        <member><name>buddy-list</name><value><array><data><value><struct>
          <member><name>buddy_id</name><value><string>$FRIEND</string></value></member>
          <member><name>buddy_rights_given</name><value><i4>1</i4></value></member>
          <member><name>buddy_rights_has</name><value><i4>1</i4></value></member>
        </struct></value></data></array></value></member>
        </struct></value></param></params></methodResponse>"""

    private fun folderXml(id: UUID, parent: UUID, name: String, type: Int) = "<value><struct>" +
        "<member><name>folder_id</name><value><string>$id</string></value></member>" +
        "<member><name>parent_id</name><value><string>$parent</string></value></member>" +
        "<member><name>name</name><value><string>$name</string></value></member>" +
        "<member><name>type_default</name><value><i4>$type</i4></value></member>" +
        "<member><name>version</name><value><i4>1</i4></value></member></struct></value>"

    private val FRIEND = UUID.fromString("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
    private val OTHER_AVATAR = UUID.fromString("99999999-8888-7777-6666-555555555555")

    // ---- UDP simulator ------------------------------------------------------------------------------

    private fun send(m: Outgoing) {
        val c = client ?: return
        val b = PacketCodec.encode(++seq, if (m.reliable) PacketFlags.RELIABLE else 0, m.id, m.body)
        try { udp.send(DatagramPacket(b, b.size, c)) } catch (_: java.io.IOException) { }
    }

    private fun send(id: Int, body: ByteArray) = send(Outgoing(id, body, false))

    private fun udpLoop() {
        val buf = ByteArray(2048)
        var orbit = 0f
        var lastOrbit = 0L
        var scenario: Thread? = null
        while (running) {
            val dp = DatagramPacket(buf, buf.size)
            try {
                udp.receive(dp)
                client = dp.socketAddress
                val p = PacketCodec.decode(buf, dp.length)
                packetsReceived += p.messageId
                if (p.reliable) send(Messages.packetAck(listOf(p.sequence)))
                when (p.messageId) {
                    Msg.CompleteAgentMovement -> if (scenario == null) scenario = Thread({ runScenario() }, "mockgrid-scenario").apply { isDaemon = true; start() }
                    Msg.ChatFromViewer -> {
                        val r = WireReader(p.body); r.uuid(); r.uuid(); val text = r.str2(); chatReceived += text
                        if (text == "give offers") {
                            fun im(dialog: Int, id: UUID, text: String) = send(Msg.ImprovedInstantMessage, WireWriter().uuid(OTHER_AVATAR).uuid(UUID(0, 0))
                                .bool(false).uuid(agent).u32(0).uuid(UUID(0, 0)).vec3(0f, 0f, 0f).u8(0).u8(dialog).uuid(id).u32(0).str1("Visiting Avatar").str2(text).bin2(ByteArray(0)).u32(0).toByteArray())
                            im(22, LURE_ID, "Join me at the beach"); im(38, FRIEND_OFFER_ID, "Be my friend?")
                        }
                        send(Msg.ChatFromSimulator, WireWriter().str1("Mock Bot").uuid(UUID(1, 1)).uuid(UUID(1, 1)).u8(1).u8(1).u8(1).vec3(0f, 0f, 0f).str2("you said: $text").toByteArray())
                    }
                    Msg.UUIDNameRequest -> {
                        val r = WireReader(p.body); val n = r.u8(); val ids = List(n) { r.uuid() }
                        val w = WireWriter().u8(n)
                        for (id in ids) when (id) {
                            FRIEND -> w.uuid(id).str1("Friendly").str1("Pal")
                            OTHER_AVATAR -> w.uuid(id).str1("Visiting").str1("Avatar")
                            else -> w.uuid(id).str1("Unknown").str1("Resident")
                        }
                        send(Msg.UUIDNameReply, w.toByteArray())
                    }
                    Msg.AvatarPropertiesRequest -> {
                        val r = WireReader(p.body); r.uuid(); r.uuid(); val who = r.uuid()
                        send(Msg.AvatarPropertiesReply, WireWriter().uuid(agent).uuid(who).uuid(UUID(9, 9)).uuid(UUID(0, 0)).uuid(UUID(0, 0))
                            .str2("About ${if (who == FRIEND) "Friendly Pal" else "this resident"}: I build mock regions.").str1("").str1("2009-03-04").str1("https://profiles.example/$who").bin1(byteArrayOf(0)).u32(0).toByteArray())
                    }
                    Msg.TeleportLureRequest -> { val r = WireReader(p.body); r.uuid(); r.uuid(); lureAccepted += r.uuid() }
                    Msg.AcceptFriendship -> { val r = WireReader(p.body); r.uuid(); r.uuid(); friendshipAccepted += r.uuid() }
                    Msg.DeclineFriendship -> { val r = WireReader(p.body); r.uuid(); r.uuid(); friendshipDeclined += r.uuid() }
                    Msg.MoneyBalanceRequest -> send(Msg.MoneyBalanceReply, WireWriter().uuid(agent).uuid(UUID(0, 0)).bool(true).s32(1234).s32(0).s32(0).str1("").s32(0).uuid(UUID(0, 0)).bool(false).uuid(UUID(0, 0)).bool(false).s32(0).str1("").toByteArray())
                    Msg.LogoutRequest -> send(Msg.LogoutReply, WireWriter().uuid(agent).uuid(session).u8(1).uuid(UUID(0, 0)).toByteArray())
                }
            } catch (_: java.net.SocketTimeoutException) {
            } catch (_: java.io.IOException) { if (!running) return }
            // Move the orbiting object about ten times a second once the scenario has been sent.
            val now = System.currentTimeMillis()
            if (scenarioDone && now - lastOrbit > 100) {
                lastOrbit = now; orbit += 0.12f
                val x = 128f + 8f * cos(orbit); val y = 128f + 8f * sin(orbit)
                send(Msg.ImprovedTerseObjectUpdate, ObjectPackets.terse(ORBITER, Vec3(x, y, height(x, y) + 2.5f)))
            }
        }
    }

    @Volatile private var scenarioDone = false
    private val ORBITER = 20L

    private fun runScenario() {
        val gz = height(128f, 128f)
        send(Msg.AgentMovementComplete, WireWriter().uuid(agent).uuid(session).vec3(122f, 122f, height(122f, 122f) + 1f).vec3(1f, 0f, 0f).u64((1000L * 256 shl 32) or (1001L * 256)).u32(0).u16(0).toByteArray())
        val w = WireWriter().u32(0).u8(13).str1(regionName).uuid(UUID(2, 2)).bool(false).f32(WATER).f32(1f).uuid(UUID(3, 3))
        repeat(4) { w.uuid(UUID(0, 0)) }
        TERRAIN_DETAIL.forEach { w.uuid(it) }
        listOf(16f, 16f, 18f, 18f).forEach { w.f32(it) }
        listOf(24f, 24f, 24f, 24f).forEach { w.f32(it) }
        send(Msg.RegionHandshake, w.toByteArray())
        send(Msg.OnlineNotification, WireWriter().u8(1).uuid(FRIEND).toByteArray())
        sleep(30)

        // Terrain: every patch, three to a packet.
        val patches = ArrayList<Triple<Int, Int, FloatArray>>()
        for (py in 0 until 16) for (px in 0 until 16) patches += Triple(px, py, FloatArray(256) { i -> height((px * 16 + i % 16).toFloat(), (py * 16 + i / 16).toFloat()) })
        for (chunk in patches.chunked(3)) {
            send(Msg.LayerData, WireWriter().u8(TerrainDecoder0.LAND).bin2(TerrainEncoder.layer(chunk)).toByteArray())
            sleep(2)
        }

        // Objects.
        val white = FaceSpec()
        fun at(x: Float, y: Float, lift: Float) = Vec3(x, y, height(x, y) + lift)
        val faceColors = (0 until 6).associateWith { FaceSpec(color = listOf(floatArrayOf(0.9f, 0.2f, 0.2f, 1f), floatArrayOf(0.2f, 0.8f, 0.3f, 1f), floatArrayOf(0.2f, 0.4f, 0.9f, 1f), floatArrayOf(0.95f, 0.85f, 0.2f, 1f), floatArrayOf(0.8f, 0.3f, 0.8f, 1f), floatArrayOf(0.2f, 0.85f, 0.85f, 1f))[it]) }
        val specs = listOf(
            ObjectSpec(1, position = at(134f, 126f, 1f), scale = Vec3(2f, 2f, 2f), textureEntry = Wire.textureEntry(white, faceColors)),
            ObjectSpec(2, position = at(134f, 132f, 1.5f), scale = Vec3(2f, 2f, 3f), params = PrimParams(profileCurve = 0), textureEntry = Wire.textureEntry(FaceSpec(TEX_CHECKER, repeatU = 2f, repeatV = 2f))),
            ObjectSpec(3, position = at(128f, 136f, 1.5f), scale = Vec3(3f, 3f, 3f), params = PrimParams(pathCurve = 0x20, profileCurve = 5), textureEntry = Wire.textureEntry(FaceSpec(color = floatArrayOf(0.3f, 0.8f, 0.4f, 1f)))),
            ObjectSpec(4, position = at(122f, 134f, 1.5f), scale = Vec3(3f, 3f, 1f), params = PrimParams(pathCurve = 0x20, profileCurve = 0, pathScaleX = 1f, pathScaleY = 0.25f), textureEntry = Wire.textureEntry(FaceSpec(color = floatArrayOf(0.3f, 0.45f, 0.95f, 1f)))),
            ObjectSpec(5, position = at(120f, 126f, 2f), scale = Vec3(2f, 2f, 4f), params = PrimParams(profileCurve = 1, profileHollow = 0.5f, twist = 0.5f), textureEntry = Wire.textureEntry(FaceSpec(TEX_PLASMA))),
            ObjectSpec(6, position = at(126f, 120f, 1.5f), scale = Vec3(3f, 3f, 3f), sculpt = MESH_PYRAMID to 5, textureEntry = Wire.textureEntry(FaceSpec(color = floatArrayOf(0.9f, 0.5f, 0.2f, 1f)))),
            ObjectSpec(7, position = at(134f, 120f, 1.5f), scale = Vec3(3f, 3f, 3f), sculpt = TEX_SCULPT to 1, textureEntry = Wire.textureEntry(FaceSpec(TEX_PLASMA))),
            ObjectSpec(8, position = at(128f, 128f, 0.2f), scale = Vec3(0.3f, 0.3f, 0.3f), particles = Wire.particleBlock(), textureEntry = Wire.textureEntry(white)),
            ObjectSpec(9, position = at(114f, 130f, 1f), scale = Vec3(2f, 2f, 2f), textureEntry = Wire.textureEntry(FaceSpec(color = floatArrayOf(0.6f, 0.6f, 0.65f, 1f)))),
            ObjectSpec(10, parent = 9, position = Vec3(0f, 0f, 1.6f), scale = Vec3(1f, 1f, 1f), params = PrimParams(profileCurve = 2), textureEntry = Wire.textureEntry(FaceSpec(color = floatArrayOf(0.9f, 0.3f, 0.3f, 0.6f)))),
            ObjectSpec(11, position = at(128f, 128f, 0.05f), scale = Vec3(40f, 40f, 0.1f), textureEntry = Wire.textureEntry(FaceSpec(color = floatArrayOf(0.45f, 0.5f, 0.45f, 1f), fullbright = false))),
            ObjectSpec(ORBITER, position = at(136f, 128f, 2.5f), scale = Vec3(1f, 1f, 1f), params = PrimParams(pathCurve = 0x20, profileCurve = 5), textureEntry = Wire.textureEntry(FaceSpec(color = floatArrayOf(1f, 0.9f, 0.2f, 1f), glow = 0.3f, fullbright = true))),
            ObjectSpec(30, position = at(128f, 140f, 3f), scale = Vec3(2f, 2f, 2f), text = "Mock sign", textureEntry = Wire.textureEntry(FaceSpec(color = floatArrayOf(0.95f, 0.95f, 0.95f, 1f)))),
            ObjectSpec(40, fullId = agent, pcode = PCode.AVATAR, position = at(122f, 122f, 1f), rotation = Quat.aroundZ(0.6f), scale = Vec3(0.45f, 0.6f, 1.9f)),
            ObjectSpec(41, fullId = OTHER_AVATAR, pcode = PCode.AVATAR, position = at(130f, 118f, 1f), scale = Vec3(0.45f, 0.6f, 1.9f)),
        )
        for ((i, s) in specs.withIndex()) {
            if (s.localId in setOf(8L, 9L, 10L)) send(Msg.ObjectUpdateCompressed, ObjectPackets.compressed(s)) else send(Msg.ObjectUpdate, ObjectPackets.full(s))
            sleep(3)
            if (i == 5) {
                // Announce one object by id only, as a simulator does for objects the viewer may have cached.
                send(Msg.ObjectUpdateCached, WireWriter().u64(0).u16(0).u8(1).u32(9999).u32(0).u32(0).toByteArray())
            }
        }
        // Nearby avatars as the simulator's coarse locations; ids exclude "you", and our own slot is index 0.
        send(Msg.CoarseLocationUpdate, WireWriter().u8(2).u8(122).u8(122).u8(7).u8(130).u8(118).u8(7).u16(0).u16(-1 and 0xFFFF).u8(1).uuid(OTHER_AVATAR).toByteArray())
        send(Msg.ChatFromSimulator, WireWriter().str1("Mock Bot").uuid(UUID(1, 1)).uuid(UUID(1, 1)).u8(1).u8(1).u8(1).vec3(0f, 0f, 0f).str2("Welcome to $regionName (ground $gz m)").toByteArray())
        scenarioDone = true
    }

    private fun sleep(ms: Long) { try { Thread.sleep(ms) } catch (_: InterruptedException) { } }

    override fun close() {
        running = false
        runCatching { udp.close() }
        runCatching { http.stop(0) }
    }
}

private object TerrainDecoder0 { const val LAND = 0x4C }
