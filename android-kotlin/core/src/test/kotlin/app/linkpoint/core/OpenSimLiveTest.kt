package app.linkpoint.core

import app.linkpoint.core.login.Grid
import app.linkpoint.core.login.LoginClient
import app.linkpoint.core.login.LoginRequest
import app.linkpoint.core.model.ConnectionState
import app.linkpoint.core.net.UrlConnectionHttp
import kotlinx.coroutines.*
import org.junit.Assume.assumeTrue
import org.junit.Assert.*
import org.junit.Test

/**
 * Runs the viewer core against a REAL OpenSim, not a fake. Skipped unless OPENSIM_LOGIN_URL is set:
 *   OPENSIM_LOGIN_URL=http://127.0.0.1:9002/ OPENSIM_USER="Linky Tester" OPENSIM_PASSWORD=testpass1 ./gradlew :core:test --tests '*OpenSimLiveTest*'
 * See tools/opensim/README.md for setting the simulator up.
 */
class OpenSimLiveTest {
    private suspend fun <T> eventually(timeoutMs: Long = 30_000, what: String, f: () -> T?): T {
        val end = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < end) { f()?.let { return it }; delay(50) }
        throw AssertionError("timed out waiting for $what")
    }

    @Test fun logsInAndStreamsTheRegion() = runBlocking {
        val url = System.getenv("OPENSIM_LOGIN_URL"); assumeTrue("OPENSIM_LOGIN_URL not set", !url.isNullOrBlank())
        val http = UrlConnectionHttp()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val result = LoginClient.login(http, LoginRequest(Grid("opensim-local", "Local OpenSim", url!!), System.getenv("OPENSIM_USER") ?: "Linky Tester", System.getenv("OPENSIM_PASSWORD") ?: "testpass1", deviceId = "live-test"))
        val s = ViewerSession(http, scope)
        s.connect(result)
        assertEquals(ConnectionState.CONNECTED, s.state.value)
        val region = eventually(what = "region handshake") { s.region.value?.takeIf { !it.name.isNullOrEmpty() } }
        println("LIVE region=${region.name} grid=${region.gridX},${region.gridY} water=${region.waterHeight} terrainInfo=${region.terrain != null}")
        eventually(what = "terrain") { s.heightmap.takeIf { it.isComplete } }
        println("LIVE terrain complete; height at 128,128 = ${s.heightmap.at(128f, 128f)}")
        eventually(what = "capabilities") { s.capabilities.value.takeIf { it.isNotEmpty() } }
        println("LIVE caps=${s.capabilities.value.keys.sorted()}")
        delay(5000)
        println("LIVE objects=${s.scene.size} avatars=${s.scene.snapshot().count { it.isAvatar }} inventoryRoot=${result.inventoryRootId}")
        s.sendChat("hello from Linkpoint core")
        delay(1500)
        s.logout()
        assertEquals(ConnectionState.DISCONNECTED, s.state.value)
        scope.cancel()
    }
}
