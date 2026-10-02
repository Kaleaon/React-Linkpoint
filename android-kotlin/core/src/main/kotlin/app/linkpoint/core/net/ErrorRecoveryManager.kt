package app.linkpoint.core.net

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.UUID

data class TelemetryEntry(
    val id: String = UUID.randomUUID().toString(),
    val timestamp: String = Instant.now().toString(),
    val category: String,
    val code: String,
    val message: String,
    val details: Map<String, String>? = null,
)

data class DiagnosticError(
    val code: String,
    val category: String,
    val message: String,
    val attempts: Int,
    val timestamp: String = Instant.now().toString(),
    val details: Map<String, String>? = null,
)

data class RetryTask(
    val id: String = UUID.randomUUID().toString(),
    val category: String,
    val code: String,
    val description: String,
    val maxRetries: Int = 3,
    var attempts: Int = 0,
    val action: suspend () -> Unit,
)

class ErrorRecoveryManager(
    val networkMonitor: NetworkMonitor,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
) {
    private val _isRetrying = MutableStateFlow(false)
    val isRetrying: StateFlow<Boolean> = _isRetrying.asStateFlow()

    private val _activeError = MutableStateFlow<DiagnosticError?>(null)
    val activeError: StateFlow<DiagnosticError?> = _activeError.asStateFlow()

    private val _telemetryLogs = MutableStateFlow<List<TelemetryEntry>>(emptyList())
    val telemetryLogs: StateFlow<List<TelemetryEntry>> = _telemetryLogs.asStateFlow()

    private val retryQueue = mutableListOf<RetryTask>()

    companion object {
        private val SENSITIVE_KEYS = setOf(
            "password", "pass", "token", "mfatoken", "mfahash", "auth",
            "authorization", "cookie", "secret", "credential", "credentials", "email", "ssn"
        )

        fun sanitizeMap(data: Map<String, Any?>?): Map<String, String> {
            if (data == null) return emptyMap()
            val sanitized = mutableMapOf<String, String>()
            for ((key, value) in data) {
                val lowerKey = key.lowercase()
                if (SENSITIVE_KEYS.contains(lowerKey) || lowerKey.contains("pass") || lowerKey.contains("token") || lowerKey.contains("secret")) {
                    sanitized[key] = "[REDACTED]"
                } else {
                    sanitized[key] = value?.toString() ?: "null"
                }
            }
            return sanitized
        }
    }

    private val _isOnline = MutableStateFlow(networkMonitor.isOnline.value)
    val isOnline: StateFlow<Boolean> = _isOnline.asStateFlow()

    init {
        scope.launch {
            networkMonitor.isOnline.collect { online ->
                setOnlineStatus(online)
            }
        }
    }

    suspend fun setOnlineStatus(online: Boolean) {
        val previousOnline = _isOnline.value
        if (previousOnline == online && _telemetryLogs.value.isNotEmpty()) return

        _isOnline.value = online
        if (!previousOnline && online) {
            logTelemetry("network", "NET_RESTORED", "Network connectivity restored")
            processRetryQueue()
        } else if (previousOnline && !online) {
            logTelemetry("network", "NET_DISCONNECTED", "Network connectivity lost")
        }
    }

    fun logTelemetry(category: String, code: String, message: String, details: Map<String, Any?>? = null): TelemetryEntry {
        val entry = TelemetryEntry(
            category = category,
            code = code,
            message = message,
            details = sanitizeMap(details),
        )
        val current = _telemetryLogs.value.toMutableList()
        current.add(0, entry)
        if (current.size > 100) current.removeAt(current.size - 1)
        _telemetryLogs.value = current
        return entry
    }

    suspend fun enqueueRetry(
        category: String,
        code: String,
        description: String,
        maxRetries: Int = 3,
        action: suspend () -> Unit,
    ) {
        val cappedMax = minOf(maxRetries, 3)
        val task = RetryTask(
            category = category,
            code = code,
            description = description,
            maxRetries = cappedMax,
            action = action,
        )

        synchronized(retryQueue) {
            retryQueue.add(task)
        }

        logTelemetry(category, code, "Queued task: $description")
        executeTask(task)
    }

    fun enqueueRetryAsync(
        category: String,
        code: String,
        description: String,
        maxRetries: Int = 3,
        action: suspend () -> Unit,
    ) {
        scope.launch {
            enqueueRetry(category, code, description, maxRetries, action)
        }
    }

    private suspend fun executeTask(task: RetryTask) {
        if (!_isOnline.value) {
            logTelemetry(task.category, "NET_OFFLINE", "Cannot execute ${task.description}: offline")
            return
        }

        _isRetrying.value = true

        while (task.attempts < task.maxRetries) {
            task.attempts++
            val backoffMs = minOf(1000L * (1 shl (task.attempts - 1)), 4000L)

            logTelemetry(
                task.category,
                "${task.code}_ATTEMPT",
                "Executing ${task.description} (attempt ${task.attempts}/${task.maxRetries})",
                mapOf("attempt" to task.attempts, "backoffMs" to backoffMs)
            )

            try {
                task.action()
                synchronized(retryQueue) { retryQueue.remove(task) }
                _isRetrying.value = synchronized(retryQueue) { retryQueue.isNotEmpty() }
                logTelemetry(task.category, "${task.code}_SUCCESS", "Task ${task.description} succeeded")

                if (_activeError.value?.code == task.code) {
                    _activeError.value = null
                }
                return
            } catch (e: Exception) {
                logTelemetry(
                    task.category,
                    "${task.code}_FAILURE",
                    "Attempt ${task.attempts} failed for ${task.description}: ${e.message}",
                    mapOf("error" to (e.message ?: e::class.java.simpleName))
                )

                if (task.attempts < task.maxRetries) {
                    delay(backoffMs)
                }
            }
        }

        synchronized(retryQueue) { retryQueue.remove(task) }
        _isRetrying.value = synchronized(retryQueue) { retryQueue.isNotEmpty() }

        val error = DiagnosticError(
            code = task.code,
            category = task.category,
            message = "Operation failed after ${task.maxRetries} retries",
            attempts = task.attempts,
            details = mapOf("description" to task.description)
        )

        _activeError.value = error
        logTelemetry(task.category, "${task.code}_EXHAUSTED", "Max retries reached for ${task.description}")
    }

    suspend fun processRetryQueue() {
        val tasks = synchronized(retryQueue) { retryQueue.toList() }
        if (tasks.isEmpty() || !_isOnline.value) return

        for (task in tasks) {
            if (task.attempts < task.maxRetries) {
                executeTask(task)
            }
        }
    }

    fun clearActiveError() {
        _activeError.value = null
    }

    fun clearTelemetry() {
        _telemetryLogs.value = emptyList()
    }
}
