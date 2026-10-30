# SafeScreen — Vercel edition

Read-only screen mirroring, a document reader, and voice — built to run on
**Vercel**. This is the serverless rewrite of the original SafeScreen: Next.js
App Router, stateless signed-cookie auth, Redis for shared state, Sarvam for
voice and document reading, and reconnect logic on the client.

Still watch-only by design: there is **no data channel and no input path**, so a
viewer can see your screen but can never control your machine.

---

## What's inside

| Piece | Where |
| --- | --- |
| Login / session | `app/api/login`, `lib/auth.js` (stateless signed cookie) |
| Screen share + view | `app/share`, `app/view`, `components/ShareClient.jsx`, `ViewClient.jsx` |
| Document reader + voice | `app/reader`, `components/ReaderClient.jsx` |
| Self-contained demo | `app/demo`, `components/DemoClient.jsx` |
| Signalling relay | `app/api/ws/route.js` + `lib/rooms.js` |
| Sarvam integration | `lib/sarvam.js` (TTS + Document AI) |
| Shared state | `lib/store.js` (Upstash Redis, memory fallback) |

## Deploy to Vercel

### 1. Push to GitHub

```bash
cd safescreen-vercel
git init
git add .
git commit -m "SafeScreen (Vercel edition)"
git branch -M main
git remote add origin https://github.com/<you>/safescreen-vercel.git
git push -u origin main
```

`.gitignore` already excludes `node_modules/`, `.next/` and `.env*`. **Never
commit your env file** — it holds the password, secret and API key.

(The GitHub web uploader works too, but it can't skip `node_modules` for you and
caps at 100 files per upload — git is safer.)

### 2. Create the project on Vercel

- Vercel dashboard → **Add New → Project** → import the repo.
- Framework preset is detected as **Next.js**. Leave build settings default.
- **Turn on Fluid compute** (Settings → Functions). It's on by default for
  projects created after 23 Apr 2025 and is **required for WebSockets**.

### 3. Add the environment variables

Settings → Environment Variables (Production + Preview + Development):

| Variable | Required | Notes |
| --- | --- | --- |
| `APP_PASSWORD` | yes | long random passphrase |
| `SESSION_SECRET` | yes | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `SARVAM_API_KEY` | for voice/PDF | your **rotated** Sarvam key |
| `SARVAM_TTS_MODEL` | no | default `bulbul:v4-flash` |
| `SARVAM_TTS_SPEAKER` | no | default `shubh_enhi_ads` |
| `SARVAM_TTS_LANGUAGE` | no | default `en-IN` |
| `UPSTASH_REDIS_REST_URL` | yes | from Upstash (see below) |
| `UPSTASH_REDIS_REST_TOKEN` | yes | from Upstash |
| `TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL` | no | for cross-network media |

### 4. Add Redis (Upstash)

Vercel → **Storage → Marketplace → Upstash Redis** → create a database and
connect it to the project. That injects `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` for you.

**Redis is required on Vercel.** A WebSocket connection is pinned to one function
instance, and in-memory state does not cross instances — so rooms and presence
live in Redis, and signals to a peer on another instance travel through a
per-socket mailbox that the owning instance drains. Without Redis the app still
runs, but only when both peers happen to land on the same instance.

Redeploy after adding env vars.

## Sarvam setup (voice + document reading)

One key powers both halves:

- **Voice** — `POST /api/tts` proxies Sarvam **Bulbul** TTS
  (`https://api.sarvam.ai/text-to-speech`). The key stays server-side; the
  browser only ever talks to your app. REST caps text at 2500 characters per
  call, so the reader chunks the document and plays chunk by chunk.
- **Reading PDFs** — `POST /api/digitise` creates a Sarvam **Document AI** job
  (`/doc-ai/v1/job/digitise`), then `GET /api/digitise?jobId=…` polls until it
  completes and returns the extracted text. Document AI caps at **10 pages per
  PDF**, and Vercel caps request bodies at ~4.5 MB.

TXT/MD files and pasted text are read in the browser, so they need no key. If
`SARVAM_API_KEY` is missing, the reader falls back to the browser's built-in
speech engine for voice.

## Local development

```bash
npm install
cp .env.example .env.local     # fill in the values
npm run dev                    # http://localhost:3000
```

For the **WebSocket** route locally, use the Vercel CLI so the upgrade shim is
present:

```bash
npm i -g vercel
vercel dev
```

## Tests

```bash
npm test        # 18 checks: room manager (incl. cross-instance) + auth
npm run build   # production build
```

The room-manager test simulates two instances sharing one store and asserts that
signalling reaches a peer on the other instance — the part that breaks if you
rely on in-memory state alone.

## Security notes

- Everything (pages, APIs, the WebSocket upgrade) requires the signed session.
- Auth is a **stateless HMAC-signed cookie** — no server store needed, so it is
  correct across instances.
- Login is rate-limited per IP via the shared store (10 / 10 min).
- The relay forwards only SDP/ICE; there is no input channel.
- Security headers (CSP, `frame-ancestors 'none'`, `X-Frame-Options`) are set in
  `next.config.js`.
- **Rotate the Sarvam key** that was shared in chat before you deploy.

## Vercel caveats (by design, not bugs)

- **Connections close at the function's max duration** (300s Hobby / 800s Pro),
  so the client reconnects automatically (1s → 30s backoff, re-`join` on open).
  A reconnect is expected, not an error.
- **State must live in Redis** — see above.
- The demo page (`/demo`) runs both ends in one tab so you can prove the whole
  path works after deploying.

## License

MIT. Review before production use.
