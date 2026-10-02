package app.linkpoint.core

import app.linkpoint.core.audio.OggInfo
import app.linkpoint.core.audio.SoundFetcher
import app.linkpoint.core.net.HttpResponse
import java.util.UUID
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

class SoundAssetTest {
    private val tone: ByteArray = javaClass.getResourceAsStream("/mock/tone.ogg")!!.readBytes() // 0.5 s, mono, 44.1 kHz Ogg Vorbis from ffmpeg

    // ---- OggInfo ---------------------------------------------------------------------------------

    @Test fun aRealOggVorbisFileIsDescribed() {
        val i = OggInfo.parse(tone)
        assertEquals(1, i.channels); assertEquals(44100, i.sampleRate)
        assertEquals(0.5f, i.durationSeconds, 0.03f)
        assertEquals(500L, i.durationMs.coerceIn(470L, 530L))
        assertTrue(i.nominalBitrate >= 0)
    }

    @Test fun aFileCutOffMidwayStillReportsWhatWasComplete() {
        val cut = tone.copyOf(tone.size - 200)
        val i = OggInfo.parse(cut)
        assertEquals(44100, i.sampleRate)
        assertTrue("shorter than the whole file", i.durationSeconds <= OggInfo.parse(tone).durationSeconds)
    }

    @Test fun nonOggDataIsRejected() {
        assertThrows(IllegalArgumentException::class.java) { OggInfo.parse(ByteArray(0)) }
        assertThrows(IllegalArgumentException::class.java) { OggInfo.parse(ByteArray(200) { 7 }) }
        assertThrows(IllegalArgumentException::class.java) { OggInfo.parse("RIFF....WAVEfmt ".toByteArray() + ByteArray(100)) } // a WAV
        assertThrows(IllegalArgumentException::class.java) { OggInfo.parse(tone.copyOf(20)) }
    }

    @Test fun oggThatIsNotVorbisIsRejected() {
        val opus = tone.copyOf()
        val bodyAt = 27 + (opus[26].toInt() and 0xFF)
        "OpusHea".toByteArray().copyInto(opus, bodyAt) // an Opus identification header where Vorbis' should be
        assertThrows(IllegalArgumentException::class.java) { OggInfo.parse(opus) }
    }

    @Test fun anImplausibleHeaderIsRejected() {
        val bad = tone.copyOf()
        val bodyAt = 27 + (bad[26].toInt() and 0xFF)
        bad[bodyAt + 11] = 0 // zero channels
        assertThrows(IllegalArgumentException::class.java) { OggInfo.parse(bad) }
    }

    // ---- SoundFetcher ----------------------------------------------------------------------------

    private val cap = "http://sim.test/ViewerAsset"
    private suspend fun waitFor(timeoutMs: Long = 3000, cond: () -> Boolean) { val end = System.currentTimeMillis() + timeoutMs; while (System.currentTimeMillis() < end) { if (cond()) return; delay(10) }; throw AssertionError("timed out") }

    @Test fun aSoundIsDownloadedThroughTheViewerAssetCapabilityAndChecked() = runBlocking {
        val http = FakeHttp { _, _ -> HttpResponse(200, tone) }
        val sc = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val f = SoundFetcher(http, sc, { cap })
        val id = UUID.randomUUID()
        assertFalse(f.isReady(id))
        f.request(id)
        waitFor { f.isReady(id) }
        val s = f.peek(id)!!
        assertArrayEquals(tone, s.bytes); assertEquals(44100, s.info.sampleRate)
        assertEquals("$cap?sound_id=$id", http.requests.single().first)
        sc.cancel()
    }

    @Test fun requestingRepeatedlyDownloadsOnce() = runBlocking {
        val http = FakeHttp { _, _ -> HttpResponse(200, tone) }
        val sc = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val f = SoundFetcher(http, sc, { cap })
        val id = UUID.randomUUID()
        repeat(50) { f.request(id) }
        waitFor { f.isReady(id) }
        repeat(50) { f.request(id) }
        assertEquals(1, http.requests.size)
        sc.cancel()
    }

    @Test fun withoutTheCapabilityNothingIsRequestedYet() = runBlocking {
        val http = FakeHttp { _, _ -> HttpResponse(200, tone) }
        val sc = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        var capability: String? = null
        val f = SoundFetcher(http, sc, { capability })
        val id = UUID.randomUUID()
        f.request(id); delay(100)
        assertTrue(http.requests.isEmpty()); assertFalse(f.isReady(id))
        capability = cap // the region's capabilities arrived
        f.request(id); waitFor { f.isReady(id) }
        sc.cancel()
    }

    @Test fun aMissingSoundIsAFailureNotRetriedTooSoonThenRetried() = runBlocking {
        var now = 0L
        var status = 404
        val http = FakeHttp { _, _ -> if (status == 200) HttpResponse(200, tone) else HttpResponse(status, ByteArray(0)) }
        val sc = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val f = SoundFetcher(http, sc, { cap }, retryAfterMs = 30_000, clock = { now })
        val id = UUID.randomUUID()
        f.request(id); waitFor { f.failure(id) != null }
        assertTrue(f.failure(id)!!.message!!.contains("404"))
        now += 10_000; f.request(id); delay(100)
        assertEquals("not retried before the wait is over", 1, http.requests.size)
        now += 25_000; status = 200
        f.request(id); waitFor { f.isReady(id) }
        assertEquals(2, http.requests.size); assertNull(f.failure(id))
        sc.cancel()
    }

    @Test fun somethingThatIsNotOggIsAFailure() = runBlocking {
        val http = FakeHttp { _, _ -> HttpResponse(200, "<html>nope</html>".toByteArray()) }
        val sc = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val f = SoundFetcher(http, sc, { cap })
        val id = UUID.randomUUID()
        f.request(id); waitFor { f.failure(id) != null }
        assertFalse(f.isReady(id))
        sc.cancel()
    }

    @Test fun anOversizedSoundIsRefused() = runBlocking {
        val http = FakeHttp { _, _ -> HttpResponse(200, tone) }
        val sc = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val f = SoundFetcher(http, sc, { cap }, maxBytesPerSound = tone.size - 1)
        val id = UUID.randomUUID()
        f.request(id); waitFor { f.failure(id) != null }
        assertTrue(f.failure(id)!!.message!!.contains("limit"))
        sc.cancel()
    }

    @Test fun theCacheEvictsTheLeastRecentlyUsedSound() = runBlocking {
        val http = FakeHttp { _, _ -> HttpResponse(200, tone) }
        val sc = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val f = SoundFetcher(http, sc, { cap }, maxCacheBytes = tone.size * 2L + 10)
        val a = UUID.randomUUID(); val b = UUID.randomUUID(); val c = UUID.randomUUID()
        f.request(a); waitFor { f.isReady(a) }
        f.request(b); waitFor { f.isReady(b) }
        assertNotNull(f.peek(a)) // touching a makes b the least recently used
        f.request(c); waitFor { f.isReady(c) }
        assertTrue("a was used most recently, so it stays", f.isReady(a))
        assertFalse("b is evicted", f.isReady(b))
        assertTrue(f.isReady(c))
        // an evicted sound is fetched again when wanted
        f.request(b); waitFor { f.isReady(b) }
        assertEquals(4, http.requests.size)
        sc.cancel()
    }

    @Test fun clearForgetsEverything() = runBlocking {
        val http = FakeHttp { _, _ -> HttpResponse(200, tone) }
        val sc = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val f = SoundFetcher(http, sc, { cap })
        val id = UUID.randomUUID()
        f.request(id); waitFor { f.isReady(id) }
        f.clear()
        assertFalse(f.isReady(id))
        sc.cancel()
    }
}
