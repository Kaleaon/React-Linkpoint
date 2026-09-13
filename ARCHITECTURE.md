# Linkpoint Architecture

Linkpoint is a modern, cross-platform Second Life (SL) and OpenSim Third-Party Viewer (TPV). Our architecture is designed to support Web, Android, and iOS from a single unified codebase, inspired by the legacy of the Lumiya viewer.

## 1. Core Framework: React Native & Expo
To achieve true cross-platform capabilities, Linkpoint is transitioning towards **React Native** utilizing the **Expo** framework.
- **Write Once, Run Anywhere:** A unified UI and logic layer for iOS, Android, and the Web.
- **Native Modules:** Allows direct access to native device capabilities (like networking and graphics) on mobile platforms, while falling back to web-safe APIs in the browser.

## 2. Networking Architecture (The UDP Problem)
Second Life relies heavily on raw UDP packets for simulator data (movement, 3D objects, terrain). Browsers strictly forbid raw UDP connections. We solve this with a bifurcated networking model:

### Mobile Platforms (Android & iOS)
- **Direct UDP:** Utilizing React Native native modules (e.g., `react-native-udp`), the mobile apps connect directly to Second Life simulator servers via raw UDP.
- **Performance:** Bypassing proxies ensures the lowest latency possible, crucial for real-time 3D environments.

### Web Platform (PWA / Browser hosted on GitHub Pages)
- **WebSocket to UDP Proxy:** The web app cannot send UDP. Instead, it connects via WebSockets to a dedicated custom Node.js Proxy Server.
- **Proxy Server Role:** This server (which can be hosted on a VPS like DigitalOcean, Render, or Oracle Cloud) translates WebSocket messages into UDP packets for the SL grid, and vice-versa.
- **CORS & Authentication:** The proxy handles all necessary CORS headers to allow cross-origin requests from the GitHub Pages-hosted frontend.

## 3. 3D Rendering Engine
A fully working 3D worldview is a primary goal.
- **Graphics Standard:** We target **WebGL 2.0** (based on OpenGL ES 3.0), providing the highest standard of mobile web and native graphics support.
- **Rendering Library:** The 3D view will be powered by **Three.js** integrated via **expo-gl**. This allows Three.js to render directly to native OpenGL contexts on mobile and WebGL contexts in the browser.
- **Asset Pipeline:** The viewer must parse SL's complex mesh formats, sculpties, and textures (JPEG2000 handling will require WASM/native decoders) and translate them into Three.js geometries and materials.

## 4. State Management and Data Layer
- The SL Protocol state (Chat, Inventory, Groups, Friends) is managed via our internal TypeScript implementation (`src/linkpoint/`).
- **Phase 2 Modules:** Features are heavily modularized (e.g., `InventoryCore`, `GroupsManager`) handling standard Web/JSON structures or mapping directly to LLSD.

## 5. Deployment Strategy
- **Web App:** CI/CD via GitHub Actions to deploy static web files directly to **GitHub Pages**.
- **Mobile Apps:** GitHub Actions configured with EAS (Expo Application Services) to automatically build Android (.apk/.aab) and iOS binaries upon commit.
