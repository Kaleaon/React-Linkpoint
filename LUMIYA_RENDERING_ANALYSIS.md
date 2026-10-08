# Lumiya rendering analysis and viewer improvements

> Status review (2026-10-06): this document records an earlier development state.
> Use [the consolidated follow-up audit](docs/followup-audit.md) for current implementation
> status, remaining PRs and validation limits. Old statements about missing skinning,
> animation, voice, search, PBR or simulator environment must not be treated as current.


Lumiya (via `Kaleaon/Lumiya-Redux`) is used as a **behavioral reference only**, in
line with `LUMIYA_FEATURE_AUDIT.md`: nothing here copies recovered code. The
algorithms are re-implemented for WebGL, and the shaders and geometry are new.

## Method

1. Read the decompiled Kotlin/Java under `app/src/main/java/.../render` and the
   GLSL under `app/src/main/assets/shaders`.
2. Because decompilers damage code quietly, every numeric table and formula that
   was adopted was checked against the **smali** in `recovered/smali`, which
   baksmali produced from the shipped APK.
3. To confirm the recovered smali is well formed, all 137 `render/**` classes
   were assembled with `smali 2.5.2` and disassembled again with
   `baksmali 2.5.2`. Every `.array-data` block survived the round trip
   unchanged.

Findings that were checked this way:

| Item | Source | Result |
| --- | --- | --- |
| Sky colour `(blue_horizon + sunlight + ambient) * blue_density`, haze `haze_density * ambient` | `SkyProgram.ApplyWindlight` | Smali matches the Kotlin, including field order |
| Water wave tables (frequency, phase, amplitude, direction) | `TerrainPatchGeometry` `array-data` | Match the Kotlin. A naive parse drops the sign on negative hex floats and gives `8.0`/`14.4` instead of `-0.5`/`-0.3`, so parse smali literals with their sign |
| Sky dome icosahedron index table | `WindlightSky.<clinit>` | Matches. It is a closed, watertight icosahedron, wound inward |
| Bounding boxes from `worldMatrix * ±size/2` | `DrawListObjectEntry.updateBoundingBox` | Same method as the AABB transform now used for culling |

## What Linkpoint now does with it

- **Frustum culling** (`frustum.ts`, `Scene3D.isCulled`): six-plane extraction from
  the view-projection matrix and a positive/negative-vertex box test. Objects
  outside the view are skipped, in the main pass and in mirror passes.
  `Graphics3D` records each mesh's local bounds. Culling is skipped when bounds
  are unknown or the matrix is degenerate. `scene.frameStats` reports
  drawn/culled counts.
- **Windlight-style sky** (`sky.ts`): a procedural icosphere dome shaded with the
  Lumiya sky/haze formula, plus an optional deterministic star field. The dome is
  drawn after opaque geometry at the far plane, so it only shades pixels nothing
  else covered (Lumiya draws its sky at the same point in the frame).
- **Animated water**: one large plane at the region water height (default 20 m)
  using Lumiya's four-wave tables. This is only drawn once real terrain has loaded,
  and it is blended after opaque geometry. Compared with Lumiya it uses the real
  view vector, and filters each wave by the pixel's ground footprint. The recovered
  wavelengths (0.35–0.7 m) otherwise alias into speckle past a few metres. The
  slope scale (`WATER_NORMAL_SCALE`) is an aesthetic choice.
- **Underwater state**: below the water line the sky and surface are skipped
  and the clear colour becomes the water tint. Lumiya also switches to
  below-water light colours here; that is not ported.
- **Picking** (`ray-pick.ts`, `Scene3D.pick`): ray against each object's oriented
  bounding box, returning the nearest id, distance and hit point.

## Bugs found in the existing viewer along the way

- `Camera3D.getViewProjectionMatrix()` was `V * P` instead of `P * V`, because
  `mat4Multiply` indexed column-major data as row-major. Fixed.
- `Camera3D.screenToWorldRay()` added NDC offsets to yaw/pitch angles. It ignored
  aspect ratio, used the wrong trigonometry, and in orbit mode treated the
  camera's offset angles as the view direction. It now unprojects through the
  inverse view-projection matrix.
- `Graphics3D.setUniforms` uploaded any 4-element array as a `vec4`, so float and
  vec2 array uniforms could not be set. They are now typed from the program.
- With `OES_vertex_array_object`, a mesh VAO was recorded against the `basic`
  program's attribute slots, so other programs could read the wrong data. All
  programs now pin `aPosition/aNormal/aTexCoord/aTangent` to fixed slots.
- Attributes a mesh does not supply stayed enabled from the previous draw. They
  are now disabled.

## Not yet adopted (candidates, roughly by value)

- **Spatial tree / draw-distance LOD.** Lumiya keeps objects in a tree and walks it
  with the frustum. Culling here is a linear pass, which is fine for hundreds of
  objects but not for tens of thousands.
- **Below-water lighting** (`sunlightBelowWater`, `ambientBelowWater`).
- **Terrain colouring.** Terrain is still one flat grey.
- **Occlusion queries** on bounding boxes (GL3 only in Lumiya).
- **Post-process:** the Redux `fxaa.fsh` adds ACES tone mapping, sharpening and
  vignette on top of the original FXAA. That is a Redux modification, not original
  Lumiya, so it needs its own decision.
- **Per-face picking.** Click-to-select is wired up (`CameraControls` tap →
  `WorldViewer.pickObject` → selection panel), but hits use each object's oriented
  bounding box, not triangles, so there are no face or UV results. Terrain and water
  are not pickable.
- **Water height from the simulator.** `Scene3D.setWaterHeight` exists, but the
  session layer does not forward the RegionHandshake water height yet, so 20 m is used.
- **Sun direction.** The light position is still a fixed vector. I did not work out
  how the EEP sun rotation maps to a direction, so this is left alone.

## Limits of this analysis

- The original APK was not available here. All smali comes from the
  committed `recovered/smali`, which I checked for internal consistency, not
  against the APK.
- The sky/water output was checked in headless Chromium (SwiftShader) with
  synthetic terrain and environment data, not against a live simulator.
