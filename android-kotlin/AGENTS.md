# Agent notes for `android-kotlin/`

Native Android port of Linkpoint (Kotlin, Compose, Filament). Read `README.md` first: it lists what is implemented, what is
verified and by what, and what is not done (voice is not implemented; the Filament view has not run on a device).

## Run the tests

- Fast, hermetic (JUnit, includes a fake grid over real sockets): `./gradlew :core:test`
- Debug APK: `./gradlew :app:assembleDebug`
- Against a REAL OpenSim, fully automated (downloads and configures OpenSim, creates an account, loads an OAR, runs the tests, stops it):
  `python3 tools/opensim/live.py` (add `--big` for a 770 MB real-world OAR, `--oar PATH` for your own, `--keep` to leave OpenSim up).
  Needs `dotnet-sdk-8.0` and `libgdiplus`. Exit code is the result; `LIVE ...` lines in the Gradle output show what was measured.
- Live tests are in `core/src/test/kotlin/app/linkpoint/core/OpenSimLiveTest.kt` and skip themselves unless `OPENSIM_LOGIN_URL` is set.

## Conventions

- Unknown values are shown as "—", never invented (repo FAKE_DATA_POLICY).
- Do not claim rendering works without running it: only compile-verification exists for `app/.../world/`.
- Do not `pkill -f` a pattern that appears in your own command line (it kills your shell); use `pkill -x name` or PIDs.
