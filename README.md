
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


## Packaging

`.github/workflows/release.yml` builds every distributable package. It runs on
pushes to `main`, on `v*` tags, and on demand from the **Actions** tab (where a
dropdown lets you build a single platform instead of all of them).

| Package | Built on | Produces |
| --- | --- | --- |
| Web | `ubuntu-latest` | `Linkpoint-<version>-web.zip` (the `dist/` PWA bundle) |
| Android | `ubuntu-latest` | release `.apk` and Play Store `.aab` |
| iOS | `macos-latest` | unsigned `.ipa` |
| Windows | `windows-latest` | NSIS installer `.exe` and portable `.zip` (x64 + arm64) |
| macOS | `macos-latest` | `.dmg` and `.zip` (x64 + arm64) |
| Linux | `ubuntu-latest` | `.AppImage` and `.deb` |

Every run uploads the packages as workflow artifacts. Pushing a tag such as
`v1.2.3` additionally creates a GitHub Release with all packages attached and
stamps that version into the desktop installers.

### Build desktop packages locally

```bash
npm run build:desktop            # packages for the current OS
npm run build:desktop -- --linux # or --win / --mac
npm run build:desktop:dir        # unpacked app only, for quick iteration
```

Output lands in `build-desktop/`. `scripts/build-desktop.mjs` builds the web
bundle with a relative asset base (Electron loads `dist/index.html` over
`file://`, where the GitHub Pages base path would break every asset URL) and
then runs electron-builder using `electron-builder.yml`.

### Build mobile packages locally

The `android/` and `ios/` directories are committed Expo prebuild output, so no
`expo prebuild` step is required:

```bash
npm run android:assemble   # android/app/build/outputs/apk/release
npm run android:bundle     # android/app/build/outputs/bundle/release
npm run ios:pods && open ios/reactexample.xcworkspace
```

Android needs a JDK 17 toolchain and an Android SDK; iOS needs Xcode and
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

## Android testing without a browser proxy

The browser build requires a Linkpoint-operated proxy because browsers cannot
make the required native network requests. For free Android-device testing,
wrap the same Vite build with Capacitor. Capacitor's native HTTP bridge avoids
browser CORS restrictions for XML-RPC login and HTTPS capability requests.

### One-time workstation setup

Install Android Studio, an Android SDK platform, and a JDK supported by the
installed Android Studio. Then install the Capacitor tooling in this project:

```bash
npm install @capacitor/core @capacitor/android
npm install --save-dev @capacitor/cli
npx cap add android
```

The generated `android/` directory is intentionally local development output;
do not commit signing keys or `local.properties`.

### Build and run on a device

Enable Developer Options and USB debugging on the Android device, connect it
to Android Studio, then run:

```bash
npm run android:run
```

Alternatively, use `npm run android:open` after `npm run android:sync` and
run the app from Android Studio. `android:build` always uses `/` as the asset
base path, unlike the GitHub Pages production build.

### Build an APK entirely in GitHub

No local Android Studio installation is required. Open the repository's
**Actions** tab, select **Build all packages**, choose **Run workflow**, pick
`android`, and download `linkpoint-android` from the completed run.

Note that the CI APK is built from the committed Expo prebuild project in
`android/`, not from the Capacitor wrapper described above. `MainActivity`
extends React Native's `ReactActivity`, and `android/settings.gradle` does not
include `capacitor.settings.gradle`, so `npx cap sync android` only copies the
web assets into an app that never loads them. Making the Capacitor path
buildable in CI requires wiring Capacitor into the Android project (or
generating a separate one) first.

### Current native networking scope

The native HTTP bridge enables login and HTTPS capability testing without a
browser proxy. It does **not** add raw UDP support for simulator circuits, so
the complete 3D world/movement transport remains a separate native-module
milestone. Use a dedicated Aditi/OpenSim test account when live testing is
ready; do not use a main-grid account during development.

## Second Life connectivity in static hosting

GitHub Pages cannot run the local `/api/proxy` endpoint. For reliable login/caps/chat access on static hosting:

1. Deploy a dedicated HTTPS proxy that forwards XML-RPC + LLSD requests.
2. Set:

```bash
VITE_SL_PROXY_URL="https://your-proxy.example/proxy?url="
```

Without `VITE_SL_PROXY_URL`, browser login and capability access fails closed;
the client never sends credentials through a public proxy.
