# 3D rendering status

The renderer is operational, but it is **not yet a complete Second Life scene
renderer**.

## Working now

- WebGL 2 with WebGL 1 fallback and correct OES vertex-array setup.
- A single managed animation loop with cleanup when the World screen unmounts.
- Viewport and camera aspect updates on resize.
- Native desktop simulator object add/update/remove streaming.
- Region handshake, coarse avatar locations, parcel metadata, nearby chat, and
  camera movement controls.
- UDP ObjectUpdate/Compressed/Cached/terse data drives object lifecycle,
  transforms, cube/cylinder/sphere/prism/torus selection, and base face color.
- Uploaded LLMesh assets are downloaded through simulator capabilities, decoded
  at high available LOD, and streamed to WebGL with positions, normals, UVs,
  and triangle indices. JPEG2000 textures are decoded to RGBA, including sculpt
  maps which are converted to indexed scene geometry.
- Windlight-style sky dome with haze and optional stars, animated water at the
  region water level, and an underwater tint (see `LUMIYA_RENDERING_ANALYSIS.md`).
  Sky and water are driven by the simulator environment when present and by
  neutral defaults otherwise; they have not been compared against a live region.
- Frustum culling against per-mesh bounds (skipped when bounds are unknown), and
  oriented-bounding-box picking via `Scene3D.pick` (not yet wired to the UI).
- Parent-relative linkset transforms are resolved into world space and child
  prims follow root motion even when only the root receives a terse update.
- Tap/click object picking uses transformed collision volumes, with nearest-hit
  selection and a camera-focus action inspired by Lumiya's recovered
  `CollisionBox`, `GLRayTrace`, and `WorldViewRenderer.pickObject` flow.

## Not implemented yet

- Second Life prim shape/path/profile sculpting.
- Per-face materials, alpha modes, normal/specular maps, and PBR rendering.
- Terrain texturing (terrain is a flat colour), simulator-supplied water height, sun direction, below-water lighting, and parcel overlays.
- Avatar skeletons, appearance baking, rigged mesh, attachments, animations,
  particles, flexible prims, and lighting beyond the renderer's default light.
- Complete SL path/profile prim tessellation (cuts, hollow, twist and taper are
  preserved in scene data but currently render with a closest-shape fallback).
- Touch, sit, edit, and build interactions in the 3D canvas. Picking uses each
  object's oriented bounding box; per-face triangle and UV hits remain to be
  implemented.

The World screen reports whether it has a native live scene stream or only
login/region metadata. It must not describe metadata-only browser sessions as a
fully rendered simulator scene.

## Windlight fallback sky and primitive geometry

- `src/linkpoint/windlight.ts` bundles Lumiya's eight text Windlight presets (`src/assets/windlight/`, LLSD XML, no binaries) and applies Lumiya's loading rules (scale factors, gamma 1/2.2 × 1.25 on ambient and sunlight, 3-hour steps with wrap-around interpolation). It is used only when the simulator has sent no environment.
- **Estimated, not read from the sim:** the time of day is guessed from the clock as a four-hour cycle starting at the Unix epoch. The client library does not expose the simulator's sun phase (Lumiya reads `SimulatorViewerTime.SunPhase`), so the fallback sun can disagree with the region's real sun. Sun direction comes from `sun_angle`/`east_angle`, not Lumiya's `lightnorm` axes (whose coordinate frame is unverified).
- The sky colour uses Lumiya's formula without a sun glow term, so dawn and dusk skies are blue rather than orange. Cloud textures (`clouds_*.tga`) are binary and not imported.
- Objects use the sky's ambient term, and the combined light is clamped to 1 before it multiplies the surface colour, as in Lumiya's prim shader.
- Primitives follow Second Life conventions: the unit box (cylinder/sphere diameter equals the prim scale) with the cylinder axis and sphere poles on Z. Cylinders previously had one cap, lay along Y and were twice the intended size; spheres were twice the size and fully inside-out.
- Sculpt and normal-less mesh geometry get computed smooth normals (they were a constant +Z). Which side of a sculpt is "front" for each sculpt type has not been checked against real sculpt maps.
