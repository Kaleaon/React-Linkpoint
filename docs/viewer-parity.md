# Viewer parity audit

Follow-up review: [consolidated audit and proposed PRs](followup-audit.md).

Reference date: 2026-10-06. This is an implementation audit, not a claim of complete competitor parity.

## Reference evidence

* Lumiya 3.4.2 APK and its decoded resources/bytecode: see [rendering-reference.md](rendering-reference.md) for the supplied Drive folder, checksum and tools. Its settings categories cover connection, appearance, chat, notifications, 3D, RLV and cache.
* [Firestorm preferences source](https://github.com/FirestormViewer/phoenix-firestorm/blob/1f0184a8e8288d96c7cfc2c2eb4bf226a247641b/indra/newview/skins/default/xui/en/floater_preferences.xml): searchable categories and settings backup are useful context for discoverability. The Firestorm wiki returned HTTP 403; source XML was accessible through GitHub.
* [Official Second Life preferences source](https://github.com/secondlife/viewer/blob/1411420f0b7df0112c3140123a64d6f9202891ba/indra/newview/skins/default/xui/en/floater_preferences.xml): searchable categories include graphics, voice, movement, notifications, privacy and uploads.

[viewer-screen-inventory.csv](viewer-screen-inventory.csv) inventories the reference repositories' default English floater, group-panel and preference definitions. There are 258 Firestorm and 200 official-viewer floater definitions, including auxiliary dialogs. Filename matches identify possible Linkpoint counterparts; they do not certify equivalent behavior. Every unmatched definition remains explicitly unverified. Native dialogs are not assumed to require a separate browser screen.

## Changes merged in PR #150

| Area | Implemented behavior |
| --- | --- |
| Navigation | All registered Linkpoint screens are accessible through a searchable phone directory, scrolling rails/tiles, settings shortcuts and desktop windows. Adds Groups, Profile, Notices, Contacts, Calendar, Teleport, Search, AO, Cache and Diagnostics to navigation. |
| Groups | Live profile, member and role requests through the shared browser/Electron viewer API; normalized serializable responses, tab loading/error messages, membership replacement including empty lists, clearing memberships on logout, responsive list/detail navigation. Notices show received session notices. |
| Settings layout | Search and category navigation, theme surfaces/borders/text/radii, compact container layouts and persistent layout/palette/density/toggle/preference state. Explicit mobile/desktop mode survives viewport resizing. |
| Active settings | Draw distance with conservative mesh bounds, frame rate cap, background battery saving, camera FOV, volume, away autoreply and local/private/group notification popup filters. Notice records are retained when popups are suppressed. |
| Camera | Rear/front/first-person/free camera presets, orbit controls, reset and world-view navigation. |
| Environment | Local sunrise/midday/sunset/midnight previews and restoration of region settings; does not write simulator environment. |
| Snapshot | Local PNG capture of the world canvas, synchronous drawing before capture, errors when the world is unavailable. |
| Feedback | Cache clearing invokes the cache manager, reconnect opens sign-in, release notes and bug reports open the real repository; permission revocation no longer falsely reports success. |
| Rendering | See the separate rendering reference and regression tests for mesh replacement, UUID identity, avatar appearance packets/bakes, prim-face inheritance, attachment skeletons and viewport lifecycle. |

## Follow-up repairs

The consolidated review adds validated preference restoration, palette/density and
Chat/Settings synchronization, working timestamps and chat-history controls, incoming
local mute enforcement, normalized IM/group popup subscriptions, group refresh/session
error handling and notice-store integration, and cache clearing that preserves
transaction records and reports incomplete server clearing. These are corrections
and extensions to the merged behavior above, not claims of full competitor parity.

## Remaining gaps

Complete Lumiya/Firestorm/official parity requires further implementation and live-grid validation. Existing Linkpoint screens often cover inspection or a subset of actions. In particular:

* Group activation/titles, join/leave, invitations, member/role administration, group accounting/land and historical notice retrieval are not implemented by this change. Member IDs/statuses are available; name resolution is not added.
* Object create/build/edit/link, terrain editing, estate administration, asset uploads, full appearance editing, inventory permission workflows and gesture editing/activation are not brought to competitor parity.
* Graphics quality, avatar complexity, bandwidth, shadows, chat translation, global maturity updates, online visibility, browser push, typing controls, automatic cache clearing on logout, and RLV enforcement settings still need backend wiring. Controls without a runtime implementation are disabled and identified in Settings; old saved values do not establish runtime support. Full avatar shape morphing and independent PBR channel transforms remain unverified.
* Native platform controls such as Android Wi-Fi locks, filesystem paths and desktop crash-report configuration require platform-specific equivalents rather than cosmetic toggles.
* Snapshot publishing/email, camera key-binding editing, custom EEP asset editors, and account-specific settings import/export are outside the implemented screen behavior.

Tests establish local manager, bridge, geometry and interface behavior. They do not certify visual or protocol parity on a live simulator. Live-grid validation needs a real authenticated session.
