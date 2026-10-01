package app.linkpoint.viewer.data

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

    /** A random id for this install, hashed into the login's id0/mac fields. */
    val deviceId: String
        get() = sp.getString("device", null) ?: UUID.randomUUID().toString().also { sp.edit().putString("device", it).apply() }

    fun mfaHash(grid: String, name: String): String = sp.getString("mfa:$grid:${name.lowercase()}", "") ?: ""
    fun saveMfaHash(grid: String, name: String, hash: String) = sp.edit().putString("mfa:$grid:${name.lowercase()}", hash).apply()

    fun loadContacts(): List<Contact> = Contacts.decode(sp.getString("contacts", null))
    fun saveContacts(list: List<Contact>) = sp.edit().putString("contacts", Contacts.encode(list)).apply()
}
