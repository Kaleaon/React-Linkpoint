package app.linkpoint.core

import app.linkpoint.core.login.Grid
import app.linkpoint.core.login.LoginClient
import app.linkpoint.core.login.LoginFailure
import app.linkpoint.core.login.LoginRequest
import app.linkpoint.core.model.*
import app.linkpoint.core.net.UrlConnectionHttp
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test

/**
 * Two avatars on a REAL OpenSim: radar, instant messages, friend requests and teleport offers. Needs the second account
 * (OPENSIM_USER2 / OPENSIM_PASSWORD2, created by `tools/opensim/live.py`); skipped without it.
 */
class OpenSimLiveSocialTest {
    private val url: String? = System.getenv("OPENSIM_LOGIN_URL")
    private val user1 = System.getenv("OPENSIM_USER") ?: "Linky Tester"
    private val pass1 = System.getenv("OPENSIM_PASSWORD") ?: "testpass1"
    private val user2 = System.getenv("OPENSIM_USER2")
    private val pass2 = System.getenv("OPENSIM_PASSWORD2")
    private val home = "Test Isle"
    private val neighbour = "Neighbour Isle"

    private suspend fun <T> eventually(timeoutMs: Long = 45_000, what: String, f: () -> T?): T {
        val end = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < end) { f()?.let { return it }; delay(100) }
        throw AssertionError("timed out waiting for $what")
    }

    private class Who(val name: String, val scope: CoroutineScope, val s: ViewerSession)

    private suspend fun enter(name: String, pw: String, start: String = "uri:$home&128&128&40"): Who {
        val http = UrlConnectionHttp()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val s = ViewerSession(http, scope)
        val end = System.currentTimeMillis() + 120_000
        while (true) {
            try { s.connect(LoginClient.login(http, LoginRequest(Grid("opensim-local", "Local OpenSim", url!!), name, pw, start = start, deviceId = "live-social-$name"))); break }
            catch (e: LoginFailure) { if (!(e.message ?: "").contains("already logged in") || System.currentTimeMillis() > end) throw e; delay(3000) }
        }
        eventually(what = "$name: region handshake") { s.region.value?.takeIf { !it.name.isNullOrEmpty() } }
        return Who(name, scope, s)
    }

    private suspend fun Who.leave() { runCatching { s.logout() }; scope.cancel() }

    /** Both avatars in the home region; always logged out afterwards. */
    private fun pair(body: suspend (Who, Who) -> Any?): Unit = runBlocking {
        assumeTrue("OPENSIM_LOGIN_URL not set", !url.isNullOrBlank())
        assumeTrue("second account not configured (OPENSIM_USER2)", !user2.isNullOrBlank() && !pass2.isNullOrBlank())
        val a = enter(user1, pass1)
        val b = try { enter(user2!!, pass2!!) } catch (e: Throwable) { a.leave(); throw e }
        try { body(a, b) } finally { b.leave(); a.leave() }
        Unit
    }

    @Test fun theOtherAvatarShowsUpOnTheRadarWithItsName() = pair { a, b ->
        val seen = eventually(what = "${b.name} on ${a.name}'s radar") { a.s.nearby.value.firstOrNull { it.id == b.s.selfId } }
        println("LIVE radar: sees the other avatar, distance=${seen.distance?.let { "%.1f".format(it) }}, name known=${seen.name != null}")
        val named = eventually(what = "radar name resolved") { a.s.nearby.value.firstOrNull { it.id == b.s.selfId && it.name != null } }
        assertEquals(b.name, named.name)
        // and the other way round
        eventually(what = "${a.name} on ${b.name}'s radar") { b.s.nearby.value.firstOrNull { it.id == a.s.selfId } }
    }

    @Test fun instantMessagesTravelBothWays() = pair { a, b ->
        a.s.sendInstantMessage(b.s.selfId!!, "hello from A ${System.nanoTime()}")
        val got = eventually(what = "IM arriving at B") { b.s.chat.value.firstOrNull { it.kind == ChatKind.IM && it.text.startsWith("hello from A") } }
        assertEquals(a.name, got.fromName)
        b.s.sendInstantMessage(a.s.selfId!!, "reply from B")
        eventually(what = "IM reply arriving at A") { a.s.chat.value.firstOrNull { it.kind == ChatKind.IM && it.text == "reply from B" && !it.outgoing } }
        println("LIVE IM exchanged both ways")
    }

    @Test fun aFriendRequestIsOfferedAcceptedAndBothSidesBecomeFriends() = pair { a, b ->
        a.s.sendFriendRequest(b.s.selfId!!, "friends?")
        val offer = eventually(what = "friend offer arriving at B") { b.s.offers.value.filterIsInstance<PendingOffer.Friend>().firstOrNull() }
        assertEquals(a.name, offer.fromName)
        b.s.acceptOffer(offer)
        assertTrue(b.s.offers.value.isEmpty())
        eventually(what = "A told the request was accepted") { a.s.chat.value.firstOrNull { it.text.contains("accepted your friendship") } }
        eventually(what = "B in A's friend list") { a.s.friends.value.firstOrNull { it.id == b.s.selfId } }
        println("LIVE friendship formed; A's friends=${a.s.friends.value.size}")
    }

    @Test fun aTeleportOfferBringsTheOtherAvatarOverTheRegionBorder() = pair { a, b ->
        assumeTrue("OPENSIM_NEIGHBOUR not set", System.getenv("OPENSIM_NEIGHBOUR") == neighbour)
        b.s.teleport(neighbour, 128f, 128f, 40f)
        eventually(60_000, "B arrives in $neighbour") { b.s.region.value?.takeIf { it.name == neighbour } }
        a.s.offerTeleport(b.s.selfId!!, "come to the home region")
        val lure = eventually(what = "lure arriving at B") { b.s.offers.value.filterIsInstance<PendingOffer.Lure>().firstOrNull() }
        assertEquals(a.name, lure.fromName)
        b.s.acceptOffer(lure)
        eventually(60_000, "B teleported to A in $home") { b.s.region.value?.takeIf { it.name == home } }
        eventually(what = "A sees B again") { a.s.nearby.value.firstOrNull { it.id == b.s.selfId } }
        println("LIVE teleport offer accepted: B crossed to A's region")
    }

    @Test fun anotherResidentsProfileIsAnswered() = pair { a, b ->
        assumeTrue("profile service not enabled", System.getenv("OPENSIM_PROFILES") == "1")
        val p = a.s.requestProfile(b.s.selfId!!)
        println("LIVE other avatar's profile answered=${p != null}")
        assertNotNull(p)
        assertEquals(b.s.selfId, p!!.id)
    }
}
