"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const FIELDS = [
  { k: "companyName", label: "企业名称", req: true },
  { k: "licenseNo", label: "统一社会信用代码 / 营业执照号", req: true },
  { k: "legalPerson", label: "法定代表人", req: true },
  { k: "contactName", label: "联系人", req: true },
  { k: "contactPhone", label: "联系电话", req: true },
  { k: "industry", label: "所属行业", req: false },
];

const STATUS_TEXT: Record<string, string> = {
  none: "未提交", pending: "审核中", approved: "已通过", rejected: "已驳回",
};

export default function KycPage() {
  const [status, setStatus] = useState("none");
  const [form, setForm] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    api<{ kycStatus: string; kycInfo: any }>("/compliance/kyc")
      .then((r) => { setStatus(r.kycStatus); if (r.kycInfo) setForm(r.kycInfo); })
      .catch((e) => setErr(e.message));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setMsg("");
    try {
      await api("/compliance/kyc", { method: "POST", body: form });
      setStatus("pending"); setMsg("已提交,等待平台审核");
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">企业实名认证</h1>
      <p className="mt-1 text-sm text-black/45">
        高防 CDN 仅服务合法合规业务。完成企业实名有助于加快域名接入审核。
      </p>

      <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-black/5 px-3 py-1 text-sm">
        当前状态:
        <span className={status === "approved" ? "text-emerald-600" : status === "rejected" ? "text-[#FF375F]" : "text-black/60"}>
          {STATUS_TEXT[status] || status}
        </span>
      </div>

      {msg && <p className="mt-4 rounded-lg bg-accent/10 px-3 py-2 text-sm text-emerald-700">{msg}</p>}
      {err && <p className="mt-4 rounded-lg bg-[#FF375F]/10 px-3 py-2 text-sm text-[#FF375F]">{err}</p>}

      <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border border-black/[0.06] bg-white p-6">
        {FIELDS.map((f) => (
          <label key={f.k} className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{f.label}{f.req && <span className="text-[#FF375F]"> *</span>}</span>
            <input
              value={form[f.k] || ""}
              required={f.req}
              onChange={(e) => setForm({ ...form, [f.k]: e.target.value })}
              className="w-full rounded-xl border border-black/10 px-3.5 py-2.5 text-[15px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </label>
        ))}
        <button className="btn-primary">{status === "approved" ? "更新资料" : "提交认证"}</button>
      </form>
    </div>
  );
}
