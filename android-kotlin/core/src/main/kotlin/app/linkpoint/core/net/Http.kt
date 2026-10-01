package app.linkpoint.core.net

import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class HttpResponse(val status: Int, val body: ByteArray) {
    val text: String get() = body.toString(Charsets.UTF_8)
    val ok: Boolean get() = status in 200..299
}

/** Minimal HTTP surface the viewer needs; a fake is used in tests. */
interface Http {
    suspend fun get(url: String, headers: Map<String, String> = emptyMap(), timeoutMs: Int = 30_000): HttpResponse
    suspend fun post(url: String, body: ByteArray, contentType: String, headers: Map<String, String> = emptyMap(), timeoutMs: Int = 30_000): HttpResponse
}

/** [Http] over java.net, which is available on every Android version without extra dependencies. */
class UrlConnectionHttp : Http {
    override suspend fun get(url: String, headers: Map<String, String>, timeoutMs: Int) =
        request(url, "GET", null, null, headers, timeoutMs)

    override suspend fun post(url: String, body: ByteArray, contentType: String, headers: Map<String, String>, timeoutMs: Int) =
        request(url, "POST", body, contentType, headers, timeoutMs)

    private suspend fun request(
        url: String, method: String, body: ByteArray?, contentType: String?, headers: Map<String, String>, timeoutMs: Int,
    ): HttpResponse = withContext(Dispatchers.IO) {
        val u = URL(url)
        require(u.protocol == "https" || u.protocol == "http") { "Only http(s) URLs are supported" }
        val conn = u.openConnection() as HttpURLConnection
        try {
            conn.requestMethod = method
            conn.connectTimeout = timeoutMs
            conn.readTimeout = timeoutMs
            conn.instanceFollowRedirects = true
            for ((k, v) in headers) conn.setRequestProperty(k, v)
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", contentType ?: "application/octet-stream")
                conn.outputStream.use { it.write(body) }
            }
            val status = conn.responseCode
            val stream = if (status >= 400) conn.errorStream else conn.inputStream
            val out = ByteArrayOutputStream()
            stream?.use { it.copyTo(out) }
            HttpResponse(status, out.toByteArray())
        } finally {
            conn.disconnect()
        }
    }
}
