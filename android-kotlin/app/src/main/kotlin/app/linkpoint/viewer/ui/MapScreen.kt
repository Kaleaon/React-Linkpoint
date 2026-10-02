package app.linkpoint.viewer.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.border
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import app.linkpoint.core.tools.MapTiles
import app.linkpoint.viewer.ViewerHost
import coil3.compose.AsyncImage
import kotlinx.coroutines.launch

@Composable
fun MapScreen(host: ViewerHost) {
    val region by host.session.region.collectAsState()
    val scope = rememberCoroutineScope()
    val snack = remember { SnackbarHostState() }
    var destination by remember { mutableStateOf("") }
    val r = region
    Column(Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (r == null || r.handle == 0L) { Empty("Waiting for region data."); return@Column }
        Text("${r.name ?: "—"} · ${MapTiles.ratingName(r.access)} · region ${r.gridX}, ${r.gridY}", style = MaterialTheme.typography.titleSmall)
        val tiles = remember(r.gridX, r.gridY) { MapTiles.around(r.gridX, r.gridY, 2) }
        // Tiles come from Second Life's map server; other grids advertise none, so those show open water.
        LazyVerticalGrid(GridCells.Fixed(5), Modifier.fillMaxWidth().aspectRatio(1f), userScrollEnabled = false) {
            items(tiles, key = { "${it.x},${it.y}" }) { t ->
                Box(Modifier.aspectRatio(1f).background(Color(MapTiles.WATER_COLOR)).then(if (t.center) Modifier.border(2.dp, MaterialTheme.colorScheme.primary) else Modifier)) {
                    AsyncImage(MapTiles.tileUrl(t.x, t.y), contentDescription = "Region ${t.x}, ${t.y}", contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(destination, { destination = it }, Modifier.weight(1f), label = { Text("Teleport to region") }, singleLine = true)
            Button(enabled = destination.isNotBlank(), onClick = {
                scope.launch {
                    try { host.session.teleport(destination) } catch (e: Exception) { snack.showSnackbar(e.message ?: "Teleport failed") }
                }
            }) { Text("Go") }
        }
        OutlinedButton(onClick = { host.session.teleportHome() }) { Text("Teleport home") }
        SnackbarHost(snack)
    }
}
