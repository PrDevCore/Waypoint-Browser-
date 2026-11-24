const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
const AUTH_TOKEN_KEY = "waypoint.auth.token";

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string | null): void {
  if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
  else localStorage.removeItem(AUTH_TOKEN_KEY);
}

type Method = "GET" | "POST" | "PUT" | "DELETE";

async function request(path: string, method: Method = "GET", body?: unknown): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers();
  if (body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  return fetch(`${API_BASE}${path}`, {
	method,
	headers,
	body: body ? JSON.stringify(body) : undefined,
	credentials: "include",
  });
}

export async function apiJson<T = any>(path: string, method: Method = "GET", body?: unknown): Promise<T> {
  const res = await request(path, method, body);
  if (res.status === 401) {
	const err: any = new Error("Unauthorized");
	err.status = 401;
	throw err;
  }
  if (!res.ok) {
	let msg = `Request failed (${res.status})`;
	try {
	  const data = await res.json();
	  msg = data.error || msg;
	} catch {}
	const err: any = new Error(msg);
	err.status = res.status;
	throw err;
  }
  if (res.status === 204) return null as unknown as T;
  return res.json();
}

export { request };
