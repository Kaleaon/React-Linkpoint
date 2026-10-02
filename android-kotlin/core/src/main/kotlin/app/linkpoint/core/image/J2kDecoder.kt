package app.linkpoint.core.image

import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/**
 * A JPEG 2000 (ISO 15444-1) decoder for the codestreams Second Life uses for textures: raw
 * codestreams or JP2 files, any progression order, tiles, precincts, layers, 5/3 and 9/7 wavelets,
 * the multiple component transform and all code-block styles (bypass, reset, termination on each
 * pass, vertically causal, segmentation symbols). Region-of-interest, packed packet headers and
 * sub-sampled components are not supported and raise [J2kException].
 */
object J2kDecoder {
    /** Decode [bytes]. [discardLevels] drops that many of the highest resolution levels (each halves the size). */
    fun decode(bytes: ByteArray, discardLevels: Int = 0): J2kImage = Codestream(bytes).decode(discardLevels.coerceAtLeast(0))
}

private fun ceilDiv(a: Int, b: Int): Int = Math.floorDiv(a + b - 1, b)
private fun floorDiv(a: Int, b: Int): Int = Math.floorDiv(a, b)
private fun ceilDivPow2(a: Int, p: Int): Int = (a + (1 shl p) - 1) shr p

private class Siz(
    val xsiz: Int, val ysiz: Int, val xosiz: Int, val yosiz: Int,
    val xtsiz: Int, val ytsiz: Int, val xtosiz: Int, val ytosiz: Int,
    val precision: IntArray, val signed: BooleanArray, val xr: IntArray, val yr: IntArray,
) { val csiz get() = precision.size }

private class Cod(
    val precincts: Boolean, val sop: Boolean, val eph: Boolean,
    val progression: Int, val layers: Int, val mct: Int,
    val levels: Int, val xcb: Int, val ycb: Int, val style: Int, val reversible: Boolean,
    val ppx: IntArray, val ppy: IntArray,
) {
    val bypass get() = style and 1 != 0
    val reset get() = style and 2 != 0
    val termAll get() = style and 4 != 0
    val vsc get() = style and 8 != 0
    val segSym get() = style and 32 != 0
}

private class Qcd(val style: Int, val guardBits: Int, val epsilon: IntArray, val mu: IntArray)

private class TileHeader {
    var cod: Cod? = null
    val coc = HashMap<Int, Cod>()
    var qcd: Qcd? = null
    val qcc = HashMap<Int, Qcd>()
}

// ---- tag trees (B.10.2) ------------------------------------------------------------------------

private class TagTree(w: Int, h: Int) {
    private class Node(var parent: Node? = null) { var value = 999; var low = 0 }
    private val leaves: Array<Node>
    private val width = w

    init {
        val levels = ArrayList<Array<Node>>()
        var lw = w; var lh = h
        while (true) {
            levels += Array(lw * lh) { Node() }
            if (lw <= 1 && lh <= 1) break
            lw = (lw + 1) / 2; lh = (lh + 1) / 2
        }
        for (l in 0 until levels.size - 1) {
            val cw = ceilDiv(w, 1 shl l)
            val pw = ceilDiv(w, 1 shl (l + 1))
            for ((n, node) in levels[l].withIndex()) node.parent = levels[l + 1][(n / cw / 2) * pw + (n % cw) / 2]
        }
        leaves = levels[0]
    }

    /** Decode until the leaf value is known to be below [threshold]; returns whether it is. */
    fun decode(x: Int, y: Int, threshold: Int, bits: BitReader): Boolean {
        val leaf = leaves[y * width + x]
        val stack = ArrayList<Node>()
        var node: Node? = leaf
        while (node?.parent != null) { stack += node; node = node.parent }
        var low = 0
        var cur: Node = node!!
        while (true) {
            if (low > cur.low) cur.low = low else low = cur.low
            while (low < threshold && low < cur.value) {
                if (bits.bit() != 0) cur.value = low else low++
            }
            cur.low = low
            if (stack.isEmpty()) break
            cur = stack.removeAt(stack.size - 1)
        }
        return cur.value < threshold
    }

    fun value(x: Int, y: Int) = leaves[y * width + x].value
}

/** Packet-header bit reader with the stuffing rule: the byte after 0xFF carries 7 bits. */
private class BitReader(val data: ByteArray, var pos: Int, val end: Int) {
    private var buf = 0
    private var left = 0
    private var prevFF = false

    fun bit(): Int {
        if (left == 0) {
            if (pos >= end) throw J2kException("Packet header runs past the end of the data")
            val b = data[pos++].toInt() and 0xFF
            left = if (prevFF) 7 else 8
            buf = b
            prevFF = b == 0xFF
        }
        left--
        return (buf shr left) and 1
    }

    fun bits(n: Int): Int { var v = 0; repeat(n) { v = (v shl 1) or bit() }; return v }

    fun align() {
        left = 0
        if (prevFF) { pos++; prevFF = false }
    }
}

// ---- tile structure -----------------------------------------------------------------------------

private class PrecinctBand(val cbx0: Int, val cby0: Int, val ncx: Int, val ncy: Int) {
    val blocks = ArrayList<CodeBlock>() // raster order within the precinct
    val inclusion = TagTree(max(ncx, 1), max(ncy, 1))
    val zeroBitPlanes = TagTree(max(ncx, 1), max(ncy, 1))
}

private class Band(val orient: Int, val x0: Int, val y0: Int, val x1: Int, val y1: Int) {
    var epsilon = 0
    var mu = 0
    var numbps = 0
    lateinit var precincts: Array<PrecinctBand?>
    val width get() = x1 - x0
    val height get() = y1 - y0
}

private class Resolution(val level: Int, val x0: Int, val y0: Int, val x1: Int, val y1: Int, val ppx: Int, val ppy: Int) {
    val bands = ArrayList<Band>()
    val pw: Int = if (x1 > x0) ceilDiv(x1, 1 shl ppx) - floorDiv(x0, 1 shl ppx) else 0
    val ph: Int = if (y1 > y0) ceilDiv(y1, 1 shl ppy) - floorDiv(y0, 1 shl ppy) else 0
    val precinctCount get() = pw * ph
}

private class TileComponent(val x0: Int, val y0: Int, val x1: Int, val y1: Int, val cod: Cod, val qcd: Qcd) {
    val resolutions = ArrayList<Resolution>()
}

private class Tile(val index: Int, val x0: Int, val y0: Int, val x1: Int, val y1: Int) {
    var header = TileHeader()
    val parts = ArrayList<IntArray>() // [start, end) of tile-part bodies
    lateinit var comps: Array<TileComponent>
}

private class Codestream(private val data: ByteArray) {
    private lateinit var siz: Siz
    private var mainCod: Cod? = null
    private val mainCoc = HashMap<Int, Cod>()
    private var mainQcd: Qcd? = null
    private val mainQcc = HashMap<Int, Qcd>()
    private val tiles = HashMap<Int, Tile>()
    private var numXTiles = 0
    private var numYTiles = 0

    private fun u8(p: Int) = data[p].toInt() and 0xFF
    private fun u16(p: Int) = (u8(p) shl 8) or u8(p + 1)
    private fun u32(p: Int): Int = (u16(p) shl 16) or u16(p + 2)

    fun decode(discard: Int): J2kImage {
        try {
            val (start, end) = locateCodestream()
            parseMarkers(start, end)
            return render(discard)
        } catch (e: J2kException) {
            throw e
        } catch (e: RuntimeException) {
            // Index, arithmetic and allocation errors from a damaged stream all mean "cannot decode".
            throw J2kException("Damaged JPEG 2000 stream (${e::class.simpleName})")
        }
    }

    /** Find the codestream in a raw stream or a JP2 file. */
    private fun locateCodestream(): Pair<Int, Int> {
        if (data.size < 4) throw J2kException("Not a JPEG 2000 stream")
        if (u16(0) == 0xFF4F) return 0 to data.size
        var pos = 0
        while (pos + 8 <= data.size) {
            var len = u32(pos).toLong() and 0xFFFFFFFFL
            val type = u32(pos + 4)
            var header = 8
            if (len == 1L) { len = ((u32(pos + 8).toLong() and 0xFFFFFFFFL) shl 32) or (u32(pos + 12).toLong() and 0xFFFFFFFFL); header = 16 }
            if (len == 0L) len = (data.size - pos).toLong()
            if (len < header) throw J2kException("Invalid JP2 box")
            if (type == 0x6A703263) return (pos + header) to min(data.size.toLong(), pos + len).toInt() // 'jp2c'
            pos += len.toInt()
        }
        throw J2kException("No codestream found")
    }

    private fun parseMarkers(start: Int, end: Int) {
        var p = start
        var current: Tile? = null
        var inMain = true
        while (p + 2 <= end) {
            val marker = u16(p); p += 2
            when (marker) {
                0xFF4F -> {}
                0xFFD9 -> break
                0xFF51 -> { val len = u16(p); parseSiz(p + 2, len - 2); p += len }
                0xFF52 -> { val len = u16(p); val c = parseCod(p + 2, p + len); if (inMain) mainCod = c else { current!!.header.cod = c; current.header.coc.clear() }; p += len }
                0xFF53 -> {
                    val len = u16(p); var q = p + 2
                    val comp = if (siz.csiz < 257) u8(q++) else { val v = u16(q); q += 2; v }
                    val c = parseCoc(q, p + len, comp, if (inMain) mainCod!! else current!!.header.cod!!)
                    if (inMain) mainCoc[comp] = c else current!!.header.coc[comp] = c
                    p += len
                }
                0xFF5C -> { val len = u16(p); val q = parseQcd(p + 2, p + len); if (inMain) mainQcd = q else { current!!.header.qcd = q; current.header.qcc.clear() }; p += len }
                0xFF5D -> {
                    val len = u16(p); var q = p + 2
                    val comp = if (siz.csiz < 257) u8(q++) else { val v = u16(q); q += 2; v }
                    val qq = parseQcd(q, p + len)
                    if (inMain) mainQcc[comp] = qq else current!!.header.qcc[comp] = qq
                    p += len
                }
                0xFF90 -> { // SOT
                    val len = u16(p)
                    val index = u16(p + 2)
                    var psot = u32(p + 4)
                    val tpIndex = u8(p + 8)
                    val tile = tiles.getOrPut(index) { newTile(index) }
                    if (tpIndex == 0) tile.header = TileHeader().also { it.cod = mainCod; it.qcd = mainQcd; it.coc.putAll(mainCoc); it.qcc.putAll(mainQcc) }
                    current = tile
                    inMain = false
                    val partEnd = if (psot == 0) end - 2 else min(end, p - 2 + psot)
                    p += len
                    // Tile-part header markers up to SOD.
                    while (p + 2 <= partEnd) {
                        val m = u16(p)
                        if (m == 0xFF93) { p += 2; break }
                        p += 2
                        val l = u16(p)
                        when (m) {
                            0xFF52 -> tile.header.cod = parseCod(p + 2, p + l).also { tile.header.coc.clear() }
                            0xFF53 -> { var q = p + 2; val comp = if (siz.csiz < 257) u8(q++) else { val v = u16(q); q += 2; v }; tile.header.coc[comp] = parseCoc(q, p + l, comp, tile.header.cod!!) }
                            0xFF5C -> tile.header.qcd = parseQcd(p + 2, p + l).also { tile.header.qcc.clear() }
                            0xFF5D -> { var q = p + 2; val comp = if (siz.csiz < 257) u8(q++) else { val v = u16(q); q += 2; v }; tile.header.qcc[comp] = parseQcd(q, p + l) }
                            0xFF61, 0xFF60 -> throw J2kException("Packed packet headers are not supported")
                            else -> {} // PLT, COM, POC-less markers: skipped
                        }
                        p += l
                    }
                    tile.parts += intArrayOf(p, partEnd)
                    p = partEnd
                }
                0xFF5F -> throw J2kException("Progression order changes (POC) are not supported")
                0xFF5E -> throw J2kException("Region of interest coding is not supported")
                0xFF60, 0xFF61 -> throw J2kException("Packed packet headers are not supported")
                else -> { // TLM, PLM, PLT, CRG, COM and others carry a length
                    if (p + 2 > end) break
                    p += u16(p)
                }
            }
        }
        if (!::siz.isInitialized) throw J2kException("Missing SIZ marker")
    }

    private fun newTile(index: Int): Tile {
        val tx = index % numXTiles; val ty = index / numXTiles
        return Tile(
            index,
            max(siz.xtosiz + tx * siz.xtsiz, siz.xosiz), max(siz.ytosiz + ty * siz.ytsiz, siz.yosiz),
            min(siz.xtosiz + (tx + 1) * siz.xtsiz, siz.xsiz), min(siz.ytosiz + (ty + 1) * siz.ytsiz, siz.ysiz),
        )
    }

    private fun parseSiz(p: Int, len: Int) {
        val csiz = u16(p + 34)
        if (csiz !in 1..4) throw J2kException("Unsupported component count $csiz")
        val prec = IntArray(csiz); val sgn = BooleanArray(csiz); val xr = IntArray(csiz); val yr = IntArray(csiz)
        for (i in 0 until csiz) {
            val q = p + 36 + i * 3
            prec[i] = (u8(q) and 0x7F) + 1; sgn[i] = u8(q) and 0x80 != 0; xr[i] = u8(q + 1); yr[i] = u8(q + 2)
            if (xr[i] != 1 || yr[i] != 1) throw J2kException("Sub-sampled components are not supported")
            if (prec[i] > 16) throw J2kException("Precision above 16 bits is not supported")
        }
        siz = Siz(u32(p + 2), u32(p + 6), u32(p + 10), u32(p + 14), u32(p + 18), u32(p + 22), u32(p + 26), u32(p + 30), prec, sgn, xr, yr)
        if (siz.xsiz <= siz.xosiz || siz.ysiz <= siz.yosiz || siz.xtsiz <= 0 || siz.ytsiz <= 0) throw J2kException("Invalid image size")
        if ((siz.xsiz - siz.xosiz).toLong() * (siz.ysiz - siz.yosiz) > 16L * 1024 * 1024) throw J2kException("Image is too large")
        numXTiles = ceilDiv(siz.xsiz - siz.xtosiz, siz.xtsiz)
        numYTiles = ceilDiv(siz.ysiz - siz.ytosiz, siz.ytsiz)
    }

    private fun parseCod(p: Int, end: Int): Cod {
        val scod = u8(p)
        val progression = u8(p + 1); val layers = u16(p + 2); val mct = u8(p + 4)
        return parseSp(p + 5, end, scod and 1 != 0, scod and 2 != 0, scod and 4 != 0, progression, layers, mct)
    }

    private fun parseCoc(p: Int, end: Int, comp: Int, base: Cod): Cod {
        val scoc = u8(p)
        return parseSp(p + 1, end, scoc and 1 != 0, base.sop, base.eph, base.progression, base.layers, base.mct)
    }

    private fun parseSp(p: Int, end: Int, precincts: Boolean, sop: Boolean, eph: Boolean, prog: Int, layers: Int, mct: Int): Cod {
        val levels = u8(p)
        if (levels > 32) throw J2kException("Too many decomposition levels")
        val xcb = (u8(p + 1) and 0xF) + 2; val ycb = (u8(p + 2) and 0xF) + 2
        if (xcb > 10 || ycb > 10 || xcb + ycb > 12) throw J2kException("Invalid code-block size")
        val style = u8(p + 3)
        val reversible = u8(p + 4) == 1
        val ppx = IntArray(levels + 1) { 15 }; val ppy = IntArray(levels + 1) { 15 }
        if (precincts) for (r in 0..levels) { if (p + 5 + r < end) { val b = u8(p + 5 + r); ppx[r] = b and 0xF; ppy[r] = b shr 4 } }
        return Cod(precincts, sop, eph, prog, layers, mct, levels, xcb, ycb, style, reversible, ppx, ppy)
    }

    private fun parseQcd(p: Int, end: Int): Qcd {
        val sq = u8(p)
        val style = sq and 0x1F
        val guard = sq shr 5
        val eps = ArrayList<Int>(); val mu = ArrayList<Int>()
        var q = p + 1
        when (style) {
            0 -> while (q < end) { eps += u8(q) shr 3; mu += 0; q++ }
            1, 2 -> while (q + 1 < end) { val v = u16(q); eps += v shr 11; mu += v and 0x7FF; q += 2 }
            else -> throw J2kException("Invalid quantisation style $style")
        }
        return Qcd(style, guard, eps.toIntArray(), mu.toIntArray())
    }

    // ---- building tile structures ---------------------------------------------------------------

    private fun buildTile(tile: Tile) {
        val hdr = tile.header
        tile.comps = Array(siz.csiz) { c ->
            val cod = hdr.coc[c] ?: hdr.cod ?: throw J2kException("Missing COD")
            val qcd = hdr.qcc[c] ?: hdr.qcd ?: throw J2kException("Missing QCD")
            val tc = TileComponent(ceilDiv(tile.x0, siz.xr[c]), ceilDiv(tile.y0, siz.yr[c]), ceilDiv(tile.x1, siz.xr[c]), ceilDiv(tile.y1, siz.yr[c]), cod, qcd)
            buildComponent(tc, c)
            tc
        }
    }

    private fun buildComponent(tc: TileComponent, c: Int) {
        val cod = tc.cod; val nl = cod.levels
        var bandIndex = 0
        for (r in 0..nl) {
            val sc = nl - r
            val res = Resolution(r, ceilDivPow2(tc.x0, sc), ceilDivPow2(tc.y0, sc), ceilDivPow2(tc.x1, sc), ceilDivPow2(tc.y1, sc), cod.ppx[r], cod.ppy[r])
            val specs = if (r == 0) listOf(0) else listOf(1, 2, 3) // 0 LL; 1 HL, 2 LH, 3 HH
            for (orient in specs) {
                val band = if (r == 0) Band(0, res.x0, res.y0, res.x1, res.y1) else {
                    val n = nl - r + 1 // decomposition level of these subbands
                    val xo = if (orient == 1 || orient == 3) 1 else 0; val yo = if (orient == 2 || orient == 3) 1 else 0
                    fun f(v: Int, o: Int) = Math.floorDiv(v - (1 shl (n - 1)) * o + (1 shl n) - 1, 1 shl n)
                    Band(orient, f(tc.x0, xo), f(tc.y0, yo), f(tc.x1, xo), f(tc.y1, yo))
                }
                // Quantisation parameters for this subband.
                val q = tc.qcd
                if (q.style == 1) {
                    band.epsilon = q.epsilon[0] + (if (r > 0) 1 - r else 0); band.mu = q.mu[0]
                } else {
                    if (bandIndex >= q.epsilon.size) throw J2kException("Missing quantisation parameters")
                    band.epsilon = q.epsilon[bandIndex]; band.mu = q.mu[bandIndex]
                }
                bandIndex++
                band.numbps = q.guardBits + band.epsilon - 1
                buildPrecincts(res, band, cod)
                res.bands += band
            }
            tc.resolutions += res
        }
    }

    private fun buildPrecincts(res: Resolution, band: Band, cod: Cod) {
        val r = res.level
        val xcb = min(cod.xcb, if (r > 0) res.ppx - 1 else res.ppx)
        val ycb = min(cod.ycb, if (r > 0) res.ppy - 1 else res.ppy)
        val pwBand = 1 shl (res.ppx - (if (r > 0) 1 else 0)); val phBand = 1 shl (res.ppy - (if (r > 0) 1 else 0))
        val bandPrecinctX0 = floorDiv(band.x0, pwBand); val bandPrecinctY0 = floorDiv(band.y0, phBand)
        band.precincts = arrayOfNulls(res.precinctCount)
        if (band.width <= 0 || band.height <= 0) return
        val cx0 = band.x0 shr xcb; val cy0 = band.y0 shr ycb
        val cx1 = ceilDivPow2(band.x1, xcb); val cy1 = ceilDivPow2(band.y1, ycb)
        // First collect blocks per precinct to learn their grid extents.
        val perPrecinct = HashMap<Int, ArrayList<IntArray>>()
        for (cy in cy0 until cy1) for (cx in cx0 until cx1) {
            val px = floorDiv(cx shl xcb, pwBand) - bandPrecinctX0
            val py = floorDiv(cy shl ycb, phBand) - bandPrecinctY0
            if (px < 0 || py < 0 || px >= res.pw || py >= res.ph) continue
            perPrecinct.getOrPut(py * res.pw + px) { ArrayList() }.add(intArrayOf(cx, cy))
        }
        for ((pi, cells) in perPrecinct) {
            val minX = cells.minOf { it[0] }; val maxX = cells.maxOf { it[0] }
            val minY = cells.minOf { it[1] }; val maxY = cells.maxOf { it[1] }
            val pb = PrecinctBand(minX, minY, maxX - minX + 1, maxY - minY + 1)
            for (cy in minY..maxY) for (cx in minX..maxX) {
                val x0 = max(band.x0, cx shl xcb); val y0 = max(band.y0, cy shl ycb)
                val x1 = min(band.x1, (cx + 1) shl xcb); val y1 = min(band.y1, (cy + 1) shl ycb)
                pb.blocks += CodeBlock(x0, y0, x1, y1)
            }
            band.precincts[pi] = pb
        }
    }

    // ---- packet sequencing ------------------------------------------------------------------------

    private class Packet(val comp: Int, val res: Int, val precinct: Int, val layer: Int)

    private fun packetOrder(tile: Tile): Sequence<Packet> {
        val cod = tile.header.cod!!
        val layers = cod.layers
        val maxRes = tile.comps.maxOf { it.cod.levels }
        val comps = tile.comps
        return sequence {
            when (cod.progression) {
                0 -> for (l in 0 until layers) for (r in 0..maxRes) for (c in comps.indices) {
                    if (r > comps[c].cod.levels) continue
                    for (p in 0 until comps[c].resolutions[r].precinctCount) yield(Packet(c, r, p, l))
                }
                1 -> for (r in 0..maxRes) for (l in 0 until layers) for (c in comps.indices) {
                    if (r > comps[c].cod.levels) continue
                    for (p in 0 until comps[c].resolutions[r].precinctCount) yield(Packet(c, r, p, l))
                }
                2 -> for (r in 0..maxRes) {
                    val (dx, dy) = minPrecinctStep(tile)
                    var y = tile.y0
                    while (y < tile.y1) {
                        var x = tile.x0
                        while (x < tile.x1) {
                            for (c in comps.indices) {
                                if (r > comps[c].cod.levels) continue
                                val k = precinctAt(tile, c, r, x, y) ?: continue
                                for (l in 0 until layers) yield(Packet(c, r, k, l))
                            }
                            x += dx - (x % dx)
                        }
                        y += dy - (y % dy)
                    }
                }
                3 -> {
                    val (dx, dy) = minPrecinctStep(tile)
                    var y = tile.y0
                    while (y < tile.y1) {
                        var x = tile.x0
                        while (x < tile.x1) {
                            for (c in comps.indices) for (r in 0..comps[c].cod.levels) {
                                val k = precinctAt(tile, c, r, x, y) ?: continue
                                for (l in 0 until layers) yield(Packet(c, r, k, l))
                            }
                            x += dx - (x % dx)
                        }
                        y += dy - (y % dy)
                    }
                }
                4 -> for (c in comps.indices) {
                    val (dx, dy) = minPrecinctStep(tile, c)
                    var y = tile.y0
                    while (y < tile.y1) {
                        var x = tile.x0
                        while (x < tile.x1) {
                            for (r in 0..comps[c].cod.levels) {
                                val k = precinctAt(tile, c, r, x, y) ?: continue
                                for (l in 0 until layers) yield(Packet(c, r, k, l))
                            }
                            x += dx - (x % dx)
                        }
                        y += dy - (y % dy)
                    }
                }
                else -> throw J2kException("Unsupported progression order ${cod.progression}")
            }
        }
    }

    private fun minPrecinctStep(tile: Tile, only: Int = -1): Pair<Int, Int> {
        var dx = Int.MAX_VALUE; var dy = Int.MAX_VALUE
        for ((c, tc) in tile.comps.withIndex()) {
            if (only >= 0 && c != only) continue
            for (r in 0..tc.cod.levels) {
                val res = tc.resolutions[r]
                val sx = tc.cod.levels - r
                val a = siz.xr[c].toLong() * (1L shl (res.ppx + sx)); val b = siz.yr[c].toLong() * (1L shl (res.ppy + sx))
                dx = min(dx.toLong(), a).toInt(); dy = min(dy.toLong(), b).toInt()
            }
        }
        return dx to dy
    }

    /** Index of the precinct that starts at image position (x, y) for this component and resolution, or null. */
    private fun precinctAt(tile: Tile, c: Int, r: Int, x: Int, y: Int): Int? {
        val tc = tile.comps[c]; val res = tc.resolutions[r]
        if (res.precinctCount == 0) return null
        val sx = tc.cod.levels - r
        val xr = siz.xr[c]; val yr = siz.yr[c]
        val stepX = xr.toLong() shl (res.ppx + sx); val stepY = yr.toLong() shl (res.ppy + sx)
        val okY = (y.toLong() % stepY == 0L) || (y == tile.y0 && ((res.y0.toLong() shl sx) % (1L shl (res.ppy + sx)) != 0L))
        val okX = (x.toLong() % stepX == 0L) || (x == tile.x0 && ((res.x0.toLong() shl sx) % (1L shl (res.ppx + sx)) != 0L))
        if (!okX || !okY) return null
        val prcx = floorDiv(ceilDiv(x, xr shl sx), 1 shl res.ppx) - floorDiv(res.x0, 1 shl res.ppx)
        val prcy = floorDiv(ceilDiv(y, yr shl sx), 1 shl res.ppy) - floorDiv(res.y0, 1 shl res.ppy)
        if (prcx < 0 || prcy < 0 || prcx >= res.pw || prcy >= res.ph) return null
        return prcx + prcy * res.pw
    }

    // ---- packet parsing -----------------------------------------------------------------------------

    private fun readPasses(b: BitReader): Int {
        if (b.bit() == 0) return 1
        if (b.bit() == 0) return 2
        var v = b.bits(2)
        if (v < 3) return v + 3
        v = b.bits(5)
        if (v < 31) return v + 6
        return b.bits(7) + 37
    }

    private fun floorLog2(n: Int): Int = 31 - Integer.numberOfLeadingZeros(n)

    private fun newSegment(cod: Cod, index: Int, previous: Segment?): Segment {
        if (cod.termAll) return Segment(1)
        if (cod.bypass) {
            return if (index == 0) Segment(10) else if (previous!!.maxPasses == 1 || previous.maxPasses == 10) Segment(2) else Segment(1)
        }
        return Segment(109)
    }

    /** Parse the packets of a tile out of its concatenated tile-parts. */
    private fun parsePackets(tile: Tile, body: ByteArray) {
        val cod = tile.header.cod!!
        var pos = 0
        val end = body.size
        for (pk in packetOrder(tile)) {
            if (pos >= end) break
            val tc = tile.comps[pk.comp]
            val res = tc.resolutions[pk.res]
            if (cod.sop && pos + 6 <= end && (body[pos].toInt() and 0xFF) == 0xFF && (body[pos + 1].toInt() and 0xFF) == 0x91) pos += 6
            val br = BitReader(body, pos, end)
            val items = ArrayList<Triple<CodeBlock, Segment, Int>>() // block, segment, byte length
            if (br.bit() != 0) {
                for (band in res.bands) {
                    val pb = band.precincts.getOrNull(pk.precinct) ?: continue
                    for ((n, cb) in pb.blocks.withIndex()) {
                        val cx = n % pb.ncx; val cy = n / pb.ncx
                        val included: Boolean
                        if (!cb.included) included = pb.inclusion.decode(cx, cy, pk.layer + 1, br)
                        else included = br.bit() != 0
                        if (!included) continue
                        if (!cb.included) {
                            cb.included = true
                            var i = 1
                            while (!pb.zeroBitPlanes.decode(cx, cy, i, br)) { i++; if (i > 64) throw J2kException("Bad zero bit-plane count") }
                            cb.zeroBitPlanes = i - 1
                            cb.lblock = 3
                        }
                        var newPasses = readPasses(br)
                        while (br.bit() != 0) cb.lblock++
                        // Distribute the new passes over code segments.
                        var seg = cb.segments.lastOrNull()
                        if (seg == null || seg.passes >= seg.maxPasses) { seg = newSegment(cod, cb.segments.size, cb.segments.lastOrNull()); cb.segments += seg }
                        while (newPasses > 0) {
                            val n2 = min(seg!!.maxPasses - seg.passes, newPasses)
                            val bitsForLen = cb.lblock + floorLog2(n2)
                            val len = br.bits(bitsForLen)
                            seg.passes += n2
                            items += Triple(cb, seg, len)
                            newPasses -= n2
                            if (newPasses > 0) { seg = newSegment(cod, cb.segments.size, seg); cb.segments += seg }
                        }
                    }
                }
            }
            br.align()
            pos = br.pos
            if (cod.eph && pos + 2 <= end && (body[pos].toInt() and 0xFF) == 0xFF && (body[pos + 1].toInt() and 0xFF) == 0x92) pos += 2
            for ((_, seg, len) in items) {
                if (pos + len > end) throw J2kException("Packet body runs past the end of the data")
                seg.chunks += intArrayOf(pos, pos + len)
                seg.length += len
                pos += len
            }
        }
    }

    // ---- block decoding and inverse transforms -------------------------------------------------------

    private fun decodeBlock(cb: CodeBlock, band: Band, cod: Cod, body: ByteArray, precision: Int, out: FloatArray, outStride: Int, ox: Int, oy: Int, scatter: (Int, Int, Int) -> Int) {
        if (cb.segments.isEmpty()) return
        val bw = cb.x1 - cb.x0; val bh = cb.y1 - cb.y0
        val dec = BlockDecoder(bw, bh, band.orient, cod.vsc, cod.reset, cod.segSym)
        val zbp = cb.zeroBitPlanes
        if (zbp > 0) dec.bitsDecoded.fill(min(zbp, 127).toByte())
        var passIndex = 0 // 0 is the first (cleanup) pass
        for (seg in cb.segments) {
            if (seg.passes == 0) continue
            // Concatenate this segment's bytes.
            val buf = ByteArray(seg.length)
            var o = 0
            for (ch in seg.chunks) { System.arraycopy(body, ch[0], buf, o, ch[1] - ch[0]); o += ch[1] - ch[0] }
            val isRaw = cod.bypass && passIndex >= 10 && ((passIndex + 2) % 3) != 2
            if (isRaw) dec.initRaw(buf, 0, buf.size) else dec.initMq(buf, 0, buf.size)
            for (k in 0 until seg.passes) {
                val type = (passIndex + 2) % 3 // pass 0 -> 2 (cleanup), then 0, 1, 2, ...
                dec.runPass(type)
                passIndex++
            }
        }
        val mb = band.numbps
        val reversible = cod.reversible
        val delta = if (reversible) 1.0 else 2.0.pow(precision + (when (band.orient) { 0 -> 0; 3 -> 2; else -> 1 }) - band.epsilon) * (1.0 + band.mu / 2048.0)
        for (y in 0 until bh) for (x in 0 until bw) {
            val m = dec.mag[y * bw + x]
            if (m == 0) continue
            val nb = dec.bitsDecoded[y * bw + x].toInt()
            val corr = if (reversible && nb >= mb) 0.0 else 0.5
            var v = (m + corr) * delta
            if (nb < mb) v *= (1 shl (mb - nb)).toDouble()
            if (dec.isNegative(x, y)) v = -v
            val dst = scatter(cb.x0 - band.x0 + x, cb.y0 - band.y0 + y, 0)
            out[dst] = v.toFloat()
        }
    }

    private fun render(discard: Int): J2kImage {
        val csiz = siz.csiz
        val cod0 = mainCod ?: throw J2kException("Missing COD")
        val d = min(discard, cod0.levels)
        val outW = ceilDivPow2(siz.xsiz, d) - ceilDivPow2(siz.xosiz, d)
        val outH = ceilDivPow2(siz.ysiz, d) - ceilDivPow2(siz.yosiz, d)
        val ox0 = ceilDivPow2(siz.xosiz, d); val oy0 = ceilDivPow2(siz.yosiz, d)
        val out = ByteArray(outW * outH * csiz)
        if (tiles.isEmpty()) throw J2kException("The stream contains no tiles")

        for (tile in tiles.values) {
            buildTile(tile)
            var total = 0
            for (p in tile.parts) total += p[1] - p[0]
            val body = ByteArray(total)
            var o = 0
            for (p in tile.parts) { System.arraycopy(data, p[0], body, o, p[1] - p[0]); o += p[1] - p[0] }
            try { parsePackets(tile, body) } catch (e: J2kException) { if (tile.comps.all { c -> c.resolutions.all { r -> r.bands.all { b -> b.precincts.all { it == null || it.blocks.none { cb -> cb.included } } } } }) throw e /* nothing decoded: fail */ }

            val planes = Array(csiz) { c -> reconstructComponent(tile, c, body, d) }
            writeTile(tile, planes, d, out, outW, ox0, oy0)
        }
        return J2kImage(outW, outH, csiz, out)
    }

    private class Plane(val x0: Int, val y0: Int, val w: Int, val h: Int, val v: FloatArray)

    private fun reconstructComponent(tile: Tile, c: Int, body: ByteArray, discard: Int): Plane {
        val tc = tile.comps[c]
        val nl = tc.cod.levels
        val top = nl - min(discard, nl)
        var ll: FloatArray? = null
        var llW = 0; var llH = 0
        for (r in 0..top) {
            val res = tc.resolutions[r]
            val w = res.x1 - res.x0; val h = res.y1 - res.y0
            val cur = FloatArray(max(w * h, 0))
            if (r == 0) {
                for (band in res.bands) decodeBand(tc, band, res, body, siz.precision[c], cur, w, 0, 0)
                ll = cur; llW = w; llH = h
            } else {
                for (band in res.bands) {
                    val xo = if (band.orient == 1 || band.orient == 3) 1 else 0
                    val yo = if (band.orient == 2 || band.orient == 3) 1 else 0
                    decodeBand(tc, band, res, body, siz.precision[c], cur, w, xo, yo, interleaveX0 = res.x0, interleaveY0 = res.y0)
                }
                // Interleave the lower resolution into its positions, then synthesise.
                val px = res.x0 and 1; val py = res.y0 and 1
                val prev = tc.resolutions[r - 1]
                for (y in 0 until llH) for (x in 0 until llW) {
                    val gx = 2 * (prev.x0 + x); val gy = 2 * (prev.y0 + y)
                    cur[(gy - res.y0) * w + (gx - res.x0)] = ll!![y * llW + x]
                }
                synthesise(cur, w, h, res.x0, res.y0, tc.cod.reversible)
                ll = cur; llW = w; llH = h
                if (px < 0 || py < 0) throw IllegalStateException()
            }
        }
        val res = tc.resolutions[top]
        return Plane(res.x0, res.y0, res.x1 - res.x0, res.y1 - res.y0, ll!!)
    }

    private fun decodeBand(tc: TileComponent, band: Band, res: Resolution, body: ByteArray, precision: Int, out: FloatArray, stride: Int, xo: Int, yo: Int, interleaveX0: Int = 0, interleaveY0: Int = 0) {
        for (pb in band.precincts) {
            if (pb == null) continue
            for (cb in pb.blocks) {
                if (!cb.included) continue
                decodeBlock(cb, band, tc.cod, body, precision, out, stride, 0, 0) { bx, by, _ ->
                    if (res.level == 0) by * stride + bx
                    else {
                        // Position inside the resolution: subband sample (u, v) lands at 2u + xo, 2v + yo in global coordinates.
                        val gx = 2 * (band.x0 + bx) + xo; val gy = 2 * (band.y0 + by) + yo
                        (gy - interleaveY0) * stride + (gx - interleaveX0)
                    }
                }
            }
        }
    }

    // ---- inverse DWT (Annex F), operating on interleaved samples with global-parity awareness ---------

    private fun mirror(i: Int, n: Int): Int {
        if (n == 1) return 0
        val period = 2 * (n - 1)
        var m = Math.floorMod(i, period)
        if (m >= n) m = period - m
        return m
    }

    private fun synthesise(a: FloatArray, w: Int, h: Int, u0: Int, v0: Int, reversible: Boolean) {
        if (w <= 0 || h <= 0) return
        val rowBuf = FloatArray(w + 16)
        for (y in 0 until h) {
            System.arraycopy(a, y * w, rowBuf, 8, w)
            filter1d(rowBuf, 8, w, u0, reversible)
            System.arraycopy(rowBuf, 8, a, y * w, w)
        }
        val colBuf = FloatArray(h + 16)
        for (x in 0 until w) {
            for (y in 0 until h) colBuf[8 + y] = a[y * w + x]
            filter1d(colBuf, 8, h, v0, reversible)
            for (y in 0 until h) a[y * w + x] = colBuf[8 + y]
        }
    }

    private fun filter1d(x: FloatArray, off: Int, n: Int, i0: Int, reversible: Boolean) {
        if (n == 1) { if (i0 and 1 != 0) x[off] = if (reversible) (x[off].toInt() shr 1).toFloat() else x[off] / 2f; return }
        // Symmetric extension by 4 on each side.
        for (k in 1..4) { x[off - k] = x[off + mirror(-k, n)]; x[off + n - 1 + k] = x[off + mirror(n - 1 + k, n)] }
        val even = i0 and 1 // local index of the first even-global sample
        fun lo(i: Int) = ((i - even) and 1) == 0 // true for even-global positions
        if (reversible) {
            var i = -1
            while (i <= n) { if (lo(i)) x[off + i] -= ((x[off + i - 1] + x[off + i + 1] + 2f).toInt() shr 2).toFloat(); i++ }
            i = 0
            while (i < n) { if (!lo(i)) x[off + i] += ((x[off + i - 1] + x[off + i + 1]).toInt() shr 1).toFloat(); i++ }
        } else {
            val alpha = -1.586134342059924f; val beta = -0.052980118572961f; val gamma = 0.882911075530934f; val delta = 0.443506852043971f
            val kk = 1.230174104914001f; val ik = 1f / kk
            for (i in -3 until n + 3) if (lo(i)) x[off + i] *= kk
            for (i in -2 until n + 2) if (!lo(i)) x[off + i] *= ik
            for (i in -3 until n + 3) if (lo(i)) x[off + i] -= delta * (x[off + i - 1] + x[off + i + 1])
            for (i in -2 until n + 2) if (!lo(i)) x[off + i] -= gamma * (x[off + i - 1] + x[off + i + 1])
            for (i in -1 until n + 1) if (lo(i)) x[off + i] -= beta * (x[off + i - 1] + x[off + i + 1])
            for (i in 0 until n) if (!lo(i)) x[off + i] -= alpha * (x[off + i - 1] + x[off + i + 1])
        }
    }

    // ---- component transform, level shift, output ----------------------------------------------------

    private fun writeTile(tile: Tile, planes: Array<Plane>, d: Int, out: ByteArray, outW: Int, ox0: Int, oy0: Int) {
        val csiz = siz.csiz
        val p0 = planes[0]
        val w = p0.w; val h = p0.h
        val mct = tile.header.cod!!.mct != 0 && csiz >= 3
        val reversible = tile.comps[0].cod.reversible
        val n = w * h
        if (mct) {
            val y0 = planes[0].v; val y1 = planes[1].v; val y2 = planes[2].v
            for (i in 0 until n) {
                val a = y0[i]; val b = y1[i]; val c = y2[i]
                if (reversible) {
                    val g = a - ((c + b).toInt() shr 2).toFloat()
                    y0[i] = c + g; y1[i] = g; y2[i] = b + g
                } else {
                    y0[i] = a + 1.402f * c; y1[i] = a - 0.34413f * b - 0.71414f * c; y2[i] = a + 1.772f * b
                }
            }
        }
        for (c in 0 until csiz) {
            val pl = planes[c]
            val prec = siz.precision[c]
            val shift = (1 shl (prec - 1)).toFloat()
            val scale = if (prec > 8) 1f / (1 shl (prec - 8)) else 1f
            val up = if (prec < 8) 255f / ((1 shl prec) - 1) else 1f
            val dx = pl.x0 - ox0; val dy = pl.y0 - oy0
            for (y in 0 until pl.h) {
                val oyy = y + dy
                if (oyy < 0) continue
                for (x in 0 until pl.w) {
                    val oxx = x + dx
                    if (oxx < 0 || oxx >= outW) continue
                    var v = (pl.v[y * pl.w + x] + (if (siz.signed[c]) 0f else shift)) * scale * up
                    if (siz.signed[c]) v += 128f
                    val iv = Math.round(v).coerceIn(0, 255)
                    out[(oyy * outW + oxx) * csiz + c] = iv.toByte()
                }
            }
        }
    }
}
