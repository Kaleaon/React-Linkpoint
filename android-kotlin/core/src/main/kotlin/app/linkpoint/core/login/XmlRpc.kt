package app.linkpoint.core.login

import java.io.ByteArrayInputStream
import java.util.Base64
import javax.xml.parsers.DocumentBuilderFactory
import org.w3c.dom.Element
import org.w3c.dom.Node

/**
 * The small slice of XML-RPC the login service speaks. Values map to Kotlin types:
 * string -> String, int/i4 -> Int, boolean -> Boolean, double -> Double, base64 -> ByteArray,
 * struct -> Map<String, Any?>, array -> List<Any?>.
 */
object XmlRpc {
    fun methodCall(method: String, struct: Map<String, Any?>): String {
        val sb = StringBuilder("<?xml version=\"1.0\"?>\n<methodCall>\n<methodName>")
        sb.append(escape(method)).append("</methodName>\n<params>\n<param>\n")
        writeValue(sb, struct)
        sb.append("\n</param>\n</params>\n</methodCall>\n")
        return sb.toString()
    }

    private fun writeValue(sb: StringBuilder, v: Any?) {
        sb.append("<value>")
        when (v) {
            null -> sb.append("<string></string>")
            is Boolean -> sb.append("<boolean>").append(if (v) 1 else 0).append("</boolean>")
            is Int -> sb.append("<int>").append(v).append("</int>")
            is Double -> sb.append("<double>").append(v).append("</double>")
            is String -> sb.append("<string>").append(escape(v)).append("</string>")
            is Map<*, *> -> {
                sb.append("<struct>")
                for ((k, x) in v) {
                    sb.append("<member><name>").append(escape(k.toString())).append("</name>")
                    writeValue(sb, x)
                    sb.append("</member>")
                }
                sb.append("</struct>")
            }
            is Iterable<*> -> {
                sb.append("<array><data>")
                for (x in v) writeValue(sb, x)
                sb.append("</data></array>")
            }
            else -> throw IllegalArgumentException("Cannot encode ${v::class.simpleName} as XML-RPC")
        }
        sb.append("</value>")
    }

    class Fault(val code: Int, val text: String) : Exception("XML-RPC fault $code: $text")

    /** Parse a methodResponse. Returns the single result value; throws [Fault] for a fault response. */
    fun parseResponse(xml: String): Any? {
        val factory = DocumentBuilderFactory.newInstance()
        for ((feature, value) in listOf(
            "http://apache.org/xml/features/disallow-doctype-decl" to true,
            "http://xml.org/sax/features/external-general-entities" to false,
            "http://xml.org/sax/features/external-parameter-entities" to false,
        )) {
            try { factory.setFeature(feature, value) } catch (_: Exception) { /* parser does not support it */ }
        }
        factory.isExpandEntityReferences = false
        val doc = try {
            factory.newDocumentBuilder().parse(ByteArrayInputStream(xml.toByteArray(Charsets.UTF_8)))
        } catch (e: Exception) {
            throw IllegalArgumentException("The server's response was not valid XML", e)
        }
        val root = doc.documentElement
        require(root.tagName == "methodResponse") { "Not an XML-RPC response" }
        val fault = kids(root).firstOrNull { it.tagName == "fault" }
        if (fault != null) {
            val value = parseValue(kids(fault).first { it.tagName == "value" }) as? Map<*, *>
            throw Fault((value?.get("faultCode") as? Int) ?: 0, value?.get("faultString")?.toString() ?: "Unknown fault")
        }
        val params = kids(root).firstOrNull { it.tagName == "params" } ?: throw IllegalArgumentException("No params in response")
        val param = kids(params).first { it.tagName == "param" }
        return parseValue(kids(param).first { it.tagName == "value" })
    }

    private fun kids(e: Element): List<Element> {
        val out = ArrayList<Element>()
        var n: Node? = e.firstChild
        while (n != null) { if (n is Element) out.add(n); n = n.nextSibling }
        return out
    }

    private fun parseValue(value: Element): Any? {
        val inner = kids(value).firstOrNull() ?: return value.textContent ?: ""
        val text = inner.textContent ?: ""
        return when (inner.tagName) {
            "string" -> text
            "int", "i4", "i8" -> text.trim().toLongOrNull()?.let { if (it in Int.MIN_VALUE..Int.MAX_VALUE) it.toInt() else it } ?: 0
            "boolean" -> text.trim() == "1" || text.trim().equals("true", true)
            "double" -> text.trim().toDoubleOrNull() ?: 0.0
            "base64" -> Base64.getMimeDecoder().decode(text.trim())
            "dateTime.iso8601" -> text.trim()
            "nil" -> null
            "struct" -> {
                val map = LinkedHashMap<String, Any?>()
                for (member in kids(inner).filter { it.tagName == "member" }) {
                    val parts = kids(member)
                    val name = parts.first { it.tagName == "name" }.textContent ?: ""
                    map[name] = parseValue(parts.first { it.tagName == "value" })
                }
                map
            }
            "array" -> {
                val data = kids(inner).first { it.tagName == "data" }
                kids(data).filter { it.tagName == "value" }.map { parseValue(it) }
            }
            else -> throw IllegalArgumentException("Unknown XML-RPC type <${inner.tagName}>")
        }
    }

    private fun escape(s: String) = buildString(s.length) {
        for (c in s) when (c) {
            '&' -> append("&amp;"); '<' -> append("&lt;"); '>' -> append("&gt;")
            else -> append(c)
        }
    }
}
