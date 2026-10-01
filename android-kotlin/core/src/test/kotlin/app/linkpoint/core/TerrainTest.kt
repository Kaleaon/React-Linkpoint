package app.linkpoint.core

import app.linkpoint.core.terrain.*
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import org.junit.Assert.*
import org.junit.Test

/** Encoder half of the terrain codec, ported from the reference implementation, to build fixtures. */
private object TerrainEncoder {
    private val quantize = FloatArray(256) { 1f / (1f + 2f * ((it % 16) + (it / 16))) }
    private val cosines = FloatArray(256).also { t -> val h = (PI.toFloat() * 0.5f / 16f); for (u in 0 until 16) for (n in 0 until 16) t[u * 16 + n] = cos((2f * n + 1f) * u * h) }
    private const val OO_SQRT2 = 0.7071067811865475f

    fun layer(patches: List<Triple<Int, Int, FloatArray>>): ByteArray {
        val w = BitWriter()
        w.bits(264, 16); w.bits(16, 8); w.bits(TerrainDecoder.LAYER_LAND, 8)
        for ((x, y, data) in patches) patch(w, data, x, y)
        w.bits(97, 8)
        return w.toByteArray()
    }

    private fun patch(w: BitWriter, data: FloatArray, x: Int, y: Int) {
        val zmin = data.min(); val zmax = data.max()
        val dc = zmin; val range = ((zmax - zmin) + 1f).toInt()
        val prequant = 10
        val premult = (1f / range) * (1 shl prequant)
        val sub = (1 shl (prequant - 1)).toFloat() + dc * premult
        var quantWBits = 136 // header default: wordsize bits and prequant 10
        val block = FloatArray(256) { data[it] * premult - sub }
        val ftemp = FloatArray(256)
        for (line in 0 until 16) {
            val ls = line * 16
            var total = 0f
            for (n in 0 until 16) total += block[ls + n]
            ftemp[ls] = OO_SQRT2 * total
            for (u in 1 until 16) { total = 0f; for (n in 0 until 16) total += block[ls + n] * cosines[u * 16 + n]; ftemp[ls + u] = total }
        }
        val itemp = IntArray(256)
        val oosob = 2f / 16f
        for (col in 0 until 16) {
            var total = 0f
            for (n in 0 until 16) total += ftemp[16 * n + col]
            itemp[TerrainDecoder.copyMatrix[col]] = (OO_SQRT2 * total * oosob * quantize[col]).toInt()
            for (u in 1 until 16) {
                total = 0f
                for (n in 0 until 16) total += ftemp[16 * n + col] * cosines[u * 16 + n]
                itemp[TerrainDecoder.copyMatrix[16 * u + col]] = (total * oosob * quantize[16 * u + col]).toInt()
            }
        }
        // Header: word bits wide enough for the largest coefficient.
        var wbits = 2
        for (v in itemp) { var t = abs(v); var b = 0; while (t > 0) { b++; t = t shr 1 }; if (b + 1 > wbits) wbits = b + 1 }
        quantWBits = (quantWBits and 0xF0) or (wbits - 2)
        w.bits(quantWBits, 8); w.float(dc); w.bits(range, 16); w.bits((y and 0x1F) + (x shl 5), 10)
        // Coefficients: zero = 0, end of block = 10, value = 11s + wbits.
        for (i in 0 until 256) {
            val t = itemp[i]
            if (t == 0) {
                if ((i until 256).all { itemp[it] == 0 }) { w.bits(2, 2).let { }; return }
                w.bits(0, 1)
            } else {
                // Packed as bits 1,1,sign then the magnitude, written MSB first as the reference does with PackBits(6|7, 3).
                w.bits(if (t < 0) 7 else 6, 3)
                w.bits(abs(t), wbits)
            }
        }
    }
}

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
