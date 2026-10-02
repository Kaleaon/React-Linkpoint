package app.linkpoint.core

import app.linkpoint.core.audio.Listener
import app.linkpoint.core.audio.SpatialAudio
import app.linkpoint.core.scene.Vec3
import kotlin.math.PI
import org.junit.Assert.*
import org.junit.Test

class SpatialAudioTest {
    // A listener at the origin facing +X (east). Its right-hand side is -Y, its left is +Y.
    private val east = Listener(Vec3.ZERO, Vec3(1f, 0f, 0f))

    private fun at(x: Float, y: Float, z: Float = 0f, gain: Float = 1f, radius: Float = 0f, who: Listener = east) =
        SpatialAudio.spatialize(who, Vec3(x, y, z), gain, radius)

    @Test fun straightAheadIsFullVolumeOnBothEarsWithinAMetre() {
        val p = at(1f, 0f)
        assertEquals(1f, p.left, 1e-4f); assertEquals(1f, p.right, 1e-4f); assertTrue(p.audible)
    }

    @Test fun volumeFollowsInverseDistance() {
        assertEquals(0.5f, at(2f, 0f).left, 1e-4f)
        assertEquals(0.25f, at(4f, 0f).left, 1e-4f)
        assertEquals(0.125f, at(8f, 0f).right, 1e-4f)
    }

    @Test fun insideTheReferenceDistanceThereIsNoLoudnessBoost() {
        val p = at(0.2f, 0f)
        assertTrue(p.left <= 1f && p.right <= 1f)
    }

    @Test fun aSoundToTheRightIsLouderInTheRightEar() {
        val p = at(0f, -5f) // -Y is east-facing right
        assertEquals("nothing in the left ear for a hard right pan", 0f, p.left, 1e-4f)
        assertEquals(0.2f, p.right, 1e-4f)
    }

    @Test fun aSoundToTheLeftIsLouderInTheLeftEar() {
        val p = at(0f, 5f)
        assertEquals(0f, p.right, 1e-4f); assertEquals(0.2f, p.left, 1e-4f)
    }

    @Test fun aSoundBehindIsCentred() {
        val p = at(-6f, 0f)
        assertEquals(p.left, p.right, 1e-4f); assertTrue(p.left > 0f)
    }

    @Test fun panningIsMonotonicAcrossTheStage() {
        var lastRight = -1f; var lastLeft = 2f
        for (i in 0..20) {
            val angle = PI.toFloat() * i / 20f           // sweep from the left (+Y) through the front to the right (-Y)
            val p = at(5f * kotlin.math.sin(angle), 5f * kotlin.math.cos(angle))
            assertTrue("right never decreases: ${p.right} < $lastRight", p.right >= lastRight - 1e-4f)
            assertTrue("left never increases: ${p.left} > $lastLeft", p.left <= lastLeft + 1e-4f)
            lastRight = p.right; lastLeft = p.left
        }
    }

    @Test fun turningTheListenerMovesTheSoundAcrossTheEars() {
        val source = Vec3(0f, -5f, 0f)
        val facingEast = SpatialAudio.spatialize(Listener.atYaw(Vec3.ZERO, 0f), source, 1f)
        val facingSouth = SpatialAudio.spatialize(Listener.atYaw(Vec3.ZERO, -(PI / 2).toFloat()), source, 1f) // now it is straight ahead
        val facingNorth = SpatialAudio.spatialize(Listener.atYaw(Vec3.ZERO, (PI / 2).toFloat()), source, 1f) // and now straight behind
        assertTrue(facingEast.right > facingEast.left + 0.1f)
        assertEquals(facingSouth.left, facingSouth.right, 1e-3f)
        assertEquals(facingNorth.left, facingNorth.right, 1e-3f)
        val facingWest = SpatialAudio.spatialize(Listener.atYaw(Vec3.ZERO, PI.toFloat()), source, 1f)
        assertTrue("turned right round, the same sound is on the left", facingWest.left > facingWest.right + 0.1f)
    }

    @Test fun theListenersPositionMatters() {
        val near = SpatialAudio.spatialize(Listener(Vec3(10f, 0f, 0f)), Vec3(12f, 0f, 0f), 1f)
        assertEquals(0.5f, near.left, 1e-4f)
        assertEquals(2f, near.distance, 1e-4f)
    }

    @Test fun gainScalesTheResultAndZeroGainIsSilent() {
        assertEquals(0.25f, at(2f, 0f, gain = 0.5f).left, 1e-4f)
        assertFalse(at(1f, 0f, gain = 0f).audible)
        assertEquals("gain above 1 is capped", 1f, at(1f, 0f, gain = 9f).left, 1e-4f)
    }

    @Test fun theRadiusIsACubeNotASphere() {
        assertTrue(at(9f, 0f, radius = 10f).audible)
        assertTrue("(8,8,8) is 13.9 m away but inside a 10 m cube", at(8f, 8f, 8f, radius = 10f).audible)
        assertFalse("outside the cube along one axis", at(10.5f, 0f, radius = 10f).audible)
        assertFalse("vertical offset counts too", at(0f, 0f, 11f, radius = 10f).audible)
        assertFalse(at(10f, 0f, radius = 10f).audible)
    }

    @Test fun theRadiusEdgeFadesInsteadOfClicking() {
        val inner = at(5f, 0f, radius = 10f).left / (1f / 5f)
        val edge = at(9.5f, 0f, radius = 10f).left / (1f / 9.5f)
        assertEquals(1f, inner, 1e-4f)
        assertEquals("halfway through the 10% fade band", 0.5f, edge, 1e-3f)
    }

    @Test fun withoutARadiusTheSoundFadesOutAtTheDefaultMaximum() {
        assertTrue(at(60f, 0f).audible)
        assertFalse(at(SpatialAudio.DEFAULT_MAX_DISTANCE, 0f).audible)
        assertFalse(at(200f, 0f).audible)
        val nearEdge = at(90f, 0f).left; val before = at(72f, 0f).left
        assertTrue(nearEdge < 1f / 90f); assertTrue(before > 0f)
    }

    @Test fun aSourceOnTopOfTheListenerHasNoNaNs() {
        val p = at(0f, 0f, 0f)
        assertFalse(p.left.isNaN() || p.right.isNaN()); assertTrue(p.audible)
        assertEquals(p.left, p.right, 1e-4f)
    }

    @Test fun veryCloseSourcesArePulledToTheCentre() {
        val close = at(0f, -0.1f) // hard right, but 10 cm away
        assertTrue("both ears hear it", close.left > 0.5f)
        val far = at(0f, -3f)
        assertEquals(0f, far.left, 1e-4f)
    }

    @Test fun anyInputGivesFiniteNonNegativeVolumes() {
        val rnd = java.util.Random(7)
        repeat(2000) {
            fun r(scale: Float) = (rnd.nextFloat() - 0.5f) * scale
            val yaw = r(12f)
            val p = SpatialAudio.spatialize(Listener.atYaw(Vec3(r(300f), r(300f), r(300f)), yaw), Vec3(r(300f), r(300f), r(300f)), rnd.nextFloat() * 1.5f, if (rnd.nextBoolean()) 0f else rnd.nextFloat() * 50f)
            assertTrue(p.left.isFinite() && p.right.isFinite() && p.left >= 0f && p.right <= 1f && p.left <= 1f && p.right >= 0f)
        }
    }
}
