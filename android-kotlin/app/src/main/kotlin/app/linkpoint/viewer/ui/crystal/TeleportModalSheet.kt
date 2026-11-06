package app.linkpoint.viewer.ui.crystal

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Radio
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.linkpoint.core.ViewerSession
import app.linkpoint.core.model.TeleportPhase
import app.linkpoint.core.model.TeleportSessionState

data class TeleportMilestone(
    val key: String,
    val label: String,
    val minPercent: Int,
    val icon: ImageVector
)

val TELEPORT_MILESTONES = listOf(
    TeleportMilestone("initiating", "Resolve", 15, Icons.Filled.Place),
    TeleportMilestone("contacting", "Contact", 40, Icons.Filled.Radio),
    TeleportMilestone("preparing", "Prepare", 65, Icons.Filled.Description),
    TeleportMilestone("arriving", "Arrive", 90, Icons.Filled.Explore)
)

/**
 * Full-screen modal overlay for teleport sessions, providing visual parity with the web client
 * teleport modal dialog (`SystemDialog.jsx:L251-L289`).
 *
 * Displays the destination region name, animated crystal hero, branded progress bar,
 * four milestone stages (Resolve, Contact, Prepare, Arrive), failure error banners,
 * and error recovery controls (Retry, Retry Home, Cancel).
 */
@Composable
fun TeleportModalSheet(
    session: ViewerSession,
    modifier: Modifier = Modifier
) {
    val teleportState by session.teleportSession.collectAsState()
    val teleport = teleportState ?: return

    TeleportModalSheetContent(
        teleport = teleport,
        onRetry = { session.retryTeleport() },
        onRetryHome = { session.teleportHome() },
        onCancel = { session.cancelTeleportSession() },
        modifier = modifier
    )
}

@Composable
fun TeleportModalSheetContent(
    teleport: TeleportSessionState,
    onRetry: () -> Unit,
    onRetryHome: () -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier
) {
    val isFailed = teleport.phase == TeleportPhase.FAILED
    val percent = teleport.stepPercent.coerceIn(0, 100)
    val errColor = Color(0xFFEF4444)

    Dialog(
        onDismissRequest = onCancel,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = true,
            dismissOnClickOutside = false
        )
    ) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.68f)),
            contentAlignment = Alignment.BottomCenter
        ) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding(),
                shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
                color = MaterialTheme.colorScheme.surface,
                border = BorderStroke(2.dp, if (isFailed) errColor else MaterialTheme.colorScheme.primary)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 20.dp)
                        .verticalScroll(rememberScrollState()),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    // Top Bar: Icon + Status Header + CANCEL
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = if (isFailed) Icons.Filled.Warning else Icons.Filled.Explore,
                            contentDescription = null,
                            tint = if (isFailed) errColor else MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = if (isFailed) "TELEPORT FAILED" else "TELEPORTING",
                            style = MaterialTheme.typography.labelMedium.copy(
                                fontWeight = FontWeight.SemiBold,
                                letterSpacing = 2.sp,
                                color = if (isFailed) errColor else MaterialTheme.colorScheme.primary
                            )
                        )
                        Spacer(Modifier.weight(1f))
                        TextButton(
                            onClick = onCancel,
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
                        ) {
                            Text(
                                text = "CANCEL",
                                style = MaterialTheme.typography.labelSmall.copy(
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            )
                        }
                    }

                    Spacer(Modifier.height(8.dp))

                    // Destination Region Title
                    Text(
                        text = teleport.regionName ?: teleport.destination.ifBlank { "Destination" },
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(Modifier.height(16.dp))

                    // Teleport Crystal Hero Animation
                    TeleportCrystalHero(
                        stepPercent = percent.toFloat(),
                        phase = teleport.phase,
                        size = 120.dp
                    )

                    Spacer(Modifier.height(16.dp))

                    // Progress readout: status text + percent
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = teleport.statusText.ifBlank {
                                if (isFailed) "Teleport failed" else "Teleport in progress..."
                            },
                            style = MaterialTheme.typography.bodySmall.copy(
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            ),
                            modifier = Modifier.weight(1f, fill = false)
                        )
                        Text(
                            text = "$percent%",
                            style = MaterialTheme.typography.labelMedium.copy(
                                fontWeight = FontWeight.Bold,
                                color = if (isFailed) errColor else MaterialTheme.colorScheme.primary
                            )
                        )
                    }

                    Spacer(Modifier.height(6.dp))

                    // Branded Progress Bar
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(8.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant)
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxHeight()
                                .fillMaxWidth(fraction = (percent / 100f).coerceIn(0f, 1f))
                                .background(if (isFailed) errColor else MaterialTheme.colorScheme.primary)
                        )
                    }

                    Spacer(Modifier.height(16.dp))

                    // Four-stage Milestone Grid
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        for (stage in TELEPORT_MILESTONES) {
                            val reached = percent >= stage.minPercent
                            val borderColor = if (reached) {
                                if (isFailed) errColor else MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.outlineVariant
                            }
                            val itemBackground = if (reached) {
                                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                            } else {
                                Color.Transparent
                            }
                            val iconTint = if (reached) {
                                if (isFailed) errColor else MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                            }
                            val textTint = if (reached) {
                                MaterialTheme.colorScheme.onSurface
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                            }

                            Surface(
                                modifier = Modifier
                                    .weight(1f)
                                    .semantics { contentDescription = "Milestone ${stage.label}" },
                                shape = RoundedCornerShape(6.dp),
                                border = BorderStroke(1.dp, borderColor),
                                color = itemBackground
                            ) {
                                Column(
                                    modifier = Modifier
                                        .padding(vertical = 8.dp, horizontal = 2.dp)
                                        .fillMaxWidth(),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.Center
                                ) {
                                    Icon(
                                        imageVector = stage.icon,
                                        contentDescription = null,
                                        tint = iconTint,
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Spacer(Modifier.height(4.dp))
                                    Text(
                                        text = stage.label,
                                        style = MaterialTheme.typography.labelSmall.copy(
                                            fontWeight = FontWeight.SemiBold,
                                            fontSize = 10.sp,
                                            color = textTint
                                        ),
                                        textAlign = TextAlign.Center,
                                        maxLines = 1
                                    )
                                }
                            }
                        }
                    }

                    // Error Details Banner
                    val errorMessage = teleport.error
                    if (isFailed && !errorMessage.isNullOrBlank()) {
                        Spacer(Modifier.height(14.dp))
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(6.dp),
                            color = errColor.copy(alpha = 0.1f),
                            border = BorderStroke(1.dp, errColor)
                        ) {
                            Text(
                                text = errorMessage,
                                style = MaterialTheme.typography.bodyMedium.copy(
                                    color = errColor
                                ),
                                modifier = Modifier.padding(10.dp)
                            )
                        }
                    }

                    Spacer(Modifier.height(18.dp))

                    // Action Controls
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        if (isFailed) {
                            Button(
                                onClick = onRetry,
                                modifier = Modifier
                                    .weight(1f)
                                    .height(44.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = MaterialTheme.colorScheme.primary,
                                    contentColor = MaterialTheme.colorScheme.onPrimary
                                ),
                                shape = RoundedCornerShape(6.dp)
                            ) {
                                Text("RETRY", fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                            }
                        }
                        OutlinedButton(
                            onClick = onRetryHome,
                            modifier = Modifier
                                .weight(1f)
                                .height(44.dp),
                            shape = RoundedCornerShape(6.dp)
                        ) {
                            Text("RETRY HOME", fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                        }
                        OutlinedButton(
                            onClick = onCancel,
                            modifier = Modifier
                                .weight(1f)
                                .height(44.dp),
                            shape = RoundedCornerShape(6.dp)
                        ) {
                            Text("CANCEL", fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                        }
                    }
                }
            }
        }
    }
}
