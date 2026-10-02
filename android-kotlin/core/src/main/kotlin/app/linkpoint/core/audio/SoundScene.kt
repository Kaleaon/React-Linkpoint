package app.linkpoint.core.audio

import app.linkpoint.core.scene.SceneStore
import app.linkpoint.core.scene.SimObject
import app.linkpoint.core.scene.SoundFlags
import app.linkpoint.core.scene.Vec3
import java.util.UUID

/** Plays sound channels. [channel] numbers are chosen by [SoundScene]; the backend reports a finished one-shot with [SoundScene.onChannelFinished]. */
interface SoundBackend {
    fun play(channel: Int, soundId: UUID, loop: Boolean, left: Float, right: Float)
    fun setVolume(channel: Int, left: Float, right: Float)
    fun stop(channel: Int)
}

/** Where sound data comes from. [request] must be cheap to call repeatedly (it is called every tick for sounds not yet ready). */
interface SoundAssets {
    fun request(soundId: UUID)
    fun isReady(soundId: UUID): Boolean
}

/**
 * Decides, several times a second, which sounds are audible and how loud, and drives a [SoundBackend] accordingly.
 *
 * Sources: sounds that objects carry in their updates (looping or play-once), sounds attached by AttachedSound messages, and
 * one-shot triggers. Each is placed in the region (linksets and attachments through their parents), run through
 * [SpatialAudio] against the [Listener], and only the loudest [maxChannels] are played; others are stopped and come back
 * when they are loud enough again. A sound whose data has not arrived is requested and waits (a triggered one-shot gives up
 * after [ONE_SHOT_PATIENCE_MS], since a late "bang" is worse than none).
 */
class SoundScene(
    private val backend: SoundBackend,
    private val assets: SoundAssets,
    private val clock: () -> Long = System::currentTimeMillis,
    var maxChannels: Int = 16,
) {
    /** 0..1, applied on top of everything. */
    @Volatile var masterVolume: Float = 1f
    @Volatile var enabled: Boolean = true

    private sealed class Key {
        data class Obj(val id: UUID) : Key()
        data class Shot(val n: Long) : Key()
    }
    private class Channel(val key: Key, val id: Int, val soundId: UUID, val loop: Boolean)
    private class Shot(val n: Long, val soundId: UUID, val position: Vec3, val gain: Float, val createdAt: Long)
    private class Candidate(val key: Key, val soundId: UUID, val loop: Boolean, val params: SpatialParams)

    private val lock = Any()
    private val shots = ArrayList<Shot>()
    private val channels = HashMap<Key, Channel>()
    private val channelKeys = HashMap<Int, Key>()
    private var nextChannel = 1
    private var nextShot = 1L
    /** Play-once object sounds that have already played: object -> sound. Cleared when the object stops carrying that sound. */
    private val playedOnce = HashMap<UUID, UUID>()
    private val attached = HashMap<UUID, SoundEvent.Attached>()
    private val gainChanges = HashMap<UUID, Float>()

    val activeChannels: Int get() = synchronized(lock) { channels.size }

    fun onEvent(e: SoundEvent) {
        synchronized(lock) { when (e) {
            is SoundEvent.Trigger -> { shots += Shot(nextShot++, e.soundId, e.position, e.gain, clock()); assets.request(e.soundId) }
            is SoundEvent.Attached -> {
                gainChanges.remove(e.objectId)
                if (e.flags and SoundFlags.STOP != 0) { attached.remove(e.objectId); playedOnce.remove(e.objectId) } else { attached[e.objectId] = e; assets.request(e.soundId) }
            }
            is SoundEvent.GainChange -> gainChanges[e.objectId] = e.gain
            is SoundEvent.Preload -> e.soundIds.forEach(assets::request)
        } }
    }

    /** The backend reports a finished one-shot (looped channels never finish on their own). */
    fun onChannelFinished(channel: Int) {
        synchronized(lock) {
            val key = channelKeys.remove(channel) ?: return
            channels.remove(key)
        }
    }

    fun stopAll() {
        synchronized(lock) {
            for (c in channels.values) backend.stop(c.id)
            channels.clear(); channelKeys.clear(); shots.clear(); attached.clear(); gainChanges.clear(); playedOnce.clear()
        }
    }

    /** Re-evaluate everything for the current [listener] and [scene]. */
    fun tick(listener: Listener, scene: SceneStore) = synchronized(lock) {
        val master = masterVolume.coerceIn(0f, 1f)
        if (!enabled || master <= 0f) {
            for (c in channels.values) backend.stop(c.id)
            channels.clear(); channelKeys.clear(); shots.clear()
            return
        }
        val now = clock()
        val wanted = ArrayList<Candidate>()

        // ---- object sounds: from updates, and from AttachedSound messages for objects whose update names none
        val seen = HashSet<UUID>()
        fun consider(o: SimObject, soundId: UUID, loops: Boolean, baseGain: Float, radius: Float) {
            val id = o.fullId ?: return
            seen += id
            val pos = scene.worldTransform(o)?.first ?: return
            val gain = (gainChanges[id] ?: baseGain)
            if (!loops && playedOnce[id] == soundId) return
            val p = scale(SpatialAudio.spatialize(listener, pos, gain, radius), master)
            if (!p.audible) return
            if (!assets.isReady(soundId)) { assets.request(soundId); return }
            wanted += Candidate(Key.Obj(id), soundId, loops, p)
        }
        for (o in scene.withSound()) {
            val s = o.sound ?: continue
            if (s.stopped) { o.fullId?.let { playedOnce.remove(it) }; continue }
            consider(o, s.soundId, s.loops, s.gain, s.radius)
        }
        val it = attached.entries.iterator()
        while (it.hasNext()) {
            val (objId, a) = it.next()
            if (objId in seen) continue
            val o = scene.findByFullId(objId)
            if (o == null) { continue } // not (or no longer) in view: keep the message in case the object arrives
            consider(o, a.soundId, a.flags and SoundFlags.LOOP != 0, gainChanges[objId] ?: a.gain, o.sound?.radius ?: 0f)
        }
        // a play-once sound that went away may play again if it comes back
        playedOnce.keys.retainAll(seen)

        // ---- one-shots
        val shotIter = shots.iterator()
        while (shotIter.hasNext()) {
            val sh = shotIter.next()
            if (now - sh.createdAt > ONE_SHOT_PATIENCE_MS) { shotIter.remove(); continue }
            val p = scale(SpatialAudio.spatialize(listener, sh.position, sh.gain), master)
            if (!p.audible) { shotIter.remove(); continue } // out of earshot when it went off: it never will be audible
            if (!assets.isReady(sh.soundId)) { assets.request(sh.soundId); continue }
            wanted += Candidate(Key.Shot(sh.n), sh.soundId, false, p)
        }

        // ---- choose the loudest, then reconcile with what is playing
        val chosen = wanted.sortedByDescending { it.params.loudness }.take(maxChannels)
        val chosenKeys = chosen.map { it.key }.toSet()
        for (c in channels.values.toList()) {
            if (c.key !in chosenKeys) { backend.stop(c.id); channels.remove(c.key); channelKeys.remove(c.id) }
        }
        for (cand in chosen) {
            val existing = channels[cand.key]
            if (existing != null && existing.soundId == cand.soundId) { backend.setVolume(existing.id, cand.params.left, cand.params.right); continue }
            if (existing != null) { backend.stop(existing.id); channels.remove(cand.key); channelKeys.remove(existing.id) } // the object switched sounds
            val id = nextChannel++
            val ch = Channel(cand.key, id, cand.soundId, cand.loop)
            channels[cand.key] = ch; channelKeys[id] = cand.key
            backend.play(id, cand.soundId, cand.loop, cand.params.left, cand.params.right)
            when (val k = cand.key) {
                is Key.Shot -> shots.removeAll { it.n == k.n }
                is Key.Obj -> if (!cand.loop) playedOnce[k.id] = cand.soundId
            }
        }
    }

    private fun scale(p: SpatialParams, m: Float) = if (m >= 1f) p else p.copy(left = p.left * m, right = p.right * m, audible = p.audible && p.loudness * m >= 0.002f)

    companion object {
        const val ONE_SHOT_PATIENCE_MS = 8_000L
    }
}
