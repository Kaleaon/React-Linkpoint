package app.linkpoint.core

import app.linkpoint.core.audio.SoundEvent
import app.linkpoint.core.llsd.Llsd
import app.linkpoint.core.login.LoginResult
import app.linkpoint.core.mock.ObjectPackets
import app.linkpoint.core.mock.ObjectSpec
import app.linkpoint.core.model.*
import app.linkpoint.core.net.*
import app.linkpoint.core.scene.*
import java.util.UUID
import java.util.concurrent.ConcurrentLinkedQueue
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

/** Wire formats of sounds and parcel media (layouts from the official message template), and what the session does with them. */
class SoundProtocolTest {
    private val snd = UUID.fromString("5a5a5a5a-0000-4000-8000-000000000001")
    private val obj = UUID.fromString("0b0b0b0b-0000-4000-8000-000000000002")
    private val owner = UUID.fromString("0c0c0c0c-0000-4000-8000-000000000003")

    // ---- message parsing ------------------------------------------------------------------------

    @Test fun soundTriggerParses() {
        val body = WireWriter().uuid(snd).uuid(owner).uuid(obj).uuid(UUID(0, 0)).u64(0x1122334455667788L).vec3(10f, 20f, 30f).f32(0.75f).toByteArray()
        val m = Messages.parse(Msg.SoundTrigger, body) as Incoming.SoundTrigger
        assertEquals(snd, m.soundId); assertEquals(owner, m.ownerId); assertEquals(obj, m.objectId)
        assertEquals(0x1122334455667788L, m.regionHandle)
        assertArrayEquals(floatArrayOf(10f, 20f, 30f), m.position, 0f); assertEquals(0.75f, m.gain, 0f)
    }

    @Test fun attachedSoundAndGainChangeParse() {
        val a = Messages.parse(Msg.AttachedSound, WireWriter().uuid(snd).uuid(obj).uuid(owner).f32(0.5f).u8(SoundFlags.LOOP or SoundFlags.QUEUE).toByteArray()) as Incoming.AttachedSound
        assertEquals(snd, a.soundId); assertEquals(obj, a.objectId); assertEquals(0.5f, a.gain, 0f); assertEquals(0x11, a.flags)
        val g = Messages.parse(Msg.AttachedSoundGainChange, WireWriter().uuid(obj).f32(0.25f).toByteArray()) as Incoming.AttachedSoundGainChange
        assertEquals(obj, g.objectId); assertEquals(0.25f, g.gain, 0f)
    }

    @Test fun preloadSoundHoldsAVariableNumberOfTriples() {
        val other = UUID.randomUUID()
        val m = Messages.parse(Msg.PreloadSound, WireWriter().u8(2).uuid(obj).uuid(owner).uuid(snd).uuid(obj).uuid(owner).uuid(other).toByteArray()) as Incoming.PreloadSound
        assertEquals(listOf(snd, other), m.entries.map { it.third })
        assertEquals(0, (Messages.parse(Msg.PreloadSound, WireWriter().u8(0).toByteArray()) as Incoming.PreloadSound).entries.size)
    }

    @Test fun parcelMediaUpdateParsesWithAndWithoutTheExtendedBlock() {
        val id = UUID.randomUUID()
        val full = Messages.parse(Msg.ParcelMediaUpdate, WireWriter().str1("http://example.test/v.mp4").uuid(id).u8(1)
            .str1("video/mp4").str1("Demo reel").s32(640).s32(360).u8(1).toByteArray()) as Incoming.ParcelMediaUpdate
        assertEquals("http://example.test/v.mp4", full.url); assertEquals(id, full.mediaId); assertTrue(full.autoScale)
        assertEquals("video/mp4", full.type); assertEquals("Demo reel", full.description); assertEquals(640, full.width); assertEquals(360, full.height); assertTrue(full.loop)
        val old = Messages.parse(Msg.ParcelMediaUpdate, WireWriter().str1("http://example.test/a.mp3").uuid(id).u8(0).toByteArray()) as Incoming.ParcelMediaUpdate
        assertEquals("http://example.test/a.mp3", old.url); assertEquals("", old.type); assertEquals(0, old.width); assertFalse(old.loop)
    }

    @Test fun parcelMediaCommandParses() {
        val c = Messages.parse(Msg.ParcelMediaCommandMessage, WireWriter().u32(0).u32(6).f32(42.5f).toByteArray()) as Incoming.ParcelMediaCommand
        assertEquals(6L, c.command); assertEquals(42.5f, c.time, 0f)
    }

    @Test fun truncatedSoundMessagesAreUnhandledNotACrash() {
        for (id in listOf(Msg.SoundTrigger, Msg.AttachedSound, Msg.AttachedSoundGainChange, Msg.ParcelMediaCommandMessage))
            assertTrue(Messages.parse(id, ByteArray(5)) is Incoming.Unhandled)
    }

    // ---- sounds inside object updates -----------------------------------------------------------

    private val loop = ObjectSound(snd, 0.8f, SoundFlags.LOOP, 25f, owner)

    @Test fun aFullUpdateCarriesTheObjectSound() {
        val ch = ObjectDecoder.decode(Msg.ObjectUpdate, ObjectPackets.full(ObjectSpec(7, position = Vec3(1f, 2f, 3f), sound = loop))).single() as ObjectChange.Full
        val s = ch.obj.sound!!
        assertEquals(snd, s.soundId); assertEquals(0.8f, s.gain, 1e-6f); assertEquals(25f, s.radius, 0f); assertEquals(owner, s.ownerId)
        assertTrue(s.loops); assertFalse(s.stopped)
    }

    @Test fun aCompressedUpdateCarriesTheObjectSoundAndStillParsesWhatFollows() {
        val spec = ObjectSpec(8, position = Vec3(4f, 5f, 6f), sound = loop, text = "label", sculpt = UUID.randomUUID() to 5)
        val o = (ObjectDecoder.decode(Msg.ObjectUpdateCompressed, ObjectPackets.compressed(spec)).single() as ObjectChange.Full).obj
        assertEquals(snd, o.sound!!.soundId); assertEquals(25f, o.sound!!.radius, 0f)
        assertEquals("label", o.text) // fields after the sound block are not shifted
        assertEquals(5, o.sculpt!!.type)
    }

    @Test fun noSoundMeansNullAndNilIdIsNoSound() {
        for ((id, body) in listOf(Msg.ObjectUpdate to ObjectPackets.full(ObjectSpec(9, position = Vec3.ZERO)), Msg.ObjectUpdateCompressed to ObjectPackets.compressed(ObjectSpec(9, position = Vec3.ZERO)))) {
            assertNull(((ObjectDecoder.decode(id, body).single()) as ObjectChange.Full).obj.sound)
        }
        val nil = ObjectSound(UUID(0, 0), 1f, 0, 0f)
        assertNull((ObjectDecoder.decode(Msg.ObjectUpdate, ObjectPackets.full(ObjectSpec(10, position = Vec3.ZERO, sound = nil))).single() as ObjectChange.Full).obj.sound)
    }

    @Test fun outOfRangeGainAndRadiusAreClamped() {
        val o = (ObjectDecoder.decode(Msg.ObjectUpdate, ObjectPackets.full(ObjectSpec(11, position = Vec3.ZERO, sound = ObjectSound(snd, 7f, 0, -3f)))).single() as ObjectChange.Full).obj
        assertEquals(1f, o.sound!!.gain, 0f); assertEquals(0f, o.sound!!.radius, 0f)
    }

    @Test fun theStopFlagMarksAStoppedSound() {
        val o = (ObjectDecoder.decode(Msg.ObjectUpdate, ObjectPackets.full(ObjectSpec(12, position = Vec3.ZERO, sound = ObjectSound(snd, 1f, SoundFlags.STOP, 0f)))).single() as ObjectChange.Full).obj
        assertTrue(o.sound!!.stopped)
    }

    // ---- session ---------------------------------------------------------------------------------

    private val noHttp = FakeHttp { _, _ -> HttpResponse(404, ByteArray(0)) }
    private fun scope() = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private fun login(sim: FakeSim, seed: String = "") = LoginResult(
        agentId = sim.agent.toString(), sessionId = UUID.randomUUID().toString(), secureSessionId = "", circuitCode = 99,
        simIp = "127.0.0.1", simPort = sim.socket.localPort, seedCapability = seed, firstName = "Test", lastName = "Resident",
        regionX = 256000, regionY = 256256, message = "", buddies = emptyList(), inventoryRootId = null, mfaHash = null, raw = emptyMap(),
    )
    private suspend fun <T> eventually(timeoutMs: Long = 5000, f: () -> T?): T {
        val end = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < end) { f()?.let { return it }; delay(25) }
        throw AssertionError("condition not met in ${timeoutMs}ms")
    }

    /** Waits until [cond] is true (the plain `eventually { boolean }` would return at once on `false`, which is non-null). */
    private suspend fun until(timeoutMs: Long = 5000, cond: () -> Boolean) { eventually(timeoutMs) { true.takeIf { cond() } } }

    @Test fun soundMessagesBecomeSoundEvents() = runBlocking {
        FakeSim().use { sim ->
            val sc = scope(); val s = ViewerSession(noHttp, sc)
            val events = java.util.concurrent.CopyOnWriteArrayList<SoundEvent>()
            sc.launch(start = CoroutineStart.UNDISPATCHED) { s.soundEvents.collect { events += it } }
            s.connect(login(sim))
            sim.inject(Outgoing(Msg.SoundTrigger, WireWriter().uuid(snd).uuid(owner).uuid(obj).uuid(UUID(0, 0)).u64(0).vec3(11f, 22f, 33f).f32(3f).toByteArray(), false))
            sim.inject(Outgoing(Msg.AttachedSound, WireWriter().uuid(snd).uuid(obj).uuid(owner).f32(0.6f).u8(SoundFlags.LOOP).toByteArray(), true))
            sim.inject(Outgoing(Msg.AttachedSoundGainChange, WireWriter().uuid(obj).f32(0.1f).toByteArray(), true))
            sim.inject(Outgoing(Msg.PreloadSound, WireWriter().u8(1).uuid(obj).uuid(owner).uuid(snd).toByteArray(), true))
            eventually { events.takeIf { it.size >= 4 } }
            val t = events.filterIsInstance<SoundEvent.Trigger>().single()
            assertEquals(snd, t.soundId); assertEquals(Vec3(11f, 22f, 33f), t.position); assertEquals("gain is clamped to 1", 1f, t.gain, 0f)
            assertEquals(SoundFlags.LOOP, events.filterIsInstance<SoundEvent.Attached>().single().flags)
            assertEquals(0.1f, events.filterIsInstance<SoundEvent.GainChange>().single().gain, 1e-6f)
            assertEquals(listOf(snd), events.filterIsInstance<SoundEvent.Preload>().single().soundIds)
            s.logout(); sc.cancel()
        }
    }

    @Test fun anObjectWithASoundShowsUpInTheScene() = runBlocking {
        FakeSim().use { sim ->
            val sc = scope(); val s = ViewerSession(noHttp, sc)
            s.connect(login(sim))
            sim.inject(Outgoing(Msg.ObjectUpdate, ObjectPackets.full(ObjectSpec(70, position = Vec3(9f, 9f, 9f), sound = loop)), false))
            val o = eventually { s.scene.get(70)?.takeIf { it.sound != null } }
            assertEquals(snd, o.sound!!.soundId)
            s.logout(); sc.cancel()
        }
    }

    // ---- parcel media ----------------------------------------------------------------------------

    /** Seed capability + event queue serving whatever events the test queues. */
    private class EventCaps {
        val queue = ConcurrentLinkedQueue<Map<String, Any?>>()
        fun http() = FakeHttp { url, _ ->
            when {
                url.endsWith("/seed") -> HttpResponse(200, Llsd.toXml(mapOf("EventQueueGet" to "http://caps.test/eq")).toByteArray())
                url.endsWith("/eq") -> {
                    val events = generateSequence { queue.poll() }.toList()
                    if (events.isEmpty()) { Thread.sleep(30); HttpResponse(499, ByteArray(0)) }
                    else HttpResponse(200, Llsd.toXml(mapOf("id" to 1, "events" to events)).toByteArray())
                }
                else -> HttpResponse(404, ByteArray(0))
            }
        }
    }

    private fun parcelEvent(media: Map<String, Any?>, extra: Map<String, Any?>? = null) = mapOf("message" to "ParcelProperties", "body" to buildMap<String, Any?> {
        put("ParcelData", listOf(mapOf("LocalID" to 3, "Name" to "Test parcel", "Area" to 4096, "MusicURL" to "http://radio.test/stream.mp3") + media))
        if (extra != null) put("MediaData", listOf(extra))
    })

    @Test fun parcelPropertiesWithMediaFillTheMediaState() = runBlocking {
        FakeSim().use { sim ->
            val caps = EventCaps(); val sc = scope(); val s = ViewerSession(caps.http(), sc)
            s.connect(login(sim, "http://caps.test/seed"))
            val tex = UUID.randomUUID()
            caps.queue += parcelEvent(
                mapOf("MediaURL" to "http://example.test/clip.mp4", "MediaID" to tex, "MediaAutoScale" to true),
                mapOf("MediaDesc" to "Clip", "MediaType" to "video/mp4", "MediaWidth" to 320, "MediaHeight" to 240, "MediaLoop" to true),
            )
            val m = eventually { s.parcelMedia.value }
            assertEquals("http://example.test/clip.mp4", m.url); assertEquals(tex, m.mediaId); assertTrue(m.autoScale)
            assertEquals("video/mp4", m.type); assertEquals("Clip", m.description); assertEquals(320, m.width); assertEquals(240, m.height); assertTrue(m.loop)
            assertFalse(m.isAudioOnly)
            assertEquals("http://radio.test/stream.mp3", s.parcel.value!!.musicUrl) // the parcel's music stream is separate from its media
            s.logout(); sc.cancel()
        }
    }

    @Test fun aParcelWithoutMediaHasNoMedia() = runBlocking {
        FakeSim().use { sim ->
            val caps = EventCaps(); val sc = scope(); val s = ViewerSession(caps.http(), sc)
            s.connect(login(sim, "http://caps.test/seed"))
            caps.queue += parcelEvent(mapOf("MediaURL" to "", "MediaID" to UUID(0, 0)))
            eventually { s.parcel.value }
            assertNull(s.parcelMedia.value)
            s.logout(); sc.cancel()
        }
    }

    @Test fun noneSlashNoneMeansNoTypeInBothPaths() = runBlocking {
        FakeSim().use { sim ->
            val caps = EventCaps(); val sc = scope(); val s = ViewerSession(caps.http(), sc)
            s.connect(login(sim, "http://caps.test/seed"))
            caps.queue += parcelEvent(mapOf("MediaURL" to "http://example.test/s.mp3", "MediaID" to UUID(0, 0)), mapOf("MediaType" to "none/none", "MediaDesc" to "", "MediaWidth" to 0, "MediaHeight" to 0, "MediaLoop" to false))
            assertEquals("", eventually { s.parcelMedia.value }.type)
            sim.inject(Outgoing(Msg.ParcelMediaUpdate, WireWriter().str1("http://example.test/t.mp3").uuid(UUID(0, 0)).u8(0).str1("none/none").str1("").s32(0).s32(0).u8(0).toByteArray(), true))
            assertEquals("http://example.test/t.mp3", eventually { s.parcelMedia.value?.takeIf { it.url.endsWith("t.mp3") } }.url)
            assertEquals("", s.parcelMedia.value!!.type)
            assertTrue("with no type the address decides: .mp3 is audio", s.parcelMedia.value!!.isAudioOnly)
            s.logout(); sc.cancel()
        }
    }

    @Test fun aMediaTextureWithoutAnAddressStillCountsAsMedia() = runBlocking {
        FakeSim().use { sim ->
            val caps = EventCaps(); val sc = scope(); val s = ViewerSession(caps.http(), sc)
            s.connect(login(sim, "http://caps.test/seed"))
            caps.queue += parcelEvent(mapOf("MediaURL" to "", "MediaID" to UUID.randomUUID()))
            assertNotNull(eventually { s.parcelMedia.value })
            s.logout(); sc.cancel()
        }
    }

    @Test fun aParcelMediaUpdateReplacesTheMediaAndAnEmptyOneClearsIt() = runBlocking {
        FakeSim().use { sim ->
            val sc = scope(); val s = ViewerSession(noHttp, sc)
            s.connect(login(sim))
            sim.inject(Outgoing(Msg.ParcelMediaUpdate, WireWriter().str1("http://example.test/live.mp3").uuid(UUID(0, 0)).u8(0).str1("audio/mpeg").str1("Radio").s32(0).s32(0).u8(0).toByteArray(), true))
            val m = eventually { s.parcelMedia.value }
            assertEquals("http://example.test/live.mp3", m.url); assertTrue(m.isAudioOnly)
            sim.inject(Outgoing(Msg.ParcelMediaUpdate, WireWriter().str1("").uuid(UUID(0, 0)).u8(0).toByteArray(), true))
            until { s.parcelMedia.value == null }
            s.logout(); sc.cancel()
        }
    }

    private fun command(sim: FakeSim, cmd: Int, time: Float = 0f) = sim.inject(Outgoing(Msg.ParcelMediaCommandMessage, WireWriter().u32(0).u32(cmd.toLong()).f32(time).toByteArray(), true))

    @Test fun mediaCommandsDrivePlaybackState() = runBlocking {
        FakeSim().use { sim ->
            val sc = scope(); val s = ViewerSession(noHttp, sc)
            s.connect(login(sim))
            assertEquals(MediaPlayback(), s.mediaPlayback.value)
            command(sim, 2); assertEquals(MediaState.PLAYING, eventually { s.mediaPlayback.value.takeIf { it.state == MediaState.PLAYING } }.state)
            command(sim, 6, 90f); assertEquals(90f, eventually { s.mediaPlayback.value.takeIf { it.timeSeconds == 90f } }.timeSeconds, 0f)
            assertEquals("seeking does not change play state", MediaState.PLAYING, s.mediaPlayback.value.state)
            command(sim, 1); eventually { s.mediaPlayback.value.takeIf { it.state == MediaState.PAUSED } }
            assertEquals("pause keeps the position", 90f, s.mediaPlayback.value.timeSeconds, 0f)
            command(sim, 3); val looping = eventually { s.mediaPlayback.value.takeIf { it.state == MediaState.PLAYING && it.loop } }
            assertEquals(90f, looping.timeSeconds, 0f)
            command(sim, 0); val stopped = eventually { s.mediaPlayback.value.takeIf { it.state == MediaState.STOPPED } }
            assertEquals(0f, stopped.timeSeconds, 0f)
            s.logout(); sc.cancel()
        }
    }

    @Test fun unloadClearsTheMedia() = runBlocking {
        FakeSim().use { sim ->
            val sc = scope(); val s = ViewerSession(noHttp, sc)
            s.connect(login(sim))
            sim.inject(Outgoing(Msg.ParcelMediaUpdate, WireWriter().str1("http://example.test/x.mp4").uuid(UUID(0, 0)).u8(0).toByteArray(), true))
            eventually { s.parcelMedia.value }; command(sim, 2)
            eventually { s.mediaPlayback.value.takeIf { it.state == MediaState.PLAYING } }
            command(sim, 8)
            until { s.parcelMedia.value == null }
            assertEquals(MediaPlayback(), s.mediaPlayback.value)
            s.logout(); sc.cancel()
        }
    }

    @Test fun mediaDoesNotFollowYouToAnotherRegion() = runBlocking {
        FakeSim("West", 1000, 1001).use { west -> FakeSim("East", 1001, 1001).use { east ->
            val caps = object { val q = HashMap<String, ConcurrentLinkedQueue<Map<String, Any?>>>() }
            fun queue(n: String) = caps.q.getOrPut(n) { ConcurrentLinkedQueue() }
            val http = FakeHttp { url, _ ->
                val sim = url.removePrefix("http://caps.test/").substringBefore('/')
                when {
                    url.endsWith("/seed") -> HttpResponse(200, Llsd.toXml(mapOf("EventQueueGet" to "http://caps.test/$sim/eq")).toByteArray())
                    url.endsWith("/eq") -> { val ev = generateSequence { queue(sim).poll() }.toList(); if (ev.isEmpty()) { Thread.sleep(30); HttpResponse(499, ByteArray(0)) } else HttpResponse(200, Llsd.toXml(mapOf("id" to 1, "events" to ev)).toByteArray()) }
                    else -> HttpResponse(404, ByteArray(0))
                }
            }
            val sc = scope(); val s = ViewerSession(http, sc)
            s.connect(login(west, "http://caps.test/west/seed"))
            queue("west") += parcelEvent(mapOf("MediaURL" to "http://example.test/west.mp4", "MediaID" to UUID.randomUUID()))
            eventually { s.parcelMedia.value }; command(west, 2); eventually { s.mediaPlayback.value.takeIf { it.state == MediaState.PLAYING } }
            queue("west") += mapOf("message" to "CrossedRegion", "body" to mapOf("RegionData" to listOf(mapOf("SimIP" to byteArrayOf(127, 0, 0, 1), "SimPort" to east.socket.localPort, "SeedCapability" to "http://caps.test/east/seed"))))
            until { s.region.value?.name == "East" }
            assertNull("the old parcel's media is dropped on arrival", s.parcelMedia.value)
            assertEquals(MediaPlayback(), s.mediaPlayback.value)
            s.logout(); sc.cancel()
        } }
    }

    @Test fun audioOnlyIsRecognisedFromTypeOrAddress() {
        fun m(url: String, type: String) = ParcelMedia(url, null, false, type, "", 0, 0, false)
        assertTrue(m("http://r.test/live", "audio/mpeg").isAudioOnly)
        assertTrue(m("http://r.test/live.mp3?x=1", "").isAudioOnly)
        assertTrue(m("http://r.test/list.pls", "").isAudioOnly)
        assertFalse(m("http://r.test/movie.mp4", "video/mp4").isAudioOnly)
        assertFalse(m("http://r.test/page.html", "text/html").isAudioOnly)
    }
}
