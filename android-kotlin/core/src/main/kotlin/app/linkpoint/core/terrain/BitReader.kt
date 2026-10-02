package app.linkpoint.core.terrain

/**
 * The bit order of Second Life's LayerData: bits are taken most significant first from each byte,
 * and a value wider than 8 bits is assembled from bytes least significant byte first (so the
 * first 8 stream bits are the low byte). A partial final chunk is the high part of the value.
 */
class BitReader(private val data: ByteArray, private var bytePos: Int = 0) {
    private var bitPos = 0
    val position: Int get() = bytePos

    private fun bit(): Int {
        require(bytePos < data.size) { "Ran out of terrain data" }
        val b = (data[bytePos].toInt() shr (7 - bitPos)) and 1
        if (++bitPos >= 8) { bitPos = 0; bytePos++ }
        return b
    }

    /** Read [count] (1..32) bits; the result is an unsigned value in a Long. */
    fun bits(count: Int): Long {
        require(count in 1..32)
        var out = 0L
        var left = count
        var byteIndex = 0
        while (left > 0) {
            val take = minOf(8, left)
            var v = 0
            repeat(take) { v = (v shl 1) or bit() }
            out = out or (v.toLong() shl (8 * byteIndex))
            byteIndex++
            left -= take
        }
        return out
    }

    fun int(count: Int): Int = bits(count).toInt()
    fun float(): Float = java.lang.Float.intBitsToFloat(bits(32).toInt())
}

/** Inverse of [BitReader]; used by tests to build LayerData fixtures with the same bit order. */
class BitWriter(capacity: Int = 4096) {
    private var data = ByteArray(capacity)
    private var bytePos = 0
    private var bitPos = 0

    private fun ensure() { if (bytePos >= data.size) data = data.copyOf(data.size * 2) }

    fun bits(value: Long, count: Int) {
        var left = count
        var byteIndex = 0
        while (left > 0) {
            val take = minOf(8, left)
            val chunk = ((value ushr (8 * byteIndex)) and 0xFF).toInt()
            for (i in take - 1 downTo 0) {
                ensure()
                val bit = (chunk shr i) and 1
                val mask = 0x80 shr bitPos
                data[bytePos] = if (bit != 0) (data[bytePos].toInt() or mask).toByte() else (data[bytePos].toInt() and mask.inv()).toByte()
                if (++bitPos >= 8) { bitPos = 0; bytePos++ }
            }
            byteIndex++
            left -= take
        }
    }

    fun bits(value: Int, count: Int) = bits(value.toLong() and 0xFFFFFFFFL, count)
    fun float(f: Float) = bits(java.lang.Float.floatToIntBits(f).toLong() and 0xFFFFFFFFL, 32)
    fun toByteArray(): ByteArray = data.copyOf(bytePos + if (bitPos > 0) 1 else 0)
}
