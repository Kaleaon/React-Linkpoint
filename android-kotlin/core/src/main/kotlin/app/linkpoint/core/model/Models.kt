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
    /** Region water level in metres, from the region handshake. */
    val waterHeight: Float? = null,
    val terrain: TerrainInfo? = null,
) {
    /** Region grid coordinates (region index, not metres) from the region handle. */
    val gridX: Int get() = ((handle ushr 32) / 256).toInt()
    val gridY: Int get() = ((handle and 0xFFFFFFFFL) / 256).toInt()
}

/** Terrain texturing parameters from the region handshake. */
class TerrainInfo(val detailTextureIds: List<UUID>, val startHeights: FloatArray, val heightRanges: FloatArray)

enum class ConnectionState { DISCONNECTED, CONNECTING, CONNECTED, LOGGING_OUT }

sealed class ViewerNotice {
    data class Teleport(val text: String) : ViewerNotice()
    data class Disconnected(val reason: String) : ViewerNotice()
    data class Error(val text: String) : ViewerNotice()
}

data class InventoryFolder(val id: UUID, val parentId: UUID?, val name: String, val typeDefault: Int, val version: Int)

data class InventoryItem(
    val id: UUID, val parentId: UUID, val name: String,
    /** Asset type: 0 texture, 1 sound, 3 landmark, 5 clothing, 6 object, 7 notecard, 10 script, 13 body part, 20 animation, 21 gesture, 49 mesh. */
    val assetType: Int, val invType: Int, val description: String, val assetId: UUID?,
)

/** The resident's inventory as far as it has been fetched: the folder tree from login plus folder contents on demand. */
data class InventoryState(
    val rootId: UUID? = null,
    val folders: Map<UUID, InventoryFolder> = emptyMap(),
    val items: Map<UUID, List<InventoryItem>> = emptyMap(),
    /** Folders whose contents have been fetched. */
    val loaded: Set<UUID> = emptySet(),
) {
    fun children(folder: UUID): List<InventoryFolder> = folders.values.filter { it.parentId == folder }.sortedBy { it.name.lowercase() }
}

data class GroupInfo(val id: UUID, val name: String, val acceptNotices: Boolean)

data class ParcelInfo(
    val localId: Int, val name: String, val description: String, val areaSqm: Int, val ownerId: UUID?,
    val maxPrims: Int?, val totalPrims: Int?, val musicUrl: String, val mediaUrl: String,
    /** The parcel's media settings, or null when it has no media. */
    val media: ParcelMedia? = null,
)

/** A parcel's media: [url] is a stream or page, [mediaId] is the texture the media replaces on objects that use it. */
data class ParcelMedia(
    val url: String, val mediaId: UUID?, val autoScale: Boolean, val type: String, val description: String,
    val width: Int, val height: Int, val loop: Boolean,
) {
    /** True when the type or address says this is sound only (an Internet radio stream) rather than video or a page. */
    val isAudioOnly: Boolean get() = type.startsWith("audio/", true) || url.substringBefore('?').lowercase().let { u -> listOf(".mp3", ".ogg", ".aac", ".m3u", ".pls").any { u.endsWith(it) } }
}

enum class MediaState { STOPPED, PLAYING, PAUSED }

/** What the simulator has told us about playback of the parcel media (ParcelMediaCommandMessage). */
data class MediaPlayback(val state: MediaState = MediaState.STOPPED, val timeSeconds: Float = 0f, val loop: Boolean = false)

data class AvatarProfile(val id: UUID, val about: String, val bornOn: String, val partnerId: UUID?, val profileUrl: String, val flags: Long)

/** Something another resident asked of us that needs an answer. */
sealed class PendingOffer {
    abstract val id: UUID
    abstract val fromName: String
    abstract val text: String
    data class Lure(override val id: UUID, override val fromName: String, override val text: String) : PendingOffer()
    data class Friend(override val id: UUID, override val fromName: String, override val text: String) : PendingOffer()
}
