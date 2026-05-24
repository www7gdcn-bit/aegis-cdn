"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import AdminShell from "@/components/admin/AdminShell";

type Block = { id: number; type: string; value: string; reason?: string; createdAt: string };

function Page() {
  const [list, setList] = useState<Block[]>([]);
  const [type, setType] = useState<"ip" | "domain">("ip");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const load = () => api<Block[]>("/admin/blocks").then(setList).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setMsg("");
    try {
      await api("/admin/blocks", { method: "POST", body: { type, value, reason: reason || undefined } });
      setValue(""); setReason("");
      setMsg(type === "ip" ? "IP 已全局封禁(边缘即时生效)" : "域名已封禁(边缘对其硬拦截)");
      load();
    } catch (e: any) { setErr(e.message); }
  };
  const remove = async (id: number) => {
    if (!confirm("解除该封禁?")) return;
    await api(`/admin/blocks/${id}`, { method: "DELETE" }); load();
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">封禁管理</h1>
      <p className="mt-1 text-sm text-black/45">手动封禁违规域名 / 恶意 IP。IP 封禁写入边缘 Redis 跨全域名即时生效;域名封禁边缘硬拦截 403。</p>

      {msg && <p className="mt-4 rounded-lg bg-accent/10 px-3 py-2 text-sm text-emerald-700">{msg}</p>}
      {err && <p className="mt-4 rounded-lg bg-[#FF375F]/10 px-3 py-2 text-sm text-[#FF375F]">{err}</p>}

      <form onSubmit={add} className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-black/[0.06] bg-white p-5">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-black/50">类型</span>
          <select value={type} onChange={(e) => setType(e.target.value as any)} className="rounded-xl border border-black/10 px-3 py-2.5 outline-none focus:border-brand">
            <option value="ip">IP / CIDR</option>
            <option value="domain">域名</option>
          </select>
        </label>
        <label className="flex-1">
          <span className="mb-1 block text-xs text-black/50">{type === "ip" ? "IP 或 CIDR" : "域名"}</span>
          <input value={value} onChange={(e) => setValue(e.target.value)} required placeholder={type === "ip" ? "1.2.3.4 或 1.2.3.0/24" : "bad.example.com"}
            className="w-full rounded-xl border border-black/10 px-3 py-2.5 outline-none focus:border-brand" />
        </label>
        <label className="flex-1">
          <span className="mb-1 block text-xs text-black/50">原因(可选)</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="如 钓鱼 / 滥用 / 违规内容"
            className="w-full rounded-xl border border-black/10 px-3 py-2.5 outline-none focus:border-brand" />
        </label>
        <button className="btn-primary !py-2.5">封禁</button>
      </form>

      <div className="mt-6 overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-black/[0.06] text-left text-xs text-black/40">
            <th className="px-5 py-3 font-medium">类型</th><th className="px-5 py-3 font-medium">值</th>
            <th className="px-5 py-3 font-medium">原因</th><th className="px-5 py-3 font-medium">时间</th><th className="px-5 py-3"></th>
          </tr></thead>
          <tbody>
            {list.map((b) => (
              <tr key={b.id} className="border-b border-black/[0.04] last:border-0">
                <td className="px-5 py-3"><span className="rounded bg-[#FF375F]/10 px-1.5 py-0.5 text-xs text-[#FF375F]">{b.type}</span></td>
                <td className="px-5 py-3 font-mono text-[13px] text-ink">{b.value}</td>
                <td className="px-5 py-3 text-black/55">{b.reason || "—"}</td>
                <td className="px-5 py-3 text-black/40">{b.createdAt?.slice(0, 19).replace("T", " ")}</td>
                <td className="px-5 py-3 text-right"><button onClick={() => remove(b.id)} className="text-black/45 hover:text-brand">解除</button></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-black/40">暂无封禁记录</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function BlocksPage() {
  return <AdminShell><Page /></AdminShell>;
}
