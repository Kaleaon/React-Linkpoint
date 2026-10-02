package app.linkpoint.core.audio

/**
 * What can be learned about an Ogg Vorbis file without decoding it: Second Life sounds are Ogg Vorbis, and knowing the length
 * lets the viewer reason about one-shots, and rejecting anything else early keeps junk away from the platform decoder.
 */
class OggInfo(val channels: Int, val sampleRate: Int, val totalSamples: Long, val nominalBitrate: Int) {
    val durationSeconds: Float get() = if (sampleRate > 0) totalSamples.toFloat() / sampleRate else 0f
    val durationMs: Long get() = if (sampleRate > 0) totalSamples * 1000L / sampleRate else 0L

    companion object {
        private const val PAGE_HEADER = 27
        private val OGGS = byteArrayOf('O'.code.toByte(), 'g'.code.toByte(), 'g'.code.toByte(), 'S'.code.toByte())

        /** Parses the Vorbis identification header and finds the length from the last page. Throws [IllegalArgumentException] for anything else. */
        fun parse(b: ByteArray): OggInfo {
            require(b.size >= PAGE_HEADER + 30 && matches(b, 0)) { "Not an Ogg file" }
            // First page, first packet: the Vorbis identification header.
            val segs = b[26].toInt() and 0xFF
            val bodyAt = PAGE_HEADER + segs
            require(bodyAt + 30 <= b.size) { "Truncated Ogg header" }
            require((b[bodyAt].toInt() and 0xFF) == 1 && String(b, bodyAt + 1, 6, Charsets.ISO_8859_1) == "vorbis") { "Not Ogg Vorbis" }
            val channels = b[bodyAt + 11].toInt() and 0xFF
            val rate = le32(b, bodyAt + 12)
            val nominal = le32(b, bodyAt + 20)
            require(channels in 1..8 && rate in 1000..192_000) { "Implausible Vorbis header (channels=$channels, rate=$rate)" }

            // Walk the pages; the last page with a real granule position gives the sample count.
            var pos = 0
            var granule = 0L
            while (pos + PAGE_HEADER <= b.size && matches(b, pos)) {
                val g = le64(b, pos + 6)
                if (g != -1L) granule = g
                val n = b[pos + 26].toInt() and 0xFF
                if (pos + PAGE_HEADER + n > b.size) break
                var body = 0
                for (i in 0 until n) body += b[pos + PAGE_HEADER + i].toInt() and 0xFF
                val next = pos + PAGE_HEADER + n + body
                if (next > b.size) break // cut off mid-page: use what was complete
                pos = next
            }
            return OggInfo(channels, rate, granule.coerceAtLeast(0), nominal)
        }

        private fun matches(b: ByteArray, at: Int) = at + 4 <= b.size && (0..3).all { b[at + it] == OGGS[it] }
        private fun le32(b: ByteArray, at: Int) = (b[at].toInt() and 0xFF) or ((b[at + 1].toInt() and 0xFF) shl 8) or ((b[at + 2].toInt() and 0xFF) shl 16) or ((b[at + 3].toInt() and 0xFF) shl 24)
        private fun le64(b: ByteArray, at: Int): Long { var v = 0L; for (i in 7 downTo 0) v = (v shl 8) or (b[at + i].toLong() and 0xFF); return v }
    }
}
