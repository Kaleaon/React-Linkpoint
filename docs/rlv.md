# RLV (RestrainedLove)

RLV is **not part of the official Linden viewer**; there is no Linden specification. This implementation follows
Firestorm's RLVa (`Kaleaon/phoenix-firestorm-jules`, files `indra/newview/rlv*.cpp|h`, `llviewermessage.cpp`,
`fsnearbychathub.cpp`, `llagent.cpp`, `skins/default/xui/en/rlva_strings.xml`), which is (c) Kitty Barnett under
LGPL 2.1. It reports RLV 3.4.3 / RLVa 2.4.2, the versions that source reports.

It is off by default. Settings → Privacy → RestrainedLove (RLV) turns it on; turning it off, logging out, or
reconnecting forgets every restriction.

## Where it lives

| File | What |
| --- | --- |
| `src/linkpoint/rlv-data.ts` | Command dictionary (174 names with their `n/y`, force and reply forms, strict and deprecated flags), synonyms, anonyms and the strings from `rlva_strings.xml` |
| `src/linkpoint/rlv-handler.ts` | Parser, per-object restriction table, reference counting, exceptions (strict, permissive), modifiers, `@clear`, reply and force commands, and the decisions the rest of the viewer asks |
| `src/linkpoint/rlv.ts` | `RlvController`, the small API `src/viewer/RlvContext.tsx` uses, now backed by the handler (it used to answer `@version` with an invented string) |

## What is enforced

* Commands: `llOwnerSay("@a=n,b=y,...")` only (chat type "owner say", leading `@`, longer than 3 characters). The line is never shown.
* Chat out: `@sendchat`, `@emote`, `@redirchat`, `@rediremote`, `@chatnormal/@chatshout/@chatwhisper`, `@sendchannel(_except)`. Chat in: `@recvchat(from)`, `@recvemote(from)`.
* IMs: `@sendim(to)`, `@recvim(from)`, `@startim(to)`, with exceptions and distance ranges.
* Names and location: `@shownames`, `@shownametags` (decision only), `@showloc` (region and parcel names in chat).
* Movement: `@fly`, `@jump`, `@alwaysrun`, `@temprun` on the keyboard controls; `@unsit`, `@sit` on the sit and stand actions; `@tploc`, `@tplm`, `@tplure` on teleport and accepting a lure.
* Replies on their channel (shouted, like the viewer): `@version`, `@versionnew`, `@versionnum[:impl]`, `@getstatus`, `@getstatusall`, `@getcommand`, `@getgroup` (needs the group name hook), `@getsitid` (needs the sit hook), `@getcam_*` for values set by `@setcam_*`.
* Force: `@fly`, `@unsit`, `@sit`, `@sitground`, `@tpto` through environment hooks (see below).
* `@notify`: registrations are kept and `RlvHandler.notify()` sends to them; nothing calls it for events yet.

## Decisions available but not yet asked by any screen

`canTouch`, `canInteract`, `canEdit`, `canSit(obj)`, `canShowHoverText`, `canShowNameTag`, `canShowName`, `canGiveInventory`,
`canPayAvatar/Object`, `canRez`, `canBuild`, `canShowInventory`, `canShowWorldMap`, `canShowMiniMap`, `canShowLocation`,
`canPreviewTextures`, `canPlayGestures`, `autoAcceptTeleportOffer/Request`. They are ports of RLVa's `RlvActions` and are tested, but the
object, inventory and map screens do not consult them yet, so those restrictions are recorded and reported but **not enforced**.

## Not supported (reported honestly, never faked)

* Anything needing the worn outfit or the inventory: `@attach*`, `@detach*` (recorded, not enforced), `@remoutfit`, `@getoutfit`, `@getattach`, `@getinv*`, `@findfolder*`, `@getpath*`, folder locks, `#RLV`. Force and reply forms answer `FAILED_UNSUPPORTED`; reply commands still send an empty answer so scripts do not hang.
* Camera and render effects: `@setcam_*` force forms, `@setoverlay`, `@setsphere`, `@setenv`, `@setdebug`, `@camzoom*` (modifier values are stored and `@getcam_*min/max` reads them back; nothing applies them to the camera).
* `@getcam_fov`, `@getcam_avdist`, `@getheightoffset`, `@adjustheight`, `@setgroup`.
* The virtual joystick and touch controls are not gated by `@fly`, `@jump` or `@alwaysrun`.

## Known differences from RLVa

* The viewer does not report whether the avatar is sitting, so `@unsit` assumes it is when the hook is missing. With `@unsit=n` this blocks teleports and standing even when not seated.
* Teleports are gated by `@tploc` only (the viewer API has no position to test `@tplocal`/`@sittp` distance against), and `@tpto` global coordinates need the `teleportToGlobal` hook, which is not wired.
* Debug output (`RestrainedLoveDebug`) is an event, not chat text.
* No IM-query support (`@version`, `@list`, `@stopim` sent as IMs).

## Environment hooks

`RlvHandler` takes an `RlvEnvironment` (`selfId`, `sendChat`, `sendInstantMessage`, `avatarDistanceSquared`, `nearbyAvatars`, `locationNames`, `activeGroupName`, `sitObjectId`, `isSitting`, `stand`, `sit`, `sitOnGround`, `setFlying`, `isFlying`, `teleportToGlobal`, `teleportToRegion`, `isOwnAttachment`). Wired in `app.ts`: `selfId`, `sendChat`, `sendInstantMessage`, `avatarDistanceSquared`, `nearbyAvatars`, `locationNames`. A command that needs a missing hook fails with `FAILED_UNSUPPORTED`.
