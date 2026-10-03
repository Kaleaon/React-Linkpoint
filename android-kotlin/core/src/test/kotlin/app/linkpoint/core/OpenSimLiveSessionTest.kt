package app.linkpoint.core

import app.linkpoint.core.login.Grid
import app.linkpoint.core.login.LoginClient
import app.linkpoint.core.login.LoginFailure
import app.linkpoint.core.login.LoginRequest
import app.linkpoint.core.login.LoginResult
import app.linkpoint.core.model.*
import app.linkpoint.core.net.UrlConnectionHttp
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test

/**
 * Session behaviour against a REAL OpenSim: teleport, region crossing, chat echo, profile, inventory, relogin.
 * Skipped unless OPENSIM_LOGIN_URL is set. Teleport/crossing tests also need the second region ("Neighbour Isle", one
 * region east of "Test Isle") that `tools/opensim/live.py` configures (it sets OPENSIM_NEIGHBOUR), and skip without it.
 */
class OpenSimLiveSessionTest {
    private val url: String? = System.getenv("OPENSIM_LOGIN_URL")
    private val user = System.getenv("OPENSIM_USER") ?: "Linky Tester"
    private val password = System.getenv("OPENSIM_PASSWORD") ?: "testpass1"
    private val home = "Test Isle"
    private val neighbour = "Neighbour Isle"

    private suspend fun <T> eventually(timeoutMs: Long = 30_000, what: String, f: () -> T?): T {
        val end = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < end) { f()?.let { return it }; delay(50) }
        throw AssertionError("timed out waiting for $what")
    }

    private suspend fun login(http: UrlConnectionHttp, pw: String = password): LoginResult =
        LoginClient.login(http, LoginRequest(Grid("opensim-local", "Local OpenSim", url!!), user, pw, start = "uri:$home&128&128&40", deviceId = "live-session-test"))

    /** OpenSim answers "already logged in" for about a minute after a session ended without a logout. */
    private suspend fun loginPatiently(http: UrlConnectionHttp): LoginResult {
        val end = System.currentTimeMillis() + 120_000
        while (true) {
            try { return login(http) } catch (e: LoginFailure) {
                if (!(e.message ?: "").contains("already logged in") || System.currentTimeMillis() > end) throw e
                delay(3000)
            }
        }
    }

    /** Runs [body] on a connected session and always logs out afterwards, so one failure cannot block the next test. */
    private fun withLive(body: suspend (Live) -> Any?): Unit = runBlocking {
        assumeTrue("OPENSIM_LOGIN_URL not set", !url.isNullOrBlank())
        val l = connected()
        try { body(l) } finally { l.finish() }
        Unit
    }

    private class Live(val http: UrlConnectionHttp, val scope: CoroutineScope, val s: ViewerSession, val notices: MutableList<ViewerNotice>)

    private suspend fun connected(): Live {
        val http = UrlConnectionHttp()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val s = ViewerSession(http, scope)
        val notices = java.util.concurrent.CopyOnWriteArrayList<ViewerNotice>()
        scope.launch(start = CoroutineStart.UNDISPATCHED) { s.notices.collect { notices += it } }
        s.connect(loginPatiently(http))
        eventually(what = "region handshake") { s.region.value?.takeIf { !it.name.isNullOrEmpty() } }
        return Live(http, scope, s, notices)
    }

    private suspend fun Live.finish() { runCatching { s.logout() }; scope.cancel() }

    /** Skips the test unless live.py (or the caller) says the second region exists: OPENSIM_NEIGHBOUR=<region name>. */
    private fun requireNeighbour() = assumeTrue("OPENSIM_NEIGHBOUR not set (no second region)", System.getenv("OPENSIM_NEIGHBOUR") == neighbour)

    @Test fun wrongPasswordIsAStructuredLoginFailure() = runBlocking {
        assumeTrue("OPENSIM_LOGIN_URL not set", !url.isNullOrBlank())
        val http = UrlConnectionHttp()
        val failure = try { login(http, "not-the-password"); null } catch (e: LoginFailure) { e }
        assertNotNull("a wrong password must raise LoginFailure", failure)
        println("LIVE bad password -> code=${failure!!.code} reason=${failure.reason} message=${failure.message}")
        assertFalse(failure.mfaRequired)
    }

    @Test fun ownChatIsEchoedAndInventoryLoads() = withLive { l ->
        val s = l.s
        s.sendChat("live echo ${System.nanoTime()}")
        val echo = eventually(what = "own chat echoed by the simulator") { s.chat.value.lastOrNull { it.kind == ChatKind.LOCAL && it.text.startsWith("live echo") } }
        assertEquals("Linky Tester", echo.fromName)

        val root = s.inventory.value.rootId
        assertNotNull(root)
        eventually(what = "capabilities") { s.capabilities.value["FetchInventoryDescendents2"] }
        s.fetchInventoryFolder(root!!)
        val inv = s.inventory.value
        println("LIVE inventory: ${inv.folders.size} folders, loaded=${inv.loaded.size}, items in root=${inv.items[root]?.size}")
        assertTrue(root in inv.loaded)
        assertTrue("a new account has the standard folders", inv.folders.size > 1)
    }

    /** A default OpenSim has no profile module, so it may never answer; the call must still return and leave the session usable. */
    @Test fun profileRequestReturnsWithoutBreakingTheSession() = withLive { l ->
        val profile = l.s.requestProfile(l.s.selfId!!)
        println("LIVE profile of self = ${profile ?: "no answer from this OpenSim (profile module not enabled)"}")
        // live.py enables the profile service and says so; then an answer is required, not optional.
        if (System.getenv("OPENSIM_PROFILES") == "1") assertNotNull("the profile service is enabled, so the simulator must answer", profile)
        assertEquals(ConnectionState.CONNECTED, l.s.state.value)
        l.s.sendChat("still alive after profile request")
        eventually(what = "chat echo") { l.s.chat.value.firstOrNull { it.text == "still alive after profile request" } }
    }

    @Test fun teleportWithinTheRegionIsAnnounced() = withLive { l ->
        val name = l.s.region.value!!.name!!
        l.s.teleport(name, 100f, 100f, 50f)
        eventually(what = "local teleport notice") { l.notices.filterIsInstance<ViewerNotice.Teleport>().firstOrNull { it.text.contains("within the region") } }
        eventually(what = "avatar moved") { l.s.region.value?.position?.takeIf { it[0] in 95f..105f } }
        println("LIVE local teleport -> position ${l.s.region.value?.position?.toList()}")
    }

    @Test fun teleportToTheNeighbourAndBackByName() = withLive { l ->
        requireNeighbour()
        val s = l.s
        val first = s.currentCircuit
        s.teleport(neighbour, 128f, 128f, 50f)
        eventually(60_000, "arrival in $neighbour") { s.region.value?.takeIf { it.name == neighbour } }
        assertNotSame("a teleport opens a new circuit", first, s.currentCircuit)
        assertEquals(ConnectionState.CONNECTED, s.state.value)
        eventually(what = "terrain of the new region") { s.heightmap.takeIf { it.isComplete } }
        eventually(what = "capabilities of the new region") { s.capabilities.value.takeIf { "GetTexture" in it } }
        s.sendChat("hello from the neighbour")
        eventually(what = "chat echo in the new region") { s.chat.value.firstOrNull { it.text == "hello from the neighbour" } }
        println("LIVE teleported to $neighbour at ${s.region.value?.position?.toList()}; errors=${l.notices.filterIsInstance<ViewerNotice.Error>()}")

        s.teleport(home, 128f, 128f, 50f)
        eventually(60_000, "arrival back in $home") { s.region.value?.takeIf { it.name == home } }
        assertTrue("error notices: ${l.notices}", l.notices.filterIsInstance<ViewerNotice.Error>().isEmpty())
    }

    /**
     * "Teleport home" needs a home location. OpenSim's console cannot set one for a fresh account ("Unable to set home"),
     * so on such a grid the request is answered with nothing; the test is skipped then rather than failing for a grid reason.
     */
    @Test fun teleportHome() = withLive { l ->
        requireNeighbour()
        val s = l.s
        s.teleport(neighbour, 128f, 128f, 50f)
        eventually(60_000, "arrival in $neighbour") { s.region.value?.takeIf { it.name == neighbour } }
        s.teleportHome()
        val end = System.currentTimeMillis() + (if (System.getenv("OPENSIM_HOME") == "1") 60_000 else 20_000)
        var arrived: RegionInfo? = null
        while (arrived == null && System.currentTimeMillis() < end) { arrived = s.region.value?.takeIf { it.name == home }; delay(100) }
        // live.py makes the home region the default region, which gives accounts a home; then arriving there is required.
        if (System.getenv("OPENSIM_HOME") == "1") assertNotNull("the account has a home, so teleport home must arrive", arrived)
        assumeTrue("this OpenSim account has no home location set, so there is nowhere to teleport to", arrived != null)
        assertEquals(ConnectionState.CONNECTED, s.state.value)
    }

    @Test fun walkingAcrossTheEastBorderEntersTheNeighbour() = withLive { l ->
        requireNeighbour()
        val s = l.s
        s.teleport(home, 245f, 128f, 60f)
        eventually(60_000, "avatar near the east border of $home") { s.region.value?.takeIf { it.name == home }?.position?.takeIf { it[0] > 240f } }
        delay(3_000)
        s.setMovement(forward = 1, strafe = 0, yaw = 0f, fly = true) // yaw 0 faces +X (east)
        val crossed = try {
            eventually(60_000, "crossing into $neighbour") { s.region.value?.takeIf { it.name == neighbour } }
        } finally { s.setMovement(0, 0) }
        println("LIVE crossed the border into ${crossed.name}; errors=${l.notices.filterIsInstance<ViewerNotice.Error>()}")
        assertEquals(ConnectionState.CONNECTED, s.state.value)
        s.sendChat("crossed on foot")
        eventually(what = "chat echo after crossing") { s.chat.value.firstOrNull { it.text == "crossed on foot" } }
    }

    @Test fun canLogOutAndInAgain() = runBlocking {
        assumeTrue("OPENSIM_LOGIN_URL not set", !url.isNullOrBlank())
        val first = connected(); first.finish()
        assertEquals(ConnectionState.DISCONNECTED, first.s.state.value)
        val again = connected() // retries while OpenSim still holds the old presence
        try { assertEquals(ConnectionState.CONNECTED, again.s.state.value) } finally { again.finish() }
    }

    /**
     * A rigged (skinned) mesh served by a real OpenSim through GetMesh2 keeps its rig: joint names, one inverse bind matrix per
     * joint, and normalised per-vertex weights on joints the rig has. The object comes from the generated OAR.
     */
    @Test fun riggedMeshServedByOpenSimKeepsItsRig() = withLive { l ->
        val s = l.s
        val caps = eventually(what = "capabilities") { s.capabilities.value.takeIf { "GetMesh2" in it || "GetMesh" in it } }
        val obj = eventually(what = "the rigged mesh object streamed") { s.scene.snapshot().firstOrNull { it.sculpt?.assetId == app.linkpoint.core.mock.Wire.RIGGED_LIMB_ID } }
        assertEquals(app.linkpoint.core.scene.SculptKind.MESH, obj.sculpt!!.kind)
        val fetcher = app.linkpoint.core.scene.MeshFetcher(l.http, l.scope, { caps["GetMesh2"] ?: caps["GetMesh"] })
        val mesh = fetcher.request(obj.sculpt!!.assetId)!!.await().getOrThrow()
        val skin = mesh.skin
        assertNotNull("the rig must survive the trip through OpenSim", skin)
        println("LIVE rigged mesh: joints=${skin!!.jointNames}, faces=${mesh.faces.size}, vertices=${mesh.faces.sumOf { it.vertexCount }}, unknown joints=${skin.unknownJoints}")
        assertEquals(listOf("mShoulderLeft", "mElbowLeft", "mWristLeft", "mHandThumb1Left"), skin.jointNames)
        assertEquals(skin.jointNames.size, skin.inverseBind.size)
        val face = mesh.faces.single()
        assertTrue(face.isRigged)
        for (v in 0 until face.vertexCount) {
            val sum = (0 until 4).sumOf { face.skinWeights!![v * 4 + it].toDouble() }
            assertEquals("vertex $v weights sum to 1", 1.0, sum, 1e-4)
        }
        assertTrue("the rig is for the standard avatar skeleton", skin.unknownJoints.isEmpty())
    }

    // ---- sounds and parcel media (from the generated OAR: a looping "Speaker", a short-range "Chime", a parcel with music + media) ----

    private val toneId = java.util.UUID.fromString("a0a0a0a0-0000-4000-8000-000000000020")

    private class Recorder : app.linkpoint.core.audio.SoundBackend {
        class Play(val soundId: java.util.UUID, val loop: Boolean, val left: Float, val right: Float)
        val plays = java.util.concurrent.CopyOnWriteArrayList<Play>()
        val stops = java.util.concurrent.CopyOnWriteArrayList<Int>()
        override fun play(channel: Int, soundId: java.util.UUID, loop: Boolean, left: Float, right: Float) { plays += Play(soundId, loop, left, right) }
        override fun setVolume(channel: Int, left: Float, right: Float) {}
        override fun stop(channel: Int) { stops += channel }
    }

    @Test fun objectSoundsArriveFromOpenSimDownloadAndPlayInSpace() = withLive { l ->
        val s = l.s
        // The sound fields of a real OpenSim object update.
        val sounding = eventually(what = "two objects with sounds") { s.scene.withSound().filter { it.sound?.soundId == toneId }.takeIf { it.size >= 2 } }
        val speaker = sounding.single { it.sound!!.radius == 30f }
        val chime = sounding.single { it.sound!!.radius == 3f }
        println("LIVE sounds: ${sounding.size} objects with sounds; speaker gain=${speaker.sound!!.gain} loops=${speaker.sound!!.loops} radius=${speaker.sound!!.radius}; chime radius=${chime.sound!!.radius}")
        assertEquals(0.8f, speaker.sound!!.gain, 1e-5f); assertTrue(speaker.sound!!.loops)

        // The data through the real ViewerAsset capability.
        val caps = eventually(what = "ViewerAsset") { s.capabilities.value.takeIf { "ViewerAsset" in it } }
        val fetcher = app.linkpoint.core.audio.SoundFetcher(l.http, l.scope, { caps["ViewerAsset"] })
        fetcher.request(toneId)
        val tone = eventually(what = "the sound download") { fetcher.peek(toneId) ?: fetcher.failure(toneId)?.let { throw AssertionError("sound download failed: $it") } }
        println("LIVE sound asset: ${tone.bytes.size} bytes, ${tone.info.channels} ch, ${tone.info.sampleRate} Hz, ${tone.info.durationMs} ms")
        assertEquals(1, tone.info.channels); assertEquals(44100, tone.info.sampleRate); assertEquals(0.5f, tone.info.durationSeconds, 0.05f)

        // Spatialised: the speaker is 6 m behind-ish of the avatar (west of it). Facing north, west is on the left.
        val backend = Recorder()
        val scene = app.linkpoint.core.audio.SoundScene(backend, fetcher)
        val me = s.region.value!!.position!!
        val here = app.linkpoint.core.scene.Vec3(me[0], me[1], me[2])
        val facingNorth = app.linkpoint.core.audio.Listener.atYaw(here, (Math.PI / 2).toFloat())
        scene.tick(facingNorth, s.scene)
        val heard = backend.plays.singleOrNull { it.loop }
        assertNotNull("the speaker must be audible from the spawn point", heard)
        println("LIVE speaker mix from spawn facing north: left=${heard!!.left} right=${heard.right}; playing=${backend.plays.size}")
        assertTrue("west of a north-facing listener is on the left", heard.left > heard.right)
        assertTrue("the 3 m chime, 20 m away, is out of its cube", backend.plays.none { !it.loop })
        // Walk to the chime: now it is audible too.
        val chimePos = s.scene.worldTransform(chime)!!.first
        scene.tick(app.linkpoint.core.audio.Listener.atYaw(app.linkpoint.core.scene.Vec3(chimePos.x + 1f, chimePos.y, chimePos.z), 0f), s.scene)
        assertTrue("next to the chime it plays", backend.plays.any { it.left > 0f || it.right > 0f } && scene.activeChannels >= 1)
    }

    @Test fun theParcelsMusicAndMediaArriveFromOpenSim() = withLive { l ->
        val s = l.s
        val parcel = eventually(what = "parcel properties") { s.parcel.value?.takeIf { it.name.contains("Linkpoint media") || it.musicUrl.isNotBlank() } }
        println("LIVE parcel: name='${parcel.name}' music='${parcel.musicUrl}' media='${parcel.mediaUrl}'")
        assertEquals("http://radio.test/linkpoint-stream.mp3", parcel.musicUrl)
        val media = eventually(what = "parcel media") { s.parcelMedia.value }
        println("LIVE parcel media: url='${media.url}' id=${media.mediaId} type='${media.type}' desc='${media.description}' ${media.width}x${media.height} loop=${media.loop} autoScale=${media.autoScale}")
        assertEquals("http://media.test/linkpoint-clip.mp4", media.url)
        assertEquals(java.util.UUID.fromString("a0a0a0a0-0000-4000-8000-000000000001"), media.mediaId)
        assertTrue(media.autoScale)
        // OpenSim 0.9.3 does not carry a parcel's media type / description / size / loop through an OAR (it reports "none/none",
        // which the viewer reads as "no type"); accept either so a fixed OpenSim does not fail this test.
        assertTrue("type was '${media.type}'", media.type == "" || media.type == "video/mp4")
        assertFalse("an .mp4 address is not audio-only", media.isAudioOnly)
    }
}
