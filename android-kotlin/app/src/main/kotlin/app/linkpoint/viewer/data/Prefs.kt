package app.linkpoint.viewer.data

import app.linkpoint.core.login.AccountKey
import android.content.Context
import app.linkpoint.core.tools.Contact
import app.linkpoint.core.tools.Contacts
import java.util.UUID

/** Small on-device settings store. Passwords are never saved; only the MFA device hash is, when asked. */
class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("linkpoint", Context.MODE_PRIVATE)

    var paletteKey: String
        get() = sp.getString("palette", "ink") ?: "ink"
        set(v) = sp.edit().putString("palette", v).apply()
    var gridKey: String
        get() = sp.getString("grid", "agni") ?: "agni"
        set(v) = sp.edit().putString("grid", v).apply()
    var rememberedName: String
        get() = sp.getString("name", "") ?: ""
        set(v) = sp.edit().putString("name", v).apply()
    var remember: Boolean
        get() = sp.getBoolean("remember", true)
        set(v) = sp.edit().putBoolean("remember", v).apply()
    var startLocation: String
        get() = sp.getString("start", "last") ?: "last"
        set(v) = sp.edit().putString("start", v).apply()

    // Sound and media. Defaults: everything on, effects a little under full so a loud sound does not startle.
    var soundOn: Boolean
        get() = sp.getBoolean("sound_on", true)
        set(v) = sp.edit().putBoolean("sound_on", v).apply()
    var soundVolume: Float
        get() = sp.getFloat("sound_volume", 0.8f)
        set(v) = sp.edit().putFloat("sound_volume", v.coerceIn(0f, 1f)).apply()
    var musicOn: Boolean
        get() = sp.getBoolean("music_on", true)
        set(v) = sp.edit().putBoolean("music_on", v).apply()
    var musicVolume: Float
        get() = sp.getFloat("music_volume", 0.6f)
        set(v) = sp.edit().putFloat("music_volume", v.coerceIn(0f, 1f)).apply()

    /** A random id for this install, hashed into the login's id0/mac fields. */
    val deviceId: String
        get() = sp.getString("device", null) ?: UUID.randomUUID().toString().also { sp.edit().putString("device", it).apply() }

    private val secrets = SecretStore(sp)
    fun mfaHash(grid: String, name: String): String = secrets.get("mfa:" + AccountKey.of(grid, name))
    fun saveMfaHash(grid: String, name: String, hash: String) = secrets.put("mfa:" + AccountKey.of(grid, name), hash)

    fun loadContacts(): List<Contact> = Contacts.decode(sp.getString("contacts", null))
    fun saveContacts(list: List<Contact>) = sp.edit().putString("contacts", Contacts.encode(list)).apply()
}
