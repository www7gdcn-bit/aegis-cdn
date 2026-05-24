"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getUser } from "@/lib/session";

export default function OverviewPage() {
  const [count, setCount] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const user = getUser();

  useEffect(() => {
    api<any[]>("/domains")
      .then((d) => setCount(d.length))
      .catch((e) => setErr(e.message));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">概览</h1>
      <p className="mt-1 text-sm text-black/45">欢迎回来{user?.email ? `,${user.email}` : ""}</p>

      {err && (
        <div className="mt-6 rounded-2xl border border-[#FF9F0A]/30 bg-[#FF9F0A]/10 p-4 text-sm text-[#9a6200]">
          控制面未就绪:{err}
          <div className="mt-1 text-xs text-black/50">请先启动 apps/api(默认 :4000)。本页对接真实 NestJS 接口。</div>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <a href="/app/domains" className="rounded-2xl border border-black/[0.06] bg-white p-6 transition hover:shadow-lg">
          <div className="text-sm text-black/45">已接入域名</div>
          <div className="mt-2 text-3xl font-semibold text-ink">{count ?? "—"}</div>
          <div className="mt-3 text-sm text-brand">管理域名 →</div>
        </a>
        <a href="/admin/security" className="rounded-2xl border border-black/[0.06] bg-white p-6 transition hover:shadow-lg">
          <div className="text-sm text-black/45">安全总览</div>
          <div className="mt-2 text-lg font-semibold text-ink">实时攻击可视化</div>
          <div className="mt-3 text-sm text-brand">查看仪表盘 →</div>
        </a>
        <div className="rounded-2xl border border-black/[0.06] bg-white p-6">
          <div className="text-sm text-black/45">快速接入</div>
          <div className="mt-2 text-lg font-semibold text-ink">5 分钟 CNAME</div>
          <div className="mt-3 text-sm text-black/50">添加域名后按提示配置 CNAME。</div>
        </div>
      </div>
    </div>
  );
}
