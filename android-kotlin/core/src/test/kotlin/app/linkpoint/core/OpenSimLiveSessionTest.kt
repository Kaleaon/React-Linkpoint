package app.linkpoint.core

import app.linkpoint.core.login.Grid
import app.linkpoint.core.login.LoginClient
import app.linkpoint.core.login.LoginFailure
import app.linkpoint.core.login.LoginRequest
import app.linkpoint.core.login.LoginResult
import app.linkpoint.core.model.*
import app.linkpoint.core.net.UrlConnectionHttp
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test

/**
 * Session behaviour against a REAL OpenSim: teleport, region crossing, chat echo, profile, inventory, relogin.
 * Skipped unless OPENSIM_LOGIN_URL is set. Teleport/crossing tests also need the second region ("Neighbour Isle", one
 * region east of "Test Isle") that `tools/opensim/live.py` configures (it sets OPENSIM_NEIGHBOUR), and skip without it.
 */
class OpenSimLiveSessionTest {
    private val url: String? = System.getenv("OPENSIM_LOGIN_URL")
    private val user = System.getenv("OPENSIM_USER") ?: "Linky Tester"
    private val password = System.getenv("OPENSIM_PASSWORD") ?: "testpass1"
    private val home = "Test Isle"
    private val neighbour = "Neighbour Isle"

    private suspend fun <T> eventually(timeoutMs: Long = 30_000, what: String, f: () -> T?): T {
        val end = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < end) { f()?.let { return it }; delay(50) }
        throw AssertionError("timed out waiting for $what")
    }

    private suspend fun login(http: UrlConnectionHttp, pw: String = password): LoginResult =
        LoginClient.login(http, LoginRequest(Grid("opensim-local", "Local OpenSim", url!!), user, pw, start = "uri:$home&128&128&40", deviceId = "live-session-test"))

    /** OpenSim answers "already logged in" for about a minute after a session ended without a logout. */
    private suspend fun loginPatiently(http: UrlConnectionHttp): LoginResult {
        val end = System.currentTimeMillis() + 120_000
        while (true) {
            try { return login(http) } catch (e: LoginFailure) {
                if (!(e.message ?: "").contains("already logged in") || System.currentTimeMillis() > end) throw e
                delay(3000)
            }
        }
    }

    /** Runs [body] on a connected session and always logs out afterwards, so one failure cannot block the next test. */
    private fun withLive(body: suspend (Live) -> Any?): Unit = runBlocking {
        assumeTrue("OPENSIM_LOGIN_URL not set", !url.isNullOrBlank())
        val l = connected()
        try { body(l) } finally { l.finish() }
        Unit
    }

    private class Live(val http: UrlConnectionHttp, val scope: CoroutineScope, val s: ViewerSession, val notices: MutableList<ViewerNotice>)

    private suspend fun connected(): Live {
        val http = UrlConnectionHttp()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val s = ViewerSession(http, scope)
        val notices = java.util.concurrent.CopyOnWriteArrayList<ViewerNotice>()
        scope.launch(start = CoroutineStart.UNDISPATCHED) { s.notices.collect { notices += it } }
        s.connect(loginPatiently(http))
        eventually(what = "region handshake") { s.region.value?.takeIf { !it.name.isNullOrEmpty() } }
        return Live(http, scope, s, notices)
    }

    private suspend fun Live.finish() { runCatching { s.logout() }; scope.cancel() }

    /** Skips the test unless live.py (or the caller) says the second region exists: OPENSIM_NEIGHBOUR=<region name>. */
    private fun requireNeighbour() = assumeTrue("OPENSIM_NEIGHBOUR not set (no second region)", System.getenv("OPENSIM_NEIGHBOUR") == neighbour)

    @Test fun wrongPasswordIsAStructuredLoginFailure() = runBlocking {
        assumeTrue("OPENSIM_LOGIN_URL not set", !url.isNullOrBlank())
        val http = UrlConnectionHttp()
        val failure = try { login(http, "not-the-password"); null } catch (e: LoginFailure) { e }
        assertNotNull("a wrong password must raise LoginFailure", failure)
        println("LIVE bad password -> code=${failure!!.code} reason=${failure.reason} message=${failure.message}")
        assertFalse(failure.mfaRequired)
    }

    @Test fun ownChatIsEchoedAndInventoryLoads() = withLive { l ->
        val s = l.s
        s.sendChat("live echo ${System.nanoTime()}")
        val echo = eventually(what = "own chat echoed by the simulator") { s.chat.value.lastOrNull { it.kind == ChatKind.LOCAL && it.text.startsWith("live echo") } }
        assertEquals("Linky Tester", echo.fromName)

        val root = s.inventory.value.rootId
        assertNotNull(root)
        eventually(what = "capabilities") { s.capabilities.value["FetchInventoryDescendents2"] }
        s.fetchInventoryFolder(root!!)
        val inv = s.inventory.value
        println("LIVE inventory: ${inv.folders.size} folders, loaded=${inv.loaded.size}, items in root=${inv.items[root]?.size}")
        assertTrue(root in inv.loaded)
        assertTrue("a new account has the standard folders", inv.folders.size > 1)
    }

    /** A default OpenSim has no profile module, so it may never answer; the call must still return and leave the session usable. */
    @Test fun profileRequestReturnsWithoutBreakingTheSession() = withLive { l ->
        val profile = l.s.requestProfile(l.s.selfId!!)
        println("LIVE profile of self = ${profile ?: "no answer from this OpenSim (profile module not enabled)"}")
        // live.py enables the profile service and says so; then an answer is required, not optional.
        if (System.getenv("OPENSIM_PROFILES") == "1") assertNotNull("the profile service is enabled, so the simulator must answer", profile)
        assertEquals(ConnectionState.CONNECTED, l.s.state.value)
        l.s.sendChat("still alive after profile request")
        eventually(what = "chat echo") { l.s.chat.value.firstOrNull { it.text == "still alive after profile request" } }
    }

    @Test fun teleportWithinTheRegionIsAnnounced() = withLive { l ->
        val name = l.s.region.value!!.name!!
        l.s.teleport(name, 100f, 100f, 50f)
        eventually(what = "local teleport notice") { l.notices.filterIsInstance<ViewerNotice.Teleport>().firstOrNull { it.text.contains("within the region") } }
        eventually(what = "avatar moved") { l.s.region.value?.position?.takeIf { it[0] in 95f..105f } }
        println("LIVE local teleport -> position ${l.s.region.value?.position?.toList()}")
    }

    @Test fun teleportToTheNeighbourAndBackByName() = withLive { l ->
        requireNeighbour()
        val s = l.s
        val first = s.currentCircuit
        s.teleport(neighbour, 128f, 128f, 50f)
        eventually(60_000, "arrival in $neighbour") { s.region.value?.takeIf { it.name == neighbour } }
        assertNotSame("a teleport opens a new circuit", first, s.currentCircuit)
        assertEquals(ConnectionState.CONNECTED, s.state.value)
        eventually(what = "terrain of the new region") { s.heightmap.takeIf { it.isComplete } }
        eventually(what = "capabilities of the new region") { s.capabilities.value.takeIf { "GetTexture" in it } }
        s.sendChat("hello from the neighbour")
        eventually(what = "chat echo in the new region") { s.chat.value.firstOrNull { it.text == "hello from the neighbour" } }
        println("LIVE teleported to $neighbour at ${s.region.value?.position?.toList()}; errors=${l.notices.filterIsInstance<ViewerNotice.Error>()}")

        s.teleport(home, 128f, 128f, 50f)
        eventually(60_000, "arrival back in $home") { s.region.value?.takeIf { it.name == home } }
        assertTrue(l.notices.filterIsInstance<ViewerNotice.Error>().isEmpty())
    }

    /**
     * "Teleport home" needs a home location. OpenSim's console cannot set one for a fresh account ("Unable to set home"),
     * so on such a grid the request is answered with nothing; the test is skipped then rather than failing for a grid reason.
     */
    @Test fun teleportHome() = withLive { l ->
        requireNeighbour()
        val s = l.s
        s.teleport(neighbour, 128f, 128f, 50f)
        eventually(60_000, "arrival in $neighbour") { s.region.value?.takeIf { it.name == neighbour } }
        s.teleportHome()
        val end = System.currentTimeMillis() + (if (System.getenv("OPENSIM_HOME") == "1") 60_000 else 20_000)
        var arrived: RegionInfo? = null
        while (arrived == null && System.currentTimeMillis() < end) { arrived = s.region.value?.takeIf { it.name == home }; delay(100) }
        // live.py makes the home region the default region, which gives accounts a home; then arriving there is required.
        if (System.getenv("OPENSIM_HOME") == "1") assertNotNull("the account has a home, so teleport home must arrive", arrived)
        assumeTrue("this OpenSim account has no home location set, so there is nowhere to teleport to", arrived != null)
        assertEquals(ConnectionState.CONNECTED, s.state.value)
    }

    @Test fun walkingAcrossTheEastBorderEntersTheNeighbour() = withLive { l ->
        requireNeighbour()
        val s = l.s
        s.teleport(home, 245f, 128f, 60f)
        eventually(60_000, "avatar near the east border of $home") { s.region.value?.takeIf { it.name == home }?.position?.takeIf { it[0] > 240f } }
        s.setMovement(forward = 1, strafe = 0, yaw = 0f, fly = true) // yaw 0 faces +X (east)
        val crossed = try { eventually(60_000, "crossing into $neighbour") { s.region.value?.takeIf { it.name == neighbour } } } finally { s.setMovement(0, 0) }
        println("LIVE crossed the border into ${crossed.name}; errors=${l.notices.filterIsInstance<ViewerNotice.Error>()}")
        assertEquals(ConnectionState.CONNECTED, s.state.value)
        s.sendChat("crossed on foot")
        eventually(what = "chat echo after crossing") { s.chat.value.firstOrNull { it.text == "crossed on foot" } }
    }

    @Test fun canLogOutAndInAgain() = runBlocking {
        assumeTrue("OPENSIM_LOGIN_URL not set", !url.isNullOrBlank())
        val first = connected(); first.finish()
        assertEquals(ConnectionState.DISCONNECTED, first.s.state.value)
        val again = connected() // retries while OpenSim still holds the old presence
        try { assertEquals(ConnectionState.CONNECTED, again.s.state.value) } finally { again.finish() }
    }
}
