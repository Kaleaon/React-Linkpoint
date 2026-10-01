package app.linkpoint.viewer.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import app.linkpoint.core.tools.Contact
import app.linkpoint.viewer.ViewerHost

@Composable
fun FriendsScreen(host: ViewerHost) {
    val friends by host.session.friends.collectAsState()
    val contacts by host.contacts.collectAsState()
    if (friends.isEmpty()) { Empty("The grid sent no friends list."); return }
    val sorted = friends.sortedWith(compareByDescending<app.linkpoint.core.model.Friend> { it.online == true }.thenBy { it.name ?: "~" })
    LazyColumn(Modifier.fillMaxSize()) {
        items(sorted, key = { it.id }) { f ->
            val saved = contacts.any { it.id == f.id.toString() }
            ListItem(
                headlineContent = { Text(f.name ?: "—") },
                supportingContent = { Text(when (f.online) { true -> "Online"; false -> "Offline"; null -> "Status unknown" }) },
                leadingContent = {
                    Box(Modifier.size(12.dp).clip(CircleShape).background(if (f.online == true) app.linkpoint.viewer.theme.LocalLinkpoint.current.ok else MaterialTheme.colorScheme.outlineVariant))
                },
                trailingContent = {
                    IconButton(enabled = !saved && f.name != null, onClick = {
                        val now = System.currentTimeMillis()
                        host.saveContact(Contact(f.id.toString(), f.name ?: return@IconButton, savedAt = now, updatedAt = now))
                    }) { Icon(Icons.Filled.PersonAdd, if (saved) "Saved to contacts" else "Save to contacts") }
                },
                modifier = Modifier.clickable(enabled = f.name != null) { host.imTarget.value = f.id to (f.name ?: "") },
            )
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        }
    }
}

@Composable
fun RadarScreen(host: ViewerHost) {
    val nearby by host.session.nearby.collectAsState()
    val region by host.session.region.collectAsState()
    Column(Modifier.fillMaxSize()) {
        // Plot: region is 256 m square; north up. Positions are the simulator's coarse locations (z in 4 m steps).
        val primary = MaterialTheme.colorScheme.primary
        val outline = MaterialTheme.colorScheme.outlineVariant
        val me = region?.position
        Canvas(Modifier.fillMaxWidth().aspectRatio(1f).padding(16.dp)) {
            drawRect(outline, style = androidx.compose.ui.graphics.drawscope.Stroke(2f))
            for (a in nearby) {
                val p = Offset(a.x / 256f * size.width, (1f - a.y / 256f) * size.height)
                drawCircle(primary, 7f, p)
            }
            me?.let { drawCircle(androidx.compose.ui.graphics.Color.White, 9f, Offset(it[0] / 256f * size.width, (1f - it[1] / 256f) * size.height)) }
        }
        Text("${nearby.size} nearby (this region)", Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.labelLarge)
        LazyColumn(Modifier.weight(1f)) {
            items(nearby, key = { it.id }) { a ->
                ListItem(
                    headlineContent = { Text(a.name ?: "—") },
                    supportingContent = { Text("x ${a.x}  y ${a.y}  z ≈ ${a.z}  ·  " + (a.distance?.let { "%.0f m".format(it) } ?: "— m")) },
                    modifier = Modifier.clickable(enabled = a.name != null) { host.imTarget.value = a.id to (a.name ?: "") },
                )
            }
        }
    }
}
