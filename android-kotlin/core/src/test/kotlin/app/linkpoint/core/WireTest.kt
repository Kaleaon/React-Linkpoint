package app.linkpoint.core

import app.linkpoint.core.net.*
import java.util.UUID
import org.junit.Assert.*
import org.junit.Test

class WireTest {
    @Test fun messageNumbersRoundTrip() {
        for (id in listOf(Msg.StartPingCheck, Msg.CoarseLocationUpdate, Msg.ChatFromSimulator, Msg.MapBlockReply, Msg.PacketAck)) {
            val p = PacketCodec.decode(PacketCodec.encode(7, PacketFlags.RELIABLE, id, byteArrayOf(1, 2, 3)))
            assertEquals(id, p.messageId); assertEquals(7, p.sequence); assertTrue(p.reliable)
            assertArrayEquals(byteArrayOf(1, 2, 3), p.body)
        }
    }

    @Test fun wireBytesMatchTemplate() {
        // UseCircuitCode is Low 3: FF FF 00 03 after the 6-byte header.
        val b = PacketCodec.encode(1, 0, Msg.UseCircuitCode, ByteArray(0))
        assertArrayEquals(byteArrayOf(0, 0, 0, 0, 1, 0, -1, -1, 0, 3), b)
        // PacketAck is Fixed 0xFFFFFFFB.
        val a = PacketCodec.encode(1, 0, Msg.PacketAck, ByteArray(0))
        assertArrayEquals(byteArrayOf(-1, -1, -1, -5), a.copyOfRange(6, 10))
    }

    @Test fun zeroCodingRoundTrips() {
        val body = ByteArray(300) { if (it % 50 < 40) 0 else (it % 7 + 1).toByte() }
        val enc = PacketCodec.encodeZeroCoded(9, 0, Msg.ChatFromSimulator, body)
        assertTrue(enc.size < body.size)
        val p = PacketCodec.decode(enc)
        assertEquals(Msg.ChatFromSimulator, p.messageId)
        assertArrayEquals(body, p.body)
    }

    @Test fun appendedAcksAreStripped() {
        val b = PacketCodec.encode(2, 0, Msg.StartPingCheck, byteArrayOf(5, 0, 0, 0, 0), listOf(10, 11))
        val p = PacketCodec.decode(b)
        assertEquals(listOf(10, 11), p.acks)
        assertEquals(5, p.body.size)
    }

    @Test fun uuidAndStringFields() {
        val id = UUID.randomUUID()
        val w = WireWriter().uuid(id).str1("Hello").str2("wörld").u32(0xFFFFFFFFL).f32(1.5f).u64(-2L)
        val r = WireReader(w.toByteArray())
        assertEquals(id, r.uuid()); assertEquals("Hello", r.str1()); assertEquals("wörld", r.str2())
        assertEquals(0xFFFFFFFFL, r.u32()); assertEquals(1.5f, r.f32(), 0f); assertEquals(-2L, r.u64())
    }

    @Test fun chatFromSimulatorParses() {
        val src = UUID.randomUUID()
        val body = WireWriter().str1("Bob Resident").uuid(src).uuid(src).u8(1).u8(1).u8(1).vec3(1f, 2f, 3f).str2("hi there").toByteArray()
        val m = Messages.parse(Msg.ChatFromSimulator, body) as Incoming.ChatFromSimulator
        assertEquals("Bob Resident", m.fromName); assertEquals("hi there", m.message); assertEquals(src, m.sourceId)
    }

    @Test fun truncatedMessageIsUnhandledNotCrash() {
        assertTrue(Messages.parse(Msg.ChatFromSimulator, byteArrayOf(5, 1)) is Incoming.Unhandled)
    }

    @Test fun imSessionIdIsSymmetric() {
        val a = UUID.randomUUID(); val b = UUID.randomUUID()
        assertEquals(Messages.imSessionId(a, b), Messages.imSessionId(b, a))
    }
}
