package app.linkpoint.core

import app.linkpoint.core.mock.TerrainEncoder
import app.linkpoint.core.terrain.*
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import org.junit.Assert.*
import org.junit.Test

class TerrainTest {
    @Test fun bitOrderMatchesTheReference() {
        val w = BitWriter()
        w.bits(0x2A5, 10); w.bits(1, 1); w.bits(0xABCD, 16); w.float(123.5f)
        val r = BitReader(w.toByteArray())
        assertEquals(0x2A5, r.int(10)); assertEquals(1, r.int(1)); assertEquals(0xABCD, r.int(16)); assertEquals(123.5f, r.float(), 0f)
        // First 8 stream bits are the low byte of a wide value.
        assertEquals(0xCD, BitReader(byteArrayOf(0xCD.toByte(), 0xAB.toByte())).int(8))
        assertEquals(0xABCD, BitReader(byteArrayOf(0xCD.toByte(), 0xAB.toByte())).int(16))
    }

    @Test fun copyMatrixIsAPermutationStartingAtTheCorner() {
        val m = TerrainDecoder.copyMatrix
        assertEquals((0 until 256).toList(), m.sorted())
        assertEquals(0, m[0]); assertEquals(1, m[1]); assertEquals(2, m[16])
    }

    private fun surface(x0: Int, y0: Int) = FloatArray(256) { i ->
        val x = x0 * 16 + i % 16; val y = y0 * 16 + i / 16
        20f + 0.15f * x + 8f * kotlin.math.sin(y / 17.0).toFloat()
    }

    @Test fun roundTripReconstructsHeightsWithinQuantisation() {
        val src = listOf(Triple(0, 0, surface(0, 0)), Triple(3, 5, surface(3, 5)), Triple(15, 15, surface(15, 15)))
        val g = TerrainDecoder.decode(TerrainEncoder.layer(src))
        assertEquals(3, g.patches.size)
        for ((p, s) in g.patches.zip(src)) {
            assertEquals(s.first, p.x); assertEquals(s.second, p.y)
            val range = (s.third.max() - s.third.min()) + 1f
            val tolerance = range / 1024f * 40f // coarse: quantisation of the DCT coefficients
            var worst = 0f
            for (i in 0 until 256) worst = maxOf(worst, abs(p.heights[i] - s.third[i]))
            assertTrue("patch ${p.x},${p.y} worst error $worst over tolerance $tolerance", worst <= maxOf(tolerance, 0.5f))
        }
    }

    @Test fun flatPatchRoundTripsExactlyEnough() {
        val flat = FloatArray(256) { 21.5f }
        val g = TerrainDecoder.decode(TerrainEncoder.layer(listOf(Triple(7, 2, flat))))
        for (h in g.patches[0].heights) assertEquals(21.5f, h, 0.05f)
    }

    @Test fun nonLandLayersAndBadDataAreHandled() {
        val w = BitWriter(); w.bits(264, 16); w.bits(16, 8); w.bits(0x57, 8); w.bits(97, 8)
        assertTrue(TerrainDecoder.decode(w.toByteArray()).patches.isEmpty())
        assertThrows(IllegalArgumentException::class.java) { TerrainDecoder.decode(byteArrayOf(1, 2)) }
        val w2 = BitWriter(); w2.bits(264, 16); w2.bits(32, 8); w2.bits(0x4C, 8)
        assertThrows(IllegalArgumentException::class.java) { TerrainDecoder.decode(w2.toByteArray()) }
    }

    @Test fun heightmapAssemblesPatches() {
        val h = Heightmap()
        assertNull(h.at(5f, 5f))
        val g = TerrainDecoder.decode(TerrainEncoder.layer(listOf(Triple(1, 1, FloatArray(256) { 30f }))))
        g.patches.forEach(h::put)
        assertEquals(30f, h.at(20f, 20f)!!, 0.1f)
        assertNull(h.at(5f, 5f))
        assertEquals(1, h.patchCount)
    }

    @Test fun compositionRisesWithHeight() {
        val low = FloatArray(256 * 256) { 5f }; val high = FloatArray(256 * 256) { 60f }
        val p = TerrainComposition.Params(floatArrayOf(10f, 10f, 10f, 10f), floatArrayOf(40f, 40f, 40f, 40f))
        val lowV = TerrainComposition.compose(low, 256, p).average(); val highV = TerrainComposition.compose(high, 256, p).average()
        assertTrue(lowV < 1.0 && highV > 2.0)
        assertTrue(TerrainComposition.compose(high, 256, p).all { it in 0f..3f })
        val b = TerrainComposition.toBytes(floatArrayOf(0f, 1.5f, 3f))
        assertArrayEquals(byteArrayOf(0, Math.round(0.5f * 255f).toByte(), (-1).toByte()), b)
        assertEquals(0.0, TerrainComposition.noise2(3.0, 4.0), 1e-9) // lattice points are zero
    }
}
