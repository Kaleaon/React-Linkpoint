package app.linkpoint.core.scene

import java.util.UUID
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/** The legacy particle system block (PSBlock) of an object, decoded. */
data class ParticleParams(
    val partFlags: Long,
    val pattern: Int,
    val maxAge: Float, val startAge: Float,
    val innerAngle: Float, val outerAngle: Float,
    val burstRate: Float, val burstRadius: Float, val burstSpeedMin: Float, val burstSpeedMax: Float,
    val burstPartCount: Int,
    val angularVelocity: Vec3, val partAcceleration: Vec3,
    val textureId: UUID, val targetId: UUID,
    val dataFlags: Long,
    val partMaxAge: Float,
    val startColor: FloatArray, val endColor: FloatArray,
    val startScaleX: Float, val startScaleY: Float, val endScaleX: Float, val endScaleY: Float,
    val startGlow: Float = 0f, val endGlow: Float = 0f,
) {
    val interpColor get() = dataFlags and 0x001L != 0L
    val interpScale get() = dataFlags and 0x002L != 0L
    val bounce get() = dataFlags and 0x004L != 0L
    val emissive get() = dataFlags and 0x100L != 0L
    val objectRelative get() = partFlags and 0x01L != 0L

    companion object {
        const val SYS_SIZE = 68
        const val LEGACY_SIZE = 86
        const val MAX_SIZE = 98
        const val PATTERN_DROP = 0x01
        const val PATTERN_EXPLODE = 0x02
        const val PATTERN_ANGLE = 0x04
        const val PATTERN_ANGLE_CONE = 0x08
        const val PATTERN_ANGLE_CONE_EMPTY = 0x10

        /** Decode a PSBlock. Returns null for an empty or malformed block. */
        fun parse(data: ByteArray, start: Int = 0, end: Int = data.size): ParticleParams? {
            val size = end - start
            if (size < LEGACY_SIZE || size > MAX_SIZE) return null
            val c = Cursor(data, start)
            try {
                if (size > LEGACY_SIZE) { if (c.u32().toInt() != SYS_SIZE) return null }
                val crcIgnored = c.u32()
                val partFlags = c.u32()
                val pattern = c.u8()
                val maxAge = c.fixed(false, 8, 8); val startAge = c.fixed(false, 8, 8)
                val inner = c.fixed(false, 3, 5); val outer = c.fixed(false, 3, 5)
                val rate = c.fixed(false, 8, 8); val radius = c.fixed(false, 8, 8)
                val smin = c.fixed(false, 8, 8); val smax = c.fixed(false, 8, 8)
                val count = c.u8()
                val av = Vec3(c.fixed(true, 8, 7), c.fixed(true, 8, 7), c.fixed(true, 8, 7))
                val acc = Vec3(c.fixed(true, 8, 7), c.fixed(true, 8, 7), c.fixed(true, 8, 7))
                val tex = c.uuid(); val target = c.uuid()
                if (size > LEGACY_SIZE) c.u32() // size of the legacy data block
                val dataFlags = c.u32()
                val partMax = c.fixed(false, 8, 8)
                val sc = FloatArray(4) { c.u8() / 255f }
                val ec = FloatArray(4) { c.u8() / 255f }
                val ssx = c.fixed(false, 3, 5); val ssy = c.fixed(false, 3, 5)
                val esx = c.fixed(false, 3, 5); val esy = c.fixed(false, 3, 5)
                var sg = 0f; var eg = 0f
                if (size > LEGACY_SIZE && dataFlags and 0x10000L != 0L && c.remaining >= 2) { sg = c.u8() / 255f; eg = c.u8() / 255f }
                return ParticleParams(partFlags, pattern, maxAge, startAge, inner, outer, rate, radius, smin, smax, count, av, acc, tex, target, dataFlags, partMax, sc, ec, ssx, ssy, esx, esy, sg, eg)
            } catch (_: IndexOutOfBoundsException) {
                return null
            }
        }
    }

    private class Cursor(val d: ByteArray, var pos: Int) {
        val remaining get() = d.size - pos
        fun u8(): Int = d[pos++].toInt() and 0xFF
        fun u16(): Int = u8() or (u8() shl 8)
        fun u32(): Long = u16().toLong() or (u16().toLong() shl 16)
        fun uuid(): UUID {
            var msb = 0L; var lsb = 0L
            repeat(8) { msb = (msb shl 8) or u8().toLong() }
            repeat(8) { lsb = (lsb shl 8) or u8().toLong() }
            return UUID(msb, lsb)
        }
        /** Fixed-point: signed values are stored offset by 2^intBits. */
        fun fixed(signed: Boolean, intBits: Int, fracBits: Int): Float {
            val total = intBits + fracBits + if (signed) 1 else 0
            val raw = if (total <= 8) u8() else if (total <= 16) u16() else u32().toInt()
            var v = raw.toFloat() / (1 shl fracBits)
            if (signed) v -= (1 shl intBits).toFloat()
            return v
        }
    }
}

class Particle(var x: Float, var y: Float, var z: Float, var vx: Float, var vy: Float, var vz: Float, var age: Float)

/** A particle ready to draw: position in region metres, RGBA 0..1, and size in metres. */
class ParticleSprite(val x: Float, val y: Float, val z: Float, val r: Float, val g: Float, val b: Float, val a: Float, val sizeX: Float, val sizeY: Float)

/**
 * CPU simulation of one object's particle system. The grid sends the parameters; the viewer is
 * responsible for emitting and moving particles.
 */
class ParticleEmitter(val params: ParticleParams, seed: Long = System.nanoTime(), private val maxLive: Int = 400) {
    private val rnd = java.util.Random(seed)
    private val live = ArrayList<Particle>()
    private var sinceBurst = 0f
    private var systemAge = 0f
    val count: Int get() = live.size

    private fun rand() = rnd.nextFloat()

    /** Advance by [dt] seconds; the emitter sits at [origin] with orientation [rot]. */
    fun step(dt: Float, origin: Vec3, rot: Quat) {
        systemAge += dt
        val active = systemAge >= params.startAge && (params.maxAge <= 0f || systemAge <= params.maxAge + params.startAge)
        if (active) {
            sinceBurst += dt
            val rate = params.burstRate.coerceAtLeast(0.01f)
            while (sinceBurst >= rate) {
                sinceBurst -= rate
                repeat(params.burstPartCount) { if (live.size < maxLive) emit(origin, rot) }
            }
        }
        val acc = if (params.objectRelative) rot.rotate(params.partAcceleration) else params.partAcceleration
        val it = live.iterator()
        while (it.hasNext()) {
            val p = it.next()
            p.age += dt
            if (p.age > params.partMaxAge) { it.remove(); continue }
            p.vx += acc.x * dt; p.vy += acc.y * dt; p.vz += acc.z * dt
            p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt
            if (params.bounce && p.z < origin.z) { p.z = origin.z; p.vz = -p.vz * 0.5f }
        }
    }

    private fun emit(origin: Vec3, rot: Quat) {
        val speed = params.burstSpeedMin + rand() * (params.burstSpeedMax - params.burstSpeedMin)
        var dir = when (params.pattern) {
            ParticleParams.PATTERN_EXPLODE -> randomUnit()
            ParticleParams.PATTERN_ANGLE, ParticleParams.PATTERN_ANGLE_CONE -> cone()
            ParticleParams.PATTERN_ANGLE_CONE_EMPTY -> randomUnit()
            else -> Vec3.ZERO // drop: no initial velocity
        }
        if (params.objectRelative || params.pattern != ParticleParams.PATTERN_EXPLODE) dir = rot.rotate(dir)
        val offset = dir * params.burstRadius
        live += Particle(origin.x + offset.x, origin.y + offset.y, origin.z + offset.z, dir.x * speed, dir.y * speed, dir.z * speed, 0f)
    }

    private fun randomUnit(): Vec3 {
        val z = rand() * 2 - 1
        val a = rand() * 2 * PI.toFloat()
        val r = sqrt(1 - z * z)
        return Vec3(r * cos(a), r * sin(a), z)
    }

    /** Directions between the inner and outer cone angles around +Z. */
    private fun cone(): Vec3 {
        val theta = params.innerAngle * PI.toFloat() + rand() * (params.outerAngle - params.innerAngle).coerceAtLeast(0f) * PI.toFloat()
        val phi = rand() * 2 * PI.toFloat()
        return Vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta))
    }

    fun sprites(): List<ParticleSprite> = live.map { p ->
        val t = (p.age / params.partMaxAge.coerceAtLeast(0.001f)).coerceIn(0f, 1f)
        val sc = params.startColor; val ec = params.endColor
        fun mix(a: Float, b: Float) = if (params.interpColor) a + (b - a) * t else a
        fun mixS(a: Float, b: Float) = if (params.interpScale) a + (b - a) * t else a
        ParticleSprite(
            p.x, p.y, p.z, mix(sc[0], ec[0]), mix(sc[1], ec[1]), mix(sc[2], ec[2]), mix(sc[3], ec[3]),
            mixS(params.startScaleX, params.endScaleX), mixS(params.startScaleY, params.endScaleY),
        )
    }
}
