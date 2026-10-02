package app.linkpoint.core

import app.linkpoint.core.scene.*
import kotlin.math.abs
import kotlin.math.sqrt
import org.junit.Assert.*
import org.junit.Test

class PrimVolumeTest {
    private fun near(a: Float, b: Float, eps: Float = 1e-3f) = assertTrue("$a vs $b", abs(a - b) <= eps)

    @Test fun defaultBoxFillsUnitCubeWithSixFaces() {
        val m = PrimVolume.build(PrimParams())
        assertEquals(listOf(0, 1, 2, 3, 4, 5), m.faces.map { it.faceIndex })
        val b = m.bounds()!!
        for (i in 0..2) { near(b[i], -0.5f); near(b[i + 3], 0.5f) }
        // 4 sides at two triangles each, plus two caps fanned from the centre at four triangles each.
        assertEquals(16, m.faces.sumOf { it.indices.size / 3 })
    }

    @Test fun boxNormalsPointOutwardAndAreUnit() {
        val m = PrimVolume.build(PrimParams())
        for (f in m.faces) for (i in 0 until f.vertexCount) {
            val nx = f.normals[i * 3]; val ny = f.normals[i * 3 + 1]; val nz = f.normals[i * 3 + 2]
            near(sqrt(nx * nx + ny * ny + nz * nz), 1f)
            // Outward: the normal agrees in sign with the vertex position along its dominant axis.
            val px = f.positions[i * 3]; val py = f.positions[i * 3 + 1]; val pz = f.positions[i * 3 + 2]
            assertTrue("face ${f.faceIndex} normal not outward", nx * px + ny * py + nz * pz > 0f)
        }
    }

    @Test fun triangleWindingMatchesNormals() {
        // Every triangle's geometric normal must agree with its vertex normals (front faces are CCW).
        for (p in listOf(PrimParams(), PrimParams(profileCurve = 0), PrimParams(profileCurve = 0, profileHollow = 0.5f, profileBegin = 0.2f))) {
            val m = PrimVolume.build(p)
            for (f in m.faces) {
                var i = 0
                while (i < f.indices.size) {
                    val a = f.indices[i] * 3; val b = f.indices[i + 1] * 3; val c = f.indices[i + 2] * 3
                    val ux = f.positions[b] - f.positions[a]; val uy = f.positions[b + 1] - f.positions[a + 1]; val uz = f.positions[b + 2] - f.positions[a + 2]
                    val vx = f.positions[c] - f.positions[a]; val vy = f.positions[c + 1] - f.positions[a + 1]; val vz = f.positions[c + 2] - f.positions[a + 2]
                    val gx = uy * vz - uz * vy; val gy = uz * vx - ux * vz; val gz = ux * vy - uy * vx
                    if (gx * gx + gy * gy + gz * gz > 1e-10f) {
                        val dot = gx * f.normals[a] + gy * f.normals[a + 1] + gz * f.normals[a + 2]
                        assertTrue("inverted triangle in face ${f.faceIndex}", dot > 0f)
                    }
                    i += 3
                }
            }
        }
    }

    @Test fun cylinderHasTopSideBottom() {
        val m = PrimVolume.build(PrimParams(profileCurve = 0))
        assertEquals(listOf(0, 1, 2), m.faces.map { it.faceIndex })
        val b = m.bounds()!!
        near(b[0], -0.5f); near(b[3], 0.5f); near(b[2], -0.5f); near(b[5], 0.5f)
        for (i in 0 until m.faces[1].vertexCount) {
            val x = m.faces[1].positions[i * 3]; val y = m.faces[1].positions[i * 3 + 1]
            near(sqrt(x * x + y * y), 0.5f)
        }
    }

    @Test fun sphereIsARadiusHalfBall() {
        val m = PrimVolume.build(PrimParams(pathCurve = 0x20, profileCurve = 5))
        val b = m.bounds()!!
        for (i in 0..2) { near(b[i], -0.5f, 0.02f); near(b[i + 3], 0.5f, 0.02f) }
        for (f in m.faces) for (i in 0 until f.vertexCount) {
            val x = f.positions[i * 3]; val y = f.positions[i * 3 + 1]; val z = f.positions[i * 3 + 2]
            near(sqrt(x * x + y * y + z * z), 0.5f, 0.01f)
            // Outward normals on a sphere point along the position.
            val d = (x * f.normals[i * 3] + y * f.normals[i * 3 + 1] + z * f.normals[i * 3 + 2]) / 0.5f
            if (sqrt(x * x + y * y) > 0.02f) assertTrue("sphere normal not outward ($d)", d > 0.9f)
        }
    }

    @Test fun torusHasOuterRadiusHalfAndAHole() {
        val m = PrimVolume.build(PrimParams(pathCurve = 0x20, profileCurve = 0, pathScaleX = 1f, pathScaleY = 0.25f))
        val b = m.bounds()!!
        near(b[3], 0.5f, 0.02f); near(b[0], -0.5f, 0.02f)
        assertTrue(b[5] < 0.2f)
        var minR = Float.MAX_VALUE
        for (f in m.faces) for (i in 0 until f.vertexCount) { val x = f.positions[i * 3]; val y = f.positions[i * 3 + 1]; minR = minOf(minR, sqrt(x * x + y * y)) }
        assertTrue("torus should have a hole", minR > 0.1f)
    }

    @Test fun pathCutShortensTheBox() {
        val m = PrimVolume.build(PrimParams(pathBegin = 0.25f, pathEnd = 0.75f))
        val b = m.bounds()!!
        near(b[2], -0.25f); near(b[5], 0.25f)
    }

    @Test fun taperAndTopSizeScaleTheTop() {
        val m = PrimVolume.build(PrimParams(pathScaleX = 0.5f, pathScaleY = 0.5f))
        // At the top the cross-section is half size.
        val top = m.faces.first { it.faceIndex == 0 }
        for (i in 0 until top.vertexCount) assertTrue(abs(top.positions[i * 3]) <= 0.25f + 1e-3f)
        val tapered = PrimVolume.build(PrimParams(taperX = 1f, taperY = 1f))
        val tt = tapered.faces.first { it.faceIndex == 0 }
        for (i in 0 until tt.vertexCount) { near(tt.positions[i * 3], 0f); near(tt.positions[i * 3 + 1], 0f) }
    }

    @Test fun shearMovesTheTop() {
        val m = PrimVolume.build(PrimParams(shearX = 0.5f))
        near(m.bounds()!![3], 1.0f)
    }

    @Test fun twistRotatesTheTop() {
        val m = PrimVolume.build(PrimParams(twist = 0.5f))
        // A quarter turn (90 degrees): the top face's +X,+Y corner moves to -X,+Y.
        val top = m.faces.first { it.faceIndex == 0 }
        var found = false
        for (i in 0 until top.vertexCount) if (abs(top.positions[i * 3] + 0.5f) < 1e-3f && abs(top.positions[i * 3 + 1] - 0.5f) < 1e-3f) found = true
        assertTrue(found)
        assertTrue(m.faces.sumOf { it.vertexCount } > 24) // twisted sides are subdivided
    }

    @Test fun hollowBoxHasAnInnerFace() {
        val m = PrimVolume.build(PrimParams(profileHollow = 0.5f))
        val idx = m.faces.map { it.faceIndex }
        assertTrue(6 in idx) // inner side = m + 2
        assertTrue(0 in idx && 5 in idx)
        // Inner walls sit inside the outer ones.
        val inner = m.faces.first { it.faceIndex == 6 }
        for (i in 0 until inner.vertexCount) assertTrue(abs(inner.positions[i * 3]) <= 0.25f + 1e-3f)
    }

    @Test fun profileCutLeavesFlatCutFaces() {
        val m = PrimVolume.build(PrimParams(profileBegin = 0f, profileEnd = 0.5f, profileCurve = 0))
        val idx = m.faces.map { it.faceIndex }
        assertTrue(4 in idx && 5 in idx) // cut faces are numbered m + 3 and m + 4; a circle has m = 1
    }

    @Test fun everyProfileAndPathBuildsFiniteGeometry() {
        for (profile in listOf(0, 1, 2, 3, 4, 5)) for (path in listOf(0x10, 0x20, 0x30)) for (hollow in listOf(0f, 0.4f)) for (cut in listOf(0f, 0.3f)) {
            val m = PrimVolume.build(PrimParams(pathCurve = path, profileCurve = profile, profileHollow = hollow, profileBegin = cut, pathBegin = cut, twist = 0.25f, taperX = 0.3f, revolutions = 1f))
            for (f in m.faces) {
                assertTrue(f.positions.all { it.isFinite() })
                assertTrue(f.normals.all { it.isFinite() })
                assertTrue(f.indices.all { it in 0 until f.vertexCount })
            }
        }
    }
}
