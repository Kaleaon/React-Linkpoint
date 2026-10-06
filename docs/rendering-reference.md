# Rendering regression reference

Reference supplied by the user: [Lumiya 3.4.2 APK](https://drive.google.com/file/d/1dbEbqIZdLTDoAfFl7ybdI2Syb9wri-qD/view), in [the shared folder](https://drive.google.com/drive/folders/1Bsr8DE3_TyWL42GxpKQem6N_EGjYcOpB).

SHA-256: `cc4bac60dc2df24f5e4e98be293ba4b9061ac237156afab6629793fa2ffc0c5d`.

Apktool 2.11.1 decoded the DEX into smali using baksmali. JADX 1.5.2 produced Java for inspection; it reported two decompilation errors, so generated Java is an aid, not an authoritative runnable source tree. The relevant methods were checked against the smali. The APK was inspected, not executed. Intermediate APK assets, tools, and recovered sources remain outside the changes proposed for the application.

| Reference class/method | Observed behavior | Application change or coverage |
| --- | --- | --- |
| `render/avatar/AvatarTextures.ApplyAvatarAppearance`, `ApplyTextures` | Appearance packets carry texture entries; texture identities are UUIDs, and updates are compared by identity. | Subscribe to `AvatarAppearance`, retain entries received before object updates, request baked textures, and use consistent GPU names for case variants. Follow circuit changes and unsubscribe at disconnect. |
| `slproto/avatar/AvatarTextureFaceIndex` | Legacy bake slots: head 8, upper 9, lower 10, eyes 11, skirt 19, hair 20. | Serialize all 21 legacy avatar slots even when texture-entry faces inherit defaults. |
| `render/DrawableObject.setPrimDrawParams` | Changed draw parameters request a new drawable resource. | Invalidate decoded geometry and texture references on asset replacement, while preserving them on terse motion updates. Cover mesh-to-prim transitions and late asset arrivals. |
| `render/drawable/DrawablePrim` constructor | Each geometry face uses its original face ID to look up texture/color/UV state, inheriting the default entry. | Serialize inherited state for all nine possible generated prim faces. Verify that empty LLMesh faces do not shift material indices. |
| `render/avatar/DrawableAvatar` shape update, `slproto/mesh/MeshData.ApplyJointTranslations` | All worn rigged meshes contribute translations to a shared avatar skeleton. | Rebuild affected subjects after attachment replacement/reparenting, including removal of old rigging; retain the current animation pose during object/texture refreshes. |
| `slproto/mesh/MeshFace` | Empty geometry remains an empty face; position-domain decoding preserves the mesh's coordinate domain. | Confirm existing decoder behavior and add material-slot regression coverage. |

The newer GLTF/PBR override fixes are grounded in this repository's node-metaverse structures and renderer tests, not in the 2019 Lumiya APK. Partial overrides now preserve inherited base-color transform components and honor standalone emissive, alpha-cutoff, and double-sided values.

A failed base-body download now exposes the existing avatar marker until a retry installs the real skinned body. Successful loading still hides the marker. This is a recovery fix for this viewer, not a claim that Lumiya draws the same fallback geometry.

The viewport change restores the single-canvas World3D integration because its renderer lifecycle does not support remounting canvases through the split-pane compositor. The compositor implementation remains available for future integration with explicit renderer ownership.

These checks cover decoded geometry, simulator event propagation, material uniforms/state, and UI lifecycle. They do not establish live-grid visual parity, full avatar shape morphing, or independent transforms for every PBR texture channel.
