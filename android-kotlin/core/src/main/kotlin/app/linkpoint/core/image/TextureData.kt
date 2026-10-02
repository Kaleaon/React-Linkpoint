package app.linkpoint.core.image

import app.linkpoint.core.net.Http
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.max
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit

/** A texture ready for the GPU: RGBA8 mip levels, level 0 first, each level's first row being the *bottom* of the image (v = 0). */
class TextureData(val width: Int, val height: Int, val hasAlpha: Boolean, val levels: List<ByteArray>) {
    fun levelWidth(l: Int) = max(1, width shr l)
    fun levelHeight(l: Int) = max(1, height shr l)
}

object TextureOps {
    /** Expand a decoded image to RGBA, flip it so row 0 is the bottom, and build the full mip chain. */
    fun fromImage(img: J2kImage): TextureData {
        val w = img.width; val h = img.height; val c = img.components
        val rgba = ByteArray(w * h * 4)
        var hasAlpha = false
        for (y in 0 until h) {
            val srcRow = h - 1 - y // flip: SL texture space has v = 0 at the bottom
            for (x in 0 until w) {
                val s = (srcRow * w + x) * c
                val d = (y * w + x) * 4
                when (c) {
                    1 -> { val g = img.data[s]; rgba[d] = g; rgba[d + 1] = g; rgba[d + 2] = g; rgba[d + 3] = -1 }
                    2 -> { val g = img.data[s]; rgba[d] = g; rgba[d + 1] = g; rgba[d + 2] = g; rgba[d + 3] = img.data[s + 1] }
                    3 -> { rgba[d] = img.data[s]; rgba[d + 1] = img.data[s + 1]; rgba[d + 2] = img.data[s + 2]; rgba[d + 3] = -1 }
                    else -> { rgba[d] = img.data[s]; rgba[d + 1] = img.data[s + 1]; rgba[d + 2] = img.data[s + 2]; rgba[d + 3] = img.data[s + 3] }
                }
                if (c == 2 || c == 4) if (rgba[d + 3] != (-1).toByte()) hasAlpha = true
            }
        }
        return TextureData(w, h, hasAlpha, mipChain(rgba, w, h))
    }

    /** Box-filtered mip chain down to 1x1. */
    fun mipChain(base: ByteArray, w: Int, h: Int): List<ByteArray> {
        val out = ArrayList<ByteArray>()
        out += base
        var cw = w; var ch = h; var cur = base
        while (cw > 1 || ch > 1) {
            val nw = max(1, cw / 2); val nh = max(1, ch / 2)
            val next = ByteArray(nw * nh * 4)
            for (y in 0 until nh) for (x in 0 until nw) {
                val x0 = minOf(2 * x, cw - 1); val x1 = minOf(2 * x + 1, cw - 1)
                val y0 = minOf(2 * y, ch - 1); val y1 = minOf(2 * y + 1, ch - 1)
                for (k in 0..3) {
                    val s = (cur[(y0 * cw + x0) * 4 + k].toInt() and 0xFF) + (cur[(y0 * cw + x1) * 4 + k].toInt() and 0xFF) +
                        (cur[(y1 * cw + x0) * 4 + k].toInt() and 0xFF) + (cur[(y1 * cw + x1) * 4 + k].toInt() and 0xFF)
                    next[(y * nw + x) * 4 + k] = ((s + 2) / 4).toByte()
                }
            }
            out += next; cur = next; cw = nw; ch = nh
        }
        return out
    }
}

/**
 * Downloads textures from the region's GetTexture capability and decodes them (JPEG 2000). Large
 * textures are decoded at reduced resolution ([maxDimension]); results and failures are remembered.
 */
class TextureFetcher(
    private val http: Http,
    private val scope: CoroutineScope,
    private val capability: () -> String?,
    private val maxDimension: Int = 512,
    maxConcurrent: Int = 2,
) {
    private val gate = Semaphore(maxConcurrent)
    private val cache = ConcurrentHashMap<UUID, Deferred<Result<TextureData>>>()

    fun peek(id: UUID): TextureData? {
        val d = cache[id] ?: return null
        return if (d.isCompleted) d.getCompleted().getOrNull() else null
    }

    fun failure(id: UUID): Throwable? {
        val d = cache[id] ?: return null
        return if (d.isCompleted) d.getCompleted().exceptionOrNull() else null
    }

    /**
     * Drop the decoded pixels of a finished texture once they have been uploaded elsewhere (the GPU), so they do not
     * pile up on the heap. Failures are kept so a bad texture is not requested again; a released texture is fetched
     * again only if it is requested again.
     */
    fun release(id: UUID) {
        val d = cache[id] ?: return
        if (d.isCompleted && d.getCompleted().isSuccess) cache.remove(id, d)
    }

    val pending: Int get() = cache.values.count { !it.isCompleted }

    /** Start the download if it has not started. Returns false while no capability is known yet. */
    fun request(id: UUID): Boolean {
        if (cache.containsKey(id)) return true
        val cap = capability() ?: return false
        val job = scope.async(Dispatchers.Default) {
            gate.withPermit {
                runCatching {
                    val sep = if (cap.contains('?')) '&' else '?'
                    val r = http.get("$cap${sep}texture_id=$id", mapOf("Accept" to "image/x-j2c"), 60_000)
                    if (!r.ok) throw java.io.IOException("Texture $id: HTTP ${r.status}")
                    val first = J2kDecoder.decode(r.body, discardLevels = discardFor(r.body))
                    TextureOps.fromImage(first)
                }
            }
        }
        val prior = cache.putIfAbsent(id, job)
        if (prior != null) job.cancel()
        return true
    }

    /** How many resolution levels to drop so the larger side is at most [maxDimension]. */
    private fun discardFor(body: ByteArray): Int {
        val (w, h) = J2kHeader.size(body) ?: return 0
        var d = 0
        var m = max(w, h)
        while (m > maxDimension) { m = (m + 1) / 2; d++ }
        return d
    }

    fun clear() { cache.clear() }
}

/** Reads just the image size from a codestream or JP2 file. */
object J2kHeader {
    fun size(b: ByteArray): Pair<Int, Int>? {
        fun u16(p: Int) = ((b[p].toInt() and 0xFF) shl 8) or (b[p + 1].toInt() and 0xFF)
        fun u32(p: Int) = (u16(p) shl 16) or u16(p + 2)
        var p = 0
        if (b.size > 4 && u16(0) != 0xFF4F) {
            // JP2: find the codestream box.
            while (p + 8 <= b.size) {
                var len = u32(p).toLong() and 0xFFFFFFFFL
                val type = u32(p + 4)
                val header = if (len == 1L) 16 else 8
                if (len == 1L) len = ((u32(p + 8).toLong() and 0xFFFFFFFFL) shl 32) or (u32(p + 12).toLong() and 0xFFFFFFFFL)
                if (len == 0L) len = (b.size - p).toLong()
                if (len < header) return null
                if (type == 0x6A703263) { p += header; break }
                p += len.toInt()
            }
        }
        if (p + 2 + 40 > b.size || u16(p) != 0xFF4F || u16(p + 2) != 0xFF51) return null
        val xsiz = u32(p + 8); val ysiz = u32(p + 12); val xo = u32(p + 16); val yo = u32(p + 20)
        val w = xsiz - xo; val h = ysiz - yo
        return if (w > 0 && h > 0) w to h else null
    }
}
