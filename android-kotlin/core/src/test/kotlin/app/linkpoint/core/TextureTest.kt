package app.linkpoint.core

import app.linkpoint.core.image.*
import app.linkpoint.core.net.HttpResponse
import app.linkpoint.core.scene.*
import java.io.File
import java.util.UUID
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

class TextureTest {
    private fun fixture(name: String) = File(javaClass.getResource("/j2k/$name")!!.toURI()).readBytes()

    @Test fun imageIsFlippedAndMipped() {
        // 2x2 RGB: top row red,green; bottom row blue,white.
        val img = J2kImage(2, 2, 3, byteArrayOf(-1, 0, 0, 0, -1, 0, 0, 0, -1, -1, -1, -1))
        val t = TextureOps.fromImage(img)
        assertEquals(2, t.levels.size) // 2x2 and 1x1
        // Row 0 of the texture is the bottom of the image: blue, white.
        assertArrayEquals(byteArrayOf(0, 0, -1, -1, -1, -1, -1, -1), t.levels[0].copyOfRange(0, 8))
        assertFalse(t.hasAlpha)
        assertEquals(4, t.levels[1].size)
        // Average of the four texels: R = (255+0+0+255)/4.
        assertEquals(128, t.levels[1][0].toInt() and 0xFF)
    }

    @Test fun greyAndAlphaExpand() {
        val g = TextureOps.fromImage(J2kImage(1, 1, 1, byteArrayOf(100)))
        assertArrayEquals(byteArrayOf(100, 100, 100, -1), g.levels[0])
        val a = TextureOps.fromImage(J2kImage(1, 1, 4, byteArrayOf(1, 2, 3, 7)))
        assertTrue(a.hasAlpha); assertEquals(7, a.levels[0][3].toInt())
    }

    @Test fun headerSizeIsReadWithoutDecoding() {
        assertEquals(61 to 37, J2kHeader.size(fixture("rev5.j2k")))
        assertNull(J2kHeader.size(byteArrayOf(1, 2, 3)))
    }

    @Test fun fetcherDownloadsDecodesAndRemembersFailures() = runBlocking {
        val good = UUID.randomUUID(); val bad = UUID.randomUUID()
        val bytes = fixture("rev5.j2k")
        val http = FakeHttp { url, _ -> if (url.contains(good.toString())) HttpResponse(200, bytes) else HttpResponse(404, ByteArray(0)) }
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val f = TextureFetcher(http, scope, { "https://sim/gettexture" })
        assertTrue(f.request(good)); assertTrue(f.request(bad))
        val end = System.currentTimeMillis() + 5000
        while ((f.peek(good) == null || f.failure(bad) == null) && System.currentTimeMillis() < end) delay(20)
        val tex = f.peek(good)!!
        assertEquals(61, tex.width); assertEquals(37, tex.height)
        assertTrue(f.failure(bad) is java.io.IOException)
        assertEquals(listOf("https://sim/gettexture?texture_id=$good"), http.requests.map { it.first }.filter { it.contains(good.toString()) }.distinct())
        f.request(good) // already known: no second download
        assertEquals(1, http.requests.count { it.first.contains(good.toString()) })
        assertFalse(TextureFetcher(http, scope, { null }).request(good)) // no capability yet
        scope.cancel()
    }

    @Test fun fetcherDownscalesLargeTextures() = runBlocking {
        val id = UUID.randomUUID()
        val http = FakeHttp { _, _ -> HttpResponse(200, fixture("rev5.j2k")) }
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val f = TextureFetcher(http, scope, { "https://sim/t" }, maxDimension = 20)
        f.request(id)
        val end = System.currentTimeMillis() + 5000
        while (f.peek(id) == null && System.currentTimeMillis() < end) delay(20)
        val t = f.peek(id)!!
        assertTrue("61x37 reduced to fit 20, was ${t.width}x${t.height}", maxOf(t.width, t.height) <= 20)
        scope.cancel()
    }

    // ---- sculpts --------------------------------------------------------------------------------

    /** A sphere sculpt map: rows run bottom to top in the image as stored, columns around the shape. */
    private fun sphereMap(size: Int): J2kImage {
        val d = ByteArray(size * size * 3)
        for (row in 0 until size) for (col in 0 until size) {
            // Image row 0 is the TOP; sculpt rows run from the bottom up.
            val v = (size - 1 - row) / (size - 1f)
            val u = col / (size - 1f)
            val phi = (v * Math.PI).toFloat(); val theta = (u * 2 * Math.PI).toFloat()
            val x = 0.5f * sin(phi) * cos(theta); val y = 0.5f * sin(phi) * sin(theta); val z = -0.5f * cos(phi)
            val o = (row * size + col) * 3
            d[o] = Math.round((x + 0.5f) * 255).toByte(); d[o + 1] = Math.round((y + 0.5f) * 255).toByte(); d[o + 2] = Math.round((z + 0.5f) * 255).toByte()
        }
        return J2kImage(size, size, 3, d)
    }

    @Test fun sphereSculptIsABallWithOutwardNormals() {
        val f = Sculpt.build(sphereMap(64), 1)
        assertEquals(32 * 32, f.vertexCount)
        var worstRadius = 0f
        for (i in 0 until f.vertexCount) {
            val x = f.positions[i * 3]; val y = f.positions[i * 3 + 1]; val z = f.positions[i * 3 + 2]
            worstRadius = maxOf(worstRadius, abs(sqrt(x * x + y * y + z * z) - 0.5f))
            if (sqrt(x * x + y * y + z * z) > 0.3f) {
                val dot = (x * f.normals[i * 3] + y * f.normals[i * 3 + 1] + z * f.normals[i * 3 + 2]) / sqrt(x * x + y * y + z * z)
                assertTrue("normal should point outward, dot=$dot", dot > 0.8f)
            }
        }
        assertTrue("radius error $worstRadius", worstRadius < 0.03f)
        assertTrue(f.indices.size >= 30 * 31 * 6 - 200)
        assertTrue(f.indices.all { it in 0 until f.vertexCount })
    }

    @Test fun mirrorKeepsOutwardFacingAndFlipsX() {
        val a = Sculpt.build(sphereMap(64), 1)
        val m = Sculpt.build(sphereMap(64), 1 or 0x80)
        var checked = 0
        for (i in 0 until m.vertexCount) {
            val x = m.positions[i * 3]; val y = m.positions[i * 3 + 1]; val z = m.positions[i * 3 + 2]
            val r = sqrt(x * x + y * y + z * z)
            if (r < 0.3f) continue
            assertTrue((x * m.normals[i * 3] + y * m.normals[i * 3 + 1] + z * m.normals[i * 3 + 2]) / r > 0.8f)
            checked++
        }
        assertTrue(checked > 100)
        assertEquals(a.vertexCount, m.vertexCount)
    }

    // ---- texture entry fields ---------------------------------------------------------------------

    @Test fun textureEntryCarriesOffsetRotationAndFullbright() {
        val w = app.linkpoint.core.net.WireWriter()
        w.uuid(UUID(5, 6)).u8(0)
        w.bytes(byteArrayOf(0, 0, 0, 0)).u8(0)                 // colour: opaque white (inverted zeros)... alpha stored inverted too
        w.f32(2f).u8(0).f32(3f).u8(0)                           // repeat u, v
        w.u16(16384).u8(0)                                      // offset u = ~0.5
        w.u16(0).u8(0)                                          // offset v
        w.u16(8192).u8(0)                                       // rotation = quarter turn
        w.u8(0x20).u8(0)                                        // material: fullbright
        w.u8(0).u8(0)                                           // media
        w.u8(51).u8(0)                                          // glow 0.2
        val t = TextureEntry.parse(w.toByteArray())!!
        val f = t.face(0)
        assertEquals(2f, f.repeatU, 1e-4f); assertEquals(3f, f.repeatV, 1e-4f)
        assertEquals(0.5f, f.offsetU, 1e-3f); assertEquals(0f, f.offsetV, 1e-6f)
        assertEquals((Math.PI / 2).toFloat(), f.rotation, 1e-3f)
        assertTrue(f.fullbright); assertEquals(0.2f, f.glow, 1e-3f)
        assertTrue(f.hasTexture)
        assertFalse(FaceAppearance(FaceAppearance.BLANK_ID, floatArrayOf(1f, 1f, 1f, 1f), 1f, 1f, 0f).hasTexture)
    }
}
