package app.linkpoint.viewer.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.linkpoint.core.model.ChatEntry
import app.linkpoint.core.model.ChatKind
import app.linkpoint.viewer.ViewerHost
import java.text.DateFormat
import java.util.Date
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(host: ViewerHost) {
    val chat by host.session.chat.collectAsState()
    val target by host.imTarget.collectAsState()
    var mode by remember { mutableIntStateOf(0) }
    LaunchedEffect(target) { if (target != null) mode = 1 }

    Column(Modifier.fillMaxSize()) {
        SecondaryTabRow(selectedTabIndex = mode) {
            Tab(mode == 0, { mode = 0 }, text = { Text("Local") })
            Tab(mode == 1, { mode = 1 }, text = { Text("Messages") })
        }
        if (mode == 0) LocalChat(host, chat.filter { it.kind == ChatKind.LOCAL || it.kind == ChatKind.OBJECT_IM || it.kind == ChatKind.SYSTEM })
        else Messages(host, chat.filter { it.kind == ChatKind.IM }, target)
    }
}

@Composable
private fun LocalChat(host: ViewerHost, lines: List<ChatEntry>) {
    var text by remember { mutableStateOf("") }
    var shout by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize()) {
        Transcript(lines, Modifier.weight(1f))
        Composer(text, { text = it }, "Say something nearby") {
            host.session.sendChat(text, if (shout) 2 else 1)
            text = ""
        }
        Row(Modifier.padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Switch(shout, { shout = it }); Spacer(Modifier.width(8.dp)); Text("Shout", style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun Messages(host: ViewerHost, ims: List<ChatEntry>, target: Pair<UUID, String>?) {
    var openId by remember { mutableStateOf<UUID?>(null) }
    var openName by remember { mutableStateOf("") }
    LaunchedEffect(target) { target?.let { openId = it.first; openName = it.second; host.imTarget.value = null } }

    val id = openId
    if (id == null) {
        val convos = ims.groupBy { it.sessionId }.values.map { it.last() }.sortedByDescending { it.timestampMs }
        if (convos.isEmpty()) { Empty("No messages yet. Open someone from People to start one."); return }
        LazyColumn(Modifier.fillMaxSize()) {
            items(convos, key = { it.sessionId!! }) { last ->
                val other = last.fromId
                val name = ims.lastOrNull { it.sessionId == last.sessionId && !it.outgoing }?.fromName ?: last.fromName
                ListItem(
                    headlineContent = { Text(name, fontWeight = FontWeight.SemiBold) },
                    supportingContent = { Text(last.text, maxLines = 1) },
                    modifier = Modifier.clickable { openId = other; openName = name },
                )
            }
        }
        return
    }
    val me = host.session.selfId
    val sid = me?.let { app.linkpoint.core.net.Messages.imSessionId(it, id) }
    val lines = ims.filter { it.sessionId == sid }
    var text by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton({ openId = null }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") }
            Text(openName, style = MaterialTheme.typography.titleMedium)
        }
        Transcript(lines, Modifier.weight(1f))
        Composer(text, { text = it }, "Message $openName") { host.session.sendInstantMessage(id, text); text = "" }
    }
}

@Composable
private fun Transcript(lines: List<ChatEntry>, modifier: Modifier) {
    val state = rememberLazyListState()
    LaunchedEffect(lines.size) { if (lines.isNotEmpty()) state.animateScrollToItem(lines.lastIndex) }
    if (lines.isEmpty()) { Box(modifier) { Empty("Nothing yet.") }; return }
    LazyColumn(modifier.fillMaxWidth(), state = state, contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        items(lines, key = { it.id }) { e ->
            val time = DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(e.timestampMs))
            Column {
                Row {
                    Text(e.fromName, fontWeight = FontWeight.Bold, color = if (e.outgoing) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.tertiary)
                    Spacer(Modifier.width(8.dp))
                    Text(time, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(
                    if (e.kind == ChatKind.LOCAL && e.chatType == 0) "(whispers) ${e.text}" else if (e.kind == ChatKind.LOCAL && e.chatType == 2) "(shouts) ${e.text}" else e.text,
                )
            }
        }
    }
}

@Composable
private fun Composer(text: String, onText: (String) -> Unit, hint: String, onSend: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
        OutlinedTextField(text, onText, Modifier.weight(1f), placeholder = { Text(hint) }, maxLines = 4)
        IconButton(onClick = onSend, enabled = text.isNotBlank()) { Icon(Icons.AutoMirrored.Filled.Send, "Send") }
    }
}

@Composable
fun Empty(message: String) {
    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
