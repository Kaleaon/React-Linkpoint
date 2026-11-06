package app.linkpoint.viewer.ui.crystal

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TeleportCrystalHeroTest {

    @Test
    fun testPyramidGapDynamicConvergence() {
        // Criterion 3: TeleportCrystalHero adjusts pyramid gap dynamically from 85.3f to 0f as progress advances from 0% to 100%.
        val gapAt0 = TeleportCrystalHeroDefaults.calculateGap(0f)
        assertEquals(85.333336f, gapAt0, 0.05f)

        val gapAt25 = TeleportCrystalHeroDefaults.calculateGap(25f)
        assertEquals(64.0f, gapAt25, 0.05f)

        val gapAt50 = TeleportCrystalHeroDefaults.calculateGap(50f)
        assertEquals(42.666668f, gapAt50, 0.05f)

        val gapAt75 = TeleportCrystalHeroDefaults.calculateGap(75f)
        assertEquals(21.333334f, gapAt75, 0.05f)

        val gapAt100 = TeleportCrystalHeroDefaults.calculateGap(100f)
        assertEquals(0f, gapAt100, 0.001f)
    }

    @Test
    fun testCoreRadiusAndOpacityScaling() {
        // At 0% progress (not failed)
        val radiusAt0 = TeleportCrystalHeroDefaults.calculateCoreRadius(0f, isFailed = false)
        val expectedRadius0 = (8f * 512f) / 120f
        assertEquals(expectedRadius0, radiusAt0, 0.01f)

        val opacityAt0 = TeleportCrystalHeroDefaults.calculateCoreOpacity(0f, isFailed = false)
        assertEquals(0.4f, opacityAt0, 0.01f)

        val scaleAt0 = TeleportCrystalHeroDefaults.calculateScale(0f, isFailed = false)
        assertEquals(1.0f, scaleAt0, 0.01f)

        // At 100% progress (not failed)
        val radiusAt100 = TeleportCrystalHeroDefaults.calculateCoreRadius(100f, isFailed = false)
        val expectedRadius100 = (16f * 512f) / 120f
        assertEquals(expectedRadius100, radiusAt100, 0.01f)

        val opacityAt100 = TeleportCrystalHeroDefaults.calculateCoreOpacity(100f, isFailed = false)
        assertEquals(0.95f, opacityAt100, 0.01f)

        val scaleAt100 = TeleportCrystalHeroDefaults.calculateScale(100f, isFailed = false)
        assertEquals(1.05f, scaleAt100, 0.01f)

        // Failure state overrides
        val failedRadius = TeleportCrystalHeroDefaults.calculateCoreRadius(50f, isFailed = true)
        val expectedFailedRadius = (14f * 512f) / 120f
        assertEquals(expectedFailedRadius, failedRadius, 0.01f)

        val failedOpacity = TeleportCrystalHeroDefaults.calculateCoreOpacity(50f, isFailed = true)
        assertEquals(0.95f, failedOpacity, 0.01f)

        val failedScale = TeleportCrystalHeroDefaults.calculateScale(50f, isFailed = true)
        assertEquals(1.0f, failedScale, 0.01f)
    }

    @Test
    fun testMilestoneSequentialHighlights() {
        // Criterion 4: All four phase milestones highlight sequentially when stepPercent reaches 15%, 40%, 65%, and 90%.
        assertEquals(4, TELEPORT_MILESTONES.size)
        assertEquals("Resolve", TELEPORT_MILESTONES[0].label)
        assertEquals(15, TELEPORT_MILESTONES[0].minPercent)

        assertEquals("Contact", TELEPORT_MILESTONES[1].label)
        assertEquals(40, TELEPORT_MILESTONES[1].minPercent)

        assertEquals("Prepare", TELEPORT_MILESTONES[2].label)
        assertEquals(65, TELEPORT_MILESTONES[2].minPercent)

        assertEquals("Arrive", TELEPORT_MILESTONES[3].label)
        assertEquals(90, TELEPORT_MILESTONES[3].minPercent)

        fun reachedCount(percent: Int): Int =
            TELEPORT_MILESTONES.count { percent >= it.minPercent }

        // Below 15%
        assertEquals(0, reachedCount(10))
        assertFalse(10 >= TELEPORT_MILESTONES[0].minPercent)

        // At 15%: Resolve reached
        assertEquals(1, reachedCount(15))
        assertTrue(15 >= TELEPORT_MILESTONES[0].minPercent)
        assertFalse(15 >= TELEPORT_MILESTONES[1].minPercent)

        // At 40%: Contact reached
        assertEquals(2, reachedCount(40))
        assertTrue(40 >= TELEPORT_MILESTONES[1].minPercent)
        assertFalse(40 >= TELEPORT_MILESTONES[2].minPercent)

        // At 65%: Prepare reached
        assertEquals(3, reachedCount(65))
        assertTrue(65 >= TELEPORT_MILESTONES[2].minPercent)
        assertFalse(65 >= TELEPORT_MILESTONES[3].minPercent)

        // At 90%: Arrive reached
        assertEquals(4, reachedCount(90))
        assertTrue(90 >= TELEPORT_MILESTONES[3].minPercent)

        // At 100%: All 4 remain reached
        assertEquals(4, reachedCount(100))
    }
}
