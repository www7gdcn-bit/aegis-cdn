"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Plan = {
  id: number; code: string; name: string; tier: number;
  priceMonthly: number; priceYearly: number; protectionGbps: number;
  trafficGb: number; domainLimit: number; isCustom: boolean;
  features: Record<string, boolean>;
};
type Sub = { status: string; cycle: string; currentPeriodEnd: string; plan: Plan };
type Quota = { plan: string; domainLimit: number; usedDomains: number; features: Record<string, boolean> };
type Order = { id: number; orderNo: string; type: string; amount: number; status: string; cycle: string; createdAt: string };

const featLabel: Record<string, string> = { cc: "CC 防护", waf: "WAF", geo: "地区拦截", bot: "Bot 识别", dedicated: "专属节点" };

export default function BillingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<Sub | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [methods, setMethods] = useState<{ code: string; name: string; icon?: string; sandbox: boolean }[]>([]);
  const [method, setMethod] = useState("mock");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  const load = async () => {
    try {
      const [p, s, q, o, m] = await Promise.all([
        api<Plan[]>("/billing/plans", { auth: false }),
        api<Sub>("/billing/subscription"),
        api<Quota>("/billing/quota"),
        api<Order[]>("/billing/orders"),
        api<any[]>("/payments/methods"),
      ]);
      setPlans(p); setSub(s); setQuota(q); setOrders(o); setMethods(m);
      if (m.length && !m.find((x) => x.code === method)) setMethod(m[0].code);
    } catch (e: any) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []);

  // 走真实支付管道:billing 下单 → 创建支付单 → mock/沙盒模拟支付 / 真实网关跳转收银台
  const buy = async (code: string) => {
    setErr(""); setMsg(""); setBusy(code);
    try {
      const order = await api<{ id: number }>("/billing/orders", { method: "POST", body: { planCode: code, cycle } });
      const pay = await api<{ paymentNo: string; payUrl?: string; sandbox: boolean }>("/payments", {
        method: "POST", body: { orderId: order.id, gatewayCode: method },
      });
      if (pay.payUrl) { window.location.href = pay.payUrl; return; }   // 真实网关跳转收银台
      await api(`/payments/${pay.paymentNo}/simulate`, { method: "POST" }); // mock/沙盒模拟支付
      setMsg(`已开通 ${code}(${method} 沙盒支付)`);
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(""); }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">套餐与计费</h1>
      <p className="mt-1 text-sm text-black/45">查看当前套餐、配额用量,升级或续费</p>

      {err && <p className="mt-4 rounded-lg bg-[#FF375F]/10 px-3 py-2 text-sm text-[#FF375F]">{err}</p>}
      {msg && <p className="mt-4 rounded-lg bg-accent/10 px-3 py-2 text-sm text-emerald-700">{msg}</p>}

      {/* 当前套餐 + 配额 */}
      {sub && quota && (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-black/[0.06] bg-white p-6">
            <div className="text-sm text-black/45">当前套餐</div>
            <div className="mt-1 text-2xl font-semibold text-ink">{sub.plan.name}</div>
            <span className={`mt-2 inline-block rounded-md px-2 py-0.5 text-xs font-medium ${sub.status === "active" ? "bg-accent/10 text-emerald-600" : "bg-[#FF9F0A]/10 text-[#9a6200]"}`}>
              {sub.status === "trialing" ? "试用中" : sub.status}
            </span>
            <div className="mt-2 text-xs text-black/40">到期 {sub.currentPeriodEnd?.slice(0, 10)}</div>
          </div>
          <div className="rounded-2xl border border-black/[0.06] bg-white p-6">
            <div className="text-sm text-black/45">域名用量</div>
            <div className="mt-1 text-2xl font-semibold text-ink">{quota.usedDomains} / {quota.domainLimit}</div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-black/[0.06]">
              <div className="h-full rounded-full bg-gradient-to-r from-brand to-accent" style={{ width: `${Math.min(100, (quota.usedDomains / quota.domainLimit) * 100)}%` }} />
            </div>
          </div>
          <div className="rounded-2xl border border-black/[0.06] bg-white p-6">
            <div className="text-sm text-black/45">已开通能力</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(quota.features || {}).filter(([, v]) => v).map(([k]) => (
                <span key={k} className="rounded-md bg-brand/10 px-2 py-0.5 text-xs text-brand">{featLabel[k] || k}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 套餐选择 */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">升级 / 续费</h2>
        <div className="flex items-center gap-3">
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-full border border-black/10 px-4 py-1.5 text-sm outline-none focus:border-brand">
            {methods.map((m) => <option key={m.code} value={m.code}>{m.icon} {m.name}{m.sandbox ? "(沙盒)" : ""}</option>)}
          </select>
          <div className="flex rounded-full border border-black/10 p-1 text-sm">
            <button onClick={() => setCycle("monthly")} className={`rounded-full px-4 py-1 ${cycle === "monthly" ? "bg-ink text-white" : "text-black/50"}`}>月付</button>
            <button onClick={() => setCycle("yearly")} className={`rounded-full px-4 py-1 ${cycle === "yearly" ? "bg-ink text-white" : "text-black/50"}`}>年付</button>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {plans.map((p) => {
          const current = sub?.plan.code === p.code;
          const price = cycle === "yearly" ? p.priceYearly : p.priceMonthly;
          return (
            <div key={p.code} className={`rounded-2xl border p-6 ${current ? "border-brand bg-brand/[0.03]" : "border-black/[0.06] bg-white"}`}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-ink">{p.name}</h3>
                {current && <span className="rounded-md bg-brand px-2 py-0.5 text-xs text-white">当前</span>}
              </div>
              <div className="mt-3 text-2xl font-semibold text-ink">
                {p.isCustom ? "定制" : `¥${price}`}
                {!p.isCustom && <span className="text-sm font-normal text-black/40">/{cycle === "yearly" ? "年" : "月"}</span>}
              </div>
              <ul className="mt-4 space-y-1.5 text-sm text-black/60">
                <li>防护 {p.protectionGbps ? `${p.protectionGbps}G` : "定制"}</li>
                <li>流量 {p.trafficGb ? `${p.trafficGb}GB` : "不限/定制"}</li>
                <li>域名 {p.domainLimit >= 9999 ? "不限" : p.domainLimit} 个</li>
                <li>{Object.entries(p.features).filter(([, v]) => v).map(([k]) => featLabel[k] || k).join(" · ")}</li>
              </ul>
              {p.isCustom ? (
                <a href="/#cases" className="btn-ghost-light mt-5 w-full !py-2 !text-sm">联系商务</a>
              ) : current ? (
                <button disabled className="btn-ghost-light mt-5 w-full !py-2 !text-sm opacity-50">当前套餐</button>
              ) : (
                <button onClick={() => buy(p.code)} disabled={busy === p.code} className="btn-primary mt-5 w-full !py-2 !text-sm disabled:opacity-60">
                  {busy === p.code ? "开通中…" : "购买并开通"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-black/35">* 当前为模拟支付(下单即开通),便于联调;真实支付(Stripe/微信/支付宝)接入后替换。</p>

      {/* 订单 */}
      {orders.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">订单记录</h2>
          <div className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-black/[0.06] text-left text-xs text-black/40">
                <th className="px-5 py-3 font-medium">订单号</th><th className="px-5 py-3 font-medium">类型</th>
                <th className="px-5 py-3 font-medium">周期</th><th className="px-5 py-3 font-medium">金额</th><th className="px-5 py-3 font-medium">状态</th>
              </tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-black/[0.04] last:border-0">
                    <td className="px-5 py-3 font-mono text-[13px]">{o.orderNo}</td>
                    <td className="px-5 py-3 text-black/60">{o.type}</td>
                    <td className="px-5 py-3 text-black/60">{o.cycle}</td>
                    <td className="px-5 py-3">¥{o.amount}</td>
                    <td className="px-5 py-3"><span className={o.status === "paid" ? "text-emerald-600" : "text-black/45"}>{o.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
