package app.linkpoint.viewer

import android.app.Application
import android.content.Intent
import android.os.Build
import androidx.core.content.ContextCompat
import app.linkpoint.core.ViewerSession
import app.linkpoint.core.login.*
import app.linkpoint.core.model.ConnectionState
import app.linkpoint.core.net.BasicNetworkMonitor
import app.linkpoint.core.net.ErrorRecoveryManager
import app.linkpoint.core.net.UrlConnectionHttp
import app.linkpoint.core.image.TextureFetcher
import app.linkpoint.core.scene.MeshFetcher
import app.linkpoint.core.scene.SculptFetcher
import app.linkpoint.core.audio.SoundFetcher
import app.linkpoint.viewer.audio.AudioSettings
import app.linkpoint.viewer.audio.ParcelAudioPlayer
import app.linkpoint.viewer.audio.SoundController
import app.linkpoint.core.tools.Contact
import app.linkpoint.viewer.data.Prefs
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

/** What the login screen shows after an attempt. */
sealed class LoginUi {
    data object Idle : LoginUi()
    data object Working : LoginUi()
    data class NeedsMfa(val message: String) : LoginUi()
    data class Failed(val message: String) : LoginUi()
}

/**
 * Application-scoped owner of the live session, so a rotation or a backgrounded activity does not
 * drop the connection. A foreground service keeps the process alive while logged in.
 */
class ViewerHost(private val app: Application) {
    val prefs = Prefs(app)
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val networkMonitor = BasicNetworkMonitor()
    val errorRecoveryManager = ErrorRecoveryManager(networkMonitor, scope)
    private val http = UrlConnectionHttp()
    val session = ViewerSession(http, scope)
    val textures = TextureFetcher(http, scope, { session.capabilities.value["GetTexture"] })
    val sculpts = SculptFetcher(http, scope, { session.capabilities.value["GetTexture"] })
    val meshes = MeshFetcher(http, scope, { session.capabilities.value.let { it["GetMesh2"] ?: it["GetMesh"] } })
    /** Sound assets come from the region's ViewerAsset capability. */
    val sounds = SoundFetcher(http, scope, { session.capabilities.value["ViewerAsset"] })
    val audioSettings = MutableStateFlow(AudioSettings.load(prefs))
    /** Places object sounds in 3D around the avatar. */
    val soundController = SoundController(app, session, sounds, scope, audioSettings)
    /** The parcel's music stream and audio-only media. */
    val parcelAudio = ParcelAudioPlayer(session, scope, audioSettings)
    val loginUi = MutableStateFlow<LoginUi>(LoginUi.Idle)
    val contacts = MutableStateFlow(prefs.loadContacts())
    val palette = MutableStateFlow(prefs.paletteKey)
    /** Debug builds only: a tab to switch to (set by an intent extra). */
    val debugTab = MutableStateFlow<String?>(null)
    /** Set when the resident picks someone to message; the chat screen opens that conversation. */
    val imTarget = MutableStateFlow<Pair<java.util.UUID, String>?>(null)

    fun login(grid: Grid, name: String, password: String, remember: Boolean, start: String, mfaToken: String) {
        if (loginUi.value is LoginUi.Working || session.state.value != ConnectionState.DISCONNECTED) return
        loginUi.value = LoginUi.Working
        scope.launch {
            try {
                val req = LoginRequest(
                    grid = grid, username = name, password = password, start = start, mfaToken = mfaToken,
                    mfaHash = prefs.mfaHash(grid.key, name), deviceId = prefs.deviceId,
                    platformVersion = "Android ${Build.VERSION.RELEASE}",
                )
                val result = LoginClient.login(http, req)
                result.mfaHash?.let { if (remember) prefs.saveMfaHash(grid.key, name, it) }
                prefs.gridKey = grid.key; prefs.remember = remember; prefs.startLocation = start
                prefs.rememberedName = if (remember) name else ""
                session.connect(result)
                loginUi.value = LoginUi.Idle
                withContext(Dispatchers.Main) { ContextCompat.startForegroundService(app, Intent(app, ViewerService::class.java)) }
            } catch (e: LoginFailure) {
                loginUi.value = if (e.mfaRequired) LoginUi.NeedsMfa(e.message) else LoginUi.Failed(e.message)
            } catch (e: IllegalArgumentException) {
                loginUi.value = LoginUi.Failed(e.message ?: "Check the details you entered")
            } catch (e: Exception) {
                loginUi.value = LoginUi.Failed("Could not connect: ${e.message ?: e::class.simpleName}")
            }
        }
    }

    fun logout() {
        scope.launch {
            session.logout()
            app.stopService(Intent(app, ViewerService::class.java))
        }
    }

    fun setAudio(change: (AudioSettings) -> AudioSettings) {
        val n = change(audioSettings.value)
        prefs.soundOn = n.soundOn; prefs.soundVolume = n.soundVolume; prefs.musicOn = n.musicOn; prefs.musicVolume = n.musicVolume
        audioSettings.value = n
    }

    fun setPalette(key: String) { prefs.paletteKey = key; palette.value = key }

    fun saveContact(c: Contact) {
        val list = contacts.value.filterNot { it.id == c.id } + c
        contacts.value = list; prefs.saveContacts(list)
    }

    fun deleteContact(id: String) {
        val list = contacts.value.filterNot { it.id == id }
        contacts.value = list; prefs.saveContacts(list)
    }
}
