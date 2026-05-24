"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Payment = {
  paymentNo: string; gatewayCode: string; subject: string; amount: number;
  fee: number; currency: string; status: string; createdAt: string; paidAt?: string;
};

const STATUS: Record<string, { t: string; c: string }> = {
  pending: { t: "待支付", c: "bg-[#FF9F0A]/10 text-[#9a6200]" },
  paid: { t: "已支付", c: "bg-accent/10 text-emerald-600" },
  failed: { t: "失败", c: "bg-[#FF375F]/10 text-[#FF375F]" },
  expired: { t: "已过期", c: "bg-black/5 text-black/45" },
  refunded: { t: "已退款", c: "bg-brand/10 text-brand" },
};

export default function PaymentsPage() {
  const [list, setList] = useState<Payment[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => { api<Payment[]>("/payments").then(setList).catch((e) => setErr(e.message)); }, []);

  const invoice = async (no: string) => {
    const inv = await api(`/payments/${no}/invoice`);
    const blob = new Blob([JSON.stringify(inv, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${no}-invoice.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">支付记录</h1>
      <p className="mt-1 text-sm text-black/45">查看支付状态、下载发票</p>
      {err && <p className="mt-4 rounded-lg bg-[#FF375F]/10 px-3 py-2 text-sm text-[#FF375F]">{err}</p>}

      <div className="mt-6 overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-black/[0.06] text-left text-xs text-black/40">
            <th className="px-5 py-3 font-medium">支付单号</th><th className="px-5 py-3 font-medium">说明</th>
            <th className="px-5 py-3 font-medium">网关</th><th className="px-5 py-3 font-medium">金额</th>
            <th className="px-5 py-3 font-medium">状态</th><th className="px-5 py-3 font-medium">时间</th><th className="px-5 py-3"></th>
          </tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.paymentNo} className="border-b border-black/[0.04] last:border-0">
                <td className="px-5 py-3 font-mono text-[13px]">{p.paymentNo}</td>
                <td className="px-5 py-3 text-black/60">{p.subject}</td>
                <td className="px-5 py-3 text-black/55">{p.gatewayCode}</td>
                <td className="px-5 py-3">{p.currency} {p.amount}</td>
                <td className="px-5 py-3"><span className={`rounded px-1.5 py-0.5 text-xs ${STATUS[p.status]?.c}`}>{STATUS[p.status]?.t || p.status}</span></td>
                <td className="px-5 py-3 text-black/40">{(p.paidAt || p.createdAt)?.slice(0, 19).replace("T", " ")}</td>
                <td className="px-5 py-3 text-right">
                  {p.status === "paid" && <button onClick={() => invoice(p.paymentNo)} className="text-brand">发票</button>}
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-black/40">暂无支付记录</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
