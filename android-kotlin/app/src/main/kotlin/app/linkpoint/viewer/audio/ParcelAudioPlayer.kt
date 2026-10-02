package app.linkpoint.viewer.audio

import app.linkpoint.core.ViewerSession
import app.linkpoint.core.model.ConnectionState
import app.linkpoint.core.model.MediaState
import app.linkpoint.core.model.ParcelMedia
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

/** What the Sound screen shows for the two parcel streams. */
data class ParcelAudioState(
    val musicUrl: String? = null, val music: StreamStatus = StreamStatus.IDLE, val musicMessage: String? = null,
    val media: ParcelMedia? = null, val mediaStatus: StreamStatus = StreamStatus.IDLE, val mediaMessage: String? = null,
    /** True when the resident pressed Play for the parcel media (as opposed to the simulator commanding it). */
    val mediaStartedByUser: Boolean = false,
)

/**
 * The parcel's two audio sources:
 *  - **music**: the parcel's music stream URL, played whenever the resident has music on and we are connected;
 *  - **media**: the parcel media when it is audio only, played when the simulator commands play (ParcelMediaCommandMessage) or
 *    the resident presses play, following its pause / stop / loop / seek commands.
 * Video and web-page media are not played here; the Sound screen offers to open them in another app.
 * Runs on the main thread (MediaPlayer's rule). Not exercised on a device from the build environment.
 */
class ParcelAudioPlayer(private val session: ViewerSession, scope: CoroutineScope, settings: StateFlow<AudioSettings>) {
    private val _state = MutableStateFlow(ParcelAudioState())
    val state: StateFlow<ParcelAudioState> = _state
    private val userPlay = MutableStateFlow(false)
    private val music = StreamPlayer { s, m -> _state.value = _state.value.copy(music = s, musicMessage = m) }
    private val media = StreamPlayer { s, m -> _state.value = _state.value.copy(mediaStatus = s, mediaMessage = m) }
    private var lastSeek = Float.NaN

    init {
        scope.launch(Dispatchers.Main) {
            combine(session.state, session.parcel, session.parcelMedia, session.mediaPlayback, settings) { st, parcel, pm, pb, cfg ->
                Inputs(st == ConnectionState.CONNECTED, parcel?.musicUrl?.takeIf { it.isNotBlank() }, pm, pb, cfg)
            }.combine(userPlay) { inp, user -> inp to user }.collect { (inp, user) -> apply(inp, user) }
        }
    }

    private class Inputs(val connected: Boolean, val musicUrl: String?, val media: ParcelMedia?, val playback: app.linkpoint.core.model.MediaPlayback, val cfg: AudioSettings)

    /** The resident's own play / pause for the parcel media. */
    fun setUserPlay(play: Boolean) { userPlay.value = play }

    private fun apply(i: Inputs, user: Boolean) {
        val musicWanted = i.connected && i.cfg.musicOn && i.musicUrl != null
        music.update(if (musicWanted) i.musicUrl else null, musicWanted, true, i.cfg.musicVolume)

        val audio = i.media?.takeIf { it.isAudioOnly && it.url.isNotBlank() }
        val simulatorPlays = i.playback.state == MediaState.PLAYING
        val mediaWanted = i.connected && i.cfg.musicOn && audio != null && (simulatorPlays || user)
        media.update(if (i.connected && i.cfg.musicOn) audio?.url else null, mediaWanted, i.playback.loop || (audio?.loop == true), i.cfg.musicVolume)
        // A seek command: apply it once per distinct target time.
        if (audio != null && i.playback.timeSeconds != lastSeek) {
            if (i.playback.timeSeconds > 0f) media.seekTo((i.playback.timeSeconds * 1000).toInt())
            lastSeek = i.playback.timeSeconds
        }
        _state.value = _state.value.copy(musicUrl = i.musicUrl, media = i.media, mediaStartedByUser = user)
    }

    fun release() { music.release(); media.release() }
}
