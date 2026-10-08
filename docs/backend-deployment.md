# Backend deployment (Second Life connectivity)

The Vercel deployment serves only the static frontend. All Second Life traffic —
login, sessions, and the UDP protocol to SL simulators — runs in `server.ts`,
which Vercel cannot host (no UDP sockets, no long-lived SSE/WebSocket
connections). So the backend lives on Fly.io (or any Node 22+ host with UDP),
and Vercel proxies `/api/*` to it via `vercel.json` rewrites. The browser stays
same-origin, so no CORS changes are needed.

## Deploy the backend

```bash
fly launch          # accept the detected settings; app name: linkpoint-backend
fly secrets set APP_URL=https://<your-vercel-app>.vercel.app PROXY_PERMIT_SECRET=$(openssl rand -hex 32)
fly deploy
```

`APP_URL` locks the API's CORS origin to the Vercel frontend. `fly.toml` keeps
one machine always on (`auto_stop_machines = "off"`) because SL sessions hold
UDP circuits and SSE streams that must not suspend.

Any other host works too: `docker build -t linkpoint-backend .` then run with
`PORT=3000`, `APP_URL`, and `PROXY_PERMIT_SECRET` set.

## Point Vercel at it

`vercel.json` rewrites `/api/:path*` to `https://linkpoint-backend.fly.dev/api/:path*`.
If the backend lives at a different URL, change the `destination` — that's the
only line that knows where the backend is.

## Verify

1. Open `https://<your-vercel-app>.vercel.app/api/health` → `{"status":"ok",...}`.
   (If this 404s, the rewrite isn't active — redeploy the Vercel project.)
2. Log into Second Life from the Vercel URL. The login POST, session calls, and
   SSE event stream all ride the rewrite to the backend, which opens the UDP
   circuit to the simulator.

## Notes

- The WebSocket UDP bridge at `/api/udp-proxy` also rides the rewrite, but
  nothing in the app uses it yet — all SL traffic goes through the backend
  `ViewerSession` over HTTP/SSE. It's there if a future client needs raw UDP
  from the browser.
- `server.ts` serves `dist/` itself too, so the same Docker image works as a
  standalone full-stack deployment (frontend + backend on one origin).
