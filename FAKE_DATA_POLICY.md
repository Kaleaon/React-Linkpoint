# No fabricated data

The viewer shows what a live grid sends and what the resident enters. It never
makes up residents, chats, inventory, scene objects, telemetry or permissions,
and it never turns "unknown" into a plausible-looking value. An unknown value is
shown as "—" (or omitted), and a failed connection is reported as a failure.

## Enforcement

| Tool                                                | What it does                                                                                                                                                                                       |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check:fake-data`                           | Scans shipped source (`src/`, `server.ts`, `electron/`) against the rules in `scripts/fake-data-rules.mjs`. Exits non-zero on any finding. Part of `npm run check` and the CI workflow.            |
| `scripts/fake-data-allowlist.json`                  | The only way to permit a match. Each entry names a rule and a file and **must give a reason**; entries without one are rejected.                                                                   |
| `src/linkpoint/__tests__/fake-data-scanner.test.ts` | Proves every rule fires on known-bad input, that honest code is not flagged, and that the repository itself is clean, so `npm test` fails if fabricated data comes back.                           |
| `src/linkpoint/fabricated-data.ts`                  | Runs at startup and removes fabricated records that older builds saved into storage (seeded chat history and IM sessions). It matches placeholder ids and the `seed-` prefix, never display names. |

Tests may use fixtures. `src/design/` is the synced design prototype and is not
scanned.

## What the scanner cannot do

It matches patterns, so it catches the shapes of fabrication that have actually
occurred (invented names and ids, tick-driven numbers, `|| 48` fallbacks, canned
acknowledgements, simulated sessions, seeded records). A new kind of invented
value that matches none of them will get past it. Review should still ask, for
every displayed value, "where did this come from?" When a new pattern shows up,
add a rule and a failing test for it.

It reports; it does not rewrite code. Rewriting automatically would mean guessing
what real value belongs in its place.
