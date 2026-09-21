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

---

## 4. Integration Guidelines for `Linkpoint-design`
- All components are exported from `src/linkpoint/offline/OfflineManagerView.tsx`.
- State updates are emitted via `Utils.EventEmitter` events:
  - `gridStateChanged` (`{ isRunning: boolean }`)
  - `accountConfigured` (`user: LocalUser`)
  - `assetUploaded` (`asset: LocalAsset`)
  - `cacheSettingsUpdated` (`settings: CacheSettings`)
