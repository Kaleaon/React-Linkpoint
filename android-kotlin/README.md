# Linkpoint for Android (native Kotlin)

A native Android build of Linkpoint, a Second Life / OpenSim viewer, written in Kotlin with Jetpack
Compose and Filament. It is a standalone Gradle project: it does not use React Native, Expo or
`node-metaverse`, so the Second Life protocol is implemented here.

```
android-kotlin/
  core/       pure JVM library: protocol, decoders, geometry, session state (unit + end-to-end tested)
  app/        Android app: Compose UI, Filament renderer, foreground service
  mockgrid/   runnable fake grid for development (also used by the tests)
  materials/  Filament material sources (.mat) – compiled .filamat files live in app/src/main/assets
  tools/      OpenJPEG fixture generator, TypeScript reference script for the environment tests
```

## Build and test

Requirements: JDK 21 and the Android SDK (platform 35, build-tools 35). Set `sdk.dir` in
`local.properties` or `ANDROID_HOME`.

```bash
cd android-kotlin
./gradlew :core:test            # 210 tests run, 20 more (live OpenSim / Second Life) skip unless their environment is set; includes full sessions against the mock grid
./gradlew :app:assembleDebug    # app/build/outputs/apk/debug/app-debug.apk
```

Release builds are signed with the debug key unless you configure a keystore; Google Play will
reject that. CI (`.github/workflows/android-kotlin.yml`) runs the tests and builds the debug APK.

### Developing without a grid

```bash
./gradlew :mockgrid:run --args="10.0.2.2"     # 10.0.2.2 is how an emulator reaches this machine
```

Debug builds list **Mock grid (development)** in the login screen (any name and password). The mock
region has terrain, prims of every shape family, a mesh, a sculpt, textures, a particle emitter, a
linkset, two avatars, a moving object, an inventory, groups, a parcel and a chat bot. Debug builds
can also be driven from adb:

```bash
adb shell am start -n app.linkpoint.viewer/.MainActivity \
  --es debug_grid mock --es debug_name "Mock Resident" --es debug_password pw --es debug_tab WORLD
```

## What works

| Area | Status |
| --- | --- |
| Login (XML-RPC, MFA token + remembered device hash, start location, grid redirects, structured failures), grids: Agni, Aditi, OSgrid, Kitely | Implemented; unit tested, and tried against a real OpenSim 0.9.3 (login, wrong password as a structured failure, relogin). **Never tried against Second Life** (see "Second Life live test" below). |
| UDP circuit: sequence numbers, reliable delivery with resends, acks, ping, duplicate suppression, zero-coding; message numbers taken from the official `message_template.msg` | Implemented; tested over loopback against a fake simulator |
| Region entry, teleport (by name, home, to a lure), local teleport, region crossing, event queue, capabilities | Implemented; unit tested against fake simulators, **and verified against a real two-region OpenSim**: teleport by name both ways, home, within a region, walking over the border, lure acceptance across regions. Neighbouring regions get child circuits when the grid announces them (`EnableSimulator`), a teleport the grid accepts but never completes is re-requested once, and a teleport waits briefly for new neighbours to settle (all found by live testing; see `ViewerSession`) |
| Local chat, instant messages, L$ balance, friends with presence, nearby avatars (radar), world map tiles | Implemented; chat, IM both ways, friends and radar verified against a real OpenSim with two avatars (the radar had a real bug here: the id list in `CoarseLocationUpdate` includes you) |
| Friend requests (send, accept, decline, "accepted" notices) and teleport offers (send, accept, decline) | Implemented and verified live between two avatars |
| Inventory browser (login skeleton + `FetchInventoryDescendents2`), groups list, parcel info, avatar profiles, nearby-objects list | Implemented read-only; inventory root fetch and profiles verified live |
| Contacts (device-local, links to Telegram / Discord / web) and `.ics` calendar events | Implemented |
| Object sounds: looping and play-once sounds carried by objects, `AttachedSound` / gain change / preload messages, one-shot `SoundTrigger`s; sound data via `ViewerAsset` (`?sound_id=`), Ogg Vorbis checked and sized from its headers | Implemented in `core` (tested, incl. against real OpenSim: sounds arrive, download, are placed) and played in the app with `SoundPool` (**compiles; not run on a device**) |
| 3D (spatial) audio: inverse-distance rolloff, the script "radius" as a cube, constant-power left/right panning from where you face, loudest-N channel limit, linksets/attachments through their parents | Implemented in `core` as `SpatialAudio` + `SoundScene` and unit tested (including a pan-law mutation check). It is a plausible model, not a copy of any viewer's mixer; no doppler, occlusion, reverb or HRTF |
| Parcel music stream and parcel media (URL, texture, type, size, loop, simulator play/pause/stop/loop/seek commands) | State and commands implemented and tested (also live: URL, texture id and music stream arrive from OpenSim; OpenSim 0.9.3 does not carry the media type/size/loop through an OAR). Audio-only media and the music stream play with `MediaPlayer`; video and web pages are handed to another app. **Playback not run on a device** |
| Rigged ("skinned") meshes | Rig (joints, bind matrices) and per-vertex weights are decoded and verified against a real OpenSim; **not drawn or animated** (avatars are still capsules) |
| 24 colour packs from the web app | Implemented |
| 3D world: object updates (full, compressed, terse, cached, kill), linksets, prims (all profile/path families with cut, hollow, twist, taper, shear, revolutions), LLMesh assets, sculpts, texture entries (colour, texture, repeat/offset/rotation, glow, fullbright), terrain (LayerData decode, height/noise composition, detail textures), JPEG 2000 textures, particles (legacy particle systems), region sky/water (EEP day cycle, Windlight fallback), orbit camera, on-screen walk/fly controls | Implemented in `core` (tested) and `app` (Filament; see below) |
| JPEG 2000 decoder | Written from the spec; **bit-exact against OpenJPEG** on 39 streams covering all progression orders, tiles, precincts, layers, every code-block mode, odd origins and reduced resolution; within one level on lossy streams |
| Environment maths | Checked number-for-number against the TypeScript implementation in `src/linkpoint/eep.ts` / `atmosphere.ts` |

### Verification status – please read

* `core` is covered by unit tests and one end-to-end test that runs the real login, UDP session,
  terrain, objects, capability downloads and decoders against `MockGrid` over real sockets.
* The Filament renderer (`app/.../world`) **compiles and was written against Filament's documented
  API, but it has been exercised only in an emulator without GPU acceleration** (see the release
  notes in the pull request for what was observed). It has not been run on a physical device, and
  frame rate on real hardware is unknown.
* The viewer core has been run against a **real OpenSim 0.9.3** (`tools/opensim/live.py`, 19 live tests, 18 of which ran and passed; see below),
  which found and fixed real bugs the fake grid could not (radar ids, region crossing, teleport races, dropped
  handshake replies, local-teleport position). **Nothing has been run against Second Life** yet.
* The app **compiles and the debug APK builds** (Android SDK 35), but the sound and media playback code
  (`app/.../audio`) has not been run on a device or emulator, so whether it is audible is unverified. Only the
  logic that decides *what* plays, *where* and *how loud* is tested (in `core`, with a recording backend).

## What is not done

* **Voice.** Not implemented. Second Life voice now runs over WebRTC with signalling through the
  `ProvisionVoiceAccountRequest` / `VoiceSignalingRequest` capabilities and a WebRTC native
  library; none of that exists here, and it cannot be built or checked without a real grid.
* **Avatars.** Avatars are drawn as placeholder capsules. There is no skeleton, no baked-texture
  composition, no shape sliders, no animation, and attachments (anything parented to an avatar,
  including rigged mesh and HUDs) are not drawn. Rigged meshes are decoded (joints and weights) but nothing skins them yet.
* Flexible prims, texture animation, bump/shiny and PBR materials, shadows, reflections, clouds,
  alpha sorting beyond Filament's default, normal maps.
* Texture *upload*, inventory editing, outfits, profile editing, search, mute list, group chat and
  group notices, notecard viewing, media on a prim (MoaP), video inside the viewer (parcel video/web media is opened in another app), RLV, object touch/sit/edit,
  teleport lure *requests*, groups and money transactions beyond the balance. Sound: no doppler/occlusion, no UI sounds or gestures, no sound *upload*; background playback relies on the existing foreground service (type `dataSync`, not `mediaPlayback`) and is untested.
* Prim geometry approximations (documented in `PrimVolume`): hole-size scaling on circular paths
  uses a fixed torus proportion, radius offset and skew are ignored, and a sphere profile with path
  cuts is left open. These have not been compared with the official viewer.
* The sky falls back to eight Windlight presets at a time of day **estimated from the clock** when
  the region sends no environment, so it can disagree with the region's real sun.

## How it fits together

* `core/net` – packet codec, message definitions (`Msg`, `Messages`), `Circuit` (UDP + reliability),
  `Caps` / `EventQueue`.
* `core/ViewerSession` – owns the circuit and exposes state as `StateFlow`s (chat, friends, nearby,
  region, balance, inventory, groups, parcel, offers, environment, scene, heightmap).
* `core/scene` – `ObjectDecoder`, `SceneStore`, `PrimVolume`, `LlMesh`, `Sculpt`, particles.
* `core/image` – `J2kDecoder`, `TextureFetcher`.
* `core/terrain`, `core/env` – terrain codec and composition; sky/water/light model.
* `app/world` – `WorldRenderer` (Filament engine, scene sync, camera), `Materials`, `Terrain`,
  `EnvironmentRenderer`, `ParticleBatch`, `GpuTextures`.

### Materials

`prim`, `particle` and `flat` materials are compiled here with Filament 1.53.4's `matc`:

```bash
matc --platform mobile --api opengl --feature-level 1 -o app/src/main/assets/materials/prim.filamat materials/prim.mat
```

`sky`, `water` and `terrain` are the web renderer's materials, built with the same `matc` version
and flags, so both clients share them. The runtime (`filament-android`) must be the same version.

### Regenerating test fixtures

* `tools/j2k/make-fixtures.sh` rebuilds the JPEG 2000 streams and their OpenJPEG reference decodes
  (needs `libopenjp2-dev` and ImageMagick).
* `tools/env_ref.ts.txt` is the script (run with `tsx`) that produced
  `core/src/test/resources/env_ref.json` from the TypeScript environment code.

Cleartext HTTP is allowed (`usesCleartextTraffic`) because OpenSim grids commonly log in over plain
HTTP; Second Life's own grids use HTTPS.

## Testing against a real OpenSim (automated)

    python3 tools/opensim/live.py                 # everything below, then stops OpenSim; exit code = result
    python3 tools/opensim/live.py --tests '*OpenSimLiveSessionTest.teleport*'   # only some tests (--tests may be repeated)
    python3 tools/opensim/live.py --no-tests      # boot and populate OpenSim, leave it running (login http://127.0.0.1:9002/)
    python3 tools/opensim/live.py --big           # also downloads (cached, 770 MB) and loads a real-world OAR and runs the big-content test
    python3 tools/opensim/live.py --oar X         # load your own OAR (.oar/.tgz) and run the big-content test on it
    python3 tools/opensim/live.py --keep          # leave OpenSim running afterwards

The script downloads OpenSim 0.9.3.0 (with `curl`, so proxies work), configures a standalone grid with **two regions** ("Test Isle",
"Neighbour Isle" to its east), makes Test Isle the default region (that is what gives new accounts a **home**), enables the
**profile service**, answers the first-run prompts, creates **two accounts** ("Linky Tester" / "testpass1", "Linky Friend" /
"testpass2"), builds a test OAR (`./gradlew :mockgrid:runOar`: prims, mesh, sculpt, a rigged limb mesh, particles, a looping
**speaker**, a short-range **chime**, a media **parcel**), loads it, runs the live tests through Gradle and stops OpenSim. It needs python3, a
JDK, curl, the .NET 8 runtime and libgdiplus (`apt-get update && apt-get install -y dotnet-sdk-8.0 libgdiplus`). The live tests are
skipped by an ordinary `./gradlew :core:test` unless `OPENSIM_LOGIN_URL` is set. CI: `.github/workflows/opensim-live.yml` runs all of
this nightly, on demand, and on pull requests that touch `core`, `mockgrid` or `tools/opensim`.

What the live tests cover on a real OpenSim (19 exist; the last run passed 18 and skipped the big-content one, which needs `--big`):

| Area | Tests |
| --- | --- |
| Login | wrong password is a structured failure; log out and in again; login, terrain, caps, objects |
| Content | prims, mesh, sculpt, textures, particles streamed and decoded; a rigged mesh keeps its rig through `GetMesh2` |
| Movement | teleport within a region; to the neighbour and back by name; **home**; walking over the east border |
| Social (two avatars) | IM both ways; friend request, accept, both become friends; teleport offer accepted (crossing regions); radar with names; profile of another resident |
| Own data | chat echo; inventory root fetch; own profile |
| Sound and media | object sounds arrive in updates, download through `ViewerAsset` and are placed in 3D; parcel music and media arrive |

Things the live runs taught us about OpenSim 0.9.3 (each is handled in the viewer or the setup, and commented where it is):
a teleport can be accepted yet the arrival connection dropped when the destination still holds a stale presence of ours (the viewer
re-requests once and ignores the grid's late `TeleportFailed` for the replaced attempt); opening a child circuit while a teleport
into that region is under way makes it fail; the first teleport request right after arriving races the new region's neighbour
announcements; `CoarseLocationUpdate` lists an id for *every* location including yours; it ignores a parcel's media type / size / loop
from an OAR; OAR object sound element is `<SoundID>`, parcel files use plain UUID text and `MediaDesc/MediaH/MediaW`. OpenSim has no
Second Life MFA, so the MFA path is only tested against a fake login server (`LoginTest`).
The MFA hash is stored encrypted with an Android Keystore AES-GCM key (`SecretStore`), keyed per grid and normalised account.

### Second Life live test (needs credentials)

`SecondLifeLiveTest` logs in to the main grid, streams the region, fetches the inventory root and logs out. It prints **only counts**
(this repository and its Actions logs are public) and sends no chat, teleports or messages. It is skipped unless `SL_USERNAME` and
`SL_PASSWORD` are set. `.github/workflows/live-secondlife.yml` runs it with the repository secrets `USERNAME` and `PASSWORD`; it is
`workflow_dispatch` only (never on pull requests, so forks cannot reach the secrets) and GitHub can only dispatch it once the workflow
file is on the default branch. **It has not been run.**

### Content test against OpenSim (generated OAR)

`./gradlew :mockgrid:runOar --args=/tmp/linkpoint-test.oar` writes an OAR (12 objects: box, cylinder, sphere, torus, hollow/twisted/tapered
box, triangle prism, glow cube, sculpt, LLMesh, a 3-prim linkset, floating text, a particle emitter; 4 assets). Load it with the OpenSim
console command `load oar --merge /tmp/linkpoint-test.oar`, then run `OpenSimLiveTest.streamsAndDecodesRegionContent`.

Verified against real OpenSim 0.9.3.0: all 14 prims (12 + 2 linkset children) streamed with correct positions, scales, parent ids
and text; particle block parsed; every shape built geometry; textures downloaded through GetTexture and decoded (128x128, 8 mips);
the LLMesh downloaded through GetMesh2 and decoded; the sculpt map downloaded and turned into a 32x32 vertex grid.
Limits: the generated mesh has a single LOD and no skinning, the textures are tiny, and nothing here shows how it *looks*
(the Filament view has not run on a device). A real-world OAR (multi-LOD meshes, large JPEG 2000 textures, many objects) has not been tried:
the usual download sites were unreachable from the build sandbox. Load any OAR you have the rights to the same way and rerun the test.

### Real-world content test (Outworldz "Furniture Vault" OAR)

Loaded `OAR-Furniture_Vault(1X1).tgz` (770 MB, from outworldz.com's free OAR list; not committed here) into OpenSim 0.9.3.0 and ran
`OpenSimLiveTest.realWorldContentSummary` (`OPENSIM_BIG=1`, `OPENSIM_ASSET_IDS=<ids held by the archive>`, see the test header).
Measured on this sandbox (no GPU involved):

| | result |
|---|---|
| objects streamed | 15,139 (3,823 roots + 11,316 linked children) in ~60 s, none dropped |
| kinds | 1,714 plain prims, 13,334 mesh, 91 sculpts, 35 particle emitters, 32 with floating text |
| prim geometry | all 1,714 built, 211k triangles, ~260 ms total |
| meshes | 1,118 / 1,118 archive-held meshes decoded, 6.37M triangles (3rd-party multi-LOD meshes) |
| textures | 399 / 400 sampled decoded (342 at 512x512 after reduction); 1 was a 0-byte file inside the OAR |
| sculpt maps | 5 / 5 |

What it found and fixed: one mesh in the archive is truncated (header promises a high LOD past the end of the file). The decoder
now falls back to the next level that is intact instead of failing the object (unit test added). The run also ran the test JVM out of
memory because decoded textures were cached forever; the app now releases the CPU copy once a texture is on the GPU.

Not covered: most of the archive's mesh/texture references (11,097 mesh ids, 17,844 texture ids) point to assets the OAR does not
contain, so those 404 by design and were not exercised. Rigged meshes are now decoded and counted by this test (`LIVE rigged meshes: …`) but that line has not been captured from this archive yet; animations were not looked at.
GPU memory is still unbounded (no eviction of uploaded textures/meshes) and the renderer's object cap (1,500 objects within 192 m) is
the only brake; neither has been measured on a device, and the Filament view still has not been run on any device or emulator.
