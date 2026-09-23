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
- Placeholder geometry for decoded objects (cube) and avatars (sphere), with
  position, rotation, and scale updates.

## Not implemented yet

- Second Life prim shape/path/profile sculpting.
- Mesh and sculpt asset download/decoding.
- Texture, material, alpha mode, normal/specular map, and PBR rendering.
- Terrain heightmaps, water, sky/environment settings, and parcel overlays.
- Avatar skeletons, appearance baking, rigged mesh, attachments, animations,
  particles, flexible prims, and lighting beyond the renderer's default light.
- Parent-relative transform resolution for linked object sets.
- Object picking, touch, sit, edit, and build interactions in the 3D canvas.

The World screen reports whether it has a native live scene stream or only
login/region metadata. It must not describe metadata-only browser sessions as a
fully rendered simulator scene.
