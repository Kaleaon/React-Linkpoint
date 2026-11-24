package app.linkpoint.viewer.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.LocalMinimumInteractiveComponentSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsPropertyReceiver
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.linkpoint.viewer.R
import app.linkpoint.viewer.ui.crystal.CrystalLoader
import app.linkpoint.viewer.ui.crystal.CrystalLoaderVariant

/**
 * Supported layout orientations for [LinkpointLoadingState], matching web `SecondaryViewLoader`.
 */
enum class LinkpointLoadingLayout {
    Inline,
    Block,
}

/**
 * Shared sizing, spacing, touch-target, and TalkBack live-region defaults for [LinkpointLoadingState].
 */
object LinkpointLoadingStateDefaults {
    val DEFAULT_INLINE_SIZE: Dp = 16.dp
    val DEFAULT_BLOCK_SIZE: Dp = 88.dp
    val MIN_ACTION_TOUCH_TARGET: Dp = 48.dp
    val INLINE_SPACING: Dp = 8.dp
    val BLOCK_SPACING: Dp = 12.dp
    val INLINE_PADDING_HORIZONTAL: Dp = 8.dp
    val INLINE_PADDING_VERTICAL: Dp = 4.dp
    val BLOCK_PADDING: Dp = 16.dp
    val DEFAULT_LIVE_REGION: LiveRegionMode = LiveRegionMode.Polite

    fun resolveCrystalVariant(layout: LinkpointLoadingLayout): CrystalLoaderVariant = when (layout) {
        LinkpointLoadingLayout.Inline -> CrystalLoaderVariant.Inline
        LinkpointLoadingLayout.Block -> CrystalLoaderVariant.Block
    }

    fun resolveIndicatorSize(layout: LinkpointLoadingLayout, customSize: Dp? = null): Dp =
        customSize ?: when (layout) {
            LinkpointLoadingLayout.Inline -> DEFAULT_INLINE_SIZE
            LinkpointLoadingLayout.Block -> DEFAULT_BLOCK_SIZE
        }

    fun defaultContentPadding(layout: LinkpointLoadingLayout): PaddingValues = when (layout) {
        LinkpointLoadingLayout.Inline -> PaddingValues(
            horizontal = INLINE_PADDING_HORIZONTAL,
            vertical = INLINE_PADDING_VERTICAL,
        )
        LinkpointLoadingLayout.Block -> PaddingValues(BLOCK_PADDING)
    }

    fun resolveContentDescription(
        contentDescription: String?,
        label: String?,
        fallbackDescription: String,
    ): String {
        val explicit = contentDescription?.trim().orEmpty()
        if (explicit.isNotEmpty()) return explicit
        val labelText = label?.trim().orEmpty()
        if (labelText.isNotEmpty()) return labelText
        return fallbackDescription
    }

    fun buildStatusSemantics(
        resolvedDescription: String,
        liveRegionMode: LiveRegionMode = DEFAULT_LIVE_REGION,
    ): SemanticsPropertyReceiver.() -> Unit = {
        liveRegion = liveRegionMode
        contentDescription = resolvedDescription
    }
}

/**
 * Applies polite TalkBack live-region semantics and clears duplicate descendant announcements.
 */
fun Modifier.linkpointLoadingStatusSemantics(
    resolvedDescription: String,
    liveRegionMode: LiveRegionMode = LinkpointLoadingStateDefaults.DEFAULT_LIVE_REGION,
): Modifier = clearAndSetSemantics(
    LinkpointLoadingStateDefaults.buildStatusSemantics(resolvedDescription, liveRegionMode)
)

/**
 * Reusable secondary-view loading state container providing visual and accessibility parity
 * with web `SecondaryViewLoader.tsx`.
 *
 * Integrates [CrystalLoader], supports [LinkpointLoadingLayout.Inline] and [LinkpointLoadingLayout.Block]
 * orientations, announces loading updates politely to TalkBack via [LiveRegionMode.Polite], and enforces
 * minimum 48.dp touch targets on optional [action] controls.
 */
@Composable
fun LinkpointLoadingState(
    modifier: Modifier = Modifier,
    layout: LinkpointLoadingLayout = LinkpointLoadingLayout.Block,
    size: Dp? = null,
    label: String? = null,
    contentDescription: String? = null,
    liveRegionMode: LiveRegionMode = LinkpointLoadingStateDefaults.DEFAULT_LIVE_REGION,
    contentPadding: PaddingValues = LinkpointLoadingStateDefaults.defaultContentPadding(layout),
    labelColor: Color = Color.Unspecified,
    labelStyle: TextStyle? = null,
    action: (@Composable () -> Unit)? = null,
) {
    val fallbackDescription = stringResource(R.string.loading_state_default)
    val resolvedDescription = LinkpointLoadingStateDefaults.resolveContentDescription(
        contentDescription = contentDescription,
        label = label,
        fallbackDescription = fallbackDescription,
    )
    val crystalVariant = LinkpointLoadingStateDefaults.resolveCrystalVariant(layout)
    val targetSize = LinkpointLoadingStateDefaults.resolveIndicatorSize(layout, size)

    val resolvedLabelStyle = labelStyle ?: when (layout) {
        LinkpointLoadingLayout.Inline -> MaterialTheme.typography.labelMedium
        LinkpointLoadingLayout.Block -> MaterialTheme.typography.bodySmall
    }
    val resolvedLabelColor = when {
        labelColor != Color.Unspecified -> labelColor
        resolvedLabelStyle.color != Color.Unspecified -> resolvedLabelStyle.color
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    when (layout) {
        LinkpointLoadingLayout.Inline -> {
            if (action == null) {
                Row(
                    modifier = modifier
                        .padding(contentPadding)
                        .linkpointLoadingStatusSemantics(resolvedDescription, liveRegionMode),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(
                        LinkpointLoadingStateDefaults.INLINE_SPACING,
                        Alignment.CenterHorizontally,
                    ),
                ) {
                    CrystalLoader(
                        size = targetSize,
                        variant = crystalVariant,
                    )
                    if (!label.isNullOrBlank()) {
                        Text(
                            text = label,
                            color = resolvedLabelColor,
                            style = resolvedLabelStyle,
                        )
                    }
                }
            } else {
                Row(
                    modifier = modifier.padding(contentPadding),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Row(
                        modifier = Modifier
                            .weight(1f, fill = false)
                            .linkpointLoadingStatusSemantics(resolvedDescription, liveRegionMode),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(LinkpointLoadingStateDefaults.INLINE_SPACING),
                    ) {
                        CrystalLoader(
                            size = targetSize,
                            variant = crystalVariant,
                        )
                        if (!label.isNullOrBlank()) {
                            Text(
                                text = label,
                                color = resolvedLabelColor,
                                style = resolvedLabelStyle,
                            )
                        }
                    }
                    Spacer(Modifier.width(LinkpointLoadingStateDefaults.INLINE_SPACING))
                    ActionSlot(action)
                }
            }
        }

        LinkpointLoadingLayout.Block -> {
            if (action == null) {
                Column(
                    modifier = modifier
                        .padding(contentPadding)
                        .linkpointLoadingStatusSemantics(resolvedDescription, liveRegionMode),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(
                        LinkpointLoadingStateDefaults.BLOCK_SPACING,
                        Alignment.CenterVertically,
                    ),
                ) {
                    CrystalLoader(
                        size = targetSize,
                        variant = crystalVariant,
                    )
                    if (!label.isNullOrBlank()) {
                        Text(
                            text = label,
                            color = resolvedLabelColor,
                            style = resolvedLabelStyle,
                            textAlign = TextAlign.Center,
                        )
                    }
                }
            } else {
                Column(
                    modifier = modifier.padding(contentPadding),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(
                        LinkpointLoadingStateDefaults.BLOCK_SPACING,
                        Alignment.CenterVertically,
                    ),
                ) {
                    Column(
                        modifier = Modifier.linkpointLoadingStatusSemantics(resolvedDescription, liveRegionMode),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(LinkpointLoadingStateDefaults.BLOCK_SPACING),
                    ) {
                        CrystalLoader(
                            size = targetSize,
                            variant = crystalVariant,
                        )
                        if (!label.isNullOrBlank()) {
                            Text(
                                text = label,
                                color = resolvedLabelColor,
                                style = resolvedLabelStyle,
                                textAlign = TextAlign.Center,
                            )
                        }
                    }
                    ActionSlot(action)
                }
            }
        }
    }
}

@Composable
private fun ActionSlot(action: @Composable () -> Unit) {
    CompositionLocalProvider(
        LocalMinimumInteractiveComponentSize provides LinkpointLoadingStateDefaults.MIN_ACTION_TOUCH_TARGET
    ) {
        Box(
            modifier = Modifier.defaultMinSize(
                minWidth = LinkpointLoadingStateDefaults.MIN_ACTION_TOUCH_TARGET,
                minHeight = LinkpointLoadingStateDefaults.MIN_ACTION_TOUCH_TARGET,
            ),
            contentAlignment = Alignment.Center,
        ) {
            action()
        }
    }
}
