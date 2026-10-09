# Consolidated viewer work review

Reviewed 2026-10-06 against merged PR #150, commit `3243e952c38bea810474d3099c0cfa1dd21ec411`.

## What was actually pushed

All 41 files from the previous work match the merged GitHub tree byte for byte. The
workspace still shows changes relative to its older local HEAD (`d8657f4`); those
changes are already on main. They must not be re-published as a second copy of PR #150.
The APK, smali/Java recovery, decompiler tools and temporary logs under `work/` are
research artifacts, not omitted application changes.

The prior combined check passed 137 test files and 1,196 tests, TypeScript, fake-data
and import checks, and the production build. Those checks establish local behavior.
They do not establish a successful live simulator session, native app execution,
cross-device screenshots or complete Lumiya/Firestorm/Second Life parity.

## Review of the previous work

| Previous work                               | Result of review                                                                                                                                                                                                 | Further work                                                                                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single-canvas viewport restoration          | Renderer ownership and controls have regression coverage; the split-pane compositor is still unused.                                                                                                             | Re-integrate multiple viewports only after ownership, lifetime and input routing are designed and tested.                                                                   |
| Mesh/texture identity and asset replacement | Replacement invalidation, case-normalized UUIDs, mesh-to-prim transitions and late assets are tested.                                                                                                            | Live region crossings, asset failures, cache eviction and memory-budget profiling.                                                                                          |
| Avatar appearance and rigging               | Appearance packets, inherited bake slots, shared attachment skeleton rebuilding, retained poses and body-load fallback are tested.                                                                               | Full shape morphing, facial expressions and live baked-texture/attachment comparisons.                                                                                      |
| Prim/PBR rendering                          | Prim-face inheritance and partial PBR overrides have tests. Existing normal/metallic-roughness/emissive/occlusion paths are present.                                                                             | Independent texture-channel transforms, accurate picking and full lighting parity.                                                                                          |
| Navigation and new screens                  | Existing routes are discoverable through directory, rails, tiles, console and floaters. Camera, Environment and Snapshot screens are functional local tools.                                                     | Browser screenshots across themes, phone/tablet/desktop layouts and packaged-app checks.                                                                                    |
| Settings persistence                        | Confirmed defects: malformed types were accepted; palette/density restoration could disagree with the displayed choices; changing palette could restore an old saved custom theme.                               | Fixed in this follow-up. Settings backup/import and unifying the two preference stores remain separate work.                                                                |
| Autoreply                                   | Confirmed defect: Chat changes could leave Settings stale, and unrelated settings reapplied the stale value. Startup could also overwrite the saved Chat configuration.                                          | Fixed by synchronizing manager events and isolating autoreply effects.                                                                                                      |
| Groups                                      | Confirmed defects: membership failures were swallowed; refresh did not reload the current detail; late responses could restore old-session groups; the Notices tab read a different store from received notices. | Fixed in this follow-up. Group administration and historical notice retrieval remain incomplete.                                                                            |
| Notification filters                        | Confirmed defect: filters classified records but no normalized incoming IM/group-message subscription supplied those records.                                                                                    | Fixed by connecting the normalized ChatManager stream; records remain available when popups are suppressed.                                                                 |
| Local mute enforcement                      | The mute helper existed but had no incoming-message caller and did not recognize normalized sender fields.                                                                                                       | This follow-up applies it before storing new messages, sending autoreplies or emitting notification events. Grid synchronization/persistence remain separate work.          |
| Cache clearing                              | Confirmed defect: clearing replaceable caches also erased saved transaction records, ignored failures and returned before IndexedDB completion.                                                                  | Preserve transaction history, await the device transaction and distinguish device/server success. GPU/decoded-cache eviction remains separate work.                         |
| Chat controls                               | Timestamps and persisted history already had suitable local implementation points but their settings were disabled.                                                                                              | This follow-up wires and enables both. Disabling logging deletes saved chat history and retains the live transcript. Typing and other unsupported controls remain disabled. |
| Competitor inventory                        | The reference XML filenames were captured and linked to pinned commits.                                                                                                                                          | Filenames and suggested counterparts are not feature-completeness evidence; verify each workflow before upgrading its status.                                               |

## Suggested next PRs, in order

### Live-test attempt on 2026-10-06

The user authorized an authenticated Second Life Agni test. A credential-free
connectivity probe to `https://login.agni.lindenlab.com/cgi-bin/login.cgi` failed
with `CONNECT tunnel failed, response 403` from the environment proxy. The enforced
network policy permits package-manager destinations, excludes Second Life, has no
TCP destination grants and has no VPN configured. Credentials were not transmitted.
Login, simulator handshake, scene rendering and account-backed screens remain
unverified. This is an environment access failure, not evidence of invalid account
credentials or a viewer login defect. Live testing needs an environment with the
required HTTPS destinations and simulator UDP connectivity. The smoke script's
successful RPC checks alone would not establish visual rendering correctness.

The follow-up validation passed 139 test files / 1,210 tests, lint, fake-data and
import checks, and production build. After the final density-restoration adjustment,
lint, 27 focused tests and production build passed again.

1. **Live-grid and release validation.** Use `scripts/live-grid-smoke.mjs` with a
   dedicated test account. Check login/MFA, region crossing, mesh/sculpt loading,
   avatar bakes/animations, group data, chat, notices, inventory and voice. Add
   repeatable screenshots for alpha materials, rigged attachments and each theme's
   phone/tablet/desktop layouts. Test Electron asset loading and mobile touch input.
   An authenticated session and simulator connectivity are required; the attempt
   above was blocked before login. This audit does not execute the supplied Lumiya APK.
2. **Rendering completeness and performance.** Add avatar shape deformation;
   face/UV triangle picking; actual distance-based LOD; safe animated bounds;
   independent PBR channel transforms; and measured asset/GPU budgets. Preserve
   the current conservative behavior for unknown/rigged bounds so optimization
   does not hide meshes again. Flexible prims, shadows and full reflection probes
   need explicit implementations rather than enabled preference switches.
3. **Group workflows.** Add active group/titles, join/leave, invitations,
   member/role administration, member-name resolution, group accounting/land and
   historical notices. Reuse the shared viewer RPC layer; require user interaction
   for paid enrollment or destructive membership changes.
4. **Inventory and appearance workflows.** Make complete folder snapshots replace
   stale children atomically while preserving partial fetches. Verify outfit
   wear/remove, permission changes, notecard asset editing and gestures. Add full
   avatar appearance editing and distinguish simulator baking from local baking.
5. **Remaining settings.** Wire graphics presets, avatar complexity, bandwidth,
   typing, browser notification permissions, privacy rights, persisted/grid-synchronized mute lists, media autoplay,
   maturity and RLV enforcement to actual services. Persist custom grid selection
   consistently between login and grid management. Provide validated settings
   backup/restore without credentials or account-private records.
6. **World creation and land administration.** Build/create/edit/link tools,
   uploads, parcel/terrain operations and estate controls are major capability
   projects. A themed screen alone is insufficient; implement protocol actions,
   permission checks, results and failure handling together.
7. **Media, voice and native platform parity.** Voice, directory search,
   payments and local/session transaction records, particles and environment services already have code; earlier
   roadmaps incorrectly called them absent. Verify their real-grid behavior and
   finish incomplete workflows. Full account-wide transaction-history retrieval is still missing; the current endpoint returns this viewer session’s records. Wi-Fi locks, filesystem integration, microphone
   permissions and crash reporting need platform-specific implementations.

## Documentation corrections

`PARITY_ROADMAP.md`, `ROADMAP.md` and `LUMIYA_RENDERING_ANALYSIS.md` contain useful
historical evidence but stale status claims. They are now marked as historical and
point here. `LUMIYA_FEATURE_AUDIT.md` and `RENDERING_STATUS.md` no longer describe
existing search, voice, PBR, particles, attachment or simulator-time paths as
entirely absent. Existing binary avatar/animation assets are present in the current
application; the old binary-asset blocker is not an accurate description of current
rendering. This follow-up imports no recovered application code or binary assets.

The current sources and test files, not old unchecked roadmap boxes, determine
implementation status. A test-backed code path is still separate from verified
live-grid or competitor-equivalent behavior.
