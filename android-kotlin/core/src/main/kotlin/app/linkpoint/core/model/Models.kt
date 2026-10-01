package app.linkpoint.core.model

import java.util.UUID

enum class ChatKind { LOCAL, IM, OBJECT_IM, SYSTEM }

/** One line of conversation. Everything here came from the grid or the resident; nothing is invented. */
data class ChatEntry(
    val id: Long,
    val kind: ChatKind,
    val fromId: UUID?,
    val fromName: String,
    val text: String,
    /** Local chat: 0 whisper, 1 say, 2 shout. */
    val chatType: Int = 1,
    /** IM conversation key (the IM session id); null for local chat. */
    val sessionId: UUID? = null,
    val outgoing: Boolean = false,
    val timestampMs: Long,
)

data class Friend(val id: UUID, val name: String?, val online: Boolean?, val rightsGiven: Int, val rightsHas: Int)

/** A nearby avatar from the simulator's coarse location list. Positions are region metres; z is quantised to 4 m. */
data class NearbyAvatar(val id: UUID, val name: String?, val x: Int, val y: Int, val z: Int, val distance: Double?)

data class RegionInfo(
    val name: String?,
    val access: Int?,
    val handle: Long,
    val position: FloatArray?,
) {
    /** Region grid coordinates (region index, not metres) from the region handle. */
    val gridX: Int get() = ((handle ushr 32) / 256).toInt()
    val gridY: Int get() = ((handle and 0xFFFFFFFFL) / 256).toInt()
}

enum class ConnectionState { DISCONNECTED, CONNECTING, CONNECTED, LOGGING_OUT }

sealed class ViewerNotice {
    data class Teleport(val text: String) : ViewerNotice()
    data class Disconnected(val reason: String) : ViewerNotice()
    data class Error(val text: String) : ViewerNotice()
}
