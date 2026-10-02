package app.linkpoint.viewer.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.SoundPool
import android.os.Handler
import android.os.Looper
import android.util.Log
import app.linkpoint.core.audio.SoundBackend
import app.linkpoint.core.audio.SoundFetcher
import java.io.File
import java.util.UUID

/**
 * Plays [app.linkpoint.core.audio.SoundScene] channels with Android's [SoundPool]: one sample per sound, one stream per
 * channel, with left and right volume set independently (that is how the 3D placement reaches the speakers).
 *
 * SoundPool wants files and loads them asynchronously, so a channel started before its sample is ready waits for it and
 * then starts with the volumes it has by then. It does not say when a one-shot ends, so the end is scheduled from the
 * length found in the Ogg header and reported through [onFinished].
 *
 * Not exercised on a device from the build environment; the logic around it (what plays, where, how loud) is covered by
 * the core tests with a recording backend.
 */
class AndroidSoundBackend(context: Context, private val sounds: SoundFetcher) : SoundBackend {
    private val dir = File(context.cacheDir, "sounds").apply { mkdirs() }
    private val main = Handler(Looper.getMainLooper())
    private val lock = Any()
    private val pool: SoundPool = SoundPool.Builder()
        .setMaxStreams(MAX_STREAMS)
        .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_GAME).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
        .build()

    /** Sounds that have been handed to the pool, least recently used first. */
    private val samples = LinkedHashMap<UUID, Int>(32, 0.75f, true)
    private val readySamples = HashSet<Int>()
    private class Chan(val soundId: UUID, val loop: Boolean, var left: Float, var right: Float) {
        var stream = 0
        var finish: Runnable? = null
    }
    private val channels = HashMap<Int, Chan>()

    /** Called (on any thread) when a one-shot has finished, so the scene can free the channel. */
    @Volatile var onFinished: (Int) -> Unit = {}

    init {
        pool.setOnLoadCompleteListener { _, sampleId, status ->
            synchronized(lock) {
                if (status != 0) {
                    Log.w(TAG, "SoundPool could not load sample $sampleId (status $status)")
                } else {
                    readySamples += sampleId
                    for ((channel, c) in channels.toMap()) if (c.stream == 0 && samples[c.soundId] == sampleId) start(channel, c)
                }
            }
        }
    }

    override fun play(channel: Int, soundId: UUID, loop: Boolean, left: Float, right: Float) {
        synchronized(lock) {
            val c = Chan(soundId, loop, left, right)
            channels[channel] = c
            val sample = sampleFor(soundId)
            if (sample == null) finishNow(channel)
            else if (sample in readySamples) start(channel, c)
        }
    }

    override fun setVolume(channel: Int, left: Float, right: Float) {
        synchronized(lock) {
            val c = channels[channel] ?: return
            c.left = left; c.right = right
            if (c.stream != 0) pool.setVolume(c.stream, left, right)
        }
    }

    override fun stop(channel: Int) {
        synchronized(lock) {
            val c = channels.remove(channel) ?: return
            c.finish?.let { main.removeCallbacks(it) }
            if (c.stream != 0) pool.stop(c.stream)
        }
    }

    /** Stops everything and gives the pool's memory back; the backend cannot be used afterwards. */
    fun release() {
        synchronized(lock) {
            for (c in channels.values) { c.finish?.let { main.removeCallbacks(it) }; if (c.stream != 0) pool.stop(c.stream) }
            channels.clear(); samples.clear(); readySamples.clear()
            pool.release()
        }
    }

    private fun start(channel: Int, c: Chan) {
        val sample = samples[c.soundId] ?: return
        c.stream = pool.play(sample, c.left, c.right, 1, if (c.loop) -1 else 0, 1f)
        if (c.stream == 0) { Log.w(TAG, "SoundPool refused to play ${c.soundId}"); finishNow(channel); return }
        if (!c.loop) {
            val ms = (sounds.peek(c.soundId)?.info?.durationMs ?: 3_000L) + 150L
            val r = Runnable { synchronized(lock) { if (channels.remove(channel) != null) onFinished(channel) } }
            c.finish = r
            main.postDelayed(r, ms)
        }
    }

    private fun finishNow(channel: Int) { channels.remove(channel); onFinished(channel) }

    /** The pool's id for [soundId], writing the file and starting the load the first time; null if the data is not available. */
    private fun sampleFor(soundId: UUID): Int? {
        samples[soundId]?.let { return it }
        val data = sounds.peek(soundId) ?: return null
        trim()
        val file = File(dir, "$soundId.ogg")
        return try {
            if (!file.exists() || file.length() != data.bytes.size.toLong()) file.writeBytes(data.bytes)
            pool.load(file.absolutePath, 1).also { samples[soundId] = it }
        } catch (e: Exception) { Log.w(TAG, "Could not load sound $soundId: ${e.message}"); null }
    }

    /** Keep the number of loaded samples bounded: unload the least recently used ones that are not playing. */
    private fun trim() {
        if (samples.size < MAX_SAMPLES) return
        val busy = channels.values.map { it.soundId }.toSet()
        val it = samples.entries.iterator()
        while (samples.size >= MAX_SAMPLES && it.hasNext()) {
            val (id, sample) = it.next()
            if (id in busy) continue
            pool.unload(sample); readySamples.remove(sample); it.remove()
            File(dir, "$id.ogg").delete()
        }
    }

    private companion object {
        const val TAG = "SoundBackend"
        const val MAX_STREAMS = 16
        const val MAX_SAMPLES = 48
    }
}
