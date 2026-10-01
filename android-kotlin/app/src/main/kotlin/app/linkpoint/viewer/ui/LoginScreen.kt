package app.linkpoint.viewer.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import app.linkpoint.core.ViewerIdentity
import app.linkpoint.core.login.Grid
import app.linkpoint.viewer.LoginUi
import app.linkpoint.viewer.ViewerHost

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(host: ViewerHost) {
    val prefs = host.prefs
    val ui by host.loginUi.collectAsState()
    var grid by remember { mutableStateOf(Grid.byKey(prefs.gridKey)) }
    var name by remember { mutableStateOf(prefs.rememberedName) }
    var password by remember { mutableStateOf("") }
    var remember by remember { mutableStateOf(prefs.remember) }
    var start by remember { mutableStateOf(prefs.startLocation) }
    var mfa by remember { mutableStateOf("") }
    var menu by remember { mutableStateOf(false) }
    val working = ui is LoginUi.Working

    Column(
        Modifier.fillMaxSize().systemBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
    ) {
        Text("LINKPOINT", style = MaterialTheme.typography.headlineLarge, color = MaterialTheme.colorScheme.primary)
        Text(ViewerIdentity.IDENTITY, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(8.dp))

        ExposedDropdownMenuBox(expanded = menu, onExpandedChange = { menu = it }) {
            OutlinedTextField(
                value = grid.label, onValueChange = {}, readOnly = true, label = { Text("Grid") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(menu) },
                modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
            )
            ExposedDropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                for (g in Grid.ALL) DropdownMenuItem(text = { Text(g.label) }, onClick = { grid = g; menu = false })
            }
        }
        OutlinedTextField(name, { name = it }, label = { Text("Avatar name") }, singleLine = true, modifier = Modifier.fillMaxWidth(), enabled = !working)
        OutlinedTextField(
            password, { password = it }, label = { Text("Password") }, singleLine = true, enabled = !working,
            visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth(),
        )
        if (ui is LoginUi.NeedsMfa) {
            Text((ui as LoginUi.NeedsMfa).message, color = MaterialTheme.colorScheme.tertiary)
            OutlinedTextField(
                mfa, { mfa = it }, label = { Text("Authenticator code") }, singleLine = true, enabled = !working,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword), modifier = Modifier.fillMaxWidth(),
            )
        }
        var startMenu by remember { mutableStateOf(false) }
        val startLabel = when { start == "home" -> "Home"; start.startsWith("uri:") -> "Region: " + start.removePrefix("uri:").substringBefore('&'); else -> "Last location" }
        ExposedDropdownMenuBox(expanded = startMenu, onExpandedChange = { startMenu = it }) {
            OutlinedTextField(
                value = startLabel, onValueChange = {}, readOnly = true, label = { Text("Start at") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(startMenu) },
                modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
            )
            ExposedDropdownMenu(expanded = startMenu, onDismissRequest = { startMenu = false }) {
                DropdownMenuItem(text = { Text("Last location") }, onClick = { start = "last"; startMenu = false })
                DropdownMenuItem(text = { Text("Home") }, onClick = { start = "home"; startMenu = false })
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(remember, { remember = it })
            Text("Remember my name on this device")
        }
        when (val u = ui) {
            is LoginUi.Failed -> Text(u.message, color = MaterialTheme.colorScheme.error)
            else -> Unit
        }
        Button(
            onClick = { host.login(grid, name, password, remember, start, mfa) },
            enabled = !working && name.isNotBlank() && password.isNotEmpty(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (working) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Text("Log in")
        }
        Text(
            "Passwords are sent only to the grid's login service and are never stored.",
            style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
