package app.linkpoint.core.net

import app.linkpoint.core.llsd.Llsd
import app.linkpoint.core.llsd.asLlsdList
import app.linkpoint.core.llsd.asLlsdMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

/** Capabilities: HTTP endpoints a simulator hands out through its seed capability. */
object Caps {
    val WANTED = listOf("EventQueueGet", "GetTexture", "ViewerAsset", "GetMesh", "GetMesh2", "FetchInventoryDescendents2", "ParcelVoiceInfoRequest", "ProvisionVoiceAccountRequest", "RenderMaterials")

    suspend fun fetch(http: Http, seedUrl: String, names: List<String> = WANTED): Map<String, String> {
        val r = http.post(seedUrl, Llsd.toXml(names).toByteArray(), "application/llsd+xml", mapOf("Accept" to "application/llsd+xml"), 30_000)
        if (!r.ok) throw java.io.IOException("Seed capability answered HTTP ${r.status}")
        val map = Llsd.parseXml(r.body).asLlsdMap() ?: return emptyMap()
        return map.mapNotNull { (k, v) -> (v as? String)?.let { k to it } }.toMap()
    }
}

class SimEvent(val message: String, val body: Map<String, Any?>)

/**
 * Long-polls the EventQueueGet capability. Teleports, region crossings and many other messages
 * reach a viewer only this way.
 */
class EventQueue(private val http: Http, private val url: String) {
    suspend fun run(scope: CoroutineScope, onEvent: suspend (SimEvent) -> Unit, onError: (String) -> Unit = {}) {
        var ack: Int? = null
        var failures = 0
        while (scope.isActive) {
            try {
                val req = Llsd.toXml(mapOf("ack" to ack, "done" to false))
                val r = http.post(url, req.toByteArray(), "application/llsd+xml", mapOf("Accept" to "application/llsd+xml"), 100_000)
                when {
                    r.status == 404 -> { onError("The event queue is gone (HTTP 404)"); return }
                    r.status == 499 || r.status == 502 || r.status == 504 -> { failures = 0; continue } // poll timed out with no events
                    !r.ok -> throw java.io.IOException("Event queue answered HTTP ${r.status}")
                }
                failures = 0
                val root = Llsd.parseXml(r.body).asLlsdMap() ?: continue
                (root["id"] as? Int)?.let { ack = it }
                for (e in root["events"].asLlsdList().orEmpty()) {
                    val m = e.asLlsdMap() ?: continue
                    val name = m["message"] as? String ?: continue
                    onEvent(SimEvent(name, m["body"].asLlsdMap() ?: emptyMap()))
                }
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                failures++
                if (failures >= 5) { onError("The event queue keeps failing: ${e.message}"); return }
                delay(1_000L * failures)
            }
        }
    }
}
