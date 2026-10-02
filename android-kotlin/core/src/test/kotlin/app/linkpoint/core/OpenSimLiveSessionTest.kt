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
        LoginClient.login(http, LoginRequest(Grid("opensim-local", "Local OpenSim", url!!), user, pw, deviceId = "live-session-test"))

    private class Live(val http: UrlConnectionHttp, val scope: CoroutineScope, val s: ViewerSession, val notices: MutableList<ViewerNotice>)

    private suspend fun connected(): Live {
        val http = UrlConnectionHttp()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val s = ViewerSession(http, scope)
        val notices = java.util.concurrent.CopyOnWriteArrayList<ViewerNotice>()
        scope.launch(start = CoroutineStart.UNDISPATCHED) { s.notices.collect { notices += it } }
        s.connect(login(http))
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

    @Test fun ownChatIsEchoedAndProfileAndInventoryLoad() = runBlocking {
        assumeTrue("OPENSIM_LOGIN_URL not set", !url.isNullOrBlank())
        val l = connected()
        val s = l.s
        s.sendChat("live echo ${System.nanoTime()}")
        val echo = eventually(what = "own chat echoed by the simulator") { s.chat.value.lastOrNull { it.kind == ChatKind.LOCAL && it.text.startsWith("live echo") } }
        println("LIVE chat echo from='${echo.fromName}'")

        val profile = s.requestProfile(s.selfId!!)
        println("LIVE profile = $profile")
        assertNotNull("the simulator should answer a profile request for ourselves", profile)

        val root = s.inventory.value.rootId
        assertNotNull(root)
        eventually(what = "capabilities") { s.capabilities.value["FetchInventoryDescendents2"] }
        s.fetchInventoryFolder(root!!)
        val inv = s.inventory.value
        println("LIVE inventory: ${inv.folders.size} folders, loaded=${inv.loaded.size}, items in root=${inv.items[root]?.size}")
        assertTrue(root in inv.loaded)
        assertTrue("a new account has the standard folders", inv.folders.size > 1)
        l.finish()
    }

    @Test fun teleportWithinTheRegionIsAnnounced() = runBlocking {
        assumeTrue("OPENSIM_LOGIN_URL not set", !url.isNullOrBlank())
        val l = connected()
        val name = l.s.region.value!!.name!!
        l.s.teleport(name, 100f, 100f, 50f)
        eventually(what = "local teleport notice") { l.notices.filterIsInstance<ViewerNotice.Teleport>().firstOrNull { it.text.contains("within the region") } }
        eventually(what = "avatar moved") { l.s.region.value?.position?.takeIf { it[0] in 95f..105f } }
        println("LIVE local teleport -> position ${l.s.region.value?.position?.toList()}")
        l.finish()
    }

    @Test fun teleportToTheNeighbourAndHome() = runBlocking {
        assumeTrue("OPENSIM_LOGIN_URL not set", !url.isNullOrBlank())
        requireNeighbour(); val l = connected()
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

        s.teleportHome()
        eventually(60_000, "arrival back in the home region") { s.region.value?.takeIf { it.name == home } }
        println("LIVE teleport home -> ${s.region.value?.name}")
        assertTrue(l.notices.filterIsInstance<ViewerNotice.Error>().isEmpty())
        l.finish()
    }

    @Test fun walkingAcrossTheEastBorderEntersTheNeighbour() = runBlocking {
        assumeTrue("OPENSIM_LOGIN_URL not set", !url.isNullOrBlank())
        requireNeighbour(); val l = connected()
        val s = l.s
        if (s.region.value?.name != home) { s.teleportHome(); eventually(60_000, "home") { s.region.value?.takeIf { it.name == home } } }
        s.teleport(home, 245f, 128f, 60f)
        eventually(what = "avatar near the east border") { s.region.value?.position?.takeIf { it[0] > 240f } }
        s.setMovement(forward = 1, strafe = 0, yaw = 0f, fly = true) // yaw 0 faces +X (east)
        val crossed = try { eventually(60_000, "crossing into $neighbour") { s.region.value?.takeIf { it.name == neighbour } } } finally { s.setMovement(0, 0) }
        println("LIVE crossed the border into ${crossed.name}; errors=${l.notices.filterIsInstance<ViewerNotice.Error>()}")
        assertEquals(ConnectionState.CONNECTED, s.state.value)
        s.sendChat("crossed on foot")
        eventually(what = "chat echo after crossing") { s.chat.value.firstOrNull { it.text == "crossed on foot" } }
        l.finish()
    }

    @Test fun canLogOutAndInAgain() = runBlocking {
        assumeTrue("OPENSIM_LOGIN_URL not set", !url.isNullOrBlank())
        val first = connected(); first.finish()
        assertEquals(ConnectionState.DISCONNECTED, first.s.state.value)
        delay(2000) // OpenSim needs a moment to release the agent
        val again = connected()
        assertEquals(ConnectionState.CONNECTED, again.s.state.value)
        again.finish()
    }
}
