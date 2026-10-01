package app.linkpoint.core.login

import app.linkpoint.core.ViewerIdentity
import app.linkpoint.core.net.Http
import java.security.MessageDigest

/** A grid a resident can log in to. */
data class Grid(val key: String, val label: String, val loginUrl: String) {
    companion object {
        val AGNI = Grid("agni", "Second Life (Main Grid - Agni)", "https://login.agni.lindenlab.com/cgi-bin/login.cgi")
        val ADITI = Grid("aditi", "Second Life Beta (Aditi)", "https://login.aditi.lindenlab.com/cgi-bin/login.cgi")
        val OSGRID = Grid("osgrid", "OSgrid (OpenSim)", "http://login.osgrid.org/")
        val KITELY = Grid("kitely", "Kitely (OpenSim)", "http://login.kitely.com/")
        val ALL = listOf(AGNI, ADITI, OSGRID, KITELY)
        fun byKey(key: String) = ALL.firstOrNull { it.key == key } ?: AGNI
    }
}

/** What a grid refused a login for. The UI uses [code] and [mfaRequired] to respond. */
class LoginFailure(
    val reason: String,
    val code: String,
    val mfaRequired: Boolean,
    override val message: String,
    val gridMessage: String? = null,
) : Exception(message)

data class LoginRequest(
    val grid: Grid,
    /** "First Last", "first.last" or a single name (last name becomes "Resident"). */
    val username: String,
    val password: String,
    val start: String = "last",
    val mfaToken: String = "",
    val mfaHash: String = "",
    /** A random id kept on this install; hashed into the id0 / mac fields, never sent raw. */
    val deviceId: String,
    val platformVersion: String = "Android",
)

data class Buddy(val id: String, val rightsGiven: Int, val rightsHas: Int)

data class LoginResult(
    val agentId: String,
    val sessionId: String,
    val secureSessionId: String,
    val circuitCode: Int,
    val simIp: String,
    val simPort: Int,
    val seedCapability: String,
    val firstName: String,
    val lastName: String,
    val regionX: Int,
    val regionY: Int,
    val message: String,
    val buddies: List<Buddy>,
    val inventoryRootId: String?,
    /** Returned after an MFA login so this device is not challenged again. */
    val mfaHash: String?,
    val raw: Map<String, Any?>,
) {
    val fullName: String get() = "$firstName $lastName"
}

object LoginClient {
    private val REASONS = mapOf(
        "mfa_challenge" to ("mfa_required" to "This account uses multi-factor authentication. Enter the code from your authenticator app."),
        "key" to ("bad_credentials" to "The name or password is incorrect."),
        "presence" to ("already_logged_in" to "This account is already logged in. Wait a minute and try again, or log out of the other session."),
        "tos" to ("terms" to "The grid requires you to accept its Terms of Service before logging in."),
        "update" to ("update_required" to "The grid requires a newer viewer version."),
        "critical" to ("critical_message" to "The grid has a critical message that must be read before logging in."),
        "disabled" to ("account_disabled" to "This account has been disabled."),
        "mfa_failure" to ("mfa_failed" to "The multi-factor code was not accepted. Try the next code."),
    )

    private val OPTIONS = listOf(
        "inventory-root", "inventory-skeleton", "inventory-lib-root", "inventory-lib-owner", "inventory-skel-lib",
        "gestures", "display_names", "event_categories", "event_notifications", "classified_categories",
        "adult_compliant", "buddy-list", "newuser-config", "ui-config", "advanced-mode", "max-agent-groups",
        "map-server-url", "voice-config", "tutorial_setting", "login-flags", "global-textures",
    )

    fun md5Hex(text: String): String =
        MessageDigest.getInstance("MD5").digest(text.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

    /** The grid hashes only the first 16 characters of the password. */
    fun hashPassword(password: String): String = "$1$" + md5Hex(password.take(16))

    /** Split a typed name into first and last. Separators are space, dot or underscore. */
    fun parseName(username: String): Pair<String, String> {
        val name = username.trim()
        var split = name.length
        for (sep in " ._") {
            val at = name.indexOf(sep)
            if (at != -1 && at < split) split = at
        }
        val first = name.substring(0, split).trim()
        val last = (if (split < name.length) name.substring(split + 1) else "").trim().ifEmpty { "Resident" }
        require(first.isNotEmpty()) { "Enter your avatar name" }
        require((first + last).none { it.code < 0x20 || it in "<>&\"'" }) { "The avatar name contains characters that are not allowed" }
        return first to last
    }

    /**
     * "home" and "last" are accepted directly. A "uri:Region&x&y&z" start must name a region and may
     * carry only three numeric coordinates, so a caller cannot smuggle other login fields.
     */
    fun normalizeStart(start: String): String {
        val value = start.trim().ifEmpty { "last" }
        if (value == "first" || value == "home") return "home"
        if (!value.startsWith("uri:", ignoreCase = true)) return "last"
        val parts = value.substring(4).split('&')
        val region = parts[0]
        val coords = parts.drop(1)
        require(Regex("""[\w .'-]{1,64}""").matches(region) && (coords.isEmpty() || coords.size == 3) &&
            coords.all { Regex("""-?\d{1,4}""").matches(it) }) { "The start location is not a valid region and position" }
        return "uri:" + (listOf(region) + (if (coords.size == 3) coords else listOf("128", "128", "30"))).joinToString("&")
    }

    fun buildParams(req: LoginRequest): Map<String, Any?> {
        val (first, last) = parseName(req.username)
        require(req.password.isNotEmpty()) { "Enter your password" }
        val params = LinkedHashMap<String, Any?>()
        params["first"] = first
        params["last"] = last
        params["passwd"] = hashPassword(req.password)
        params["start"] = normalizeStart(req.start)
        params["channel"] = ViewerIdentity.CHANNEL
        params["version"] = ViewerIdentity.VERSION
        params["platform"] = "Android"
        params["platform_version"] = req.platformVersion
        params["mac"] = md5Hex(req.deviceId + ":mac")
        params["id0"] = md5Hex(req.deviceId)
        params["viewer_digest"] = md5Hex(ViewerIdentity.IDENTITY)
        params["agree_to_tos"] = true
        params["read_critical"] = true
        params["options"] = OPTIONS
        if (req.mfaToken.isNotBlank()) params["token"] = req.mfaToken.replace(Regex("\\s+"), "").take(32)
        if (req.mfaHash.isNotBlank()) params["mfa_hash"] = req.mfaHash.take(256)
        return params
    }

    fun describeFailure(response: Map<String, Any?>): LoginFailure {
        val reason = response["reason"]?.toString() ?: ""
        val known = REASONS[reason]
        val gridMessage = response["message"]?.toString()
        return LoginFailure(
            reason = reason,
            code = known?.first ?: "login_failed",
            mfaRequired = reason == "mfa_challenge" || reason == "mfa_failure",
            message = known?.second ?: (gridMessage?.takeIf { it.isNotBlank() } ?: "Login failed"),
            gridMessage = gridMessage,
        )
    }

    /** Log in. Throws [LoginFailure] when the grid refuses, or another exception for transport problems. */
    suspend fun login(http: Http, req: LoginRequest): LoginResult {
        var url = req.grid.loginUrl
        var params = buildParams(req)
        repeat(4) {
            val body = XmlRpc.methodCall("login_to_simulator", params).toByteArray(Charsets.UTF_8)
            val response = http.post(url, body, "text/xml", mapOf("Accept" to "text/xml, application/xml"), 60_000)
            if (!response.ok) throw java.io.IOException("The login server answered HTTP ${response.status}")
            val value = try {
                XmlRpc.parseResponse(response.text)
            } catch (e: XmlRpc.Fault) {
                throw LoginFailure("", "login_failed", false, "Login failed: ${e.text}", e.text)
            }
            @Suppress("UNCHECKED_CAST")
            val map = value as? Map<String, Any?> ?: throw IllegalArgumentException("Unexpected login response")
            when (map["login"]?.toString()) {
                "true" -> return parseResult(map)
                "indeterminate" -> {
                    // The grid redirects the login to another service, with extra options to request.
                    val next = map["next_url"]?.toString() ?: throw describeFailure(map)
                    url = next
                    val extra = (map["next_options"] as? List<*>)?.mapNotNull { it?.toString() }.orEmpty()
                    params = params + ("options" to extra.ifEmpty { OPTIONS })
                }
                else -> throw describeFailure(map)
            }
        }
        throw LoginFailure("", "login_failed", false, "The grid kept redirecting the login.")
    }

    fun parseResult(m: Map<String, Any?>): LoginResult {
        fun str(k: String) = m[k]?.toString() ?: ""
        fun int(k: String) = (m[k] as? Number)?.toInt() ?: str(k).toIntOrNull() ?: 0
        val buddies = (m["buddy-list"] as? List<*>).orEmpty().mapNotNull { b ->
            val bm = b as? Map<*, *> ?: return@mapNotNull null
            val id = bm["buddy_id"]?.toString() ?: return@mapNotNull null
            Buddy(id, (bm["buddy_rights_given"] as? Number)?.toInt() ?: 0, (bm["buddy_rights_has"] as? Number)?.toInt() ?: 0)
        }
        val root = ((m["inventory-root"] as? List<*>)?.firstOrNull() as? Map<*, *>)?.get("folder_id")?.toString()
        require(str("agent_id").isNotEmpty() && str("session_id").isNotEmpty()) { "The login response is missing the agent or session id" }
        return LoginResult(
            agentId = str("agent_id"), sessionId = str("session_id"), secureSessionId = str("secure_session_id"),
            circuitCode = int("circuit_code"), simIp = str("sim_ip"), simPort = int("sim_port"),
            seedCapability = str("seed_capability"),
            firstName = str("first_name").trim('"'), lastName = str("last_name").trim('"'),
            regionX = int("region_x"), regionY = int("region_y"),
            message = str("message"), buddies = buddies, inventoryRootId = root,
            mfaHash = m["mfa_hash"]?.toString()?.takeIf { it.isNotEmpty() }, raw = m,
        )
    }
}
