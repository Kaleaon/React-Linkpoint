package app.linkpoint.core.terrain

import kotlin.math.PI
import kotlin.math.cos

/** One decoded 16x16 patch of heights, in metres. [x] and [y] index the 16x16 grid of patches in the region. */
class TerrainPatch(val x: Int, val y: Int, val heights: FloatArray)

/**
 * Decodes the simulator's LayerData terrain compression: a per-patch header, a run-length coded
 * block of quantised DCT coefficients in zig-zag order, dequantisation and a 16x16 inverse DCT.
 * Ported from the layout used by the open-source libopenmetaverse decoder.
 */
object TerrainDecoder {
    const val LAYER_LAND = 0x4C
    const val PATCH_SIZE = 16
    const val PATCHES_PER_EDGE = 16
    private const val END_OF_PATCHES = 97
    private const val OO_SQRT2 = 0.7071067811865475f

    private val dequantize = FloatArray(256) { 1f + 2f * ((it % 16) + (it / 16)) }
    private val cosines = FloatArray(256).also { t ->
        val h = (PI.toFloat() * 0.5f / 16f)
        for (u in 0 until 16) for (n in 0 until 16) t[u * 16 + n] = cos((2f * n + 1f) * u * h)
    }
    /** Zig-zag order: copyMatrix[row * 16 + col] is the index in the coded stream. */
    val copyMatrix = IntArray(256).also { m ->
        var diag = false; var right = true; var i = 0; var j = 0; var count = 0
        while (i < 16 && j < 16) {
            m[j * 16 + i] = count++
            if (!diag) {
                if (right) { if (i < 15) i++ else j++; right = false; diag = true }
                else { if (j < 15) j++ else i++; right = true; diag = true }
            } else {
                if (right) { i++; j--; if (i == 15 || j == 0) diag = false }
                else { i--; j++; if (j == 15 || i == 0) diag = false }
            }
        }
    }

    class Group(val type: Int, val patchSize: Int, val patches: List<TerrainPatch>)

    /** Decode a LayerData payload. Returns patches decoded before any damage; malformed data throws IllegalArgumentException. */
    fun decode(data: ByteArray): Group {
        val r = BitReader(data)
        r.int(16) // stride
        val patchSize = r.int(8)
        val type = r.int(8)
        require(patchSize == PATCH_SIZE) { "Unsupported terrain patch size $patchSize" }
        val patches = ArrayList<TerrainPatch>()
        if (type != LAYER_LAND) return Group(type, patchSize, patches)
        val coeffs = IntArray(256)
        while (true) {
            val quantWBits = r.int(8)
            if (quantWBits == END_OF_PATCHES) break
            val dcOffset = r.float()
            val range = r.int(16)
            val patchIds = r.int(10)
            val wordBits = (quantWBits and 0x0F) + 2
            val px = patchIds shr 5; val py = patchIds and 0x1F
            require(px < PATCHES_PER_EDGE && py < PATCHES_PER_EDGE) { "Terrain patch $px,$py is outside the region" }
            decodeCoefficients(r, coeffs, wordBits)
            patches += TerrainPatch(px, py, reconstruct(coeffs, quantWBits, range, dcOffset))
        }
        return Group(type, patchSize, patches)
    }

    private fun decodeCoefficients(r: BitReader, out: IntArray, wordBits: Int) {
        var n = 0
        while (n < 256) {
            if (r.int(1) == 0) { out[n++] = 0; continue }          // 0: a zero
            if (r.int(1) == 0) { while (n < 256) out[n++] = 0; return } // 10: end of block
            val negative = r.int(1) != 0                              // 11x: a value
            val v = r.int(wordBits)
            out[n++] = if (negative) -v else v
        }
    }

    private fun reconstruct(coeffs: IntArray, quantWBits: Int, range: Int, dcOffset: Float): FloatArray {
        val prequant = (quantWBits shr 4) + 2
        val quantize = 1 shl prequant
        val mult = (1f / quantize) * range
        val addval = mult * (1 shl (prequant - 1)) + dcOffset

        val block = FloatArray(256) { coeffs[copyMatrix[it]] * dequantize[it] }
        val tmp = FloatArray(256)
        for (c in 0 until 16) {
            for (n in 0 until 16) {
                var total = OO_SQRT2 * block[c]
                for (u in 1 until 16) total += block[u * 16 + c] * cosines[u * 16 + n]
                tmp[16 * n + c] = total
            }
        }
        val oosob = 2f / 16f
        for (line in 0 until 16) {
            val ls = line * 16
            for (n in 0 until 16) {
                var total = OO_SQRT2 * tmp[ls]
                for (u in 1 until 16) total += tmp[ls + u] * cosines[u * 16 + n]
                block[ls + n] = total * oosob
            }
        }
        return FloatArray(256) { block[it] * mult + addval }
    }
}

/** The 256 x 256 height samples of a region, filled in patch by patch as LayerData arrives. */
class Heightmap {
    val heights = FloatArray(SIZE * SIZE)
    private val have = BooleanArray(16 * 16)
    @Volatile var version = 0; private set
    val patchCount: Int get() = have.count { it }
    val isComplete: Boolean get() = have.all { it }

    @Synchronized fun put(p: TerrainPatch) {
        for (j in 0 until 16) for (i in 0 until 16) heights[(p.y * 16 + j) * SIZE + (p.x * 16 + i)] = p.heights[j * 16 + i]
        have[p.y * 16 + p.x] = true
        version++
    }

    @Synchronized fun clear() { heights.fill(0f); have.fill(false); version++ }
    fun has(px: Int, py: Int) = have[py * 16 + px]

    /** Height at a region position, or null if that patch has not arrived. */
    fun at(x: Float, y: Float): Float? {
        val ix = x.toInt().coerceIn(0, SIZE - 1); val iy = y.toInt().coerceIn(0, SIZE - 1)
        return if (have[(iy / 16) * 16 + ix / 16]) heights[iy * SIZE + ix] else null
    }

    companion object { const val SIZE = 256 }
}
