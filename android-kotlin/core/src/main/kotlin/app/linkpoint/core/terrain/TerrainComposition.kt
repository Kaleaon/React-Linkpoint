package app.linkpoint.core.terrain

import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * Terrain texturing the way the official viewer does it (LLVLComposition::generateHeights): each
 * texel gets a composition value 0..3 from its height plus Perlin noise, measured against start
 * heights and ranges interpolated between the region's four corners. The value blends the four
 * detail textures (0 = lowest, usually dirt, 3 = highest, usually rock). Port of terrain.ts.
 */
object TerrainComposition {
    private val BASE = intArrayOf(
        151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23,
        190, 6, 148, 247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33, 88, 237, 149, 56, 87, 174, 20,
        125, 136, 171, 168, 68, 175, 74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133, 230, 220,
        105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169, 200, 196,
        135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255,
        82, 85, 212, 207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163, 70, 221,
        153, 101, 155, 167, 43, 172, 9, 129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218, 246, 97, 228,
        251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241, 81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106,
        157, 184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78,
        66, 215, 61, 156, 180,
    )
    private val PERM = BASE + BASE

    private fun fade(t: Double) = t * t * t * (t * (t * 6 - 15) + 10)
    private fun lerp(t: Double, a: Double, b: Double) = a + t * (b - a)
    private fun grad(hash: Int, x: Double, y: Double): Double {
        val h = hash and 7
        val u = if (h < 4) x else y
        val v = if (h < 4) y else x
        return (if (h and 1 == 0) u else -u) + (if (h and 2 == 0) v else -v)
    }

    /** 2D Perlin noise, deterministic, roughly in -1..1. */
    fun noise2(xIn: Double, yIn: Double): Double {
        val xi = floor(xIn).toInt() and 255; val yi = floor(yIn).toInt() and 255
        val x = xIn - floor(xIn); val y = yIn - floor(yIn)
        val u = fade(x); val v = fade(y)
        val a = PERM[xi] + yi; val b = PERM[xi + 1] + yi
        return lerp(v,
            lerp(u, grad(PERM[a], x, y), grad(PERM[b], x - 1, y)),
            lerp(u, grad(PERM[a + 1], x, y - 1), grad(PERM[b + 1], x - 1, y - 1)))
    }

    fun turbulence2(x: Double, y: Double, octaves: Int): Double {
        var t = 0.0; var f = 1.0
        repeat(octaves) { t += abs(noise2(x * f, y * f)) / f; f *= 2 }
        return t
    }

    /** Start heights and height ranges at the corners in RegionHandshake order 00, 01, 10, 11 (SW, SE, NW, NE). */
    class Params(val startHeights: FloatArray, val heightRanges: FloatArray, val originX: Double = 0.0, val originY: Double = 0.0)

    private fun bilinear(sw: Double, se: Double, nw: Double, ne: Double, fx: Double, fy: Double) = lerp(fy, lerp(fx, sw, se), lerp(fx, nw, ne))

    /** Composition value 0..3 for each height sample; row = y (south to north). */
    fun compose(heights: FloatArray, size: Int, p: Params): FloatArray {
        val out = FloatArray(size * size)
        val slopeSq = 1.5 * 1.5
        val xyScaleInv = 1.0 / 4.9215
        val magnitude = 2.0
        val s = p.startHeights.map { it.toDouble() }; val r = p.heightRanges.map { it.toDouble() }
        val scale = 256.0 / size
        for (j in 0 until size) for (i in 0 until size) {
            val fx = i.toDouble() / size; val fy = j.toDouble() / size
            val start = bilinear(s[0], s[1], s[2], s[3], fx, fy)
            val range = max(bilinear(r[0], r[1], r[2], r[3], fx, fy), 0.001)
            val x = (p.originX + i * scale) * xyScaleInv
            val y = (p.originY + j * scale) * xyScaleInv
            var twiddle = noise2(x * 0.2222222222, y * 0.2222222222) * 6.5
            twiddle += turbulence2(x, y, 2) * slopeSq
            twiddle *= magnitude
            val value = ((heights[j * size + i] + twiddle - start) * 4.0) / range
            out[j * size + i] = min(3.0, max(0.0, value)).toFloat()
        }
        return out
    }

    /** One byte per sample, R = value / 3, ready to upload as an 8-bit texture. */
    fun toBytes(values: FloatArray): ByteArray = ByteArray(values.size) { Math.round(values[it] / 3f * 255f).toByte() }

    /** Colours shown for a layer until its detail texture arrives (dirt, grass, mountain, rock). */
    val FALLBACK_COLORS = arrayOf(
        floatArrayOf(0.45f, 0.36f, 0.26f), floatArrayOf(0.33f, 0.45f, 0.22f), floatArrayOf(0.5f, 0.45f, 0.4f), floatArrayOf(0.58f, 0.56f, 0.54f),
    )

    const val DETAIL_TILE_METRES = 16f
}
