package app.linkpoint.viewer.ui.crystal

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Path

/**
 * Coordinate models and pre-allocated Path objects for the Linkpoint master crystal octahedron,
 * based on web master geometry in `src/components/linkpointCrystal.js` (512x512 master coordinate space).
 */

enum class FaceGrad {
    FACE1,
    FACE2,
    FACE3,
    FACE4
}

data class CrystalPoint(val x: Float, val y: Float) {
    fun toOffset() = Offset(x, y)
}

data class CrystalFace(
    val grad: FaceGrad,
    val points: List<CrystalPoint>,
    val opacity: Float = 1.0f
)

data class CrystalPyramid(
    val base: List<CrystalPoint>,
    val faces: List<CrystalFace>,
    val ridge: List<CrystalPoint>? = null,
    val faceA: List<CrystalPoint>? = null,
    val faceB: List<CrystalPoint>? = null
)

data class StaticMote(
    val cx: Float,
    val cy: Float,
    val r: Float,
    val token: String
)

data class OrbitMote(
    val nearR: Float,
    val farR: Float,
    val token: String,
    val beginDelaySec: Float
)

object CrystalGeometry {
    const val MASTER_CANVAS_SIZE = 512f
    const val CYCLE_DURATION_SEC = 6f

    val motes = listOf(
        OrbitMote(nearR = 4f, farR = 3f, token = "pri", beginDelaySec = 0f),
        OrbitMote(nearR = 5f, farR = 3.5f, token = "sec2", beginDelaySec = -2f),
        OrbitMote(nearR = 3f, farR = 2.25f, token = "sec", beginDelaySec = -4f)
    )

    val top = CrystalPyramid(
        base = listOf(
            CrystalPoint(392f, 170f),
            CrystalPoint(256f, 220f),
            CrystalPoint(120f, 170f),
            CrystalPoint(256f, 120f)
        ),
        faces = listOf(
            CrystalFace(
                grad = FaceGrad.FACE1,
                points = listOf(CrystalPoint(256f, 40f), CrystalPoint(392f, 170f), CrystalPoint(256f, 220f)),
                opacity = 1.0f
            ),
            CrystalFace(
                grad = FaceGrad.FACE2,
                points = listOf(CrystalPoint(256f, 40f), CrystalPoint(256f, 220f), CrystalPoint(120f, 170f)),
                opacity = 1.0f
            ),
            CrystalFace(
                grad = FaceGrad.FACE3,
                points = listOf(CrystalPoint(256f, 40f), CrystalPoint(120f, 170f), CrystalPoint(256f, 120f)),
                opacity = 0.9f
            ),
            CrystalFace(
                grad = FaceGrad.FACE4,
                points = listOf(CrystalPoint(256f, 40f), CrystalPoint(256f, 120f), CrystalPoint(392f, 170f)),
                opacity = 0.9f
            )
        ),
        ridge = listOf(CrystalPoint(120f, 170f), CrystalPoint(256f, 120f), CrystalPoint(392f, 170f)),
        faceA = listOf(CrystalPoint(256f, 40f), CrystalPoint(120f, 170f), CrystalPoint(256f, 220f)),
        faceB = listOf(CrystalPoint(256f, 40f), CrystalPoint(256f, 220f), CrystalPoint(392f, 170f))
    )

    val bot = CrystalPyramid(
        base = listOf(
            CrystalPoint(392f, 342f),
            CrystalPoint(256f, 392f),
            CrystalPoint(120f, 342f),
            CrystalPoint(256f, 292f)
        ),
        faces = listOf(
            CrystalFace(
                grad = FaceGrad.FACE4,
                points = listOf(CrystalPoint(256f, 472f), CrystalPoint(392f, 342f), CrystalPoint(256f, 392f)),
                opacity = 0.9f
            ),
            CrystalFace(
                grad = FaceGrad.FACE3,
                points = listOf(CrystalPoint(256f, 472f), CrystalPoint(256f, 392f), CrystalPoint(120f, 342f)),
                opacity = 0.9f
            ),
            CrystalFace(
                grad = FaceGrad.FACE1,
                points = listOf(CrystalPoint(256f, 472f), CrystalPoint(120f, 342f), CrystalPoint(256f, 292f)),
                opacity = 0.9f
            ),
            CrystalFace(
                grad = FaceGrad.FACE2,
                points = listOf(CrystalPoint(256f, 472f), CrystalPoint(256f, 292f), CrystalPoint(392f, 342f)),
                opacity = 0.9f
            )
        ),
        ridge = listOf(CrystalPoint(120f, 342f), CrystalPoint(256f, 292f), CrystalPoint(392f, 342f)),
        faceA = listOf(CrystalPoint(256f, 472f), CrystalPoint(120f, 342f), CrystalPoint(256f, 392f)),
        faceB = listOf(CrystalPoint(256f, 472f), CrystalPoint(256f, 392f), CrystalPoint(392f, 342f))
    )

    val staticMotesFar = listOf(
        StaticMote(cx = 150f, cy = 201f, r = 3.5f, token = "sec2")
    )

    val staticMotesNear = listOf(
        StaticMote(cx = 56f, cy = 256f, r = 4f, token = "pri"),
        StaticMote(cx = 430f, cy = 280f, r = 3f, token = "sec")
    )

    val wireframeFarPolylines = listOf(
        listOf(CrystalPoint(82f, 256f), CrystalPoint(256f, 180f), CrystalPoint(430f, 256f)),
        listOf(CrystalPoint(22f, 256f), CrystalPoint(256f, 120f), CrystalPoint(490f, 256f))
    )

    val wireframeNearPolylines = listOf(
        listOf(CrystalPoint(430f, 256f), CrystalPoint(256f, 332f), CrystalPoint(82f, 256f)),
        listOf(CrystalPoint(490f, 256f), CrystalPoint(256f, 392f), CrystalPoint(22f, 256f))
    )

    val axisVertical = Pair(CrystalPoint(256f, 20f), CrystalPoint(256f, 492f))
    val axisHorizontal = Pair(CrystalPoint(22f, 256f), CrystalPoint(490f, 256f))

    val coreDiamond = listOf(
        CrystalPoint(256f, 242f),
        CrystalPoint(270f, 256f),
        CrystalPoint(256f, 270f),
        CrystalPoint(242f, 256f)
    )

    const val CORE_CX = 256f
    const val CORE_CY = 256f
    const val CORE_R = 45f
    const val LOADER_R = 64f
    const val RING_R = 204.8f

    // Pre-allocated Path singletons to eliminate allocation churn during draw cycles
    val paths: CachedPaths by lazy { CachedPaths() }
}

private fun createPolygonPath(points: List<CrystalPoint>): Path {
    val path = Path()
    if (points.isNotEmpty()) {
        path.moveTo(points[0].x, points[0].y)
        for (i in 1 until points.size) {
            path.lineTo(points[i].x, points[i].y)
        }
        path.close()
    }
    return path
}

private fun createPolylinePath(points: List<CrystalPoint>): Path {
    val path = Path()
    if (points.isNotEmpty()) {
        path.moveTo(points[0].x, points[0].y)
        for (i in 1 until points.size) {
            path.lineTo(points[i].x, points[i].y)
        }
    }
    return path
}

class CachedPaths {
    val topBase: Path = createPolygonPath(CrystalGeometry.top.base)
    val topFaces: List<Path> = CrystalGeometry.top.faces.map { createPolygonPath(it.points) }
    val topRidge: Path = createPolylinePath(CrystalGeometry.top.ridge ?: emptyList())

    val botBase: Path = createPolygonPath(CrystalGeometry.bot.base)
    val botFaces: List<Path> = CrystalGeometry.bot.faces.map { createPolygonPath(it.points) }
    val botRidge: Path = createPolylinePath(CrystalGeometry.bot.ridge ?: emptyList())

    val coreDiamond: Path = createPolygonPath(CrystalGeometry.coreDiamond)

    val wireframeFar: List<Path> = CrystalGeometry.wireframeFarPolylines.map { createPolylinePath(it) }
    val wireframeNear: List<Path> = CrystalGeometry.wireframeNearPolylines.map { createPolylinePath(it) }

    val axisVertical: Path = Path().apply {
        moveTo(CrystalGeometry.axisVertical.first.x, CrystalGeometry.axisVertical.first.y)
        lineTo(CrystalGeometry.axisVertical.second.x, CrystalGeometry.axisVertical.second.y)
    }

    val axisHorizontal: Path = Path().apply {
        moveTo(CrystalGeometry.axisHorizontal.first.x, CrystalGeometry.axisHorizontal.first.y)
        lineTo(CrystalGeometry.axisHorizontal.second.x, CrystalGeometry.axisHorizontal.second.y)
    }

    // Ellipse arcs:
    // Far path: M 56 256 A 200 65 0 0 1 456 256
    val orbitFarPath: Path = Path().apply {
        arcTo(
            rect = Rect(56f, 191f, 456f, 321f),
            startAngleDegrees = 180f,
            sweepAngleDegrees = 180f,
            forceMoveTo = false
        )
    }

    // Far outer path: M 41 256 A 215 72 0 0 1 471 256
    val orbitFarOuterPath: Path = Path().apply {
        arcTo(
            rect = Rect(41f, 184f, 471f, 328f),
            startAngleDegrees = 180f,
            sweepAngleDegrees = 180f,
            forceMoveTo = false
        )
    }

    // Near path: M 56 256 A 200 65 0 0 0 456 256
    val orbitNearPath: Path = Path().apply {
        arcTo(
            rect = Rect(56f, 191f, 456f, 321f),
            startAngleDegrees = 0f,
            sweepAngleDegrees = 180f,
            forceMoveTo = false
        )
    }

    // Near outer path: M 41 256 A 215 72 0 0 0 471 256
    val orbitNearOuterPath: Path = Path().apply {
        arcTo(
            rect = Rect(41f, 184f, 471f, 328f),
            startAngleDegrees = 0f,
            sweepAngleDegrees = 180f,
            forceMoveTo = false
        )
    }
}
