package app.linkpoint.core.scene

import app.linkpoint.core.image.J2kImage
import kotlin.math.abs
import kotlin.math.sqrt

/**
 * Geometry from a sculpt map, following the official viewer (LLVolume::sculptGenerateMapVertices):
 * each texel's R, G, B is a point's X, Y, Z in -0.5..0.5, rows run from the bottom of the image
 * upward and columns run around the shape. Types: 1 sphere, 2 torus, 3 plane, 4 cylinder. 0x40
 * inverts the shape and 0x80 mirrors it across X. Port of decodeSculpt in core/sl-asset-decoder.cjs.
 */
object Sculpt {
    private const val GRID = 32

    /** [image] is top-row-first, as [J2kImage] delivers it. */
    fun build(image: J2kImage, sculptType: Int): MeshFace {
        val baseType = sculptType and 7
        val mirror = sculptType and 0x80 != 0
        val invert = sculptType and 0x40 != 0
        val reverse = if (invert) !mirror else mirror
        val w = image.width; val h = image.height; val ch = image.components
        val columns = maxOf(2, minOf(GRID, w)); val rows = maxOf(2, minOf(GRID, h))
        val n = columns * rows
        val pos = FloatArray(n * 3); val uv = FloatArray(n * 2)
        for (y in 0 until rows) {
            val imageRow = h - 1 - Math.round(y * (h - 1).toFloat() / (rows - 1))
            for (x in 0 until columns) {
                val col = Math.round((if (reverse) columns - 1 - x else x) * (w - 1).toFloat() / (columns - 1))
                val p = (imageRow * w + col) * ch
                fun s(k: Int) = (image.data[p + minOf(k, ch - 1)].toInt() and 0xFF) / 255f - 0.5f
                val v = y * columns + x
                pos[v * 3] = (if (mirror) -1f else 1f) * s(0); pos[v * 3 + 1] = s(1); pos[v * 3 + 2] = s(2)
                uv[v * 2] = x / (columns - 1f); uv[v * 2 + 1] = y / (rows - 1f)
            }
        }
        val wrapsX = baseType != 3
        val wrapsY = baseType == 2
        val seamX = wrapsX && samePosition(pos, columns, rows)
        val quadColumns = if (seamX) columns - 1 else if (wrapsX) columns else columns - 1
        val quadRows = if (wrapsY) rows else rows - 1
        val idx = ArrayList<Int>()
        for (y in 0 until quadRows) for (x in 0 until quadColumns) {
            val nx = (x + 1) % columns; val ny = (y + 1) % rows
            val a = y * columns + x; val b = y * columns + nx; val c = ny * columns + x; val d = ny * columns + nx
            idx += listOf(a, b, c, b, d, c)
        }
        val index = idx.toIntArray()
        val normals = computeNormals(pos, index)
        fun average(list: List<Int>) {
            val sum = FloatArray(3)
            for (v in list) for (k in 0..2) sum[k] += normals[v * 3 + k]
            val len = sqrt(sum[0] * sum[0] + sum[1] * sum[1] + sum[2] * sum[2])
            if (len < 1e-9f) return
            for (v in list) for (k in 0..2) normals[v * 3 + k] = sum[k] / len
        }
        if (seamX) for (y in 0 until rows) average(listOf(y * columns, y * columns + columns - 1))
        if (wrapsY) for (x in 0 until columns) average(listOf(x, (rows - 1) * columns + x))
        if (baseType == 1) for (row in listOf(0, rows - 1)) {
            val first = row * columns
            var spread = 0f
            for (k in 0..2) {
                var lo = Float.MAX_VALUE; var hi = -Float.MAX_VALUE
                for (x in 0 until columns) { val v = pos[(first + x) * 3 + k]; if (v < lo) lo = v; if (v > hi) hi = v }
                spread = maxOf(spread, hi - lo)
            }
            if (spread < 0.02f) average((0 until columns).map { first + it })
        }
        return MeshFace(0, pos, normals, uv, index)
    }

    private fun samePosition(pos: FloatArray, columns: Int, rows: Int): Boolean {
        for (y in 0 until rows) {
            val a = (y * columns) * 3; val b = (y * columns + columns - 1) * 3
            val dx = pos[a] - pos[b]; val dy = pos[a + 1] - pos[b + 1]; val dz = pos[a + 2] - pos[b + 2]
            if (sqrt(dx * dx + dy * dy + dz * dz) > 0.02f) return false
        }
        return true
    }

    private fun computeNormals(p: FloatArray, idx: IntArray): FloatArray {
        val n = FloatArray(p.size)
        var i = 0
        while (i + 2 < idx.size) {
            val a = idx[i] * 3; val b = idx[i + 1] * 3; val c = idx[i + 2] * 3
            val ux = p[b] - p[a]; val uy = p[b + 1] - p[a + 1]; val uz = p[b + 2] - p[a + 2]
            val vx = p[c] - p[a]; val vy = p[c + 1] - p[a + 1]; val vz = p[c + 2] - p[a + 2]
            val nx = uy * vz - uz * vy; val ny = uz * vx - ux * vz; val nz = ux * vy - uy * vx
            for (q in intArrayOf(a, b, c)) { n[q] += nx; n[q + 1] += ny; n[q + 2] += nz }
            i += 3
        }
        var k = 0
        while (k < n.size) {
            val l = sqrt(n[k] * n[k] + n[k + 1] * n[k + 1] + n[k + 2] * n[k + 2])
            if (l > 1e-12f) { n[k] /= l; n[k + 1] /= l; n[k + 2] /= l } else { n[k] = 0f; n[k + 1] = 0f; n[k + 2] = 1f }
            k += 3
        }
        return n
    }
}
