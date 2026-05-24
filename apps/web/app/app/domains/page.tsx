"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Domain = {
  id: number; name: string; cname: string; status: string; reviewStatus: string;
  _count?: { wafRules: number; aclRules: number };
};

const STATUS_STYLE: Record<string, string> = {
  active: "bg-accent/10 text-emerald-600",
  pending: "bg-black/5 text-black/50",
  paused: "bg-[#FF9F0A]/10 text-[#9a6200]",
  blocked: "bg-[#FF375F]/10 text-[#FF375F]",
};

export default function DomainsPage() {
  const [list, setList] = useState<Domain[]>([]);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    api<Domain[]>("/domains").then(setList).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      await api("/domains", { method: "POST", body: { name, originAddress: origin || undefined } });
      setName(""); setOrigin("");
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const remove = async (id: number) => {
    if (!confirm("确定删除该域名?")) return;
    await api(`/domains/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">域名管理</h1>
      <p className="mt-1 text-sm text-black/45">添加域名 → 按分配的 CNAME 接入 → 配置防护</p>

      <form onSubmit={add} className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-black/[0.06] bg-white p-5">
        <label className="flex-1">
          <span className="mb-1 block text-xs font-medium text-black/50">域名</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="example.com"
            className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-brand" />
        </label>
        <label className="flex-1">
          <span className="mb-1 block text-xs font-medium text-black/50">源站地址(可选)</span>
          <input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="1.2.3.4 或 origin.example.com"
            className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-brand" />
        </label>
        <button disabled={busy} className="btn-primary !py-2.5 disabled:opacity-60">{busy ? "添加中…" : "添加域名"}</button>
      </form>

      {err && <p className="mt-4 rounded-lg bg-[#FF375F]/10 px-3 py-2 text-sm text-[#FF375F]">{err}</p>}

      <div className="mt-6 overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/[0.06] text-left text-xs text-black/40">
              <th className="px-5 py-3 font-medium">域名</th>
              <th className="px-5 py-3 font-medium">CNAME 接入值</th>
              <th className="px-5 py-3 font-medium">状态</th>
              <th className="px-5 py-3 font-medium">规则</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((d) => (
              <tr key={d.id} className="border-b border-black/[0.04] last:border-0">
                <td className="px-5 py-3">
                  <a href={`/app/domains/${d.id}`} className="font-medium text-ink hover:text-brand">{d.name}</a>
                </td>
                <td className="px-5 py-3 font-mono text-[13px] text-black/55">{d.cname}</td>
                <td className="px-5 py-3">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[d.status] || STATUS_STYLE.pending}`}>{d.status}</span>
                </td>
                <td className="px-5 py-3 text-black/50">WAF {d._count?.wafRules ?? 0} · ACL {d._count?.aclRules ?? 0}</td>
                <td className="px-5 py-3 text-right">
                  <a href={`/app/domains/${d.id}`} className="text-brand">配置</a>
                  <button onClick={() => remove(d.id)} className="ml-3 text-black/40 hover:text-[#FF375F]">删除</button>
                </td>
              </tr>
            ))}
            {list.length === 0 && !err && (
              <tr><td colSpan={5} className="px-5 py-10 text-center text-black/40">还没有域名,先在上方添加一个。</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
