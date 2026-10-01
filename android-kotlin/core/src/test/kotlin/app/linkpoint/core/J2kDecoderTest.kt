package app.linkpoint.core

import app.linkpoint.core.image.J2kDecoder
import app.linkpoint.core.image.J2kException
import java.io.File
import org.junit.Assert.*
import org.junit.Test

/**
 * Every .j2k under resources/j2k was written by OpenJPEG (see tools/j2k/make-fixtures.sh) next to
 * the PNM that OpenJPEG itself decodes it to. Our decoder must reproduce that output.
 */
class J2kDecoderTest {
    private val dir = File(javaClass.getResource("/j2k")!!.toURI())

    private class Pnm(val w: Int, val h: Int, val c: Int, val d: ByteArray)

    private fun readPnm(f: File): Pnm {
        val b = f.readBytes()
        var p = 0
        fun token(): String { while (b[p].toInt().toChar().isWhitespace()) p++; val s = p; while (!b[p].toInt().toChar().isWhitespace()) p++; return String(b, s, p - s) }
        val magic = token(); val w = token().toInt(); val h = token().toInt(); token(); p++
        return Pnm(w, h, if (magic == "P6") 3 else 1, b.copyOfRange(p, b.size))
    }

    private fun reference(name: String, suffix: String = ""): File? =
        listOf("ppm", "pgm").map { File(dir, "$name$suffix.$it") }.firstOrNull { it.exists() }

    /** Max absolute and mean absolute difference between two same-size images. */
    private fun diff(a: ByteArray, b: ByteArray): Pair<Int, Double> {
        var max = 0; var sum = 0L
        for (i in a.indices) { val d = Math.abs((a[i].toInt() and 0xFF) - (b[i].toInt() and 0xFF)); if (d > max) max = d; sum += d }
        return max to sum.toDouble() / a.size
    }

    private val lossy = setOf("irrev5", "irrev_gray", "lvl1", "tiles_irrev", "mode_all_irrev", "layers_irrev", "offset_irrev", "tiny_irrev", "col")

    private fun check(name: String, suffix: String = "", discard: Int = 0) {
        val ref = readPnm(reference(name, suffix) ?: error("no reference for $name$suffix"))
        val img = J2kDecoder.decode(File(dir, "$name.j2k").readBytes(), discard)
        assertEquals("$name width", ref.w, img.width); assertEquals("$name height", ref.h, img.height)
        assertEquals("$name components", ref.c, img.components)
        val (max, mean) = diff(img.data, ref.d)
        println("J2K %-20s %3dx%-3d x%d  max diff %d  mean %.4f".format(name + suffix, img.width, img.height, img.components, max, mean))
        // Reversible streams must match exactly. Irreversible ones differ only by float rounding.
        if (name in lossy) assertTrue("$name$suffix: max diff $max mean $mean", max <= 3 && mean < 0.5)
        else if (suffix.isNotEmpty()) assertTrue("$name$suffix: max diff $max mean $mean", max <= 3 && mean < 0.6)
        else assertEquals("$name$suffix: max diff $max mean $mean", 0, max)
    }

    @Test fun everyFixtureMatchesOpenJpeg() {
        val names = dir.listFiles { f -> f.name.endsWith(".j2k") }!!.map { it.name.removeSuffix(".j2k") }.sorted()
        assertTrue("fixtures missing", names.size >= 30)
        val failures = ArrayList<String>()
        for (n in names) try { check(n) } catch (e: Throwable) { failures += "$n: ${e.message ?: e::class.simpleName}" }
        assertTrue("decoder disagrees with OpenJPEG:\n" + failures.joinToString("\n"), failures.isEmpty())
    }

    @Test fun reducedResolutionMatchesOpenJpeg() {
        val failures = ArrayList<String>()
        for (n in listOf("rev5", "irrev5", "tiles", "prog_rpcl")) for (d in 1..2) {
            try { check(n, ".reduce$d", d) } catch (e: Throwable) { failures += "$n reduce$d: ${e.message ?: e::class.simpleName}" }
        }
        assertTrue(failures.joinToString("\n"), failures.isEmpty())
    }

    @Test fun jp2WrapperIsAccepted() {
        val cs = File(dir, "rev5.j2k").readBytes()
        fun box(type: String, payload: ByteArray): ByteArray {
            val len = payload.size + 8
            return byteArrayOf((len ushr 24).toByte(), (len ushr 16).toByte(), (len ushr 8).toByte(), len.toByte()) + type.toByteArray() + payload
        }
        val jp2 = box("jP  ", byteArrayOf(0x0d, 0x0a, 0x87.toByte(), 0x0a)) + box("ftyp", "jp2 ".toByteArray() + ByteArray(8)) + box("jp2c", cs)
        val a = J2kDecoder.decode(jp2); val b = J2kDecoder.decode(cs)
        assertArrayEquals(b.data, a.data)
    }

    @Test fun damagedStreamsFailCleanly() {
        val good = File(dir, "rev5.j2k").readBytes()
        assertThrows(J2kException::class.java) { J2kDecoder.decode(ByteArray(3)) }
        assertThrows(J2kException::class.java) { J2kDecoder.decode(byteArrayOf(1, 2, 3, 4, 5, 6, 7, 8, 9)) }
        // Truncation and random damage must never hang or throw anything but J2kException (or produce a partial image).
        for (cut in listOf(40, 100, good.size / 3, good.size / 2, good.size - 7)) {
            try { J2kDecoder.decode(good.copyOf(cut)) } catch (_: J2kException) { }
        }
        val rnd = java.util.Random(5)
        repeat(60) {
            val bad = good.copyOf()
            repeat(4) { bad[100 + rnd.nextInt(bad.size - 100)] = rnd.nextInt(256).toByte() }
            try { J2kDecoder.decode(bad) } catch (_: J2kException) { }
        }
    }
}
