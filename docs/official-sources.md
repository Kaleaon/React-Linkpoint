# Official Second Life sources

Everything in the viewer standards modules comes from Linden Lab's own repositories, read at the
commits below. Nothing is taken from memory, third-party viewers or community wikis. Where a fact
could not be found in an official source it is left out and listed under "Not verified".

| Repository | Commit read | Used for |
| --- | --- | --- |
| [secondlife/viewer](https://github.com/secondlife/viewer) | `7dd6de6120ce` (2026-10-07) | controls, key bindings, voice, sound |
| [secondlife/slua](https://github.com/secondlife/slua) | `444f8e4bd1ae` (2026-10-05) | LSL constants and function signatures (`builtins.txt`) |
| [secondlife/lsl-definitions](https://github.com/secondlife/lsl-definitions) | `995b8829f5e5` (2026-10-08) | the canonical LSL/SLua definitions (not yet mined) |
| [secondlife/python-llsd](https://github.com/secondlife/python-llsd) | `7730e2ea69dd` (2026-07-23) | LLSD reference (not yet used) |

The organisation's repository list could not be fetched from here (the API and web listing are
blocked), so these were found by probing likely names. Other official repositories may exist.

## What came from where

| Module | Source file(s) in `secondlife/viewer` |
| --- | --- |
| `src/linkpoint/agent-controls.ts` | `indra/llcommon/indra_constants.h` (all 32 `AGENT_CONTROL_*` values), `indra/newview/llviewermessage.cpp` (`AU_FLAGS_*`), `llagent.cpp` (`resetControlFlags`), `llviewerinput.cpp` (nudge 0.25 s, fly 0.5 s, tap-tap-hold run, `toggle_run`, `toggle_fly`, `stop_moving`) |
| `src/linkpoint/key-bindings.ts` | `indra/newview/app_settings/key_bindings.xml`: all four modes, 138 entries, compared entry by entry |
| `src/linkpoint/voice-protocol.ts`, `voice.ts` | `indra/newview/llvoicewebrtc.cpp` / `.h`, `indra/llwebrtc/llwebrtc.cpp`: capabilities, `SLData` channel, spatial message, join, mute and gain, STUN hosts, Opus SDP, ear locations, 50 m tether |
| `src/linkpoint/particles.ts` | `indra/llmessage/llpartdata.h` / `.cpp` (flag and pattern bit values, block layout), `indra/newview/llviewerpartsource.cpp` (`LLViewerPartSourceScript::update`: burst timing, patterns, rotation), `llviewerpartsim.cpp` (`LLViewerPartGroup::updateParticles`: wind, target, motion, bounce, interpolation), `app_settings/settings.xml` (`RenderMaxPartCount` 4096) |
| `src/linkpoint/flexible.ts`, `sl-math.ts` | `indra/newview/llflexibleobject.cpp` (`doFlexibleUpdate`, `remapSections`), `indra/llprimitive/llprimitive.cpp` (`LLFlexibleObjectData::unpack`, tension cap 0.99), `indra/llmath/llquaternion.cpp` / `v3math.cpp` (quaternion conventions) |
| `src/linkpoint/sound-standards.ts`, `audio.ts` | `indra/llcommon/lldefs.h` (sound flags), `llviewermessage.cpp` (`process_sound_trigger`, attached-sound handlers, postponed sounds), `llviewerobject.cpp` (`setAttachedSound`), `llaudiosourcevo.cpp` (cut-off radius, parcel and mute rules), `llviewerparcelmgr.cpp` (`canHearSound`), `llmessage/llregionhandle.h`, `llvieweraudio.cpp` (levels, rolloff), `app_settings/settings.xml` (`AudioLevel*`, `Mute*`, `UISnd*`) |

## Known differences from the official viewer

- Voice: the viewer sends `volume * 220` for a per-person gain change but `volume * 200` when
  re-sending a stored gain on join (both in `llvoicewebrtc.cpp`). We use 220 for both.
- Voice: the viewer's SDP rewrite appends its `fmtp` after the original on one line; we replace the line.
- Voice: the default ear is the avatar, not the camera, because a camera quaternion in the SL frame
  is not available; set `EarLocation.Camera` once it is.
- Particles: the distance and pixel-size throttles and HUD particles are not implemented.
  `ANGLE_CONE_EMPTY` emits nothing special,
  as in the viewer.
- Flexible prims: the viewer's distance-based update throttling is not implemented; twist and taper are
  baked into the mesh, not applied per section.
- Sound: the ear follows the camera (the viewer's default); Doppler is not available in Web Audio.

- Wind: the viewer starts a region with a 0.5 grid before its wind layer arrives; here there is no wind
  until a layer has been decoded (`RegionWind.loaded`). Only the current region's layer is used, and the
  region width is assumed to be 256 m. The decoder and lookups are in `src/linkpoint/wind.ts` (from
  `patch_code.cpp`, `patch_idct.cpp`, `llbitpack.h`, `llvlmanager.cpp`, `llwind.cpp`); the tests check it
  against an independent evaluation of the inverse DCT, not against a layer from a live grid.
- Wind effects the viewers do not have: water, trees and ambient sound are **not** wind-driven in the viewer source. `gSky.setWind`
  only stores the wind's length and nothing reads it (`llvosky.cpp`); `LLVOTree` reads the wind into `mWind` but never uses it and
  never changes its trunk bend (`llvotree.cpp`); the ambient wind sound (`audio_update_wind`) is inside `#ifdef kAUDIO_ENABLE_WIND`,
  which nothing defines. So there is no official behaviour to port, and none was invented. Particles and flexible prims do use the wind.
- Voice reconnect: the schedule is the viewer's (`RetryBackoff`), but the triggers are browser ones
  (peer `failed`, data channel closed unasked) because a browser has no renegotiation callback.
- Voice channel: chosen from the parcel as `voiceConnectionStateMachine` does (own channel, estate channel, or none from
  `PF_ALLOW_VOICE_CHAT` / `PF_USE_ESTATE_VOICE_CHAN`). The region-wide "voice enabled" flag is not consulted.
- Cross-region voice: on the estate channel only, as in the viewer, listen-only connections to the neighbouring regions within 100 m.
  The viewer promotes a neighbour's connection when the avatar crosses a border; here the connections are rebuilt for the new
  region (a short gap). Neighbours are found from the event queue (`EnableSimulator`, `EstablishAgentCommunication`) by wrapping
  the library's event-queue function, and a neighbour is never forgotten before logout (the viewer drops one on
  `DisableSimulator`). Neighbour regions are assumed to be 256 m wide.
- Push-to-talk: the viewer's logic (`LLVoiceClient::updateMicMuteLogic`, `inputUserControlState`, `toggle_voice`, `voice_follow_key`).
  Middle mouse toggles; no key is bound to `voice_follow_key` by default (the viewer's key table has none either). The Firestorm-only
  mic-toggle click sound is not played.
- Grid mute list: `MuteListRequest`, the Xfer download (`llxfermanager.cpp`), `UpdateMuteListEntry`/`RemoveMuteListEntry`, and the flag rules of
  `LLMuteList`. No on-disk cache is kept, so the CRC sent is 0 and the simulator always sends the list; it sends nothing when the account has none,
  which shows as a failed load after 15 s. Muting particles by owner is not applied (the particle data carries no owner).
- Sound-local parcels: `ParcelOverlay` and the agent parcel's bitmap and flags (`canHearSound`). Only the current region's overlay is known, so
  a sound in another region is treated as being in an ordinary parcel.
- Gamepad: the viewer has no gamepad support, only six-axis joystick support (`LLViewerJoystick`). `moveAvatar` is ported (`joystick.ts`);
  the browser gamepad's mapping onto its six axes is ours, and the rotation scales are the viewer's SpaceNavigator defaults for macOS/Linux
  (`setSNDefaults`) because the plain `settings.xml` values make a full-stick turn fall inside the dead zone it applies while walking. Pitch is
  computed but not applied; turning is the on/off turn flag; `mPerfScale` is 1. Off until enabled in Settings.
- Camera key commands and mouselook were added in the same session by another change (`camera-keyboard.ts`).

## Not implemented

- Voice: mute click-fade, device settings UI.
- Sound: `SYNC_MASTER` / `SYNC_SLAVE` alignment, footsteps, attachments sounding from their
  avatar's position, collision-sound list.
- Controls: 6-axis joystick (SpaceNavigator) hardware, flycam and build-mode joystick modes.
- RLV: not part of the official viewer; implemented from Firestorm's RLVa instead, see [rlv.md](rlv.md).

## Not verified

- Nothing has been run against a live grid or voice server.
- The mapping from agent control flags to the LSL `CONTROL_*` constants a script sees. The constant
  values are in `slua/builtins.txt`, but the mapping is not in any official source we can read.
