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
  against an independent evaluation of the inverse DCT, not against a layer from a live grid. Tree sway,
  water motion (`gSky.setWind`) and the ambient wind sound do not use it yet.
- Voice reconnect: the schedule is the viewer's (`RetryBackoff`), but the triggers are browser ones
  (peer `failed`, data channel closed unasked) because a browser has no renegotiation callback.

## Not implemented

- Voice: neighbouring-region connections, push-to-talk, mute click-fade,
  device settings UI.
- Sound: `SYNC_MASTER` / `SYNC_SLAVE` alignment, wind and footsteps, attachments sounding from their
  avatar's position, the grid mute list (a hook exists: `AudioManager.setPolicy`), parcel
  "local sound" data (the hook exists; nothing supplies it yet), collision-sound list.
- Controls: camera commands (`spin_*`, `pan_*`, `move_*`) from the key table, gamepad, mouselook.
- RLV: not part of the official viewer, so no official specification exists to follow.

## Not verified

- Nothing has been run against a live grid or voice server.
- The mapping from agent control flags to the LSL `CONTROL_*` constants a script sees. The constant
  values are in `slua/builtins.txt`, but the mapping is not in any official source we can read.
