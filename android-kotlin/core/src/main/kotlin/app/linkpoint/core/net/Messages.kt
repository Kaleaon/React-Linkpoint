package app.linkpoint.core.net

import java.util.UUID

/** A message ready to be sent on a circuit. */
class Outgoing(val id: Int, val body: ByteArray, val reliable: Boolean)

/** Messages the viewer receives, decoded. Anything not listed arrives as [Unhandled]. */
sealed class Incoming {
    data class ChatFromSimulator(
        val fromName: String, val sourceId: UUID, val ownerId: UUID, val sourceType: Int,
        val chatType: Int, val audible: Int, val position: FloatArray, val message: String,
    ) : Incoming()

    data class InstantMessage(
        val fromGroup: Boolean, val fromAgentId: UUID, val toAgentId: UUID, val regionId: UUID,
        val position: FloatArray, val offline: Int, val dialog: Int, val sessionId: UUID,
        val timestamp: Long, val fromName: String, val message: String, val binaryBucket: ByteArray,
    ) : Incoming()

    data class RegionHandshake(val regionName: String, val simAccess: Int, val regionFlags: Long, val waterHeight: Float, val regionId: UUID?) : Incoming()
    data class AgentMovementComplete(val position: FloatArray, val lookAt: FloatArray, val regionHandle: Long) : Incoming()
    data class OnlineStatus(val ids: List<UUID>, val online: Boolean) : Incoming()
    data class UuidNames(val names: List<Triple<UUID, String, String>>) : Incoming()
    data class CoarseLocations(val locations: List<IntArray>, val youIndex: Int, val ids: List<UUID>) : Incoming()
    data class MoneyBalance(val balance: Int, val success: Boolean, val description: String) : Incoming()
    data class TeleportStart(val flags: Long) : Incoming()
    data class TeleportProgress(val flags: Long, val message: String) : Incoming()
    data class TeleportFailed(val reason: String) : Incoming()
    data class TeleportLocal(val position: FloatArray, val lookAt: FloatArray, val flags: Long) : Incoming()
    data class MapBlocks(val blocks: List<MapBlockInfo>) : Incoming()
    data class KickUser(val reason: String) : Incoming()
    data object LogoutReply : Incoming()
    data class Unhandled(val id: Int) : Incoming()
}

data class MapBlockInfo(val x: Int, val y: Int, val name: String, val access: Int, val regionFlags: Long, val waterHeight: Int, val agents: Int, val mapImageId: UUID)

object Messages {
    private val NULL_UUID = UUID(0, 0)

    private fun agentData(agentId: UUID, sessionId: UUID) = WireWriter().uuid(agentId).uuid(sessionId)

    fun useCircuitCode(code: Int, sessionId: UUID, agentId: UUID) =
        Outgoing(Msg.UseCircuitCode, WireWriter().u32(code.toLong() and 0xFFFFFFFFL).uuid(sessionId).uuid(agentId).toByteArray(), true)

    fun completeAgentMovement(agentId: UUID, sessionId: UUID, code: Int) =
        Outgoing(Msg.CompleteAgentMovement, agentData(agentId, sessionId).u32(code.toLong() and 0xFFFFFFFFL).toByteArray(), true)

    fun regionHandshakeReply(agentId: UUID, sessionId: UUID) =
        Outgoing(Msg.RegionHandshakeReply, agentData(agentId, sessionId).u32(0).toByteArray(), true)

    /** Bandwidth in bits/s for resend, land, wind, cloud, task, texture and asset. */
    fun agentThrottle(agentId: UUID, sessionId: UUID, code: Int, bps: List<Float> = DEFAULT_THROTTLE): Outgoing {
        val t = WireWriter().apply { bps.forEach { f32(it) } }.toByteArray()
        return Outgoing(Msg.AgentThrottle, agentData(agentId, sessionId).u32(code.toLong() and 0xFFFFFFFFL).u32(0).bin1(t).toByteArray(), true)
    }

    /** Wrap an angle to [-pi, pi] so the quaternion's implied w (cos of half the angle) is never negative. */
    fun wrapAngle(a: Float): Float {
        val twoPi = (2.0 * Math.PI).toFloat()
        var x = a % twoPi
        if (x > Math.PI) x -= twoPi else if (x < -Math.PI) x += twoPi
        return x
    }

    val DEFAULT_THROTTLE = listOf(150_000f, 170_000f, 34_000f, 34_000f, 446_000f, 446_000f, 220_000f)

    /** An idle AgentUpdate: standing still, camera at the origin looking along +X. Keeps the agent alive in the region. */
    fun agentUpdate(agentId: UUID, sessionId: UUID, cameraX: Float = 0f, cameraY: Float = 0f, cameraZ: Float = 0f, farMeters: Float = 128f, controlFlags: Long = 0, bodyYaw: Float = 0f): Outgoing {
        val w = agentData(agentId, sessionId)
            .quat(0f, 0f, kotlin.math.sin(wrapAngle(bodyYaw) / 2f)) // body rotation about Z; w is implied and positive in [-pi, pi]
            .quat(0f, 0f, 0f)                    // head rotation
            .u8(0)                                // state
            .vec3(cameraX, cameraY, cameraZ)      // camera centre: the simulator sends objects near here
            .vec3(1f, 0f, 0f).vec3(0f, 1f, 0f).vec3(0f, 0f, 1f)
            .f32(farMeters).u32(controlFlags).u8(0)
        return Outgoing(Msg.AgentUpdate, w.toByteArray(), false)
    }

    /** chatType: 0 whisper, 1 normal, 2 shout. */
    fun chatFromViewer(agentId: UUID, sessionId: UUID, text: String, chatType: Int, channel: Int) =
        Outgoing(Msg.ChatFromViewer, agentData(agentId, sessionId).str2(text).u8(chatType).s32(channel).toByteArray(), true)

    fun instantMessage(agentId: UUID, sessionId: UUID, fromName: String, toId: UUID, text: String, dialog: Int = 0, sessionIdForIm: UUID = imSessionId(agentId, toId)) =
        Outgoing(
            Msg.ImprovedInstantMessage,
            agentData(agentId, sessionId)
                .bool(false).uuid(toId).u32(0).uuid(NULL_UUID).vec3(0f, 0f, 0f)
                .u8(0).u8(dialog).uuid(sessionIdForIm).u32(0).str1(fromName).str2(text).bin2(ByteArray(0))
                .u32(0) // EstateBlock
                .toByteArray(),
            true,
        )

    /** The id of a one-to-one IM session: the two agent ids combined with XOR. */
    fun imSessionId(a: UUID, b: UUID) = UUID(a.mostSignificantBits xor b.mostSignificantBits, a.leastSignificantBits xor b.leastSignificantBits)

    /** Ask for objects the simulator announced by id only (cache miss type 0 = full update). */
    fun requestMultipleObjects(agentId: UUID, sessionId: UUID, localIds: List<Long>): Outgoing {
        require(localIds.size in 1..255)
        val w = agentData(agentId, sessionId).u8(localIds.size)
        localIds.forEach { w.u8(0).u32(it) }
        return Outgoing(Msg.RequestMultipleObjects, w.toByteArray(), true)
    }

    fun uuidNameRequest(ids: List<UUID>): Outgoing {
        require(ids.size in 1..255) { "1..255 ids per request" }
        val w = WireWriter().u8(ids.size)
        ids.forEach { w.uuid(it) }
        return Outgoing(Msg.UUIDNameRequest, w.toByteArray(), true)
    }

    fun moneyBalanceRequest(agentId: UUID, sessionId: UUID) =
        Outgoing(Msg.MoneyBalanceRequest, agentData(agentId, sessionId).uuid(NULL_UUID).toByteArray(), true)

    fun mapNameRequest(agentId: UUID, sessionId: UUID, name: String) =
        Outgoing(Msg.MapNameRequest, agentData(agentId, sessionId).u32(0).u32(0).bool(false).str1(name).toByteArray(), true)

    fun teleportLocationRequest(agentId: UUID, sessionId: UUID, regionHandle: Long, x: Float, y: Float, z: Float) =
        Outgoing(
            Msg.TeleportLocationRequest,
            agentData(agentId, sessionId).u64(regionHandle).vec3(x, y, z).vec3(0f, 1f, 0f).toByteArray(),
            true,
        )

    /** Teleport to the home location (a null landmark means "home"). */
    fun teleportHome(agentId: UUID, sessionId: UUID) =
        Outgoing(Msg.TeleportLandmarkRequest, agentData(agentId, sessionId).uuid(NULL_UUID).toByteArray(), true)

    fun logoutRequest(agentId: UUID, sessionId: UUID) =
        Outgoing(Msg.LogoutRequest, agentData(agentId, sessionId).toByteArray(), true)

    fun completePingCheck(pingId: Int) = Outgoing(Msg.CompletePingCheck, WireWriter().u8(pingId).toByteArray(), false)

    fun packetAck(sequences: List<Int>): Outgoing {
        require(sequences.size in 1..255)
        val w = WireWriter().u8(sequences.size)
        sequences.forEach { w.u32(it.toLong() and 0xFFFFFFFFL) }
        return Outgoing(Msg.PacketAck, w.toByteArray(), false)
    }

    /** Decode a received message. Returns null for a start-ping/ack that the circuit handles itself. */
    fun parse(id: Int, body: ByteArray): Incoming = try {
        parseOrThrow(id, body)
    } catch (e: IllegalArgumentException) {
        Incoming.Unhandled(id)
    }

    private fun parseOrThrow(id: Int, body: ByteArray): Incoming {
        val r = WireReader(body)
        return when (id) {
            Msg.ChatFromSimulator -> Incoming.ChatFromSimulator(
                r.str1(), r.uuid(), r.uuid(), r.u8(), r.u8(), r.u8(), r.vec3(), r.str2(),
            )
            Msg.ImprovedInstantMessage -> {
                val sender = r.uuid(); r.uuid() // AgentData: the sender's agent id, then session id
                Incoming.InstantMessage(
                    fromGroup = r.bool(), toAgentId = r.uuid(), regionId = r.run { u32(); uuid() },
                    position = r.vec3(), offline = r.u8(), dialog = r.u8(), sessionId = r.uuid(),
                    timestamp = r.u32(), fromName = r.str1(), message = r.str2(), binaryBucket = r.bin2(),
                    fromAgentId = sender,
                )
            }
            Msg.RegionHandshake -> {
                val flags = r.u32(); val access = r.u8(); val name = r.str1()
                r.uuid(); r.bool()
                val water = r.f32()
                Incoming.RegionHandshake(name, access, flags, water, null)
            }
            Msg.AgentMovementComplete -> {
                r.uuid(); r.uuid()
                Incoming.AgentMovementComplete(r.vec3(), r.vec3(), r.u64())
            }
            Msg.OnlineNotification, Msg.OfflineNotification -> {
                val n = r.u8()
                Incoming.OnlineStatus(List(n) { r.uuid() }, id == Msg.OnlineNotification)
            }
            Msg.UUIDNameReply -> {
                val n = r.u8()
                Incoming.UuidNames(List(n) { Triple(r.uuid(), r.str1(), r.str1()) })
            }
            Msg.CoarseLocationUpdate -> {
                val n = r.u8()
                val locs = List(n) { intArrayOf(r.u8(), r.u8(), r.u8()) }
                val you = r.s16(); r.s16()
                val count = r.u8()
                Incoming.CoarseLocations(locs, you, List(count) { r.uuid() })
            }
            Msg.MoneyBalanceReply -> {
                r.uuid(); r.uuid()
                val ok = r.bool(); val bal = r.s32(); r.s32(); r.s32()
                Incoming.MoneyBalance(bal, ok, r.str1())
            }
            Msg.TeleportStart -> Incoming.TeleportStart(r.u32())
            Msg.TeleportProgress -> { r.uuid(); Incoming.TeleportProgress(r.u32(), r.str1()) }
            Msg.TeleportFailed -> { r.uuid(); Incoming.TeleportFailed(r.str1()) }
            Msg.TeleportLocal -> { r.uuid(); r.u32(); Incoming.TeleportLocal(r.vec3(), r.vec3(), r.u32()) }
            Msg.MapBlockReply -> {
                r.uuid(); r.u32()
                val n = r.u8()
                Incoming.MapBlocks(List(n) {
                    MapBlockInfo(r.u16(), r.u16(), r.str1(), r.u8(), r.u32(), r.u8(), r.u8(), r.uuid())
                })
            }
            Msg.KickUser -> { r.bytes(6); r.uuid(); r.uuid(); Incoming.KickUser(r.str2()) }
            Msg.LogoutReply -> Incoming.LogoutReply
            else -> Incoming.Unhandled(id)
        }
    }
}
