package app.linkpoint.core

import app.linkpoint.core.image.TextureFetcher
import app.linkpoint.core.login.Grid
import app.linkpoint.core.login.LoginClient
import app.linkpoint.core.login.LoginRequest
import app.linkpoint.core.mock.MockGrid
import app.linkpoint.core.model.ChatKind
import app.linkpoint.core.model.ConnectionState
import app.linkpoint.core.net.UrlConnectionHttp
import app.linkpoint.core.scene.*
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

/**
 * The whole viewer stack against a fake grid over real sockets: XML-RPC login, UDP circuit,
 * region handshake, terrain, objects, capabilities, texture / mesh / sculpt downloads and decoding.
 */
class MockGridTest {
    private suspend fun <T> eventually(timeoutMs: Long = 15_000, what: String, f: () -> T?): T {
        val end = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < end) { f()?.let { return it }; delay(25) }
        throw AssertionError("timed out waiting for $what")
    }

    @Test fun fullSessionAgainstTheMockGrid() = runBlocking {
        MockGrid().start().use { grid ->
            val http = UrlConnectionHttp()
            val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val result = LoginClient.login(http, LoginRequest(Grid("mock", "Mock", grid.loginUrl), "Mock Resident", "pw", deviceId = "t"))
            assertEquals(grid.agent.toString(), result.agentId)

            val s = ViewerSession(http, scope)
            s.connect(result)
            assertEquals(ConnectionState.CONNECTED, s.state.value)

            // Region, balance, chat, friends.
            val region = eventually(what = "region") { s.region.value?.takeIf { it.name == "Mock Isle" && it.terrain != null } }
            assertEquals(1000, region.gridX); assertEquals(1001, region.gridY); assertEquals(20f, region.waterHeight!!, 0f)
            eventually(what = "balance") { s.balance.value }.also { assertEquals(1234, it) }
            eventually(what = "welcome chat") { s.chat.value.firstOrNull { it.kind == ChatKind.LOCAL && it.text.startsWith("Welcome") } }
            eventually(what = "friend name") { s.friends.value.firstOrNull { it.name == "Friendly Pal" && it.online == true } }

            // Terrain arrives in full and matches the generating function.
            eventually(what = "terrain") { s.heightmap.takeIf { it.isComplete } }
            for ((x, y) in listOf(20 to 30, 128 to 128, 200 to 77, 255 to 255)) {
                val expected = MockGrid.height(x.toFloat(), y.toFloat())
                val actual = s.heightmap.at(x.toFloat(), y.toFloat())!!
                assertEquals("height at $x,$y", expected, actual, 1.0f)
            }

            // Objects: all spawned, the id-only one was requested, the orbiter moves.
            eventually(what = "objects") { if (s.scene.size >= 14) true else null }
            val first = eventually(what = "orbiter") { s.scene.get(20) }.position
            val moved = eventually(what = "orbiter to move") { s.scene.get(20)?.position?.takeIf { it != first } }
            assertTrue(first.x != moved.x || first.y != moved.y)
            assertNotNull(s.scene.get(1)!!.textures); assertEquals(0.9f, s.scene.get(1)!!.textures!!.face(0).color[0], 0.01f)
            assertEquals(MockGrid.TEX_CHECKER, s.scene.get(2)!!.textures!!.default.textureId)
            assertEquals(SculptKind.MESH, s.scene.get(6)!!.sculpt!!.kind)
            assertEquals(SculptKind.SCULPT, s.scene.get(7)!!.sculpt!!.kind)
            assertNotNull(s.scene.get(8)!!.particles)
            assertEquals(2, s.scene.snapshot().count { it.isAvatar })
            assertEquals("Mock sign", s.scene.get(30)!!.text)
            // The child of a linkset follows its root.
            val child = s.scene.get(10)!!
            val wt = s.scene.worldTransform(child)!!.first
            assertEquals(s.scene.get(9)!!.position.z + 1.6f, wt.z, 0.01f)
            assertTrue("the simulator was asked nothing it could not answer", grid.packetsReceived.contains(app.linkpoint.core.net.Msg.RequestMultipleObjects))

            // Every shape builds finite geometry.
            for (o in s.scene.snapshot().filter { !it.isAvatar && it.sculpt == null }) {
                val mesh = PrimVolume.build(o.params)
                assertTrue("object ${o.localId} has geometry", mesh.faces.isNotEmpty())
                assertTrue(mesh.faces.all { f -> f.positions.all { it.isFinite() } })
            }

            // Capabilities, then textures, a mesh and a sculpt map through the real fetchers.
            val caps = eventually(what = "capabilities") { s.capabilities.value.takeIf { "GetTexture" in it && "GetMesh2" in it } }
            val textures = TextureFetcher(http, scope, { caps["GetTexture"] })
            textures.request(MockGrid.TEX_CHECKER)
            for (id in MockGrid.TERRAIN_DETAIL) textures.request(id)
            val checker = eventually(what = "checker texture") { textures.peek(MockGrid.TEX_CHECKER) }
            assertEquals(128, checker.width); assertEquals(8, checker.levels.size) // 128 .. 1
            eventually(what = "terrain textures") { if (MockGrid.TERRAIN_DETAIL.all { textures.peek(it) != null }) true else null }

            val meshes = MeshFetcher(http, scope, { caps["GetMesh2"] })
            meshes.request(MockGrid.MESH_PYRAMID)
            val mesh = eventually(what = "mesh") { meshes.peek(MockGrid.MESH_PYRAMID) }
            assertEquals(1, mesh.faces.size); assertEquals(18, mesh.faces[0].indices.size)

            val sculpts = SculptFetcher(http, scope, { caps["GetTexture"] })
            sculpts.request(MockGrid.TEX_SCULPT)
            val image = eventually(what = "sculpt map") { sculpts.peek(MockGrid.TEX_SCULPT) }
            val face = Sculpt.build(image, 1)
            assertEquals(32 * 32, face.vertexCount)

            // Chat out and in.
            s.sendChat("hello mock")
            eventually(what = "echo") { s.chat.value.firstOrNull { it.text == "you said: hello mock" } }
            assertTrue(grid.chatReceived.contains("hello mock"))

            // Event-queue events: groups and parcel.
            val groups = eventually(what = "groups") { s.groups.value.takeIf { it.size == 2 } }
            assertEquals(listOf("Alpha Club", "Mock Builders"), groups.map { it.name })
            val parcel = eventually(what = "parcel") { s.parcel.value }
            assertEquals("Mock Parcel", parcel.name); assertEquals(4096, parcel.areaSqm); assertEquals(468, parcel.maxPrims); assertEquals(grid.agent, parcel.ownerId)

            // Environment: the grid's day cycle replaces the estimated sky.
            val env = eventually(what = "region environment") { s.environment.value.takeIf { !it.estimated } }
            val sample = env.sample(1000.0)
            assertFalse(sample.estimated); assertTrue(sample.state.sunUp)
            assertEquals(0.05, sample.water.fogColor[0], 1e-9)

            // Inventory: skeleton from login, contents fetched on demand.
            val inv = s.inventory.value
            assertEquals(MockGrid.INV_ROOT, inv.rootId); assertEquals(5, inv.folders.size)
            assertEquals(listOf("Calling Cards", "Notecards", "Objects", "Textures"), inv.children(MockGrid.INV_ROOT).map { it.name })
            s.fetchInventoryFolder(MockGrid.INV_TEXTURES)
            val items = s.inventory.value.items[MockGrid.INV_TEXTURES]!!
            assertEquals(listOf("Checker board", "Grass"), items.map { it.name }); assertEquals(0, items[0].assetType)
            assertTrue(MockGrid.INV_TEXTURES in s.inventory.value.loaded)

            // Profile.
            val profile = s.requestProfile(grid.agent)!!
            assertTrue(profile.about.contains("mock regions")); assertEquals("2009-03-04", profile.bornOn)

            // Offers: a teleport lure and a friendship offer, answered.
            s.sendChat("give offers")
            val offers = eventually(what = "offers") { s.offers.value.takeIf { it.size == 2 } }
            val lure = offers.filterIsInstance<app.linkpoint.core.model.PendingOffer.Lure>().single()
            val friend = offers.filterIsInstance<app.linkpoint.core.model.PendingOffer.Friend>().single()
            assertEquals(MockGrid.LURE_ID, lure.id); assertEquals("Visiting Avatar", lure.fromName)
            s.acceptOffer(lure); s.declineOffer(friend)
            eventually(what = "lure acceptance reaching the grid") { grid.lureAccepted.firstOrNull() }.also { assertEquals(MockGrid.LURE_ID, it) }
            eventually(what = "friend decline reaching the grid") { grid.friendshipDeclined.firstOrNull() }.also { assertEquals(MockGrid.FRIEND_OFFER_ID, it) }
            assertTrue(s.offers.value.isEmpty())

            s.logout()
            assertEquals(ConnectionState.DISCONNECTED, s.state.value)
            scope.cancel()
        }
    }
}
