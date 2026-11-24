import express, { Express, Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { db, initDb, type TaskRow, type DocRow, type ChatRow } from "./db";
import { broadcastAll } from "./ws";
import {
  hashPassword,
  comparePassword,
  signToken,
  verifyToken,
  findUserByEmail,
  findUserById,
  createUser,
  type TokenPayload,
} from "./auth";

export interface AppOptions {
  storePath?: string;
  vpn?: {
    serverUrl?: string;
    adminPassword?: string;
    hubName?: string;
  };
}

interface AuthRequest extends Request {
  user?: TokenPayload;
}

// ---------------------------------------------------------------------------
// Simple in-memory rate limiter for auth endpoints.
// Tracks attempts per IP; resets the window after WINDOW_MS.
// No external dependency needed for a single-process server.
// ---------------------------------------------------------------------------
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 20; // max attempts per window per IP

interface RateEntry { count: number; resetAt: number }
const authAttempts = new Map<string, RateEntry>();

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

const authRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const ip = getClientIp(req);
  const now = Date.now();
  const entry = authAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    authAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    next();
    return;
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({ error: "Too many attempts. Please try again later." });
    return;
  }
  next();
};

const requireAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authorization = req.headers.authorization;
  const bearerToken = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : undefined;
  const token = bearerToken ?? req.cookies?.token;
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  req.user = payload;
  next();
};

function uid(req: AuthRequest): string {
  return req.user!.userId;
}

function taskRowToTask(r: TaskRow) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status as "backlog" | "in_progress" | "review" | "done",
    priority: r.priority as "low" | "medium" | "high" | "urgent",
    assignee: { name: r.assignee_name ?? "", role: r.assignee_role ?? "" },
    dueDate: r.due_date ?? "",
    vpnRequired: Boolean(r.vpn_required),
    tags: JSON.parse(r.tags || "[]"),
  };
}

function docRowToDoc(r: DocRow) {
  return {
    id: r.id,
    title: r.title,
    content: r.content,
    lastEditedBy: r.last_edited_by ?? "",
    updatedAt: r.updated_at,
    category: r.category,
  };
}

function chatRowToChat(r: ChatRow) {
  return {
    id: r.id,
    senderName: r.sender_name,
    text: r.text,
    timestamp: r.timestamp,
    vpnNode: r.vpn_node ?? "",
  };
}

export const createApp = ({ storePath }: AppOptions = {}): Express => {
  initDb(storePath);
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.use((req: Request, res: Response, next: NextFunction) => {
    const allowedOrigins = (process.env.CORS_ORIGINS ?? "")
      .split(",")
      .map(origin => origin.trim())
      .filter(Boolean);
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // ---------------------------------------------------------------------------
  // Security headers
  // ---------------------------------------------------------------------------
  app.use((_req: Request, res: Response, next: NextFunction) => {
    // Strict CSP for the Electron shell (served from Express + built dist/).
    // - default-src 'self'          : only load resources from same origin
    // - script-src 'self'           : no inline scripts, no eval
    // - style-src 'self' 'unsafe-inline' : Tailwind injects inline styles at runtime
    // - img-src 'self' data: https: : allow favicons and remote images
    // - connect-src 'self' ws://127.0.0.1:* wss://127.0.0.1:* : allow our WS
    // - font-src 'self' data:
    // - frame-src https:            : <webview> handles its own context; this covers any stray iframes
    // - object-src 'none'           : block plugins
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https: http:",
        "connect-src 'self' ws://127.0.0.1:* wss://127.0.0.1:*",
        "font-src 'self' data:",
        "frame-src https: http:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; ")
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, db: "sqlite" });
  });

  app.post("/api/auth/register", authRateLimit, async (req: Request, res: Response) => {
    const { email: rawEmail, password, name: rawName } = req.body as { email?: string; password?: string; name?: string };
    const email = rawEmail?.trim().toLowerCase();
    const name = rawName?.trim();
    if (!email || !password || !name) {
      res.status(400).json({ error: "Email, password and name are required." });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      res.status(400).json({ error: "A valid email address is required." });
      return;
    }
    if (password.length < 8 || password.length > 1024) {
      res.status(400).json({ error: "Password must be between 8 and 1024 characters." });
      return;
    }
    if (name.length > 100) {
      res.status(400).json({ error: "Name must be 100 characters or fewer." });
      return;
    }
    if (findUserByEmail(email)) {
      res.status(409).json({ error: "Email already registered." });
      return;
    }
    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    createUser(id, email, passwordHash, name);
    const token = signToken({ userId: id, email });
    res.cookie("token", token, { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true", maxAge: 7 * 24 * 60 * 60 * 1000, path: "/" });
    res.status(201).json({ ok: true, token, user: { id, email, name } });
  });

  app.post("/api/auth/login", authRateLimit, async (req: Request, res: Response) => {
    const { email: rawEmail, password } = req.body as { email?: string; password?: string };
    const email = rawEmail?.trim().toLowerCase() ?? "";
    const user = findUserByEmail(email);
    if (!user) { res.status(401).json({ error: "Invalid credentials." }); return; }
    const valid = await comparePassword(password ?? "", user.password_hash);
    if (!valid) { res.status(401).json({ error: "Invalid credentials." }); return; }
    const token = signToken({ userId: user.id, email: user.email });
    res.cookie("token", token, { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true", maxAge: 7 * 24 * 60 * 60 * 1000, path: "/" });
    res.json({ ok: true, token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  });

  app.post("/api/auth/logout", (_req: Request, res: Response) => {
    res.clearCookie("token", { path: "/" });
    res.json({ ok: true });
  });

  app.get("/api/auth/me", requireAuth, (req: AuthRequest, res: Response) => {
    const user = findUserById(req.user!.userId);
    if (!user) { res.status(404).json({ error: "User not found." }); return; }
    res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, avatar: user.avatar } });
  });

  app.get("/api/tasks", requireAuth, (_req: AuthRequest, res: Response) => {
    const rows = db.prepare("SELECT * FROM tasks WHERE user_id = ? ORDER BY updated_at DESC").all(uid(_req)) as TaskRow[];
    res.json(rows.map(taskRowToTask));
  });

  // Bulk replace: the client owns ids and sends its whole list. Upsert within the
  // caller's scope and delete rows no longer present, so the UI's autosave matches.
  app.put("/api/tasks", requireAuth, (req: AuthRequest, res: Response) => {
    const items = req.body as any[];
    if (!Array.isArray(items)) { res.status(400).json({ error: "Expected an array of tasks." }); return; }
    for (const t of items) {
      if (!t || typeof t.id !== "string" || !t.id || typeof t.title !== "string" || !t.title) {
        res.status(400).json({ error: "Each task needs an id and a title." }); return;
      }
    }
    const userId = uid(req); const now = Date.now();
    try {
      db.transaction(() => {
        items.forEach((t, i) => {
          const updatedAt = now - i; // preserve client order through ORDER BY updated_at DESC
          const existing = db.prepare("SELECT id FROM tasks WHERE id = ? AND user_id = ?").get(t.id, userId);
          if (existing) {
            db.prepare(`UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?, assignee_name = ?, assignee_role = ?, due_date = ?, vpn_required = ?, tags = ?, updated_at = ? WHERE id = ? AND user_id = ?`).run(t.title, t.description ?? "", t.status ?? "backlog", t.priority ?? "medium", t.assignee?.name ?? null, t.assignee?.role ?? null, t.dueDate ?? null, t.vpnRequired ? 1 : 0, JSON.stringify(t.tags ?? []), updatedAt, t.id, userId);
          } else {
            db.prepare(`INSERT INTO tasks (id, user_id, title, description, status, priority, assignee_name, assignee_role, due_date, vpn_required, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(t.id, userId, t.title, t.description ?? "", t.status ?? "backlog", t.priority ?? "medium", t.assignee?.name ?? null, t.assignee?.role ?? null, t.dueDate ?? null, t.vpnRequired ? 1 : 0, JSON.stringify(t.tags ?? []), updatedAt, updatedAt);
          }
        });
        if (items.length === 0) {
          db.prepare("DELETE FROM tasks WHERE user_id = ?").run(userId);
        } else {
          const placeholders = items.map(() => "?").join(", ");
          db.prepare(`DELETE FROM tasks WHERE user_id = ? AND id NOT IN (${placeholders})`).run(userId, ...items.map(t => t.id));
        }
      })();
      const rows = db.prepare("SELECT * FROM tasks WHERE user_id = ? ORDER BY updated_at DESC").all(userId) as TaskRow[];
      res.json(rows.map(taskRowToTask));
    } catch (e) {
      if (typeof (e as { code?: string }).code === "string" && (e as { code: string }).code.startsWith("SQLITE_CONSTRAINT")) {
        res.status(409).json({ error: "A task id conflicts with an existing record." }); return;
      }
      throw e;
    }
  });

  app.post("/api/tasks", requireAuth, (req: AuthRequest, res: Response) => {
    const { title, description, status, priority, assignee, dueDate, vpnRequired, tags } = req.body as Partial<{
      title: string; description: string; status: string; priority: string;
      assignee: { name?: string; role?: string }; dueDate: string; vpnRequired: boolean; tags: string[];
    }>;
    if (!title) { res.status(400).json({ error: "Title is required." }); return; }
    const id = crypto.randomUUID(); const now = Date.now();
    db.prepare(`INSERT INTO tasks (id, user_id, title, description, status, priority, assignee_name, assignee_role, due_date, vpn_required, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, uid(req), title, description ?? "", status ?? "backlog", priority ?? "medium", assignee?.name ?? null, assignee?.role ?? null, dueDate ?? null, vpnRequired ? 1 : 0, JSON.stringify(tags ?? []), now, now);
    const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow;
    res.status(201).json(taskRowToTask(row));
  });

  app.put("/api/tasks/:id", requireAuth, (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const fields = req.body as Partial<{
      title: string; description: string; status: string; priority: string;
      assignee: { name?: string; role?: string }; dueDate: string; vpnRequired: boolean; tags: string[];
    }>;
    const existing = db.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?").get(id, uid(req)) as TaskRow | undefined;
    if (!existing) { res.status(404).json({ error: "Task not found." }); return; }
    const now = Date.now();
    db.prepare(`UPDATE tasks SET title = COALESCE(?, title), description = COALESCE(?, description), status = COALESCE(?, status), priority = COALESCE(?, priority), assignee_name = COALESCE(?, assignee_name), assignee_role = COALESCE(?, assignee_role), due_date = COALESCE(?, due_date), vpn_required = CASE WHEN ? IS NOT NULL THEN ? ELSE vpn_required END, tags = COALESCE(?, tags), updated_at = ? WHERE id = ? AND user_id = ?`).run(fields.title, fields.description, fields.status, fields.priority, fields.assignee?.name ?? null, fields.assignee?.role ?? null, fields.dueDate, fields.vpnRequired !== undefined ? 1 : null, fields.vpnRequired ? 1 : 0, fields.tags !== undefined ? JSON.stringify(fields.tags) : null, now, id, uid(req));
    const row = db.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?").get(id, uid(req)) as TaskRow;
    res.json(taskRowToTask(row));
  });

  app.delete("/api/tasks/:id", requireAuth, (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const info = db.prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?").run(id, uid(req));
    if (info.changes === 0) { res.status(404).json({ error: "Task not found." }); return; }
    res.json({ ok: true });
  });

  app.get("/api/docs", requireAuth, (_req: AuthRequest, res: Response) => {
    const rows = db.prepare("SELECT * FROM docs WHERE user_id = ? ORDER BY updated_at DESC").all(uid(_req)) as DocRow[];
    res.json(rows.map(docRowToDoc));
  });

  app.put("/api/docs", requireAuth, (req: AuthRequest, res: Response) => {
    const items = req.body as any[];
    if (!Array.isArray(items)) { res.status(400).json({ error: "Expected an array of docs." }); return; }
    for (const d of items) {
      if (!d || typeof d.id !== "string" || !d.id || typeof d.title !== "string" || !d.title) {
        res.status(400).json({ error: "Each doc needs an id and a title." }); return;
      }
    }
    const userId = uid(req); const now = Date.now();
    try {
      db.transaction(() => {
        for (const d of items) {
          const updatedAt = typeof d.updatedAt === "number" ? d.updatedAt : now;
          const existing = db.prepare("SELECT id FROM docs WHERE id = ? AND user_id = ?").get(d.id, userId);
          if (existing) {
            db.prepare(`UPDATE docs SET title = ?, content = ?, last_edited_by = ?, updated_at = ?, category = ? WHERE id = ? AND user_id = ?`).run(d.title, d.content ?? "", d.lastEditedBy ?? "", updatedAt, d.category ?? "General", d.id, userId);
          } else {
            db.prepare(`INSERT INTO docs (id, user_id, title, content, last_edited_by, updated_at, category, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(d.id, userId, d.title, d.content ?? "", d.lastEditedBy ?? "", updatedAt, d.category ?? "General", now);
          }
        }
        if (items.length === 0) {
          db.prepare("DELETE FROM docs WHERE user_id = ?").run(userId);
        } else {
          const placeholders = items.map(() => "?").join(", ");
          db.prepare(`DELETE FROM docs WHERE user_id = ? AND id NOT IN (${placeholders})`).run(userId, ...items.map(d => d.id));
        }
      })();
      const rows = db.prepare("SELECT * FROM docs WHERE user_id = ? ORDER BY updated_at DESC").all(userId) as DocRow[];
      res.json(rows.map(docRowToDoc));
    } catch (e) {
      if (typeof (e as { code?: string }).code === "string" && (e as { code: string }).code.startsWith("SQLITE_CONSTRAINT")) {
        res.status(409).json({ error: "A doc id conflicts with an existing record." }); return;
      }
      throw e;
    }
  });

  app.post("/api/docs", requireAuth, (req: AuthRequest, res: Response) => {
    const { title, content, category } = req.body as Partial<{ title: string; content: string; category: string }>;
    if (!title) { res.status(400).json({ error: "Title is required." }); return; }
    const id = crypto.randomUUID(); const now = Date.now();
    db.prepare(`INSERT INTO docs (id, user_id, title, content, last_edited_by, updated_at, category, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, uid(req), title, content ?? "", "", now, category ?? "General", now);
    const row = db.prepare("SELECT * FROM docs WHERE id = ?").get(id) as DocRow;
    res.status(201).json(docRowToDoc(row));
  });

  app.put("/api/docs/:id", requireAuth, (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { title, content, category, lastEditedBy } = req.body as Partial<DocRow & { lastEditedBy: string }>;
    const existing = db.prepare("SELECT * FROM docs WHERE id = ? AND user_id = ?").get(id, uid(req)) as DocRow | undefined;
    if (!existing) { res.status(404).json({ error: "Doc not found." }); return; }
    const now = Date.now();
    db.prepare(`UPDATE docs SET title = COALESCE(?, title), content = COALESCE(?, content), last_edited_by = COALESCE(?, last_edited_by), updated_at = ?, category = COALESCE(?, category) WHERE id = ? AND user_id = ?`).run(title, content, lastEditedBy, now, category, id, uid(req));
    const row = db.prepare("SELECT * FROM docs WHERE id = ? AND user_id = ?").get(id, uid(req)) as DocRow;
    res.json(docRowToDoc(row));
  });

  app.delete("/api/docs/:id", requireAuth, (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const info = db.prepare("DELETE FROM docs WHERE id = ? AND user_id = ?").run(id, uid(req));
    if (info.changes === 0) { res.status(404).json({ error: "Doc not found." }); return; }
    res.json({ ok: true });
  });

  app.get("/api/team/members", requireAuth, (_req: AuthRequest, res: Response) => {
    const rows = db.prepare("SELECT id, name, role, avatar FROM users ORDER BY name ASC").all() as Array<{ id: string; name: string; role: string; avatar: string | null }>;
    res.json(rows.map(row => ({ id: row.id, name: row.name, role: row.role, avatar: row.avatar })));
  });

  app.get("/api/chat", requireAuth, (_req: AuthRequest, res: Response) => {
    const rows = db.prepare("SELECT * FROM chat_messages ORDER BY timestamp ASC").all() as ChatRow[];
    res.json(rows.map(chatRowToChat));
  });

  app.put("/api/chat", requireAuth, (req: AuthRequest, res: Response) => {
    const items = req.body as any[];
    if (!Array.isArray(items)) { res.status(400).json({ error: "Expected an array of messages." }); return; }
    for (const m of items) {
      if (!m || typeof m.id !== "string" || !m.id || typeof m.text !== "string" || !m.text) {
        res.status(400).json({ error: "Each message needs an id and text." }); return;
      }
    }
    const userId = uid(req); const now = Date.now();
    try {
      db.transaction(() => {
        for (const m of items) {
          const timestamp = typeof m.timestamp === "number" ? m.timestamp : now;
          const existing = db.prepare("SELECT id FROM chat_messages WHERE id = ?").get(m.id);
          if (!existing) {
            db.prepare(`INSERT INTO chat_messages (id, user_id, sender_name, text, timestamp, vpn_node, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(m.id, userId, m.senderName ?? "User", m.text, timestamp, m.vpnNode ?? null, now);
          }
        }
        // Chat is shared workspace data. Bulk PUT synchronizes local snapshots
        // without deleting messages owned by another workspace member.
      })();
      const rows = db.prepare("SELECT * FROM chat_messages ORDER BY timestamp ASC").all() as ChatRow[];
      res.json(rows.map(chatRowToChat));
    } catch (e) {
      if (typeof (e as { code?: string }).code === "string" && (e as { code: string }).code.startsWith("SQLITE_CONSTRAINT")) {
        res.status(409).json({ error: "A message id conflicts with an existing record." }); return;
      }
      throw e;
    }
  });

  app.post("/api/chat", requireAuth, (req: AuthRequest, res: Response) => {
    const { text, vpnNode } = req.body as Partial<{ text: string; vpnNode: string }>;
    if (!text) { res.status(400).json({ error: "Text is required." }); return; }
    const user = findUserById(uid(req));
    const id = crypto.randomUUID(); const now = Date.now();
    db.prepare(`INSERT INTO chat_messages (id, user_id, sender_name, text, timestamp, vpn_node, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, uid(req), user?.name ?? "User", text, now, vpnNode ?? null, now);
    const row = db.prepare("SELECT * FROM chat_messages WHERE id = ?").get(id) as ChatRow;
    const message = chatRowToChat(row);
    broadcastAll({ type: "chat:new", message });
    res.status(201).json(message);
  });

  return app;
};

