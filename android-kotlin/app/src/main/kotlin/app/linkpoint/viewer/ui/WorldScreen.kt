package app.linkpoint.viewer.ui

import android.view.SurfaceView
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.ui.platform.LocalLifecycleOwner
import app.linkpoint.viewer.ViewerHost
import app.linkpoint.viewer.world.WorldRenderer
import kotlinx.coroutines.delay
import kotlin.math.abs
import kotlin.math.roundToInt

@Composable
fun WorldScreen(host: ViewerHost) {
    val ctx = LocalContext.current.applicationContext
    val renderer = remember { WorldRenderer(ctx, host.session, host.meshes, host.textures, host.sculpts) }
    val owner = LocalLifecycleOwner.current

    DisposableEffect(owner) {
        val obs = LifecycleEventObserver { _, e ->
            if (e == Lifecycle.Event.ON_RESUME) renderer.start()
            if (e == Lifecycle.Event.ON_PAUSE) renderer.stop()
        }
        owner.lifecycle.addObserver(obs)
        if (owner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) renderer.start()
        onDispose {
            owner.lifecycle.removeObserver(obs)
            host.session.setMovement(0, 0)
            renderer.destroy()
        }
    }

    var pad by remember { mutableStateOf(Offset.Zero) }   // -1..1, x right, y down
    var fly by remember { mutableStateOf(false) }
    var up by remember { mutableIntStateOf(0) }
    var stats by remember { mutableStateOf(renderer.stats) }

    // Send movement at 10 Hz while any control is active, using the camera heading as the avatar's heading.
    LaunchedEffect(Unit) {
        while (true) {
            val fwd = if (pad.y < -0.3f) 1 else if (pad.y > 0.3f) -1 else 0
            val strafe = if (pad.x < -0.3f) 1 else if (pad.x > 0.3f) -1 else 0
            host.session.setMovement(fwd, strafe, up, renderer.yaw, fly)
            stats = renderer.stats
            delay(100)
        }
    }

    Box(Modifier.fillMaxSize()) {
        AndroidView(factory = { c -> SurfaceView(c).also { renderer.attach(it) } }, modifier = Modifier.fillMaxSize())

        Column(Modifier.align(Alignment.TopStart).padding(8.dp).background(MaterialTheme.colorScheme.surface.copy(alpha = 0.6f)).padding(6.dp)) {
            Text("${stats.drawn} drawn / ${stats.objectsInRegion} objects · ${stats.fps} fps", style = MaterialTheme.typography.labelSmall)
            Text("${stats.avatars} avatars (placeholders) · ${stats.particles} particles", style = MaterialTheme.typography.labelSmall)
            if (stats.meshesPending > 0 || stats.meshesFailed > 0) Text("meshes: ${stats.meshesPending} loading, ${stats.meshesFailed} failed", style = MaterialTheme.typography.labelSmall)
            if (stats.sculptsSkipped > 0) Text("${stats.sculptsSkipped} sculpts failed to load", style = MaterialTheme.typography.labelSmall)
            if (stats.texturesPending > 0) Text("${stats.texturesPending} textures loading", style = MaterialTheme.typography.labelSmall)
        }

        // Virtual move pad.
        val padSize = 120.dp
        Box(
            Modifier.align(Alignment.BottomStart).padding(20.dp).size(padSize).clip(CircleShape).background(MaterialTheme.colorScheme.surface.copy(alpha = 0.45f))
                .pointerInput(Unit) {
                    detectDragGestures(
                        onDragStart = { pad = Offset.Zero },
                        onDragEnd = { pad = Offset.Zero },
                        onDragCancel = { pad = Offset.Zero },
                    ) { change, _ ->
                        val r = size.width / 2f
                        val p = (change.position - Offset(r, r))
                        pad = Offset((p.x / r).coerceIn(-1f, 1f), (p.y / r).coerceIn(-1f, 1f))
                    }
                },
        ) {
            val r = with(androidx.compose.ui.platform.LocalDensity.current) { padSize.toPx() } / 2f
            Box(
                Modifier.align(Alignment.Center).offset { IntOffset((pad.x * r * 0.6f).roundToInt(), (pad.y * r * 0.6f).roundToInt()) }
                    .size(44.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary),
            )
        }

        Column(Modifier.align(Alignment.BottomEnd).padding(20.dp), horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (fly) {
                FilledTonalButton(onClick = {}, modifier = Modifier.pointerInput(Unit) { detectDragGestures(onDragStart = { up = 1 }, onDragEnd = { up = 0 }, onDragCancel = { up = 0 }) { _, _ -> } }) { Text("Up") }
                FilledTonalButton(onClick = {}, modifier = Modifier.pointerInput(Unit) { detectDragGestures(onDragStart = { up = -1 }, onDragEnd = { up = 0 }, onDragCancel = { up = 0 }) { _, _ -> } }) { Text("Down") }
            }
            FilterChip(selected = fly, onClick = { fly = !fly; if (!fly) up = 0 }, label = { Text("Fly") })
        }
    }
}
