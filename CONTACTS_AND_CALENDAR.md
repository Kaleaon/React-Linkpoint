# Contacts and Calendar

Two screens that keep things from Second Life outside the viewer: **Contacts** (an address
book of your friends) and **Calendar** (group notices turned into calendar events).
Both work with no account. Google is an optional extra, off until you turn it on in
**Settings → Optional integrations**.

## Contacts

- **Save friends list** copies your Second Life friends into a contact list on this device.
  Saving again adds new friends and keeps everything you entered; people you later unfriend
  stay in the list (it is an address book, not a mirror).
- Each contact can have a **photo**, a **note**, and **links** to the same person elsewhere:
  - Telegram: `@username`, a username, or a `t.me` link.
  - Discord: a numeric user id or `discord.com/users/<id>` link (these open the profile), or
    a username (kept as text; Discord cannot link to a username).
  - Website: any `http(s)` address.
    Input is validated, and only `http(s)` links are ever opened (never `javascript:` or `data:`).
- **Photos** are ones you pick (resized to 256 px on the device) or **Use profile picture**, which
  fetches the resident's public Second Life web profile picture if they have one. A resident
  without one is reported as having none; no image is generated or substituted. Initials are
  shown as text when there is no photo.
- **Export / Import** a JSON backup. The backup includes notes and photos; keep it private.
- Stored in this browser (`localStorage`), up to 2,000 contacts. If the browser's storage is
  full the change is rolled back and you are told.

## Calendar

- Group notices the grid sends are kept on this device (up to 200) so they can be used after
  the session ends.
- Pick a notice and Linkpoint reads an explicit time from its text ("Saturday 7pm SLT",
  "3/20 19:30", "tomorrow at noon"), in **Second Life Time** (US Pacific, with daylight
  saving) unless the notice names another zone. If it finds no time it says so and asks you to
  choose one. Bare numbers such as "Room 7" are not treated as times. Check and edit the title,
  zone, start and end before saving.
- **Save calendar file (.ics)** works with any calendar app and needs no account.
- **Add to Google Calendar** appears only when Google is on. Adding the same notice twice finds the
  first event instead of creating a duplicate.

## Google (optional)

Off by default. Turning it on does not sign you in; sign-in happens only when you use a Google
action, and each action asks Google for just what it needs:

| Action                           | Access requested       |
| -------------------------------- | ---------------------- |
| Copy contacts to Google Contacts | `auth/contacts`        |
| Add notices to Google Calendar   | `auth/calendar.events` |

Turning the setting off signs you out. Access tokens are kept in memory only. Nothing is sent to
Google until you press a Google button. Copying a contact sends its name, Second Life UUID, web
profile link, note, links and photo to your Google account.

The Google code (Firebase) is loaded only after the setting is on; it is a separate download.

### Setting it up (for whoever hosts the app)

This repository ships `firebase-applet-config.json`. Firebase web keys are meant to be public, but
you should restrict the key to your site's address in the Google Cloud console. For sign-in to work
the Google Cloud project needs the People API and Google Calendar API enabled, the Google sign-in
provider enabled in Firebase Authentication, and an OAuth consent screen that lists the two scopes
above. Both are _sensitive_ scopes, so a public release needs Google's app verification; until
then only listed test users can sign in.

## Not verified

- **Nothing was run against real Google services** (no credentials were available). The Google code
  is tested with the network stubbed: request shapes, de-duplication, pagination, error handling.
  Expect to find problems on first real use.
- The public profile picture address pattern was checked by hand against live responses, but it is
  not a documented API and could change.
- Discord and Telegram links are only opened, never called; whether a given id or username exists
  is not checked.
- Contact photos from the profile picture service are resized in the browser; that step needs a real
  browser canvas and is not covered by the automated tests (only the cropping maths is).
