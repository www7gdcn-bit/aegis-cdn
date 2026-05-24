// 控制面 API 客户端(浏览器侧)。指向 NestJS apps/api。
import { getToken, clearSession } from "./session";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";

type Opts = { method?: string; body?: unknown; auth?: boolean };

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const { method = "GET", body, auth = true } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const t = getToken();
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("无法连接控制面 API,请确认 apps/api 已启动(默认 :4000)");
  }
  if (res.status === 401) {
    clearSession();
    if (typeof window !== "undefined" && location.pathname.startsWith("/app")) {
      location.href = "/login";
    }
    throw new Error("未授权,请重新登录");
  }
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const j = await res.json();
      msg = Array.isArray(j.message) ? j.message.join("; ") : j.message || msg;
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null as T;
  return res.json();
}

export const API_BASE = BASE;
