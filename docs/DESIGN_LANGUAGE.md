# Viewer design alignment

The viewer uses independent layout and colour packs. Selecting Sweep Console (including its
`lcars` alias) applies LCARS structure to every colour pack. LCARS Amber is the black-field
reference; other palettes retain their identity and are LCARS-inspired. Metro, Terminal, Glass,
Rule & Rail and Press retain their own layout rules.

## Reference snapshots

Reviewed on 2026-10-11:

- [Linkpoint Design at 5e006735](https://github.com/Kaleaon/linkpoint-design/tree/5e0067356f3879e011a911e0e1e412bcb545dc6c):
  viewer screen inventory, layout/palette separation, responsive shell and SL desktop floaters.
- [Ktheme at cf6ccef5](https://github.com/Kaleaon/Ktheme/tree/cf6ccef51ccf32030141bf8dc6005ccba3871410):
  portable colour roles, iconic layout conventions, filled LCARS bars and app-specific adaptation.
- [CleverFerret Design at f3385daa](https://github.com/Kaleaon/Cleverferret-design/tree/f3385daa62eb21412f915f4dd183ef528cfba405):
  `design-notes/design-language.md`, `docs/cf-system.js` and `docs/cf-ui.css` supply the revised
  split frame, concentric corners, unboxed readouts and dedicated feedback rows.

CleverFerret's latest LCARS correction takes precedence over the older title-on-bar Linkpoint
prototype and Ktheme's aubergine example. Imported theme JSON remains unchanged. The typed viewer
palette adapter uses the revised black background/surface and warm metadata text. This deliberate
adapter difference must be retained when syncing JSON; the repositories have not been rewritten
or published by this change. `npm run sync-design` validates integration, rather than fetching
new upstream files.

## Shared implementation

- `packages/design-system/src/tokens/lcars.ts` derives both opposing elbows, header/readout
  space, rail origin and content origin from one geometry. Outer ellipse radii equal rail + inner
  radius horizontally and bar + inner radius vertically. These are prototype conventions,
  rather than an official pixel specification for every LCARS console.
- `LcarsChrome` draws the same frame for the application, shared ConsoleFrame and desktop shell.
  Titles/readouts sit in the field; decorative bars carry no text. Rail segments are navigation
  controls, with an active state and keyboard activation. Feedback uses the console footer or
  desktop header readout, so it does not obscure the content.
- Sweep filters, switches and actions use flat, filled controls. Section headers use cap → title
  → bar → end cap. Cards and settings panels follow each layout's edge/radius treatment.
- Phone/tablet settings, primary card actions, Sweep segmented controls, scene dock buttons and rail sub-navigation
  have 48px targets. Compact desktop window controls retain their viewer-specific sizing.
- The shared token resolver checks text/status roles against background, surface and raised
  surface together. `priText` is independent from the primary fill; filled labels are resolved
  against their actual fill. All 24 built-in palettes have regression coverage. Arbitrary custom
  surfaces may have no single colour meeting AA on all surfaces; the resolver chooses the best
  achievable ink in that case. This is not a complete accessibility certification.
- Flex containers permit content to shrink and scroll inside the viewport, including tablet and
  narrow desktop settings panels. Motion follows the system's reduced-motion preference.

## Intentional differences and remaining scope

Content and camera controls retain pictograms for recognition/accessibility; the frame and
navigation rail stay text-led. Native Android, live grid interactions, and real microphone/speaker
hardware have not been validated by these browser layout checks. Browser checks use fallback
fonts; real-device typography and native parity remain separate acceptance work. Glass contrast
here covers solid UI surfaces, not arbitrary photographic content behind translucent overlays.
Second Life protocol/rendering/audio parity is tracked separately in `viewer-parity.md`.

## Validation for this pass

- 181 test files / 1,726 tests pass, including geometry, palette contrast and shared console controls.
- TypeScript, lint error checks, formatting, design-package integration and the production build pass.
- Real Chromium checks cover the six main layout families at 390, 768 and 1440px, plus the Sweep
  3D view at 320, 390 and 768px. A separate 320px interaction check verifies pointer cancellation,
  keyboard release, visible telemetry and dock targets. No browser page errors were observed.
- The production build retains its existing large-bundle warning; live-grid and native validation
  remain outstanding.
