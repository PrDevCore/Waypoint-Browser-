import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "./app";
import { closeDb, resetDbForTest } from "./db";

interface TestApp {
  origin: string;
  close: () => void;
  jar: Map<string, string>;
  request: (path: string, init?: RequestInit) => Promise<Response>;
  json: (path: string, init?: RequestInit) => Promise<any>;
}

const startApp = async (): Promise<TestApp> => {
  const dbPath = path.join(os.tmpdir(), `waypoint-test-${process.pid}-${Date.now()}-${Math.random()}.db`);
  resetDbForTest(dbPath);
  const app = createApp({ storePath: dbPath });
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const jar = new Map<string, string>();


  const request = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers ?? {});
    if (jar.size > 0) {
      headers.set("Cookie", [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "));
    }
    const res = await fetch(`${origin}${path}`, { ...init, headers });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      for (const part of setCookie.split(",")) {
        const kv = part.split(";")[0].split("=");
        if (kv.length === 2) jar.set(kv[0].trim(), kv[1].trim());
      }
    }
    return res;
  };

  const json = async (path: string, init?: RequestInit): Promise<any> => {
    const res = await request(path, init);
    return res.json();
  };

  return {
    origin,
    close: () => {
      server.close();
      closeDb();
      try { fs.unlinkSync(dbPath); } catch {}
      try { fs.unlinkSync(`${dbPath}-wal`); } catch {}
      try { fs.unlinkSync(`${dbPath}-shm`); } catch {}
    },
    jar,
    request,
    json,
  };
};

test("register then login sets session cookie and /api/auth/me returns the user", async () => {
  const app = await startApp();
  try {
    const regBody = await app.json("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com", password: "secret123", name: "Alice" }),
    });
    assert.equal(regBody.ok, true);
    const meBody = await app.json("/api/auth/me");
    assert.equal(meBody.user.email, "alice@example.com");
    assert.equal(meBody.user.name, "Alice");
    const reg2 = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com", password: "secret123", name: "Alice" }),
    });
    assert.equal(reg2.status, 409);
  } finally {
    app.close();
  }
});

test("unauthenticated requests to protected routes are rejected", async () => {
  const app = await startApp();
  try {
    for (const path of ["/api/tasks", "/api/docs", "/api/chat", "/api/auth/me"]) {
      assert.equal((await app.request(path)).status, 401, `${path} should require auth`);
    }
  } finally {
    app.close();
  }
});

test("tasks CRUD round-trips and is user-scoped", async () => {
  const app = await startApp();
  try {
    await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bob@example.com", password: "secret123", name: "Bob" }),
    });

    let tasks = await app.json("/api/tasks");
    assert.deepEqual(tasks, []);

    const created = await app.json("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Deploy WireGuard",
        description: "Set up EU/UK endpoints",
        status: "in_progress",
        priority: "urgent",
        assignee: { name: "Bob", role: "Lead" },
        dueDate: "2026-11-12",
        vpnRequired: true,
        tags: ["Security"],
      }),
    });
    assert.equal(created.title, "Deploy WireGuard");
    const taskId = created.id;

    tasks = await app.json("/api/tasks");
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].id, taskId);

    const updated = await app.json(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    assert.equal(updated.status, "done");

    await app.request(`/api/tasks/${taskId}`, { method: "DELETE" });
    tasks = await app.json("/api/tasks");
    assert.deepEqual(tasks, []);
  } finally {
    app.close();
  }
});

test("docs CRUD round-trips", async () => {
  const app = await startApp();
  try {
    await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "carol@example.com", password: "secret123", name: "Carol" }),
    });

    const doc = await app.json("/api/docs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Spec", content: "# Hello", category: "Architecture" }),
    });
    assert.equal(doc.title, "Spec");
    const docId = doc.id;

    const upd = await app.json(`/api/docs/${docId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Spec v2", content: "# Updated" }),
    });
    assert.equal(upd.title, "Spec v2");

    await app.request(`/api/docs/${docId}`, { method: "DELETE" });
    const list = await app.json("/api/docs");
    assert.deepEqual(list, []);
  } finally {
    app.close();
  }
});

test("registration rejects weak passwords and malformed emails", async () => {
  const app = await startApp();
  const H = { "Content-Type": "application/json" };
  try {
    const weak = await app.request("/api/auth/register", {
      method: "POST", headers: H,
      body: JSON.stringify({ email: "weak@example.com", password: "short", name: "Weak" }),
    });
    assert.equal(weak.status, 400);

    const malformed = await app.request("/api/auth/register", {
      method: "POST", headers: H,
      body: JSON.stringify({ email: "not-an-email", password: "secret123", name: "Malformed" }),
    });
    assert.equal(malformed.status, 400);
  } finally {
    app.close();
  }
});

test("chat POST/GET round-trips and persists", async () => {
  const app = await startApp();
  try {
    await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "dave@example.com", password: "secret123", name: "Dave" }),
    });

    const created = await app.json("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hello world", vpnNode: "London (simulated)" }),
    });
    assert.equal(created.text, "hello world");

    const msgs = await app.json("/api/chat");
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].text, "hello world");
  } finally {
    app.close();
  }
});

test("chat bulk PUT cannot overwrite another user's existing message", async () => {
  const app = await startApp();
  const H = { "Content-Type": "application/json" };
  try {
    await app.request("/api/auth/register", {
      method: "POST", headers: H,
      body: JSON.stringify({ email: "chatowner@example.com", password: "secret123", name: "Chat Owner" }),
    });
    const original = await app.json("/api/chat", {
      method: "POST", headers: H,
      body: JSON.stringify({ text: "original message", vpnNode: "London (proxy)" }),
    });

    await app.request("/api/auth/register", {
      method: "POST", headers: H,
      body: JSON.stringify({ email: "chatattacker@example.com", password: "secret123", name: "Chat Attacker" }),
    });
    await app.request("/api/chat", {
      method: "PUT", headers: H,
      body: JSON.stringify([{ ...original, text: "overwritten message" }]),
    });

    const messages = await app.json("/api/chat");
    assert.equal(messages.length, 1);
    assert.equal(messages[0].text, "original message");
  } finally {
    app.close();
  }
});

test("tasks bulk PUT mirrors the client list and is user-scoped", async () => {
  const app = await startApp();
  const H = { "Content-Type": "application/json" };
  try {
    await app.request("/api/auth/register", {
      method: "POST", headers: H,
      body: JSON.stringify({ email: "bulk1@example.com", password: "secret123", name: "Bulk One" }),
    });
    const list = [
      { id: "t-1", title: "First", description: "d1", status: "backlog", priority: "medium", assignee: { name: "Bulk One", role: "Lead" }, dueDate: "2026-11-12", vpnRequired: false, tags: ["A"] },
      { id: "t-2", title: "Second", description: "d2", status: "in_progress", priority: "high", assignee: { name: "", role: "" }, dueDate: "", vpnRequired: true, tags: [] },
    ];
    const saved = await app.json("/api/tasks", { method: "PUT", headers: H, body: JSON.stringify(list) });
    assert.equal(saved.length, 2);
    assert.equal(saved[0].id, "t-1");

    const next = [
      { ...list[0], title: "First edited", status: "done" },
      { id: "t-3", title: "Third", description: "", status: "backlog", priority: "low", assignee: { name: "", role: "" }, dueDate: "", vpnRequired: false, tags: [] },
    ];
    await app.json("/api/tasks", { method: "PUT", headers: H, body: JSON.stringify(next) });
    const after = await app.json("/api/tasks");
    assert.deepEqual(after.map((t: any) => t.id).sort(), ["t-1", "t-3"]);
    assert.equal(after.find((t: any) => t.id === "t-1").title, "First edited");
    assert.equal(after.find((t: any) => t.id === "t-1").status, "done");

    await app.json("/api/tasks", { method: "PUT", headers: H, body: JSON.stringify([]) });
    assert.deepEqual(await app.json("/api/tasks"), []);

    await app.json("/api/tasks", { method: "PUT", headers: H, body: JSON.stringify(list) });
    await app.request("/api/auth/register", {
      method: "POST", headers: H,
      body: JSON.stringify({ email: "bulk2@example.com", password: "secret123", name: "Bulk Two" }),
    });
    assert.deepEqual(await app.json("/api/tasks"), []);
    await app.request("/api/auth/login", {
      method: "POST", headers: H,
      body: JSON.stringify({ email: "bulk1@example.com", password: "secret123" }),
    });
    assert.equal((await app.json("/api/tasks")).length, 2);
  } finally {
    app.close();
  }
});

test("docs bulk PUT replaces the user's documents", async () => {
  const app = await startApp();
  const H = { "Content-Type": "application/json" };
  try {
    await app.request("/api/auth/register", {
      method: "POST", headers: H,
      body: JSON.stringify({ email: "bulkdocs@example.com", password: "secret123", name: "Bulk Docs" }),
    });
    const docs = [{ id: "d-1", title: "Spec", content: "# Hello", lastEditedBy: "You", updatedAt: Date.now(), category: "Architecture" }];
    const saved = await app.json("/api/docs", { method: "PUT", headers: H, body: JSON.stringify(docs) });
    assert.equal(saved.length, 1);
    assert.equal(saved[0].id, "d-1");
    assert.equal(saved[0].content, "# Hello");

    const upd = await app.json("/api/docs", { method: "PUT", headers: H, body: JSON.stringify([{ ...docs[0], title: "Spec v2", content: "# Updated" }]) });
    assert.equal(upd[0].title, "Spec v2");
    assert.equal(upd[0].content, "# Updated");

    await app.json("/api/docs", { method: "PUT", headers: H, body: JSON.stringify([]) });
    assert.deepEqual(await app.json("/api/docs"), []);
  } finally {
    app.close();
  }
});

test("chat bulk PUT persists the client message list", async () => {
  const app = await startApp();
  const H = { "Content-Type": "application/json" };
  try {
    await app.request("/api/auth/register", {
      method: "POST", headers: H,
      body: JSON.stringify({ email: "bulkchat@example.com", password: "secret123", name: "Bulk Chat" }),
    });
    const msgs = [{ id: "m-1", senderName: "Current User", text: "hello", timestamp: Date.now(), vpnNode: "London (simulated)" }];
    const saved = await app.json("/api/chat", { method: "PUT", headers: H, body: JSON.stringify(msgs) });
    assert.equal(saved.length, 1);
    assert.equal(saved[0].id, "m-1");
    assert.equal(saved[0].text, "hello");
    assert.equal((await app.json("/api/chat")).length, 1);
  } finally {
    app.close();
  }
});

test("bulk PUT rejects invalid bodies", async () => {
  const app = await startApp();
  const H = { "Content-Type": "application/json" };
  try {
    await app.request("/api/auth/register", {
      method: "POST", headers: H,
      body: JSON.stringify({ email: "bulkbad@example.com", password: "secret123", name: "Bulk Bad" }),
    });
    const notArray = await app.request("/api/tasks", { method: "PUT", headers: H, body: JSON.stringify({ id: "x", title: "y" }) });
    assert.equal(notArray.status, 400);
    const missingTitle = await app.request("/api/docs", { method: "PUT", headers: H, body: JSON.stringify([{ id: "d-1" }]) });
    assert.equal(missingTitle.status, 400);
  } finally {
    app.close();
  }
});

test("team directory and chat are shared across users", async () => {
  const app = await startApp();
  const H = { "Content-Type": "application/json" };
  try {
    await app.request("/api/auth/register", {
      method: "POST", headers: H,
      body: JSON.stringify({ email: "team1@example.com", password: "secret123", name: "Team One" }),
    });
    await app.json("/api/chat", {
      method: "POST", headers: H,
      body: JSON.stringify({ text: "Hello from Team One", vpnNode: "London (proxy)" }),
    });

    await app.request("/api/auth/register", {
      method: "POST", headers: H,
      body: JSON.stringify({ email: "team2@example.com", password: "secret123", name: "Team Two" }),
    });

    const members = await app.json("/api/team/members");
    assert.equal(members.length, 2);
    assert.deepEqual(members.map((member: any) => member.name).sort(), ["Team One", "Team Two"]);

    const messages = await app.json("/api/chat");
    assert.equal(messages.length, 1);
    assert.equal(messages[0].text, "Hello from Team One");

    await app.json("/api/chat", {
      method: "POST", headers: H,
      body: JSON.stringify({ text: "Hello from Team Two", vpnNode: "New York (proxy)" }),
    });
    const sharedMessages = await app.json("/api/chat");
    assert.equal(sharedMessages.length, 2);

    const synchronized = await app.request("/api/chat", {
      method: "PUT", headers: H,
      body: JSON.stringify(sharedMessages),
    });
    assert.equal(synchronized.status, 200);
    assert.equal((await app.json("/api/chat")).length, 2);
  } finally {
    app.close();
  }
});

test("registration validates email and password strength", async () => {
  const app = await startApp();
  const H = { "Content-Type": "application/json" };
  try {
    const badEmail = await app.request("/api/auth/register", {
      method: "POST", headers: H,
      body: JSON.stringify({ email: "not-an-email", password: "secret123", name: "Bad Email" }),
    });
    assert.equal(badEmail.status, 400);

    const weakPassword = await app.request("/api/auth/register", {
      method: "POST", headers: H,
      body: JSON.stringify({ email: "valid@example.com", password: "short", name: "Weak Password" }),
    });
    assert.equal(weakPassword.status, 400);
  } finally {
    app.close();
  }
});

test("chat bulk PUT cannot overwrite another user's message", async () => {
  const app = await startApp();
  const H = { "Content-Type": "application/json" };
  try {
    await app.request("/api/auth/register", {
      method: "POST", headers: H,
      body: JSON.stringify({ email: "chatowner@example.com", password: "secret123", name: "Chat Owner" }),
    });
    const original = await app.json("/api/chat", {
      method: "POST", headers: H,
      body: JSON.stringify({ text: "original message", vpnNode: "London (proxy)" }),
    });

    await app.request("/api/auth/register", {
      method: "POST", headers: H,
      body: JSON.stringify({ email: "chatother@example.com", password: "secret123", name: "Other User" }),
    });
    await app.request("/api/chat", {
      method: "PUT", headers: H,
      body: JSON.stringify([{ ...original, text: "overwritten" }]),
    });

    const messages = await app.json("/api/chat");
    assert.equal(messages.length, 1);
    assert.equal(messages[0].text, "original message");
  } finally {
    app.close();
  }
});

test("health endpoint reports sqlite", async () => {
  const app = await startApp();
  try {
    const body = await app.json("/api/health");
    assert.equal(body.db, "sqlite");
  } finally {
    app.close();
  }
});

test("unknown API route returns 404", async () => {
  const app = await startApp();
  try {
    await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "eve@example.com", password: "secret123", name: "Eve" }),
    });
    const res = await app.request("/api/nope");
    assert.equal(res.status, 404);
  } finally {
    app.close();
  }
});


