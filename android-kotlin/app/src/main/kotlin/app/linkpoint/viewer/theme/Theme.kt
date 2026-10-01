package app.linkpoint.viewer.theme

import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color

/** The extra tokens a palette carries beyond Material's scheme. */
@Immutable
class LinkpointColors(val ok: Color, val warn: Color, val info: Color, val sky1: Color, val sky2: Color, val ground: Color, val ground2: Color, val badge: Color, val onBadge: Color)

val LocalLinkpoint = androidx.compose.runtime.staticCompositionLocalOf {
    LinkpointColors(Color.Green, Color.Yellow, Color.Cyan, Color.Blue, Color.Blue, Color.Gray, Color.Black, Color.Gray, Color.Black)
}

private fun PaletteDef.color(k: String) = Color(c.getValue(k))

@Composable
fun LinkpointTheme(palette: PaletteDef, content: @Composable () -> Unit) {
    val scheme = (if (palette.light) lightColorScheme() else darkColorScheme()).copy(
        primary = palette.color("pri"), onPrimary = palette.color("onpri"),
        primaryContainer = palette.color("priC"), onPrimaryContainer = palette.color("onpriC"),
        secondary = palette.color("sec"), onSecondary = palette.color("onsec"),
        tertiary = palette.color("sec2"), onTertiary = palette.color("bg"),
        background = palette.color("bg"), onBackground = palette.color("ink"),
        surface = palette.color("surf"), onSurface = palette.color("ink"),
        surfaceVariant = palette.color("surf2"), onSurfaceVariant = palette.color("ink2"),
        surfaceContainer = palette.color("surf"), surfaceContainerHigh = palette.color("surf2"),
        outline = palette.color("ink2"), outlineVariant = palette.color("outv"), error = palette.color("err"),
    )
    val extra = LinkpointColors(
        ok = palette.color("ok"), warn = palette.color("warn"), info = palette.color("info"),
        sky1 = palette.color("sky1"), sky2 = palette.color("sky2"), ground = palette.color("gnd"), ground2 = palette.color("gnd2"),
        badge = palette.color("bdg"), onBadge = palette.color("onbdg"),
    )
    androidx.compose.runtime.CompositionLocalProvider(LocalLinkpoint provides extra) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
