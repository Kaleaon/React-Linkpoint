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

    /**
     * Big real-world content (e.g. a downloaded OAR with thousands of objects): summarise instead of listing.
     * Samples up to MESHES / TEXTURES / SCULPTS distinct assets (env vars, defaults 300 / 200 / 60).
     */
    @Test fun realWorldContentSummary() = runBlocking {
        val url = System.getenv("OPENSIM_LOGIN_URL"); assumeTrue("OPENSIM_LOGIN_URL not set", !url.isNullOrBlank())
        assumeTrue("OPENSIM_BIG not set", System.getenv("OPENSIM_BIG") != null)
        fun lim(n: String, d: Int) = System.getenv(n)?.toIntOrNull() ?: d
        val http = UrlConnectionHttp()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val result = LoginClient.login(http, LoginRequest(Grid("opensim-local", "Local OpenSim", url!!), System.getenv("OPENSIM_USER") ?: "Linky Tester", System.getenv("OPENSIM_PASSWORD") ?: "testpass1", deviceId = "live-test"))
        val s = ViewerSession(http, scope)
        s.connect(result)
        val caps = eventually(what = "capabilities") { s.capabilities.value.takeIf { "GetTexture" in it } }
        // Wait for the object stream to settle.
        var last = -1; var stable = 0; val t0 = System.currentTimeMillis()
        while (stable < 6 && System.currentTimeMillis() - t0 < 120_000) { delay(1000); val n = s.scene.size; if (n == last) stable++ else { stable = 0; last = n } }
        val objs = s.scene.snapshot().filter { !it.isAvatar }
        println("LIVE streamed ${objs.size} objects in ${(System.currentTimeMillis() - t0) / 1000}s; root=${objs.count { it.parentId == 0L }} child=${objs.count { it.parentId != 0L }}")
        println("LIVE kinds: plain=${objs.count { it.sculpt == null }} mesh=${objs.count { it.sculpt?.kind == SculptKind.MESH }} sculpt=${objs.count { it.sculpt?.kind == SculptKind.SCULPT }} particles=${objs.count { it.particles != null }} text=${objs.count { !it.text.isNullOrEmpty() }} withTextures=${objs.count { it.textures != null }}")

        val geoFail = ArrayList<String>(); var tris = 0L; val g0 = System.nanoTime()
        for (o in objs.filter { it.sculpt == null }) try { tris += PrimVolume.build(o.params).faces.sumOf { it.indices.size / 3 } } catch (e: Exception) { geoFail += "${o.localId}: $e" }
        println("LIVE prim geometry: ${objs.count { it.sculpt == null } - geoFail.size} ok, ${geoFail.size} failed, $tris triangles, ${(System.nanoTime() - g0) / 1_000_000} ms; ${geoFail.take(3)}")

        // OARs often omit assets they reference; OPENSIM_ASSET_IDS (one id per line) restricts requests to ones the archive holds.
        val present = System.getenv("OPENSIM_ASSET_IDS")?.let { f -> java.io.File(f).readLines().map { it.trim() }.toHashSet() }
        fun java.util.UUID.held() = present == null || toString() in present
        val allMeshRefs = objs.mapNotNull { it.sculpt?.takeIf { sc -> sc.kind == SculptKind.MESH }?.assetId }.distinct()
        println("LIVE distinct mesh refs=${allMeshRefs.size}, held by archive=${allMeshRefs.count { it.held() }}")
        val meshIds = allMeshRefs.filter { it.held() }.take(lim("MESHES", 300))
        val sculptIds = objs.mapNotNull { it.sculpt?.takeIf { sc -> sc.kind == SculptKind.SCULPT }?.assetId }.distinct().filter { it.held() }.take(lim("SCULPTS", 60))
        val texIds = LinkedHashSet<java.util.UUID>()
        for (o in objs) o.textures?.let { t -> texIds += t.default.textureId; for (i in 0 until 8) texIds += t.face(i).textureId }

        println("LIVE distinct texture refs=${texIds.size}, held by archive=${texIds.count { it.held() }}")
        val texList = texIds.filter { it != FaceAppearance.BLANK_ID && it != FaceAppearance.NULL_ID && it.held() }.take(lim("TEXTURES", 200))
        val meshes = MeshFetcher(http, scope, { caps["GetMesh2"] ?: caps["GetMesh"] }); val sculpts = SculptFetcher(http, scope, { caps["GetTexture"] }); val textures = TextureFetcher(http, scope, { caps["GetTexture"] })
        meshIds.forEach { meshes.request(it) }; sculptIds.forEach { sculpts.request(it) }; texList.forEach { textures.request(it) }
        fun done() = meshIds.all { meshes.peek(it) != null || meshes.failure(it) != null } && sculptIds.all { sculpts.peek(it) != null || sculpts.failure(it) != null } && texList.all { textures.peek(it) != null || textures.failure(it) != null }
        val a0 = System.currentTimeMillis()
        while (!done() && System.currentTimeMillis() - a0 < 300_000) delay(500)
        println("LIVE assets waited ${(System.currentTimeMillis() - a0) / 1000}s, finished=${done()}")
        val mOk = meshIds.count { meshes.peek(it) != null }; val mFail = meshIds.mapNotNull { meshes.failure(it)?.toString() }
        println("LIVE meshes: requested ${meshIds.size}, decoded $mOk, failed ${mFail.size}, pending ${meshIds.size - mOk - mFail.size}; triangles=${meshIds.sumOf { meshes.peek(it)?.faces?.sumOf { f -> f.indices.size / 3 } ?: 0 }}; failures: ${mFail.groupingBy { it.take(90) }.eachCount().entries.take(5)}")
        println("LIVE failing mesh ids: ${meshIds.filter { meshes.failure(it) != null }}")
        println("LIVE failing texture ids: ${texList.filter { textures.failure(it) != null }}")
        val tOk = texList.count { textures.peek(it) != null }; val tFail = texList.mapNotNull { textures.failure(it)?.toString() }
        println("LIVE textures: requested ${texList.size}, decoded $tOk, failed ${tFail.size}; sizes=${texList.mapNotNull { textures.peek(it) }.groupingBy { "${it.width}x${it.height}" }.eachCount().entries.sortedByDescending { it.value }.take(6)}; failures: ${tFail.groupingBy { it.take(90) }.eachCount().entries.take(5)}")
        val sOk = sculptIds.count { sculpts.peek(it) != null }; val sFail = sculptIds.mapNotNull { sculpts.failure(it)?.toString() }
        println("LIVE sculpt maps: requested ${sculptIds.size}, decoded $sOk, failed ${sFail.size}; failures: ${sFail.groupingBy { it.take(90) }.eachCount().entries.take(5)}")
        s.logout(); scope.cancel()
        assertTrue("geometry failures: ${geoFail.take(5)}", geoFail.isEmpty())
    }
}
