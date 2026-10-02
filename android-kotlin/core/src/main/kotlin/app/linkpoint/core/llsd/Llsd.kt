package app.linkpoint.core.llsd

import java.io.ByteArrayInputStream
import java.util.Base64
import java.util.UUID
import javax.xml.parsers.DocumentBuilderFactory
import org.w3c.dom.Element
import org.w3c.dom.Node

/**
 * LLSD (Linden Lab Structured Data) in its XML form, as used by capabilities and the event queue.
 *
 * Values map to plain Kotlin types: undef -> null, boolean -> Boolean, integer -> Int,
 * real -> Double, string/uri -> String, uuid -> UUID, date -> [LlsdDate], binary -> ByteArray,
 * map -> Map<String, Any?>, array -> List<Any?>.
 */
data class LlsdDate(val iso: String)

object Llsd {
    fun parseXml(xml: String): Any? = parseXml(xml.toByteArray(Charsets.UTF_8))

    fun parseXml(bytes: ByteArray): Any? {
        val factory = DocumentBuilderFactory.newInstance()
        // Responses come from a remote host; never resolve DTDs or external entities.
        for ((feature, value) in listOf(
            "http://apache.org/xml/features/disallow-doctype-decl" to true,
            "http://xml.org/sax/features/external-general-entities" to false,
            "http://xml.org/sax/features/external-parameter-entities" to false,
        )) {
            try { factory.setFeature(feature, value) } catch (_: Exception) { /* not supported by this parser */ }
        }
        factory.isExpandEntityReferences = false
        val doc = factory.newDocumentBuilder().parse(ByteArrayInputStream(bytes))
        val root = doc.documentElement
        require(root.tagName == "llsd") { "Not an LLSD document" }
        val first = children(root).firstOrNull() ?: return null
        return parseElement(first)
    }

    private fun children(e: Element): List<Element> {
        val out = ArrayList<Element>()
        var n: Node? = e.firstChild
        while (n != null) {
            if (n is Element) out.add(n)
            n = n.nextSibling
        }
        return out
    }

    private fun parseElement(e: Element): Any? {
        val text = e.textContent ?: ""
        return when (e.tagName) {
            "undef" -> null
            "boolean" -> text.trim().let { it == "1" || it.equals("true", true) }
            "integer" -> text.trim().ifEmpty { "0" }.toLong().toInt()
            "real" -> text.trim().ifEmpty { "0" }.toDouble()
            "string" -> text
            "uri" -> text
            "uuid" -> text.trim().let { if (it.isEmpty()) NIL_UUID else UUID.fromString(it) }
            "date" -> LlsdDate(text.trim())
            "binary" -> Base64.getMimeDecoder().decode(text.trim())
            "map" -> {
                val kids = children(e)
                val map = LinkedHashMap<String, Any?>()
                var i = 0
                while (i + 1 < kids.size) {
                    require(kids[i].tagName == "key") { "Expected <key> in LLSD map" }
                    map[kids[i].textContent ?: ""] = parseElement(kids[i + 1])
                    i += 2
                }
                map
            }
            "array" -> children(e).map { parseElement(it) }
            else -> throw IllegalArgumentException("Unknown LLSD element <${e.tagName}>")
        }
    }

    fun toXml(value: Any?): String {
        val sb = StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?><llsd>")
        write(sb, value)
        return sb.append("</llsd>").toString()
    }

    private fun write(sb: StringBuilder, v: Any?) {
        when (v) {
            null -> sb.append("<undef />")
            is Boolean -> sb.append("<boolean>").append(if (v) "1" else "0").append("</boolean>")
            is Int -> sb.append("<integer>").append(v).append("</integer>")
            is Long -> sb.append("<integer>").append(v.toInt()).append("</integer>")
            is Double -> sb.append("<real>").append(v).append("</real>")
            is Float -> sb.append("<real>").append(v.toDouble()).append("</real>")
            is String -> sb.append("<string>").append(escape(v)).append("</string>")
            is UUID -> sb.append("<uuid>").append(v).append("</uuid>")
            is LlsdDate -> sb.append("<date>").append(escape(v.iso)).append("</date>")
            is ByteArray -> sb.append("<binary encoding=\"base64\">").append(Base64.getEncoder().encodeToString(v)).append("</binary>")
            is Map<*, *> -> {
                sb.append("<map>")
                for ((k, x) in v) {
                    sb.append("<key>").append(escape(k.toString())).append("</key>")
                    write(sb, x)
                }
                sb.append("</map>")
            }
            is Iterable<*> -> {
                sb.append("<array>")
                for (x in v) write(sb, x)
                sb.append("</array>")
            }
            else -> throw IllegalArgumentException("Cannot encode ${v::class.simpleName} as LLSD")
        }
    }

    private fun escape(s: String) = buildString(s.length) {
        for (c in s) when (c) {
            '&' -> append("&amp;"); '<' -> append("&lt;"); '>' -> append("&gt;")
            else -> append(c)
        }
    }

    val NIL_UUID: UUID = UUID(0, 0)
}

@Suppress("UNCHECKED_CAST")
fun Any?.asLlsdMap(): Map<String, Any?>? = this as? Map<String, Any?>

@Suppress("UNCHECKED_CAST")
fun Any?.asLlsdList(): List<Any?>? = this as? List<Any?>
