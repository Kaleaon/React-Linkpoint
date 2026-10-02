package app.linkpoint.core.scene

import app.linkpoint.core.net.Msg
import app.linkpoint.core.net.WireReader
import java.util.UUID

/**
 * Decodes the simulator's object messages into [ObjectChange]s. Layouts follow the official
 * message template and the open-source libopenmetaverse decoder.
 */
object ObjectDecoder {
    private const val CUT = 0.00002f

    val MESSAGE_IDS = setOf(Msg.ObjectUpdate, Msg.ObjectUpdateCompressed, Msg.ObjectUpdateCached, Msg.ImprovedTerseObjectUpdate, Msg.KillObject)

    fun decode(id: Int, body: ByteArray): List<ObjectChange> = try {
        when (id) {
            Msg.ObjectUpdate -> full(body)
            Msg.ObjectUpdateCompressed -> compressed(body)
            Msg.ImprovedTerseObjectUpdate -> terse(body)
            Msg.ObjectUpdateCached -> cached(body)
            Msg.KillObject -> kill(body)
            else -> emptyList()
        }
    } catch (_: IllegalArgumentException) {
        emptyList() // truncated or malformed: drop the message rather than guess
    } catch (_: IndexOutOfBoundsException) {
        emptyList()
    }

    private fun kill(body: ByteArray): List<ObjectChange> {
        val r = WireReader(body)
        return List(r.u8()) { ObjectChange.Killed(r.u32()) }
    }

    private fun cached(body: ByteArray): List<ObjectChange> {
        val r = WireReader(body)
        r.u64(); r.u16()
        val n = r.u8()
        val ids = List(n) { val id = r.u32(); r.u32(); r.u32(); id }
        return if (ids.isEmpty()) emptyList() else listOf(ObjectChange.NeedsFull(ids))
    }

    private fun full(body: ByteArray): List<ObjectChange> {
        val r = WireReader(body)
        r.u64(); r.u16()
        val n = r.u8()
        val out = ArrayList<ObjectChange>(n)
        repeat(n) {
            val localId = r.u32(); r.u8()
            val fullId = r.uuid(); r.u32()
            val pcode = r.u8(); r.u8(); r.u8()
            val scale = vec(r.vec3())
            val motion = r.bin1()
            val parent = r.u32()
            val flags = r.u32()
            val pathCurve = r.u8(); val profileCurve = r.u8()
            val pathBegin = r.u16(); val pathEnd = r.u16()
            val pathScaleX = r.u8(); val pathScaleY = r.u8()
            val shearX = r.u8().toByte().toInt(); val shearY = r.u8().toByte().toInt()
            val twist = r.u8().toByte().toInt(); val twistBegin = r.u8().toByte().toInt(); val radius = r.u8().toByte().toInt()
            val taperX = r.u8().toByte().toInt(); val taperY = r.u8().toByte().toInt()
            val revolutions = r.u8(); val skew = r.u8().toByte().toInt()
            val profileBegin = r.u16(); val profileEnd = r.u16(); val hollow = r.u16()
            val te = r.bin2(); r.bin1() // texture entry, texture animation
            r.bin2(); r.bin2()          // name values, data
            val text = r.str1(); r.bytes(4); r.str1() // text, text colour, media url
            val ps = r.bin1()
            val extra = r.bin1()
            val soundId = r.uuid(); val soundOwner = r.uuid(); val soundGain = r.f32(); val soundFlags = r.u8(); val soundRadius = r.f32()
            r.u8(); r.vec3(); r.vec3()                    // joint

            val (pos, rot) = motionBlock(motion)
            val ex = parseExtra(extra)
            out += ObjectChange.Full(
                SimObject(
                    localId = localId, fullId = fullId, parentId = parent, pcode = pcode, scale = scale,
                    position = pos ?: Vec3.ZERO, rotation = rot ?: Quat.IDENTITY,
                    params = PrimParams(
                        pathCurve, profileCurve,
                        pathBegin * CUT, (50000 - pathEnd) * CUT,
                        (200 - pathScaleX) * 0.01f, (200 - pathScaleY) * 0.01f,
                        shearX * 0.01f, shearY * 0.01f, twist * 0.01f, twistBegin * 0.01f, radius * 0.01f,
                        taperX * 0.01f, taperY * 0.01f, revolutions * 0.015f + 1f, skew * 0.01f,
                        profileBegin * CUT, (50000 - profileEnd) * CUT, hollow * CUT,
                    ),
                    textures = TextureEntry.parse(te), sculpt = ex.sculpt, hasFlexible = ex.flexible,
                    text = text.ifEmpty { null }, particles = if (ps.isNotEmpty()) ParticleParams.parse(ps) else null,
                    updateFlags = flags,
                    sound = sound(soundId, soundGain, soundFlags, soundRadius, soundOwner),
                ),
            )
        }
        return out
    }

    private fun terse(body: ByteArray): List<ObjectChange> {
        val r = WireReader(body)
        r.u64(); r.u16()
        val n = r.u8()
        val out = ArrayList<ObjectChange>(n)
        repeat(n) {
            val d = r.bin1()
            val te = r.bin2()
            val c = Bytes(d)
            val localId = c.u32(); c.u8()
            val avatar = c.u8() != 0
            if (avatar) c.skip(16)
            val pos = Vec3(c.f32(), c.f32(), c.f32())
            c.skip(12) // velocity and acceleration, 3 x u16 each
            val rot = Quat(c.u16f(-1f, 1f), c.u16f(-1f, 1f), c.u16f(-1f, 1f), c.u16f(-1f, 1f))
            val tex = if (te.size > 4) TextureEntry.parse(te, 4, te.size - 4) else null
            out += ObjectChange.Motion(localId, pos, rot, avatar, tex)
        }
        return out
    }

    private fun compressed(body: ByteArray): List<ObjectChange> {
        val r = WireReader(body)
        r.u64(); r.u16()
        val n = r.u8()
        val out = ArrayList<ObjectChange>(n)
        repeat(n) {
            val updateFlags = r.u32()
            val data = r.bin2()
            parseCompressed(data, updateFlags)?.let { out += ObjectChange.Full(it) }
        }
        return out
    }

    private fun parseCompressed(d: ByteArray, updateFlags: Long): SimObject? {
        val c = Bytes(d)
        try {
            val fullId = c.uuid()
            val localId = c.u32()
            val pcode = c.u8()
            c.u8(); c.skip(4); c.u8(); c.u8() // state, crc, material, click action
            val scale = Vec3(c.f32(), c.f32(), c.f32())
            val pos = Vec3(c.f32(), c.f32(), c.f32())
            val rot = Quat.fromPacked(c.f32(), c.f32(), c.f32())
            val flags = c.u32()
            c.skip(16) // owner
            if (flags and 0x80 != 0L) c.skip(12)
            val parent = if (flags and 0x20 != 0L) c.u32() else 0L
            if (flags and 0x02 != 0L) c.skip(1) else if (flags and 0x01 != 0L) c.skip(c.u8())
            var text: String? = null
            if (flags and 0x04 != 0L) { text = c.cstring(); c.skip(4) }
            if (flags and 0x200 != 0L) c.cstring()
            var particles: ParticleParams? = null
            if (flags and 0x08 != 0L) {
                // The block is 86 bytes in the legacy layout; newer systems are larger. Try the legacy size first.
                particles = ParticleParams.parse(d, c.pos, c.pos + ParticleParams.LEGACY_SIZE)
                c.skip(ParticleParams.LEGACY_SIZE)
            }
            val ex = parseExtraAt(c)
            var sound: ObjectSound? = null
            if (flags and 0x10 != 0L) { val sid = c.uuid(); val g = c.f32(); val f = c.u8(); val rad = c.f32(); sound = sound(sid, g, f, rad, null) }
            if (flags and 0x100 != 0L) c.cstring()
            val pathCurve = c.u8()
            val pathBegin = c.u16(); val pathEnd = c.u16()
            val sx = c.u8(); val sy = c.u8()
            val shx = c.s8(); val shy = c.s8()
            val tw = c.s8(); val twb = c.s8(); val ro = c.s8()
            val tx = c.s8(); val ty = c.s8()
            val rev = c.u8(); val sk = c.s8()
            val profileCurve = c.u8()
            val pb = c.u16(); val pe = c.u16(); val ph = c.u16()
            val teLen = c.u32().toInt()
            val te = TextureEntry.parse(d, c.pos, minOf(teLen, d.size - c.pos))
            return SimObject(
                localId = localId, fullId = fullId, parentId = parent, pcode = pcode, scale = scale, position = pos, rotation = rot,
                params = PrimParams(
                    pathCurve, profileCurve, pathBegin * CUT, (50000 - pathEnd) * CUT,
                    (200 - sx) * 0.01f, (200 - sy) * 0.01f, shx * 0.01f, shy * 0.01f, tw * 0.01f, twb * 0.01f, ro * 0.01f,
                    tx * 0.01f, ty * 0.01f, rev * 0.015f + 1f, sk * 0.01f, pb * CUT, (50000 - pe) * CUT, ph * CUT,
                ),
                textures = te, sculpt = ex.sculpt, hasFlexible = ex.flexible, text = text?.ifEmpty { null },
                particles = particles, updateFlags = updateFlags, sound = sound,
            )
        } catch (_: IndexOutOfBoundsException) {
            return null
        }
    }

    /** A sound is only present when the simulator names one (a nil id means "no sound"). */
    private fun sound(id: UUID, gain: Float, flags: Int, radius: Float, owner: UUID?): ObjectSound? =
        if (id.mostSignificantBits == 0L && id.leastSignificantBits == 0L) null
        else ObjectSound(id, gain.coerceIn(0f, 1f), flags, radius.coerceAtLeast(0f), owner)

    private class Extra(val sculpt: SculptInfo?, val flexible: Boolean)

    private fun parseExtra(b: ByteArray): Extra = if (b.isEmpty()) Extra(null, false) else parseExtraAt(Bytes(b))

    private fun parseExtraAt(c: Bytes): Extra {
        var sculpt: SculptInfo? = null
        var flexible = false
        val count = c.u8()
        repeat(count) {
            val type = c.u16()
            val len = c.u32().toInt()
            when (type) {
                0x10 -> flexible = true
                0x30, 0x60 -> if (len >= 17) { val at = c.pos; sculpt = SculptInfo(c.uuidAt(at), c.byteAt(at + 16)) }
            }
            c.skip(len)
        }
        return Extra(sculpt, flexible)
    }

    private fun motionBlock(m: ByteArray): Pair<Vec3?, Quat?> {
        val c = Bytes(m)
        return when (m.size) {
            76, 60 -> {
                if (m.size == 76) c.skip(16)
                val p = Vec3(c.f32(), c.f32(), c.f32())
                c.skip(24)
                p to Quat.fromPacked(c.f32(), c.f32(), c.f32())
            }
            48, 32 -> {
                if (m.size == 48) c.skip(16)
                val p = Vec3(c.u16f(-128f, 384f), c.u16f(-128f, 384f), c.u16f(-256f, 768f))
                c.skip(12)
                p to Quat(c.u16f(-1f, 1f), c.u16f(-1f, 1f), c.u16f(-1f, 1f), c.u16f(-1f, 1f))
            }
            else -> null to null
        }
    }

    private fun vec(v: FloatArray) = Vec3(v[0], v[1], v[2])

    /** Little-endian cursor over a byte array. */
    private class Bytes(val d: ByteArray) {
        var pos = 0
        fun u8(): Int = d[pos++].toInt() and 0xFF
        fun s8(): Int = d[pos++].toInt()
        fun byteAt(i: Int): Int = d[i].toInt() and 0xFF
        fun u16(): Int = u8() or (u8() shl 8)
        fun u32(): Long = u16().toLong() or (u16().toLong() shl 16)
        fun f32(): Float = java.lang.Float.intBitsToFloat(u32().toInt())
        fun skip(n: Int) { if (n < 0 || pos + n > d.size) throw IndexOutOfBoundsException(); pos += n }
        fun u16f(lo: Float, hi: Float): Float = u16() / 65535f * (hi - lo) + lo
        fun uuid(): UUID { val u = uuidAt(pos); pos += 16; return u }
        fun uuidAt(p: Int): UUID {
            var msb = 0L; var lsb = 0L
            for (i in 0 until 8) msb = (msb shl 8) or (d[p + i].toLong() and 0xFF)
            for (i in 8 until 16) lsb = (lsb shl 8) or (d[p + i].toLong() and 0xFF)
            return UUID(msb, lsb)
        }
        fun cstring(): String {
            val start = pos
            while (d[pos].toInt() != 0) pos++
            val s = String(d, start, pos - start, Charsets.UTF_8)
            pos++
            return s
        }
    }
}
