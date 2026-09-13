# Linkpoint Viewer Roadmap

This document outlines the strategic phases for developing Linkpoint into a fully-featured, cross-platform Second Life and OpenSim viewer. The goal is to provide a "Lumiya-style" mobile-first experience, complete with a 3D worldview, extensive community features, and strict compliance with Linden Lab's Third-Party Viewer (TPV) policies.

## Phase 1: Foundation & TPV Compliance (Current Phase)
*Establish the core architecture, security, and networking layers.*
- [x] **Core Protocol Implementation:** Initial TypeScript implementation of SLLogin, LLSD parsing, and basic messaging (`src/linkpoint/`).
- [ ] **Networking Bifurcation Setup:**
  - Define local proxy setup with full CORS support (`server.ts`).
  - Create stub logic for WebSockets-to-UDP bridging for the Web version.
- [ ] **TPV Policy Baseline:** Document and implement Viewer Identity (Login Channel strings), MAC Address hashing, and basic privacy standards (`TPV_COMPLIANCE.md`).
- [ ] **React Native / Expo Migration:** Scaffolding the new universal codebase that supports Web, Android, and iOS natively.

## Phase 2: Core Viewer Features (The Text/UI Client)
*Implement the essential interactions for engaging in the Second Life world without rendering graphics.*
- [ ] **Chat & Communications:** Local chat, IMs, Group Chat via `ChatManager` and `GroupsManager`.
- [ ] **Inventory System:** Loading, caching, and managing the hierarchical inventory tree using `InventoryCore`.
- [ ] **Profiles & Search:** Viewing avatar profiles, group information, and parsing SLURLs.
- [ ] **Teleport & Movement (Data level):** Handling map data, teleport requests, and parsing basic movement updates (without visualizing them yet).
- [ ] **Friends List & Notifications:** Managing online status and system popups.

## Phase 3: The 3D Worldview Engine
*Integrate the graphical engine capable of rendering Second Life environments.*
- [ ] **WebGL 2.0 / OpenGL ES 3.0 Setup:** Initialize `Three.js` via `expo-gl` for cross-platform rendering contexts.
- [ ] **Asset Fetching & Decoding:**
  - Implement UDP mesh fetching.
  - Integrate WebAssembly (WASM) decoders for JPEG2000 textures.
- [ ] **World Rendering:**
  - Render basic terrain heightmaps.
  - Parse and render standard Prims and Sculpties.
  - Implement Rigged Mesh rendering for Avatars and Objects.
- [ ] **Camera & Interaction:** Touch controls for panning, zooming, and clicking on 3D objects.

## Phase 4: Advanced Features & RLV Support
*Bring the viewer to parity with advanced desktop clients.*
- [ ] **RLV (Restrained Life Viewer) Core:** Implement the RLV API specification.
  - Parse @-commands from chat.
  - Enforce inventory locks, vision restrictions, and forced teleports.
- [ ] **Voice Chat:** Integrate Vivox voice communications or a compatible WebRTC alternative.
- [ ] **Media on a Prim (MoaP):** Render web media on 3D objects.

## Phase 5: CI/CD & Production Deployment
*Automate the build and release pipeline.*
- [ ] **Web Deployment:** Configure GitHub Actions to build and deploy the Web client to GitHub Pages.
- [ ] **Proxy Infrastructure:** Set up a production-ready Node.js WebSocket-to-UDP proxy on a VPS (e.g., Render, DigitalOcean) for the Web client.
- [ ] **Mobile Deployment:** Configure EAS (Expo Application Services) via GitHub Actions to automatically build APK/AAB for Android and IPA for iOS.
- [ ] **Store Listings:** Prepare compliant app store assets and listings for Google Play and the Apple App Store.
