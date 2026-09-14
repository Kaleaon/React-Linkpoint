
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

No local Android Studio installation is required for a test APK. Open the
repository's **Actions** tab, select **Build Android test APK**, choose
**Run workflow**, and download `linkpoint-debug-apk` from the completed run's
Artifacts section. Transfer `app-debug.apk` to the Android device and approve
the Android installer prompt for this test-only unsigned-debug build.

The workflow also runs automatically for pull requests that change the web
app, Capacitor configuration, or Android build workflow. The artifact expires
after 14 days and is not Play Store signed; release signing and store uploads
remain a separate production-release process.

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
