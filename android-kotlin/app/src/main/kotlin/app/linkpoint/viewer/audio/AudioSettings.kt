package app.linkpoint.viewer.audio

import app.linkpoint.viewer.data.Prefs

/** What the resident has chosen for sound: spatial sounds from objects, and the parcel's music / audio media. */
data class AudioSettings(val soundOn: Boolean, val soundVolume: Float, val musicOn: Boolean, val musicVolume: Float) {
    companion object {
        fun load(p: Prefs) = AudioSettings(p.soundOn, p.soundVolume, p.musicOn, p.musicVolume)
    }
}
