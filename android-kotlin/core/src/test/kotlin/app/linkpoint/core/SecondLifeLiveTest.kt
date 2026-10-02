package app.linkpoint.core

import app.linkpoint.core.login.Grid
import app.linkpoint.core.login.LoginClient
import app.linkpoint.core.login.LoginFailure
import app.linkpoint.core.login.LoginRequest
import app.linkpoint.core.model.ConnectionState
import app.linkpoint.core.net.UrlConnectionHttp
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test

/**
 * Logs in to the REAL Second Life main grid with a real account, looks around and logs out. Skipped unless SL_USERNAME and
 * SL_PASSWORD are set (the `live-secondlife` workflow takes them from repository secrets).
 *
 * Output goes to a public CI log, so this test prints ONLY counts and yes/no results: no avatar or region names, positions,
 * inventory or friends, and any failure text is scrubbed of the credentials. It does not chat, teleport or message anyone.
 */
class SecondLifeLiveTest {
    private val user = System.getenv("SL_USERNAME")
    private val password = System.getenv("SL_PASSWORD")

    private fun scrub(text: String?): String {
        var t = text ?: "no message"
        for (secret in listOfNotNull(user, password).filter { it.length >= 3 }) t = t.replace(secret, "***")
        return t.take(300)
    }

    private suspend fun <T> eventually(timeoutMs: Long, what: String, f: () -> T?): T {
        val end = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < end) { f()?.let { return it }; delay(100) }
        throw AssertionError("timed out waiting for $what")
    }

    @Test fun logsInStreamsTheRegionAndLogsOut() = runBlocking {
        assumeTrue("SL_USERNAME / SL_PASSWORD not set", !user.isNullOrBlank() && !password.isNullOrBlank())
        val http = UrlConnectionHttp()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val s = ViewerSession(http, scope)
        try {
            val result = try {
                LoginClient.login(http, LoginRequest(Grid.AGNI, user!!, password!!, deviceId = "linkpoint-ci-live-test"))
            } catch (e: LoginFailure) {
                fail("SL LOGIN REFUSED: code=${e.code} reason=${e.reason} mfaRequired=${e.mfaRequired} message=${scrub(e.message)}")
                return@runBlocking
            }
            println("LIVE SL login accepted: circuit set up, inventory skeleton folders=${result.inventorySkeleton.size}, friends=${result.buddies.size}")

            s.connect(result)
            assertEquals(ConnectionState.CONNECTED, s.state.value)
            val region = eventually(60_000, "region handshake") { s.region.value?.takeIf { !it.name.isNullOrEmpty() } }
            println("LIVE SL region handshake received (terrainInfo=${region.terrain != null}, water=${region.waterHeight != null})")

            val caps = eventually(60_000, "capabilities") { s.capabilities.value.takeIf { it.isNotEmpty() } }
            println("LIVE SL capabilities: ${caps.keys.sorted()}")

            val terrain = withTimeoutOrNull(60_000) { eventually(60_000, "terrain") { s.heightmap.takeIf { it.isComplete } } }
            println("LIVE SL terrain complete=${terrain != null}")

            delay(20_000) // let the object stream settle
            val objs = s.scene.snapshot()
            println("LIVE SL objects=${objs.size} avatars=${objs.count { it.isAvatar }} prims=${objs.count { !it.isAvatar && it.sculpt == null }} mesh/sculpt=${objs.count { it.sculpt != null }}")

            val root = s.inventory.value.rootId
            if (root != null && "FetchInventoryDescendents2" in caps) {
                val fetched = try { s.fetchInventoryFolder(root); true } catch (e: Exception) { println("LIVE SL inventory fetch failed: ${scrub(e.message)}"); false }
                println("LIVE SL inventory fetch ok=$fetched, folders known=${s.inventory.value.folders.size}")
            }
            println("LIVE SL balance known=${s.balance.value != null}")
            assertTrue("a region around a logged-in avatar always contains at least the avatar", objs.isNotEmpty())
        } catch (e: AssertionError) {
            throw AssertionError(scrub(e.message))
        } finally {
            runCatching { s.logout() }
            scope.cancel()
        }
        assertEquals(ConnectionState.DISCONNECTED, s.state.value)
        println("LIVE SL logged out cleanly")
    }
}
