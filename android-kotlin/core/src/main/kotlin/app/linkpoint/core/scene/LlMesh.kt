package app.linkpoint.core.scene

import app.linkpoint.core.llsd.LlsdBinary
import app.linkpoint.core.llsd.asLlsdList
import app.linkpoint.core.llsd.asLlsdMap
import java.io.ByteArrayOutputStream
import java.util.zip.Inflater
import kotlin.math.sqrt

/** Decodes Second Life mesh assets (LLMesh): an LLSD header, then zlib-compressed LLSD blocks per level of detail. */
object LlMesh {
    private val LODS = listOf("high_lod", "medium_lod", "low_lod", "lowest_lod")
    private const val MAX_INFLATED = 32 * 1024 * 1024

    class Decoded(val lod: String, val faces: List<MeshFace>, val hasSkin: Boolean)

    /** Decode the best available level of detail, or the one named by [preferred]. Throws on malformed assets. */
    fun decode(asset: ByteArray, preferred: String? = null): Decoded {
        val header = LlsdBinary.parse(asset)
        val map = header.value.asLlsdMap() ?: throw IllegalArgumentException("Mesh header is not a map")
        val order = if (preferred != null) listOf(preferred) + LODS else LODS
        // A level whose block is cut off or corrupt (seen in real archives) is skipped in favour of the next one.
        var failure: Exception? = null
        for (lod in order) {
            val entry = map[lod].asLlsdMap() ?: continue
            val offset = (entry["offset"] as? Number)?.toInt() ?: continue
            val size = (entry["size"] as? Number)?.toInt() ?: continue
            if (size <= 0) continue
            val from = header.end + offset
            if (offset < 0 || from + size > asset.size) { failure = failure ?: IllegalArgumentException("Mesh block is outside the asset"); continue }
            try {
                val block = LlsdBinary.parse(inflate(asset, from, size))
                val faces = faces(block.value.asLlsdList() ?: throw IllegalArgumentException("Mesh block is not an array"))
                return Decoded(lod, faces, map["skin"].asLlsdMap()?.let { (it["size"] as? Number)?.toInt() ?: 0 } ?.let { it > 0 } ?: false)
            } catch (e: Exception) { failure = failure ?: e }
        }
        failure?.let { throw it }
        throw IllegalArgumentException("Mesh has no geometry")
    }

    private fun inflate(data: ByteArray, off: Int, len: Int): ByteArray {
        val inf = Inflater()
        try {
            inf.setInput(data, off, len)
            val out = ByteArrayOutputStream()
            val buf = ByteArray(8192)
            while (!inf.finished()) {
                val n = inf.inflate(buf)
                if (n == 0 && (inf.needsInput() || inf.needsDictionary())) break
                out.write(buf, 0, n)
                require(out.size() <= MAX_INFLATED) { "Mesh block is too large" }
            }
            return out.toByteArray()
        } finally { inf.end() }
    }

    private fun floats(v: Any?): FloatArray? = (v.asLlsdList()?.mapNotNull { (it as? Number)?.toFloat() })?.toFloatArray()?.takeIf { it.size >= 3 }

    private fun u16(b: ByteArray, i: Int) = (b[i].toInt() and 0xFF) or ((b[i + 1].toInt() and 0xFF) shl 8)

    private fun faces(submeshes: List<Any?>): List<MeshFace> {
        val out = ArrayList<MeshFace>()
        for ((index, sm) in submeshes.withIndex()) {
            val m = sm.asLlsdMap() ?: continue
            if (m["NoGeometry"] == true) continue
            val posBytes = m["Position"] as? ByteArray ?: continue
            val tris = m["TriangleList"] as? ByteArray ?: continue
            val dom = m["PositionDomain"].asLlsdMap()
            val min = floats(dom?.get("Min")) ?: floatArrayOf(-0.5f, -0.5f, -0.5f)
            val max = floats(dom?.get("Max")) ?: floatArrayOf(0.5f, 0.5f, 0.5f)
            val n = posBytes.size / 6
            val pos = FloatArray(n * 3)
            for (i in 0 until n) for (a in 0..2) pos[i * 3 + a] = min[a] + u16(posBytes, i * 6 + a * 2) / 65535f * (max[a] - min[a])

            val idx = IntArray(tris.size / 2) { u16(tris, it * 2) }.filter { it < n }.let { f -> IntArray(f.size - f.size % 3) { f[it] } }

            val nb = m["Normal"] as? ByteArray
            val normals = if (nb != null && nb.size >= n * 6) FloatArray(n * 3) { u16(nb, it * 2) / 65535f * 2f - 1f } else computeNormals(pos, idx)

            val tb = m["TexCoord0"] as? ByteArray
            val td = m["TexCoord0Domain"].asLlsdMap()
            val tmin = floats(td?.get("Min")?.let { listOf(it.asLlsdList()?.getOrNull(0), it.asLlsdList()?.getOrNull(1), 0f) }) ?: floatArrayOf(0f, 0f, 0f)
            val tmax = floats(td?.get("Max")?.let { listOf(it.asLlsdList()?.getOrNull(0), it.asLlsdList()?.getOrNull(1), 0f) }) ?: floatArrayOf(1f, 1f, 0f)
            val uvs = if (tb != null && tb.size >= n * 4) FloatArray(n * 2) { i -> tmin[i % 2] + u16(tb, i * 2) / 65535f * (tmax[i % 2] - tmin[i % 2]) } else FloatArray(n * 2)
            out += MeshFace(index, pos, normals, uvs, idx)
        }
        return out
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
            if (l > 1e-12f) { n[k] /= l; n[k + 1] /= l; n[k + 2] /= l } else n[k + 2] = 1f
            k += 3
        }
        return n
    }
}
