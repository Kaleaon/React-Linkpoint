package app.linkpoint.core

import app.linkpoint.core.audio.*
import app.linkpoint.core.login.Grid
import app.linkpoint.core.login.LoginClient
import app.linkpoint.core.login.LoginRequest
import app.linkpoint.core.mock.MockGrid
import app.linkpoint.core.model.ConnectionState
import app.linkpoint.core.net.UrlConnectionHttp
import app.linkpoint.core.scene.*
import java.util.UUID
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

/**
 * Sound and parcel media through the whole stack against the fake grid over real sockets: the object update that carries a
 * looping sound, the SoundTrigger, the ViewerAsset download, the Ogg check, placement in 3D, and the parcel's music and media.
 */
class MockGridSoundTest {
    private class Recorder : SoundBackend {
        class Play(val channel: Int, val soundId: UUID, val loop: Boolean, val left: Float, val right: Float)
        val plays = java.util.concurrent.CopyOnWriteArrayList<Play>()
        val stops = java.util.concurrent.CopyOnWriteArrayList<Int>()
        val volumes = java.util.concurrent.CopyOnWriteArrayList<Pair<Float, Float>>()
        override fun play(channel: Int, soundId: UUID, loop: Boolean, left: Float, right: Float) { plays += Play(channel, soundId, loop, left, right) }
        override fun setVolume(channel: Int, left: Float, right: Float) { volumes += left to right }
        override fun stop(channel: Int) { stops += channel }
    }

    private suspend fun <T> eventually(timeoutMs: Long = 15_000, what: String, f: () -> T?): T {
        val end = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < end) { f()?.let { return it }; delay(25) }
        throw AssertionError("timed out waiting for $what")
    }

    @Test fun theMockRegionIsAudibleAndHasParcelMedia() = runBlocking {
        MockGrid().start().use { grid ->
            val http = UrlConnectionHttp()
            val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val result = LoginClient.login(http, LoginRequest(Grid("mock", "Mock", grid.loginUrl), "Mock Resident", "pw", deviceId = "t"))
            val s = ViewerSession(http, scope)
            val events = java.util.concurrent.CopyOnWriteArrayList<SoundEvent>()
            scope.launch(start = CoroutineStart.UNDISPATCHED) { s.soundEvents.collect { events += it } }
            s.connect(result)
            assertEquals(ConnectionState.CONNECTED, s.state.value)

            // The speaker object carries its sound in the object update.
            val speaker = eventually(what = "the speaker object") { s.scene.get(50)?.takeIf { it.sound != null } }
            assertEquals(MockGrid.SOUND_TONE, speaker.sound!!.soundId); assertTrue(speaker.sound!!.loops); assertEquals(0.8f, speaker.sound!!.gain, 1e-6f)
            // ...and a chime is triggered at the region centre.
            val chime = eventually(what = "the sound trigger") { events.filterIsInstance<SoundEvent.Trigger>().firstOrNull() }
            assertEquals(MockGrid.SOUND_TONE, chime.soundId)

            // Download through ViewerAsset, check it is Ogg Vorbis.
            val caps = eventually(what = "capabilities") { s.capabilities.value.takeIf { "ViewerAsset" in it } }
            val fetcher = SoundFetcher(http, scope, { caps["ViewerAsset"] })
            fetcher.request(MockGrid.SOUND_TONE)
            val tone = eventually(what = "the tone") { fetcher.peek(MockGrid.SOUND_TONE) }
            assertEquals(44100, tone.info.sampleRate); assertEquals(0.5f, tone.info.durationSeconds, 0.03f)
            assertEquals(listOf(MockGrid.SOUND_TONE.toString()), grid.soundRequests.distinct())

            // Play it in 3D from where the avatar stands.
            val backend = Recorder()
            val scene = SoundScene(backend, fetcher)
            events.forEach(scene::onEvent)
            val me = s.region.value!!.position!!
            val listener = Listener.atYaw(Vec3(me[0], me[1], me[2]), 0f)
            scene.tick(listener, s.scene)
            val loop = backend.plays.single { it.loop }
            assertEquals(MockGrid.SOUND_TONE, loop.soundId)
            val expected = SpatialAudio.spatialize(listener, s.scene.worldTransform(speaker)!!.first, 0.8f)
            assertEquals(expected.left, loop.left, 1e-4f); assertEquals(expected.right, loop.right, 1e-4f)
            assertTrue("the chime plays too (it is a one-shot)", backend.plays.any { !it.loop })

            // Parcel: the stream and the media, kept apart.
            val parcel = eventually(what = "parcel") { s.parcel.value }
            assertEquals("http://music.example/stream", parcel.musicUrl)
            val media = eventually(what = "parcel media") { s.parcelMedia.value }
            assertEquals("http://media.example/demo.mp4", media.url); assertEquals(MockGrid.TEX_CHECKER, media.mediaId)
            assertEquals("video/mp4", media.type); assertEquals(320, media.width); assertTrue(media.loop); assertTrue(media.autoScale)
            assertEquals("Mock demo reel", media.description)

            s.logout(); scope.cancel()
        }
    }
}
