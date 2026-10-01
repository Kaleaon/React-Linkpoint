package app.linkpoint.viewer.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.linkpoint.core.model.ConnectionState
import app.linkpoint.core.model.ViewerNotice
import app.linkpoint.viewer.ViewerHost
import app.linkpoint.viewer.theme.LinkpointTheme
import app.linkpoint.viewer.theme.Palettes

enum class Tab(val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector) {
    CHAT("Chat", Icons.Filled.Chat),
    PEOPLE("People", Icons.Filled.People),
    RADAR("Radar", Icons.Filled.Radar),
    MAP("Map", Icons.Filled.Map),
    MORE("More", Icons.Filled.MoreHoriz),
}

@Composable
fun LinkpointApp(host: ViewerHost) {
    val paletteKey by host.palette.collectAsState()
    LinkpointTheme(Palettes.byKey(paletteKey)) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            val state by host.session.state.collectAsState()
            if (state == ConnectionState.DISCONNECTED) LoginScreen(host) else Main(host, state)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Main(host: ViewerHost, state: ConnectionState) {
    val session = host.session
    var tab by remember { mutableStateOf(Tab.CHAT) }
    val region by session.region.collectAsState()
    val balance by session.balance.collectAsState()
    val snack = remember { SnackbarHostState() }
    val imTarget by host.imTarget.collectAsState()
    LaunchedEffect(imTarget) { if (imTarget != null) tab = Tab.CHAT }

    LaunchedEffect(session) {
        session.notices.collect { n ->
            snack.showSnackbar(
                when (n) {
                    is ViewerNotice.Teleport -> n.text
                    is ViewerNotice.Disconnected -> "Disconnected: ${n.reason}"
                    is ViewerNotice.Error -> n.text
                },
            )
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(region?.name ?: if (state == ConnectionState.CONNECTED) "—" else "Connecting…", style = MaterialTheme.typography.titleMedium)
                        Text(session.selfName ?: "", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                },
                actions = {
                    Text(balance?.let { "L$ $it" } ?: "L$ —", Modifier.padding(end = 4.dp), style = MaterialTheme.typography.labelLarge)
                    IconButton(onClick = host::logout) { Icon(Icons.Filled.Logout, contentDescription = "Log out") }
                },
            )
        },
        snackbarHost = { SnackbarHost(snack) },
        bottomBar = {
            NavigationBar {
                for (t in Tab.entries) NavigationBarItem(selected = tab == t, onClick = { tab = t }, icon = { Icon(t.icon, null) }, label = { Text(t.label) })
            }
        },
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            when (tab) {
                Tab.CHAT -> ChatScreen(host)
                Tab.PEOPLE -> FriendsScreen(host)
                Tab.RADAR -> RadarScreen(host)
                Tab.MAP -> MapScreen(host)
                Tab.MORE -> MoreScreen(host)
            }
        }
    }
}
