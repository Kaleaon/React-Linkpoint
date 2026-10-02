package app.linkpoint.core.net

import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID

/** Packet header flag bits of the Second Life UDP protocol. */
object PacketFlags {
    const val ZEROCODE = 0x80
    const val RELIABLE = 0x40
    const val RESENT = 0x20
    const val ACK = 0x10
}

/**
 * Wire message numbers, taken from the official message_template.msg. The frequency is part of the
 * number: High is 1 byte, Medium is 0xFF + 1 byte, Low is 0xFFFF + 2 bytes, Fixed is 0xFFFFFF + 1 byte.
 */
object Msg {
    private fun high(n: Int) = n
    private fun medium(n: Int) = 0xFF00 or n
    private fun low(n: Int) = (0xFFFF0000L or n.toLong()).toInt()
    private fun fixed(n: Int) = (0xFFFFFF00L or n.toLong()).toInt()

    val PacketAck = fixed(0xFB)
    val StartPingCheck = high(1)
    val LayerData = high(11)
    val ObjectUpdate = high(12)
    val ObjectUpdateCompressed = high(13)
    val ObjectUpdateCached = high(14)
    val ImprovedTerseObjectUpdate = high(15)
    val KillObject = high(16)
    val RequestMultipleObjects = medium(3)
    val CompletePingCheck = high(2)
    val AgentUpdate = high(4)
    val CoarseLocationUpdate = medium(6)
    val UseCircuitCode = low(3)
    val TeleportLocationRequest = low(63)
    val TeleportLocal = low(64)
    val TeleportLureRequest = low(71)
    val AvatarPropertiesRequest = low(169)
    val AvatarPropertiesReply = low(171)
    val AcceptFriendship = low(297)
    val DeclineFriendship = low(298)
    val TeleportLandmarkRequest = low(65)
    val TeleportProgress = low(66)
    val TeleportStart = low(73)
    val TeleportFailed = low(74)
    val ChatFromViewer = low(80)
    val AgentThrottle = low(81)
    val ChatFromSimulator = low(139)
    val RegionHandshake = low(148)
    val RegionHandshakeReply = low(149)
    val KickUser = low(163)
    val UUIDNameRequest = low(235)
    val UUIDNameReply = low(236)
    val CompleteAgentMovement = low(249)
    val AgentMovementComplete = low(250)
    val LogoutRequest = low(252)
    val LogoutReply = low(253)
    val ImprovedInstantMessage = low(254)
    val MoneyBalanceRequest = low(313)
    val MoneyBalanceReply = low(314)
    val OnlineNotification = low(322)
    val OfflineNotification = low(323)
    val MapNameRequest = low(408)
    val MapBlockReply = low(409)
}

/** A decoded packet: header fields, the message number and the (zero-decoded) message body. */
class Packet(
    val flags: Int,
    val sequence: Int,
    val messageId: Int,
    val body: ByteArray,
    val acks: List<Int>,
) {
    val reliable: Boolean get() = flags and PacketFlags.RELIABLE != 0
}

object PacketCodec {
    private const val HEADER = 6

    fun encode(sequence: Int, flags: Int, messageId: Int, body: ByteArray, appendedAcks: List<Int> = emptyList()): ByteArray {
        val out = ByteArrayOutputStream(body.size + 16)
        var f = flags and PacketFlags.ZEROCODE.inv() and PacketFlags.ACK.inv()
        if (appendedAcks.isNotEmpty()) f = f or PacketFlags.ACK
        out.write(f)
        out.write(sequence ushr 24); out.write(sequence ushr 16); out.write(sequence ushr 8); out.write(sequence)
        out.write(0) // no extra header
        writeMessageNumber(out, messageId)
        out.write(body)
        if (appendedAcks.isNotEmpty()) {
            for (a in appendedAcks) { out.write(a ushr 24); out.write(a ushr 16); out.write(a ushr 8); out.write(a) }
            out.write(appendedAcks.size)
        }
        return out.toByteArray()
    }

    /** Encode with zero-coding (runs of zero bytes collapsed), as the simulator does for large messages. */
    fun encodeZeroCoded(sequence: Int, flags: Int, messageId: Int, body: ByteArray): ByteArray {
        val num = ByteArrayOutputStream().also { writeMessageNumber(it, messageId) }.toByteArray()
        val out = ByteArrayOutputStream()
        out.write((flags or PacketFlags.ZEROCODE) and PacketFlags.ACK.inv())
        out.write(sequence ushr 24); out.write(sequence ushr 16); out.write(sequence ushr 8); out.write(sequence)
        out.write(0)
        out.write(zeroEncode(num + body))
        return out.toByteArray()
    }

    fun decode(data: ByteArray, length: Int = data.size): Packet {
        require(length >= HEADER + 1) { "Packet too short" }
        val flags = data[0].toInt() and 0xFF
        val seq = ((data[1].toInt() and 0xFF) shl 24) or ((data[2].toInt() and 0xFF) shl 16) or
            ((data[3].toInt() and 0xFF) shl 8) or (data[4].toInt() and 0xFF)
        val extra = data[5].toInt() and 0xFF
        var end = length
        val acks = ArrayList<Int>()
        if (flags and PacketFlags.ACK != 0) {
            val count = data[end - 1].toInt() and 0xFF
            end -= 1
            require(end - count * 4 >= HEADER + extra) { "Bad appended ack count" }
            for (i in 0 until count) {
                val at = end - (count - i) * 4
                acks.add(((data[at].toInt() and 0xFF) shl 24) or ((data[at + 1].toInt() and 0xFF) shl 16) or
                    ((data[at + 2].toInt() and 0xFF) shl 8) or (data[at + 3].toInt() and 0xFF))
            }
            end -= count * 4
        }
        val start = HEADER + extra
        require(start < end) { "Packet has no message" }
        val payload = if (flags and PacketFlags.ZEROCODE != 0) zeroDecode(data, start, end) else data.copyOfRange(start, end)
        val (id, used) = readMessageNumber(payload)
        return Packet(flags, seq, id, payload.copyOfRange(used, payload.size), acks)
    }

    private fun writeMessageNumber(out: ByteArrayOutputStream, id: Int) {
        when {
            (id ushr 8) == 0xFFFFFF -> { out.write(0xFF); out.write(0xFF); out.write(0xFF); out.write(id and 0xFF) }
            (id ushr 16) == 0xFFFF -> { out.write(0xFF); out.write(0xFF); out.write((id ushr 8) and 0xFF); out.write(id and 0xFF) }
            (id ushr 8) == 0xFF -> { out.write(0xFF); out.write(id and 0xFF) }
            else -> out.write(id and 0xFF)
        }
    }

    private fun readMessageNumber(p: ByteArray): Pair<Int, Int> {
        fun b(i: Int): Int { require(i < p.size) { "Truncated message number" }; return p[i].toInt() and 0xFF }
        val b0 = b(0)
        if (b0 != 0xFF) return b0 to 1
        val b1 = b(1)
        if (b1 != 0xFF) return (0xFF00 or b1) to 2
        val b2 = b(2)
        val b3 = b(3)
        return if (b2 == 0xFF) ((0xFFFFFF00L or b3.toLong()).toInt() to 4)
        else ((0xFFFF0000L or ((b2 shl 8) or b3).toLong()).toInt() to 4)
    }

    fun zeroDecode(src: ByteArray, from: Int, to: Int): ByteArray {
        val out = ByteArrayOutputStream((to - from) * 2)
        var i = from
        while (i < to) {
            val b = src[i++]
            if (b.toInt() == 0) {
                // A zero is followed by a repeat count; a missing count means one zero.
                val n = if (i < to) src[i++].toInt() and 0xFF else 1
                repeat(n) { out.write(0) }
            } else out.write(b.toInt())
        }
        return out.toByteArray()
    }

    fun zeroEncode(src: ByteArray): ByteArray {
        val out = ByteArrayOutputStream(src.size)
        var i = 0
        while (i < src.size) {
            if (src[i].toInt() == 0) {
                var run = 0
                while (i < src.size && src[i].toInt() == 0 && run < 255) { run++; i++ }
                out.write(0); out.write(run)
            } else out.write(src[i++].toInt())
        }
        return out.toByteArray()
    }
}

/** Little-endian field writer for message bodies. */
class WireWriter {
    private val out = ByteArrayOutputStream()
    fun u8(v: Int) = apply { out.write(v and 0xFF) }
    fun bool(v: Boolean) = u8(if (v) 1 else 0)
    fun u16(v: Int) = apply { out.write(v and 0xFF); out.write((v ushr 8) and 0xFF) }
    fun u32(v: Long) = apply { for (s in 0..24 step 8) out.write(((v ushr s) and 0xFF).toInt()) }
    fun s32(v: Int) = u32(v.toLong() and 0xFFFFFFFFL)
    fun u64(v: Long) = apply { for (s in 0..56 step 8) out.write(((v ushr s) and 0xFF).toInt()) }
    fun f32(v: Float) = s32(java.lang.Float.floatToIntBits(v))
    fun uuid(v: UUID) = apply {
        // UUIDs travel as 16 raw bytes, most significant first.
        for (s in 56 downTo 0 step 8) out.write(((v.mostSignificantBits ushr s) and 0xFF).toInt())
        for (s in 56 downTo 0 step 8) out.write(((v.leastSignificantBits ushr s) and 0xFF).toInt())
    }
    fun vec3(x: Float, y: Float, z: Float) = apply { f32(x); f32(y); f32(z) }
    /** A packed quaternion: x, y, z only; w is implied. */
    fun quat(x: Float, y: Float, z: Float) = vec3(x, y, z)
    fun bytes(b: ByteArray) = apply { out.write(b) }
    /** Variable field with a 1-byte length. Text is NUL-terminated, as the simulator expects. */
    fun str1(s: String) = apply { val b = s.toByteArray(Charsets.UTF_8) + 0; require(b.size <= 255) { "Text too long" }; u8(b.size); out.write(b) }
    fun str2(s: String) = apply { val b = s.toByteArray(Charsets.UTF_8) + 0; require(b.size <= 65535) { "Text too long" }; u16(b.size); out.write(b) }
    fun bin1(b: ByteArray) = apply { require(b.size <= 255); u8(b.size); out.write(b) }
    fun bin2(b: ByteArray) = apply { require(b.size <= 65535); u16(b.size); out.write(b) }
    fun toByteArray(): ByteArray = out.toByteArray()
}

/** Little-endian field reader for message bodies. Throws [IllegalArgumentException] on truncated data. */
class WireReader(bytes: ByteArray) {
    private val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
    val remaining: Int get() = buf.remaining()

    private inline fun <T> guard(n: Int, f: () -> T): T {
        require(buf.remaining() >= n) { "Truncated message" }
        return f()
    }
    fun u8() = guard(1) { buf.get().toInt() and 0xFF }
    fun bool() = u8() != 0
    fun u16() = guard(2) { buf.short.toInt() and 0xFFFF }
    fun s16() = guard(2) { buf.short.toInt() }
    fun u32() = guard(4) { buf.int.toLong() and 0xFFFFFFFFL }
    fun s32() = guard(4) { buf.int }
    fun u64() = guard(8) { buf.long }
    fun f32() = guard(4) { buf.float }
    fun uuid(): UUID = guard(16) {
        var msb = 0L; var lsb = 0L
        repeat(8) { msb = (msb shl 8) or (buf.get().toLong() and 0xFF) }
        repeat(8) { lsb = (lsb shl 8) or (buf.get().toLong() and 0xFF) }
        UUID(msb, lsb)
    }
    fun vec3(): FloatArray = floatArrayOf(f32(), f32(), f32())
    fun bytes(n: Int): ByteArray = guard(n) { ByteArray(n).also { buf.get(it) } }
    fun str1(): String = text(bytes(u8()))
    fun str2(): String = text(bytes(u16()))
    fun bin1(): ByteArray = bytes(u8())
    fun bin2(): ByteArray = bytes(u16())
    /** IPADDR fields are 4 bytes in network order. */
    fun ipv4(): String = bytes(4).joinToString(".") { (it.toInt() and 0xFF).toString() }
    /** IPPORT fields are 2 bytes in network order. */
    fun port(): Int { val b = bytes(2); return ((b[0].toInt() and 0xFF) shl 8) or (b[1].toInt() and 0xFF) }

    private fun text(b: ByteArray): String {
        var end = b.size
        while (end > 0 && b[end - 1].toInt() == 0) end--
        return String(b, 0, end, Charsets.UTF_8)
    }
}

/** Bits of AgentUpdate.ControlFlags. */
object AgentControl {
    const val AT_POS = 0x1L
    const val AT_NEG = 0x2L
    const val LEFT_POS = 0x4L
    const val LEFT_NEG = 0x8L
    const val UP_POS = 0x10L
    const val UP_NEG = 0x20L
    const val FLY = 0x2000L
}
