package app.linkpoint.viewer.ui.crystal

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.linkpoint.viewer.theme.LocalLinkpoint
import kotlin.math.min

enum class CrystalLoaderVariant {
    Inline,
    Block
}

/**
 * Animated crystal loading indicator matching `src/components/CrystalLoader.jsx`.
 * Two pyramid halves converge into the octahedron with a pulsing core and expanding ring.
 */
@Composable
fun CrystalLoader(
    modifier: Modifier = Modifier,
    size: Dp? = null,
    variant: CrystalLoaderVariant = CrystalLoaderVariant.Block
) {
    val colorScheme = MaterialTheme.colorScheme
    val localColors = LocalLinkpoint.current

    val pri = colorScheme.primary
    val priC = colorScheme.primaryContainer
    val sec = colorScheme.secondary
    val sec2 = colorScheme.tertiary
    val outv = colorScheme.outlineVariant

    // Pre-allocate brushes outside draw scope
    val gradA = remember(pri, priC) {
        Brush.linearGradient(
            colors = listOf(pri, priC),
            start = Offset(0f, 0f),
            end = Offset(CrystalGeometry.MASTER_CANVAS_SIZE, CrystalGeometry.MASTER_CANVAS_SIZE)
        )
    }
    val gradB = remember(sec2, sec) {
        Brush.linearGradient(
            colors = listOf(sec2, sec),
            start = Offset(CrystalGeometry.MASTER_CANVAS_SIZE, 0f),
            end = Offset(0f, CrystalGeometry.MASTER_CANVAS_SIZE)
        )
    }
    val gradCore = remember(pri) {
        Brush.radialGradient(
            colorStops = arrayOf(
                0.0f to Color.White.copy(alpha = 0.95f),
                0.55f to pri.copy(alpha = 0.8f),
                1.0f to pri.copy(alpha = 0f)
            ),
            center = Offset(256f, 256f),
            radius = CrystalGeometry.LOADER_R
        )
    }

    // Pre-allocate stroke styles outside draw scope
    val outlineStroke = remember { Stroke(width = 1f, join = StrokeJoin.Round) }
    val ridgeStroke = remember { Stroke(width = 1f) }
    val ringStroke = remember { Stroke(width = 1f) }

    // Hardware-accelerated infinite transition over 2.6s (2600ms) cycle
    val transition = rememberInfiniteTransition(label = "CrystalLoaderTransition")
    val convergenceProgress by transition.animateFloat(
        initialValue = 0f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(
            animation = keyframes {
                durationMillis = 2600
                0f at 0 using FastOutSlowInEasing
                0f at 312 using FastOutSlowInEasing
                1f at 1040 using FastOutSlowInEasing
                1f at 1612 using FastOutSlowInEasing
                0f at 2288 using FastOutSlowInEasing
                0f at 2600 using FastOutSlowInEasing
            },
            repeatMode = RepeatMode.Restart
        ),
        label = "convergenceProgress"
    )

    val defaultDp = if (variant == CrystalLoaderVariant.Inline) 16.dp else 88.dp
    val targetDp = size ?: defaultDp
    val effectiveModifier = modifier
        .defaultMinSize(minWidth = targetDp, minHeight = targetDp)
        .let { if (size != null) it.size(size) else it }
        .semantics { contentDescription = "Loading" }

    val paths = CrystalGeometry.paths

    Canvas(modifier = effectiveModifier) {
        val masterSize = CrystalGeometry.MASTER_CANVAS_SIZE
        val scaleFactor = min(this.size.width, this.size.height) / masterSize
        val tx = (this.size.width - masterSize * scaleFactor) / 2f
        val ty = (this.size.height - masterSize * scaleFactor) / 2f

        val topTranslateY = -64f * (1f - convergenceProgress)
        val botTranslateY = 64f * (1f - convergenceProgress)
        val coreScale = 0.55f + (1.1f - 0.55f) * convergenceProgress
        val coreOpacity = 0.2f + (1.0f - 0.2f) * convergenceProgress
        val ringRadius = 25.6f + (128f - 25.6f) * convergenceProgress
        val ringOpacity = 0.15f + (0.5f - 0.15f) * convergenceProgress

        withTransform({
            translate(tx, ty)
            scale(scaleFactor, scaleFactor, Offset.Zero)
        }) {
            // ---- Animated Ring ----
            drawCircle(
                color = pri,
                radius = ringRadius,
                center = Offset(256f, 256f),
                style = ringStroke,
                alpha = ringOpacity
            )

            // ---- Bottom Pyramid (Converging) ----
            withTransform({
                translate(0f, botTranslateY)
            }) {
                val botFaces = CrystalGeometry.bot.faces
                // Face 0: gradB, opacity bot.faces[0].opacity (0.9)
                drawPath(paths.botFaces[0], brush = gradB, alpha = botFaces[0].opacity)
                drawPath(paths.botFaces[0], color = outv, style = outlineStroke)

                // Face 1: gradA, opacity bot.faces[1].opacity (0.9)
                drawPath(paths.botFaces[1], brush = gradA, alpha = botFaces[1].opacity)
                drawPath(paths.botFaces[1], color = outv, style = outlineStroke)

                // Face 2: gradB, opacity 0.6
                drawPath(paths.botFaces[2], brush = gradB, alpha = 0.6f)
                drawPath(paths.botFaces[2], color = outv, style = outlineStroke)

                // Face 3: gradA, opacity 0.6
                drawPath(paths.botFaces[3], brush = gradA, alpha = 0.6f)
                drawPath(paths.botFaces[3], color = outv, style = outlineStroke)
            }

            // ---- Top Pyramid (Converging) ----
            withTransform({
                translate(0f, topTranslateY)
            }) {
                val topFaces = CrystalGeometry.top.faces
                // Face 0: gradA, opacity top.faces[0].opacity (1.0)
                drawPath(paths.topFaces[0], brush = gradA, alpha = topFaces[0].opacity)
                drawPath(paths.topFaces[0], color = outv, style = outlineStroke)

                // Face 1: gradB, opacity top.faces[1].opacity (1.0)
                drawPath(paths.topFaces[1], brush = gradB, alpha = topFaces[1].opacity)
                drawPath(paths.topFaces[1], color = outv, style = outlineStroke)

                // Face 2: gradA, opacity 0.6
                drawPath(paths.topFaces[2], brush = gradA, alpha = 0.6f)
                drawPath(paths.topFaces[2], color = outv, style = outlineStroke)

                // Face 3: gradB, opacity 0.6
                drawPath(paths.topFaces[3], brush = gradB, alpha = 0.6f)
                drawPath(paths.topFaces[3], color = outv, style = outlineStroke)

                // Ridge
                drawPath(paths.topRidge, color = pri.copy(alpha = 0.45f), style = ridgeStroke)
            }

            // ---- Pulsing Core Node ----
            withTransform({
                scale(coreScale, coreScale, Offset(256f, 256f))
            }) {
                drawCircle(
                    brush = gradCore,
                    radius = CrystalGeometry.LOADER_R,
                    center = Offset(256f, 256f),
                    alpha = coreOpacity
                )
            }
        }
    }
}
