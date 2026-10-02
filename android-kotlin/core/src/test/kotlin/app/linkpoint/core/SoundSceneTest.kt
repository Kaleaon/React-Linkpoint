package app.linkpoint.core

import app.linkpoint.core.audio.*
import app.linkpoint.core.mock.ObjectPackets
import app.linkpoint.core.mock.ObjectSpec
import app.linkpoint.core.net.Msg
import app.linkpoint.core.net.Received
import app.linkpoint.core.scene.*
import java.util.UUID
import org.junit.Assert.*
import org.junit.Test

class SoundSceneTest {
    private class Call(val op: String, val channel: Int, val soundId: UUID? = null, val loop: Boolean = false, val left: Float = 0f, val right: Float = 0f)

    private class FakeBackend : SoundBackend {
        val calls = ArrayList<Call>()
        override fun play(channel: Int, soundId: UUID, loop: Boolean, left: Float, right: Float) { calls += Call("play", channel, soundId, loop, left, right) }
        override fun setVolume(channel: Int, left: Float, right: Float) { calls += Call("vol", channel, left = left, right = right) }
        override fun stop(channel: Int) { calls += Call("stop", channel) }
        fun plays() = calls.filter { it.op == "play" }
        fun stops() = calls.filter { it.op == "stop" }
        fun clear() = calls.clear()
    }

    private class FakeAssets : SoundAssets {
        val ready = HashSet<UUID>()
        val requested = ArrayList<UUID>()
        override fun request(soundId: UUID) { requested += soundId }
        override fun isReady(soundId: UUID) = soundId in ready
    }

    private val a = UUID.fromString("5a5a5a5a-0000-4000-8000-00000000000a")
    private val b = UUID.fromString("5a5a5a5a-0000-4000-8000-00000000000b")
    private val c = UUID.fromString("5a5a5a5a-0000-4000-8000-00000000000c")

    private val backend = FakeBackend()
    private val assets = FakeAssets()
    private var now = 1_000L
    private val sounds = SoundScene(backend, assets, { now })
    private val world = SceneStore()
    private val here = Listener(Vec3(100f, 100f, 30f), Vec3(1f, 0f, 0f))

    private fun put(spec: ObjectSpec) { world.process(Received(Msg.ObjectUpdate, ObjectPackets.full(spec))) }
    private fun emitter(local: Long, x: Float, y: Float, sound: ObjectSound, parent: Long = 0, z: Float = 30f) =
        put(ObjectSpec(local, position = Vec3(x, y, z), parent = parent, sound = sound))
    private fun loop(id: UUID, gain: Float = 1f, radius: Float = 0f) = ObjectSound(id, gain, SoundFlags.LOOP, radius)
    private fun once(id: UUID, gain: Float = 1f) = ObjectSound(id, gain, 0, 0f)
    private fun fullId(local: Long) = world.get(local)!!.fullId!!

    // ---- looping object sounds -----------------------------------------------------------------

    @Test fun aLoopingSoundStartsOnceItsDataIsThereAndIsPlacedInSpace() {
        emitter(1, 105f, 100f, loop(a))
        sounds.tick(here, world)
        assertTrue("nothing plays before the sound has arrived", backend.plays().isEmpty())
        assertEquals("but it is requested", listOf(a), assets.requested.distinct())

        assets.ready += a
        sounds.tick(here, world)
        val p = backend.plays().single()
        assertEquals(a, p.soundId); assertTrue(p.loop)
        val expected = SpatialAudio.spatialize(here, Vec3(105f, 100f, 30f), 1f)
        assertEquals(expected.left, p.left, 1e-5f); assertEquals(expected.right, p.right, 1e-5f)
        assertEquals(1, sounds.activeChannels)
    }

    @Test fun aRunningLoopFollowsTheListener() {
        assets.ready += a
        emitter(1, 110f, 100f, loop(a))
        sounds.tick(here, world); backend.clear()
        sounds.tick(Listener(Vec3(108f, 100f, 30f), Vec3(1f, 0f, 0f)), world)
        val v = backend.calls.single()
        assertEquals("vol", v.op)
        assertEquals(SpatialAudio.spatialize(Listener(Vec3(108f, 100f, 30f)), Vec3(110f, 100f, 30f), 1f).left, v.left, 1e-5f)
        assertTrue("it is no longer restarted each tick", backend.plays().isEmpty())
    }

    @Test fun turningTheListenerChangesTheMixWithoutRestarting() {
        assets.ready += a
        emitter(1, 100f, 90f, loop(a)) // 10 m to the south
        sounds.tick(Listener.atYaw(here.position, 0f), world)
        val facingEast = backend.plays().single()
        assertTrue("south is the right-hand side when facing east", facingEast.right > facingEast.left)
        backend.clear()
        sounds.tick(Listener.atYaw(here.position, Math.PI.toFloat()), world) // now facing west
        val turned = backend.calls.single()
        assertTrue("and the left when facing west", turned.left > turned.right)
    }

    @Test fun aSoundGoingOutOfRangeStopsAndComesBackWhenInRangeAgain() {
        assets.ready += a
        emitter(1, 100f, 100f, loop(a, radius = 20f))
        sounds.tick(here, world)
        assertEquals(1, sounds.activeChannels)
        sounds.tick(Listener(Vec3(160f, 100f, 30f)), world)
        assertEquals(0, sounds.activeChannels); assertEquals(1, backend.stops().size)
        backend.clear()
        sounds.tick(here, world)
        assertEquals("it starts again", 1, backend.plays().size)
    }

    @Test fun aKilledObjectsSoundStops() {
        assets.ready += a
        emitter(1, 101f, 100f, loop(a))
        sounds.tick(here, world)
        world.process(Received(Msg.KillObject, app.linkpoint.core.net.WireWriter().u8(1).u32(1).toByteArray()))
        sounds.tick(here, world)
        assertEquals(0, sounds.activeChannels); assertEquals(1, backend.stops().size)
    }

    @Test fun theStopFlagStopsALoop() {
        assets.ready += a
        emitter(1, 101f, 100f, loop(a))
        sounds.tick(here, world)
        emitter(1, 101f, 100f, ObjectSound(a, 1f, SoundFlags.LOOP or SoundFlags.STOP, 0f))
        sounds.tick(here, world)
        assertEquals(0, sounds.activeChannels)
    }

    @Test fun clearingTheSoundStopsIt() {
        assets.ready += a
        emitter(1, 101f, 100f, loop(a))
        sounds.tick(here, world)
        put(ObjectSpec(1, position = Vec3(101f, 100f, 30f))) // an update with no sound
        sounds.tick(here, world)
        assertEquals(0, sounds.activeChannels)
    }

    @Test fun anObjectSwitchingSoundsSwapsTheChannel() {
        assets.ready += a; assets.ready += b
        emitter(1, 101f, 100f, loop(a))
        sounds.tick(here, world); backend.clear()
        emitter(1, 101f, 100f, loop(b))
        sounds.tick(here, world)
        assertEquals(1, backend.stops().size); assertEquals(b, backend.plays().single().soundId)
        assertEquals(1, sounds.activeChannels)
    }

    @Test fun aLinkedChildSoundsFromItsParentsWorldPosition() {
        assets.ready += a
        put(ObjectSpec(10, position = Vec3(120f, 100f, 30f)))            // root, 20 m east
        emitter(11, 0f, 0f, loop(a), parent = 10, z = 0f)                // child at the root's origin
        sounds.tick(here, world)
        val p = backend.plays().single()
        assertEquals(SpatialAudio.spatialize(here, Vec3(120f, 100f, 30f), 1f).left, p.left, 1e-4f)
    }

    @Test fun anOrphanedChildWithAnUnknownParentIsSilent() {
        assets.ready += a
        emitter(11, 0f, 0f, loop(a), parent = 99)
        sounds.tick(here, world)
        assertTrue(backend.plays().isEmpty())
    }

    // ---- play-once object sounds ---------------------------------------------------------------

    @Test fun aPlayOnceObjectSoundPlaysOnceNotEveryTick() {
        assets.ready += a
        emitter(1, 101f, 100f, once(a))
        sounds.tick(here, world)
        val first = backend.plays().single()
        assertFalse(first.loop)
        sounds.onChannelFinished(first.channel)
        backend.clear()
        repeat(3) { sounds.tick(here, world) }
        assertTrue("it has played; the object still carries the sound but it must not replay", backend.plays().isEmpty())
    }

    @Test fun aPlayOnceSoundPlaysAgainAfterItWasClearedAndSetAgain() {
        assets.ready += a
        emitter(1, 101f, 100f, once(a))
        sounds.tick(here, world); sounds.onChannelFinished(backend.plays().single().channel)
        put(ObjectSpec(1, position = Vec3(101f, 100f, 30f)))
        sounds.tick(here, world)
        backend.clear()
        emitter(1, 101f, 100f, once(a))
        sounds.tick(here, world)
        assertEquals(1, backend.plays().size)
    }

    // ---- one-shots ---------------------------------------------------------------------------

    @Test fun aTriggeredSoundPlaysOnceAtItsPlace() {
        assets.ready += a
        sounds.onEvent(SoundEvent.Trigger(a, UUID.randomUUID(), UUID.randomUUID(), Vec3(103f, 100f, 30f), 0.5f))
        sounds.tick(here, world)
        val p = backend.plays().single()
        assertFalse(p.loop)
        assertEquals(SpatialAudio.spatialize(here, Vec3(103f, 100f, 30f), 0.5f).left, p.left, 1e-5f)
        sounds.onChannelFinished(p.channel); backend.clear()
        repeat(3) { sounds.tick(here, world) }
        assertTrue(backend.plays().isEmpty())
    }

    @Test fun aTriggeredSoundWaitsForItsDataThenPlays() {
        sounds.onEvent(SoundEvent.Trigger(a, UUID.randomUUID(), UUID.randomUUID(), Vec3(101f, 100f, 30f), 1f))
        sounds.tick(here, world)
        assertTrue(backend.plays().isEmpty()); assertTrue(a in assets.requested)
        now += 2_000; assets.ready += a
        sounds.tick(here, world)
        assertEquals(1, backend.plays().size)
    }

    @Test fun aTriggeredSoundWhoseDataNeverComesIsDroppedNotPlayedLate() {
        sounds.onEvent(SoundEvent.Trigger(a, UUID.randomUUID(), UUID.randomUUID(), Vec3(101f, 100f, 30f), 1f))
        sounds.tick(here, world)
        now += SoundScene.ONE_SHOT_PATIENCE_MS + 1
        assets.ready += a
        sounds.tick(here, world)
        assertTrue("a bang that arrives long after the event is worse than none", backend.plays().isEmpty())
    }

    @Test fun aTriggeredSoundOutOfEarshotIsDiscarded() {
        assets.ready += a
        sounds.onEvent(SoundEvent.Trigger(a, UUID.randomUUID(), UUID.randomUUID(), Vec3(250f, 250f, 30f), 1f))
        sounds.tick(here, world)
        sounds.tick(Listener(Vec3(250f, 249f, 30f)), world) // we walk up to where it went off
        assertTrue(backend.plays().isEmpty())
    }

    @Test fun twoTriggersOfTheSameSoundBothPlay() {
        assets.ready += a
        repeat(2) { sounds.onEvent(SoundEvent.Trigger(a, UUID.randomUUID(), UUID.randomUUID(), Vec3(101f, 100f, 30f), 1f)) }
        sounds.tick(here, world)
        assertEquals(2, backend.plays().size)
        assertEquals(2, backend.plays().map { it.channel }.toSet().size)
    }

    // ---- attached-sound messages ---------------------------------------------------------------

    @Test fun anAttachedSoundMessagePlaysAtTheObjectsPosition() {
        assets.ready += a
        put(ObjectSpec(5, position = Vec3(104f, 100f, 30f)))
        sounds.onEvent(SoundEvent.Attached(a, fullId(5), 0.7f, SoundFlags.LOOP))
        sounds.tick(here, world)
        val p = backend.plays().single()
        assertTrue(p.loop)
        assertEquals(SpatialAudio.spatialize(here, Vec3(104f, 100f, 30f), 0.7f).left, p.left, 1e-5f)
    }

    @Test fun anAttachedStopMessageStopsIt() {
        assets.ready += a
        put(ObjectSpec(5, position = Vec3(104f, 100f, 30f)))
        sounds.onEvent(SoundEvent.Attached(a, fullId(5), 1f, SoundFlags.LOOP))
        sounds.tick(here, world)
        sounds.onEvent(SoundEvent.Attached(a, fullId(5), 1f, SoundFlags.STOP))
        sounds.tick(here, world)
        assertEquals(0, sounds.activeChannels)
    }

    @Test fun anAttachedSoundForAnObjectNotYetSeenWaitsForIt() {
        assets.ready += a
        val future = UUID(0x1234, 6) // the id ObjectSpec(6) will get
        sounds.onEvent(SoundEvent.Attached(a, future, 1f, SoundFlags.LOOP))
        sounds.tick(here, world)
        assertTrue(backend.plays().isEmpty())
        put(ObjectSpec(6, position = Vec3(103f, 100f, 30f)))
        sounds.tick(here, world)
        assertEquals(1, backend.plays().size)
    }

    @Test fun aGainChangeAdjustsAPlayingSound() {
        assets.ready += a
        emitter(1, 102f, 100f, loop(a))
        sounds.tick(here, world)
        val full = backend.plays().single().left
        backend.clear()
        sounds.onEvent(SoundEvent.GainChange(fullId(1), 0.25f))
        sounds.tick(here, world)
        assertEquals(full * 0.25f, backend.calls.single().left, 1e-5f)
    }

    @Test fun preloadRequestsTheSoundsWithoutPlayingThem() {
        sounds.onEvent(SoundEvent.Preload(listOf(a, b)))
        assertEquals(listOf(a, b), assets.requested)
        sounds.tick(here, world)
        assertTrue(backend.calls.isEmpty())
    }

    // ---- limits and controls -------------------------------------------------------------------

    @Test fun onlyTheLoudestSoundsGetChannels() {
        assets.ready += listOf(a, b, c)
        sounds.maxChannels = 2
        emitter(1, 110f, 100f, loop(a)) // 10 m
        emitter(2, 103f, 100f, loop(b)) // 3 m
        emitter(3, 106f, 100f, loop(c)) // 6 m
        sounds.tick(here, world)
        assertEquals(setOf(b, c), backend.plays().map { it.soundId }.toSet())
        // walk next to the first: it displaces the quietest
        backend.clear()
        sounds.tick(Listener(Vec3(109f, 100f, 30f)), world)
        assertEquals(setOf(a), backend.plays().map { it.soundId }.toSet())
        assertEquals(1, backend.stops().size)
        assertEquals(2, sounds.activeChannels)
    }

    @Test fun masterVolumeScalesEverythingAndZeroSilences() {
        assets.ready += a
        emitter(1, 102f, 100f, loop(a))
        sounds.masterVolume = 0.5f
        sounds.tick(here, world)
        val half = backend.plays().single().left
        assertEquals(SpatialAudio.spatialize(here, Vec3(102f, 100f, 30f), 1f).left * 0.5f, half, 1e-5f)
        sounds.masterVolume = 0f
        sounds.tick(here, world)
        assertEquals(0, sounds.activeChannels)
    }

    @Test fun disablingStopsEverythingAndEnablingResumesLoops() {
        assets.ready += a
        emitter(1, 102f, 100f, loop(a))
        sounds.tick(here, world)
        sounds.enabled = false
        sounds.tick(here, world)
        assertEquals(0, sounds.activeChannels)
        backend.clear(); sounds.enabled = true
        sounds.tick(here, world)
        assertEquals(1, backend.plays().size)
    }

    @Test fun stopAllSilencesAndForgets() {
        assets.ready += a
        emitter(1, 102f, 100f, loop(a))
        sounds.onEvent(SoundEvent.Trigger(a, UUID.randomUUID(), UUID.randomUUID(), Vec3(101f, 100f, 30f), 1f))
        sounds.tick(here, world)
        sounds.stopAll()
        assertEquals(0, sounds.activeChannels)
        backend.clear()
        world.clear()
        sounds.tick(here, world)
        assertTrue("a trigger from before stopAll must not play later", backend.plays().isEmpty())
    }

    @Test fun aFinishedChannelNumberFromTheBackendIsIgnoredIfUnknown() {
        sounds.onChannelFinished(12345) // must not throw
        assertEquals(0, sounds.activeChannels)
    }
}
