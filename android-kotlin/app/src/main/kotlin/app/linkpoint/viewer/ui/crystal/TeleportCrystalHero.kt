package app.linkpoint.viewer.ui.crystal

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.linkpoint.core.model.TeleportPhase
import kotlin.math.min

object TeleportCrystalHeroDefaults {
    const val MAX_GAP: Float = 256f / 3f // 85.333336f (~85.3f)
    const val MASTER_SIZE: Float = CrystalGeometry.MASTER_CANVAS_SIZE // 512f

    fun calculateGap(percent: Float): Float {
        val validPct = percent.coerceIn(0f, 100f)
        return MAX_GAP * (1f - validPct / 100f)
    }

    fun calculateCoreRadius(percent: Float, isFailed: Boolean): Float {
        val validPct = percent.coerceIn(0f, 100f)
        return if (isFailed) {
            (14f * MASTER_SIZE) / 120f
        } else {
            (8f * MASTER_SIZE) / 120f + (validPct / 100f) * ((8f * MASTER_SIZE) / 120f)
        }
    }

    fun calculateCoreOpacity(percent: Float, isFailed: Boolean): Float {
        val validPct = percent.coerceIn(0f, 100f)
        return if (isFailed) 0.95f else (0.4f + (validPct / 100f) * 0.55f)
    }

    fun calculateScale(percent: Float, isFailed: Boolean): Float {
        val validPct = percent.coerceIn(0f, 100f)
        return if (isFailed) 1.0f else (1.0f + (validPct / 100f) * 0.05f)
    }
}

/**
 * Native Jetpack Compose Canvas rendering of the Teleport Crystal Hero animation,
 * matching web `TeleportCrystalHero.jsx` (512x512 master coordinate space).
 *
 * Adjusts pyramid separation gap dynamically from 85.3f to 0f as progress moves from 0% to 100%,
 * scales core glow radius and opacity, and transforms palette on failure.
 */
@Composable
fun TeleportCrystalHero(
    stepPercent: Float,
    phase: TeleportPhase,
    modifier: Modifier = Modifier,
    size: Dp = 120.dp
) {
    val isFailed = phase == TeleportPhase.FAILED
    val validPct = stepPercent.coerceIn(0f, 100f)

    val targetGap = TeleportCrystalHeroDefaults.calculateGap(validPct)
    val targetRadius = TeleportCrystalHeroDefaults.calculateCoreRadius(validPct, isFailed)
    val targetOpacity = TeleportCrystalHeroDefaults.calculateCoreOpacity(validPct, isFailed)
    val targetScale = TeleportCrystalHeroDefaults.calculateScale(validPct, isFailed)

    val animatedGap by animateFloatAsState(
        targetValue = targetGap,
        animationSpec = tween(durationMillis = 300, easing = FastOutSlowInEasing),
        label = "pyramidGap"
    )
    val animatedRadius by animateFloatAsState(
        targetValue = targetRadius,
        animationSpec = tween(durationMillis = 300, easing = FastOutSlowInEasing),
        label = "coreRadius"
    )
    val animatedOpacity by animateFloatAsState(
        targetValue = targetOpacity,
        animationSpec = tween(durationMillis = 300, easing = FastOutSlowInEasing),
        label = "coreOpacity"
    )
    val animatedScale by animateFloatAsState(
        targetValue = targetScale,
        animationSpec = tween(durationMillis = 300, easing = FastOutSlowInEasing),
        label = "crystalScale"
    )

    val colorScheme = MaterialTheme.colorScheme
    val pri = colorScheme.primary
    val priC = colorScheme.primaryContainer
    val sec = colorScheme.secondary
    val sec2 = colorScheme.tertiary
    val outv = colorScheme.outlineVariant

    val errColor = Color(0xFFEF4444)
    val errDark = Color(0xFF7F1D1D)
    val errLight = Color(0xFFF87171)
    val errMid = Color(0xFF991B1B)

    val priColor = if (isFailed) errColor else pri
    val strokeColor = if (isFailed) errColor else outv

    // Pre-allocate brushes outside draw scope
    val gradA = remember(isFailed, pri, priC) {
        if (isFailed) {
            Brush.linearGradient(
                colors = listOf(errColor, errDark),
                start = Offset(0f, 0f),
                end = Offset(CrystalGeometry.MASTER_CANVAS_SIZE, CrystalGeometry.MASTER_CANVAS_SIZE)
            )
        } else {
            Brush.linearGradient(
                colors = listOf(pri, priC),
                start = Offset(0f, 0f),
                end = Offset(CrystalGeometry.MASTER_CANVAS_SIZE, CrystalGeometry.MASTER_CANVAS_SIZE)
            )
        }
    }

    val gradB = remember(isFailed, sec2, sec) {
        if (isFailed) {
            Brush.linearGradient(
                colors = listOf(errLight, errMid),
                start = Offset(CrystalGeometry.MASTER_CANVAS_SIZE, 0f),
                end = Offset(0f, CrystalGeometry.MASTER_CANVAS_SIZE)
            )
        } else {
            Brush.linearGradient(
                colors = listOf(sec2, sec),
                start = Offset(CrystalGeometry.MASTER_CANVAS_SIZE, 0f),
                end = Offset(0f, CrystalGeometry.MASTER_CANVAS_SIZE)
            )
        }
    }

    val coreGlowBrush = remember(isFailed, pri, animatedRadius) {
        val glowColor = if (isFailed) errColor else pri
        Brush.radialGradient(
            colorStops = arrayOf(
                0.0f to Color.White.copy(alpha = 0.95f),
                0.5f to glowColor.copy(alpha = 0.8f),
                1.0f to glowColor.copy(alpha = 0f)
            ),
            center = Offset(256f, 256f),
            radius = animatedRadius.coerceAtLeast(1f)
        )
    }

    // Pre-allocate strokes outside draw scope
    val faceStroke = remember { Stroke(width = 1f, join = StrokeJoin.Round) }
    val ridgeStroke = remember { Stroke(width = 1f) }
    val ringStroke = remember {
        Stroke(
            width = 1f,
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(4f, 8f), 0f)
        )
    }

    val paths = CrystalGeometry.paths
    val topFaces = CrystalGeometry.top.faces
    val botFaces = CrystalGeometry.bot.faces

    Canvas(
        modifier = modifier
            .size(size)
            .semantics { contentDescription = "Teleport transition progress" }
    ) {
        val masterSize = CrystalGeometry.MASTER_CANVAS_SIZE
        val baseScale = min(this.size.width, this.size.height) / masterSize
        val tx = (this.size.width - masterSize * baseScale) / 2f
        val ty = (this.size.height - masterSize * baseScale) / 2f

        val curTopY = -animatedGap / 2f
        val curBotY = animatedGap / 2f

        withTransform({
            translate(tx, ty)
            scale(baseScale, baseScale, Offset.Zero)
            scale(animatedScale, animatedScale, Offset(256f, 256f))
        }) {
            // Ambient Ring
            drawCircle(
                color = priColor.copy(alpha = if (isFailed) 0.35f else 0.25f),
                radius = 204.8f,
                center = Offset(256f, 256f),
                style = ringStroke
            )

            // Bottom Pyramid Half
            withTransform({
                translate(0f, curBotY)
            }) {
                for (i in botFaces.indices) {
                    val path = paths.botFaces[i]
                    val (brush, opacity) = when (i) {
                        0 -> gradB to botFaces[0].opacity
                        1 -> gradA to botFaces[1].opacity
                        2 -> gradB to 0.6f
                        3 -> gradA to 0.6f
                        else -> gradA to 0.6f
                    }
                    drawPath(path = path, brush = brush, alpha = opacity)
                    drawPath(path = path, color = strokeColor, style = faceStroke)
                }
            }

            // Top Pyramid Half
            withTransform({
                translate(0f, curTopY)
            }) {
                for (i in topFaces.indices) {
                    val path = paths.topFaces[i]
                    val (brush, opacity) = when (i) {
                        0 -> gradA to topFaces[0].opacity
                        1 -> gradB to topFaces[1].opacity
                        2 -> gradA to 0.6f
                        3 -> gradB to 0.6f
                        else -> gradA to 0.6f
                    }
                    drawPath(path = path, brush = brush, alpha = opacity)
                    drawPath(path = path, color = strokeColor, style = faceStroke)
                }
                // Ridge
                drawPath(
                    path = paths.topRidge,
                    color = priColor.copy(alpha = if (isFailed) 0.6f else 0.45f),
                    style = ridgeStroke
                )
            }

            // Core Lighting Node
            drawCircle(
                brush = coreGlowBrush,
                radius = animatedRadius,
                center = Offset(256f, 256f),
                alpha = animatedOpacity
            )
        }
    }
}
