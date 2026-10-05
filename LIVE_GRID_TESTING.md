# Live grid testing

Unit tests cannot prove that a viewer works against a simulator. Linkpoint therefore includes a
credential-driven smoke test for a dedicated OpenSimulator, Aditi, or other test-grid account. Do
not use a primary Second Life account and never commit credentials.

## Run

Start Linkpoint in one terminal:

```bash
npm run dev
```

Run the read-only live suite in another terminal:

```bash
SL_LOGIN_URL=http://127.0.0.1:9000 \
SL_USERNAME='Test Resident' \
SL_PASSWORD='replace-me' \
npm run test:live-grid
```

Set `LINKPOINT_URL` if the app is not listening at `http://127.0.0.1:3000`. Aditi and production
Second Life login endpoints can be used, but OpenSimulator is preferred for repeatable development.
`SL_START`, `SL_MFA_TOKEN`, and `SL_MFA_HASH` are optional.

The default run logs in, completes the region handshake, fetches the scene snapshot and render
assets, queries nearby map blocks, and exercises the data sources behind Inventory, Friends,
Groups, Balance, Search, and Diagnostics screens. It then disconnects even when a check fails.

Movement and chat change simulator state, so they require explicit opt-in:

```bash
SL_SMOKE_ALLOW_MUTATIONS=1 npm run test:live-grid
```

The movement check presses forward for 250 ms and always sends a neutral movement update
afterwards. The chat check sends a timestamped message on local channel zero.

## OpenSimulator baseline

Use OpenSimulator 0.9.3.0 in standalone mode with a disposable region and user. Its official
documentation describes standalone as the simulator and grid services in one process, with the
login URI normally exposed on port 9000. The smoke test deliberately talks only through Linkpoint's
public HTTP bridge; it does not bypass the app by querying the simulator directly.

The following still require human visual inspection after the automated run:

- region geometry, terrain, textures, avatars, sky, water, HUD placement, and camera movement;
- responsive Tabs, Rail, Sweep Console, Metro, Aero, and Floaters layouts;
- every screen at phone, tablet, and desktop viewport sizes;
- teleport transitions, object touch/sit, inventory mutations, payments, voice, and media.

Record the grid name/version, Linkpoint commit, platform, viewport, and observed failures. A passed
smoke run means the live transport and screen data sources responded; it does not claim full viewer
or rendering parity.
