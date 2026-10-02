package app.linkpoint.core

import app.linkpoint.core.login.LoginResult
import app.linkpoint.core.model.*
import app.linkpoint.core.net.*
import java.util.UUID
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

/** Sending friend requests and teleport offers, and what happens when the other side answers. */
class SocialTest {
    private val noHttp = FakeHttp { _, _ -> HttpResponse(404, ByteArray(0)) }
    private fun scope() = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private fun login(sim: FakeSim) = LoginResult(
        agentId = sim.agent.toString(), sessionId = UUID.randomUUID().toString(), secureSessionId = "", circuitCode = 99,
        simIp = "127.0.0.1", simPort = sim.socket.localPort, seedCapability = "", firstName = "Test", lastName = "Resident",
        regionX = 256000, regionY = 256256, message = "", buddies = emptyList(), inventoryRootId = null, mfaHash = null, raw = emptyMap(),
    )

    private suspend fun <T> eventually(timeoutMs: Long = 5000, f: () -> T?): T {
        val end = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < end) { f()?.let { return it }; delay(25) }
        throw AssertionError("condition not met in ${timeoutMs}ms")
    }

    private fun im(sim: FakeSim, from: UUID, name: String, dialog: Int, text: String) = sim.inject(Outgoing(Msg.ImprovedInstantMessage,
        WireWriter().uuid(from).uuid(UUID(0, 0)).bool(false).uuid(sim.agent).u32(0).uuid(UUID(0, 0)).vec3(0f, 0f, 0f).u8(0).u8(dialog)
            .uuid(UUID(5, 5)).u32(0).str1(name).str2(text).bin2(ByteArray(0)).u32(0).toByteArray(), true))

    @Test fun aFriendRequestIsSentAsDialog38ToTheRightPerson() = runBlocking {
        FakeSim().use { sim ->
            val sc = scope(); val s = ViewerSession(noHttp, sc)
            s.connect(login(sim))
            val pal = UUID.randomUUID()
            s.sendFriendRequest(pal, "be my friend")
            val sent = eventually { sim.imsSent.firstOrNull() }
            assertEquals(38, sent.first); assertEquals(pal, sent.second); assertEquals("be my friend", sent.third)
            assertTrue(s.chat.value.any { it.kind == ChatKind.SYSTEM && it.text.contains("Friend request sent") })
            s.logout(); sc.cancel()
        }
    }

    @Test fun anAcceptedFriendRequestAddsTheFriend() = runBlocking {
        FakeSim().use { sim ->
            val sc = scope(); val s = ViewerSession(noHttp, sc)
            s.connect(login(sim))
            val pal = UUID.randomUUID()
            im(sim, pal, "Pal Friendly", 39, "")
            val f = eventually { s.friends.value.firstOrNull { it.id == pal } }
            assertEquals("Pal Friendly", f.name)
            assertTrue(s.chat.value.any { it.text.contains("accepted your friendship") })
            im(sim, pal, "Pal Friendly", 39, "") // a repeat must not duplicate
            delay(200)
            assertEquals(1, s.friends.value.count { it.id == pal })
            s.logout(); sc.cancel()
        }
    }

    @Test fun aDeclinedFriendRequestIsReportedAndNobodyIsAdded() = runBlocking {
        FakeSim().use { sim ->
            val sc = scope(); val s = ViewerSession(noHttp, sc)
            s.connect(login(sim))
            im(sim, UUID.randomUUID(), "Shy Person", 40, "")
            eventually { s.chat.value.firstOrNull { it.text.contains("declined your friendship") } }
            assertTrue(s.friends.value.isEmpty())
            s.logout(); sc.cancel()
        }
    }

    @Test fun aTeleportOfferGoesToTheChosenResident() = runBlocking {
        FakeSim().use { sim ->
            val sc = scope(); val s = ViewerSession(noHttp, sc)
            s.connect(login(sim))
            val pal = UUID.randomUUID()
            s.offerTeleport(pal, "come over")
            val offer = eventually { sim.lureOffers.firstOrNull() }
            assertEquals(pal, offer.first); assertEquals("come over", offer.second)
            s.logout(); sc.cancel()
        }
    }

    @Test fun youCannotBefriendOrLureYourself() = runBlocking {
        FakeSim().use { sim ->
            val sc = scope(); val s = ViewerSession(noHttp, sc)
            s.connect(login(sim))
            assertThrows(IllegalArgumentException::class.java) { s.sendFriendRequest(sim.agent) }
            assertThrows(IllegalArgumentException::class.java) { s.offerTeleport(sim.agent) }
            s.logout(); sc.cancel()
        }
    }

    @Test fun socialActionsNeedAConnection() {
        val s = ViewerSession(noHttp, CoroutineScope(Dispatchers.Default))
        assertThrows(IllegalStateException::class.java) { s.sendFriendRequest(UUID.randomUUID()) }
        assertThrows(IllegalStateException::class.java) { s.offerTeleport(UUID.randomUUID()) }
    }
}

class RadarTest {
    private val noHttp = FakeHttp { _, _ -> HttpResponse(404, ByteArray(0)) }

    private suspend fun <T> eventually(timeoutMs: Long = 5000, f: () -> T?): T {
        val end = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < end) { f()?.let { return it }; delay(25) }
        throw AssertionError("condition not met in ${timeoutMs}ms")
    }

    /**
     * Real OpenSim layout, captured from a live OpenSim 0.9.3 packet: two locations, "you" is index 0, and the AgentData
     * block lists an id for EVERY location including our own. (An earlier version assumed our id was left out, so the
     * radar showed us as our own neighbour and dropped the real neighbour.)
     */
    @Test fun coarseLocationsAreReadWithAgentIdsParallelToLocations() = runBlocking {
        FakeSim().use { sim ->
            val sc = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val s = ViewerSession(noHttp, sc)
            s.connect(LoginResult(agentId = sim.agent.toString(), sessionId = UUID.randomUUID().toString(), secureSessionId = "", circuitCode = 99,
                simIp = "127.0.0.1", simPort = sim.socket.localPort, seedCapability = "", firstName = "Test", lastName = "Resident",
                regionX = 256000, regionY = 256256, message = "", buddies = emptyList(), inventoryRootId = null, mfaHash = null, raw = emptyMap()))
            val other = UUID.randomUUID()
            sim.inject(Outgoing(Msg.CoarseLocationUpdate, WireWriter().u8(2).u8(0x7f).u8(0x7f).u8(6).u8(0x80).u8(0x7f).u8(7)
                .u16(0).u16(0xFFFF).u8(2).uuid(sim.agent).uuid(other).toByteArray(), false))
            val near = eventually { s.nearby.value.takeIf { it.isNotEmpty() } }
            assertEquals("only the other avatar is listed, never ourselves", listOf(other), near.map { it.id })
            assertEquals(128, near[0].x); assertEquals(28, near[0].z)
            // A later update where the neighbour left leaves an empty radar rather than a stale entry.
            sim.inject(Outgoing(Msg.CoarseLocationUpdate, WireWriter().u8(1).u8(0x7f).u8(0x7f).u8(6).u16(0).u16(0xFFFF).u8(1).uuid(sim.agent).toByteArray(), false))
            eventually { s.nearby.value.takeIf { it.isEmpty() } }
            s.logout(); sc.cancel()
        }
    }
}
