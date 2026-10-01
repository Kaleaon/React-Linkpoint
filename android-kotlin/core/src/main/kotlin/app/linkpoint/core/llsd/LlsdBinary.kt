package app.linkpoint.core.llsd

import java.nio.ByteBuffer
import java.util.UUID

/**
 * LLSD in its binary and notation encodings. Mesh assets carry their header in one of these and
 * their geometry in zlib-compressed binary LLSD. Binary maps/arrays/strings/binaries map to the
 * same Kotlin types as [Llsd].
 */
object LlsdBinary {
    class Parsed(val value: Any?, val end: Int)

    private const val SENTINEL = "<? llsd/binary ?>"

    /** Parse one value starting at [start]. Detects the optional `<? LLSD/Binary ?>` header and notation. */
    fun parse(data: ByteArray, start: Int = 0): Parsed {
        var pos = start
        // Skip an optional sentinel line.
        if (data.size - pos > SENTINEL.length && data[pos].toInt() == '<'.code) {
            val head = String(data, pos, minOf(SENTINEL.length + 4, data.size - pos), Charsets.US_ASCII).lowercase()
            if (head.startsWith("<?") && head.contains("llsd/binary")) {
                val nl = (pos until data.size).firstOrNull { data[it].toInt() == '\n'.code } ?: throw IllegalArgumentException("Unterminated LLSD header")
                pos = nl + 1
            }
        }
        require(pos < data.size) { "Empty LLSD" }
        // Notation maps open with { followed by a quote; binary maps with { followed by a 4-byte count.
        val notation = data[pos].toInt() == '{'.code && pos + 1 < data.size && data[pos + 1].toInt().toChar() in "'\" \n\r\t}"
        return if (notation) LlsdNotation(data, pos).parseTop() else {
            val buf = ByteBuffer.wrap(data) // big-endian by default
            buf.position(pos)
            val v = try { read(buf) } catch (e: java.nio.BufferUnderflowException) { throw IllegalArgumentException("Truncated LLSD", e) }
            Parsed(v, buf.position())
        }
    }

    private fun read(b: ByteBuffer): Any? {
        require(b.hasRemaining()) { "Truncated LLSD" }
        return when (val t = b.get().toInt().toChar()) {
            '!' -> null
            '1' -> true
            '0' -> false
            'i' -> b.int
            'r' -> b.double
            'u' -> { val msb = b.long; val lsb = b.long; UUID(msb, lsb) }
            'b' -> bytes(b, b.int)
            's', 'l' -> String(bytes(b, b.int), Charsets.UTF_8)
            'd' -> LlsdDate(b.double.toString())
            '[' -> {
                val n = b.int
                require(n in 0..1_000_000) { "Bad array length" }
                val list = ArrayList<Any?>(minOf(n, 1024))
                repeat(n) { list += read(b) }
                require(b.get().toInt().toChar() == ']') { "Missing ]" }
                list
            }
            '{' -> {
                val n = b.int
                require(n in 0..1_000_000) { "Bad map length" }
                val map = LinkedHashMap<String, Any?>()
                repeat(n) {
                    require(b.get().toInt().toChar() == 'k') { "Expected map key" }
                    val key = String(bytes(b, b.int), Charsets.UTF_8)
                    map[key] = read(b)
                }
                require(b.get().toInt().toChar() == '}') { "Missing }" }
                map
            }
            else -> throw IllegalArgumentException("Unknown LLSD type '$t'")
        }
    }

    private fun bytes(b: ByteBuffer, n: Int): ByteArray {
        require(n >= 0 && n <= b.remaining()) { "Truncated LLSD data" }
        return ByteArray(n).also { b.get(it) }
    }
}

/** A small recursive-descent parser for LLSD notation (maps, arrays, scalars). */
internal class LlsdNotation(private val d: ByteArray, private var p: Int) {
    fun parseTop(): LlsdBinary.Parsed { val v = value(); return LlsdBinary.Parsed(v, p) }

    private fun ws() { while (p < d.size && d[p].toInt().toChar().isWhitespace()) p++ }
    private fun peek(): Char { require(p < d.size) { "Truncated LLSD notation" }; return d[p].toInt().toChar() }

    private fun value(): Any? {
        ws()
        return when (val c = peek()) {
            '!' -> { p++; null }
            '{' -> {
                p++
                val m = LinkedHashMap<String, Any?>()
                ws()
                while (peek() != '}') {
                    val k = scalarString(); ws()
                    require(peek() == ':') { "Expected ':' in notation map" }; p++
                    m[k] = value(); ws()
                    if (peek() == ',') { p++; ws() }
                }
                p++
                m
            }
            '[' -> {
                p++
                val l = ArrayList<Any?>()
                ws()
                while (peek() != ']') { l += value(); ws(); if (peek() == ',') { p++; ws() } }
                p++
                l
            }
            '\'', '"' -> scalarString()
            'i' -> { p++; number().toLong().toInt() }
            'r' -> { p++; number().toDouble() }
            't', 'T' -> { word(); true }
            'f', 'F' -> { word(); false }
            '1' -> { p++; true }
            '0' -> { p++; false }
            'u' -> { p++; java.util.UUID.fromString(String(d, p, 36, Charsets.US_ASCII)).also { p += 36 } }
            'b' -> {
                p++
                if (peek() == '(') {
                    p++
                    val n = number().toInt()
                    require(peek() == ')') { "Expected ')'" }; p++
                    require(peek() == '"') { "Expected '\"'" }; p++
                    require(p + n <= d.size) { "Truncated binary" }
                    val out = d.copyOfRange(p, p + n); p += n
                    require(peek() == '"') { "Expected closing '\"'" }; p++
                    out
                } else throw IllegalArgumentException("Unsupported base-encoded binary in notation")
            }
            else -> throw IllegalArgumentException("Unexpected '$c' in LLSD notation")
        }
    }

    private fun word() { while (p < d.size && d[p].toInt().toChar().isLetter()) p++ }

    private fun number(): String {
        val s = p
        while (p < d.size && d[p].toInt().toChar().let { it.isDigit() || it in "+-.eE" }) p++
        return String(d, s, p - s, Charsets.US_ASCII)
    }

    private fun scalarString(): String {
        val q = peek(); p++
        val sb = StringBuilder()
        while (true) {
            val c = peek()
            if (c == q) { p++; break }
            if (c == '\\') { p++; sb.append(peek()); p++ } else { sb.append(c); p++ }
        }
        return sb.toString()
    }
}
