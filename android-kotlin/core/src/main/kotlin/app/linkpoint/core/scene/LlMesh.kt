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

    /**
     * The rig of a skinned mesh: which skeleton joints deform it and how. Matrices are 16 floats in the file's (column
     * major, as the official viewer reads them) order.
     */
    class MeshSkin(
        val jointNames: List<String>,
        val bindShape: FloatArray,
        val inverseBind: List<FloatArray>,
        val altInverseBind: List<FloatArray>?,
        val pelvisOffset: Float?,
    ) {
        /** Joints this viewer's avatar skeleton does not know (custom or Bento bones); informational. */
        val unknownJoints: List<String> get() = jointNames.filterNot { AvatarSkeleton.isKnown(it) }
    }

    class Decoded(val lod: String, val faces: List<MeshFace>, val hasSkin: Boolean, val skin: MeshSkin? = null)

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
                val skin = decodeSkin(asset, header.end, map["skin"].asLlsdMap())
                val faces = faces(block.value.asLlsdList() ?: throw IllegalArgumentException("Mesh block is not an array"), skin?.jointNames?.size ?: 0)
                val declared = map["skin"].asLlsdMap()?.let { (it["size"] as? Number)?.toInt() ?: 0 }?.let { it > 0 } ?: false
                return Decoded(lod, faces, declared, skin)
            } catch (e: Exception) { failure = failure ?: e }
        }
        failure?.let { throw it }
        throw IllegalArgumentException("Mesh has no geometry")
    }

    /** The rig, or null when the mesh has none or its skin block is unusable (the geometry still loads, unskinned). */
    private fun decodeSkin(asset: ByteArray, headerEnd: Int, entry: Map<*, *>?): MeshSkin? {
        entry ?: return null
        val offset = (entry["offset"] as? Number)?.toInt() ?: return null
        val size = (entry["size"] as? Number)?.toInt() ?: return null
        val from = headerEnd + offset
        if (size <= 0 || offset < 0 || from + size > asset.size) return null
        return try {
            val m = LlsdBinary.parse(inflate(asset, from, size)).value.asLlsdMap() ?: return null
            val names = m["joint_names"].asLlsdList()?.mapNotNull { it as? String } ?: return null
            if (names.isEmpty() || names.size > 255) return null
            fun matrix(v: Any?): FloatArray? = (v.asLlsdList()?.mapNotNull { (it as? Number)?.toFloat() })?.toFloatArray()?.takeIf { it.size == 16 }
            val inverse = m["inverse_bind_matrix"].asLlsdList()?.map { matrix(it) ?: return null } ?: return null
            if (inverse.size != names.size) return null
            val alt = m["alt_inverse_bind_matrix"].asLlsdList()?.map { matrix(it) ?: return null }?.takeIf { it.size == names.size }
            MeshSkin(names, matrix(m["bind_shape_matrix"]) ?: IDENTITY, inverse, alt, (m["pelvis_offset"] as? Number)?.toFloat())
        } catch (_: Exception) { null }
    }

    private val IDENTITY = floatArrayOf(1f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 1f)

    /**
     * Per-vertex influences: for each vertex up to four (joint u8, weight u16) pairs; a joint byte of 0xFF ends a vertex that
     * has fewer than four (no weight follows it). Influences naming a joint the rig does not have are dropped and the rest
     * renormalised; a vertex left with nothing keeps zero weights.
     */
    private fun weights(raw: ByteArray, vertexCount: Int, jointCount: Int): Pair<IntArray, FloatArray>? {
        val joints = IntArray(vertexCount * 4)
        val w = FloatArray(vertexCount * 4)
        var p = 0
        for (v in 0 until vertexCount) {
            var read = 0 // pairs consumed from the file (at most four per vertex), valid or not
            var kept = 0
            while (read < 4) {
                if (p >= raw.size) return null // truncated: not trustworthy
                val j = raw[p++].toInt() and 0xFF
                if (j == 0xFF) break
                if (p + 2 > raw.size) return null
                val weight = u16(raw, p) / 65535f; p += 2
                read++
                if (j < jointCount) { joints[v * 4 + kept] = j; w[v * 4 + kept] = weight; kept++ }
            }
            var sum = 0f
            for (i in 0 until 4) sum += w[v * 4 + i]
            if (sum > 1e-6f) for (i in 0 until 4) w[v * 4 + i] /= sum
        }
        return joints to w
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

    private fun faces(submeshes: List<Any?>, jointCount: Int = 0): List<MeshFace> {
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
            val rig = if (jointCount > 0) (m["Weights"] as? ByteArray)?.let { weights(it, n, jointCount) } else null
            out += MeshFace(index, pos, normals, uvs, idx, rig?.first, rig?.second)
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
