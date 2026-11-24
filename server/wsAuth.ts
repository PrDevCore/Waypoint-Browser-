import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
import { verifyToken, findUserById, type TokenPayload } from "./auth";

export function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Authenticates a WebSocket upgrade using the same HttpOnly `token` cookie as the REST API.
 * Also rejects cross-origin upgrades (cross-site WebSocket hijacking).
 * If you run behind a reverse proxy, make sure it forwards the original Host header.
 */
export function authenticateUpgrade(req: IncomingMessage): TokenPayload | null {
  const origin = req.headers.origin;
  if (origin) {
    const allowedOrigins = (process.env.CORS_ORIGINS ?? "")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean);
    try {
      const sameHost = new URL(origin).host === req.headers.host;
      const explicitlyAllowed = allowedOrigins.includes(origin);
      if (!sameHost && !explicitlyAllowed) return null;
    } catch {
      return null;
    }
  }
  const protocolHeader = req.headers["sec-websocket-protocol"];
  const protocols = Array.isArray(protocolHeader) ? protocolHeader : protocolHeader?.split(",") ?? [];
  const bearerToken = protocols.map(value => value.trim()).find(value => value.startsWith("waypoint-bearer."))?.slice("waypoint-bearer.".length);
  const token = parseCookie(req.headers.cookie, "token") ?? bearerToken;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  return findUserById(payload.userId) ? payload : null;
}

export function rejectUpgrade(socket: Duplex, status = 401, text = "Unauthorized") {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}
