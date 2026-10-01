import { getGoogleAccessToken } from "./googleAuth";

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  created?: string;
  updated?: string;
  isSLNotice?: boolean;
}

export interface GroupNoticeItem {
  id: string;
  groupId?: string;
  groupName?: string;
  subject: string;
  message: string;
  from?: string;
  timestamp?: number;
  hasAttachment?: boolean;
  calendarEventId?: string;
}

/**
 * Fetch upcoming events from Google Calendar
 */
export const fetchGoogleCalendarEvents = async (
  calendarId: string = "primary",
  maxResults: number = 30
): Promise<GoogleCalendarEvent[]> => {
  const token = await getGoogleAccessToken();
  if (!token) throw new Error("Not signed in to Google.");

  const now = new Date().toISOString();
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    calendarId
  )}/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(
    now
  )}&maxResults=${maxResults}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Google Calendar API error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const items = data.items || [];

  return items.map((item: any) => ({
    id: item.id,
    summary: item.summary || "Untitled Event",
    description: item.description || "",
    location: item.location || "",
    htmlLink: item.htmlLink,
    start: item.start,
    end: item.end,
    created: item.created,
    updated: item.updated,
    isSLNotice: Boolean(
      item.summary?.includes("[SL") ||
      item.description?.includes("Group Notice") ||
      item.description?.includes("Second Life")
    ),
  }));
};

/**
 * Parse date & time candidates from a notice message or subject
 */
export function parseNoticeDateSuggestion(text: string, baseTimestamp: number = Date.now()): {
  start: Date;
  end: Date;
  extractedTitle: string;
} {
  const start = new Date(baseTimestamp);
  // Default to the next full hour + 1 hour
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);

  // Check for time patterns like "7pm", "7:30 pm", "19:00", "2 pm slt"
  const timeMatch = text.match(/(\b\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(slt|pdt|pst)?\b/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const ampm = timeMatch[3]?.toLowerCase();

    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;

    if (hours >= 0 && hours < 24) {
      start.setHours(hours, minutes, 0, 0);
      // If time has already passed today, assume tomorrow
      if (start.getTime() < Date.now()) {
        start.setDate(start.getDate() + 1);
      }
    }
  }

  // End date is 1 hour after start
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  return {
    start,
    end,
    extractedTitle: text.slice(0, 80).replace(/[\r\n]+/g, " ").trim(),
  };
}

/**
 * Add a Second Life group notice to Google Calendar
 */
export const addNoticeToGoogleCalendar = async (
  notice: GroupNoticeItem,
  options: {
    startDateTime?: string;
    endDateTime?: string;
    summary?: string;
    location?: string;
    timeZone?: string;
  } = {}
): Promise<GoogleCalendarEvent> => {
  const token = await getGoogleAccessToken();
  if (!token) throw new Error("Please sign in with Google first.");

  const suggested = parseNoticeDateSuggestion(
    `${notice.subject}\n${notice.message}`,
    notice.timestamp || Date.now()
  );

  const startIso = options.startDateTime || suggested.start.toISOString();
  const endIso = options.endDateTime || suggested.end.toISOString();
  const timeZone = options.timeZone || "America/Los_Angeles"; // Second Life Standard Time (SLT)

  const summary = options.summary || `[SL Notice] ${notice.subject || "Group Notice"}`;
  const description = [
    `Group: ${notice.groupName || "Second Life Group"}`,
    notice.from ? `Sent by: ${notice.from}` : null,
    `Notice Subject: ${notice.subject}`,
    notice.groupId ? `Group ID: ${notice.groupId}` : null,
    notice.id ? `Notice ID: ${notice.id}` : null,
    "",
    "--- Notice Text ---",
    notice.message,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const eventPayload = {
    summary,
    description,
    location: options.location || `Second Life (${notice.groupName || "In-World"})`,
    start: {
      dateTime: startIso,
      timeZone,
    },
    end: {
      dateTime: endIso,
      timeZone,
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 30 },
        { method: "popup", minutes: 10 },
      ],
    },
  };

  const url = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(eventPayload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to create calendar event (${res.status}): ${errorText}`);
  }

  const created = await res.json();
  return {
    id: created.id,
    summary: created.summary,
    description: created.description,
    location: created.location,
    htmlLink: created.htmlLink,
    start: created.start,
    end: created.end,
    isSLNotice: true,
  };
};

/**
 * Delete an event from Google Calendar
 */
export const deleteCalendarEvent = async (
  eventId: string,
  calendarId: string = "primary"
): Promise<boolean> => {
  const token = await getGoogleAccessToken();
  if (!token) throw new Error("Not signed in to Google.");

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    calendarId
  )}/events/${encodeURIComponent(eventId)}`;

  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to delete calendar event: ${errText}`);
  }

  return true;
};
