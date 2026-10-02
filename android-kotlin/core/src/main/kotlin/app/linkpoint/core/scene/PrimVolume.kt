package app.linkpoint.core.scene

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.sqrt

/** Geometry for one face of a prim, in the prim's unit space (multiply by the object scale to place it). */
class MeshFace(
    val faceIndex: Int, val positions: FloatArray, val normals: FloatArray, val uvs: FloatArray, val indices: IntArray,
    /** Rigged meshes only: four joint indices per vertex (into [MeshSkin.jointNames]); unused slots are 0 with weight 0. */
    val skinJoints: IntArray? = null,
    /** Rigged meshes only: four weights per vertex, normalised to sum to 1 (all zero for a vertex with no influence). */
    val skinWeights: FloatArray? = null,
) {
    val vertexCount: Int get() = positions.size / 3
    val isRigged: Boolean get() = skinJoints != null && skinWeights != null
}

class PrimMesh(val faces: List<MeshFace>) {
    /** Axis-aligned bounds as (minX, minY, minZ, maxX, maxY, maxZ), or null when empty. */
    fun bounds(): FloatArray? {
        var any = false
        val b = floatArrayOf(Float.MAX_VALUE, Float.MAX_VALUE, Float.MAX_VALUE, -Float.MAX_VALUE, -Float.MAX_VALUE, -Float.MAX_VALUE)
        for (f in faces) for (i in 0 until f.vertexCount) {
            any = true
            for (a in 0..2) { val v = f.positions[i * 3 + a]; if (v < b[a]) b[a] = v; if (v > b[a + 3]) b[a + 3] = v }
        }
        return if (any) b else null
    }
}

/**
 * Builds prim geometry the way Second Life defines it: a 2D profile (circle, square, triangle,
 * half circle) swept along a path (line or circle), with cuts, hollow, twist, taper, top size,
 * shear and revolutions. Faces are numbered 0 top, 1..m outer sides, m+1 bottom, then inner side
 * and profile cuts.
 *
 * Approximations (not checked against the official viewer): hole-size scaling on circular paths
 * uses a fixed torus proportion, radius offset and skew are ignored, and a half-circle (sphere)
 * profile with path cuts is left open rather than capped.
 */
object PrimVolume {
    private class V2(val x: Float, val y: Float)

    private class Loop(
        val pts: List<V2>,
        /** Face index of the segment leaving point j (towards j+1, wrapping for closed loops). */
        val face: IntArray,
        /** Whether point j blends smoothly between its two segments. */
        val smooth: BooleanArray,
        val closed: Boolean,
    )

    private class Step(val ox: Float, val oy: Float, val oz: Float, val xx: Float, val xy: Float, val xz: Float, val yx: Float, val yy: Float, val yz: Float, val sx: Float, val sy: Float, val twist: Float, val t: Float)

    // ---- profile shapes ---------------------------------------------------------------------------

    private fun polygon(kind: Int): List<V2>? = when (kind) {
        1 -> listOf(V2(-.5f, -.5f), V2(.5f, -.5f), V2(.5f, .5f), V2(-.5f, .5f))
        2 -> listOf(V2(-.5f, -.5f), V2(.5f, -.5f), V2(0f, .5f))
        3 -> listOf(V2(-.5f, -.433f), V2(.5f, -.433f), V2(0f, .433f))
        4 -> listOf(V2(-.5f, -.5f), V2(.5f, -.5f), V2(-.5f, .5f))
        else -> null // 0 circle, 5 half circle
    }

    private fun cum(poly: List<V2>): FloatArray {
        val c = FloatArray(poly.size + 1)
        for (i in poly.indices) {
            val a = poly[i]; val b = poly[(i + 1) % poly.size]
            c[i + 1] = c[i] + sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y))
        }
        return c
    }

    private fun pointAt(kind: Int, s: Float): V2 {
        val poly = polygon(kind)
        if (poly == null) {
            if (kind == 5) { val a = (-0.5 + s) * PI; return V2((0.5 * cos(a)).toFloat(), (0.5 * sin(a)).toFloat()) }
            val a = 2.0 * PI * s
            return V2((0.5 * cos(a)).toFloat(), (0.5 * sin(a)).toFloat())
        }
        val c = cum(poly)
        val d = s * c.last()
        var i = 0
        while (i < poly.size - 1 && d > c[i + 1]) i++
        val seg = c[i + 1] - c[i]
        val f = if (seg > 0f) ((d - c[i]) / seg).coerceIn(0f, 1f) else 0f
        val a = poly[i]; val b = poly[(i + 1) % poly.size]
        return V2(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f)
    }

    private fun edgeAt(kind: Int, s: Float): Int {
        val poly = polygon(kind) ?: return 0
        val c = cum(poly)
        val d = s * c.last()
        var i = 0
        while (i < poly.size - 1 && d >= c[i + 1] - 1e-6f) i++
        return i
    }

    private fun corners(kind: Int): List<Float> {
        val poly = polygon(kind) ?: return emptyList()
        val c = cum(poly)
        return (0 until poly.size).map { c[it] / c.last() }
    }

    // ---- profile loops ----------------------------------------------------------------------------

    private class Profile(val loops: List<Loop>, val outerFaces: Int, val hollow: Boolean, val open: Boolean, val halfCircle: Boolean)

    private fun profile(p: PrimParams, detail: Int): Profile {
        val kind = p.profileCurve and 0x0F
        val holeKind = when (p.profileCurve and 0xF0) { 0x10 -> 0; 0x20 -> 1; 0x30 -> 2; else -> kind }
        val b = p.profileBegin.coerceIn(0f, 0.99f)
        val e = p.profileEnd.coerceIn(b + 0.01f, 1f)
        val poly = polygon(kind)
        val m = poly?.size ?: 1
        val full = b <= 1e-4f && e >= 0.9999f

        if (kind == 5) {
            val n = max(3, ceil(detail / 2.0 * (e - b)).toInt() + 1)
            val pts = (0 until n).map { pointAt(5, b + (e - b) * it / (n - 1)) }
            return Profile(listOf(Loop(pts, IntArray(n) { 1 }, BooleanArray(n) { it in 1 until n - 1 }, false)), 1, false, true, true)
        }

        val hollowAmt = if (p.profileHollow > 0.001f) p.profileHollow.coerceIn(0f, 0.95f) else 0f
        // Sample parameters along the perimeter: ends, corners of either shape, and arc samples for circles.
        val ss = sortedSetOf(b, e)
        for (c in corners(kind)) if (c > b + 1e-5f && c < e - 1e-5f) ss += c
        if (hollowAmt > 0f) for (c in corners(holeKind)) if (c > b + 1e-5f && c < e - 1e-5f) ss += c
        if (kind == 0 || (hollowAmt > 0f && holeKind == 0)) {
            val n = max(2, ceil(detail * (e - b)).toInt())
            for (i in 1 until n) ss += b + (e - b) * i / n
        }
        var sList = ss.toList()
        if (full) sList = sList.dropLast(1) // closed loop: do not repeat the first point

        val outer = sList.map { pointAt(kind, it) }
        val outerCorners = corners(kind)
        fun edgeFace(s0: Float, s1: Float) = 1 + (if (poly == null) 0 else edgeAt(kind, (s0 + s1) / 2f))
        val nSeg = if (full) sList.size else sList.size - 1
        val outerFace = IntArray(sList.size) { j ->
            if (j < nSeg) edgeFace(sList[j], if (j + 1 < sList.size) sList[j + 1] else e) else 0
        }
        fun smoothOuter(j: Int): Boolean {
            val s = sList[j]
            if (!full && (j == 0 || j == sList.size - 1)) return false
            return poly == null || outerCorners.none { abs(it - s) < 1e-5f }
        }
        val innerFaceId = m + 2; val cutA = m + 3; val cutB = m + 4

        if (hollowAmt <= 0f) {
            if (full) {
                return Profile(listOf(Loop(outer, outerFace, BooleanArray(outer.size) { smoothOuter(it) }, true)), m, false, false, false)
            }
            // Pie: centre point plus the arc, closed through the centre; the two straight edges are the cut faces.
            val pts = listOf(V2(0f, 0f)) + outer
            val face = IntArray(pts.size)
            face[0] = cutA
            for (j in outer.indices) face[j + 1] = if (j < outer.size - 1) outerFace[j] else cutB
            val smooth = BooleanArray(pts.size) { it != 0 && smoothOuter(it - 1) }
            return Profile(listOf(Loop(pts, face, smooth, true)), m, false, true, false)
        }

        val holeSc = hollowAmt
        val inner = sList.map { s -> pointAt(holeKind, s).let { V2(it.x * holeSc, it.y * holeSc) } }
        fun smoothInner(j: Int): Boolean = if (!full && (j == 0 || j == sList.size - 1)) false else holeKind == 0 || corners(holeKind).none { abs(it - sList[j]) < 1e-5f }
        if (full) {
            val rev = inner.reversed()
            return Profile(
                listOf(
                    Loop(outer, outerFace, BooleanArray(outer.size) { smoothOuter(it) }, true),
                    Loop(rev, IntArray(rev.size) { innerFaceId }, BooleanArray(rev.size) { smoothInner(rev.size - 1 - it) }, true),
                ),
                m, true, false, false,
            )
        }
        // Open and hollow: outer arc forward, a cut edge, inner arc backward, a cut edge back to the start.
        val pts = outer + inner.reversed()
        val k = outer.size
        val face = IntArray(pts.size)
        for (j in 0 until k - 1) face[j] = outerFace[j]
        face[k - 1] = cutB
        for (j in k until pts.size - 1) face[j] = innerFaceId
        face[pts.size - 1] = cutA
        val smooth = BooleanArray(pts.size) { j -> if (j < k) smoothOuter(j) else smoothInner(pts.size - 1 - j) }
        return Profile(listOf(Loop(pts, face, smooth, true)), m, true, true, false)
    }

    // ---- paths ------------------------------------------------------------------------------------

    private fun taperScale(taper: Float, t: Float) = if (taper >= 0f) 1f + (1f - taper - 1f) * t else (1f + taper) + (1f - (1f + taper)) * t

    private fun path(p: PrimParams, kind: Int, halfCircle: Boolean, detail: Int): Pair<List<Step>, Boolean> {
        val b = p.pathBegin.coerceIn(0f, 0.99f)
        val e = p.pathEnd.coerceIn(b + 0.01f, 1f)
        val twistSpan = abs(p.twist - p.twistBegin) * PI.toFloat()
        val circle = (p.pathCurve and 0xF0) == 0x20 || (p.pathCurve and 0xF0) == 0x30
        if (!circle) {
            val n = 2 + ceil(twistSpan / (PI / 12)).toInt().coerceAtMost(48)
            val steps = (0 until n).map { k ->
                val t = b + (e - b) * k / (n - 1)
                Step(
                    p.shearX * t, p.shearY * t, t - 0.5f, 1f, 0f, 0f, 0f, 1f, 0f,
                    (1f + (p.pathScaleX - 1f) * t) * taperScale(p.taperX, t), (1f + (p.pathScaleY - 1f) * t) * taperScale(p.taperY, t),
                    (p.twistBegin + (p.twist - p.twistBegin) * t) * PI.toFloat(), t,
                )
            }
            return steps to false
        }
        val rev = p.revolutions.coerceIn(1f, 4f)
        val n = max(3, ceil(detail * rev * (e - b)).toInt() + 1)
        val tubeX: Float; val tubeY: Float; val r0: Float
        if (halfCircle) { tubeX = p.pathScaleX; tubeY = p.pathScaleY; r0 = 0f }
        else {
            // Torus proportion: default hole size (1.0, 0.25) gives a ring of outer radius 0.5 and tube radius 0.16.
            tubeX = (0.32f * p.pathScaleX).coerceIn(0.02f, 1f); tubeY = (1.28f * p.pathScaleY).coerceIn(0.02f, 1f); r0 = 0.5f - tubeX / 2f
        }
        val steps = (0 until n).map { k ->
            val t = b + (e - b) * k / (n - 1)
            val a = (2.0 * PI * rev * t).toFloat()
            val c = cos(a); val s = sin(a)
            Step(
                r0 * c, r0 * s, 0f, c, s, 0f, 0f, 0f, -1f,
                tubeX * taperScale(p.taperX, t), tubeY * taperScale(p.taperY, t),
                (p.twistBegin + (p.twist - p.twistBegin) * t) * PI.toFloat(), t,
            )
        }
        val closedRing = b <= 1e-4f && e >= 0.9999f && abs(rev - 1f) < 1e-3f
        return steps to closedRing
    }

    // ---- assembly ---------------------------------------------------------------------------------

    private class Builder {
        val pos = ArrayList<Float>(); val uv = ArrayList<Float>(); val idx = ArrayList<Int>()
        val vertexCount get() = pos.size / 3
        fun add(x: Float, y: Float, z: Float, u: Float, v: Float): Int { pos += x; pos += y; pos += z; uv += u; uv += v; return vertexCount - 1 }
        fun tri(a: Int, b: Int, c: Int) { idx += a; idx += b; idx += c }
        fun build(index: Int): MeshFace {
            val p = pos.toFloatArray()
            val n = FloatArray(p.size)
            var i = 0
            while (i < idx.size) {
                val a = idx[i] * 3; val b = idx[i + 1] * 3; val c = idx[i + 2] * 3
                val ux = p[b] - p[a]; val uy = p[b + 1] - p[a + 1]; val uz = p[b + 2] - p[a + 2]
                val vx = p[c] - p[a]; val vy = p[c + 1] - p[a + 1]; val vz = p[c + 2] - p[a + 2]
                val nx = uy * vz - uz * vy; val ny = uz * vx - ux * vz; val nz = ux * vy - uy * vx
                for (q in intArrayOf(a, b, c)) { n[q] += nx; n[q + 1] += ny; n[q + 2] += nz }
                i += 3
            }
            return MeshFace(index, p, normalize(n), uv.toFloatArray(), idx.toIntArray())
        }
        fun normalize(n: FloatArray): FloatArray {
            var i = 0
            while (i < n.size) {
                val l = sqrt(n[i] * n[i] + n[i + 1] * n[i + 1] + n[i + 2] * n[i + 2])
                if (l > 1e-12f) { n[i] /= l; n[i + 1] /= l; n[i + 2] /= l } else { n[i] = 0f; n[i + 1] = 0f; n[i + 2] = 1f }
                i += 3
            }
            return n
        }
    }

    private fun place(s: Step, x: Float, y: Float): FloatArray {
        val cx = x * s.sx; val cy = y * s.sy
        val c = cos(s.twist); val sn = sin(s.twist)
        val rx = cx * c - cy * sn; val ry = cx * sn + cy * c
        return floatArrayOf(s.ox + s.xx * rx + s.yx * ry, s.oy + s.xy * rx + s.yy * ry, s.oz + s.xz * rx + s.yz * ry)
    }

    fun build(params: PrimParams, detail: Int = 24): PrimMesh {
        val prof = profile(params, detail)
        val (steps, closedRing) = path(params, params.profileCurve and 0x0F, prof.halfCircle, detail)
        val rows = steps.size
        val faces = HashMap<Int, Builder>()
        fun face(i: Int) = faces.getOrPut(i) { Builder() }

        for (loop in prof.loops) {
            val n = loop.pts.size
            val segCount = if (loop.closed) n else n - 1
            // Group consecutive segments into runs that share vertices (smooth joins) and have one face index.
            var j = 0
            while (j < segCount) {
                var end = j
                while (end + 1 < segCount && loop.smooth[(end + 1) % n] && loop.face[end + 1] == loop.face[j]) end++
                val fb = face(loop.face[j])
                val cols = end - j + 2
                // Cumulative profile length for u.
                val lens = FloatArray(cols)
                for (c in 1 until cols) {
                    val a = loop.pts[(j + c - 1) % n]; val b = loop.pts[(j + c) % n]
                    lens[c] = lens[c - 1] + sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y))
                }
                val total = if (lens.last() > 0f) lens.last() else 1f
                val base = fb.vertexCount
                for (c in 0 until cols) {
                    val pt = loop.pts[(j + c) % n]
                    for (k in 0 until rows) {
                        val q = place(steps[k], pt.x, pt.y)
                        fb.add(q[0], q[1], q[2], lens[c] / total, steps[k].t)
                    }
                }
                for (c in 0 until cols - 1) for (k in 0 until rows - 1) {
                    val a = base + c * rows + k; val bq = base + (c + 1) * rows + k
                    val cq = base + (c + 1) * rows + k + 1; val d = base + c * rows + k + 1
                    fb.tri(a, bq, cq); fb.tri(a, cq, d)
                }
                j = end + 1
            }
        }

        // Caps: only for line paths and cut circular paths, and not for the open half-circle profile.
        if (!closedRing && !prof.halfCircle) {
            val m = prof.outerFaces
            for ((faceIdx, k, up) in listOf(Triple(0, rows - 1, true), Triple(m + 1, 0, false))) {
                val fb = face(faceIdx)
                val step = steps[k]
                val ring = prof.loops[0]
                fun addPt(pt: V2): Int { val q = place(step, pt.x, pt.y); return fb.add(q[0], q[1], q[2], pt.x + 0.5f, pt.y + 0.5f) }
                if (!prof.hollow) {
                    val centre = if (prof.open) ring.pts[0] else V2(0f, 0f)
                    val c = addPt(centre)
                    val start = if (prof.open) 1 else 0
                    val ids = (start until ring.pts.size).map { addPt(ring.pts[it]) }
                    val last = if (ring.closed && !prof.open) ids.size else ids.size - 1
                    for (i in 0 until last) {
                        val a = ids[i]; val b = ids[(i + 1) % ids.size]
                        if (up) fb.tri(c, a, b) else fb.tri(c, b, a)
                    }
                } else if (!prof.open) {
                    val o = prof.loops[0].pts.map { addPt(it) }
                    val inn = prof.loops[1].pts.reversed().map { addPt(it) }
                    for (i in o.indices) {
                        val i2 = (i + 1) % o.size
                        if (up) { fb.tri(o[i], o[i2], inn[i2]); fb.tri(o[i], inn[i2], inn[i]) }
                        else { fb.tri(o[i], inn[i2], o[i2]); fb.tri(o[i], inn[i], inn[i2]) }
                    }
                } else {
                    val all = ring.pts
                    val half = all.size / 2
                    val o = (0 until half).map { addPt(all[it]) }
                    val inn = (all.size - 1 downTo half).map { addPt(all[it]) }
                    for (i in 0 until half - 1) {
                        if (up) { fb.tri(o[i], o[i + 1], inn[i + 1]); fb.tri(o[i], inn[i + 1], inn[i]) }
                        else { fb.tri(o[i], inn[i + 1], o[i + 1]); fb.tri(o[i], inn[i], inn[i + 1]) }
                    }
                }
            }
        }

        // Close the seam of a full circular smooth face so lighting is continuous there.
        val out = faces.toSortedMap().map { (i, b) -> b.build(i) }.filter { it.indices.isNotEmpty() }
        return PrimMesh(out)
    }
}
