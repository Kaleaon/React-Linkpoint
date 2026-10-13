# Linkpoint Viewer

A Second Life communicator and viewer utility suite packaged as a Progressive Web App.

## Local development

**Prerequisites:** Node.js 22+

### Codex / fresh checkout setup

Copy the contents of `scripts/codex-setup.sh` into the Codex setup-script field,
or run it from anywhere inside the checkout. It fetches the exact Bun binary
through npm's user cache (without requiring a global or privileged install),
installs locked dependencies, creates a credential-free local environment
file. Add `--check` to run the TypeScript check, complete Vitest suite, and
production web build:

```bash
./scripts/codex-setup.sh --check
```

The script is self-contained and does not call another test/setup script (it only runs the dependency patcher `scripts/patch-metaverse.cjs`, and falls back to npm if Bun cannot fetch GitHub dependencies). Use
`./scripts/codex-setup.sh --skip-check` when a Codex environment should only be
provisioned, then re-run with `--check` to validate it. The automated checks
do not need Second Life or Gemini credentials. The setup intentionally skips
the Electron runtime download because the standard checks do not launch
Electron; omit `ELECTRON_SKIP_BINARY_DOWNLOAD` and reinstall dependencies when
interactive desktop testing is required.

### Manual setup

1. Install dependencies:
   ```bash
   bun install --frozen-lockfile
   ```
2. Create a local env file:
   ```bash
   cp .env.example .env.local
   ```
3. Start the dev server:
   ```bash
   bun run dev
   ```

### Google AI Studio preview

Run the full-stack app with `npm run dev`; the Express server serves both the viewer
and its API on port 3000 (or `PORT` when set). Gemini credentials are optional for
the viewer and are only used by the server-side LLSD assistant.

If AI Studio reports `[vite] failed to connect to websocket` or
`WebSocket closed without opened`, use `npm run dev:aistudio`, or set
`DISABLE_HMR=true` and restart `npm run dev`. This disables Vite's live-reload and
console WebSocket transport; reload the preview after editing files. This mode is
also selected automatically when `APP_URL` is an AI Studio `ais-dev-*.run.app`
preview URL. Normal development shares Vite's socket with the app's HTTP port.

Embedded previews that deny browser storage still load the viewer. Preferences,
contacts, notices and cache data can remain in memory for that session; reloads
cannot preserve data when persistent storage is unavailable.

If Vite reports `Blocked request. This host ... is not allowed`, add the exact
preview hostname using `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` in the server's
environment, then restart `npm run dev`.

## Packaging

`.github/workflows/release.yml` builds every distributable package. It runs on
pushes to `main`, on `v*` tags, and on demand from the **Actions** tab (where a
dropdown lets you build a single platform instead of all of them).

| Package | Built on         | Produces                                                                      |
| ------- | ---------------- | ----------------------------------------------------------------------------- |
| Web     | `ubuntu-latest`  | `Linkpoint-<version>-web.zip` (the `dist/` PWA bundle)                        |
| Android | `ubuntu-latest`  | release `.apk` and Play Store `.aab`                                          |
| iOS     | `macos-latest`   | unsigned `.ipa`                                                               |
| Windows | `windows-latest` | NSIS installer, no-install portable `.exe`, and portable `.zip` (x64 + arm64) |
| macOS   | `macos-latest`   | `.dmg` and `.zip` (x64 + arm64)                                               |
| Linux   | `ubuntu-latest`  | `.AppImage` and `.deb`                                                        |

Every run uploads the packages as workflow artifacts. Pushing a tag such as
`v1.2.3` additionally creates a GitHub Release with all packages attached and
stamps that version into the desktop installers.

### Build desktop packages locally

```bash
npm run build:desktop            # packages for the current OS
npm run build:desktop -- --linux # or --win / --mac
npm run build:desktop:dir        # unpacked app only, for quick iteration
npm run desktop                  # run the Electron app against dist/
```

Output lands in `build-desktop/`. `scripts/build-desktop.mjs` builds the web
bundle with a relative asset base (Electron loads `dist/index.html` over
`file://`, where the GitHub Pages base path would break every asset URL) and
then runs electron-builder using `electron-builder.config.js`.

For a Windows PC that must not install anything, download the artifact ending
in `windows-x64-portable.exe` (or `windows-arm64-portable.exe` for a Windows on
ARM device) and run it directly. The `.zip` is also installation-free after it
is extracted. Linux users can run the `.AppImage` directly after making it
executable; macOS users can extract the `.zip` and open the app bundle.

### Design system & common reference frame

This application implements the universal **[Linkpoint Design](https://github.com/Kaleaon/linkpoint-design)** reference frame (`docs/DESIGN_LANGUAGE.md`). The viewer combines 24 Ktheme palette packs with independent layout packs. The shared components now follow CleverFerret Design’s revised LCARS split frame for Sweep Console, with a black LCARS reference field, unboxed readouts, and concentric opposing elbows. `npm run sync-design` validates the local package integration. Reference snapshots and adapter differences are documented in `docs/DESIGN_LANGUAGE.md`.

To review the interactive design canvas during local development, run the dev server and add `?design`:

```bash
npm run dev
# then visit http://localhost:5173/?design
```

### Build mobile packages locally

The `android/` and `ios/` directories are committed Expo prebuild output, so no
`expo prebuild` step is required:

```bash
npm run android:build:release    # android/app/build/outputs/apk/release
npm run android:bundle:release   # android/app/build/outputs/bundle/release
npm run ios:pods && open ios/reactexample.xcworkspace
```

Android needs a JDK 21 toolchain and an Android SDK; iOS needs Xcode and
CocoaPods.

### Signing

Signing is not wired up by default, and the packages reflect that:

- **Android** falls back to the project's debug keystore, which produces an
  installable APK that Google Play will reject. To sign with a real upload key,
  add the repository secrets `ANDROID_KEYSTORE_BASE64` (the keystore,
  base64-encoded), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and
  `ANDROID_KEY_PASSWORD`. When `ANDROID_KEYSTORE_BASE64` is present the workflow
  passes them to Gradle as injected signing properties; no build file changes
  are needed.
- **iOS** is archived with code signing disabled, so the `.ipa` installs only on
  a jailbroken device or after re-signing. App Store builds need an Apple
  Developer account, a distribution certificate, and a provisioning profile.
- **Windows and macOS** desktop packages are unsigned and unnotarized, so both
  operating systems will warn on first launch.

The desktop packages also use the default Electron icon; supplying
`build/icon.icns`, `build/icon.ico`, and `build/icon.png` would replace it.

On Linux, run the generated AppImage directly (after `chmod +x`) or extract
the `.tar.gz` archive. The desktop build uses an isolated preload bridge for
grid login and capability requests, so it does not require the development
proxy. Public custom-grid login endpoints must use HTTPS; private-network
targets are rejected.

## PWA notes

- The app registers `public/service-worker.js` in production builds.
- Manifest is provided by `public/manifest.webmanifest`.
- Install prompt will be available in compatible browsers when served over HTTPS.

## GitHub Pages deployment

The production base path defaults to `/`. For GitHub Pages repository hosting,
set `VITE_BASE_PATH=/React-Linkpoint/` when building.

If your repository name/path is different, set a custom base at build time:

```bash
VITE_BASE_PATH="/<your-repo-name>/" npm run build
```

Deploy the `dist/` directory to GitHub Pages.

## Android app

The Android app is the Expo/React Native application in `App.tsx`, backed by
the checked-in native Gradle project in `android/`. It is separate from the
Vite browser application in `src/`.

### One-time workstation setup

Install Android Studio, an Android SDK platform, and JDK 21. Then install the
locked JavaScript dependencies:

```bash
npm ci
```

The `android/` directory is source-controlled. Do not commit signing keys or
`android/local.properties`.

### Build and run on a device

Enable Developer Options and USB debugging on the Android device, connect it
to Android Studio, then run:

```bash
npm run android:run
```

This launches Metro, builds the native app, installs it, and starts it on the
connected device or running emulator. To only create a debug APK, run:

```bash
npm run android:build
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.
You can also open the checked-in `android/` directory directly in Android
Studio.

### Build an APK entirely in GitHub

No local Android Studio installation is required. Two workflows build Android
packages, and both use the checked-in native Gradle project:

- **CI Pipeline** (`ci.yml`) produces an Expo debug APK and runs native Kotlin tests. It runs
  automatically for pull requests and pushes to `main`, `master`, and `development`.
  Download `linkpoint-debug-apk` from the completed run; the artifact expires
  after 14 days.
- **Build all packages** (`release.yml`) produces a release APK and a Play
  Store AAB alongside the other platforms' packages. Choose **Run workflow**
  and pick `android` to build only Android, then download `linkpoint-android`.

Neither artifact is Play Store signed by default. See
[Signing](#signing) for the secrets that switch the release build over to a
real upload key.

### Current native app scope

The React Native shell currently provides Login, World, and Settings views.
Second Life login, capability, and raw UDP transport still need native-facing
implementations before live grid connectivity can be enabled. Use a dedicated
Aditi/OpenSim test account when that work is ready; do not use a main-grid
account during development.

## Second Life connectivity in static hosting

GitHub Pages cannot run the local `/api/proxy` endpoint. For reliable login/caps/chat access on static hosting:

1. Deploy a dedicated HTTPS proxy that forwards XML-RPC + LLSD requests.
2. Set:

```bash
VITE_SL_PROXY_URL="https://your-proxy.example/proxy?url="
```

Without `VITE_SL_PROXY_URL`, browser login and capability access fails closed;
the client never sends credentials through a public proxy.

### 3D world support

The shared viewer session uses `@caspertech/node-metaverse` to establish the
simulator UDP circuit, handle reliable packets/ACKs, decode object updates, and
send/receive nearby chat. Desktop calls use the isolated Electron bridge.
Browser/PWA calls use the Node backend over HTTP and server-sent events;
the backend holds the UDP circuit and streams scene updates to WebGL.
Static hosting alone cannot provide that connection: deploy and route `/api/*`
to the backend as described in [backend deployment](docs/backend-deployment.md).

The WebGL renderer supports simulator terrain, parametric prims, mesh/sculpt assets,
textures and materials, avatar skinning/animation, particles and flexible prims.
Spatial sounds use Web Audio; voice implements Second Life's current WebRTC
capabilities and `SLData` protocol, including parcel channels and neighboring
regions. This is distinct from the older Vivox voice backend.

Renderer resources are rebuilt after WebGL context recovery. Disconnect clears
session geometry and cancels sound/voice work, including late downloads and
microphone requests. Phone and narrow-panel controls use separate overlay rows;
movement keys follow the SL controller while canvas zoom remains available.

PBR base-color, normal, metallic/roughness and emissive maps have independent
transforms, including partial simulator overrides and SL/glTF UV conversion.
Normal maps use a tangent frame derived from their own UVs; WebGL 1 and 2 compile
compatible shader stages. Shader failures surface as renderer errors.
Attached sounds resolve linkset/joint positions, HUD camera placement and ancestor
avatar parcel/mute rules. Synchronized slaves wait for the audible master's next
loop boundary. Sound queues use the official viewer's single pending slot.
Settings includes voice microphone/speaker selection and persistent voice,
object, interface and ambient volumes; master mute also silences voice playback.
Changing a microphone retains the current voice connection and mute state.

These implementations do not establish full official-viewer parity. Live simulator
and voice-server testing, full avatar shape morphing, complete PBR lighting,
footsteps, voice mute click-fade and native platform validation remain outstanding.
See [official sources and known differences](docs/official-sources.md) and the
[viewer parity audit](docs/viewer-parity.md) for the documented scope.
