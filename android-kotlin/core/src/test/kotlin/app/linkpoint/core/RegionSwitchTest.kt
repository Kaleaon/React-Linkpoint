package app.linkpoint.core

import app.linkpoint.core.llsd.Llsd
import app.linkpoint.core.login.LoginResult
import app.linkpoint.core.model.*
import app.linkpoint.core.net.*
import java.util.UUID
import java.util.concurrent.ConcurrentLinkedQueue
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

/**
 * Teleport and region crossing against two loopback simulators. The viewer learns about both through the
 * event queue capability, so a scripted HTTP fake serves the seed capabilities and the event queues.
 */
class RegionSwitchTest {
    private val loopback = byteArrayOf(127, 0, 0, 1)

    /** Seed capabilities and event queues for any number of fake simulators, keyed by a name. */
    private class Caps {
        val queues = HashMap<String, ConcurrentLinkedQueue<Map<String, Any?>>>()
        fun queue(sim: String) = queues.getOrPut(sim) { ConcurrentLinkedQueue() }
        fun seed(sim: String) = "http://caps.test/$sim/seed"
        fun eq(sim: String) = "http://caps.test/$sim/eq"
        fun http() = FakeHttp { url, _ ->
            val sim = url.removePrefix("http://caps.test/").substringBefore('/')
            when {
                url.endsWith("/seed") -> HttpResponse(200, Llsd.toXml(mapOf("EventQueueGet" to eq(sim))).toByteArray())
                url.endsWith("/eq") -> {
                    val events = generateSequence { queue(sim).poll() }.toList()
                    if (events.isEmpty()) { Thread.sleep(30); HttpResponse(499, ByteArray(0)) }
                    else HttpResponse(200, Llsd.toXml(mapOf("id" to 1, "events" to events)).toByteArray())
                }
                else -> HttpResponse(404, ByteArray(0))
            }
        }
    }

    private fun login(sim: FakeSim, seed: String) = LoginResult(
        agentId = sim.agent.toString(), sessionId = UUID.randomUUID().toString(), secureSessionId = "", circuitCode = 99,
        simIp = "127.0.0.1", simPort = sim.socket.localPort, seedCapability = seed, firstName = "Test", lastName = "Resident",
        regionX = sim.gridX * 256, regionY = sim.gridY * 256, message = "", buddies = emptyList(),
        inventoryRootId = null, mfaHash = null, raw = emptyMap(),
    )

    private suspend fun <T> eventually(timeoutMs: Long = 8000, f: () -> T?): T {
        val end = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < end) { f()?.let { return it }; delay(25) }
        throw AssertionError("condition not met in ${timeoutMs}ms")
    }

    private fun simEvent(name: String, key: String, sim: FakeSim, seed: String) =
        mapOf("message" to name, "body" to mapOf(key to listOf(mapOf("SimIP" to loopback, "SimPort" to sim.socket.localPort, "SeedCapability" to seed))))

    @Test fun teleportByNameMovesTheSessionToTheNewRegion() = runBlocking {
        FakeSim("Origin", 1000, 1001).use { origin -> FakeSim("Elsewhere", 2000, 2001).use { target ->
            origin.knownRegions += Triple("Elsewhere", 2000, 2001)
            val caps = Caps()
            val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val s = ViewerSession(caps.http(), scope)
            val notices = java.util.concurrent.CopyOnWriteArrayList<ViewerNotice>()
            scope.launch { s.notices.collect { notices += it } }
            s.connect(login(origin, caps.seed("origin")))
            eventually { s.region.value?.takeIf { it.name == "Origin" } }
            val firstCircuit = s.currentCircuit

            s.teleport("elsewhere") // lookup is case-insensitive
            eventually { origin.teleportRequests.firstOrNull() }
            assertEquals(listOf((2000L * 256 shl 32) or (2001L * 256)), origin.teleportRequests.toList())

            // A TeleportFinish without a usable Info block must not break the session.
            caps.queue("origin").add(mapOf("message" to "TeleportFinish", "body" to mapOf("Info" to emptyList<Any>())))
            caps.queue("origin").add(simEvent("TeleportFinish", "Info", target, caps.seed("target")))

            val region = eventually { s.region.value?.takeIf { it.name == "Elsewhere" } }
            assertEquals((2000L * 256 shl 32) or (2001L * 256), eventually { s.region.value?.handle?.takeIf { it != 0L } })
            assertEquals(ConnectionState.CONNECTED, s.state.value)
            assertNotNull(region)
            assertTrue(target.received.contains(Msg.UseCircuitCode))
            assertTrue(target.received.contains(Msg.CompleteAgentMovement))
            assertNotSame(firstCircuit, s.currentCircuit)
            eventually { s.capabilities.value["EventQueueGet"]?.takeIf { it == caps.eq("target") } }
            eventually { s.scene.get(5) } // objects streamed by the new region are kept
            assertTrue(notices.any { it is ViewerNotice.Teleport })
            assertTrue("no error notices expected: $notices", notices.none { it is ViewerNotice.Error })

            // Chat now goes to the new simulator, not the old one.
            s.sendChat("after the jump")
            eventually { target.chatSeen.firstOrNull { it == "after the jump" } }
            assertTrue(origin.chatSeen.isEmpty())
            s.logout(); scope.cancel()
        } }
    }

    @Test fun teleportToUnknownRegionThrowsAndStaysPut() = runBlocking {
        FakeSim("Origin").use { origin ->
            val caps = Caps()
            val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val s = ViewerSession(caps.http(), scope)
            s.connect(login(origin, caps.seed("origin")))
            val ex = try { s.teleport("Nowhere"); null } catch (e: IllegalArgumentException) { e }
            assertNotNull(ex); assertTrue(ex!!.message!!.contains("Nowhere"))
            delay(300) // a stray request would have reached the fake by now
            assertTrue(origin.teleportRequests.isEmpty())
            assertEquals(ConnectionState.CONNECTED, s.state.value)
            s.logout(); scope.cancel()
        }
    }

    @Test fun crossingIntoANeighbourSwitchesCircuitAndClearsNearby() = runBlocking {
        FakeSim("West", 1000, 1001).use { west -> FakeSim("East", 1001, 1001).use { east ->
            val caps = Caps()
            val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val s = ViewerSession(caps.http(), scope)
            s.connect(login(west, caps.seed("west")))
            eventually { s.region.value?.takeIf { it.name == "West" } }
            eventually { s.scene.get(5) }

            caps.queue("west").add(simEvent("CrossedRegion", "RegionData", east, caps.seed("east")))

            eventually { s.region.value?.takeIf { it.name == "East" } }
            assertEquals(ConnectionState.CONNECTED, s.state.value)
            assertEquals((1001L * 256 shl 32) or (1001L * 256), eventually { s.region.value?.handle?.takeIf { it != 0L } })
            assertTrue(east.received.contains(Msg.UseCircuitCode))
            eventually { s.capabilities.value["EventQueueGet"]?.takeIf { it == caps.eq("east") } }
            s.sendChat("crossed")
            eventually { east.chatSeen.firstOrNull { it == "crossed" } }
            assertTrue(west.chatSeen.isEmpty())
            s.logout(); scope.cancel()
        } }
    }

    private fun lureIm(sim: FakeSim, lureId: UUID) = sim.inject(Outgoing(Msg.ImprovedInstantMessage, WireWriter().uuid(UUID(7, 7)).uuid(UUID(0, 0))
        .bool(false).uuid(sim.agent).u32(0).uuid(UUID(0, 0)).vec3(0f, 0f, 0f).u8(0).u8(22).uuid(lureId).u32(0).str1("Visiting Avatar").str2("Join me at the beach").bin2(ByteArray(0)).u32(0).toByteArray(), true))

    @Test fun acceptingALureSendsTheLureIdAndFollowsTheTeleport() = runBlocking {
        FakeSim("Origin", 1000, 1001).use { origin -> FakeSim("Beach", 3000, 3001).use { beach ->
            val caps = Caps()
            val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val s = ViewerSession(caps.http(), scope)
            s.connect(login(origin, caps.seed("origin")))
            eventually { s.region.value?.takeIf { it.name == "Origin" } }

            val lureId = UUID.randomUUID()
            lureIm(origin, lureId)
            val offer = eventually { s.offers.value.filterIsInstance<PendingOffer.Lure>().firstOrNull() }
            assertEquals(lureId, offer.id); assertEquals("Join me at the beach", offer.text)
            assertEquals("Visiting Avatar", offer.fromName)
            assertTrue(s.chat.value.any { it.kind == ChatKind.SYSTEM && it.text.contains("offered you a teleport") })

            s.acceptOffer(offer)
            assertTrue("accepted offer is removed", s.offers.value.isEmpty())
            eventually { origin.lureRequests.firstOrNull() }
            assertEquals(listOf(lureId), origin.lureRequests.toList())

            caps.queue("origin").add(simEvent("TeleportFinish", "Info", beach, caps.seed("beach")))
            eventually { s.region.value?.takeIf { it.name == "Beach" } }
            assertEquals(ConnectionState.CONNECTED, s.state.value)
            s.logout(); scope.cancel()
        } }
    }

    @Test fun decliningALureSendsNothingAndDropsTheOffer() = runBlocking {
        FakeSim("Origin").use { origin ->
            val caps = Caps()
            val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val s = ViewerSession(caps.http(), scope)
            s.connect(login(origin, caps.seed("origin")))
            lureIm(origin, UUID.randomUUID())
            val offer = eventually { s.offers.value.firstOrNull() }
            s.declineOffer(offer)
            assertTrue(s.offers.value.isEmpty())
            delay(300)
            assertTrue(origin.lureRequests.isEmpty())
            s.logout(); scope.cancel()
        }
    }

    @Test fun teleportHomeSendsAnAllZeroLandmarkAndFollowsTheTeleport() = runBlocking {
        FakeSim("Away", 1000, 1001).use { away -> FakeSim("Home", 500, 501).use { home ->
            val caps = Caps()
            val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val s = ViewerSession(caps.http(), scope)
            s.connect(login(away, caps.seed("away")))
            eventually { s.region.value?.takeIf { it.name == "Away" } }

            s.teleportHome()
            eventually { away.landmarkRequests.firstOrNull() }
            assertEquals(listOf(UUID(0, 0)), away.landmarkRequests.toList())

            caps.queue("away").add(simEvent("TeleportFinish", "Info", home, caps.seed("home")))
            eventually { s.region.value?.takeIf { it.name == "Home" } }
            assertEquals((500L * 256 shl 32) or (501L * 256), eventually { s.region.value?.handle?.takeIf { it != 0L } })
            s.logout(); scope.cancel()
        } }
    }

    @Test fun teleportFailureIsReportedAndTheSessionStaysInThePlace() = runBlocking {
        FakeSim("Origin").use { origin ->
            val caps = Caps()
            val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val s = ViewerSession(caps.http(), scope)
            val notices = java.util.concurrent.CopyOnWriteArrayList<ViewerNotice>()
            scope.launch(start = CoroutineStart.UNDISPATCHED) { s.notices.collect { notices += it } }
            s.connect(login(origin, caps.seed("origin")))
            origin.inject(Outgoing(Msg.TeleportFailed, WireWriter().uuid(origin.agent).str1("Region is full").u8(0).toByteArray(), true))
            val err = eventually { notices.filterIsInstance<ViewerNotice.Error>().firstOrNull() }
            assertTrue(err.toString(), err.toString().contains("Region is full"))
            assertEquals(ConnectionState.CONNECTED, s.state.value)
            assertEquals("Origin", s.region.value?.name)
            s.logout(); scope.cancel()
        }
    }

    @Test fun teleportHomeAndLureRequireAConnection() {
        val s = ViewerSession(Caps().http(), CoroutineScope(Dispatchers.Default))
        assertThrows(IllegalStateException::class.java) { s.teleportHome() }
        assertThrows(IllegalStateException::class.java) { s.acceptOffer(PendingOffer.Lure(UUID.randomUUID(), "x", "y")) }
    }

    private fun enableSimulator(sim: FakeSim) =
        mapOf("message" to "EnableSimulator", "body" to mapOf("SimulatorInfo" to listOf(mapOf("Handle" to ByteArray(8), "IP" to loopback, "Port" to sim.socket.localPort))))

    @Test fun anAnnouncedNeighbourGetsACircuitAndIsPromotedOnCrossing() = runBlocking {
        FakeSim("West", 1000, 1001).use { west -> FakeSim("East", 1001, 1001).use { east ->
            val caps = Caps()
            val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val s = ViewerSession(caps.http(), scope)
            s.connect(login(west, caps.seed("west")))
            eventually { s.region.value?.takeIf { it.name == "West" } }
            assertTrue("no circuit to the neighbour before it is announced", east.received.isEmpty())

            // The grid announces the neighbour (twice, as grids do): we open exactly one child circuit.
            caps.queue("west").add(enableSimulator(east)); caps.queue("west").add(enableSimulator(east))
            eventually { east.received.firstOrNull { it == Msg.UseCircuitCode } }
            delay(300)
            assertEquals(1, east.circuitCodeCount)
            assertFalse("a child circuit is not a region entry", east.received.contains(Msg.CompleteAgentMovement))
            assertEquals("still in the west", "West", s.region.value?.name)

            caps.queue("west").add(simEvent("CrossedRegion", "RegionData", east, caps.seed("east")))
            eventually { s.region.value?.takeIf { it.name == "East" } }
            assertEquals("the crossing reused the child circuit", 1, east.circuitCodeCount)
            assertTrue(east.received.contains(Msg.CompleteAgentMovement))
            assertEquals(ConnectionState.CONNECTED, s.state.value)
            s.sendChat("over the line")
            eventually { east.chatSeen.firstOrNull { it == "over the line" } }
            s.logout(); scope.cancel()
        } }
    }

    @Test fun neighboursAreDroppedWhenTheSessionEnds() = runBlocking {
        FakeSim("West", 1000, 1001).use { west -> FakeSim("East", 1001, 1001).use { east ->
            val caps = Caps()
            val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val s = ViewerSession(caps.http(), scope)
            s.connect(login(west, caps.seed("west")))
            caps.queue("west").add(enableSimulator(east))
            eventually { east.received.firstOrNull { it == Msg.UseCircuitCode } }
            s.logout()
            val before = east.received.size
            delay(1500) // a leaked child circuit would keep acking/pinging
            assertTrue("the child circuit should be closed", east.received.size - before <= 1)
            scope.cancel()
        } }
    }

    @Test fun aTeleportWaitsForASilentJustOpenedNeighbourButNotForever() = runBlocking {
        FakeSim("West", 1000, 1001).use { west -> FakeSim("East", 1001, 1001).use { east ->
            val caps = Caps()
            val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val s = ViewerSession(caps.http(), scope)
            s.connect(login(west, caps.seed("west")))
            caps.queue("west").add(enableSimulator(east))
            eventually { east.received.firstOrNull { it == Msg.UseCircuitCode } }
            val t0 = System.currentTimeMillis()
            s.teleportHome()
            delay(1200)
            assertTrue("the request is held back while the neighbour has not answered", west.landmarkRequests.isEmpty())
            eventually { west.landmarkRequests.firstOrNull() }
            val waited = System.currentTimeMillis() - t0
            assertTrue("held back for $waited ms, expected roughly 3 s", waited in 2500..6000)
            s.logout(); scope.cancel()
        } }
    }

    @Test fun aTeleportGoesOutPromptlyOnceTheNeighbourHasAnswered() = runBlocking {
        FakeSim("West", 1000, 1001).use { west -> FakeSim("East", 1001, 1001).use { east ->
            east.greetsOnUseCircuitCode = true
            val caps = Caps()
            val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val s = ViewerSession(caps.http(), scope)
            s.connect(login(west, caps.seed("west")))
            delay(2700) // past the arrival grace period, so only the neighbour matters
            caps.queue("west").add(enableSimulator(east))
            eventually { east.received.firstOrNull { it == Msg.UseCircuitCode } }
            delay(300) // the greeting has arrived
            val t0 = System.currentTimeMillis()
            s.teleportHome()
            eventually { west.landmarkRequests.firstOrNull() }
            val waited = System.currentTimeMillis() - t0
            assertTrue("took $waited ms", waited < 1500)
            s.logout(); scope.cancel()
        } }
    }

    @Test fun aTeleportRightAfterArrivingWaitsOutTheGracePeriod() = runBlocking {
        FakeSim("West", 1000, 1001).use { west ->
            val caps = Caps()
            val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val s = ViewerSession(caps.http(), scope)
            s.connect(login(west, caps.seed("west")))
            val t0 = System.currentTimeMillis()
            s.teleportHome()
            delay(1000)
            assertTrue("held back so the new region can announce its neighbours first", west.landmarkRequests.isEmpty())
            eventually { west.landmarkRequests.firstOrNull() }
            val waited = System.currentTimeMillis() - t0
            assertTrue("waited $waited ms, expected about 2.5 s after arrival", waited in 1800..4500)
            s.logout(); scope.cancel()
        }
    }
}
