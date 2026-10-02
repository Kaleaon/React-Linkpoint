package app.linkpoint.viewer

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import app.linkpoint.viewer.ui.LinkpointApp as Root

class MainActivity : ComponentActivity() {
    private val askNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (Build.VERSION.SDK_INT >= 33) askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        val host = (application as app.linkpoint.viewer.LinkpointApp).host
        if (BuildConfig.DEBUG) handleDebugIntent(host, intent)
        setContent { Root(host) }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        if (BuildConfig.DEBUG) handleDebugIntent((application as app.linkpoint.viewer.LinkpointApp).host, intent)
    }

    /**
     * Debug builds can be driven from adb for smoke tests:
     * `am start -n app.linkpoint.viewer/.MainActivity --es debug_grid mock --es debug_name "Mock Resident" --es debug_password pw --es debug_tab WORLD`
     */
    private fun handleDebugIntent(host: ViewerHost, i: android.content.Intent) {
        i.getStringExtra("debug_tab")?.let { host.debugTab.value = it }
        val grid = i.getStringExtra("debug_grid") ?: return
        host.login(
            app.linkpoint.core.login.Grid.byKey(grid), i.getStringExtra("debug_name") ?: return,
            i.getStringExtra("debug_password") ?: return, false, "last", "",
        )
    }
}
