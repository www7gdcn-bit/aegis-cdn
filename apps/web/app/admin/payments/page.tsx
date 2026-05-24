"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import AdminShell from "@/components/admin/AdminShell";

type Gateway = {
  code: string; name: string; enabled: boolean; sandbox: boolean;
  config: Record<string, any>; feeBps: number; exchangeRate: number;
  icon?: string; sortOrder: number; currencies: string; ipWhitelist?: string;
};

// 各网关需要的商户字段(后台填写,勿写死在代码)
const CONFIG_FIELDS: Record<string, string[]> = {
  mock: ["secret"],
  alipay: ["appId", "privateKey", "alipayPublicKey"],
  wechat: ["mchId", "appId", "apiV3Key", "privateKey"],
  qqpay: ["mchId", "apiKey"],
  stripe: ["secretKey", "webhookSecret"],
  paypal: ["clientId", "clientSecret"],
  crypto: ["apiKey", "webhookSecret"],
};

function Panel() {
  const [list, setList] = useState<Gateway[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Gateway | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = () => api<Gateway[]>("/admin/payment-gateways").then(setList).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const edit = (g: Gateway) => { setEditing(g.code); setDraft(JSON.parse(JSON.stringify(g))); };
  const save = async () => {
    if (!draft) return;
    setErr(""); setMsg("");
    try {
      await api(`/admin/payment-gateways/${draft.code}`, {
        method: "PATCH",
        body: {
          name: draft.name, enabled: draft.enabled, sandbox: draft.sandbox, config: draft.config,
          feeBps: Number(draft.feeBps), exchangeRate: Number(draft.exchangeRate),
          icon: draft.icon, sortOrder: Number(draft.sortOrder), currencies: draft.currencies, ipWhitelist: draft.ipWhitelist,
        },
      });
      setMsg(`已保存 ${draft.name}(热更新,无需重启)`); setEditing(null); setDraft(null); load();
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">支付配置</h1>
      <p className="mt-1 text-sm text-black/45">配置各支付网关的商户参数、开关、沙盒、手续费、汇率、排序。所有参数后台可改,热更新生效。</p>

      {msg && <p className="mt-4 rounded-lg bg-accent/10 px-3 py-2 text-sm text-emerald-700">{msg}</p>}
      {err && <p className="mt-4 rounded-lg bg-[#FF375F]/10 px-3 py-2 text-sm text-[#FF375F]">{err}</p>}

      <div className="mt-6 space-y-3">
        {list.map((g) => (
          <div key={g.code} className="rounded-2xl border border-black/[0.06] bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl">{g.icon}</span>
                <div>
                  <div className="font-medium text-ink">{g.name} <span className="text-xs text-black/35">({g.code})</span></div>
                  <div className="mt-0.5 flex gap-2 text-xs">
                    <span className={`rounded px-1.5 py-0.5 ${g.enabled ? "bg-accent/10 text-emerald-600" : "bg-black/5 text-black/45"}`}>{g.enabled ? "已启用" : "已禁用"}</span>
                    <span className={`rounded px-1.5 py-0.5 ${g.sandbox ? "bg-[#FF9F0A]/10 text-[#9a6200]" : "bg-brand/10 text-brand"}`}>{g.sandbox ? "沙盒" : "正式"}</span>
                    <span className="text-black/40">手续费 {(g.feeBps / 100).toFixed(2)}% · {g.currencies}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => edit(g)} className="btn-ghost-light !py-1.5 !text-sm">配置</button>
            </div>

            {editing === g.code && draft && (
              <div className="mt-4 space-y-3 border-t border-black/[0.06] pt-4">
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} /> 启用</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={draft.sandbox} onChange={(e) => setDraft({ ...draft, sandbox: e.target.checked })} /> 沙盒模式</label>
                  <label className="text-xs text-black/50">手续费(基点)<input type="number" value={draft.feeBps} onChange={(e) => setDraft({ ...draft, feeBps: Number(e.target.value) })} className="ml-1 w-20 rounded border border-black/10 px-2 py-1" /></label>
                  <label className="text-xs text-black/50">汇率<input type="number" step="0.01" value={draft.exchangeRate} onChange={(e) => setDraft({ ...draft, exchangeRate: Number(e.target.value) })} className="ml-1 w-20 rounded border border-black/10 px-2 py-1" /></label>
                  <label className="text-xs text-black/50">排序<input type="number" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })} className="ml-1 w-16 rounded border border-black/10 px-2 py-1" /></label>
                </div>
                <label className="block text-xs text-black/50">币种(逗号分隔)
                  <input value={draft.currencies} onChange={(e) => setDraft({ ...draft, currencies: e.target.value })} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm text-ink" />
                </label>
                <label className="block text-xs text-black/50">回调 IP 白名单(逗号分隔,空=不限)
                  <input value={draft.ipWhitelist || ""} onChange={(e) => setDraft({ ...draft, ipWhitelist: e.target.value })} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm text-ink" />
                </label>
                <div className="rounded-xl bg-mist p-3">
                  <div className="mb-2 text-xs font-medium text-black/55">商户参数(填入后启用即可收款)</div>
                  {(CONFIG_FIELDS[g.code] || ["apiKey"]).map((k) => (
                    <label key={k} className="mb-2 block text-xs text-black/50">{k}
                      <input value={draft.config?.[k] || ""} onChange={(e) => setDraft({ ...draft, config: { ...draft.config, [k]: e.target.value } })}
                        className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 font-mono text-[13px] text-ink" placeholder={`${g.name} ${k}`} />
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={save} className="btn-primary !py-2 !text-sm">保存(热更新)</button>
                  <button onClick={() => { setEditing(null); setDraft(null); }} className="btn-ghost-light !py-2 !text-sm">取消</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminPaymentsPage() {
  return <AdminShell><Panel /></AdminShell>;
}
