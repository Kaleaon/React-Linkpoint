package app.linkpoint.viewer.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.linkpoint.core.model.AvatarProfile
import app.linkpoint.core.model.InventoryItem
import app.linkpoint.core.scene.PCode
import app.linkpoint.core.scene.SculptKind
import app.linkpoint.viewer.R
import app.linkpoint.viewer.ViewerHost
import app.linkpoint.viewer.ui.components.LinkpointLoadingLayout
import app.linkpoint.viewer.ui.components.LinkpointLoadingState
import java.util.UUID

private fun assetTypeName(type: Int) = when (type) {
    0 -> "Texture"; 1 -> "Sound"; 2 -> "Calling card"; 3 -> "Landmark"; 5 -> "Clothing"; 6 -> "Object"; 7 -> "Notecard"
    10 -> "Script"; 13 -> "Body part"; 20 -> "Animation"; 21 -> "Gesture"; 49 -> "Mesh"; 56 -> "Settings"; else -> "Item ($type)"
}

@Composable
fun InventoryScreen(host: ViewerHost) {
    val inv by host.session.inventory.collectAsState()
    var path by remember { mutableStateOf<List<UUID>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    val root = inv.rootId
    if (root == null) { Empty("The grid sent no inventory."); return }
    val current = path.lastOrNull() ?: root
    val defaultLoadError = stringResource(R.string.inventory_load_failed)

    // Fetch a folder's contents the first time it is opened.
    LaunchedEffect(current) {
        if (current in inv.loaded) return@LaunchedEffect
        loading = true; error = null
        try { host.session.fetchInventoryFolder(current) } catch (e: Exception) { error = e.message ?: defaultLoadError }
        loading = false
    }

    val folders = inv.children(current)
    val items = inv.items[current].orEmpty()
    val totalCount = folders.size + items.size
    val isLoaded = current in inv.loaded && !loading && error == null

    Column(Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(end = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (path.isNotEmpty()) IconButton({ path = path.dropLast(1) }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Up") }
            Text(
                text = inv.folders[current]?.name ?: "Inventory",
                style = MaterialTheme.typography.titleMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(start = 8.dp).weight(1f, fill = false),
            )
            if (loading) {
                LinkpointLoadingState(
                    modifier = Modifier.padding(start = 8.dp),
                    layout = LinkpointLoadingLayout.Inline,
                    size = 16.dp,
                    label = stringResource(R.string.loading_folder_contents),
                )
            } else if (isLoaded) {
                val countAnnouncement = pluralStringResource(R.plurals.inventory_folder_item_count, totalCount, totalCount)
                Text(
                    text = countAnnouncement,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .padding(start = 12.dp)
                        .semantics {
                            liveRegion = LiveRegionMode.Polite
                            contentDescription = countAnnouncement
                        },
                )
            }
        }
        error?.let { errText ->
            Text(
                text = errText,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier
                    .padding(horizontal = 16.dp)
                    .semantics { liveRegion = LiveRegionMode.Polite },
            )
        }
        if (folders.isEmpty() && items.isEmpty() && !loading && error == null) { Empty(stringResource(R.string.inventory_folder_empty)); return@Column }
        LazyColumn(Modifier.fillMaxSize()) {
            items(folders, key = { it.id }) { f ->
                ListItem(
                    headlineContent = { Text(f.name) }, leadingContent = { Icon(Icons.Filled.Folder, null) },
                    modifier = Modifier.clickable { path = path + f.id },
                )
            }
            items(items, key = { it.id }) { i -> ItemRow(i) }
        }
    }
}

@Composable
private fun ItemRow(i: InventoryItem) {
    ListItem(headlineContent = { Text(i.name) }, supportingContent = { Text(assetTypeName(i.assetType) + if (i.description.isNotBlank()) " · ${i.description}" else "") })
}

@Composable
fun GroupsScreen(host: ViewerHost) {
    val groups by host.session.groups.collectAsState()
    if (groups.isEmpty()) { Empty("The grid has not sent your groups (yet)."); return }
    LazyColumn(Modifier.fillMaxSize()) {
        items(groups, key = { it.id }) { g ->
            ListItem(headlineContent = { Text(g.name) }, supportingContent = { Text(if (g.acceptNotices) "Receives group notices" else "Notices off") })
        }
    }
}

@Composable
fun ParcelScreen(host: ViewerHost) {
    val parcel by host.session.parcel.collectAsState()
    val region by host.session.region.collectAsState()
    val p = parcel
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("Region: ${region?.name ?: "—"}", style = MaterialTheme.typography.titleSmall)
        if (p == null) { Text("Waiting for parcel data from the region.", color = MaterialTheme.colorScheme.onSurfaceVariant); return@Column }
        Text(p.name.ifBlank { "Unnamed parcel" }, style = MaterialTheme.typography.titleLarge)
        if (p.description.isNotBlank()) Text(p.description)
        Text("Area: ${p.areaSqm} m²")
        Text("Prims: ${p.totalPrims ?: "—"} of ${p.maxPrims ?: "—"}")
        Text("Owner: ${p.ownerId ?: "—"}", style = MaterialTheme.typography.labelSmall)
        if (p.musicUrl.isNotBlank()) Text("Music stream: ${p.musicUrl}")
        if (p.mediaUrl.isNotBlank()) Text("Media: ${p.mediaUrl}")
    }
}

@Composable
fun ObjectsScreen(host: ViewerHost) {
    val region by host.session.region.collectAsState()
    var objects by remember { mutableStateOf(host.session.scene.snapshot()) }
    LaunchedEffect(Unit) { while (true) { objects = host.session.scene.snapshot(); kotlinx.coroutines.delay(1000) } }
    val me = region?.position
    val rows = objects.filter { !it.isAvatar }.map { o ->
        val wt = host.session.scene.worldTransform(o)?.first
        val d = if (wt != null && me != null) Math.sqrt(((wt.x - me[0]) * (wt.x - me[0]) + (wt.y - me[1]) * (wt.y - me[1]) + (wt.z - me[2]) * (wt.z - me[2])).toDouble()) else null
        o to d
    }.sortedBy { it.second ?: Double.MAX_VALUE }
    Column(Modifier.fillMaxSize()) {
        Text(
            "${objects.size} objects · ${objects.count { it.isAvatar }} avatars · ${objects.count { it.particles != null }} with particles · ${objects.count { it.sculpt?.kind == SculptKind.MESH }} meshes · ${objects.count { it.sculpt?.kind == SculptKind.SCULPT }} sculpts",
            Modifier.padding(12.dp), style = MaterialTheme.typography.labelMedium,
        )
        LazyColumn(Modifier.fillMaxSize()) {
            items(rows.take(300), key = { it.first.localId }) { (o, d) ->
                val kind = when { o.sculpt?.kind == SculptKind.MESH -> "Mesh"; o.sculpt != null -> "Sculpt"; o.pcode == PCode.PRIM -> "Prim"; else -> "Object (pcode ${o.pcode})" }
                ListItem(
                    headlineContent = { Text("$kind #${o.localId}" + (o.text?.let { " “$it”" } ?: "")) },
                    supportingContent = { Text("size %.1f × %.1f × %.1f m".format(o.scale.x, o.scale.y, o.scale.z) + (d?.let { " · %.0f m away".format(it) } ?: "")) },
                )
            }
        }
    }
}

/** A resident's profile as the grid reports it. */
@Composable
fun ProfileDialog(host: ViewerHost, id: UUID, name: String, onDismiss: () -> Unit) {
    var profile by remember { mutableStateOf<AvatarProfile?>(null) }
    var failed by remember { mutableStateOf(false) }
    LaunchedEffect(id) {
        profile = null
        failed = false
        profile = try { host.session.requestProfile(id) } catch (_: Exception) { null }
        failed = profile == null
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = { TextButton(onDismiss) { Text("Close") } },
        title = { Text(name) },
        text = {
            val p = profile
            when {
                p != null -> Column(
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    if (p.bornOn.isNotBlank()) Text("Born: ${p.bornOn}", style = MaterialTheme.typography.labelMedium)
                    Text(p.about.ifBlank { "No profile text." })
                    if (p.profileUrl.isNotBlank()) Text(p.profileUrl, style = MaterialTheme.typography.labelSmall)
                }
                failed -> Text(
                    text = stringResource(R.string.profile_load_failed),
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
                else -> LinkpointLoadingState(
                    modifier = Modifier.fillMaxWidth(),
                    layout = LinkpointLoadingLayout.Block,
                    label = stringResource(R.string.loading_profile),
                )
            }
        },
    )
}

/** Pending teleport offers and friend requests, answered with one tap. */
@Composable
fun OffersBanner(host: ViewerHost) {
    val offers by host.session.offers.collectAsState()
    val first = offers.firstOrNull() ?: return
    Surface(color = MaterialTheme.colorScheme.primaryContainer, contentColor = MaterialTheme.colorScheme.onPrimaryContainer) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
            val what = if (first is app.linkpoint.core.model.PendingOffer.Lure) "teleport offer" else "friend request"
            Text("${first.fromName}: $what" + if (first.text.isNotBlank()) " — ${first.text}" else "", style = MaterialTheme.typography.bodyMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button({ host.session.acceptOffer(first) }) { Text("Accept") }
                OutlinedButton({ host.session.declineOffer(first) }) { Text("Decline") }
            }
        }
    }
}
