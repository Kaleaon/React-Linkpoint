package app.linkpoint.core

import app.linkpoint.core.llsd.Llsd
import app.linkpoint.core.login.LoginResult
import app.linkpoint.core.model.*
import app.linkpoint.core.net.*
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import org.junit.Assert.*
import org.junit.Test

/** What the session does when the network misbehaves: silent simulators, kicks, broken capabilities. */
class SessionRobustnessTest {
    private val loopback = byteArrayOf(127, 0, 0, 1)
    private val noHttp = FakeHttp { _, _ -> HttpResponse(404, ByteArray(0)) }

    private fun login(port: Int, agent: UUID, seed: String = "") = LoginResult(
        agentId = agent.toString(), sessionId = UUID.randomUUID().toString(), secureSessionId = "", circuitCode = 99,
        simIp = "127.0.0.1", simPort = port, seedCapability = seed, firstName = "Test", lastName = "Resident",
        regionX = 256000, regionY = 256256, message = "", buddies = emptyList(), inventoryRootId = null, mfaHash = null, raw = emptyMap(),
    )

    private suspend fun <T> eventually(timeoutMs: Long = 8000, f: () -> T?): T {
        val end = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < end) { f()?.let { return it }; delay(25) }
        throw AssertionError("condition not met in ${timeoutMs}ms")
    }

    private fun scope() = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private fun collectNotices(s: ViewerSession, scope: CoroutineScope): MutableList<ViewerNotice> {
        val list = java.util.concurrent.CopyOnWriteArrayList<ViewerNotice>()
        scope.launch(start = CoroutineStart.UNDISPATCHED) { s.notices.collect { list += it } }
        return list
    }

    // ---- handshakes that never finish -------------------------------------------------------

    @Test fun teleportToASilentSimulatorFailsCleanlyAndKeepsTheOldCircuit() = runBlocking {
        FakeSim("Testville").use { origin ->
            val silent = DatagramSocket(0, InetAddress.getByName("127.0.0.1"))
            val sc = scope()
            val events = java.util.concurrent.ConcurrentLinkedQueue<Map<String, Any?>>()
            val http = FakeHttp { url, _ ->
                when {
                    url.endsWith("/seed") -> HttpResponse(200, Llsd.toXml(mapOf("EventQueueGet" to "http://caps.test/eq")).toByteArray())
                    url.endsWith("/eq") -> events.poll()?.let { HttpResponse(200, Llsd.toXml(mapOf("id" to 1, "events" to listOf(it))).toByteArray()) }
                        ?: run { Thread.sleep(30); HttpResponse(499, ByteArray(0)) }
                    else -> HttpResponse(404, ByteArray(0))
                }
            }
            val s = ViewerSession(http, sc, handshakeTimeoutMs = 600)
            val notices = collectNotices(s, sc)
            s.connect(login(origin.socket.localPort, origin.agent, "http://caps.test/seed"))
            eventually { s.region.value?.takeIf { it.name == "Testville" } }
            val original = s.currentCircuit

            events.add(mapOf("message" to "TeleportFinish", "body" to mapOf("Info" to listOf(mapOf("SimIP" to loopback, "SimPort" to silent.localPort, "SeedCapability" to "")))))
            val err = eventually { notices.filterIsInstance<ViewerNotice.Error>().firstOrNull() }
            assertTrue(err.text, err.text.startsWith("Teleport failed:") && err.text.contains("handshake"))

            assertEquals(ConnectionState.CONNECTED, s.state.value)
            assertSame("the old circuit is restored", original, s.currentCircuit)
            assertEquals("Testville", s.region.value?.name)
            // The silent socket did receive our attempt (so we really tried), and the old simulator still hears us.
            silent.soTimeout = 2000
            val got = DatagramPacket(ByteArray(2048), 2048); silent.receive(got)
            assertEquals(Msg.UseCircuitCode, PacketCodec.decode(got.data, got.length).messageId)
            s.sendChat("still here")
            eventually { origin.chatSeen.firstOrNull { it == "still here" } }
            s.logout(); silent.close(); sc.cancel()
        }
    }

    @Test fun connectFailsWhenTheSimulatorNeverAnswersAndCanBeRetried() = runBlocking {
        val silent = DatagramSocket(0, InetAddress.getByName("127.0.0.1"))
        val sc = scope()
        val s = ViewerSession(noHttp, sc, handshakeTimeoutMs = 400)
        assertThrows(java.io.IOException::class.java) { runBlocking { s.connect(login(silent.localPort, UUID.randomUUID())) } }
        assertEquals(ConnectionState.DISCONNECTED, s.state.value)
        assertNull(s.currentCircuit)

        FakeSim().use { sim ->
            val agentLogin = login(sim.socket.localPort, sim.agent)
            s.connect(agentLogin)
            assertEquals(ConnectionState.CONNECTED, s.state.value)
            s.logout()
        }
        silent.close(); sc.cancel()
    }

    @Test fun connectingTwiceIsRejected() = runBlocking {
        FakeSim().use { sim ->
            val sc = scope()
            val s = ViewerSession(noHttp, sc)
            s.connect(login(sim.socket.localPort, sim.agent))
            assertThrows(IllegalStateException::class.java) { runBlocking { s.connect(login(sim.socket.localPort, sim.agent)) } }
            assertEquals(ConnectionState.CONNECTED, s.state.value)
            s.logout(); sc.cancel()
        }
    }

    // ---- the simulator goes away -------------------------------------------------------------

    @Test fun kickUserDisconnectsWithTheReason() = runBlocking {
        FakeSim().use { sim ->
            val sc = scope()
            val s = ViewerSession(noHttp, sc)
            val notices = collectNotices(s, sc)
            s.connect(login(sim.socket.localPort, sim.agent))
            sim.inject(Outgoing(Msg.KickUser, WireWriter().bytes(ByteArray(6)).uuid(sim.agent).uuid(UUID.randomUUID()).str2("Logged in elsewhere").toByteArray(), true))
            val d = eventually { notices.filterIsInstance<ViewerNotice.Disconnected>().firstOrNull() }
            assertEquals("Logged in elsewhere", d.reason)
            eventually { s.state.value.takeIf { it == ConnectionState.DISCONNECTED } }
            assertNull(s.currentCircuit)
            sc.cancel()
        }
    }

    @Test fun watchdogDisconnectsWhenTheSimulatorGoesSilent() = runBlocking {
        val sim = FakeSim()
        val sc = scope()
        val s = ViewerSession(noHttp, sc, silenceTimeoutMs = 500, watchdogIntervalMs = 100)
        val notices = collectNotices(s, sc)
        s.connect(login(sim.socket.localPort, sim.agent))
        sim.close() // the simulator vanishes without a goodbye
        val d = eventually { notices.filterIsInstance<ViewerNotice.Disconnected>().firstOrNull() }
        assertTrue(d.reason, d.reason.contains("stopped responding"))
        assertEquals(ConnectionState.DISCONNECTED, s.state.value)
        sc.cancel()
    }

    @Test fun logoutWhileDisconnectedDoesNothing() = runBlocking {
        val s = ViewerSession(noHttp, scope())
        s.logout()
        assertEquals(ConnectionState.DISCONNECTED, s.state.value)
    }

    // ---- capabilities ------------------------------------------------------------------------

    @Test fun aBrokenSeedCapabilityIsReportedButChatKeepsWorking() = runBlocking {
        FakeSim().use { sim ->
            val sc = scope()
            val s = ViewerSession(FakeHttp { _, _ -> HttpResponse(500, ByteArray(0)) }, sc)
            val notices = collectNotices(s, sc)
            s.connect(login(sim.socket.localPort, sim.agent, "http://caps.test/seed"))
            val err = eventually { notices.filterIsInstance<ViewerNotice.Error>().firstOrNull() }
            assertTrue(err.text, err.text.contains("capabilities"))
            assertEquals(ConnectionState.CONNECTED, s.state.value)
            s.sendChat("ping"); eventually { sim.chatSeen.firstOrNull { it == "ping" } }
            s.logout(); sc.cancel()
        }
    }

    @Test fun aGoneEventQueueIsReported() = runBlocking {
        FakeSim().use { sim ->
            val sc = scope()
            val http = FakeHttp { url, _ ->
                if (url.endsWith("/seed")) HttpResponse(200, Llsd.toXml(mapOf("EventQueueGet" to "http://caps.test/eq")).toByteArray()) else HttpResponse(404, ByteArray(0))
            }
            val s = ViewerSession(http, sc)
            val notices = collectNotices(s, sc)
            s.connect(login(sim.socket.localPort, sim.agent, "http://caps.test/seed"))
            val err = eventually { notices.filterIsInstance<ViewerNotice.Error>().firstOrNull() }
            assertTrue(err.text, err.text.contains("event queue is gone"))
            s.logout(); sc.cancel()
        }
    }

    @Test fun eventQueueEchoesTheLastEventIdAsAck() = runBlocking {
        val bodies = java.util.concurrent.CopyOnWriteArrayList<String>()
        val sc = scope()
        val calls = java.util.concurrent.atomic.AtomicInteger()
        val http = FakeHttp { _, body ->
            bodies += body
            when (calls.incrementAndGet()) {
                1 -> HttpResponse(200, Llsd.toXml(mapOf("id" to 41, "events" to listOf(mapOf("message" to "Hello", "body" to mapOf("k" to 1))))).toByteArray())
                2 -> HttpResponse(200, Llsd.toXml(mapOf("id" to 42, "events" to emptyList<Any>())).toByteArray())
                else -> HttpResponse(404, ByteArray(0))
            }
        }
        val seen = java.util.concurrent.CopyOnWriteArrayList<String>()
        var gone: String? = null
        EventQueue(http, "http://caps.test/eq").run(sc, { seen += it.message }, { gone = it })
        assertEquals(listOf("Hello"), seen.toList())
        assertEquals(3, bodies.size)
        assertFalse(bodies[0].contains("<integer>")) // first poll: no ack yet (undef)
        assertTrue(bodies[1].contains("<integer>41</integer>"))
        assertTrue(bodies[2].contains("<integer>42</integer>"))
        assertNotNull(gone)
        sc.cancel()
    }

    // ---- what the viewer sends ---------------------------------------------------------------

    @Test fun movementShowsUpInAgentUpdateControlFlags() = runBlocking {
        FakeSim().use { sim ->
            val sc = scope()
            val s = ViewerSession(noHttp, sc)
            s.connect(login(sim.socket.localPort, sim.agent))
            fun flags(b: ByteArray) = ByteBuffer.wrap(b).order(ByteOrder.LITTLE_ENDIAN).getInt(109).toLong() and 0xFFFFFFFFL
            s.setMovement(forward = 1, strafe = 0)
            eventually { sim.agentUpdates.lastOrNull()?.takeIf { flags(it) and AgentControl.AT_POS != 0L } }
            s.setMovement(forward = 0, strafe = -1, up = 1, fly = true)
            val last = eventually { sim.agentUpdates.lastOrNull()?.takeIf { flags(it) and AgentControl.FLY != 0L } }
            assertTrue(flags(last) and AgentControl.AT_POS == 0L)
            assertTrue(flags(last) and AgentControl.LEFT_NEG != 0L)
            assertTrue(flags(last) and AgentControl.UP_POS != 0L)
            s.setMovement(0, 0)
            eventually { sim.agentUpdates.lastOrNull()?.takeIf { flags(it) == 0L } }
            s.logout(); sc.cancel()
        }
    }

    private fun im(sim: FakeSim, dialog: Int, text: String, fromGroup: Boolean = false) = sim.inject(Outgoing(Msg.ImprovedInstantMessage,
        WireWriter().uuid(UUID(7, 7)).uuid(UUID(0, 0)).bool(fromGroup).uuid(sim.agent).u32(0).uuid(UUID(0, 0)).vec3(0f, 0f, 0f).u8(0).u8(dialog)
            .uuid(UUID(5, 5)).u32(0).str1("Visiting Avatar").str2(text).bin2(ByteArray(0)).u32(0).toByteArray(), true))

    @Test fun instantMessagesAreFilteredByDialogType() = runBlocking {
        FakeSim().use { sim ->
            val sc = scope()
            val s = ViewerSession(noHttp, sc)
            s.connect(login(sim.socket.localPort, sim.agent))
            im(sim, 0, "group spam", fromGroup = true) // group IMs are not shown as person-to-person chat
            im(sim, 41, "friend?") // friendship offer (dialog 38 and 41)
            im(sim, 19, "scripted hello") // object IM
            im(sim, 32, "typing indicator") // ignored dialog type
            im(sim, 0, "hello there")
            eventually { s.chat.value.firstOrNull { it.text == "hello there" } }
            val texts = s.chat.value.map { it.kind to it.text }
            assertTrue(texts.contains(ChatKind.IM to "hello there"))
            assertTrue(texts.contains(ChatKind.OBJECT_IM to "scripted hello"))
            assertTrue(texts.none { it.second == "group spam" || it.second == "typing indicator" })
            assertTrue(s.offers.value.any { it is PendingOffer.Friend })
            s.logout(); sc.cancel()
        }
    }

    // ---- circuit -----------------------------------------------------------------------------

    @Test fun duplicateReliablePacketsAreDeliveredOnceButAckedEachTime() = runBlocking {
        val sim = DatagramSocket(0, InetAddress.getByName("127.0.0.1")).apply { soTimeout = 2000 }
        val sc = scope()
        val c = Circuit(sc, InetSocketAddress("127.0.0.1", sim.localPort), ackIntervalMs = 50)
        c.start()
        val got = java.util.concurrent.CopyOnWriteArrayList<Int>()
        sc.launch(start = CoroutineStart.UNDISPATCHED) { c.messages.collect { got += it.id } }
        c.send(Messages.useCircuitCode(1, UUID.randomUUID(), UUID.randomUUID())) // makes the circuit learn our port
        val hello = DatagramPacket(ByteArray(2048), 2048); sim.receive(hello)

        val pkt = PacketCodec.encode(77, PacketFlags.RELIABLE, Msg.KickUser, WireWriter().bytes(ByteArray(6)).uuid(UUID(1, 1)).uuid(UUID(1, 1)).str2("x").toByteArray())
        val dest = InetSocketAddress("127.0.0.1", c.localPort)
        repeat(3) { sim.send(DatagramPacket(pkt, pkt.size, dest)) }
        eventually { got.firstOrNull() }
        delay(400)
        assertEquals("delivered once", 1, got.count { it == Msg.KickUser })

        // Every copy is acknowledged: collect packet acks until sequence 77 shows up at least once.
        var acked = 0
        val end = System.currentTimeMillis() + 2000
        while (System.currentTimeMillis() < end && acked == 0) {
            val d = DatagramPacket(ByteArray(2048), 2048)
            try { sim.receive(d) } catch (_: java.net.SocketTimeoutException) { break }
            val p = PacketCodec.decode(d.data, d.length)
            if (p.messageId == Msg.PacketAck) { val r = WireReader(p.body); repeat(r.u8()) { if (r.u32().toInt() == 77) acked++ } }
        }
        assertTrue("duplicate was never acknowledged", acked >= 1)
        c.close(); sim.close(); sc.cancel()
    }

    @Test fun unackedReliableMessagesAreReportedLostAfterTheLastResend() = runBlocking {
        val sim = DatagramSocket(0, InetAddress.getByName("127.0.0.1"))
        val sc = scope()
        val c = Circuit(sc, InetSocketAddress("127.0.0.1", sim.localPort), resendIntervalMs = 60, maxResends = 2, ackIntervalMs = 30)
        c.start()
        val lost = sc.async(start = CoroutineStart.UNDISPATCHED) { withTimeoutOrNull(3000) { c.lost.first() } }
        c.send(Messages.useCircuitCode(1, UUID.randomUUID(), UUID.randomUUID()))
        assertEquals(Msg.UseCircuitCode, lost.await())
        c.close(); sim.close(); sc.cancel()
    }

    @Test fun anAckStopsResends() = runBlocking {
        val sim = DatagramSocket(0, InetAddress.getByName("127.0.0.1")).apply { soTimeout = 400 }
        val sc = scope()
        val c = Circuit(sc, InetSocketAddress("127.0.0.1", sim.localPort), resendIntervalMs = 100, maxResends = 5, ackIntervalMs = 30)
        c.start()
        c.send(Messages.useCircuitCode(1, UUID.randomUUID(), UUID.randomUUID()))
        val first = DatagramPacket(ByteArray(2048), 2048); sim.receive(first)
        val seq = PacketCodec.decode(first.data, first.length).sequence
        val ack = Messages.packetAck(listOf(seq))
        val b = PacketCodec.encode(1, 0, ack.id, ack.body)
        sim.send(DatagramPacket(b, b.size, InetSocketAddress("127.0.0.1", c.localPort)))
        delay(500)
        // After the ack, nothing but our own acks/pings may arrive; in particular no resend of the original message.
        var resent = false
        while (true) {
            val d = DatagramPacket(ByteArray(2048), 2048)
            try { sim.receive(d) } catch (_: java.net.SocketTimeoutException) { break }
            val p = PacketCodec.decode(d.data, d.length)
            if (p.messageId == Msg.UseCircuitCode) resent = true
        }
        assertFalse(resent)
        c.close(); sim.close(); sc.cancel()
    }

    @Test fun aLocalTeleportMovesOurPositionAndTheCameraWeReport() = runBlocking {
        FakeSim().use { sim ->
            val sc = scope()
            val s = ViewerSession(noHttp, sc)
            s.connect(login(sim.socket.localPort, sim.agent))
            assertEquals(10f, s.region.value!!.position!![0], 0f) // from AgentMovementComplete
            sim.inject(Outgoing(Msg.TeleportLocal, WireWriter().uuid(sim.agent).u32(0).vec3(100f, 90f, 40f).vec3(1f, 0f, 0f).u32(0).toByteArray(), true))
            eventually { s.region.value?.position?.takeIf { it[0] == 100f } }
            assertArrayEquals(floatArrayOf(100f, 90f, 40f), s.region.value!!.position!!, 0f)
            eventually { s.region.value?.name?.takeIf { it == "Testville" } } // the handshake may trail connect(); the teleport must not lose it
            // The next AgentUpdate carries the new spot as camera centre (camera centre starts at byte 57: 32 ids + 2x12 rotation + 1 state).
            eventually { sim.agentUpdates.lastOrNull()?.takeIf { ByteBuffer.wrap(it).order(ByteOrder.LITTLE_ENDIAN).getFloat(57) == 100f } }
            s.logout(); sc.cancel()
        }
    }

    @Test fun ourPositionFollowsOurOwnAvatarInObjectUpdates() = runBlocking {
        FakeSim().use { sim ->
            val sc = scope()
            val s = ViewerSession(noHttp, sc)
            s.connect(login(sim.socket.localPort, sim.agent))
            val me = app.linkpoint.core.mock.ObjectSpec(77, fullId = sim.agent, pcode = app.linkpoint.core.scene.PCode.AVATAR, position = app.linkpoint.core.scene.Vec3(200f, 55f, 33f))
            sim.inject(Outgoing(Msg.ObjectUpdate, app.linkpoint.core.mock.ObjectPackets.full(me), false))
            val p = eventually { s.region.value?.position?.takeIf { it[0] == 200f } }
            assertArrayEquals(floatArrayOf(200f, 55f, 33f), p, 0f)
            s.logout(); sc.cancel()
        }
    }
}
