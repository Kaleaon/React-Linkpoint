package app.linkpoint.core.scene

import app.linkpoint.core.net.Http
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit

/**
 * Downloads mesh assets from the region's GetMesh2/GetMesh capability and decodes them. Results
 * (including failures) are remembered so an object is requested once.
 */
class MeshFetcher(
    private val http: Http,
    private val scope: CoroutineScope,
    private val capability: () -> String?,
    maxConcurrent: Int = 4,
) {
    private val gate = Semaphore(maxConcurrent)
    private val cache = ConcurrentHashMap<UUID, Deferred<Result<LlMesh.Decoded>>>()

    /** The decoded mesh if it has arrived, null while pending, failed or unavailable. */
    fun peek(id: UUID): LlMesh.Decoded? {
        val d = cache[id] ?: return null
        if (!d.isCompleted) return null
        return d.getCompleted().getOrNull()
    }

    /** Start (or join) the download. Call every frame for visible meshes; it is cheap once started. */
    fun request(id: UUID): Deferred<Result<LlMesh.Decoded>>? {
        cache[id]?.let { return it }
        val cap = capability() ?: return null
        val job = scope.async {
            gate.withPermit {
                runCatching {
                    val sep = if (cap.contains('?')) '&' else '?'
                    val r = http.get("$cap${sep}mesh_id=$id", mapOf("Accept" to "application/vnd.ll.mesh"), 60_000)
                    if (!r.ok) throw java.io.IOException("Mesh $id: HTTP ${r.status}")
                    LlMesh.decode(r.body)
                }
            }
        }
        val prior = cache.putIfAbsent(id, job)
        if (prior != null) { job.cancel(); return prior }
        return job
    }

    fun failure(id: UUID): Throwable? {
        val d = cache[id] ?: return null
        return if (d.isCompleted) d.getCompleted().exceptionOrNull() else null
    }

    fun clear() { cache.clear() }
}
