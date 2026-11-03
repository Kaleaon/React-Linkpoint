package app.linkpoint.viewer.ui.crystal

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class CrystalGeometryTest {

    @Test
    fun testMasterCoordinateFidelity() {
        // Master Canvas Size
        assertEquals(512f, CrystalGeometry.MASTER_CANVAS_SIZE, 0.001f)

        // Top base points: 392,170 256,220 120,170 256,120
        val topBase = CrystalGeometry.top.base
        assertEquals(4, topBase.size)
        assertEquals(CrystalPoint(392f, 170f), topBase[0])
        assertEquals(CrystalPoint(256f, 220f), topBase[1])
        assertEquals(CrystalPoint(120f, 170f), topBase[2])
        assertEquals(CrystalPoint(256f, 120f), topBase[3])

        // Top faces
        val topFaces = CrystalGeometry.top.faces
        assertEquals(4, topFaces.size)
        assertEquals(FaceGrad.FACE1, topFaces[0].grad)
        assertEquals(1.0f, topFaces[0].opacity, 0.001f)
        assertEquals(listOf(CrystalPoint(256f, 40f), CrystalPoint(392f, 170f), CrystalPoint(256f, 220f)), topFaces[0].points)

        assertEquals(FaceGrad.FACE2, topFaces[1].grad)
        assertEquals(1.0f, topFaces[1].opacity, 0.001f)
        assertEquals(listOf(CrystalPoint(256f, 40f), CrystalPoint(256f, 220f), CrystalPoint(120f, 170f)), topFaces[1].points)

        assertEquals(FaceGrad.FACE3, topFaces[2].grad)
        assertEquals(0.9f, topFaces[2].opacity, 0.001f)
        assertEquals(listOf(CrystalPoint(256f, 40f), CrystalPoint(120f, 170f), CrystalPoint(256f, 120f)), topFaces[2].points)

        assertEquals(FaceGrad.FACE4, topFaces[3].grad)
        assertEquals(0.9f, topFaces[3].opacity, 0.001f)
        assertEquals(listOf(CrystalPoint(256f, 40f), CrystalPoint(256f, 120f), CrystalPoint(392f, 170f)), topFaces[3].points)

        // Bot base points: 392,342 256,392 120,342 256,292
        val botBase = CrystalGeometry.bot.base
        assertEquals(4, botBase.size)
        assertEquals(CrystalPoint(392f, 342f), botBase[0])
        assertEquals(CrystalPoint(256f, 392f), botBase[1])
        assertEquals(CrystalPoint(120f, 342f), botBase[2])
        assertEquals(CrystalPoint(256f, 292f), botBase[3])

        // Bot faces
        val botFaces = CrystalGeometry.bot.faces
        assertEquals(4, botFaces.size)
        assertEquals(FaceGrad.FACE4, botFaces[0].grad)
        assertEquals(0.9f, botFaces[0].opacity, 0.001f)
        assertEquals(listOf(CrystalPoint(256f, 472f), CrystalPoint(392f, 342f), CrystalPoint(256f, 392f)), botFaces[0].points)

        assertEquals(FaceGrad.FACE3, botFaces[1].grad)
        assertEquals(0.9f, botFaces[1].opacity, 0.001f)
        assertEquals(listOf(CrystalPoint(256f, 472f), CrystalPoint(256f, 392f), CrystalPoint(120f, 342f)), botFaces[1].points)

        assertEquals(FaceGrad.FACE1, botFaces[2].grad)
        assertEquals(0.9f, botFaces[2].opacity, 0.001f)
        assertEquals(listOf(CrystalPoint(256f, 472f), CrystalPoint(120f, 342f), CrystalPoint(256f, 292f)), botFaces[2].points)

        assertEquals(FaceGrad.FACE2, botFaces[3].grad)
        assertEquals(0.9f, botFaces[3].opacity, 0.001f)
        assertEquals(listOf(CrystalPoint(256f, 472f), CrystalPoint(256f, 292f), CrystalPoint(392f, 342f)), botFaces[3].points)

        // Core diamond: 256,242 270,256 256,270 242,256
        assertEquals(
            listOf(
                CrystalPoint(256f, 242f),
                CrystalPoint(270f, 256f),
                CrystalPoint(256f, 270f),
                CrystalPoint(242f, 256f)
            ),
            CrystalGeometry.coreDiamond
        )
    }

    @Test
    fun testRidgeAndWireframeFidelity() {
        // Ridges
        assertEquals(
            listOf(CrystalPoint(120f, 170f), CrystalPoint(256f, 120f), CrystalPoint(392f, 170f)),
            CrystalGeometry.top.ridge
        )
        assertEquals(
            listOf(CrystalPoint(120f, 342f), CrystalPoint(256f, 292f), CrystalPoint(392f, 342f)),
            CrystalGeometry.bot.ridge
        )

        // Static motes
        assertEquals(1, CrystalGeometry.staticMotesFar.size)
        assertEquals(StaticMote(150f, 201f, 3.5f, "sec2"), CrystalGeometry.staticMotesFar[0])

        assertEquals(2, CrystalGeometry.staticMotesNear.size)
        assertEquals(StaticMote(56f, 256f, 4f, "pri"), CrystalGeometry.staticMotesNear[0])
        assertEquals(StaticMote(430f, 280f, 3f, "sec"), CrystalGeometry.staticMotesNear[1])

        // Orbit motes
        assertEquals(3, CrystalGeometry.motes.size)
        assertEquals(OrbitMote(nearR = 4f, farR = 3f, token = "pri", beginDelaySec = 0f), CrystalGeometry.motes[0])
        assertEquals(OrbitMote(nearR = 5f, farR = 3.5f, token = "sec2", beginDelaySec = -2f), CrystalGeometry.motes[1])
        assertEquals(OrbitMote(nearR = 3f, farR = 2.25f, token = "sec", beginDelaySec = -4f), CrystalGeometry.motes[2])

        // Wireframe
        assertEquals(2, CrystalGeometry.wireframeFarPolylines.size)
        assertEquals(2, CrystalGeometry.wireframeNearPolylines.size)
        assertEquals(Pair(CrystalPoint(256f, 20f), CrystalPoint(256f, 492f)), CrystalGeometry.axisVertical)
        assertEquals(Pair(CrystalPoint(22f, 256f), CrystalPoint(490f, 256f)), CrystalGeometry.axisHorizontal)
    }

    @Test
    fun testCachedPathsSingleton() {
        val paths1 = CrystalGeometry.paths
        val paths2 = CrystalGeometry.paths
        assertNotNull(paths1)
        assertSame(paths1, paths2)
        assertEquals(4, paths1.topFaces.size)
        assertEquals(4, paths1.botFaces.size)
        assertNotNull(paths1.topBase)
        assertNotNull(paths1.botBase)
        assertNotNull(paths1.coreDiamond)
    }

    @Test
    fun testCrystalLoaderVariants() {
        assertEquals(2, CrystalLoaderVariant.values().size)
        assertTrue(CrystalLoaderVariant.values().contains(CrystalLoaderVariant.Inline))
        assertTrue(CrystalLoaderVariant.values().contains(CrystalLoaderVariant.Block))
    }

    @Test
    fun testLauncherForegroundVectorFidelity() {
        val launcherXmlFile = File("src/main/res/drawable/ic_launcher_foreground.xml")
        val content = if (launcherXmlFile.exists()) {
            launcherXmlFile.readText()
        } else {
            File("app/src/main/res/drawable/ic_launcher_foreground.xml").readText()
        }

        // Viewport constraints: must not exceed 108dp
        assertTrue(content.contains("android:viewportWidth=\"108\""))
        assertTrue(content.contains("android:viewportHeight=\"108\""))
        assertTrue(content.contains("android:width=\"108dp\""))
        assertTrue(content.contains("android:height=\"108dp\""))

        // Distinct vector paths for top pyramid faces
        assertTrue(content.contains("top_face_front_right"))
        assertTrue(content.contains("top_face_front_left"))
        assertTrue(content.contains("top_face_back_left"))
        assertTrue(content.contains("top_face_back_right"))

        // Distinct vector paths for bottom pyramid faces
        assertTrue(content.contains("bot_face_front_right"))
        assertTrue(content.contains("bot_face_front_left"))
        assertTrue(content.contains("bot_face_back_left"))
        assertTrue(content.contains("bot_face_back_right"))

        // Distinct center core diamond
        assertTrue(content.contains("core_diamond"))
    }
}
