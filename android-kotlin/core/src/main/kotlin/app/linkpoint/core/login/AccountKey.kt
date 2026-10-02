package app.linkpoint.core.login

import java.security.MessageDigest

/**
 * Storage key for one account on one grid. "First Last", "first.last" and "first_last" name the same
 * account, and a bare name is a "Resident" account, so they all share a key. Hashed so the account
 * list is not readable from the preferences file.
 */
object AccountKey {
    fun of(gridKey: String, loginName: String): String {
        var name = loginName.trim().lowercase().replace('.', ' ').replace('_', ' ').replace(Regex("\\s+"), " ")
        if (!name.contains(' ')) name += " resident"
        val digest = MessageDigest.getInstance("SHA-256").digest("$gridKey\n$name".toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }
}
