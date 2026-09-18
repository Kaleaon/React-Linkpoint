# Linkpoint Design Dictionary & Integration Specification

This document serves as the canonical dictionary and contract mapping between **`linkpoint-design`** (the source of truth for UI layouts, templates, and designs) and **`React-linkpoint`** (the deployment repository containing Second Life protocol, capabilities, and viewer logic).

---

## 1. Overview & Architectural Hierarchy

- **Canonical Design Source**: `https://github.com/Kaleaon/linkpoint-design`
- **Deployment Repository**: `React-linkpoint`
- **Auto-Sync Mechanism**: `scripts/sync-design.ts` triggered via `npm run sync-design` or automated GitHub Actions workflow `.github/workflows/sync-design.yml`.

---

## 2. Core Concepts & Terminology

| Term | Design Definition (`linkpoint-design`) | Second Life Backend Equivalent (`React-linkpoint`) |
| :--- | :--- | :--- |
| **Grid / Grid URL** | Selected SL grid target (e.g., Main Grid / Agni, Beta Grid / Aditi, OpenSim) | `AuthManager.login()` grid parameter / XML-RPC login URL |
| **Login Screen** | First/Last name, password, start location input, grid picker | `AuthManager.login(firstName, lastName, password, startLocation)` |
| **Chat Screen** | Local chat, Group IMs, and Direct Instant Messages | `ChatManager`, `SLConnectionFull` chat packet handlers, `ChatMessage` interface |
| **Radar Screen** | Nearby avatars list with distances, heights, and positions | `WorldManager`, simulator circuit avatar tracking (`CoarseLocationUpdate` / `ObjectUpdate`) |
| **Map Screen** | Region map, grid coordinates, teleport targets | `WorldManager` region map, grid map tiles, teleport capability |
| **Inventory Screen** | Hierarchical inventory folders and items | `InventoryManager` / `InventoryCore` tree structure |
| **Profile Screen** | Avatar bio, picture, groups, payment info | `SLConnectionFull` avatar profile capability / XML-RPC response |
| **World 3D Screen** | 3D canvas viewport rendering 3D scene / primitives | `Scene3D`, `Primitives3D`, `Camera3D`, WebGL rendering context |
| **System Dialogs** | Permission requests, teleport lures, pay requests, group notices | `NotificationsManager`, SL modal notification system |

---

## 3. UI Theme & Tokens Mapping

The design repo defines 6 Layout Packs, 24 Colour Packs, and 4 Device Form Factors:

1. **Layout Packs**: `terminal`, `sweep`, `tiles`, `glass`, `rules`, `press`
2. **Colour Packs**: Dynamic color sets (e.g. `obsidian-crimson`, `rose-gold`, `navy-gold`, `emerald-silver`, `lcars`, etc.) computed via `src/theme/computeTheme.js`.
3. **Form Factors**: Mobile, Mobile Horizontal, Tablet, Desktop.

---

## 4. Second Life State Contract & Wiring Map

The React hooks and context (`src/hooks/useAppState.js`, `src/viewer/ViewerContext.tsx`) bridge the visual design state with live SL connection events:

```
+-----------------------------------------------------------+
|                   linkpoint-design UI                     |
| (Header, BottomTabs, RailNav, Screens: Chat, Radar, etc.) |
+-----------------------------+-----------------------------+
                              | React State / Actions
                              v
+-----------------------------------------------------------+
|                    src/viewer/ViewerContext                |
|           (Live SL State, Chat, Radar, Auth status)       |
+-----------------------------+-----------------------------+
                              | Protocol Calls
                              v
+-----------------------------------------------------------+
|                  src/linkpoint/ SL Engine                 |
|   (AuthManager, ChatManager, SLConnectionFull, World, etc) |
+-----------------------------------------------------------+
```

---

## 5. Synchronization Workflow Rules

1. Any changes to screen mockups or layouts are committed in `linkpoint-design`.
2. When updated, the `sync-design` action or script fetches the latest `linkpoint-design` files into `React-linkpoint`.
3. All UI design elements pass through `src/screens/`, `src/components/`, `src/theme/`, and `src/hooks/`.
4. No direct styling overrides should break the Second Life protocol wiring contract defined in `ViewerContext`.
