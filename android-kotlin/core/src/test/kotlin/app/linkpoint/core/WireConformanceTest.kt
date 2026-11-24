package app.linkpoint.core

import app.linkpoint.core.net.Msg
import app.linkpoint.core.net.PacketCodec
import app.linkpoint.core.net.PacketFlags
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WireConformanceTest {
    private fun loadProtocolVectors(): JsonObject {
        val candidates = listOf(
            File("../../test-vectors/protocol/master_message_template_vectors.json"),
            File("../test-vectors/protocol/master_message_template_vectors.json"),
            File("test-vectors/protocol/master_message_template_vectors.json"),
        )
        val file = candidates.firstOrNull { it.isFile }
            ?: error("Could not locate test-vectors/protocol/master_message_template_vectors.json from ${File(".").absolutePath}")
        return Json.parseToJsonElement(file.readText(Charsets.UTF_8)).jsonObject
    }

    private fun hexToBytes(hex: String): ByteArray {
        val clean = hex.trim()
        if (clean.isEmpty()) return ByteArray(0)
        return ByteArray(clean.length / 2) { idx ->
            clean.substring(idx * 2, idx * 2 + 2).toInt(16).toByte()
        }
    }

    @Test
    fun allWireMsgIdsMatchCanonicalMasterMessageTemplate() {
        val doc = loadProtocolVectors()
        val messages = doc.getValue("messages").jsonArray
        assertTrue("Expected at least 80 canonical messages", messages.size >= 80)

        val msgClass = Msg::class.java
        for (elem in messages) {
            val entry = elem.jsonObject
            val msgName = entry.getValue("name").jsonPrimitive.content
            val kotlinProp = entry.getValue("kotlin_constant").jsonPrimitive.content
            val wireIdHex = entry.getValue("wire_id_hex").jsonPrimitive.content
            val expectedSignedInt = entry.getValue("wire_id").jsonPrimitive.long.toInt()

            val getterName = "get$kotlinProp"
            val actualInt = try {
                msgClass.getMethod(getterName).invoke(Msg) as Int
            } catch (_: NoSuchMethodException) {
                val field = msgClass.getDeclaredField(kotlinProp)
                field.isAccessible = true
                field.getInt(Msg)
            }
            assertEquals(
                "Wire.kt Msg.$kotlinProp must match master-message-template $msgName ($wireIdHex)",
                expectedSignedInt,
                actualInt,
            )
        }
    }

    @Test
    fun packetFramingVectorsRoundTripThroughPacketCodec() {
        val doc = loadProtocolVectors()
        val framingVectors = doc.getValue("packet_framing_vectors").jsonArray
        assertTrue(framingVectors.size >= 5)

        for (elem in framingVectors) {
            val vec = elem.jsonObject
            val name = vec.getValue("name").jsonPrimitive.content
            val seq = vec.getValue("sequence").jsonPrimitive.int
            val flags = vec.getValue("flags").jsonPrimitive.int
            val wireId = vec.getValue("wire_id").jsonPrimitive.long.toInt()
            val body = hexToBytes(vec.getValue("body_hex").jsonPrimitive.content)
            val expectedPacket = hexToBytes(vec.getValue("expected_packet_hex").jsonPrimitive.content)
            val acks = vec.getValue("appended_acks").jsonArray.map { it.jsonPrimitive.int }

            val encoded = if ((flags and PacketFlags.ZEROCODE) != 0) {
                PacketCodec.encodeZeroCoded(seq, flags, wireId, body)
            } else {
                PacketCodec.encode(seq, flags, wireId, body, acks)
            }
            assertArrayEquals("Encoded packet bytes mismatch for $name", expectedPacket, encoded)

            val decoded = PacketCodec.decode(expectedPacket)
            assertNotNull(decoded)
            assertEquals("Decoded sequence mismatch for $name", seq, decoded.sequence)
            assertEquals("Decoded messageId mismatch for $name", wireId, decoded.messageId)
            assertArrayEquals("Decoded body mismatch for $name", body, decoded.body)
            assertEquals("Decoded appended ACKs mismatch for $name", acks, decoded.acks)
        }
    }
}
