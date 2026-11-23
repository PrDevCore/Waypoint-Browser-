# Waypoint Browser & Team Workspace

A real, full-stack workspace: React + Vite front-end, Express + SQLite backend,
JWT authentication, RESTful resource API, and live WebSocket chat.

## License

Waypoint is licensed under the [MIT License](LICENSE).

## What actually runs

- **Data is persisted in SQLite** (`data/app.db`) — tasks, documents, chat messages,
  and users all live in a real database, not JSON files. `server/db.ts` manages the
  schema, migrations, and row mapping.
- **Authentication is real**: register, login, logout, and session claims via JWT.
  The session cookie is `HttpOnly`, so it is handled server-side.
- **API is RESTful**: `POST /api/auth/register|login|logout`, `GET /api/auth/me`,
  plus `/api/tasks`, `/api/docs`, and `/api/chat` — all endpoints are **user-scoped**
  (data is isolated per authenticated user).
- **Chat is real-time**: an authenticated WebSocket (`ws://localhost:3000/ws`)
  uses the session cookie to push `chat:new` messages without polling.
- **Browser panel** uses Chromium webviews in the desktop app. The persistent browser
  profile stores website data, while Waypoint stores bookmarks, history, tabs, settings,
  and download history in the app profile. Downloads use Chromium's native save dialog.
- **VPN/Team panels** are partly demo UI: gateway inventory, ping/load values, presence,
  and SoftEther integration are not connected to a live provider. The proxy setting routes
  only browser webview traffic and is not a device-wide VPN.

## Run locally

Prerequisites: Node.js 20+.

```bash
npm install
npm run dev          # -> http://localhost:3000
```

Open http://localhost:3000 and sign up. The local server stores data in SQLite.

### Desktop build

The Electron app compiles the renderer, main process, preload bridge, and backend
before launch. Its database and generated JWT signing key are stored in Electron's
per-user data directory. Proxy credentials are encrypted with Electron `safeStorage`
(Windows account-backed protection); legacy plaintext proxy credentials are removed
from browser storage and must be re-entered once. A per-install loopback port is
recorded so the app keeps a stable origin across launches (and therefore retains
cookies and renderer profile data). If another process occupies that port, Waypoint
reports a startup error; close that process and relaunch. On Windows, create the NSIS
installer with:

```bash
npm run dist:win
```

### Windows code signing

Release builds require a code-signing certificate. Electron Builder signs the
executable and NSIS installer with SHA-256 and timestamps signatures.

Set the PFX/P12 certificate and password in the environment before building:

```powershell
$env:CSC_LINK = "C:\Certificates\Waypoint-signing.pfx"
$env:CSC_KEY_PASSWORD = "your-certificate-password"
npm run dist:win
```

For local testing, OpenSSL can generate a development Authenticode certificate:

```powershell
$securePassword = Read-Host "PFX password" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
$env:CSC_KEY_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

npm run sign:cert
$env:CSC_LINK = "${PWD}\certificates\waypoint-signing.pfx"
npm run dist:win
```

A self-signed certificate signs binaries but does not establish public Windows trust.
For distribution, replace it with a PFX issued to your organization by a trusted
code-signing certificate authority. Never commit the PFX/P12 or password. Certificate files are ignored by
`.gitignore`. If no certificate is configured, the release build fails instead
of producing unsigned output.

### Checks

| Command | What it does |
|---------|--------------|
| `npm run lint` | `tsc --noEmit` typecheck (front + back) |
| `npm test` | `node:test` suite against the Express app (auth, auth-scoped CRUD, chat, 404s) |
| `npm run build` | Builds the Vite renderer in `dist/` and Electron/backend TypeScript in `dist-electron/` |
| `npm start` | `node server.ts` production mode (serves `dist/`) |

## Architecture

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”     â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”     â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚   Browser    â”‚â”€â”€â”€â”€â–¶â”‚  Vite +      â”‚â”€â”€â”€â”€â–¶â”‚  Express     â”‚
â”‚   (React)    â”‚     â”‚  TS (front)  â”‚     â”‚  + TS (back) â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜     â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜     â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
       â”‚                                                    â”‚
       â”‚  HTTPS                                           â”‚  HTTP
       â–¼                                                    â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                    HTTP Server                              â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”             â”‚
â”‚  â”‚ REST API         â”‚    â”‚ WebSocket (ws)   â”‚             â”‚
â”‚  â”‚ /api/auth/*      â”‚â—€â”€â”€â–¶â”‚ /ws  (chat)     â”‚             â”‚
â”‚  â”‚ /api/tasks/*     â”‚    â”‚ /ws/browser (Playwright)          â”‚
â”‚  â”‚ /api/docs/*      â”‚    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜             â”‚
â”‚  â”‚ /api/chat/*      â”‚                                     â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                                     â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                                     â”‚
â”‚  â”‚ SQLite           â”‚  (better-sqlite3, WAL mode)         â”‚
â”‚  â”‚ users · tasks ·  â”‚                                     â”‚
â”‚  â”‚ docs · chat_msgs â”‚                                     â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                                     â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

## Data, persistence, and what is simulated

- **Source of truth = SQLite.** `server/db.ts` creates and initializes the database
  with tables for `users`, `tasks`, `docs`, and `chat_messages`. Each table is
  indexed by `user_id` so data is isolated per authenticated user.
- **Authentication** uses `jsonwebtoken` (JWT, 7-day expiry) and `bcryptjs`
  (password hashing, cost factor 10). Tokens are stored in an `HttpOnly` cookie.
- The VPN suite, gateway inventory (IPs, ping, load), team presence, and the browser
  panel's embedded sites are **simulated demo content**: no tunnel is created, no
  traffic is encrypted or rerouted, and sites that forbid framing render blank in
  the iframe.

## Theme choices

Accent colour and background preset are kept per browser in `localStorage` under
`waypoint.theme`; the accent is applied as `--brand-*` custom properties that the
`brand-*` Tailwind utilities read.



