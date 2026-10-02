package app.linkpoint.core.tools

import java.net.URI
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

enum class LinkService { TELEGRAM, DISCORD, WEB }

@Serializable
data class ContactLink(val service: LinkService, val label: String, val url: String?)

@Serializable
data class Contact(
    /** The resident's Second Life UUID. */
    val id: String,
    val name: String,
    val note: String = "",
    val links: List<ContactLink> = emptyList(),
    val savedAt: Long,
    val updatedAt: Long,
)

sealed class LinkResult {
    data class Ok(val link: ContactLink) : LinkResult()
    data class Error(val message: String) : LinkResult()
}

object Contacts {
    const val MAX_CONTACTS = 2000
    const val MAX_NOTE = 1000
    private val TELEGRAM_USER = Regex("^[A-Za-z][A-Za-z0-9_]{4,31}$")
    private val TELEGRAM_URL = Regex("^(?:https?://)?(?:t\\.me|telegram\\.me)/([^/?#\\s]+)/?(?:[?#].*)?$", RegexOption.IGNORE_CASE)
    private val DISCORD_ID = Regex("^\\d{17,20}$")
    private val DISCORD_NAME = Regex("^[a-z0-9_.]{2,32}$")
    private val DISCORD_URL = Regex("^(?:https?://)?(?:www\\.)?discord(?:app)?\\.com/users/(\\d{17,20})/?$", RegexOption.IGNORE_CASE)

    /**
     * Validate and normalise a link the user typed or pasted. Only http(s) URLs are ever opened:
     * a javascript: or data: URL is rejected, not escaped.
     */
    fun normalizeLink(service: LinkService, input: String): LinkResult {
        val text = input.trim()
        if (text.isEmpty()) return LinkResult.Error("Enter a value for this link.")
        when (service) {
            LinkService.TELEGRAM -> {
                val user = (TELEGRAM_URL.find(text)?.groupValues?.get(1) ?: text).removePrefix("@")
                if (!TELEGRAM_USER.matches(user)) return LinkResult.Error("Telegram usernames are 5-32 letters, digits or underscores, starting with a letter.")
                return LinkResult.Ok(ContactLink(service, "@$user", "https://t.me/$user"))
            }
            LinkService.DISCORD -> {
                val value = DISCORD_URL.find(text)?.groupValues?.get(1) ?: text.removePrefix("@")
                if (DISCORD_ID.matches(value)) return LinkResult.Ok(ContactLink(service, value, "https://discord.com/users/$value"))
                // Discord cannot link to a username, only to a numeric id, so a username is kept as a label.
                if (DISCORD_NAME.matches(value.lowercase()) && !value.all { it.isDigit() }) return LinkResult.Ok(ContactLink(service, value, null))
                return LinkResult.Error("Enter a Discord user id (17-20 digits), a profile link, or a username.")
            }
            LinkService.WEB -> {
                val uri = try {
                    URI(if (Regex("^[a-zA-Z][a-zA-Z0-9+.-]*:").containsMatchIn(text)) text else "https://$text")
                } catch (_: Exception) { return LinkResult.Error("That is not a valid web address.") }
                if (uri.scheme != "https" && uri.scheme != "http") return LinkResult.Error("Only http and https links are allowed.")
                if (uri.userInfo != null) return LinkResult.Error("Links with a username or password are not allowed.")
                val host = uri.host ?: return LinkResult.Error("That is not a valid web address.")
                if (!host.contains('.')) return LinkResult.Error("That is not a valid web address.")
                val path = (uri.rawPath ?: "").let { if (it == "/") "" else it }
                return LinkResult.Ok(ContactLink(service, "$host$path".take(80), uri.toString()))
            }
        }
    }

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    fun encode(list: Collection<Contact>): String = json.encodeToString(kotlinx.serialization.builtins.ListSerializer(Contact.serializer()), list.toList())

    /** Stored data is not trusted: unusable records are dropped, fields are clamped, links re-validated. */
    fun decode(text: String?, now: Long = System.currentTimeMillis()): List<Contact> {
        if (text.isNullOrBlank()) return emptyList()
        val raw = try { json.decodeFromString(kotlinx.serialization.builtins.ListSerializer(Contact.serializer()), text) } catch (_: Exception) { return emptyList() }
        val seen = HashSet<String>()
        return raw.mapNotNull { c ->
            val id = c.id.trim(); val name = c.name.trim()
            if (id.isEmpty() || name.isEmpty() || !seen.add(id)) return@mapNotNull null
            val links = c.links.filter { l -> l.url == null || Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(l.url) }
                .distinctBy { it.service }.map { it.copy(label = it.label.take(80)) }
            Contact(id, name.take(120), c.note.take(MAX_NOTE), links, if (c.savedAt > 0) c.savedAt else now, if (c.updatedAt > 0) c.updatedAt else now)
        }.take(MAX_CONTACTS)
    }
}
