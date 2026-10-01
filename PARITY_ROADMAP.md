# Lumiya parity roadmap

What is left to bring Linkpoint to the behaviour of the Lumiya viewer it continues, what
blocks each item, and where Rust or Kotlin would actually help.

Reference: the recovered Lumiya sources (`Kaleaon/Lumiya-redux`, Java/Kotlin plus smali from
the original APK). Lumiya is a behavioural reference only; no recovered code is copied here.
`ROADMAP.md` is the original phase plan and its checkboxes are out of date; this file is the
current status. See also `LUMIYA_FEATURE_AUDIT.md` (screens), `LUMIYA_RENDERING_ANALYSIS.md`
(renderer facts checked against smali), `RENDERING_STATUS.md` and `TPV_COMPLIANCE.md`.

## How to read the status

| Status | Meaning |
| --- | --- |
| **Done** | Implemented and covered by automated tests. |
| **Partial** | Some of it works; the gap is stated. |
| **Not started** | No implementation found in this repo (checked by search, noted below). |
| **Blocked** | Cannot be done as stated; the blocker is named. |

**Verification debt that applies to everything below:** nothing has been run against a live
grid. Tests use stubs and synthetic data (node-metaverse objects, generated meshes, rendered
frames in headless Chromium). "Done" means the code paths behave as specified in those
tests, not that a real region has been seen working. The first real-grid session will find
things this list does not.

Asset policy for this project: text assets from Lumiya may be imported; binary assets
(animations, `.lbm`, `avatar.bin`, TGA/PNG) are not. That decides several rows below.

## Where things stand

| Area | Lumiya reference | Linkpoint | Status |
| --- | --- | --- | --- |
| Login, grid choice, `next_url` redirects | `slproto/auth`, login activity | Login with MFA token and saved MFA hash, structured failure reasons, login channel `Linkpoint Viewer` | **Done** |
| Viewer identity (TPV rule) | n/a | Channel patched into node-metaverse by `scripts/patch-metaverse.cjs` at install time | **Done**, but fragile (see Infrastructure) |
| Local chat, IM, group IM | `slproto/chat` | Handled on both backends (IM subscription present) | **Partial**: only text paths verified |
| Script dialogs and text-box dialogs | `SLChatScriptDialog`, `SLChatTextBoxDialog` | No subscription to node-metaverse's `onScriptDialog` in either backend session code, no UI | **Not started** |
| Teleport lures and requests | `SLChatLureEvent` family | No `onLure` subscription found | **Not started** |
| Inventory offers, group invites, group notices | `SLChatInventoryItemOffered*`, `SLChatGroupInvitationEvent` | No `onInventoryOffered`, `onGroupInvite`, `onGroupNotice` subscription found; friend requests are handled | **Partial** |
| Teleport (by name/coordinates), sit, stand, touch, L$ balance | `SLAgentCircuit`, `SLFinancialInfo` | Shared actions layer (`electron/sl-actions.cjs`) on web and Electron, with input validation | **Done** (stub-tested) |
| Inventory | `slproto/inventory` | In-memory tree and operations | **Partial**: folder responses merge rather than replace atomically, as `LUMIYA_FEATURE_AUDIT.md` notes |
| Mute list | `modules/mutelist` (fetched from and synced to the grid) | In-memory mute sets in `phase2/chat-extended.ts`; not synced with the grid's mute list, and whether every chat/IM path consults them was not verified | **Partial** |
| People/group/place search | `modules/search` | Session resident index only; no server-side search | **Partial** |
| Economy transactions, pay object | `modules/finance` | Balance only; no history, no pay | **Partial** |
| Terrain, prims, sculpts, LLMesh, textures | `render/`, `slproto/prims`, `slproto/mesh` | Rendered; prim meshes follow Second Life conventions (unit box, Z axis) after this branch's fixes | **Done** (synthetic data) |
| Sky, water, sun | `render/WindlightSky`, `slproto/windlight` | Windlight fallback day cycle from Lumiya's text presets, simulator environment when present | **Partial** (see Windlight below) |
| HUDs | `DrawableHUD`, attachment decode | Detection, ortho pass, touch, show/hide UI | **Done** (stub-tested); touch has no face/UV |
| Rigged mesh and avatars | `slproto/avatar`, `baker`, `render/avatar` | Mesh weights are decoded; nothing is skinned; avatars are placeholder capsules | **Blocked** on binary assets (below) |
| Animations, AO | `assets/anims` | AO screen is honest about being unavailable; no playback | **Blocked** on binary assets |
| RLV | `modules/rlv` (27 command classes) | UI-side restriction context exists (`src/viewer/RlvContext.tsx`) but nothing parses commands or feeds it | **Not started** (parser/controller) |
| Voice | `voice/webrtc`, `modules/voice` | Not implemented | **Not started** |
| Media on a prim / streaming media | `media/`, `StreamingMediaService` | Browser media pipeline for streaming; no MoaP | **Partial** |
| Texture upload, asset transfer (Xfer) | `modules/texuploader`, `modules/xfer`, `transfer` | Not found | **Not started** |
| Particles, flexible prims, texture animation, glow/shiny/bump | `prim_flexible.vsh` and others | Not rendered | **Not started** |

## What blocks what

### Avatars and animations: blocked by the binary-asset rule

Lumiya draws avatars from `avatar.bin`/`.lbm` mesh data and plays `.anim` files, all binary.
Without them there is no honest way to show a body. Options, in order of preference:

1. Keep the capsule placeholders (current) and label them as placeholders.
2. Generate avatar geometry from the open visual-param definition. `avatar_params.xml` is text
   and importable, but it only defines parameters; it does not contain the base meshes.
3. Ask the owner to relax the binary rule for specific files (their call, not ours).

Do not claim avatar or animation parity until one of those changes.

### Windlight

Done: bundled presets, Lumiya's scale/gamma rules, interpolation, sun direction, object ambient
and sun lighting.

Gaps, in order of value:

1. **Real sun phase.** Lumiya reads `SimulatorViewerTime.SunPhase`
   (`sunHour = SunPhase / 2π + 0.25`, fractional part). node-metaverse receives that message
   but only uses it for a clock offset. Expose it the same way `patch-metaverse.cjs` patches
   other behaviour, or contribute it upstream. Until then the fallback time of day is an
   estimate from the clock and may disagree with the region.
2. Sun/moon glow and the cloud layer (cloud cubemap is binary, so clouds need a text-only
   substitute, for example procedural noise).
3. Confirm `lightnorm` vs `sun_angle` conventions on a live region. The current sun direction
   derives from `sun_angle`/`east_angle`; Lumiya's `lightnorm` axes were not verified.

### RLV

Lumiya implements 27 command classes under `modules/rlv/commands` (detach, sendchat/sendim/recvchat/
recvim, tploc/tplm/tplure, sit/unsit/sittp, getstatus/getoutfit/getattach, redirchat, etc.).
`TPV_COMPLIANCE.md` section 4 makes enforcement mandatory once RLV is on. Plan:

1. A pure TypeScript parser and controller (`@command=param` grammar, restriction set per
   source object, `@clear`, `@version`/`@getstatus` replies). No native code needed; it is
   string handling and state, and it is easy to test exhaustively.
2. Feed `RlvContext` from the controller; make every restricted action check it at the point of
   the action (chat send, IM send, teleport, detach), not just in the UI.
3. Offer RLV as an explicit opt-in (Lumiya has `SLEnableRLVOfferEvent`).
4. Tests per command from Lumiya's behaviour, plus a conformance list against the public RLV API
   spec. Nothing here has been written.

### Events node-metaverse already provides

These have a library event but no subscription or UI in this repo, so they are TypeScript wiring
work, not protocol work: `ScriptDialogEvent`, `LureEvent`, `InventoryOfferedEvent`,
`GroupInviteEvent`, `GroupNoticeEvent`, `TeleportEvent`, `BalanceUpdatedEvent` (balance is
currently polled), `ParcelPropertiesEvent` on the Electron backend. Each needs a serializer in
both backends (they are duplicated; see Infrastructure), a bridge event, a store, and a screen.
The Lumiya chat-event classes are the behavioural spec for the UI.

### Rendering gaps worth doing next

- Per-triangle touch picking with face and UV (decoded mesh buffers are not kept after upload).
- Skinned rendering for rigged mesh (needs a skeleton, which is binary in Lumiya; may be
  derivable from the mesh's own skin block for attachment-style rigged objects).
- Sculpt orientation: which side is "front" per sculpt type is not checked against real sculpt
  maps; the invert flag flips it, and only that is tested.
- Normal mapping uses a crude perturbation, not tangent space.
- Level-of-detail selection: the decoder picks the highest available LOD only.

## Where Rust or Kotlin would help

Be selective: most of the gaps above are TypeScript wiring over node-metaverse and do not
benefit from another language. Native code earns its cost where there is compute or a native
boundary:

| Candidate | Why | Notes |
| --- | --- | --- |
| JPEG2000 decode | Currently pure JavaScript (`jpeg2000` package); slow for large textures | A Rust crate compiled to WASM (web/Electron) or a native module is a drop-in behind `decodeJPEG2000`. Measure first. |
| Mesh and sculpt decode | Runs through node-metaverse's decoder; fine | Only worth moving if profiling shows it blocks the UI. |
| PBKDF2 fallback | Done in `@noble/hashes` | No native code needed. |
| Avatar baking | Compositing layers is compute-heavy (`slproto/baker`) | Only relevant once avatars are unblocked. |
| Voice | WebRTC client (`voice/webrtc`); browsers have native WebRTC, native shells would need one | Largest unknown; protocol caps for voice are not exposed by node-metaverse. |
| Android shell | Kotlin is the platform language; `Lumiya-redux` already carries a Kotlin modernization plan (`docs/kotlin-migration-plan.md`) and a `rust-mirror/` | A separate effort from this React app; do not mix the two repos' goals. |

No Rust or Kotlin has been written for this repo. The earlier request to build gaps out "in Rust
or Kotlin as needed" was weighed per item above; none of the finished work needed it.

## Infrastructure

- **Duplicated backends.** `server.ts` + `src/server/sl-session.ts` (web) and
  `electron/viewer-session.cjs` (desktop) implement the same serializers and handlers.
  Shared pieces live in `electron/sl-actions.cjs` and `electron/sl-asset-decoder.cjs`. Moving
  serializers there too would remove a class of drift bugs.
- **Install-time patch.** The login identity and a friends fix are applied to node-metaverse's
  compiled output by `scripts/patch-metaverse.cjs`. A node-metaverse upgrade can silently break
  it; the `sl-login` test checks the installed library, which is the safeguard. Prefer an
  upstream option or a maintained fork.
- **Lockfile.** `bun.lock` is regenerated with Bun 1.4.2 (the `packageManager` version) and CI
  installs with `--frozen-lockfile`. Regenerate with the same Bun version.
- **xmlrpc git dependency.** node-metaverse depends on `github:CasperTech/node-xmlrpc`, which
  needs GitHub access to install.
- **Android build.** The debug APK workflow is wired; whether it succeeds end-to-end was still
  being observed when this was written.
- **Live testing.** None. A smoke checklist (login, MFA, teleport, HUD touch, sit/stand, chat,
  inventory fetch) against a real account or an OpenSim instance is the single most valuable
  next step.

## Deprecations and modernization

Done on this branch:

- GitHub Actions moved off Node 20 runtimes (checkout, setup-node, setup-java, cache v5;
  upload-artifact v6; download-artifact v7; action-gh-release v3).
- Removed the unmaintained `crypto-js` dependency. Its "fallback" in `offline/password.ts` was
  dead code (hashing would have thrown without WebCrypto); the fallback is now real, uses
  `@noble/hashes`, and is tested to produce records WebCrypto verifies.
- Replaced deprecated `String.prototype.substr` and `unescape()` in our own code.
- Orphan `LLSD-java` submodule removed; stale lockfile regenerated.

Remaining, none of it in our code:

| Item | Source | Action |
| --- | --- | --- |
| Kotlin deprecation warnings (`react-native-screens`) | Third-party, `node_modules` | Fixed upstream; take newer releases when compatible with the Expo/React Native versions in use. |
| `RawPropsParser` C++ deprecation (`expo-modules-core`) | Third-party | Same. |
| `glob@7`, `punycode` (DEP0040) warnings | Transitive, via node-metaverse and others | Cannot be fixed here without an upstream release or dependency overrides; overrides risk breaking the library. |
| WebGL1 path uses the `OES_vertex_array_object` extension | Our `graphics-3d.ts` | Only taken when WebGL2 is unavailable; not deprecated, and left alone. |

## Suggested order

1. Live smoke test against a real account or OpenSim (finds what the stubs hide).
2. Wire the existing node-metaverse events (script dialogs, lures, offers, invites, notices).
3. RLV parser and controller with enforcement, because it is a policy requirement once RLV
   scripts are encountered.
4. Real sun phase for Windlight.
5. Face/UV touch picking, grid-synced mute list (and checking every chat path honours it), server-side search.
6. Decide the avatar question (placeholders vs relaxed binary rule) before any avatar work.
7. Profile JPEG2000 decode; move it to WASM only if it is a measured bottleneck.
8. Voice, last: it has the most unknowns and needs a protocol path node-metaverse lacks.
