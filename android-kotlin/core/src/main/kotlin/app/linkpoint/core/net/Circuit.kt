package app.linkpoint.core.net

import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** A raw received message, before it is decoded into an [Incoming]. */
class Received(val id: Int, val body: ByteArray)

/**
 * One UDP circuit to a simulator: sequence numbers, reliable delivery (acks and resends), ping
 * replies and duplicate suppression. Decoding of the messages themselves is left to the caller.
 */
class Circuit(
    private val scope: CoroutineScope,
    val remote: InetSocketAddress,
    private val resendIntervalMs: Long = 1_000,
    private val maxResends: Int = 5,
    private val ackIntervalMs: Long = 200,
) {
    private val socket = DatagramSocket().apply { soTimeout = 500 }
    private val sequence = AtomicInteger(0)
    private class Pending(var bytes: ByteArray, var sentAt: Long, var tries: Int, val id: Int)
    private val pending = ConcurrentHashMap<Int, Pending>()
    private val toAck = java.util.Collections.synchronizedList(ArrayList<Int>())
    private val seen = LinkedHashSet<Int>()
    private val jobs = ArrayList<Job>()
    @Volatile private var closed = false
    @Volatile var lastReceivedAt: Long = System.currentTimeMillis(); private set

    private val _messages = MutableSharedFlow<Received>(extraBufferCapacity = 512, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    val messages: SharedFlow<Received> = _messages

    /** Reliable messages that never got an ack after all resends (their message numbers). */
    private val _lost = MutableSharedFlow<Int>(extraBufferCapacity = 16)
    val lost: SharedFlow<Int> = _lost

    val localPort: Int get() = socket.localPort

    fun start() {
        jobs += scope.launch(Dispatchers.IO) { receiveLoop() }
        jobs += scope.launch(Dispatchers.IO) { maintenanceLoop() }
    }

    fun send(msg: Outgoing) {
        if (closed) return
        val seq = sequence.incrementAndGet()
        val flags = if (msg.reliable) PacketFlags.RELIABLE else 0
        val bytes = PacketCodec.encode(seq, flags, msg.id, msg.body)
        if (msg.reliable) pending[seq] = Pending(bytes, System.currentTimeMillis(), 0, msg.id)
        transmit(bytes)
    }

    private fun transmit(bytes: ByteArray) {
        try { socket.send(DatagramPacket(bytes, bytes.size, remote)) } catch (_: java.io.IOException) { /* socket closed or network down; resend logic covers reliable messages */ }
    }

    private fun receiveLoop() {
        val buf = ByteArray(2048)
        while (!closed) {
            val dp = DatagramPacket(buf, buf.size)
            try { socket.receive(dp) } catch (_: java.net.SocketTimeoutException) { continue } catch (_: java.io.IOException) { if (closed) return else continue }
            // Only accept datagrams from the simulator this circuit talks to.
            if (dp.address != remote.address || dp.port != remote.port) continue
            lastReceivedAt = System.currentTimeMillis()
            val packet = try { PacketCodec.decode(buf, dp.length) } catch (_: IllegalArgumentException) { continue }
            handle(packet)
        }
    }

    private fun handle(p: Packet) {
        for (a in p.acks) pending.remove(a)
        if (p.reliable) {
            toAck.add(p.sequence)
            // Duplicate suppression: a resent packet is acked again but delivered once.
            val fresh = synchronized(seen) {
                val added = seen.add(p.sequence)
                if (seen.size > 2048) seen.remove(seen.first())
                added
            }
            if (!fresh) return
        }
        when (p.messageId) {
            Msg.PacketAck -> {
                val r = WireReader(p.body)
                try { repeat(r.u8()) { pending.remove(r.u32().toInt()) } } catch (_: IllegalArgumentException) { /* truncated ack list */ }
            }
            Msg.StartPingCheck -> if (p.body.isNotEmpty()) send(Messages.completePingCheck(p.body[0].toInt() and 0xFF))
            else -> _messages.tryEmit(Received(p.messageId, p.body))
        }
    }

    private suspend fun maintenanceLoop() {
        var sinceResend = 0L
        while (scope.isActive && !closed) {
            delay(ackIntervalMs)
            flushAcks()
            sinceResend += ackIntervalMs
            if (sinceResend >= resendIntervalMs / 2) { sinceResend = 0; resend() }
        }
    }

    private fun flushAcks() {
        val batch: List<Int> = synchronized(toAck) { val c = ArrayList(toAck); toAck.clear(); c }
        for (chunk in batch.chunked(255)) send(Messages.packetAck(chunk))
    }

    private fun resend() {
        val now = System.currentTimeMillis()
        for ((seq, p) in pending) {
            if (now - p.sentAt < resendIntervalMs) continue
            if (p.tries >= maxResends) { pending.remove(seq); _lost.tryEmit(p.id); continue }
            p.tries++; p.sentAt = now
            p.bytes[0] = (p.bytes[0].toInt() or PacketFlags.RESENT).toByte()
            transmit(p.bytes)
        }
    }

    fun close() {
        closed = true
        jobs.forEach { it.cancel() }
        socket.close()
    }

    companion object {
        fun to(scope: CoroutineScope, host: String, port: Int) = Circuit(scope, InetSocketAddress(InetAddress.getByName(host), port))
    }
}
