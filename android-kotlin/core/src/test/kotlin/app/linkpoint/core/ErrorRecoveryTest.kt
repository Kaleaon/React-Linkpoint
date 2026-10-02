package app.linkpoint.core

import app.linkpoint.core.net.BasicNetworkMonitor
import app.linkpoint.core.net.ErrorRecoveryManager
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.atomic.AtomicInteger

@OptIn(ExperimentalCoroutinesApi::class)
class ErrorRecoveryTest {

    @Test
    fun testTelemetrySanitization() {
        val raw = mapOf(
            "username" to "ResidentOne",
            "password" to "Secret123",
            "token" to "auth-token-xyz",
            "mfaHash" to "hash-value",
            "publicVal" to "hello"
        )

        val sanitized = ErrorRecoveryManager.sanitizeMap(raw)

        assertEquals("ResidentOne", sanitized["username"])
        assertEquals("[REDACTED]", sanitized["password"])
        assertEquals("[REDACTED]", sanitized["token"])
        assertEquals("[REDACTED]", sanitized["mfaHash"])
        assertEquals("hello", sanitized["publicVal"])
    }

    @Test
    fun testNetworkStatusLogging() = runTest {
        val monitor = BasicNetworkMonitor(true)
        val manager = ErrorRecoveryManager(monitor, backgroundScope)

        assertTrue(manager.isOnline.value)

        manager.setOnlineStatus(false)
        testScheduler.advanceUntilIdle()
        assertFalse(manager.isOnline.value)
        val logs = manager.telemetryLogs.value
        assertTrue("Expected NET_DISCONNECTED log, got: $logs", logs.any { it.code == "NET_DISCONNECTED" })

        manager.setOnlineStatus(true)
        testScheduler.advanceUntilIdle()
        assertTrue(manager.isOnline.value)
        assertTrue("Expected NET_RESTORED log", manager.telemetryLogs.value.any { it.code == "NET_RESTORED" })
    }

    @Test
    fun testExponentialBackoffAndMaxRetriesExhaustion() = runTest {
        val monitor = BasicNetworkMonitor(true)
        val manager = ErrorRecoveryManager(monitor, backgroundScope)
        val attempts = AtomicInteger(0)

        manager.enqueueRetry("api", "FAIL_OP", "Always failing task", maxRetries = 3) {
            attempts.incrementAndGet()
            throw RuntimeException("Backend failure")
        }

        testScheduler.advanceUntilIdle()
        println("ATTEMPTS RESULT: ${attempts.get()}")
        assertEquals(3, attempts.get())
        val activeError = manager.activeError.value
        assertNotNull(activeError)
        assertEquals("FAIL_OP", activeError?.code)
        assertEquals(3, activeError?.attempts)
    }

    @Test
    fun testAutoRecoveryOnNetworkRestored() = runTest {
        val monitor = BasicNetworkMonitor(false)
        val manager = ErrorRecoveryManager(monitor, backgroundScope)

        val executed = AtomicInteger(0)
        manager.enqueueRetry("net", "SYNC_DATA", "Syncing chat history") {
            executed.incrementAndGet()
        }

        testScheduler.advanceUntilIdle()
        assertEquals(0, executed.get())

        // Reconnect network
        manager.setOnlineStatus(true)
        testScheduler.advanceUntilIdle()

        assertEquals(1, executed.get())
    }
}

