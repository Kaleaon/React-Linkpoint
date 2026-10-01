package app.linkpoint.core

import app.linkpoint.core.tools.*
import java.time.Instant
import org.junit.Assert.*
import org.junit.Test

class ToolsTest {
    @Test fun icsHasRequiredFieldsAndCrlf() {
        val s = Ics.build(IcsEvent("id-1", "Party, music; fun", Instant.parse("2026-01-02T03:04:05Z"), Instant.parse("2026-01-02T04:04:05Z"), "line1\nline2", reminders = listOf(10), stamp = Instant.parse("2026-01-01T00:00:00Z")))
        assertTrue(s.contains("DTSTART:20260102T030405Z\r\n"))
        assertTrue(s.contains("SUMMARY:Party\\, music\\; fun\r\n"))
        assertTrue(s.contains("DESCRIPTION:line1\\nline2"))
        assertTrue(s.contains("TRIGGER:-PT10M"))
        assertTrue(s.endsWith("END:VCALENDAR\r\n"))
    }

    @Test fun icsRejectsBadTimesAndFoldsLongLines() {
        assertThrows(IllegalArgumentException::class.java) { Ics.build(IcsEvent("x", "s", Instant.EPOCH, Instant.EPOCH)) }
        val folded = Ics.fold("DESCRIPTION:" + "é".repeat(100))
        assertTrue(folded.split("\r\n").all { it.toByteArray().size <= 75 })
        assertEquals("Hello-World.ics", Ics.fileName("Hello World!"))
    }

    @Test fun mapTilesAreCentredAndClipped() {
        val t = MapTiles.around(1, 1, 1)
        assertEquals(9, t.size); assertTrue(t.single { it.center }.let { it.x == 1 && it.y == 1 })
        assertEquals(4, MapTiles.around(0, 0, 1).size)
        assertEquals("Moderate", MapTiles.ratingName(21)); assertEquals("Unknown", MapTiles.ratingName(null))
    }

    @Test fun linksAreValidated() {
        assertEquals("https://t.me/some_user", (Contacts.normalizeLink(LinkService.TELEGRAM, "@some_user") as LinkResult.Ok).link.url)
        assertTrue(Contacts.normalizeLink(LinkService.TELEGRAM, "ab") is LinkResult.Error)
        assertNull((Contacts.normalizeLink(LinkService.DISCORD, "some.name") as LinkResult.Ok).link.url)
        assertTrue(Contacts.normalizeLink(LinkService.WEB, "javascript:alert(1)") is LinkResult.Error)
        assertTrue(Contacts.normalizeLink(LinkService.WEB, "https://user:pw@example.com") is LinkResult.Error)
        assertEquals("example.com/a", (Contacts.normalizeLink(LinkService.WEB, "example.com/a") as LinkResult.Ok).link.label)
    }

    @Test fun storedContactsAreSanitised() {
        val c = Contact("id1", " Ann ", "n", listOf(ContactLink(LinkService.WEB, "x", "javascript:1"), ContactLink(LinkService.WEB, "ok", "https://a.b")), 1, 2)
        val out = Contacts.decode(Contacts.encode(listOf(c, c.copy(id = " "), c.copy(id = "id1"))))
        assertEquals(1, out.size); assertEquals("Ann", out[0].name); assertEquals(1, out[0].links.size)
        assertTrue(Contacts.decode("not json").isEmpty())
    }
}
