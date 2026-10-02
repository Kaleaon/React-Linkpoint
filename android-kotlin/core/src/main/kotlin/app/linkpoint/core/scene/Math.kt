package app.linkpoint.core.scene

import kotlin.math.sqrt

data class Vec3(val x: Float, val y: Float, val z: Float) {
    operator fun plus(o: Vec3) = Vec3(x + o.x, y + o.y, z + o.z)
    operator fun minus(o: Vec3) = Vec3(x - o.x, y - o.y, z - o.z)
    operator fun times(s: Float) = Vec3(x * s, y * s, z * s)
    fun dot(o: Vec3) = x * o.x + y * o.y + z * o.z
    fun cross(o: Vec3) = Vec3(y * o.z - z * o.y, z * o.x - x * o.z, x * o.y - y * o.x)
    fun length() = sqrt(dot(this))
    fun normalized(): Vec3 { val l = length(); return if (l > 1e-12f) this * (1f / l) else Vec3(0f, 0f, 1f) }
    companion object { val ZERO = Vec3(0f, 0f, 0f) }
}

data class Quat(val x: Float, val y: Float, val z: Float, val w: Float) {
    operator fun times(o: Quat) = Quat(
        w * o.x + x * o.w + y * o.z - z * o.y,
        w * o.y - x * o.z + y * o.w + z * o.x,
        w * o.z + x * o.y - y * o.x + z * o.w,
        w * o.w - x * o.x - y * o.y - z * o.z,
    )

    fun rotate(v: Vec3): Vec3 {
        val u = Vec3(x, y, z)
        val t = u.cross(v) * 2f
        return v + t * w + u.cross(t)
    }

    companion object {
        val IDENTITY = Quat(0f, 0f, 0f, 1f)

        /** The simulator sends only x, y, z; w is whatever makes the quaternion unit length. */
        fun fromPacked(x: Float, y: Float, z: Float): Quat {
            val s = 1f - (x * x + y * y + z * z)
            return Quat(x, y, z, if (s > 0f) sqrt(s) else 0f)
        }

        fun aroundZ(angle: Float) = Quat(0f, 0f, kotlin.math.sin(angle / 2), kotlin.math.cos(angle / 2))
    }
}
