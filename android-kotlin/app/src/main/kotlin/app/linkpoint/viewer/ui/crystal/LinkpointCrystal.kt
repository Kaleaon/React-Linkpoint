package app.linkpoint.viewer.ui.crystal

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.linkpoint.viewer.theme.LocalLinkpoint
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/**
 * Native Jetpack Compose Canvas rendering of the Linkpoint crystal brand mark,
 * matching web `LinkpointLogo.jsx` and master geometry in `linkpointCrystal.js`.
 */
@Composable
fun LinkpointCrystal(
    modifier: Modifier = Modifier,
    animated: Boolean = true
) {
    val colorScheme = MaterialTheme.colorScheme
    // LocalLinkpoint composition local subscription for dynamic brand token binding
    val localLinkpoint = LocalLinkpoint.current

    val pri = colorScheme.primary
    val priC = colorScheme.primaryContainer
    val sec = colorScheme.secondary
    val sec2 = colorScheme.tertiary
    val surf = colorScheme.surface
    val surf2 = colorScheme.surfaceVariant
    val ink = colorScheme.onBackground
    val outv = colorScheme.outlineVariant

    // Pre-allocate brushes outside draw scope
    val face1Brush = remember(pri, priC) {
        Brush.linearGradient(
            colors = listOf(pri, priC),
            start = Offset(0f, 0f),
            end = Offset(CrystalGeometry.MASTER_CANVAS_SIZE, CrystalGeometry.MASTER_CANVAS_SIZE)
        )
    }
    val face2Brush = remember(sec2, sec) {
        Brush.linearGradient(
            colors = listOf(sec2, sec),
            start = Offset(CrystalGeometry.MASTER_CANVAS_SIZE, 0f),
            end = Offset(0f, CrystalGeometry.MASTER_CANVAS_SIZE)
        )
    }
    val face3Brush = remember(sec, surf2) {
        Brush.linearGradient(
            colors = listOf(sec, surf2),
            start = Offset(256f, CrystalGeometry.MASTER_CANVAS_SIZE),
            end = Offset(256f, 0f)
        )
    }
    val face4Brush = remember(pri, sec2) {
        Brush.linearGradient(
            colors = listOf(pri, sec2),
            start = Offset(0f, CrystalGeometry.MASTER_CANVAS_SIZE),
            end = Offset(CrystalGeometry.MASTER_CANVAS_SIZE, 0f)
        )
    }
    val coreGlowBrush = remember(pri, sec) {
        Brush.radialGradient(
            colorStops = arrayOf(
                0.0f to Color.White,
                0.35f to pri.copy(alpha = 0.9f),
                1.0f to sec.copy(alpha = 0f)
            ),
            center = Offset(256f, 256f),
            radius = CrystalGeometry.CORE_R
        )
    }

    // Pre-allocate strokes outside draw scope
    val wireframeStroke = remember { Stroke(width = 1.5f, join = StrokeJoin.Round, cap = StrokeCap.Round) }
    val axisStroke = remember {
        Stroke(
            width = 1.5f,
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(4f, 6f), 0f)
        )
    }
    val orbitFarStroke = remember {
        Stroke(
            width = 2f,
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(4f, 12f), 0f)
        )
    }
    val orbitOuterStroke = remember { Stroke(width = 1f) }
    val faceStroke = remember { Stroke(width = 1.5f, join = StrokeJoin.Round, cap = StrokeCap.Round) }
    val baseStroke = remember { Stroke(width = 1.5f, join = StrokeJoin.Round) }

    // Hardware-accelerated animation transition for orbiting motes
    val transition = rememberInfiniteTransition(label = "LinkpointCrystalTransition")
    val orbitAngle by if (animated) {
        transition.animateFloat(
            initialValue = 0f,
            targetValue = 360f,
            animationSpec = infiniteRepeatable(
                animation = tween(durationMillis = 6000, easing = LinearEasing),
                repeatMode = RepeatMode.Restart
            ),
            label = "orbitAngle"
        )
    } else {
        remember { mutableFloatStateOf(0f) }
    }

    val paths = CrystalGeometry.paths

    Canvas(
        modifier = modifier
            .semantics { contentDescription = "Linkpoint crystal logo" }
    ) {
        val masterSize = CrystalGeometry.MASTER_CANVAS_SIZE
        val scale = min(size.width, size.height) / masterSize
        val tx = (size.width - masterSize * scale) / 2f
        val ty = (size.height - masterSize * scale) / 2f

        withTransform({
            translate(tx, ty)
            scale(scale, scale, Offset.Zero)
        }) {
            // ---- FAR LAYER (Depth model: passes behind the crystal) ----
            paths.wireframeFar.forEach { path ->
                drawPath(path = path, color = outv.copy(alpha = 0.6f), style = wireframeStroke)
            }
            drawPath(path = paths.axisVertical, color = outv.copy(alpha = 0.6f), style = axisStroke)
            drawPath(path = paths.axisHorizontal, color = outv.copy(alpha = 0.6f), style = axisStroke)

            drawPath(path = paths.orbitFarPath, color = sec2.copy(alpha = 0.16f), style = orbitFarStroke)
            drawPath(path = paths.orbitFarOuterPath, color = outv.copy(alpha = 0.55f), style = orbitOuterStroke)

            if (animated) {
                for (m in CrystalGeometry.motes) {
                    val motePhaseDeg = (orbitAngle - (m.beginDelaySec / CrystalGeometry.CYCLE_DURATION_SEC) * 360f) % 360f
                    val rad = Math.toRadians(motePhaseDeg.toDouble())
                    val sinVal = sin(rad).toFloat()
                    if (sinVal < 0) { // Far side of orbit
                        val cosVal = cos(rad).toFloat()
                        val cx = 256f + 200f * cosVal
                        val cy = 256f + 65f * sinVal
                        val moteColor = when (m.token) {
                            "pri" -> pri
                            "sec" -> sec
                            "sec2" -> sec2
                            else -> pri
                        }
                        drawCircle(color = moteColor.copy(alpha = 0.6f), radius = m.farR, center = Offset(cx, cy))
                    }
                }
            } else {
                for (m in CrystalGeometry.staticMotesFar) {
                    val moteColor = when (m.token) {
                        "pri" -> pri
                        "sec" -> sec
                        "sec2" -> sec2
                        else -> sec2
                    }
                    drawCircle(color = moteColor.copy(alpha = 0.6f), radius = m.r, center = Offset(m.cx, m.cy))
                }
            }

            // ---- SOLID LAYER: Bottom Pyramid ----
            drawPath(path = paths.botBase, color = surf)
            drawPath(path = paths.botBase, color = sec.copy(alpha = 0.6f), style = baseStroke)

            val botFaces = CrystalGeometry.bot.faces
            for (i in botFaces.indices) {
                val face = botFaces[i]
                val path = paths.botFaces[i]
                val brush = when (face.grad) {
                    FaceGrad.FACE1 -> face1Brush
                    FaceGrad.FACE2 -> face2Brush
                    FaceGrad.FACE3 -> face3Brush
                    FaceGrad.FACE4 -> face4Brush
                }
                drawPath(path = path, brush = brush, alpha = face.opacity)
                drawPath(path = path, color = ink, style = faceStroke)
            }

            // ---- SOLID LAYER: Top Pyramid ----
            drawPath(path = paths.topBase, color = surf)
            drawPath(path = paths.topBase, color = pri.copy(alpha = 0.6f), style = baseStroke)

            val topFaces = CrystalGeometry.top.faces
            for (i in topFaces.indices) {
                val face = topFaces[i]
                val path = paths.topFaces[i]
                val brush = when (face.grad) {
                    FaceGrad.FACE1 -> face1Brush
                    FaceGrad.FACE2 -> face2Brush
                    FaceGrad.FACE3 -> face3Brush
                    FaceGrad.FACE4 -> face4Brush
                }
                drawPath(path = path, brush = brush, alpha = face.opacity)
                drawPath(path = path, color = ink, style = faceStroke)
            }

            // ---- NEAR LAYER (Depth model: passes in front of the crystal) ----
            drawPath(path = paths.orbitNearPath, color = sec2.copy(alpha = 0.38f), style = orbitFarStroke)
            drawPath(path = paths.orbitNearOuterPath, color = outv, style = orbitOuterStroke)

            if (animated) {
                for (m in CrystalGeometry.motes) {
                    val motePhaseDeg = (orbitAngle - (m.beginDelaySec / CrystalGeometry.CYCLE_DURATION_SEC) * 360f) % 360f
                    val rad = Math.toRadians(motePhaseDeg.toDouble())
                    val sinVal = sin(rad).toFloat()
                    if (sinVal >= 0) { // Near side of orbit
                        val cosVal = cos(rad).toFloat()
                        val cx = 256f + 200f * cosVal
                        val cy = 256f + 65f * sinVal
                        val moteColor = when (m.token) {
                            "pri" -> pri
                            "sec" -> sec
                            "sec2" -> sec2
                            else -> pri
                        }
                        drawCircle(color = moteColor, radius = m.nearR, center = Offset(cx, cy))
                    }
                }
            } else {
                for (m in CrystalGeometry.staticMotesNear) {
                    val moteColor = when (m.token) {
                        "pri" -> pri
                        "sec" -> sec
                        "sec2" -> sec2
                        else -> pri
                    }
                    drawCircle(color = moteColor, radius = m.r, center = Offset(m.cx, m.cy))
                }
            }

            paths.wireframeNear.forEach { path ->
                drawPath(path = path, color = outv.copy(alpha = 0.6f), style = wireframeStroke)
            }

            // ---- CORE NODE (Illuminated center diamond and glow) ----
            drawCircle(brush = coreGlowBrush, radius = CrystalGeometry.CORE_R, center = Offset(256f, 256f))
            drawPath(path = paths.coreDiamond, color = ink)
        }
    }
}
