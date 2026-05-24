"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, getToken, getUser } from "@/lib/session";

const NAV = [
  { href: "/app", label: "概览", exact: true },
  { href: "/app/domains", label: "域名管理" },
  { href: "/app/billing", label: "套餐与计费" },
  { href: "/app/payments", label: "支付记录" },
  { href: "/app/kyc", label: "实名认证" },
  { href: "/admin/security", label: "安全总览" },
];

export default function ConsoleShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setEmail(getUser()?.email || "");
    setReady(true);
  }, [router]);

  if (!ready) return <div className="grid h-screen place-items-center bg-mist text-black/40">加载中…</div>;

  const logout = () => {
    clearSession();
    router.replace("/login");
  };

  return (
    <div className="flex min-h-screen bg-mist">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-black/[0.06] bg-white md:flex">
        <a href="/app" className="flex h-16 items-center gap-2 px-6">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-brand to-accent text-sm font-bold text-white">A</span>
          <span className="font-semibold text-ink">AegisCDN</span>
        </a>
        <nav className="flex-1 px-3 py-2">
          {NAV.map((n) => {
            const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
            return (
              <a key={n.href} href={n.href}
                className={`mb-1 block rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active ? "bg-brand/10 text-brand" : "text-black/60 hover:bg-black/[0.04]"
                }`}>
                {n.label}
              </a>
            );
          })}
        </nav>
        <div className="border-t border-black/[0.06] p-4">
          <div className="truncate text-xs text-black/40">{email}</div>
          <button onClick={logout} className="mt-2 text-sm text-black/55 hover:text-[#FF375F]">退出登录</button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
