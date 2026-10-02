package app.linkpoint.core.scene

import java.util.UUID

/** Shape parameters of a prim, already scaled to their natural units. */
data class PrimParams(
    /** 0x10 line, 0x20 circle, 0x30 circle2 (sphere-like), other values are treated as a line. */
    val pathCurve: Int = 0x10,
    /** Low nibble: 0 circle, 1 square, 2 isosceles triangle, 3 equilateral, 4 right triangle, 5 half circle. High nibble: hole shape. */
    val profileCurve: Int = 1,
    val pathBegin: Float = 0f, val pathEnd: Float = 1f,
    val pathScaleX: Float = 1f, val pathScaleY: Float = 1f,
    val shearX: Float = 0f, val shearY: Float = 0f,
    val twist: Float = 0f, val twistBegin: Float = 0f,
    val radiusOffset: Float = 0f,
    val taperX: Float = 0f, val taperY: Float = 0f,
    val revolutions: Float = 1f, val skew: Float = 0f,
    val profileBegin: Float = 0f, val profileEnd: Float = 1f, val profileHollow: Float = 0f,
)

enum class SculptKind { NONE, SCULPT, MESH }

data class SculptInfo(val assetId: UUID, val type: Int) {
    /** Sculpt type 5 marks a mesh asset; 1-4 are sculpt maps. */
    val kind: SculptKind get() = if ((type and 7) == 5) SculptKind.MESH else SculptKind.SCULPT
}

object PCode {
    const val PRIM = 9
    const val AVATAR = 47
    const val GRASS = 95
    const val NEW_TREE = 111
    const val PARTICLE_SYSTEM = 143
    const val TREE = 255
}

/** Bits of the sound flags the simulator sends with an object's sound. */
object SoundFlags {
    const val LOOP = 0x01
    const val SYNC_MASTER = 0x02
    const val SYNC_SLAVE = 0x04
    const val SYNC_PENDING = 0x08
    const val QUEUE = 0x10
    const val STOP = 0x20
}

/** The sound an object plays ([radius] is the half-width of the cube, in metres, outside which it is silent; 0 means no limit). */
data class ObjectSound(val soundId: UUID, val gain: Float, val flags: Int, val radius: Float, val ownerId: UUID? = null) {
    val loops get() = flags and SoundFlags.LOOP != 0
    val stopped get() = flags and SoundFlags.STOP != 0
}

/** An object in the region as last described by the simulator. Fields the grid has not sent stay null. */
data class SimObject(
    val localId: Long,
    val fullId: UUID? = null,
    val parentId: Long = 0,
    val pcode: Int = PCode.PRIM,
    val scale: Vec3 = Vec3(0.5f, 0.5f, 0.5f),
    /** Relative to the parent when [parentId] is non-zero, otherwise region-relative. */
    val position: Vec3 = Vec3.ZERO,
    val rotation: Quat = Quat.IDENTITY,
    val params: PrimParams = PrimParams(),
    val textures: TextureEntry? = null,
    val sculpt: SculptInfo? = null,
    val hasFlexible: Boolean = false,
    val text: String? = null,
    val particles: ParticleParams? = null,
    val updateFlags: Long = 0,
    val sound: ObjectSound? = null,
) {
    val isAvatar get() = pcode == PCode.AVATAR
}

/** A change reported by a decoded update message. */
sealed class ObjectChange {
    data class Full(val obj: SimObject) : ObjectChange()
    /** Motion only (terse update); [textures] is set when the update carried a new texture entry. */
    data class Motion(val localId: Long, val position: Vec3, val rotation: Quat, val isAvatar: Boolean, val textures: TextureEntry?) : ObjectChange()
    data class Killed(val localId: Long) : ObjectChange()
    /** Objects the simulator says exist but expects the viewer to request: we keep no cache. */
    data class NeedsFull(val localIds: List<Long>) : ObjectChange()
}
