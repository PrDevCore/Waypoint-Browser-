import { app, BrowserWindow, dialog, ipcMain, safeStorage, session, shell } from "electron";
import path from "path";
import { createServer as createHttpServer } from "http";
import type { AddressInfo } from "net";
import express from "express";
import dotenv from "dotenv";
import crypto from "crypto";
import fs from "fs";

dotenv.config();

// In production __dirname is <app>/dist-electron/electron.
const ROOT = path.resolve(__dirname, "../..");
let httpServer: ReturnType<typeof createHttpServer> | null = null;
let serverPort = 0;
let blockThirdPartyCookies = false;
let sendDoNotTrack = false;
let userDataDirectory = "";
const BROWSER_SESSION = "persist:waypoint-browser";
type ProxyLoginListener = (
  event: Electron.Event,
  webContents: Electron.WebContents | null,
  details: Electron.AuthenticationResponseDetails,
  authInfo: Electron.AuthInfo,
  callback: (username?: string, password?: string) => void
) => void;
let proxyLoginListener: ProxyLoginListener | null = null;

function loadOrCreateSecret(dir: string): string {
  const file = path.join(dir, "jwt-secret");
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  const secret = crypto.randomBytes(48).toString("hex");
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

function getStablePort(userData: string): number | undefined {
  const file = path.join(userData, "browser-port");
  if (!fs.existsSync(file)) return undefined;
  const port = Number(fs.readFileSync(file, "utf8"));
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("The saved browser profile port is invalid. The profile was not moved to a new origin.");
  }
  return port;
}

function readProxyConfigStore(): Record<string, { proxyType: "socks5" | "http"; proxyHost: string; proxyPort: number; credentials: string }> {
  const file = path.join(userDataDirectory, "proxy-configs.json");
  if (!fs.existsSync(file)) return {};
  const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("Stored proxy configuration is invalid.");
  return parsed as Record<string, { proxyType: "socks5" | "http"; proxyHost: string; proxyPort: number; credentials: string }>;
}

function writeProxyConfigStore(store: Record<string, unknown>): void {
  fs.writeFileSync(path.join(userDataDirectory, "proxy-configs.json"), JSON.stringify(store), { mode: 0o600 });
}

function isValidProxyConfig(config: { proxyType: "socks5" | "http"; proxyHost: string; proxyPort: number; proxyUsername?: string; proxyPassword?: string }): boolean {
  return ["socks5", "http"].includes(config.proxyType)
    && typeof config.proxyHost === "string"
    && config.proxyHost.length <= 253
    && Boolean(config.proxyHost.trim())
    && !/[\s/@?#]/.test(config.proxyHost)
    && Number.isInteger(config.proxyPort)
    && config.proxyPort >= 1
    && config.proxyPort <= 65535
    && (config.proxyUsername === undefined || (typeof config.proxyUsername === "string" && config.proxyUsername.length <= 1024))
    && (config.proxyPassword === undefined || (typeof config.proxyPassword === "string" && config.proxyPassword.length <= 1024));
}

function isSafeWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function configureBrowserSession(): void {
  const browserSession = session.fromPartition("persist:waypoint-browser");
  browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  browserSession.setPermissionCheckHandler(() => false);
  browserSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    if (sendDoNotTrack) requestHeaders.DNT = "1";
    if (blockThirdPartyCookies && details.referrer) {
      try {
        if (new URL(details.url).origin !== new URL(details.referrer).origin) {
          for (const name of Object.keys(requestHeaders)) {
            if (name.toLowerCase() === "cookie" || name.toLowerCase() === "cookie2") delete requestHeaders[name];
          }
        }
      } catch {
        // If the referrer cannot be parsed, do not infer a third-party relationship.
      }
    }
    callback({ requestHeaders });
  });
  browserSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    if (blockThirdPartyCookies && details.referrer) {
      try {
        if (new URL(details.url).origin !== new URL(details.referrer).origin) {
          for (const name of Object.keys(responseHeaders)) {
            if (name.toLowerCase() === "set-cookie" || name.toLowerCase() === "set-cookie2") delete responseHeaders[name];
          }
        }
      } catch {
        // If the referrer cannot be parsed, preserve the response headers.
      }
    }
    callback({ responseHeaders });
  });
  browserSession.on("will-download", (_event, item) => {
    const id = crypto.randomUUID();
    const startedAt = Date.now();
    const publish = (state: "progressing" | "completed" | "cancelled" | "interrupted") => {
      win?.webContents.send("browser:download", {
        id,
        filename: path.basename(item.getFilename()),
        path: item.getSavePath() || undefined,
        state,
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        startedAt,
      });
    };
    publish("progressing");
    item.on("updated", (_updateEvent, state) => publish(state === "interrupted" ? "interrupted" : "progressing"));
    item.once("done", (_doneEvent, state) => {
      publish(state === "completed" ? "completed" : state === "cancelled" ? "cancelled" : "interrupted");
    });
  });
}

async function startEmbeddedServer(): Promise<number> {
  const userData = app.getPath("userData");
  fs.mkdirSync(userData, { recursive: true });
  userDataDirectory = userData;
  configureBrowserSession();
  Object.assign(process.env, {
    NODE_ENV: "production",
    HOST: "127.0.0.1",
    DB_PATH: path.join(userData, "app.db"),
    JWT_SECRET: loadOrCreateSecret(userData),
  });

  // Load backend modules after setting per-install paths and the signing key.
  const { createApp } = require(path.join(ROOT, "dist-electron/server/app"));
  const { handleChatUpgrade } = require(path.join(ROOT, "dist-electron/server/ws"));
  const expressApp: express.Express = createApp();
  expressApp.use(express.static(path.join(ROOT, "dist")));
  expressApp.get("*", (_req: express.Request, res: express.Response) => {
    res.sendFile(path.join(ROOT, "dist", "index.html"));
  });

  const server = createHttpServer(expressApp);
  httpServer = server;
  server.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    if (pathname === "/ws") handleChatUpgrade(req, socket, head);
    else socket.destroy();
  });

  const stablePort = getStablePort(userData);
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(stablePort ?? 0, "127.0.0.1", () => {
      server.off("error", onError);
      const address = server.address() as AddressInfo | null;
      if (!address || typeof address === "string") {
        reject(new Error("Embedded server did not provide a TCP port."));
        return;
      }
      serverPort = address.port;
      if (!stablePort) fs.writeFileSync(path.join(userData, "browser-port"), String(serverPort), "utf8");
      console.log(`[server] http://127.0.0.1:${serverPort}`);
      resolve(serverPort);
    });
  });
}

// ---------------------------------------------------------------------------
// Electron window
// ---------------------------------------------------------------------------
let win: BrowserWindow | null = null;

async function createWindow(port: number): Promise<void> {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "Waypoint",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      webviewTag: true,       // enables <webview> in the renderer
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win = window;
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== `http://127.0.0.1:${port}/` && !url.startsWith(`http://127.0.0.1:${port}/`)) event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event, webPreferences, params) => {
    if (!isSafeWebUrl(params.src)) {
      event.preventDefault();
      return;
    }
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
    webPreferences.preload = undefined;
    params.partition = "persist:waypoint-browser";
  });
  window.webContents.on("did-attach-webview", (_event, guest) => {
    guest.setWindowOpenHandler(({ url }) => {
      if (isSafeWebUrl(url)) win?.webContents.send("browser:open-url", url);
      return { action: "deny" };
    });
    guest.on("will-navigate", (event, url) => {
      if (!isSafeWebUrl(url)) event.preventDefault();
    });
    guest.on("will-redirect", (event, url) => {
      if (!isSafeWebUrl(url)) event.preventDefault();
    });
  });

  await window.loadURL(`http://127.0.0.1:${port}`);

  if (!app.isPackaged) {
    window.webContents.openDevTools({ mode: "detach" });
  }

  window.on("closed", () => { win = null; });
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
ipcMain.handle("get-server-port", () => serverPort);
ipcMain.handle("browser:set-privacy", (event, preferences: { blockThirdPartyCookies: boolean; sendDoNotTrack: boolean }) => {
  if (event.sender !== win?.webContents) throw new Error("Browser preferences can only be changed by the app window.");
  if (!preferences || typeof preferences.blockThirdPartyCookies !== "boolean" || typeof preferences.sendDoNotTrack !== "boolean") {
    throw new Error("Invalid browser privacy preferences.");
  }
  blockThirdPartyCookies = preferences.blockThirdPartyCookies;
  sendDoNotTrack = preferences.sendDoNotTrack;
});
ipcMain.handle("browser:open-download", async (event, downloadPath: string) => {
  if (event.sender !== win?.webContents) throw new Error("Downloads can only be opened by the app window.");
  if (typeof downloadPath !== "string" || !downloadPath) throw new Error("Invalid download path.");
  if (!fs.existsSync(downloadPath)) throw new Error("The downloaded file no longer exists.");
  const result = await shell.openPath(downloadPath);
  if (result) throw new Error(result);
});

ipcMain.handle("browser:show-download", (event, downloadPath: string) => {
  if (event.sender !== win?.webContents) throw new Error("Downloads can only be revealed by the app window.");
  if (typeof downloadPath !== "string" || !downloadPath) throw new Error("Invalid download path.");
  if (!fs.existsSync(downloadPath)) throw new Error("The downloaded file no longer exists.");
  shell.showItemInFolder(downloadPath);
});

ipcMain.handle("browser:clear-site-data", async (event, data: { cookies: boolean; cache: boolean }) => {
  if (event.sender !== win?.webContents) throw new Error("Browser data can only be cleared by the app window.");
  if (!data || typeof data.cookies !== "boolean" || typeof data.cache !== "boolean") {
    throw new Error("Invalid browser data-clear request.");
  }
  const browserSession = session.fromPartition("persist:waypoint-browser");
  if (data.cookies) await browserSession.clearStorageData({
    storages: ["cookies", "localstorage", "indexdb", "serviceworkers", "cachestorage", "filesystem"]
  });
  if (data.cache) {
    await browserSession.clearCache();
    await browserSession.clearStorageData({ storages: ["shadercache"] });
  }
  await browserSession.clearAuthCache();
});

// ---------------------------------------------------------------------------
// VPN proxy IPC
// Sets or clears a proxy on the dedicated "waypoint-browser" session that
// all browser <webview> tags use. Affects only webview traffic, not the shell.
// ---------------------------------------------------------------------------
ipcMain.handle("proxy-config:load", (event) => {
  if (event.sender !== win?.webContents) throw new Error("Proxy configuration can only be loaded by the app window.");
  const store = readProxyConfigStore();
  if (Object.keys(store).length > 0 && !safeStorage.isEncryptionAvailable()) {
    throw new Error("Windows secure credential storage is unavailable.");
  }
  return Object.fromEntries(Object.entries(store).map(([id, value]) => {
    const credentials = JSON.parse(safeStorage.decryptString(Buffer.from(value.credentials, "base64"))) as { username?: string; password?: string };
    return [id, { proxyType: value.proxyType, proxyHost: value.proxyHost, proxyPort: value.proxyPort, proxyUsername: credentials.username || undefined, proxyPassword: credentials.password || undefined }];
  }));
});

ipcMain.handle("proxy-config:save", (event, id: string, config: { proxyType: "socks5" | "http"; proxyHost: string; proxyPort: number; proxyUsername?: string; proxyPassword?: string }) => {
  if (event.sender !== win?.webContents) throw new Error("Proxy configuration can only be saved by the app window.");
  if (!/^[a-z0-9_-]{1,64}$/i.test(id) || !config || !isValidProxyConfig(config)) {
    throw new Error("Invalid proxy configuration.");
  }
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows secure credential storage is unavailable.");
  const store = readProxyConfigStore();
  const credentials = safeStorage.encryptString(JSON.stringify({ username: config.proxyUsername ?? "", password: config.proxyPassword ?? "" })).toString("base64");
  store[id] = { proxyType: config.proxyType, proxyHost: config.proxyHost.trim(), proxyPort: config.proxyPort, credentials };
  writeProxyConfigStore(store);
});

ipcMain.handle("proxy-config:remove", (event, id: string) => {
  if (event.sender !== win?.webContents) throw new Error("Proxy configuration can only be removed by the app window.");
  if (!/^[a-z0-9_-]{1,64}$/i.test(id)) throw new Error("Invalid proxy location.");
  const store = readProxyConfigStore();
  delete store[id];
  writeProxyConfigStore(store);
});

ipcMain.handle(
  "vpn-connect",
  async (
    _event,
    config: {
      proxyType: "socks5" | "http";
      proxyHost: string;
      proxyPort: number;
      proxyUsername?: string;
      proxyPassword?: string;
    }
  ) => {
    try {
      if (!config || !isValidProxyConfig(config)) {
        return { ok: false, error: "Invalid proxy configuration." };
      }
      const ses = session.fromPartition(BROWSER_SESSION);
      if (proxyLoginListener) app.removeListener("login", proxyLoginListener);
      proxyLoginListener = null;
      const scheme = config.proxyType === "socks5" ? "socks5" : "http";
      const host = config.proxyHost.includes(":") && !config.proxyHost.startsWith("[") ? `[${config.proxyHost}]` : config.proxyHost;
      const proxyUrl = `${scheme}://${host}:${config.proxyPort}`;
      await ses.setProxy({ proxyRules: proxyUrl, proxyBypassRules: "127.0.0.1,localhost" });
      if (config.proxyUsername || config.proxyPassword) {
        const proxyHost = config.proxyHost.replace(/^\[|\]$/g, "").toLowerCase();
        proxyLoginListener = (event, webContents, _details, authInfo, callback) => {
          if (webContents?.session !== ses
            || !authInfo.isProxy
            || authInfo.port !== config.proxyPort
            || authInfo.host.toLowerCase() !== proxyHost) return;
          event.preventDefault();
          callback(config.proxyUsername ?? "", config.proxyPassword ?? "");
        };
        app.on("login", proxyLoginListener);
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }
);

ipcMain.handle("vpn-disconnect", async () => {
  try {
    const ses = session.fromPartition(BROWSER_SESSION);
    await ses.setProxy({ proxyRules: "direct://", proxyBypassRules: "" });
    if (proxyLoginListener) app.removeListener("login", proxyLoginListener);
    proxyLoginListener = null;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// Test proxy reachability by making a request through the session
ipcMain.handle("vpn-test", async (_event, testUrl: string) => {
  try {
    const ses = session.fromPartition(BROWSER_SESSION);
    const result = await ses.fetch(testUrl, { method: "HEAD" });
    return { ok: result.ok || result.status < 500, status: result.status };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    const port = await startEmbeddedServer();
    await createWindow(port);
  }).catch((error: unknown) => {
    dialog.showErrorBox("Waypoint failed to start", String(error));
    app.quit();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (win === null && httpServer?.listening) {
    const address = httpServer.address() as AddressInfo | null;
    if (address && typeof address !== "string") void createWindow(address.port);
  }
});

app.on("quit", () => {
  httpServer?.close();
});
