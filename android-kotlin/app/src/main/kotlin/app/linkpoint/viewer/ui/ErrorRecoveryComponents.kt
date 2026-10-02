package app.linkpoint.viewer.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import app.linkpoint.viewer.ViewerHost
import kotlinx.coroutines.launch

@Composable
fun ErrorRecoveryBanner(host: ViewerHost) {
    val isOnline by host.errorRecoveryManager.isOnline.collectAsState()
    val isRetrying by host.errorRecoveryManager.isRetrying.collectAsState()
    val scope = rememberCoroutineScope()

    if (isOnline && !isRetrying) return

    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = if (!isOnline) Color(0xFF991B1B) else Color(0xFF9A3412),
        contentColor = Color.White,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .background(
                            color = if (!isOnline) Color(0xFFEF4444) else Color(0xFFF97316),
                            shape = RoundedCornerShape(50%)
                        )
                )
                Text(
                    text = if (!isOnline) "Network disconnected. Reconnecting automatically…" else "Retrying failed requests…",
                    style = MaterialTheme.typography.bodySmall.copy(color = Color.White, fontWeight = FontWeight.Medium),
                )
            }

            if (isOnline) {
                TextButton(
                    onClick = { scope.launch { host.errorRecoveryManager.processRetryQueue() } },
                    colors = ButtonDefaults.textButtonColors(contentColor = Color.White)
                ) {
                    Text("Retry", fontSize = 12.sp)
                }
            }
        }
    }
}

@Composable
fun ErrorRecoveryModal(host: ViewerHost, onNavigateFallback: (Tab) -> Unit) {
    val activeError by host.errorRecoveryManager.activeError.collectAsState()
    val telemetryLogs by host.errorRecoveryManager.telemetryLogs.collectAsState()
    var showTelemetry by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    val err = activeError ?: return

    Dialog(onDismissRequest = { host.errorRecoveryManager.clearActiveError() }) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1F2937)),
        ) {
            Column(
                modifier = Modifier
                    .padding(20.dp)
                    .fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "Service Recovery Gateway",
                    style = MaterialTheme.typography.titleMedium.copy(color = Color.White, fontWeight = FontWeight.Bold),
                )

                Text(
                    text = "Diagnostic Code: ${err.code} (${err.category})",
                    style = MaterialTheme.typography.labelMedium.copy(color = Color(0xFFFCA5A5)),
                )

                Surface(
                    color = Color(0xFF111827),
                    shape = RoundedCornerShape(6.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(
                            text = err.message,
                            style = MaterialTheme.typography.bodyMedium.copy(color = Color(0xFFF3F4F6)),
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "Attempts made: ${err.attempts} / 3",
                            style = MaterialTheme.typography.labelSmall.copy(color = Color(0xFF9CA3AF)),
                        )
                    }
                }

                TextButton(onClick = { showTelemetry = !showTelemetry }) {
                    Text(
                        text = if (showTelemetry) "Hide Diagnostic Telemetry" else "View Diagnostic Telemetry",
                        color = Color(0xFF60A5FA),
                        fontSize = 12.sp,
                    )
                }

                if (showTelemetry) {
                    Surface(
                        color = Color.Black,
                        shape = RoundedCornerShape(4.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 140.dp)
                    ) {
                        LazyColumn(modifier = Modifier.padding(8.dp)) {
                            items(telemetryLogs) { log ->
                                Text(
                                    text = "[${log.code}] ${log.message}${log.details?.let { " $it" } ?: ""}",
                                    style = MaterialTheme.typography.bodySmall.copy(
                                        color = Color(0xFF10B981),
                                        fontFamily = FontFamily.Monospace,
                                        fontSize = 10.sp,
                                    ),
                                )
                            }
                        }
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Button(
                        onClick = {
                            host.errorRecoveryManager.clearActiveError()
                            scope.launch { host.errorRecoveryManager.processRetryQueue() }
                        },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2563EB))
                    ) {
                        Text("Retry")
                    }

                    Button(
                        onClick = {
                            host.errorRecoveryManager.clearActiveError()
                            onNavigateFallback(Tab.CHAT)
                        },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981))
                    ) {
                        Text("Safe Home")
                    }
                }

                OutlinedButton(
                    onClick = {
                        host.errorRecoveryManager.clearActiveError()
                        host.logout()
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Return to Login", color = Color.White)
                }
            }
        }
    }
}
