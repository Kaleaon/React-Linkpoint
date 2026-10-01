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
- **Sky, light and water from the region environment (EEP)**, following the official viewer (checked against its shader and settings source):
  - `eep.ts` samples the region's day cycle by time of day (day length and offset from the simulator, keyframes interpolated with wrap-around, sun/moon rotations slerped), derives sun and moon directions, and computes light the way `LLSettingsSky::calculateLightSettings` does (sunlight attenuated by altitude, ambient raised under cloud).
  - `atmosphere.ts` ports the viewer's sky scattering shader (blue/haze density and horizon, glow around the sun, sun and moon discs); the same function is reflected in the water. Cloud textures, rainbows and halos are not drawn.
  - Objects are lit by that sun/moon and ambient (gamma-correct lighting); the sky refreshes every two seconds.
  - Water uses the water settings' Fresnel, fog colour and density, blends a reflection of the sky, and has a sun glint. Waves are procedural (the EEP normal-map texture is not downloaded yet).
  - Without a day cycle the single sky frame is used, then Lumiya's Windlight presets as before.
- **Terrain** is textured like the viewer: four detail textures blended by height plus noise against per-corner start heights and ranges from the region handshake (fallback colours until the textures load). The region's water height is used.
- **Prims** use real Second Life geometry (`sl-volume.ts`, a port of the viewer's profile/path generator): all profile shapes, cut, hollow and hole shapes, twist, taper, shear, skew, radius offset and revolutions, with faces in texture-entry order. Meshes use their LLMesh data; sculpts use their sculpt maps.
- Frustum culling against per-mesh bounds (skipped when bounds are unknown), and
  oriented-bounding-box picking via `Scene3D.pick` (not yet wired to the UI).
- Parent-relative linkset transforms are resolved into world space and child
  prims follow root motion even when only the root receives a terse update.
- Tap/click object picking uses transformed collision volumes, with nearest-hit
  selection and a camera-focus action inspired by Lumiya's recovered
  `CollisionBox`, `GLRayTrace`, and `WorldViewRenderer.pickObject` flow.

- **Avatar bodies and animation** (verified in headless Chromium by rendering the real meshes and Lumiya's stand animation):
  - `avatar-animation.ts` parses Second Life `.anim` files, applies Lumiya's loop/ease timing, and blends by priority. All 118 of Lumiya's bundled animations parse (`public/anims`).
  - `avatar-skeleton.ts` has the full 159-bone Bento skeleton (data from `scripts/extract-lumiya-skeleton.py`), legacy joint aliases, posing, rigged-mesh skin matrices and joint position overrides / pelvis offset.
  - `skinning.ts` + the `skinned` program in `graphics-3d.ts` do GPU skinning (three vec4 rows per joint, sized to the GPU's uniform limit, up to SL's 110 joints).
  - `avatar-body.ts` draws the default avatar (head, torso, legs, eyes, eyelashes, hair; geometry from `scripts/extract-lumiya-avatar-meshes.py` into `public/avatar`). Avatars with no announced animation play the standard stand.
  - `avatar-animator.ts` tracks the simulator's AvatarAnimation / ObjectAnimation messages per avatar and animated object (a changed sequence id restarts an animation; removed ones ease out). Rigged mesh attachments and Animesh (ExtendedMesh `ANIMATED_MESH_ENABLED`) are re-posed every frame.

## Avatar and mesh limitations (known)
- Avatars wear their baked head, upper, lower, eyes and hair textures once those download; until then (or with a placeholder bake) they are flat colours. Layered clothing is whatever the simulator baked.
- Shape sliders (morph targets) and body-size deformation are not applied; every avatar has the default shape. Skirt and facial expression bones are not driven.
- Animations: bundled ones play from `public/anims`; others are downloaded from the simulator's asset service and parsed. The animation listener follows the agent between regions.
- Static assets are fetched from `BASE_URL`; the packaged desktop build loads from `file://`, where these fetches have not been tested.
- Skinned objects are never frustum-culled and are picked by their bind-pose box.
- Nothing here has been checked against a live simulator.

## Not implemented yet

- Per-face materials, alpha modes, normal/specular maps, and PBR rendering.
- Below-water lighting, cloud layers, the EEP water normal-map texture, altitude sky tracks, and parcel overlays.
- Avatar shape sliders, attachment point placement of non-rigged attachments,
  particles, flexible prims, shadows and reflection probes.
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
