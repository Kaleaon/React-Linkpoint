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
}
