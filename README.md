
# Linkpoint Viewer

A Second Life communicator and viewer utility suite packaged as a Progressive Web App.

## Local development

**Prerequisites:** Node.js 20+

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a local env file:
   ```bash
   cp .env.example .env.local
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```


## Desktop Execution

The codebase now supports building standalone desktop applications for Windows, macOS, and Linux using Electron.
The GitHub Actions workflow `.github/workflows/desktop-build.yml` automatically packages the Expo web build into a standalone desktop executable on push.

### Build Desktop Locally
```bash
npm install --legacy-peer-deps
npm run build:desktop
```
Outputs will be placed in the `build-desktop` directory.

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

This repo is configured to build with a production base path of `/React-Linkpoint/` by default.

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
npm ci --legacy-peer-deps
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

No local Android Studio installation is required for a test APK. Open the
repository's **Actions** tab, select **Build Android test APK**, choose
**Run workflow**, and download `linkpoint-debug-apk` from the completed run's
Artifacts section. Transfer `app-debug.apk` to the Android device and approve
the Android installer prompt for this test-only unsigned-debug build.

The workflow also runs automatically for pull requests that change the native
app, Android project, dependencies, or Android build workflow. The artifact
expires after 14 days and is not Play Store signed; release signing and store
uploads remain a separate production-release process.

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

The packaged desktop viewer uses `@caspertech/node-metaverse` to establish the
simulator UDP circuit, handle reliable packets/ACKs, decode object updates, and
send/receive nearby chat. Decoded object and avatar transforms are streamed
through the isolated Electron bridge and applied to the WebGL scene.

The browser/PWA build cannot open a simulator UDP circuit and therefore remains
limited to login/capability metadata. It labels this state explicitly. The
desktop scene currently represents decoded objects with basic cube/avatar
geometry; complete Firestorm-equivalent terrain, prim parameter meshing,
textures, mesh/sculpt assets, avatar appearance/animation, spatial sound, and
Vivox voice rendering remain separate renderer/media work. Vivox voice also
requires service credentials and the licensed Vivox SDK supplied to approved
viewer projects; it cannot be implemented by substituting ordinary WebRTC.
