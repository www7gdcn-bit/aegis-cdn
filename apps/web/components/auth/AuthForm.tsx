"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { setSession, type SessionUser } from "@/lib/session";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/register";
      const body = mode === "login" ? { email, password } : { email, password, tenantName };
      const res = await api<{ access_token: string; user: SessionUser }>(path, { method: "POST", body, auth: false });
      setSession(res.access_token, res.user);
      router.push("/app");
    } catch (e: any) {
      setErr(e.message || "操作失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-ink px-6">
      <div className="w-full max-w-sm">
        <a href="/" className="mb-8 flex items-center justify-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand to-accent font-bold text-white">A</span>
          <span className="text-lg font-semibold text-white">AegisCDN</span>
        </a>
        <div className="glass-light p-7">
          <h1 className="text-2xl font-semibold text-ink">{mode === "login" ? "登录控制台" : "注册接入"}</h1>
          <p className="mt-1 text-sm text-black/45">
            {mode === "login" ? "管理你的域名与防护策略" : "首个注册账号将成为平台管理员"}
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "register" && (
              <Field label="企业 / 团队名称" value={tenantName} onChange={setTenantName} placeholder="Acme Inc." required />
            )}
            <Field label="邮箱" type="email" value={email} onChange={setEmail} placeholder="you@example.com" required />
            <Field label="密码" type="password" value={password} onChange={setPassword} placeholder="至少 6 位" required />
            {err && <p className="rounded-lg bg-[#FF375F]/10 px-3 py-2 text-sm text-[#FF375F]">{err}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-60">
              {loading ? "处理中…" : mode === "login" ? "登录" : "注册并登录"}
            </button>
          </form>
          <p className="mt-5 text-center text-sm text-black/50">
            {mode === "login" ? (
              <>还没有账号?<a href="/register" className="text-brand">去注册</a></>
            ) : (
              <>已有账号?<a href="/login" className="text-brand">去登录</a></>
            )}
          </p>
        </div>
      </div>
    </main>
  );
}

function Field({
  label, value, onChange, type = "text", placeholder, required,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-[15px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
    </label>
  );
}
