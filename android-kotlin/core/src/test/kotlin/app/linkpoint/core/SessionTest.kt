package app.linkpoint.core

import app.linkpoint.core.login.LoginResult
import app.linkpoint.core.model.*
import app.linkpoint.core.net.*
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.util.UUID
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import org.junit.Assert.*
import org.junit.Test

/** A loopback "simulator" speaking just enough of the protocol to drive a ViewerSession. */
class FakeSim : AutoCloseable {
    val socket = DatagramSocket(0, InetAddress.getByName("127.0.0.1")).apply { soTimeout = 200 }
    val received = java.util.concurrent.CopyOnWriteArrayList<Int>()
    val chatSeen = java.util.concurrent.CopyOnWriteArrayList<String>()
    @Volatile var running = true
    private var seq = 0
    private var client: java.net.SocketAddress? = null
    val agent: UUID = UUID.randomUUID()
    val friend: UUID = UUID.randomUUID()
    private val thread = Thread {
        val buf = ByteArray(2048)
        while (running) {
            val dp = DatagramPacket(buf, buf.size)
            try { socket.receive(dp) } catch (_: java.net.SocketTimeoutException) { continue } catch (_: Exception) { return@Thread }
            client = dp.socketAddress
            val p = PacketCodec.decode(buf, dp.length)
            received += p.messageId
            if (p.reliable) send(Messages.packetAck(listOf(p.sequence)))
            when (p.messageId) {
                Msg.CompleteAgentMovement -> {
                    send(Outgoing(Msg.AgentMovementComplete, WireWriter().uuid(agent).uuid(UUID.randomUUID()).vec3(10f, 20f, 30f).vec3(1f, 0f, 0f).u64((1000L * 256 shl 32) or (1001L * 256)).u32(0).u16(0).toByteArray(), true), zero = true)
                    send(Outgoing(Msg.RegionHandshake, WireWriter().u32(0).u8(13).str1("Testville").uuid(UUID.randomUUID()).bool(false).f32(20f).f32(1f).uuid(UUID.randomUUID()).also { w -> repeat(4) { w.uuid(UUID(0, 0)) }; repeat(4) { w.uuid(UUID(9, it.toLong())) }; repeat(4) { w.f32(10f + it) }; repeat(4) { w.f32(40f) } }.toByteArray(), true), zero = true)
                    send(Outgoing(Msg.OnlineNotification, WireWriter().u8(1).uuid(friend).toByteArray(), true))
                    send(Outgoing(Msg.ChatFromSimulator, WireWriter().str1("Someone").uuid(UUID.randomUUID()).uuid(UUID.randomUUID()).u8(1).u8(1).u8(1).vec3(0f, 0f, 0f).str2("welcome").toByteArray(), true))
                }
                Msg.ChatFromViewer -> {
                    val r = WireReader(p.body); r.uuid(); r.uuid(); chatSeen += r.str2()
                }
                Msg.LogoutRequest -> send(Outgoing(Msg.LogoutReply, WireWriter().uuid(agent).uuid(agent).u8(1).uuid(UUID(0, 0)).toByteArray(), true))
                Msg.UUIDNameRequest -> {
                    val r = WireReader(p.body); val n = r.u8(); val ids = List(n) { r.uuid() }
                    val w = WireWriter().u8(n); ids.forEach { w.uuid(it).str1("Pal").str1("Friendly") }
                    send(Outgoing(Msg.UUIDNameReply, w.toByteArray(), true))
                }
            }
        }
    }.apply { isDaemon = true; start() }

    private fun send(m: Outgoing, zero: Boolean = false) {
        val c = client ?: return
        val s = ++seq
        val flags = if (m.reliable) PacketFlags.RELIABLE else 0
        val b = if (zero) PacketCodec.encodeZeroCoded(s, flags, m.id, m.body) else PacketCodec.encode(s, flags, m.id, m.body)
        socket.send(DatagramPacket(b, b.size, c))
    }
    override fun close() { running = false; socket.close() }
}

class SessionTest {
    private fun login(sim: FakeSim) = LoginResult(
        agentId = sim.agent.toString(), sessionId = UUID.randomUUID().toString(), secureSessionId = "", circuitCode = 99,
        simIp = "127.0.0.1", simPort = sim.socket.localPort, seedCapability = "", firstName = "Test", lastName = "Resident",
        regionX = 256000, regionY = 256256, message = "", buddies = listOf(app.linkpoint.core.login.Buddy(sim.friend.toString(), 1, 1)),
        inventoryRootId = null, mfaHash = null, raw = emptyMap(),
    )

    private suspend fun <T> eventually(timeoutMs: Long = 5000, f: () -> T?): T {
        val end = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < end) { f()?.let { return it }; delay(25) }
        throw AssertionError("condition not met in ${timeoutMs}ms")
    }

    @Test fun connectsChatsAndLogsOut() = runBlocking {
        FakeSim().use { sim ->
            val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val http = FakeHttp { _, _ -> HttpResponse(404, ByteArray(0)) }
            val s = ViewerSession(http, scope)
            s.connect(login(sim))
            assertEquals(ConnectionState.CONNECTED, s.state.value)
            assertEquals(Msg.UseCircuitCode, sim.received.first())
            assertTrue(sim.received.contains(Msg.CompleteAgentMovement))

            // Region and movement data arrive from the (zero-coded) handshake.
            val region = eventually { s.region.value?.takeIf { it.name == "Testville" } }
            assertEquals(1000, region.gridX); assertEquals(1001, region.gridY); assertEquals(13, region.access)
            eventually { sim.received.firstOrNull { it == Msg.RegionHandshakeReply } } // the reply travels to the fake sim asynchronously
            assertEquals(20f, region.waterHeight!!, 0f)
            assertEquals(UUID(9, 2), region.terrain!!.detailTextureIds[2]); assertEquals(13f, region.terrain!!.startHeights[3], 0f)

            // Local chat from the simulator, friend presence, then a name lookup fills in the friend's name.
            eventually { s.chat.value.firstOrNull { it.text == "welcome" } }
            val friend = eventually { s.friends.value.firstOrNull { it.name != null && it.online == true } }
            assertEquals("Pal Friendly", friend.name)

            s.sendChat("hello world")
            eventually { sim.chatSeen.firstOrNull { it == "hello world" } }

            s.logout()
            assertEquals(ConnectionState.DISCONNECTED, s.state.value)
            assertTrue(sim.received.contains(Msg.LogoutRequest))
            scope.cancel()
        }
    }

    @Test fun reliableMessagesAreResentUntilAcked() = runBlocking {
        val sock = DatagramSocket(0, InetAddress.getByName("127.0.0.1")).apply { soTimeout = 3000 }
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val c = Circuit(scope, java.net.InetSocketAddress("127.0.0.1", sock.localPort), resendIntervalMs = 100, maxResends = 3)
        c.start()
        c.send(Messages.useCircuitCode(1, UUID.randomUUID(), UUID.randomUUID()))
        val buf = ByteArray(2048)
        val first = DatagramPacket(buf, buf.size); sock.receive(first)
        val p1 = PacketCodec.decode(buf, first.length)
        val second = DatagramPacket(ByteArray(2048), 2048); sock.receive(second)
        val p2 = PacketCodec.decode(second.data, second.length)
        assertEquals(p1.sequence, p2.sequence)
        assertTrue(p2.flags and PacketFlags.RESENT != 0)
        assertEquals(0, p1.flags and PacketFlags.RESENT)
        c.close(); sock.close(); scope.cancel()
    }

    @Test fun datagramsFromOtherHostsAreIgnored() = runBlocking {
        val sim = DatagramSocket(0, InetAddress.getByName("127.0.0.1"))
        val intruder = DatagramSocket(0, InetAddress.getByName("127.0.0.1"))
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val c = Circuit(scope, java.net.InetSocketAddress("127.0.0.1", sim.localPort))
        c.start()
        val got = scope.async { withTimeoutOrNull(700) { c.messages.first() } }
        delay(100)
        val b = PacketCodec.encode(1, 0, Msg.KickUser, byteArrayOf(0))
        intruder.send(DatagramPacket(b, b.size, InetAddress.getByName("127.0.0.1"), c.localPort))
        assertNull(got.await())
        c.close(); sim.close(); intruder.close(); scope.cancel()
    }
}
