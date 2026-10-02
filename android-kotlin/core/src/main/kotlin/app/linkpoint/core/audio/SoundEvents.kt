package app.linkpoint.core.audio

import app.linkpoint.core.scene.Vec3
import java.util.UUID

/** Sound happenings the simulator reports, in viewer terms. Positions are region-local metres. */
sealed class SoundEvent {
    /** A one-shot sound at a place (llTriggerSound and friends). */
    data class Trigger(val soundId: UUID, val objectId: UUID, val ownerId: UUID, val position: Vec3, val gain: Float) : SoundEvent()
    /** A sound attached to an object (llPlaySound / llLoopSound); [flags] are [app.linkpoint.core.scene.SoundFlags]. */
    data class Attached(val soundId: UUID, val objectId: UUID, val gain: Float, val flags: Int) : SoundEvent()
    data class GainChange(val objectId: UUID, val gain: Float) : SoundEvent()
    /** Sounds worth fetching before they are triggered. */
    data class Preload(val soundIds: List<UUID>) : SoundEvent()
}
