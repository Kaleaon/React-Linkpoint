# Linkpoint Viewer - Offline Module & Design Specification

This document provides the complete design specification, controls list, screen layouts, and state architecture for the **Offline OpenSim Viewer & Local Grid Module**. This specification is formatted for hand-off to the `Linkpoint-design` repository.

---

## 1. Overview & Vision
The Offline Module enables Linkpoint to operate as a self-contained local OpenSim grid engine. Users can run local regions offline on Android, iOS, Windows, Mac, and Web, load `.oar` region backups, upload textures/sounds/scripts/meshes locally, and eventually connect via Hypergrid.

---

## 2. Screens & UI Controls List

### Screen 1: Offline Grid Control Center (`OfflineGridControlScreen`)
- **Grid Toggle Button**: Large visual toggle switch switching between `WORKING (ONLINE)` and `SHUTDOWN (OFFLINE)`.
- **Status Indicator**: Badge showing current local server status, IP (`127.0.0.1`), and port (`9000`).
- **Account Status Banner**: Displays active local user (`FirstName LastName`) or triggers setup modal.

### Screen 2: First-Time Account Setup (`OfflineAccountModal`)
- **Username Inputs**: `First Name` (text field) and `Last Name` (text field, defaults to `Resident`).
- **Password Input**: Secure password field for local XML-RPC login authentication.
- **Action Button**: `Save & Configure Account` button.

### Screen 3: OAR Region Backup Importer (`OarImporterCard`)
- **File Upload / Dropzone**: File picker accepting `.oar` archive files or raw `SceneObjectGroup` XML data.
- **Region Name & Location Display**: Displays target region name, region X/Y coordinates (e.g. `1000, 1000`), and prim count.
- **Action Button**: `Import OAR Backup`.

### Screen 4: Local Asset & SL Upload Center (`LocalAssetUploadCard`)
- **Asset Name Input**: Text field for asset title.
- **Asset Type Picker**: Select dropdown (`Texture`, `Sound`, `Script`, `Mesh / Model`, `Animation`, `Clothing`).
- **Data Input / File Picker**: File selector for raw media/binary or base64 data.
- **Asset Library List**: Interactive list of persisted local assets showing Asset Name, Type, Size in Bytes, UUID, and `Upload to SL` action trigger.

### Screen 5: Storage & Cache Sizing Manager (`CacheSettingsCard`)
- **Cache Size Slider**: Range slider spanning `256 MB` to `1,000,000 MB` (1 TB).
- **Cache Size Number Input**: Direct numerical text box in Megabytes or Gigabytes.
- **Storage Bar Gauge**: Visual progress bar showing estimated cache usage vs max limit.
- **Action Button**: `Clear Offline Cache`.

### Screen 6: Grid Console & Error Log (`GridConsolePanel`)
- **Console Output Pane**: Monospace, dark, scrolling log rendered in OpenSim console style — `16:30:33,123 INFO  [LOGIN SERVICE]: message`. Levels are colour-coded (`DEBUG` grey, `INFO` teal, `WARN` amber, `ERROR` orange, `FATAL` red) and error detail/stack traces render indented beneath their entry.
- **Level Filter**: Select dropdown (`DEBUG`/`INFO`/`WARN`/`ERROR`/`FATAL` and above) applying a severity threshold.
- **Search Field**: Free-text filter matching message, component tag and detail.
- **Auto-scroll Toggle**: Checkbox pinning the pane to the newest entry.
- **Header Badges**: Live totals for entries, warnings and errors; the count turns red when any error or fatal entry is present.
- **Action Buttons**: `Copy` (clipboard), `Download` (timestamped `.log` file), `Clear`.

---

## 3. Data & State Architecture

### Core Classes (`src/linkpoint/offline/`)
1. **`LocalGridServer.ts`**:
   - Manages local XML-RPC login service, local user database, local region map, and Hypergrid identifier resolution (`Jane Doe@hg.osgrid.org:8002`).
2. **`LocalGridManager.ts`**:
   - Coordinates server startup/shutdown toggle state, checks first-time account setup, and handles local storage persistence (`linkpoint_offline_user_account`).
3. **`OARParser.ts`**:
   - Parses `.oar` scene object XMLs and populates region objects/prims.
4. **`LocalAssetManager.ts`**:
   - Handles asset creation, persistence (`linkpoint_local_asset_<uuid>`), and UUID generation for textures, sounds, scripts, and meshes.
5. **`CacheManager.ts`**:
   - Controls cache limits between 256 MB and 1 TB and provides cache clearing logic.
6. **`GridConsole.ts`**:
   - Bounded (ring-buffer) console and error log shared by every offline service. Provides levels, OpenSim-style `[COMPONENT]` tags, filtering, text export, `captureError()` for thrown values, and `attachGlobalErrorHandlers()` to route uncaught viewer errors and unhandled rejections into the same stream. Exports a shared `gridConsole` singleton; each service also accepts an injected instance for testing.
7. **`password.ts`**:
   - Salted PBKDF2-SHA256 hashing for the local account. Uses native WebCrypto where available (210,000 iterations) and falls back to crypto-js on non-secure-context origins (100,000 iterations). Verification replays the parameters stored in the record, so records stay valid if the defaults change.

---

## 4. Integration Guidelines for `Linkpoint-design`
- All components are exported from `src/linkpoint/offline/OfflineManagerView.tsx`.
- State updates are emitted via `Utils.EventEmitter` events:
  - `gridStateChanged` (`{ isRunning: boolean }`)
  - `accountConfigured` (`user: LocalUser`)
  - `assetUploaded` (`asset: LocalAsset`)
  - `cacheSettingsUpdated` (`settings: CacheSettings`)
  - `logEntry` (`entry: LogEntry`) and `logCleared` — emitted by `GridConsole`
- The console panel is exported separately from `src/linkpoint/offline/GridConsolePanel.tsx` and takes a `GridConsole` instance, so it can be embedded in any screen.

---

## 5. Credential Handling

The local account password is **never stored in a recoverable form**.

- `setupOfflineAccount()` and `LocalGridServer.registerUser()` take the plaintext password, derive a salted PBKDF2-SHA256 record, and retain only that record. Both are asynchronous, as is `processLogin()` / `authenticate()`.
- A fresh 16-byte random salt is generated per account; the stored record holds `{ version, algo, iterations, salt, hash }` and no plaintext.
- Verification is a length-independent comparison against the re-derived digest.
- Accounts persisted by earlier builds (which stored the password itself under `passwordHash`) are **rejected and deleted** on load rather than trusted, and the user is asked to set the account up again.
- Design note: because the password cannot be recovered, account setup UI should treat it as unrecoverable — the reset path is re-running first-time setup, and `changePassword()` exists for in-place changes.
