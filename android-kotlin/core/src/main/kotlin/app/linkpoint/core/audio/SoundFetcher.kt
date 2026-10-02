package app.linkpoint.core.audio

import app.linkpoint.core.net.Http
import java.util.UUID
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.async
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit

/** A downloaded sound: the Ogg Vorbis file itself (for the platform's decoder) and what we learned from its headers. */
class Sound(val id: UUID, val bytes: ByteArray, val info: OggInfo)

/**
 * Downloads sound assets through the region's ViewerAsset capability (`?sound_id=<uuid>`), checks they are Ogg Vorbis and
 * keeps them in a size-limited cache (least recently used first out). [request] is cheap to call every tick.
 * A failed download is remembered for [retryAfterMs] so a missing asset is not hammered, then tried again.
 */
class SoundFetcher(
    private val http: Http,
    private val scope: CoroutineScope,
    private val capability: () -> String?,
    private val maxCacheBytes: Long = 24L * 1024 * 1024,
    private val maxBytesPerSound: Int = 4 * 1024 * 1024,
    private val retryAfterMs: Long = 30_000,
    private val clock: () -> Long = System::currentTimeMillis,
    maxConcurrent: Int = 4,
) : SoundAssets {
    private val gate = Semaphore(maxConcurrent)
    private val lock = Any()
    private class Entry(val result: CompletableDeferred<Result<Sound>>, var at: Long = 0L)
    private val entries = object : LinkedHashMap<UUID, Entry>(64, 0.75f, true) {}
    private var cachedBytes = 0L

    fun peek(id: UUID): Sound? = synchronized(lock) { entries[id] }?.result?.let { if (it.isCompleted) it.getCompleted().getOrNull() else null }

    fun failure(id: UUID): Throwable? = synchronized(lock) { entries[id] }?.result?.let { if (it.isCompleted) it.getCompleted().exceptionOrNull() else null }

    override fun isReady(soundId: UUID) = peek(soundId) != null

    override fun request(soundId: UUID) {
        val cap = capability() ?: return
        val mine = CompletableDeferred<Result<Sound>>()
        val entry: Entry
        synchronized(lock) {
            val existing = entries[soundId]
            if (existing != null) {
                val done = existing.result.isCompleted
                val failed = done && existing.result.getCompleted().isFailure
                if (!failed || clock() - existing.at < retryAfterMs) return // cached, in flight, or failed too recently to retry
            }
            entry = Entry(mine, clock())
            entries[soundId] = entry
        }
        scope.async {
            val result = gate.withPermit {
                runCatching {
                    val sep = if (cap.contains('?')) '&' else '?'
                    val r = http.get("$cap${sep}sound_id=$soundId", mapOf("Accept" to "application/ogg"), 30_000)
                    if (!r.ok) throw java.io.IOException("Sound $soundId: HTTP ${r.status}")
                    if (r.body.size > maxBytesPerSound) throw java.io.IOException("Sound $soundId is ${r.body.size} bytes, more than the $maxBytesPerSound limit")
                    Sound(soundId, r.body, OggInfo.parse(r.body))
                }
            }
            synchronized(lock) {
                entry.at = clock()
                result.getOrNull()?.let { cachedBytes += it.bytes.size; evict(keep = soundId) }
            }
            mine.complete(result)
        }
    }

    private fun evict(keep: UUID) {
        val it = entries.entries.iterator()
        while (cachedBytes > maxCacheBytes && it.hasNext()) {
            val (id, e) = it.next()
            if (id == keep || !e.result.isCompleted) continue
            val s = e.result.getCompleted().getOrNull()
            if (s != null) { cachedBytes -= s.bytes.size; it.remove() }
        }
    }

    fun clear() = synchronized(lock) { entries.clear(); cachedBytes = 0 }
}
