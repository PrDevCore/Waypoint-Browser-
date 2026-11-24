import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electronBinary = require('electron');
const child = spawn(electronBinary, ['.'], {
  cwd: path.resolve('.'),
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'production' },
});

let output = '';
child.stdout.on('data', chunk => { output += chunk.toString(); });
child.stderr.on('data', chunk => { output += chunk.toString(); });

async function waitForServer(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
    if (match) return match[1];
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return null;
}

const startedAt = Date.now();
const port = await waitForServer();
if (!port) {
  child.kill();
  throw new Error(`Electron did not start an embedded server within 30 seconds.\n${output}`);
}

const origin = `http://127.0.0.1:${port}`;
const health = await fetch(`${origin}/api/health`);
if (!health.ok) {
  child.kill();
  throw new Error(`Health check failed (${health.status}).\n${output}`);
}

const cookies = new Map();
const request = async (url, init = {}) => {
  const headers = new Headers(init.headers ?? {});
  if (cookies.size) headers.set('cookie', [...cookies].map(([key, value]) => `${key}=${value}`).join('; '));
  const response = await fetch(url, { ...init, headers });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
	for (const item of setCookie.split(',')) {
	  const pair = item.split(';')[0].trim();
	  const separator = pair.indexOf('=');
	  if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
	}
  }
  return response;
};

const email = `smoke-${Date.now()}@example.com`;
const register = await request(`${origin}/api/auth/register`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password: 'smoke-test-123', name: 'Smoke Test' }),
});
if (!register.ok) {
  child.kill();
  throw new Error(`Registration failed (${register.status}).`);
}

const me = await request(`${origin}/api/auth/me`);
if (!me.ok) {
  child.kill();
  throw new Error(`Authenticated session check failed (${me.status}).`);
}

const task = await request(`${origin}/api/tasks`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ title: 'Electron smoke task', status: 'backlog', priority: 'medium' }),
});
if (!task.ok) {
  child.kill();
  throw new Error(`Task persistence check failed (${task.status}).`);
}

console.log(`Electron smoke passed at ${origin} in ${Date.now() - startedAt}ms`);
child.kill();
