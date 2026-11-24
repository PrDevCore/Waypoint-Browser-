# Waypoint Browser

Waypoint is a desktop browser and team workspace built with React, TypeScript, Express, SQLite, and Electron. It combines web browsing with account-based tasks, shared documents, team chat, and configurable browser proxy settings.

## Features

- Embedded desktop browser with browser privacy settings and download status.
- Team accounts, task board, collaborative documents, team presence, and chat.
- Themes and appearance customization.
- Per-location HTTP or SOCKS5 proxy settings in Electron.

## Demo and proxy status

There is no hosted demo or bundled VPN service. Proxy connections require a proxy endpoint and, when needed, credentials supplied by the user. Proxy routing and connection checks are implemented for the Electron desktop app; the web and mobile shells do not provide desktop proxy controls. Location names in the interface are presets, not included VPN servers.

## Architecture

- `src/`: React user interface.
- `server.ts` and `server/`: Express API, SQLite persistence, authentication, and authenticated WebSocket chat/presence (`/ws`).
- `electron/`: Electron main and preload processes. Desktop launches the API and serves the built UI on a local loopback port.
- `android/`, `ios/`, and `capacitor.config.json`: Capacitor native project configuration.

## Requirements

- Node.js 22 and npm.
- Windows for the Windows desktop build; Android Studio and an Android SDK for Android builds; macOS with Xcode for iOS builds.
- OpenSSL on `PATH` only if generating a development signing certificate.

## Local development

```sh
npm install
npm run dev
```

The development server serves the Vite UI and API at `http://localhost:3000`. SQLite data is stored locally (see `DB_PATH` below). Copy `.env.example` to `.env` and set values as needed. For a production server, set a unique `JWT_SECRET`; production startup rejects the example/default secret. `PORT` and `HOST` control the listener, `DB_PATH` the SQLite file, and `CORS_ORIGINS` the allowed hosted-client origins. `COOKIE_SECURE=true` is for HTTPS deployments. `.env.example` also lists the hosted client API-base setting.

## Checks

```sh
npm run lint          # TypeScript check
npm test              # Server tests
npm run build         # Web and Electron TypeScript builds
npm run test:electron # Build, launch Electron, and smoke-test its API
```

`npm run test:electron` requires a desktop environment capable of launching Electron.

## Electron desktop build

```sh
npm run dev:electron  # Build and launch the desktop app
npm run package       # Build and package for the current platform
npm run dist:win      # Build and create the Windows NSIS installer
```

Packaged files are written to `release/`. The desktop app stores its SQLite database and browser profile in Electron's per-user data directory.

## Windows code signing

Windows packaging has `forceCodeSigning` enabled. Configure `CSC_LINK` with a PFX certificate path and `CSC_KEY_PASSWORD` with its password before running `npm run dist:win`. `npm run sign:cert` creates a self-signed development certificate under `certificates/` (requires OpenSSL); set `CSC_LINK` to the generated PFX. Self-signed certificates are suitable for development testing only and are not trusted publisher certificates for public distribution. Keep certificates and passwords out of source control.

## REST API

The API is served by the Express server. Except for `/api/health` and auth endpoints, routes require authentication using the session cookie or a bearer token. Accounts are local to the configured SQLite database.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Health check |
| `POST` | `/api/auth/register` | Register an account |
| `POST` | `/api/auth/login` | Sign in |
| `POST` | `/api/auth/logout` | Sign out |
| `GET` | `/api/auth/me` | Current account |
| `GET`, `PUT`, `POST` | `/api/tasks` | List, replace, or create tasks |
| `PUT`, `DELETE` | `/api/tasks/:id` | Update or delete a task |
| `GET`, `PUT`, `POST` | `/api/docs` | List, replace, or create documents |
| `PUT`, `DELETE` | `/api/docs/:id` | Update or delete a document |
| `GET` | `/api/team/members` | List team members |
| `GET`, `PUT`, `POST` | `/api/chat` | Read, replace, or post chat messages |

Authenticated chat and presence updates use the `/ws` WebSocket endpoint. Register and login accept JSON; successful authentication returns a token and sets an HTTP-only cookie. Authentication endpoints are rate limited.

## Mobile builds

Capacitor configuration targets `dist/` as the web bundle. Create native projects (only when they do not already exist) with:

```sh
npm run mobile:add
```

Then sync the web build and open a native project:

```sh
npm run mobile:android
npm run mobile:ios
```

Android builds require Android Studio/SDK. iOS builds require macOS and Xcode. These commands sync and open the projects; they do not produce store-ready signed releases.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for the full text.
