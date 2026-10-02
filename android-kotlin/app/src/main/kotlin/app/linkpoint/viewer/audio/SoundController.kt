package app.linkpoint.viewer.audio

import android.content.Context
import android.util.Log
import app.linkpoint.core.ViewerSession
import app.linkpoint.core.audio.Listener
import app.linkpoint.core.audio.SoundFetcher
import app.linkpoint.core.audio.SoundScene
import app.linkpoint.core.model.ConnectionState
import app.linkpoint.core.scene.Vec3
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * Connects the session to the speakers: feeds simulator sound events to a [SoundScene], re-places every sound relative to
 * the avatar about ten times a second, and applies the resident's sound settings. Silent while not connected.
 */
class SoundController(
    context: Context,
    private val session: ViewerSession,
    sounds: SoundFetcher,
    scope: CoroutineScope,
    settings: StateFlow<AudioSettings>,
) {
    private val backend = AndroidSoundBackend(context, sounds)
    private val scene = SoundScene(backend, sounds)
    private val _playing = MutableStateFlow(0)
    /** How many sound channels are playing right now (for the Sound screen). */
    val playing: StateFlow<Int> = _playing

    init {
        backend.onFinished = scene::onChannelFinished
        scope.launch { session.soundEvents.collect { scene.onEvent(it) } }
        scope.launch { settings.collect { scene.enabled = it.soundOn; scene.masterVolume = it.soundVolume } }
        // New region, new sounds: nothing from the old one should keep playing or fire late.
        scope.launch { session.region.map { it?.handle }.distinctUntilChanged().collect { scene.stopAll() } }
        scope.launch {
            while (true) {
                delay(TICK_MS)
                try {
                    val me = session.region.value?.position
                    if (session.state.value != ConnectionState.CONNECTED || me == null) {
                        if (_playing.value != 0) { scene.stopAll(); _playing.value = 0 }
                        continue
                    }
                    scene.tick(Listener.atYaw(Vec3(me[0], me[1], me[2]), session.bodyYawRadians), session.scene)
                    _playing.value = scene.activeChannels
                } catch (e: Exception) {
                    Log.w(TAG, "Sound tick failed: ${e.message}")
                }
            }
        }
    }

    fun release() { scene.stopAll(); backend.release() }

    private companion object {
        const val TAG = "SoundController"
        const val TICK_MS = 100L
    }
}
