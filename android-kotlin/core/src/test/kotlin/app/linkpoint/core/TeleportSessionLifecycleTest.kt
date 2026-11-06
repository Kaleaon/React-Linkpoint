package app.linkpoint.core

import app.linkpoint.core.model.TeleportPhase
import app.linkpoint.core.model.PendingOffer
import app.linkpoint.core.net.*
import java.util.UUID
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

class TeleportSessionLifecycleTest {

    private class DummyHttp : Http {
        override suspend fun post(url: String, body: ByteArray, contentType: String, headers: Map<String, String>, timeoutMs: Int): HttpResponse {
            return HttpResponse(200, ByteArray(0))
        }
        override suspend fun get(url: String, headers: Map<String, String>, timeoutMs: Int): HttpResponse {
            return HttpResponse(200, ByteArray(0))
        }
    }

    @Test
    fun manualTeleportLifecycleTransitionsThroughAllPhases() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val session = ViewerSession(DummyHttp(), scope)

        assertNull(session.teleportSession.value)

        // 1. Initiating
        session.startTeleportSession("Ahern")
        var current = session.teleportSession.value
        assertNotNull(current)
        assertEquals("Ahern", current?.destination)
        assertEquals(TeleportPhase.INITIATING, current?.phase)
        assertEquals(15, current?.stepPercent)
        assertTrue(current?.statusText?.contains("Ahern") == true)

        // 2. Contacting (TeleportStart)
        session.updateTeleportProgress(TeleportPhase.CONTACTING, 40, "Contacting destination region...")
        current = session.teleportSession.value
        assertEquals(TeleportPhase.CONTACTING, current?.phase)
        assertEquals(40, current?.stepPercent)

        // 3. Preparing (TeleportProgress)
        session.updateTeleportProgress(TeleportPhase.PREPARING, 65, "Preparing avatar transfer...")
        current = session.teleportSession.value
        assertEquals(TeleportPhase.PREPARING, current?.phase)
        assertEquals(65, current?.stepPercent)

        // 4. Arriving (TeleportFinish)
        session.updateTeleportProgress(TeleportPhase.ARRIVING, 90, "Arriving at destination...")
        current = session.teleportSession.value
        assertEquals(TeleportPhase.ARRIVING, current?.phase)
        assertEquals(90, current?.stepPercent)

        // 5. Completed
        session.completeTeleportSession("Ahern")
        current = session.teleportSession.value
        assertEquals(TeleportPhase.COMPLETED, current?.phase)
        assertEquals(100, current?.stepPercent)
        assertEquals("Arrived at destination", current?.statusText)

        scope.cancel()
    }

    @Test
    fun teleportFailureTransitionsToFailedStateWithError() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val session = ViewerSession(DummyHttp(), scope)

        session.startTeleportSession("Full Region")
        session.failTeleportSession("Target region is full")

        val current = session.teleportSession.value
        assertNotNull(current)
        assertEquals(TeleportPhase.FAILED, current?.phase)
        assertEquals("Target region is full", current?.error)
        assertTrue(current?.statusText?.contains("Target region is full") == true)

        // Cancel resets session
        session.cancelTeleportSession()
        assertNull(session.teleportSession.value)

        scope.cancel()
    }

    @Test
    fun retryTeleportRestartsTeleportSession() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val session = ViewerSession(DummyHttp(), scope)

        session.startTeleportSession("Retry Target")
        session.failTeleportSession("Connection lost")
        assertEquals(TeleportPhase.FAILED, session.teleportSession.value?.phase)

        session.retryTeleport()
        val retried = session.teleportSession.value
        assertNotNull(retried)
        assertEquals("Retry Target", retried?.destination)
        assertEquals(TeleportPhase.INITIATING, retried?.phase)

        scope.cancel()
    }
}
