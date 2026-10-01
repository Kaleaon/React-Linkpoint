package app.linkpoint.core.image

/** Decoded image: 8-bit samples, interleaved by component (1 = grey, 2 = grey+alpha, 3 = RGB, 4 = RGBA), top row first. */
class J2kImage(val width: Int, val height: Int, val components: Int, val data: ByteArray)

class J2kException(message: String) : Exception(message)

/** The MQ arithmetic decoder of JPEG 2000 Annex C (and JBIG2), with the context state packed as index<<1 | mps. */
internal class MqDecoder(private val data: ByteArray, start: Int, private val end: Int) {
    private var bp = start
    private var chigh: Int
    private var clow = 0
    private var ct = 0
    private var a = 0

    private fun byteAt(i: Int): Int = if (i < end) data[i].toInt() and 0xFF else 0xFF

    init {
        chigh = byteAt(start)
        byteIn()
        chigh = ((chigh shl 7) and 0xFFFF) or ((clow shr 9) and 0x7F)
        clow = (clow shl 7) and 0xFFFF
        ct -= 7
        a = 0x8000
    }

    private fun byteIn() {
        if (byteAt(bp) == 0xFF) {
            if (byteAt(bp + 1) > 0x8F) {
                clow += 0xFF00
                ct = 8
            } else {
                bp++
                clow += byteAt(bp) shl 9
                ct = 7
            }
        } else {
            bp++
            clow += if (bp < end) byteAt(bp) shl 8 else 0xFF00
            ct = 8
        }
        if (clow > 0xFFFF) { chigh += clow shr 16; clow = clow and 0xFFFF }
    }

    fun decode(contexts: ByteArray, pos: Int): Int {
        var idx = (contexts[pos].toInt() and 0xFF) shr 1
        var mps = contexts[pos].toInt() and 1
        val qe = QE[idx]
        var d: Int
        var av = a - qe
        if (chigh < qe) {
            if (av < qe) { av = qe; d = mps; idx = NMPS[idx] }
            else { av = qe; d = 1 xor mps; if (SWITCH[idx] == 1) mps = d; idx = NLPS[idx] }
        } else {
            chigh -= qe
            if (av and 0x8000 != 0) { a = av; return mps }
            if (av < qe) { d = 1 xor mps; if (SWITCH[idx] == 1) mps = d; idx = NLPS[idx] }
            else { d = mps; idx = NMPS[idx] }
        }
        do {
            if (ct == 0) byteIn()
            av = av shl 1
            chigh = ((chigh shl 1) and 0xFFFF) or ((clow shr 15) and 1)
            clow = (clow shl 1) and 0xFFFF
            ct--
        } while (av and 0x8000 == 0)
        a = av
        contexts[pos] = ((idx shl 1) or mps).toByte()
        return d
    }

    private companion object {
        val QE = intArrayOf(
            0x5601, 0x3401, 0x1801, 0x0ac1, 0x0521, 0x0221, 0x5601, 0x5401, 0x4801, 0x3801, 0x3001, 0x2401, 0x1c01, 0x1601,
            0x5601, 0x5401, 0x5101, 0x4801, 0x3801, 0x3401, 0x3001, 0x2801, 0x2401, 0x2201, 0x1c01, 0x1801, 0x1601, 0x1401,
            0x1201, 0x1101, 0x0ac1, 0x09c1, 0x08a1, 0x0521, 0x0441, 0x02a1, 0x0221, 0x0141, 0x0111, 0x0085, 0x0049, 0x0025,
            0x0015, 0x0009, 0x0005, 0x0001, 0x5601,
        )
        val NMPS = intArrayOf(
            1, 2, 3, 4, 5, 38, 7, 8, 9, 10, 11, 12, 13, 29, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
            33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 45, 46,
        )
        val NLPS = intArrayOf(
            1, 6, 9, 12, 29, 33, 6, 14, 14, 14, 17, 18, 20, 21, 14, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28,
            29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 46,
        )
        val SWITCH = intArrayOf(
            1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0,
        )
    }
}

/** Raw (bypass) bit reader with the JPEG 2000 bit-stuffing rule: after 0xFF only 7 bits of the next byte are used. */
internal class RawDecoder(private val data: ByteArray, private var pos: Int, private val end: Int) {
    private var c = 0
    private var ct = 0
    fun bit(): Int {
        if (ct == 0) {
            ct = if (c == 0xFF) 7 else 8
            c = if (pos < end) data[pos++].toInt() and 0xFF else 0xFF
            if (c == 0xFF && ct == 7 && pos >= end) ct = 8
        }
        ct--
        return (c shr ct) and 1
    }
}

/** Flags kept per sample by the code-block decoder. */
private const val SIG = 1
private const val REFINED = 2
private const val VISITED = 4
private const val NEG = 8

/** One code segment of a code-block: consecutive passes coded with one arithmetic (or raw) codeword. */
internal class Segment(val maxPasses: Int) {
    var passes = 0
    val chunks = ArrayList<IntArray>() // [start, end) into the tile data
    var length = 0
}

/** Everything the packet headers say about a code-block. */
internal class CodeBlock(val x0: Int, val y0: Int, val x1: Int, val y1: Int) {
    var included = false
    var zeroBitPlanes = 0
    var lblock = 3
    val segments = ArrayList<Segment>()
}

/** The bit-plane coding passes of Annex D for one code-block. */
internal class BlockDecoder(
    private val w: Int,
    private val h: Int,
    private val orient: Int, // 0 LL, 1 HL, 2 LH, 3 HH
    private val vsc: Boolean,
    private val reset: Boolean,
    private val segSym: Boolean,
) {
    private val stride = w + 2
    private val st = ByteArray((w + 2) * (h + 2))
    val mag = IntArray(w * h)
    val bitsDecoded = ByteArray(w * h)
    private val ctx = ByteArray(19)
    private var mq: MqDecoder? = null
    private var raw: RawDecoder? = null

    init { resetContexts() }

    fun resetContexts() {
        ctx.fill(0)
        ctx[0] = (4 shl 1).toByte()
        ctx[17] = (46 shl 1).toByte()
        ctx[18] = (3 shl 1).toByte()
    }

    fun initMq(data: ByteArray, start: Int, end: Int) { mq = MqDecoder(data, start, end); raw = null }
    fun initRaw(data: ByteArray, start: Int, end: Int) { raw = RawDecoder(data, start, end); mq = null }

    private fun at(x: Int, y: Int) = (y + 1) * stride + x + 1

    // Neighbour significance with vertically causal masking: in the last row of a stripe the row below is ignored.
    private fun sig(i: Int) = st[i].toInt() and SIG

    private fun zcContext(i: Int, y: Int): Int {
        val noSouth = vsc && (y and 3) == 3
        val hh = sig(i - 1) + sig(i + 1)
        val vv = sig(i - stride) + (if (noSouth) 0 else sig(i + stride))
        val dd = sig(i - stride - 1) + sig(i - stride + 1) + (if (noSouth) 0 else sig(i + stride - 1) + sig(i + stride + 1))
        var hx = hh; var vx = vv
        if (orient == 1) { hx = vv; vx = hh }
        if (orient == 3) {
            val hv = hh + vv
            return when {
                dd >= 3 -> 8
                dd == 2 -> if (hv >= 1) 7 else 6
                dd == 1 -> if (hv >= 2) 5 else if (hv == 1) 4 else 3
                else -> if (hv >= 2) 2 else hv
            }
        }
        return when {
            hx == 2 -> 8
            hx == 1 -> if (vx >= 1) 7 else if (dd >= 1) 6 else 5
            else -> if (vx == 2) 4 else if (vx == 1) 3 else if (dd >= 2) 2 else dd
        }
    }

    private fun signContribution(a: Int, aNeg: Boolean, b: Int, bNeg: Boolean): Int {
        val x = (if (a != 0) (if (aNeg) -1 else 1) else 0) + (if (b != 0) (if (bNeg) -1 else 1) else 0)
        return x.coerceIn(-1, 1)
    }

    private fun decodeSign(i: Int, y: Int): Int {
        val noSouth = vsc && (y and 3) == 3
        val l = st[i - 1].toInt(); val r = st[i + 1].toInt(); val n = st[i - stride].toInt()
        val s = if (noSouth) 0 else st[i + stride].toInt()
        val hc = signContribution(l and SIG, l and NEG != 0, r and SIG, r and NEG != 0)
        val vc = signContribution(n and SIG, n and NEG != 0, s and SIG, s and NEG != 0)
        val (c, xor) = when {
            hc == 1 -> when (vc) { 1 -> 13 to 0; 0 -> 12 to 0; else -> 11 to 0 }
            hc == 0 -> when (vc) { 1 -> 10 to 0; 0 -> 9 to 0; else -> 10 to 1 }
            else -> when (vc) { 1 -> 11 to 1; 0 -> 12 to 1; else -> 13 to 1 }
        }
        return mq!!.decode(ctx, c) xor xor
    }

    private fun bit(context: Int): Int = if (raw != null) raw!!.bit() else mq!!.decode(ctx, context)

    private fun becomeSignificant(i: Int, y: Int, idx: Int, negative: Boolean) {
        mag[idx] = 1
        st[i] = (st[i].toInt() or SIG or (if (negative) NEG else 0)).toByte()
    }

    fun significancePropagation() {
        for (y0 in 0 until h step 4) for (x in 0 until w) for (y in y0 until minOf(y0 + 4, h)) {
            val i = at(x, y); val idx = y * w + x
            if (sig(i) != 0) continue
            val zc = zcContext(i, y)
            if (zc == 0) continue
            val bitv = bit(zc)
            if (bitv != 0) {
                val neg = if (raw != null) raw!!.bit() != 0 else decodeSign(i, y) != 0
                becomeSignificant(i, y, idx, neg)
            }
            bitsDecoded[idx]++
            st[i] = (st[i].toInt() or VISITED).toByte()
        }
    }

    fun magnitudeRefinement() {
        for (y0 in 0 until h step 4) for (x in 0 until w) for (y in y0 until minOf(y0 + 4, h)) {
            val i = at(x, y); val idx = y * w + x
            val s = st[i].toInt()
            if (s and SIG == 0 || s and VISITED != 0) continue
            val context = if (s and REFINED != 0) 16 else if (zcContextAny(i, y)) 15 else 14
            val b = bit(context)
            mag[idx] = (mag[idx] shl 1) or b
            bitsDecoded[idx]++
            st[i] = (s or REFINED).toByte()
        }
    }

    private fun zcContextAny(i: Int, y: Int): Boolean {
        val noSouth = vsc && (y and 3) == 3
        var any = sig(i - 1) + sig(i + 1) + sig(i - stride) + sig(i - stride - 1) + sig(i - stride + 1)
        if (!noSouth) any += sig(i + stride) + sig(i + stride - 1) + sig(i + stride + 1)
        return any != 0
    }

    fun cleanup() {
        for (y0 in 0 until h step 4) for (x in 0 until w) {
            var y = y0
            val yEnd = minOf(y0 + 4, h)
            if (y0 + 4 <= h) {
                var allClear = true
                for (k in 0 until 4) {
                    val i = at(x, y0 + k)
                    if (st[i].toInt() and (SIG or VISITED) != 0 || zcContext(i, y0 + k) != 0) { allClear = false; break }
                }
                if (allClear) {
                    if (mq!!.decode(ctx, 18) == 0) {
                        for (k in 0 until 4) bitsDecoded[(y0 + k) * w + x]++
                        continue
                    }
                    val r = (mq!!.decode(ctx, 17) shl 1) or mq!!.decode(ctx, 17)
                    for (k in 0 until r) bitsDecoded[(y0 + k) * w + x]++
                    val yy = y0 + r
                    val i = at(x, yy)
                    becomeSignificant(i, yy, yy * w + x, decodeSign(i, yy) != 0)
                    bitsDecoded[yy * w + x]++
                    y = yy + 1
                }
            }
            while (y < yEnd) {
                val i = at(x, y); val idx = y * w + x
                val s = st[i].toInt()
                if (s and (SIG or VISITED) == 0) {
                    val d = mq!!.decode(ctx, zcContext(i, y))
                    if (d != 0) becomeSignificant(i, y, idx, decodeSign(i, y) != 0)
                    bitsDecoded[idx]++
                }
                y++
            }
        }
        if (segSym) { repeat(4) { mq!!.decode(ctx, 17) } }
        // Clear the visited marks for the next bit-plane.
        for (k in st.indices) st[k] = (st[k].toInt() and VISITED.inv()).toByte()
    }

    /** Run pass number [passType] (0 propagation, 1 refinement, 2 cleanup). */
    fun runPass(passType: Int) {
        when (passType) {
            0 -> significancePropagation()
            1 -> magnitudeRefinement()
            else -> cleanup()
        }
        if (reset) resetContexts()
    }

    fun isNegative(x: Int, y: Int) = st[at(x, y)].toInt() and NEG != 0
}
