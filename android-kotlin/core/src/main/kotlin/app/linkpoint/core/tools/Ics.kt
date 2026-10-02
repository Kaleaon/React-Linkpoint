package app.linkpoint.core.tools

import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/** Build an iCalendar (.ics) file for one event (RFC 5545), so a notice can go into any calendar app. */
data class IcsEvent(
    val uid: String,
    val summary: String,
    val start: Instant,
    val end: Instant,
    val description: String? = null,
    val location: String? = null,
    val stamp: Instant = Instant.now(),
    /** Minutes before the start for popup reminders. */
    val reminders: List<Int> = emptyList(),
)

object Ics {
    private val FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC)

    fun date(t: Instant): String = FORMAT.format(t)

    fun escape(text: String): String =
        text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r\n", "\\n").replace("\r", "\\n").replace("\n", "\\n")

    /** Fold a content line to 75 octets (not characters); continuation lines start with a space. */
    fun fold(line: String): String {
        if (line.toByteArray(Charsets.UTF_8).size <= 75) return line
        val out = ArrayList<String>()
        val cur = StringBuilder()
        var size = 0
        var i = 0
        while (i < line.length) {
            val cp = line.codePointAt(i)
            val ch = String(Character.toChars(cp))
            val bytes = ch.toByteArray(Charsets.UTF_8).size
            if (size + bytes > 75) { out.add(cur.toString()); cur.setLength(0); cur.append(' '); size = 1 }
            cur.append(ch); size += bytes
            i += Character.charCount(cp)
        }
        out.add(cur.toString())
        return out.joinToString("\r\n")
    }

    fun build(e: IcsEvent): String {
        require(e.uid.isNotEmpty() && e.uid.none { it == '\r' || it == '\n' }) { "The event needs a plain-text id." }
        require(e.end.isAfter(e.start)) { "The event must end after it starts." }
        val lines = mutableListOf(
            "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Linkpoint Viewer//Group notices//EN", "CALSCALE:GREGORIAN",
            "BEGIN:VEVENT", "UID:${e.uid}", "DTSTAMP:${date(e.stamp)}", "DTSTART:${date(e.start)}", "DTEND:${date(e.end)}",
            "SUMMARY:${escape(e.summary.ifEmpty { "Second Life notice" })}",
        )
        e.description?.takeIf { it.isNotEmpty() }?.let { lines += "DESCRIPTION:${escape(it)}" }
        e.location?.takeIf { it.isNotEmpty() }?.let { lines += "LOCATION:${escape(it)}" }
        for (m in e.reminders) if (m in 0..40320) lines += listOf("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Reminder", "TRIGGER:-PT${m}M", "END:VALARM")
        lines += listOf("END:VEVENT", "END:VCALENDAR")
        return lines.joinToString("\r\n") { fold(it) } + "\r\n"
    }

    fun fileName(summary: String): String {
        val base = summary.replace(Regex("[^A-Za-z0-9]+"), "-").trim('-').take(40)
        return "${base.ifEmpty { "notice" }}.ics"
    }
}
