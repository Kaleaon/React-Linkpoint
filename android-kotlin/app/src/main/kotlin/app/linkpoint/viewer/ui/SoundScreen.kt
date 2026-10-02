package app.linkpoint.viewer.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.linkpoint.core.model.MediaState
import app.linkpoint.viewer.ViewerHost
import app.linkpoint.viewer.audio.StreamStatus

/** Sound settings, what is playing, and the parcel's music and media. */
@Composable
fun SoundScreen(host: ViewerHost) {
    val cfg by host.audioSettings.collectAsState()
    val playing by host.soundController.playing.collectAsState()
    val audio by host.parcelAudio.state.collectAsState()
    val parcel by host.session.parcel.collectAsState()
    val playback by host.session.mediaPlayback.collectAsState()
    val ctx = LocalContext.current

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Sounds from objects", style = MaterialTheme.typography.titleSmall)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Switch(cfg.soundOn, { on -> host.setAudio { it.copy(soundOn = on) } })
            Spacer(Modifier.width(10.dp))
            Column {
                Text("Play sounds in 3D")
                Text(
                    if (cfg.soundOn) "$playing playing now — louder when closer, panned left or right by where they are and which way you face"
                    else "Off",
                    style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Slider(cfg.soundVolume, { v -> host.setAudio { it.copy(soundVolume = v) } }, enabled = cfg.soundOn)

        HorizontalDivider()
        Text("Parcel music and audio media", style = MaterialTheme.typography.titleSmall)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Switch(cfg.musicOn, { on -> host.setAudio { it.copy(musicOn = on) } })
            Spacer(Modifier.width(10.dp))
            Text("Play the parcel's music stream")
        }
        Slider(cfg.musicVolume, { v -> host.setAudio { it.copy(musicVolume = v) } }, enabled = cfg.musicOn)
        val music = parcel?.musicUrl?.takeIf { it.isNotBlank() }
        if (music == null) Text("This parcel has no music stream.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        else {
            Text("Music: $music", style = MaterialTheme.typography.labelMedium)
            Text(statusText(audio.music, audio.musicMessage, cfg.musicOn), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        HorizontalDivider()
        Text("Parcel media", style = MaterialTheme.typography.titleSmall)
        val media = audio.media
        if (media == null) Text("This parcel has no media.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        else {
            if (media.description.isNotBlank()) Text(media.description, style = MaterialTheme.typography.titleMedium)
            Text(media.url.ifBlank { "(a texture only, no address)" }, style = MaterialTheme.typography.labelMedium)
            val kind = when { media.isAudioOnly -> "Audio"; media.type.isNotBlank() -> media.type; else -> "Video or web page" }
            val size = if (media.width > 0 && media.height > 0) " · ${media.width}×${media.height}" else ""
            Text("$kind$size" + if (media.loop) " · loops" else "", style = MaterialTheme.typography.labelSmall)
            Text(
                "The region says: " + when (playback.state) { MediaState.PLAYING -> "playing"; MediaState.PAUSED -> "paused"; MediaState.STOPPED -> "stopped" } +
                    if (playback.timeSeconds > 0f) " at %.0f s".format(playback.timeSeconds) else "",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (media.isAudioOnly && media.url.isNotBlank()) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    val on = audio.mediaStatus == StreamStatus.PLAYING
                    Button({ host.parcelAudio.setUserPlay(!audio.mediaStartedByUser) }) { Text(if (audio.mediaStartedByUser) "Stop" else "Play") }
                    Text(statusText(audio.mediaStatus, audio.mediaMessage, cfg.musicOn) + if (on) "" else "", Modifier.align(Alignment.CenterVertically))
                }
            } else if (media.url.isNotBlank()) {
                // Video and web pages are not played inside the viewer; hand them to the device.
                OutlinedButton({ runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(media.url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } }) { Text("Open in another app") }
            }
        }
    }
}

private fun statusText(s: StreamStatus, message: String?, enabled: Boolean) = when {
    !enabled -> "Music is off"
    s == StreamStatus.ERROR -> message ?: "Could not play"
    s == StreamStatus.PREPARING -> "Connecting…"
    s == StreamStatus.PLAYING -> "Playing"
    s == StreamStatus.PAUSED -> "Paused"
    else -> "Not playing"
}
