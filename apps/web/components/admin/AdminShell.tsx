"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getToken, getUser, clearSession } from "@/lib/session";

const NAV = [
  { href: "/admin/security", label: "安全总览" },
  { href: "/admin/reviews", label: "接入审核" },
  { href: "/admin/blocks", label: "封禁管理" },
  { href: "/admin/payments", label: "支付配置" },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const role = getUser()?.role;
    if (!getToken() || !(role === "admin" || role === "operator")) {
      router.replace("/login");
      return;
    }
    setOk(true);
  }, [router]);

  if (!ok) return <div className="grid h-screen place-items-center bg-mist text-black/40">校验权限中…</div>;

  return (
    <main className="min-h-screen bg-mist">
      <header className="sticky top-0 z-10 border-b border-black/[0.06] bg-white/80 backdrop-blur-xl">
        <div className="container-x flex h-14 items-center justify-between">
          <a href="/admin/security" className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-brand to-accent text-xs font-bold text-white">A</span>
            <span className="text-[15px] font-semibold text-ink">AegisCDN</span>
            <span className="ml-2 rounded-md bg-black/5 px-2 py-0.5 text-xs text-black/50">管理后台</span>
          </a>
          <nav className="flex items-center gap-5 text-sm">
            {NAV.map((n) => (
              <a key={n.href} href={n.href}
                className={pathname === n.href ? "font-medium text-ink" : "text-black/55 hover:text-ink"}>
                {n.label}
              </a>
            ))}
            <button onClick={() => { clearSession(); router.replace("/login"); }} className="text-black/45 hover:text-[#FF375F]">退出</button>
          </nav>
        </div>
      </header>
      <div className="container-x py-7">{children}</div>
    </main>
  );
}
