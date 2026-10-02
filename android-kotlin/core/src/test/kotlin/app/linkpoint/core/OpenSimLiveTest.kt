package app.linkpoint.core

import app.linkpoint.core.login.Grid
import app.linkpoint.core.login.LoginClient
import app.linkpoint.core.login.LoginRequest
import app.linkpoint.core.model.ConnectionState
import app.linkpoint.core.net.UrlConnectionHttp
import app.linkpoint.core.image.TextureFetcher
import app.linkpoint.core.scene.*
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

    /** Needs content in the region, e.g. the OAR from `./gradlew :mockgrid:runOar` or any downloaded one. */
    @Test fun streamsAndDecodesRegionContent() = runBlocking {
        val url = System.getenv("OPENSIM_LOGIN_URL"); assumeTrue("OPENSIM_LOGIN_URL not set", !url.isNullOrBlank())
        val http = UrlConnectionHttp()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val result = LoginClient.login(http, LoginRequest(Grid("opensim-local", "Local OpenSim", url!!), System.getenv("OPENSIM_USER") ?: "Linky Tester", System.getenv("OPENSIM_PASSWORD") ?: "testpass1", deviceId = "live-test"))
        val s = ViewerSession(http, scope)
        s.connect(result)
        val caps = eventually(what = "capabilities") { s.capabilities.value.takeIf { "GetTexture" in it } }
        delay(8000)
        val objs = s.scene.snapshot().filter { !it.isAvatar }
        println("LIVE scene: ${objs.size} objects")
        val failures = ArrayList<String>()
        val texIds = LinkedHashSet<java.util.UUID>()
        for (o in objs) {
            val kind = o.sculpt?.kind
            val te = o.textures
            te?.let { t -> texIds += t.default.textureId; for (i in 0 until 8) texIds += t.face(i).textureId }
            val geo = try {
                if (o.sculpt == null) PrimVolume.build(o.params).let { "${it.faces.size} faces, ${it.faces.sumOf { f -> f.indices.size / 3 }} tris" } else "sculpt/mesh $kind ${o.sculpt!!.assetId}"
            } catch (e: Exception) { failures += "${o.localId}: ${e.message}"; "FAILED ${e.message}" }
            println("LIVE  #${o.localId} pcode=${o.pcode} pos=${o.position} scale=${o.scale} parent=${o.parentId} text='${o.text}' particles=${o.particles != null} -> $geo")
        }
        val textures = TextureFetcher(http, scope, { caps["GetTexture"] })
        val wanted = texIds.filter { it != app.linkpoint.core.scene.FaceAppearance.BLANK_ID && it != app.linkpoint.core.scene.FaceAppearance.NULL_ID }
        wanted.forEach { textures.request(it) }
        delay(8000)
        for (id in wanted) println("LIVE  texture $id -> ${textures.peek(id)?.let { "${it.width}x${it.height}, ${it.levels.size} mips" } ?: "NOT LOADED"}")
        val meshes = MeshFetcher(http, scope, { caps["GetMesh2"] ?: caps["GetMesh"] })
        val sculpts = SculptFetcher(http, scope, { caps["GetTexture"] })
        for (o in objs) { val sc = o.sculpt ?: continue; if (sc.kind == SculptKind.MESH) meshes.request(sc.assetId) else sculpts.request(sc.assetId) }
        delay(8000)
        for (o in objs) {
            val sc = o.sculpt ?: continue
            if (sc.kind == SculptKind.MESH) println("LIVE  mesh ${sc.assetId} -> ${meshes.peek(sc.assetId)?.let { m -> "${m.faces.size} faces, ${m.faces.sumOf { f -> f.indices.size / 3 }} tris" } ?: "NOT LOADED"}")
            else println("LIVE  sculpt ${sc.assetId} -> ${sculpts.peek(sc.assetId)?.let { img -> "${Sculpt.build(img, sc.type).vertexCount} verts" } ?: "NOT LOADED"}")
        }
        s.logout(); scope.cancel()
        assertTrue("geometry failures: $failures", failures.isEmpty())
    }
}
