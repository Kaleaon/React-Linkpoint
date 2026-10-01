package app.linkpoint.viewer.ui

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import app.linkpoint.core.ViewerIdentity
import app.linkpoint.core.tools.*
import app.linkpoint.viewer.ViewerHost
import app.linkpoint.viewer.theme.Palettes
import java.io.File
import java.time.*
import java.time.format.DateTimeParseException

private enum class MoreScreen(val label: String) { CONTACTS("Contacts"), CALENDAR("Calendar event (.ics)"), SETTINGS("Settings & colours"), DIAGNOSTICS("Diagnostics") }

@Composable
fun MoreScreen(host: ViewerHost) {
    var screen by remember { mutableStateOf<MoreScreen?>(null) }
    val s = screen
    if (s == null) {
        LazyColumn(Modifier.fillMaxSize()) {
            items(MoreScreen.entries.toList()) { m ->
                ListItem(headlineContent = { Text(m.label) }, modifier = Modifier.clickable { screen = m })
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            }
        }
        return
    }
    Column(Modifier.fillMaxSize()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton({ screen = null }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") }
            Text(s.label, style = MaterialTheme.typography.titleMedium)
        }
        when (s) {
            MoreScreen.CONTACTS -> ContactsScreen(host)
            MoreScreen.CALENDAR -> CalendarScreen()
            MoreScreen.SETTINGS -> SettingsScreen(host)
            MoreScreen.DIAGNOSTICS -> DiagnosticsScreen(host)
        }
    }
}

@Composable
private fun ContactsScreen(host: ViewerHost) {
    val contacts by host.contacts.collectAsState()
    var editing by remember { mutableStateOf<Contact?>(null) }
    val ctx = LocalContext.current
    if (contacts.isEmpty()) { Empty("Save friends from the People tab to keep them here."); return }
    val e = editing
    if (e != null) { ContactEditor(e, onSave = { host.saveContact(it); editing = null }, onCancel = { editing = null }); return }
    LazyColumn(Modifier.fillMaxSize()) {
        items(contacts.sortedBy { it.name.lowercase() }, key = { it.id }) { c ->
            ListItem(
                headlineContent = { Text(c.name) },
                supportingContent = { Text(listOf(c.note.takeIf { it.isNotBlank() }, c.links.joinToString(", ") { it.label }.takeIf { it.isNotBlank() }).filterNotNull().joinToString(" · ").ifBlank { "No note or links" }, maxLines = 2) },
                trailingContent = { IconButton({ host.deleteContact(c.id) }) { Icon(Icons.Filled.Delete, "Delete") } },
                modifier = Modifier.clickable { editing = c },
            )
            Row(Modifier.padding(start = 16.dp, bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for (l in c.links.filter { it.url != null }) AssistChip(onClick = {
                    // Only validated http(s) links are ever stored, so this cannot open anything else.
                    ctx.startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(l.url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }, label = { Text(l.label) })
            }
        }
    }
}

@Composable
private fun ContactEditor(c: Contact, onSave: (Contact) -> Unit, onCancel: () -> Unit) {
    var note by remember { mutableStateOf(c.note) }
    var links by remember { mutableStateOf(c.links) }
    var service by remember { mutableStateOf(LinkService.TELEGRAM) }
    var input by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(c.name, style = MaterialTheme.typography.titleLarge)
        OutlinedTextField(note, { note = it.take(Contacts.MAX_NOTE) }, label = { Text("Note") }, modifier = Modifier.fillMaxWidth())
        Text("Links", style = MaterialTheme.typography.labelLarge)
        for (l in links) Row(verticalAlignment = Alignment.CenterVertically) {
            Text("${l.service.name.lowercase()}: ${l.label}", Modifier.weight(1f))
            TextButton({ links = links - l }) { Text("Remove") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for (s in LinkService.entries) FilterChip(service == s, { service = s }, label = { Text(s.name.lowercase()) })
        }
        OutlinedTextField(input, { input = it; error = null }, label = { Text("Username, id or address") }, singleLine = true, isError = error != null, supportingText = { error?.let { Text(it) } }, modifier = Modifier.fillMaxWidth())
        OutlinedButton({
            when (val r = Contacts.normalizeLink(service, input)) {
                is LinkResult.Ok -> { links = links.filter { it.service != service } + r.link; input = "" }
                is LinkResult.Error -> error = r.message
            }
        }) { Text("Add link") }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button({ onSave(c.copy(note = note, links = links, updatedAt = System.currentTimeMillis())) }) { Text("Save") }
            TextButton(onCancel) { Text("Cancel") }
        }
    }
}

@Composable
private fun CalendarScreen() {
    val ctx = LocalContext.current
    var title by remember { mutableStateOf("") }
    var where by remember { mutableStateOf("") }
    var details by remember { mutableStateOf("") }
    var start by remember { mutableStateOf("") }
    var minutes by remember { mutableStateOf("60") }
    var error by remember { mutableStateOf<String?>(null) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Turn an event you read in a group notice into a calendar file for any calendar app.", style = MaterialTheme.typography.bodyMedium)
        OutlinedTextField(title, { title = it }, label = { Text("Title") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(start, { start = it; error = null }, label = { Text("Start (local, e.g. 2026-11-05 19:30)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(minutes, { minutes = it.filter(Char::isDigit).take(4) }, label = { Text("Length in minutes") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(where, { where = it }, label = { Text("Where (region / SLurl)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(details, { details = it }, label = { Text("Details") }, modifier = Modifier.fillMaxWidth())
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(enabled = title.isNotBlank() && start.isNotBlank(), onClick = {
            try {
                val startAt = LocalDateTime.parse(start.trim().replace(' ', 'T')).atZone(ZoneId.systemDefault()).toInstant()
                val len = minutes.toLongOrNull()?.takeIf { it > 0 } ?: throw IllegalArgumentException("Enter a length in minutes.")
                val ics = Ics.build(IcsEvent(java.util.UUID.randomUUID().toString() + "@linkpoint", title.trim(), startAt, startAt.plusSeconds(len * 60), details.ifBlank { null }, where.ifBlank { null }, reminders = listOf(15)))
                share(ctx, Ics.fileName(title), ics)
            } catch (e: DateTimeParseException) { error = "Use the form 2026-11-05 19:30."
            } catch (e: IllegalArgumentException) { error = e.message }
        }) { Text("Create and share .ics") }
    }
}

private fun share(ctx: Context, name: String, ics: String) {
    val dir = File(ctx.cacheDir, "shared").apply { mkdirs() }
    val file = File(dir, name).apply { writeText(ics) }
    val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", file)
    ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/calendar").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), "Save event").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}

@Composable
private fun SettingsScreen(host: ViewerHost) {
    val current by host.palette.collectAsState()
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Text("Viewer: ${ViewerIdentity.IDENTITY}", style = MaterialTheme.typography.labelLarge) }
        item { Text("Colour pack", style = MaterialTheme.typography.titleSmall) }
        items(Palettes.ALL, key = { it.key }) { p ->
            Row(Modifier.fillMaxWidth().clickable { host.setPalette(p.key) }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                RadioButton(current == p.key, { host.setPalette(p.key) })
                for (k in listOf("bg", "surf", "pri", "sec", "sec2")) Box(Modifier.size(18.dp).background(androidx.compose.ui.graphics.Color(p.c.getValue(k))))
                Column { Text(p.name); Text(p.note, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1) }
            }
        }
    }
}

@Composable
private fun DiagnosticsScreen(host: ViewerHost) {
    val s = host.session
    val state by s.state.collectAsState()
    val region by s.region.collectAsState()
    val caps by s.capabilities.collectAsState()
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("State: $state")
        Text("Viewer: ${ViewerIdentity.IDENTITY}")
        Text("Circuit: ${s.currentCircuit?.remote ?: "—"}")
        Text("Region: ${region?.name ?: "—"} (handle ${region?.handle ?: "—"})")
        Text("Capabilities: ${if (caps.isEmpty()) "none loaded" else caps.keys.sorted().joinToString()}")
    }
}
