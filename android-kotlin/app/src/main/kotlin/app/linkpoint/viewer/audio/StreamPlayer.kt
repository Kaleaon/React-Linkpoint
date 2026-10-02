package app.linkpoint.viewer.audio

import android.media.AudioAttributes
import android.media.MediaPlayer
import android.util.Log

enum class StreamStatus { IDLE, PREPARING, PLAYING, PAUSED, ERROR }

/**
 * One internet audio stream (or audio file) behind a [MediaPlayer]: give it the address and whether it should be playing and
 * it does the rest, including starting once the stream is ready. Use from the main thread only (MediaPlayer's own rule).
 * Not exercised on a device from the build environment.
 */
internal class StreamPlayer(private val onChange: (StreamStatus, String?) -> Unit) {
    private var player: MediaPlayer? = null
    private var url: String? = null
    private var prepared = false
    private var wantPlaying = false
    private var status = StreamStatus.IDLE

    val positionMs: Int get() = if (prepared) player?.currentPosition ?: 0 else 0

    fun update(url: String?, play: Boolean, loop: Boolean, volume: Float) {
        if (url != this.url) {
            release()
            this.url = url
            if (!url.isNullOrBlank()) open(url)
        }
        wantPlaying = play
        player?.let { it.isLooping = loop; it.setVolume(volume, volume) }
        apply()
    }

    fun seekTo(ms: Int) {
        if (prepared) player?.seekTo(ms.coerceAtLeast(0))
    }

    fun release() {
        player?.let { runCatching { it.reset() }; runCatching { it.release() } }
        player = null; prepared = false; url = null
        set(StreamStatus.IDLE, null)
    }

    private fun open(address: String) {
        try {
            val m = MediaPlayer()
            m.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
            m.setOnPreparedListener { prepared = true; apply() }
            m.setOnCompletionListener { if (!m.isLooping) set(StreamStatus.PAUSED, null) }
            m.setOnErrorListener { _, what, extra ->
                Log.w(TAG, "Stream error $what/$extra for $address")
                prepared = false
                set(StreamStatus.ERROR, "The stream could not be played (error $what)")
                true
            }
            m.setDataSource(address)
            player = m
            set(StreamStatus.PREPARING, null)
            m.prepareAsync()
        } catch (e: Exception) {
            Log.w(TAG, "Could not open $address: ${e.message}")
            player = null
            set(StreamStatus.ERROR, e.message ?: "Could not open the stream")
        }
    }

    private fun apply() {
        val m = player ?: return
        if (!prepared) return
        try {
            if (wantPlaying && !m.isPlaying) { m.start(); set(StreamStatus.PLAYING, null) }
            else if (!wantPlaying && m.isPlaying) { m.pause(); set(StreamStatus.PAUSED, null) }
            else if (!wantPlaying && status == StreamStatus.PREPARING) set(StreamStatus.PAUSED, null)
        } catch (e: IllegalStateException) {
            set(StreamStatus.ERROR, "The player stopped unexpectedly")
        }
    }

    private fun set(s: StreamStatus, message: String?) {
        if (s != status || message != null) { status = s; onChange(s, message) }
    }

    private companion object { const val TAG = "StreamPlayer" }
}
