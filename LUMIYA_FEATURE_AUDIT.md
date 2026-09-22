# Lumiya Redux feature-parity audit

Reference: `Kaleaon/Lumiya-redux` at commit `b3048e878b83de8d89a984579719dc066cccee86`.
The comparison used the Android manifest, `NavDrawerAdapter`, and the activity/
fragment inventory. Lumiya is a behavioral reference only; no recovered code is
copied into this project.

## Primary navigation parity

| Lumiya surface | Linkpoint counterpart | Runtime source |
| --- | --- | --- |
| Login / grids | Login | `AuthManager`, custom grid state |
| Local chat / contacts | Chat / Friends / Groups | `ChatManager`, `FriendsExtended`, `GroupsManager` |
| World view | World | `WorldViewer`, WebGL scene |
| Objects | Radar / Objects | simulator `ObjectUpdate`, inventory object assets |
| Inventory / current outfit | Inventory / Outfits | inventory capability responses |
| Minimap | Map | simulator `RegionHandshake` |
| My avatar | Profile | authenticated user record |
| People search | Search | session resident index and friend requests |
| Settings | Settings | `PreferencesManager`, theme state |
| Sign out | Settings → Log out | `AuthManager.logout()` |
| Manage accounts | Accounts | remembered identity metadata, credential removal |
| Manage grids | Grids / Login | built-in and persisted custom grid registry |
| Streaming media | Media | native browser media pipeline |
| Notecard list/detail | Notecards | inventory asset metadata |

## Secondary surfaces found in Lumiya

Linkpoint now preserves interactive routes or live-data views for group notices, mute list,
parcel, transactions, teleport, diagnostics, object details, inventory details,
and notifications. A screen never invents a balance, parcel, resident, region,
or transaction when the protocol layer has not supplied one.

The remaining protocol gaps are capabilities rather than missing React screens:
server-side people search, economy transaction history, parcel-property updates,
teleport-home messaging, media parcel metadata, voice, and full avatar appearance
baking. Their routes intentionally show connection/data state until a manager
receives those messages. This matches Lumiya's load-monitor pattern instead of
presenting design fixtures as successful responses.
