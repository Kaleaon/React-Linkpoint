# Lumiya Redux feature-parity audit

Current-status update (2026-10-06): navigation, live group details and themed settings
were merged in PR #150. See [the consolidated audit](docs/followup-audit.md) for
follow-up fixes and remaining capabilities. The earlier comparison below is retained
as reference evidence, not a statement that implemented services are absent.

Reference: `Kaleaon/Lumiya-redux` at commit `b3048e878b83de8d89a984579719dc066cccee86`.
The comparison used the Android manifest, `NavDrawerAdapter`, and the activity/
fragment inventory. Lumiya is a behavioral reference only; no recovered code is
copied into this project.

Update reviewed: `b7094b0` (2026-09-22). The recovered Lumiya runtime confirmed
three behaviors now mirrored by Linkpoint: bounded `next_url`/`next_method`
login redirects, coarse avatar-location updates for radar, and parcel-property
updates attached to the current region. Its inventory recovery also confirms
that folder responses must be committed atomically and stale children removed;
Linkpoint's in-memory inventory currently merges responses and tracks that
replacement behavior as a follow-up rather than deleting data on partial fetches.

## 3D picking recovery note

The 2026-10-01 viewer review compared Lumiya Redux's recovered Java/Kotlin
`GLRayTrace`, `CollisionBox`, `DrawableObject`, and `WorldViewRenderer` against
the corresponding baksmali output under `recovered/smali`. Both representations
agree on a two-stage picking flow: transform a screen ray, reject objects using
a shared unit collision cube, then choose the closest depth (with detailed
geometry supplying face and UV data when available). Linkpoint now implements
that collision-volume broad phase, nearest-hit selection, and camera focus.
Per-triangle face/UV picking remains a follow-up because decoded mesh CPU buffers
are not retained after WebGL upload.

## Primary navigation parity

| Lumiya surface             | Linkpoint counterpart   | Runtime source                                                   |
| -------------------------- | ----------------------- | ---------------------------------------------------------------- |
| Login / grids              | Login                   | `AuthManager`, custom grid state                                 |
| Local chat / contacts      | Chat / Friends / Groups | `ChatManager`, `FriendsExtended`, `GroupsManager`                |
| World view                 | 3D View                 | `WorldViewer`, WebGL scene                                       |
| Objects                    | Radar / Objects         | simulator `ObjectUpdate`, inventory object assets                |
| Inventory / current outfit | Inventory / Outfits     | inventory capability responses                                   |
| Minimap                    | Map                     | simulator `RegionHandshake`                                      |
| My avatar                  | Profile                 | authenticated user record                                        |
| People search              | Search                  | server directory RPC, session resident index and friend requests |
| Settings                   | Settings                | `PreferencesManager`, theme state                                |
| Sign out                   | Settings → Disconnect   | `AuthManager.logout()`                                           |
| Manage accounts            | Accounts                | remembered identity metadata, credential removal                 |
| Manage grids               | Grids / Login           | built-in and persisted custom grid registry                      |
| Streaming media            | Media                   | native browser media pipeline                                    |
| Notecard list/detail       | Notecards               | inventory asset metadata                                         |

## Secondary surfaces found in Lumiya

Linkpoint now preserves interactive routes or live-data views for group notices, mute list,
parcel, transactions, teleport, diagnostics, object details, inventory details,
and notifications. A screen never invents a balance, parcel, resident, region,
or transaction when the protocol layer has not supplied one.

The remaining protocol gaps are capabilities rather than missing React screens:
teleport-home messaging, complete parcel/media workflows, full avatar shape editing
and local appearance baking. Server-side directory search, economy payments and local/session transaction records
and voice code now exist; live-grid validation and workflow completeness remain open. Their routes intentionally show connection/data state until a manager
receives those messages. This matches Lumiya's load-monitor pattern instead of
presenting design fixtures as successful responses.
