// 登录态(客户端 localStorage)。注:阶段③用 Bearer token;后续可切 httpOnly Cookie。
export type SessionUser = { id: number; email: string; role: string; tenantId: number | null };

const TOKEN_KEY = "aegis_token";
const USER_KEY = "aegis_user";

export function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function getUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

export function setSession(token: string, user: SessionUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
