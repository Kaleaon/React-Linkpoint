package app.linkpoint.core.scene

import java.util.UUID

/** Appearance of one prim face, from the TextureEntry block. */
data class FaceAppearance(
    val textureId: UUID,
    /** RGBA, each 0..1. */
    val color: FloatArray,
    val repeatU: Float, val repeatV: Float,
    val glow: Float,
    val offsetU: Float = 0f, val offsetV: Float = 0f, val rotation: Float = 0f,
    /** The face is drawn without lighting. */
    val fullbright: Boolean = false,
) {
    override fun equals(other: Any?) = other is FaceAppearance && textureId == other.textureId && color.contentEquals(other.color) &&
        repeatU == other.repeatU && repeatV == other.repeatV && glow == other.glow &&
        offsetU == other.offsetU && offsetV == other.offsetV && rotation == other.rotation && fullbright == other.fullbright
    override fun hashCode() = ((textureId.hashCode() * 31 + color.contentHashCode()) * 31 + repeatU.hashCode()) * 31 + offsetU.hashCode() + (if (fullbright) 1 else 0)

    /** True when the face has a texture that must be fetched (not the null id and not the viewer's blank white texture). */
    val hasTexture: Boolean get() = textureId != NULL_ID && textureId != BLANK_ID

    companion object {
        val NULL_ID = UUID(0, 0)
        /** The grid's built-in plain white texture. */
        val BLANK_ID: UUID = UUID.fromString("5748decc-f629-461c-9a36-a35a221fe21f")
    }
}

/** The per-face colours and texture ids of an object. Faces without an exception use [default]. */
class TextureEntry(val default: FaceAppearance, private val faces: Map<Int, FaceAppearance>) {
    fun face(i: Int): FaceAppearance = faces[i] ?: default
    val explicitFaces: Set<Int> get() = faces.keys

    companion object {
        /** Returns null when the block is too short to hold a texture entry (some updates send none). */
        fun parse(data: ByteArray, start: Int = 0, length: Int = data.size - start): TextureEntry? {
            if (length < 16) return null
            val end = start + length
            var pos = start
            fun more() = pos < end

            // Each section: a default value, then (face bitfield, value) pairs until a zero bitfield.
            fun <T> section(size: Int, read: (Int) -> T): Pair<T, Map<Int, T>> {
                if (pos + size > end) throw IllegalArgumentException("Truncated texture entry")
                val default = read(pos); pos += size
                val map = HashMap<Int, T>()
                while (more()) {
                    var bits = 0L; var count = 0
                    var b: Int
                    do {
                        if (pos >= end) return default to map
                        b = data[pos++].toInt() and 0xFF
                        bits = (bits shl 7) or (b and 0x7F).toLong(); count += 7
                    } while (b and 0x80 != 0)
                    if (bits == 0L) break
                    if (pos + size > end) throw IllegalArgumentException("Truncated texture entry")
                    val v = read(pos); pos += size
                    for (face in 0 until count) if (bits and (1L shl face) != 0L) map[face] = v
                }
                return default to map
            }

            fun uuidAt(p: Int): UUID {
                var msb = 0L; var lsb = 0L
                for (i in 0 until 8) msb = (msb shl 8) or (data[p + i].toLong() and 0xFF)
                for (i in 8 until 16) lsb = (lsb shl 8) or (data[p + i].toLong() and 0xFF)
                return UUID(msb, lsb)
            }
            fun floatAt(p: Int) = java.lang.Float.intBitsToFloat(
                (data[p].toInt() and 0xFF) or ((data[p + 1].toInt() and 0xFF) shl 8) or ((data[p + 2].toInt() and 0xFF) shl 16) or ((data[p + 3].toInt() and 0xFF) shl 24),
            )

            val textures = section(16, ::uuidAt)
            // Colours are stored inverted: 255 means 0.
            val colors = section(4) { p -> FloatArray(4) { i -> (255 - (data[p + i].toInt() and 0xFF)) / 255f } }
            val repU = section(4, ::floatAt)
            val repV = section(4, ::floatAt)
            fun s16(p: Int) = ((data[p].toInt() and 0xFF) or (data[p + 1].toInt() shl 8)).toShort().toInt()
            val offU = section(2) { p -> s16(p) / 32767f }
            val offV = section(2) { p -> s16(p) / 32767f }
            val rot = section(2) { p -> ((data[p].toInt() and 0xFF) or ((data[p + 1].toInt() and 0xFF) shl 8)) / 32768f * (2f * Math.PI.toFloat()) }
            val mat = section(1) { p -> data[p].toInt() and 0xFF } // bit 0x20: fullbright
            section(1) { 0 }                                       // media flags
            val glow = if (more()) section(1) { p -> (data[p].toInt() and 0xFF) / 255f } else 0f to emptyMap()

            val default = FaceAppearance(textures.first, colors.first, repU.first, repV.first, glow.first, offU.first, offV.first, rot.first, mat.first and 0x20 != 0)
            val all = HashSet<Int>().apply {
                addAll(textures.second.keys); addAll(colors.second.keys); addAll(repU.second.keys); addAll(repV.second.keys); addAll(glow.second.keys)
                addAll(offU.second.keys); addAll(offV.second.keys); addAll(rot.second.keys); addAll(mat.second.keys)
            }
            val faces = all.associateWith { f ->
                FaceAppearance(
                    textures.second[f] ?: textures.first, colors.second[f] ?: colors.first,
                    repU.second[f] ?: repU.first, repV.second[f] ?: repV.first, glow.second[f] ?: glow.first,
                    offU.second[f] ?: offU.first, offV.second[f] ?: offV.first, rot.second[f] ?: rot.first,
                    ((mat.second[f] ?: mat.first) and 0x20) != 0,
                )
            }
            return TextureEntry(default, faces)
        }
    }
}
