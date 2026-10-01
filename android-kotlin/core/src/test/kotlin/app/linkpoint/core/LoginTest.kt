package app.linkpoint.core

import app.linkpoint.core.llsd.*
import app.linkpoint.core.login.*
import app.linkpoint.core.net.Http
import app.linkpoint.core.net.HttpResponse
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class FakeHttp(private val reply: (String, String) -> HttpResponse) : Http {
    val requests = java.util.concurrent.CopyOnWriteArrayList<Pair<String, String>>()
    override suspend fun get(url: String, headers: Map<String, String>, timeoutMs: Int): HttpResponse { requests += url to ""; return reply(url, "") }
    override suspend fun post(url: String, body: ByteArray, contentType: String, headers: Map<String, String>, timeoutMs: Int): HttpResponse {
        val text = body.toString(Charsets.UTF_8)
        requests += url to text
        return reply(url, text)
    }
}

class LoginTest {
    private val req = LoginRequest(Grid.AGNI, "Test Resident", "secret", deviceId = "dev-1")

    private fun ok(xml: String) = HttpResponse(200, xml.toByteArray())

    @Test fun passwordIsHashedFromFirst16Chars() {
        assertEquals(LoginClient.hashPassword("0123456789abcdef"), LoginClient.hashPassword("0123456789abcdefEXTRA"))
        assertTrue(LoginClient.hashPassword("x").startsWith("$1$"))
        assertEquals(3 + 32, LoginClient.hashPassword("x").length)
    }

    @Test fun namesAreParsed() {
        assertEquals("Test" to "Resident", LoginClient.parseName("Test"))
        assertEquals("first" to "last", LoginClient.parseName("first.last"))
        assertEquals("A" to "B C", LoginClient.parseName("A B C"))
        assertThrows(IllegalArgumentException::class.java) { LoginClient.parseName("a<b c") }
    }

    @Test fun startLocationIsValidated() {
        assertEquals("home", LoginClient.normalizeStart("first"))
        assertEquals("last", LoginClient.normalizeStart("garbage"))
        assertEquals("uri:Ahern&128&128&30", LoginClient.normalizeStart("uri:Ahern"))
        assertThrows(IllegalArgumentException::class.java) { LoginClient.normalizeStart("uri:Bad&1&2") }
        assertThrows(IllegalArgumentException::class.java) { LoginClient.normalizeStart("uri:<x>") }
    }

    @Test fun requestCarriesIdentityAndNoRawDeviceId() {
        val xml = XmlRpc.methodCall("login_to_simulator", LoginClient.buildParams(req))
        assertTrue(xml.contains("<name>channel</name><value><string>Linkpoint Viewer</string>"))
        assertTrue(xml.contains("<name>agree_to_tos</name><value><boolean>1</boolean>"))
        assertFalse(xml.contains("dev-1"))
        assertFalse(xml.contains("secret"))
    }

    @Test fun mfaFieldsOnlyWhenGiven() {
        assertFalse(LoginClient.buildParams(req).containsKey("token"))
        val p = LoginClient.buildParams(req.copy(mfaToken = "123 456", mfaHash = "h"))
        assertEquals("123456", p["token"]); assertEquals("h", p["mfa_hash"])
    }

    @Test fun successfulLoginParses() = runBlocking {
        val agent = UUID.randomUUID(); val session = UUID.randomUUID(); val buddy = UUID.randomUUID()
        val http = FakeHttp { _, _ -> ok("""<?xml version="1.0"?><methodResponse><params><param><value><struct>
            <member><name>login</name><value><string>true</string></value></member>
            <member><name>agent_id</name><value><string>$agent</string></value></member>
            <member><name>session_id</name><value><string>$session</string></value></member>
            <member><name>secure_session_id</name><value><string>${UUID.randomUUID()}</string></value></member>
            <member><name>circuit_code</name><value><i4>12345</i4></value></member>
            <member><name>sim_ip</name><value><string>1.2.3.4</string></value></member>
            <member><name>sim_port</name><value><i4>13000</i4></value></member>
            <member><name>seed_capability</name><value><string>https://sim/seed</string></value></member>
            <member><name>first_name</name><value><string>"Test"</string></value></member>
            <member><name>last_name</name><value><string>Resident</string></value></member>
            <member><name>region_x</name><value><i4>256000</i4></value></member>
            <member><name>region_y</name><value><i4>256256</i4></value></member>
            <member><name>buddy-list</name><value><array><data><value><struct>
              <member><name>buddy_id</name><value><string>$buddy</string></value></member>
              <member><name>buddy_rights_given</name><value><i4>1</i4></value></member>
              <member><name>buddy_rights_has</name><value><i4>3</i4></value></member>
            </struct></value></data></array></value></member>
            <member><name>mfa_hash</name><value><string>abc</string></value></member>
          </struct></value></param></params></methodResponse>""") }
        val r = LoginClient.login(http, req)
        assertEquals(agent.toString(), r.agentId); assertEquals(12345, r.circuitCode); assertEquals(13000, r.simPort)
        assertEquals("Test Resident", r.fullName); assertEquals(1, r.buddies.size); assertEquals(3, r.buddies[0].rightsHas)
        assertEquals("abc", r.mfaHash)
        assertEquals("https://login.agni.lindenlab.com/cgi-bin/login.cgi", http.requests[0].first)
    }

    private fun failure(reason: String, message: String) = ok("""<?xml version="1.0"?><methodResponse><params><param><value><struct>
        <member><name>login</name><value><string>false</string></value></member>
        <member><name>reason</name><value><string>$reason</string></value></member>
        <member><name>message</name><value><string>$message</string></value></member></struct></value></param></params></methodResponse>""")

    @Test fun mfaChallengeIsReported() = runBlocking {
        val e = runCatching { LoginClient.login(FakeHttp { _, _ -> failure("mfa_challenge", "code please") }, req) }.exceptionOrNull() as LoginFailure
        assertTrue(e.mfaRequired); assertEquals("mfa_required", e.code); assertEquals("code please", e.gridMessage)
    }

    @Test fun badPasswordIsReported() = runBlocking {
        val e = runCatching { LoginClient.login(FakeHttp { _, _ -> failure("key", "x") }, req) }.exceptionOrNull() as LoginFailure
        assertEquals("bad_credentials", e.code); assertFalse(e.mfaRequired)
    }

    @Test fun httpErrorIsNotALoginFailure() = runBlocking {
        val e = runCatching { LoginClient.login(FakeHttp { _, _ -> HttpResponse(503, ByteArray(0)) }, req) }.exceptionOrNull()
        assertTrue(e is java.io.IOException)
    }

    @Test fun faultBecomesFailure() = runBlocking {
        val xml = ok("""<methodResponse><fault><value><struct><member><name>faultCode</name><value><int>4</int></value></member><member><name>faultString</name><value><string>boom</string></value></member></struct></value></fault></methodResponse>""")
        val e = runCatching { LoginClient.login(FakeHttp { _, _ -> xml }, req) }.exceptionOrNull() as LoginFailure
        assertTrue(e.message.contains("boom"))
    }

    @Test fun llsdRoundTrip() {
        val id = UUID.randomUUID()
        val v = mapOf("a" to 1, "b" to listOf("x&y", 2.5, true, null, id), "c" to byteArrayOf(1, 2, 3))
        val back = Llsd.parseXml(Llsd.toXml(v)).asLlsdMap()!!
        assertEquals(1, back["a"])
        val list = back["b"].asLlsdList()!!
        assertEquals("x&y", list[0]); assertEquals(2.5, list[1]); assertEquals(true, list[2]); assertNull(list[3]); assertEquals(id, list[4])
        assertArrayEquals(byteArrayOf(1, 2, 3), back["c"] as ByteArray)
    }

    @Test fun llsdRejectsDoctype() {
        assertThrows(Exception::class.java) { Llsd.parseXml("""<!DOCTYPE llsd [<!ENTITY x "y">]><llsd><string>&x;</string></llsd>""") }
    }
}
