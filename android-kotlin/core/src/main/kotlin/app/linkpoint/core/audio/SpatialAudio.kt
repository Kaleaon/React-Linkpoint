package app.linkpoint.core.audio

import app.linkpoint.core.scene.Vec3
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/** Where the ears are: [position] in region metres, [forward] the way the listener faces, [up] (Second Life is Z-up). */
data class Listener(val position: Vec3, val forward: Vec3 = Vec3(1f, 0f, 0f), val up: Vec3 = Vec3(0f, 0f, 1f)) {
    companion object {
        /** A listener facing [yaw] radians (0 faces +X, east, like the avatar's body yaw). */
        fun atYaw(position: Vec3, yaw: Float) = Listener(position, Vec3(cos(yaw), sin(yaw), 0f))
    }
}

/**
 * What to feed a stereo output for one sound: per-channel volumes (0..1, already including the sound's own gain and the
 * distance), plus the distance itself and whether it is worth playing at all.
 */
data class SpatialParams(val left: Float, val right: Float, val distance: Float, val audible: Boolean) {
    val loudness: Float get() = max(left, right)
}

/**
 * Turns "a sound is at P with gain G and radius R" and "the listener is here, facing there" into left/right volumes.
 *
 * - **Distance:** inverse-distance rolloff with a 1 m reference (full volume inside a metre, half at 2 m, a quarter at 4 m),
 *   then a fade to silence over the last quarter of [maxDistance] so sounds do not click off.
 * - **Radius:** the sound-radius a script sets is the half-width of a *cube* around the source outside which the sound is
 *   silent (llSetSoundRadius); we fade across the outer 10 % of it. A radius of 0 means "no limit" and [maxDistance] applies.
 * - **Pan:** constant-power panning on the sideways component of the direction to the source, relative to where the listener
 *   faces. Centre is full volume on both channels, directly left or right is full on one and silent on the other. Sources
 *   closer than a metre are pulled towards the centre (you cannot tell which side of your head a sound at your feet is on).
 *
 * This is a model chosen for plausibility, not a copy of any viewer's mixer.
 */
object SpatialAudio {
    const val REFERENCE_DISTANCE = 1f
    const val DEFAULT_MAX_DISTANCE = 96f
    private const val SILENT_BELOW = 0.002f
    private val SQRT2 = sqrt(2f)

    fun spatialize(listener: Listener, source: Vec3, gain: Float, radius: Float = 0f, maxDistance: Float = DEFAULT_MAX_DISTANCE): SpatialParams {
        val to = source - listener.position
        val dist = to.length()
        val g = gain.coerceIn(0f, 1f)
        if (g <= 0f) return SpatialParams(0f, 0f, dist, false)

        // Radius: a cube around the *source*, so the test uses the listener's offset along each axis.
        var fade = 1f
        if (radius > 0f) {
            val edge = max(abs(to.x), max(abs(to.y), abs(to.z)))
            if (edge >= radius) return SpatialParams(0f, 0f, dist, false)
            val start = radius * 0.9f
            if (edge > start) fade = (radius - edge) / (radius - start)
        } else {
            if (dist >= maxDistance) return SpatialParams(0f, 0f, dist, false)
            val start = maxDistance * 0.75f
            if (dist > start) fade = (maxDistance - dist) / (maxDistance - start)
        }

        val attenuation = REFERENCE_DISTANCE / max(dist, REFERENCE_DISTANCE)
        val level = g * attenuation * fade
        if (level < SILENT_BELOW) return SpatialParams(0f, 0f, dist, false)

        // Sideways position in [-1, 1]; positive is the listener's right.
        val right = listener.forward.cross(listener.up).normalizedOrZero()
        var pan = if (dist > 1e-4f) (to.dot(right) / dist).coerceIn(-1f, 1f) else 0f
        if (dist < REFERENCE_DISTANCE) pan *= dist / REFERENCE_DISTANCE
        val angle = (pan + 1f) * (PI.toFloat() / 4f)
        val l = min(1f, SQRT2 * cos(angle)) * level
        val r = min(1f, SQRT2 * sin(angle)) * level
        return SpatialParams(l, r, dist, true)
    }

    private fun Vec3.normalizedOrZero(): Vec3 { val l = length(); return if (l > 1e-9f) this * (1f / l) else Vec3.ZERO }
}
