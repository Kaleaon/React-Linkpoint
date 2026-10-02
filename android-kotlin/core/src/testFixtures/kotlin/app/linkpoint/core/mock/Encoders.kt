package app.linkpoint.core.mock

import app.linkpoint.core.net.WireWriter
import app.linkpoint.core.scene.*
import app.linkpoint.core.terrain.BitWriter
import app.linkpoint.core.terrain.TerrainDecoder
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.util.UUID
import java.util.zip.Deflater
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.roundToInt

/** Encoders for the simulator's wire formats, used to build test regions. They mirror the decoders in :core. */
object TerrainEncoder {
    private val quantize = FloatArray(256) { 1f / (1f + 2f * ((it % 16) + (it / 16))) }
    private val cosines = FloatArray(256).also { t -> val h = (PI.toFloat() * 0.5f / 16f); for (u in 0 until 16) for (n in 0 until 16) t[u * 16 + n] = cos((2f * n + 1f) * u * h) }
    private const val OO_SQRT2 = 0.7071067811865475f

    /** A LayerData payload carrying the given patches (x, y, 16x16 heights). */
    fun layer(patches: List<Triple<Int, Int, FloatArray>>): ByteArray {
        val w = BitWriter()
        w.bits(264, 16); w.bits(16, 8); w.bits(TerrainDecoder.LAYER_LAND, 8)
        for ((x, y, data) in patches) patch(w, data, x, y)
        w.bits(97, 8)
        return w.toByteArray()
    }

    private fun patch(w: BitWriter, data: FloatArray, x: Int, y: Int) {
        val zmin = data.min(); val zmax = data.max()
        val range = ((zmax - zmin) + 1f).toInt()
        val prequant = 10
        val premult = (1f / range) * (1 shl prequant)
        val sub = (1 shl (prequant - 1)).toFloat() + zmin * premult
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
        var wbits = 2
        for (v in itemp) { var t = abs(v); var b = 0; while (t > 0) { b++; t = t shr 1 }; if (b + 1 > wbits) wbits = b + 1 }
        val quantWBits = (136 and 0xF0) or (wbits - 2)
        w.bits(quantWBits, 8); w.float(zmin); w.bits(range, 16); w.bits((y and 0x1F) + (x shl 5), 10)
        for (i in 0 until 256) {
            val t = itemp[i]
            if (t == 0) {
                if ((i until 256).all { itemp[it] == 0 }) { w.bits(2, 2); return }
                w.bits(0, 1)
            } else {
                w.bits(if (t < 0) 7 else 6, 3)
                w.bits(abs(t), wbits)
            }
        }
    }
}

/** What one face of a test object looks like. */
class FaceSpec(
    val textureId: UUID = FaceAppearance.NULL_ID,
    val color: FloatArray = floatArrayOf(1f, 1f, 1f, 1f),
    val repeatU: Float = 1f, val repeatV: Float = 1f,
    val offsetU: Float = 0f, val offsetV: Float = 0f, val rotation: Float = 0f,
    val glow: Float = 0f, val fullbright: Boolean = false,
)

object Wire {
    private fun floatBytes(f: Float): ByteArray = ByteBuffer.allocate(4).order(java.nio.ByteOrder.LITTLE_ENDIAN).putFloat(f).array()
    private fun s16(v: Int): ByteArray = byteArrayOf((v and 0xFF).toByte(), ((v shr 8) and 0xFF).toByte())

    private fun section(default: ByteArray, perFace: Map<Int, ByteArray>): ByteArray {
        val out = ByteArrayOutputStream()
        out.write(default)
        // Group faces that share a value into a single bitfield.
        val byValue = perFace.entries.filter { !it.value.contentEquals(default) }.groupBy { it.value.toList() }
        for ((value, faces) in byValue) {
            var bits = 0L
            for (f in faces) bits = bits or (1L shl f.key)
            val groups = (63 - java.lang.Long.numberOfLeadingZeros(bits)) / 7 + 1
            for (g in 0 until groups) {
                val shift = 7 * (groups - 1 - g)
                var v = (bits shr shift) and 0x7F
                if (g < groups - 1) v = v or 0x80
                out.write(v.toInt())
            }
            out.write(value.toByteArray())
        }
        out.write(0)
        return out.toByteArray()
    }

    private fun uuidBytes(u: UUID) = WireWriter().uuid(u).toByteArray()
    private fun colorBytes(c: FloatArray) = ByteArray(4) { (255 - (c[it].coerceIn(0f, 1f) * 255f).roundToInt()).toByte() }

    /** A TextureEntry block. [faces] are the per-face exceptions; every other face uses [default]. */
    fun textureEntry(default: FaceSpec, faces: Map<Int, FaceSpec> = emptyMap()): ByteArray {
        fun sec(of: (FaceSpec) -> ByteArray) = section(of(default), faces.mapValues { of(it.value) })
        val out = ByteArrayOutputStream()
        out.write(sec { uuidBytes(it.textureId) })
        out.write(sec { colorBytes(it.color) })
        out.write(sec { floatBytes(it.repeatU) })
        out.write(sec { floatBytes(it.repeatV) })
        out.write(sec { s16((it.offsetU * 32767f).roundToInt()) })
        out.write(sec { s16((it.offsetV * 32767f).roundToInt()) })
        out.write(sec { s16((it.rotation / (2f * PI.toFloat()) * 32768f).roundToInt()) })
        out.write(sec { byteArrayOf(if (it.fullbright) 0x20 else 0) })
        out.write(sec { byteArrayOf(0) })
        out.write(sec { byteArrayOf((it.glow * 255f).roundToInt().toByte()) })
        return out.toByteArray()
    }

    /** The 86-byte legacy particle system block. */
    fun particleBlock(
        pattern: Int = ParticleParams.PATTERN_EXPLODE, burstRate: Float = 0.1f, burstPartCount: Int = 4,
        speedMin: Float = 0.5f, speedMax: Float = 1.5f, accelZ: Float = 0.5f, partMaxAge: Float = 3f,
        startColor: FloatArray = floatArrayOf(1f, 0.8f, 0.2f, 1f), endColor: FloatArray = floatArrayOf(1f, 0.1f, 0f, 0f),
        startScale: Float = 0.2f, endScale: Float = 0.6f, textureId: UUID = FaceAppearance.NULL_ID, emissive: Boolean = true,
    ): ByteArray {
        val w = WireWriter()
        w.u32(0).u32(0).u8(pattern)
        w.u16(0).u16(0)
        w.u8(0).u8(0)
        w.u16((burstRate * 256).roundToInt()).u16(0)
        w.u16((speedMin * 256).roundToInt()).u16((speedMax * 256).roundToInt())
        w.u8(burstPartCount)
        repeat(3) { w.u16(256 * 128) }
        w.u16(256 * 128).u16(256 * 128).u16(((accelZ + 256f) * 128f).roundToInt())
        w.uuid(textureId).uuid(UUID(0, 0))
        w.u32(0x3L or (if (emissive) 0x100L else 0L))
        w.u16((partMaxAge * 256).roundToInt())
        for (c in startColor) w.u8((c * 255).roundToInt())
        for (c in endColor) w.u8((c * 255).roundToInt())
        w.u8((startScale * 32).roundToInt()).u8((startScale * 32).roundToInt()).u8((endScale * 32).roundToInt()).u8((endScale * 32).roundToInt())
        return w.toByteArray()
    }

    private fun u16s(vararg v: Int): ByteArray { val o = ByteArrayOutputStream(); for (x in v) { o.write(x and 0xFF); o.write(x ushr 8) }; return o.toByteArray() }

    private class B {
        val out = ByteArrayOutputStream()
        fun raw(vararg b: Int) = apply { b.forEach { out.write(it) } }
        fun i32(v: Int) = apply { out.write(ByteBuffer.allocate(4).putInt(v).array()) }
        fun key(k: String) = apply { raw('k'.code).i32(k.length); out.write(k.toByteArray()) }
        fun str(v: String) = apply { raw('s'.code).i32(v.toByteArray().size); out.write(v.toByteArray()) }
        fun int(v: Int) = apply { raw('i'.code).i32(v) }
        fun real(v: Double) = apply { raw('r'.code); out.write(ByteBuffer.allocate(8).putDouble(v).array()) }
        fun bin(b: ByteArray) = apply { raw('b'.code).i32(b.size); out.write(b) }
        fun map(n: Int) = raw('{'.code).i32(n)
        fun endMap() = raw('}'.code)
        fun arr(n: Int) = raw('['.code).i32(n)
        fun endArr() = raw(']'.code)
        fun bytes(): ByteArray = out.toByteArray()
    }

    private fun deflate(data: ByteArray): ByteArray {
        val d = Deflater(); d.setInput(data); d.finish()
        val comp = ByteArrayOutputStream(); val buf = ByteArray(2048)
        while (!d.finished()) comp.write(buf, 0, d.deflate(buf)); d.end()
        return comp.toByteArray()
    }

    /** Asset id the generated OAR gives the rigged limb mesh. */
    val RIGGED_LIMB_ID: java.util.UUID = java.util.UUID.fromString("a0a0a0a0-0000-4000-8000-000000000011")

    /**
     * A rigged LLMesh: a boxy limb of three rings of four vertices (z = -0.5, 0, 0.5) weighted to [jointNames]. Per vertex:
     * ring 0 is 100% joint 0; ring 1 blends joints 0 and 1; ring 2 holds, in order, a vertex with FOUR influences (so no 0xFF
     * terminator), one blending joints 1 and 2, and one each 100% joint 2 and joint 3. [weights] replaces the weight bytes
     * (for malformed-data tests); [withSkin] = false leaves the rig out.
     */
    fun riggedLimbMesh(
        jointNames: List<String> = listOf("mShoulderLeft", "mElbowLeft", "mWristLeft", "mHandThumb1Left"),
        weights: ByteArray? = null,
        withSkin: Boolean = true,
    ): ByteArray {
        fun q(v: Float) = (((v + 0.5f) / 1f) * 65535f).roundToInt().coerceIn(0, 65535)
        val xy = listOf(-0.25f to -0.25f, 0.25f to -0.25f, 0.25f to 0.25f, -0.25f to 0.25f)
        val pos = ArrayList<Int>()
        for (z in listOf(-0.5f, 0f, 0.5f)) for ((x, y) in xy) { pos += q(x); pos += q(y); pos += q(z) }
        val tris = ArrayList<Int>()
        for (r in 0..1) for (side in 0..3) {
            val a = r * 4 + side; val b = r * 4 + (side + 1) % 4; val c = (r + 1) * 4 + side; val d = (r + 1) * 4 + (side + 1) % 4
            tris += listOf(a, b, c, b, d, c)
        }
        val w = ByteArrayOutputStream()
        fun pair(joint: Int, weight: Int) { w.write(joint); w.write(weight and 0xFF); w.write(weight ushr 8) }
        fun end() = w.write(0xFF)
        repeat(4) { pair(0, 65535); end() }                       // ring 0
        repeat(4) { pair(0, 32768); pair(1, 32767); end() }       // ring 1
        pair(0, 16384); pair(1, 16384); pair(2, 16384); pair(3, 16383) // ring 2, vertex 0: four influences, no terminator
        pair(1, 32768); pair(2, 32767); end()
        pair(2, 65535); end()
        pair(3, 65535); end()
        val geometry = B().arr(1).map(4)
            .key("Position").bin(u16s(*pos.toIntArray()))
            .key("TriangleList").bin(u16s(*tris.toIntArray()))
            .key("Weights").bin(weights ?: w.toByteArray())
            .key("PositionDomain").map(2)
            .key("Min").arr(3).real(-0.5).real(-0.5).real(-0.5).endArr()
            .key("Max").arr(3).real(0.5).real(0.5).real(0.5).endArr()
            .endMap().endMap().endArr().bytes()
        val geoBlock = deflate(geometry)
        if (!withSkin) return B().map(1).key("high_lod").map(2).key("offset").int(0).key("size").int(geoBlock.size).endMap().endMap().bytes() + geoBlock
        val skin = B().map(5)
        skin.key("joint_names").arr(jointNames.size); jointNames.forEach { skin.str(it) }; skin.endArr()
        skin.key("bind_shape_matrix").arr(16)
        listOf(1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0).forEach { skin.real(it) }
        skin.endArr()
        skin.key("inverse_bind_matrix").arr(jointNames.size)
        for (i in jointNames.indices) { skin.arr(16); listOf(1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, -0.25 * i, 1.0).forEach { skin.real(it) }; skin.endArr() }
        skin.endArr()
        skin.key("alt_inverse_bind_matrix").arr(jointNames.size)
        for (i in jointNames.indices) { skin.arr(16); listOf(1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, -0.5 * i, 1.0).forEach { skin.real(it) }; skin.endArr() }
        skin.endArr()
        skin.key("pelvis_offset").real(0.125)
        val skinBlock = deflate(skin.endMap().bytes())
        val header = B().map(2)
            .key("high_lod").map(2).key("offset").int(0).key("size").int(geoBlock.size).endMap()
            .key("skin").map(2).key("offset").int(geoBlock.size).key("size").int(skinBlock.size).endMap()
            .endMap().bytes()
        return header + geoBlock + skinBlock
    }

    /** An LLMesh asset for a four-sided pyramid (square base, apex up), one face, in unit space. */
    fun pyramidMesh(): ByteArray {
        val corners = listOf(-0.5f to -0.5f, 0.5f to -0.5f, 0.5f to 0.5f, -0.5f to 0.5f)
        val verts = ArrayList<Triple<Float, Float, Float>>()
        val tris = ArrayList<Int>()
        // Four triangular sides (separate vertices for flat shading) and the base.
        for (i in 0 until 4) {
            val a = corners[i]; val b = corners[(i + 1) % 4]
            val base = verts.size
            verts += Triple(a.first, a.second, -0.5f); verts += Triple(b.first, b.second, -0.5f); verts += Triple(0f, 0f, 0.5f)
            tris += listOf(base, base + 1, base + 2)
        }
        val base = verts.size
        for (c in corners) verts += Triple(c.first, c.second, -0.5f)
        tris += listOf(base, base + 2, base + 1, base, base + 3, base + 2)
        fun q(v: Float, lo: Float, hi: Float) = (((v - lo) / (hi - lo)) * 65535f).roundToInt().coerceIn(0, 65535)
        val pos = ArrayList<Int>()
        for ((x, y, z) in verts) { pos += q(x, -0.5f, 0.5f); pos += q(y, -0.5f, 0.5f); pos += q(z, -0.5f, 0.5f) }
        val sub = B().arr(1).map(3)
            .key("Position").bin(u16s(*pos.toIntArray()))
            .key("TriangleList").bin(u16s(*tris.toIntArray()))
            .key("PositionDomain").map(2)
            .key("Min").arr(3).real(-0.5).real(-0.5).real(-0.5).endArr()
            .key("Max").arr(3).real(0.5).real(0.5).real(0.5).endArr()
            .endMap().endMap().endArr().bytes()
        val d = Deflater(); d.setInput(sub); d.finish()
        val comp = ByteArrayOutputStream(); val buf = ByteArray(2048)
        while (!d.finished()) comp.write(buf, 0, d.deflate(buf)); d.end()
        val block = comp.toByteArray()
        val header = B().map(1).key("high_lod").map(2).key("offset").int(0).key("size").int(block.size).endMap().endMap().bytes()
        return header + block
    }
}

/** Builders for the simulator's object messages. */
class ObjectSpec(
    val localId: Long,
    val fullId: UUID = UUID(0x1234, localId),
    val parent: Long = 0,
    val pcode: Int = PCode.PRIM,
    val position: Vec3,
    val rotation: Quat = Quat.IDENTITY,
    val scale: Vec3 = Vec3(1f, 1f, 1f),
    val params: PrimParams = PrimParams(),
    val textureEntry: ByteArray? = null,
    val sculpt: Pair<UUID, Int>? = null,
    val text: String = "",
    val particles: ByteArray? = null,
    val sound: app.linkpoint.core.scene.ObjectSound? = null,
)

object ObjectPackets {
    private fun packRot(q: Quat): Triple<Float, Float, Float> { val s = if (q.w < 0) -1f else 1f; return Triple(q.x * s, q.y * s, q.z * s) }

    private fun extra(o: ObjectSpec): ByteArray {
        val s = o.sculpt ?: return byteArrayOf(0)
        return WireWriter().u8(1).u16(0x30).u32(17).uuid(s.first).u8(s.second).toByteArray()
    }

    private fun quant(p: PrimParams) = intArrayOf(
        (p.pathBegin / 0.00002f).roundToInt(), 50000 - (p.pathEnd / 0.00002f).roundToInt(),
        200 - (p.pathScaleX / 0.01f).roundToInt(), 200 - (p.pathScaleY / 0.01f).roundToInt(),
        (p.shearX / 0.01f).roundToInt(), (p.shearY / 0.01f).roundToInt(), (p.twist / 0.01f).roundToInt(), (p.twistBegin / 0.01f).roundToInt(),
        (p.radiusOffset / 0.01f).roundToInt(), (p.taperX / 0.01f).roundToInt(), (p.taperY / 0.01f).roundToInt(),
        ((p.revolutions - 1f) / 0.015f).roundToInt(), (p.skew / 0.01f).roundToInt(),
        (p.profileBegin / 0.00002f).roundToInt(), 50000 - (p.profileEnd / 0.00002f).roundToInt(), (p.profileHollow / 0.00002f).roundToInt(),
    )

    /** One-object ObjectUpdate body (full update). */
    fun full(o: ObjectSpec): ByteArray {
        val motion = if (o.pcode == PCode.AVATAR) {
            val w = WireWriter().f32(0f).f32(0f).f32(1f).f32(0f) // collision plane
            w.vec3(o.position.x, o.position.y, o.position.z).vec3(0f, 0f, 0f).vec3(0f, 0f, 0f)
            val r = packRot(o.rotation); w.vec3(r.first, r.second, r.third).vec3(0f, 0f, 0f).toByteArray()
        } else {
            val w = WireWriter().vec3(o.position.x, o.position.y, o.position.z).vec3(0f, 0f, 0f).vec3(0f, 0f, 0f)
            val r = packRot(o.rotation); w.vec3(r.first, r.second, r.third).vec3(0f, 0f, 0f).toByteArray()
        }
        val q = quant(o.params)
        val w = WireWriter().u64(0).u16(0).u8(1)
        w.u32(o.localId).u8(0).uuid(o.fullId).u32(0).u8(o.pcode).u8(0).u8(0).vec3(o.scale.x, o.scale.y, o.scale.z).bin1(motion)
        w.u32(o.parent).u32(0)
        w.u8(o.params.pathCurve).u8(o.params.profileCurve).u16(q[0]).u16(q[1]).u8(q[2]).u8(q[3])
        for (i in 4..12) w.u8(q[i] and 0xFF) // shear x/y, twist, twist begin, radius offset, taper x/y, revolutions, skew
        w.u16(q[13]).u16(q[14]).u16(q[15])
        w.bin2(o.textureEntry ?: ByteArray(0)).bin1(ByteArray(0)).bin2(ByteArray(0)).bin2(ByteArray(0))
        w.str1(o.text).bytes(ByteArray(4)).str1("").bin1(o.particles ?: ByteArray(0)).bin1(extra(o))
        val snd = o.sound
        w.uuid(snd?.soundId ?: UUID(0, 0)).uuid(snd?.ownerId ?: UUID(0, 0)).f32(snd?.gain ?: 0f).u8(snd?.flags ?: 0).f32(snd?.radius ?: 0f).u8(0).vec3(0f, 0f, 0f).vec3(0f, 0f, 0f)
        return w.toByteArray()
    }

    /** One-object ObjectUpdateCompressed body (the form most prims arrive in). */
    fun compressed(o: ObjectSpec): ByteArray {
        var flags = 0L
        if (o.parent != 0L) flags = flags or 0x20
        if (o.text.isNotEmpty()) flags = flags or 0x04
        if (o.particles != null) flags = flags or 0x08
        if (o.sound != null) flags = flags or 0x10
        val q = quant(o.params)
        val d = WireWriter()
        d.uuid(o.fullId).u32(o.localId).u8(o.pcode).u8(0).u32(0).u8(0).u8(0)
        d.vec3(o.scale.x, o.scale.y, o.scale.z).vec3(o.position.x, o.position.y, o.position.z)
        val r = packRot(o.rotation); d.vec3(r.first, r.second, r.third)
        d.u32(flags).uuid(UUID(0, 0))
        if (o.parent != 0L) d.u32(o.parent)
        if (o.text.isNotEmpty()) d.bytes(o.text.toByteArray() + 0).bytes(ByteArray(4))
        if (o.particles != null) d.bytes(o.particles)
        d.bytes(extra(o))
        o.sound?.let { d.uuid(it.soundId).f32(it.gain).u8(it.flags).f32(it.radius) }
        d.u8(o.params.pathCurve).u16(q[0]).u16(q[1]).u8(q[2]).u8(q[3])
        for (i in 4..10) d.u8(q[i] and 0xFF)
        d.u8(q[11] and 0xFF).u8(q[12] and 0xFF)
        d.u8(o.params.profileCurve).u16(q[13]).u16(q[14]).u16(q[15])
        val te = o.textureEntry ?: ByteArray(0)
        d.u32(te.size.toLong()).bytes(te)
        return WireWriter().u64(0).u16(0).u8(1).u32(flags).bin2(d.toByteArray()).toByteArray()
    }

    fun terse(localId: Long, pos: Vec3, rot: Quat = Quat.IDENTITY, avatar: Boolean = false): ByteArray {
        fun u16(v: Float, lo: Float, hi: Float) = (((v - lo) / (hi - lo)) * 65535f).roundToInt().coerceIn(0, 65535)
        val d = WireWriter().u32(localId).u8(0).u8(if (avatar) 1 else 0)
        if (avatar) d.f32(0f).f32(0f).f32(1f).f32(0f)
        d.vec3(pos.x, pos.y, pos.z).u16(32768).u16(32768).u16(32768).u16(32768).u16(32768).u16(32768)
        d.u16(u16(rot.x, -1f, 1f)).u16(u16(rot.y, -1f, 1f)).u16(u16(rot.z, -1f, 1f)).u16(u16(rot.w, -1f, 1f))
        d.u16(32768).u16(32768).u16(32768)
        return WireWriter().u64(0).u16(0).u8(1).bin1(d.toByteArray()).bin2(ByteArray(0)).toByteArray()
    }

    fun kill(ids: List<Long>): ByteArray { val w = WireWriter().u8(ids.size); ids.forEach { w.u32(it) }; return w.toByteArray() }
}
