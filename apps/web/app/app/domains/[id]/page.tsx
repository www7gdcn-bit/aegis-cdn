"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";

type Domain = any;

export default function DomainDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<Domain | null>(null);
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState("");
  const [pushed, setPushed] = useState<any>(null);

  const load = useCallback(() => {
    api<Domain>(`/domains/${id}`).then(setD).catch((e) => setErr(e.message));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const after = (res: any, msg: string) => {
    if (res?.version != null) setFlash(`${msg} · 已下发到边缘(v${res.version})`);
    else setFlash(msg);
    setTimeout(() => setFlash(""), 4000);
    load();
  };
  const call = async (path: string, method: string, body: any, msg: string) => {
    try { const res = await api(path, { method, body }); after(res, msg); }
    catch (e: any) { setErr(e.message); }
  };

  if (err && !d) return <p className="rounded-lg bg-[#FF375F]/10 px-3 py-2 text-sm text-[#FF375F]">{err}</p>;
  if (!d) return <p className="text-black/40">加载中…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <a href="/app/domains" className="text-sm text-black/40 hover:text-brand">← 域名</a>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{d.name}</h1>
        </div>
        <span className="rounded-md bg-black/5 px-2.5 py-1 text-xs font-medium text-black/55">{d.status} · 审核 {d.reviewStatus}</span>
      </div>

      {flash && <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-emerald-700">{flash}</p>}
      {err && <p className="rounded-lg bg-[#FF375F]/10 px-3 py-2 text-sm text-[#FF375F]">{err}</p>}

      {/* 接入信息 */}
      <Section title="接入信息">
        <Row k="CNAME 接入值"><code className="font-mono text-brand">{d.cname}</code></Row>
        <Row k="DNS 校验 TXT"><code className="font-mono text-black/60">{d.verifyToken}</code></Row>
        <Row k="源站">
          {d.origins?.length ? d.origins.map((o: any) => `${o.scheme}://${o.address}:${o.port}`).join(", ") : "未配置"}
        </Row>
        {d.status !== "active" && (
          <div className="mt-3 rounded-xl bg-[#FF9F0A]/10 px-4 py-3 text-sm text-[#9a6200]">
            {d.reviewStatus === "rejected"
              ? "接入审核未通过,请联系客服或调整后重新提交。"
              : "已配置 CNAME 后,域名将进入平台接入审核;审核通过后自动激活并下发边缘防护。"}
          </div>
        )}
      </Section>

      {/* CC 防护 */}
      <Section title="CC 防护">
        <CcForm d={d} onSave={(body) => call(`/domains/${id}/cc`, "PUT", body, "CC 策略已保存")} />
      </Section>

      {/* WAF */}
      <Section title="WAF 安全防护">
        <WafForm d={d} onSave={(body) => call(`/domains/${id}/waf`, "PUT", body, "WAF 策略已保存")} />
        <WafRules d={d}
          onAdd={(body) => call(`/domains/${id}/waf-rules`, "POST", body, "已添加 WAF 规则")}
          onDel={(rid) => call(`/domains/${id}/waf-rules/${rid}`, "DELETE", undefined, "已删除规则")} />
      </Section>

      {/* ACL */}
      <Section title="访问控制(IP / 地区 / UA 黑白名单)">
        <AclRules d={d}
          onAdd={(body) => call(`/domains/${id}/acl`, "POST", body, "已添加 ACL")}
          onDel={(rid) => call(`/domains/${id}/acl/${rid}`, "DELETE", undefined, "已删除 ACL")} />
      </Section>

      {/* 下发预览 */}
      <Section title="下发到边缘的配置">
        <button onClick={async () => setPushed(await api(`/domains/${id}/deploy`, { method: "POST" }))} className="btn-ghost-light !py-2 !text-sm">
          重新编译并查看下发 JSON
        </button>
        {pushed && (
          <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-ink p-4 text-xs leading-relaxed text-white/80">
{JSON.stringify(pushed, null, 2)}
          </pre>
        )}
        <p className="mt-2 text-xs text-black/40">写入 Redis:<code>aegis:cfg:{d.name}</code> / <code>aegis:waf:{d.name}</code>,边缘 OpenResty 热加载生效。</p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-6">
      <h2 className="mb-4 text-base font-semibold text-ink">{title}</h2>
      {children}
    </div>
  );
}
function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-b border-black/[0.04] py-2 text-sm last:border-0">
      <span className="w-32 shrink-0 text-black/45">{k}</span>
      <span className="text-ink">{children}</span>
    </div>
  );
}
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-xs text-black/50">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-black/10 bg-white px-3 py-2 outline-none focus:border-brand">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function CcForm({ d, onSave }: { d: any; onSave: (b: any) => void }) {
  const cc = d.ccPolicy || {};
  const [enabled, setEnabled] = useState<boolean>(cc.enabled ?? true);
  const [mode, setMode] = useState<string>(cc.mode ?? "normal");
  const [action, setAction] = useState<string>(cc.action ?? "challenge");
  return (
    <div className="flex flex-wrap items-end gap-4">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> 启用</label>
      <Select label="模式" value={mode} onChange={setMode} options={["off", "normal", "attack", "strict"]} />
      <Select label="命中动作" value={action} onChange={setAction} options={["log", "challenge", "captcha", "block"]} />
      <button onClick={() => onSave({ enabled, mode, action })} className="btn-primary !py-2 !text-sm">保存并下发</button>
    </div>
  );
}

function WafForm({ d, onSave }: { d: any; onSave: (b: any) => void }) {
  const waf = d.wafPolicy || {};
  const [enabled, setEnabled] = useState<boolean>(waf.enabled ?? true);
  const [mode, setMode] = useState<string>(waf.mode ?? "block");
  const [rulesets, setRulesets] = useState<string>(waf.rulesets ?? "sqli,xss,rce,traversal,webshell");
  return (
    <div className="flex flex-wrap items-end gap-4">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> 启用</label>
      <Select label="模式" value={mode} onChange={setMode} options={["off", "observe", "block"]} />
      <label className="text-sm">
        <span className="mb-1 block text-xs text-black/50">规则集(逗号分隔)</span>
        <input value={rulesets} onChange={(e) => setRulesets(e.target.value)}
          className="w-72 rounded-xl border border-black/10 px-3 py-2 outline-none focus:border-brand" />
      </label>
      <button onClick={() => onSave({ enabled, mode, rulesets })} className="btn-primary !py-2 !text-sm">保存并下发</button>
    </div>
  );
}

function WafRules({ d, onAdd, onDel }: { d: any; onAdd: (b: any) => void; onDel: (rid: number) => void }) {
  const [target, setTarget] = useState("uri");
  const [op, setOp] = useState("regex");
  const [pattern, setPattern] = useState("");
  const [action, setAction] = useState("block");
  return (
    <div className="mt-5">
      <div className="mb-2 text-sm font-medium text-black/60">自定义规则</div>
      <ul className="mb-3 space-y-1.5">
        {(d.wafRules || []).map((r: any) => (
          <li key={r.id} className="flex items-center gap-2 rounded-lg bg-mist px-3 py-2 text-[13px]">
            <span className="font-mono">{r.target} {r.op} <span className="text-brand">{r.pattern}</span> → {r.action}</span>
            <button onClick={() => onDel(r.id)} className="ml-auto text-black/40 hover:text-[#FF375F]">删除</button>
          </li>
        ))}
        {(d.wafRules || []).length === 0 && <li className="text-sm text-black/35">暂无自定义规则</li>}
      </ul>
      <div className="flex flex-wrap items-end gap-3">
        <Select label="目标" value={target} onChange={setTarget} options={["uri", "args", "body", "ua", "cookie", "referer"]} />
        <Select label="匹配" value={op} onChange={setOp} options={["regex", "contains"]} />
        <label className="text-sm">
          <span className="mb-1 block text-xs text-black/50">模式</span>
          <input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="如 /wp-login"
            className="w-56 rounded-xl border border-black/10 px-3 py-2 outline-none focus:border-brand" />
        </label>
        <Select label="动作" value={action} onChange={setAction} options={["block", "challenge", "log"]} />
        <button onClick={() => pattern && onAdd({ target, op, pattern, action })} className="btn-ghost-light !py-2 !text-sm">添加规则</button>
      </div>
    </div>
  );
}

function AclRules({ d, onAdd, onDel }: { d: any; onAdd: (b: any) => void; onDel: (rid: number) => void }) {
  const [category, setCategory] = useState("ip");
  const [listType, setListType] = useState("deny");
  const [value, setValue] = useState("");
  return (
    <div>
      <ul className="mb-3 space-y-1.5">
        {(d.aclRules || []).map((r: any) => (
          <li key={r.id} className="flex items-center gap-2 rounded-lg bg-mist px-3 py-2 text-[13px]">
            <span className={`rounded px-1.5 py-0.5 text-[11px] ${r.listType === "deny" ? "bg-[#FF375F]/10 text-[#FF375F]" : "bg-accent/10 text-emerald-600"}`}>{r.listType}</span>
            <span className="font-mono">{r.category}: {r.value}</span>
            <button onClick={() => onDel(r.id)} className="ml-auto text-black/40 hover:text-[#FF375F]">删除</button>
          </li>
        ))}
        {(d.aclRules || []).length === 0 && <li className="text-sm text-black/35">暂无规则</li>}
      </ul>
      <div className="flex flex-wrap items-end gap-3">
        <Select label="类别" value={category} onChange={setCategory} options={["ip", "geo", "ua", "referer"]} />
        <Select label="名单" value={listType} onChange={setListType} options={["deny", "allow"]} />
        <label className="text-sm">
          <span className="mb-1 block text-xs text-black/50">值</span>
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="1.2.3.0/24 或 CN 或 *bot*"
            className="w-56 rounded-xl border border-black/10 px-3 py-2 outline-none focus:border-brand" />
        </label>
        <button onClick={() => value && onAdd({ category, listType, value })} className="btn-ghost-light !py-2 !text-sm">添加</button>
      </div>
    </div>
  );
}
