"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import AdminShell from "@/components/admin/AdminShell";

type Review = { id: number; name: string; cname: string; tenant: { id: number; name: string; kycStatus: string } };
type Kyc = { id: number; name: string; kycInfo: any; createdAt: string };

function Page() {
  const [domains, setDomains] = useState<Review[]>([]);
  const [kyc, setKyc] = useState<Kyc[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = async () => {
    try {
      setDomains(await api("/admin/reviews"));
      setKyc(await api("/admin/kyc"));
    } catch (e: any) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []);

  const reviewDomain = async (id: number, action: "approve" | "reject") => {
    setMsg(""); setErr("");
    try { await api(`/admin/reviews/${id}`, { method: "POST", body: { action } }); setMsg(`域名已${action === "approve" ? "通过" : "驳回"}`); load(); }
    catch (e: any) { setErr(e.message); }
  };
  const reviewKyc = async (tenantId: number, action: "approve" | "reject") => {
    setMsg(""); setErr("");
    try { await api(`/admin/kyc/${tenantId}`, { method: "POST", body: { action } }); setMsg(`实名已${action === "approve" ? "通过" : "驳回"}`); load(); }
    catch (e: any) { setErr(e.message); }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">接入审核</h1>
        <p className="mt-1 text-sm text-black/45">审核客户域名接入与企业实名,通过后域名才真正激活并下发边缘</p>
      </div>
      {msg && <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-emerald-700">{msg}</p>}
      {err && <p className="rounded-lg bg-[#FF375F]/10 px-3 py-2 text-sm text-[#FF375F]">{err}</p>}

      <section>
        <h2 className="mb-3 text-base font-semibold text-ink">待审核域名({domains.length})</h2>
        <div className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-black/[0.06] text-left text-xs text-black/40">
              <th className="px-5 py-3 font-medium">域名</th><th className="px-5 py-3 font-medium">客户</th>
              <th className="px-5 py-3 font-medium">实名</th><th className="px-5 py-3"></th>
            </tr></thead>
            <tbody>
              {domains.map((d) => (
                <tr key={d.id} className="border-b border-black/[0.04] last:border-0">
                  <td className="px-5 py-3 font-medium text-ink">{d.name}</td>
                  <td className="px-5 py-3 text-black/60">{d.tenant?.name}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${d.tenant?.kycStatus === "approved" ? "bg-accent/10 text-emerald-600" : "bg-black/5 text-black/50"}`}>{d.tenant?.kycStatus || "none"}</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => reviewDomain(d.id, "approve")} className="text-emerald-600">通过</button>
                    <button onClick={() => reviewDomain(d.id, "reject")} className="ml-3 text-[#FF375F]">驳回</button>
                  </td>
                </tr>
              ))}
              {domains.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-black/40">暂无待审核域名</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-ink">待审核实名({kyc.length})</h2>
        <div className="space-y-3">
          {kyc.map((k) => (
            <div key={k.id} className="rounded-2xl border border-black/[0.06] bg-white p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium text-ink">{k.kycInfo?.companyName || k.name}</div>
                  <div className="mt-1 text-sm text-black/55">
                    执照 {k.kycInfo?.licenseNo} · 法人 {k.kycInfo?.legalPerson} · 联系人 {k.kycInfo?.contactName}/{k.kycInfo?.contactPhone}
                    {k.kycInfo?.industry ? ` · ${k.kycInfo.industry}` : ""}
                  </div>
                </div>
                <div className="shrink-0">
                  <button onClick={() => reviewKyc(k.id, "approve")} className="text-emerald-600">通过</button>
                  <button onClick={() => reviewKyc(k.id, "reject")} className="ml-3 text-[#FF375F]">驳回</button>
                </div>
              </div>
            </div>
          ))}
          {kyc.length === 0 && <p className="rounded-2xl border border-black/[0.06] bg-white px-5 py-8 text-center text-sm text-black/40">暂无待审核实名</p>}
        </div>
      </section>
    </div>
  );
}

export default function ReviewsPage() {
  return <AdminShell><Page /></AdminShell>;
}
