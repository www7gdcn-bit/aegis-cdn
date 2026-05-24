"use client";

import { useEffect, useRef, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { StatsPayload } from "@/lib/stats";
import { API_BASE } from "@/lib/api";
import { getToken, getUser } from "@/lib/session";

const fmt = (n: number) =>
  n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n);

// 国家近似坐标(百分比),用于攻击地图
const GEO: Record<string, [number, number]> = {
  CN: [78, 40], US: [20, 40], RU: [68, 28], BR: [34, 68],
  IN: [70, 48], VN: [80, 52], ID: [84, 62], DE: [50, 34], XX: [50, 50],
};
const PIE_COLORS = ["#0A84FF", "#30D158", "#FF9F0A", "#FF375F", "#BF5AF2", "#64D2FF", "#FFD60A", "#8E8E93"];

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-[0_4px_24px_-12px_rgba(0,0,0,0.1)]">
      <div className="text-xs font-medium uppercase tracking-wide text-black/40">{label}</div>
      <div className={`mt-2 text-3xl font-semibold tracking-tight ${accent || "text-ink"}`}>{value}</div>
    </div>
  );
}

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-black/[0.06] bg-white p-5 shadow-[0_4px_24px_-14px_rgba(0,0,0,0.1)] ${className}`}>
      <h3 className="mb-4 text-sm font-semibold text-ink">{title}</h3>
      {children}
    </div>
  );
}

export default function SecurityDashboard() {
  const [data, setData] = useState<StatsPayload | null>(null);
  const [tick, setTick] = useState(0);
  const [authErr, setAuthErr] = useState("");
  const timer = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    const token = getToken();
    const role = getUser()?.role;
    if (!token || !(role === "admin" || role === "operator")) {
      setAuthErr("攻击数据仅限平台管理员/运营查看,请用管理员账号登录。");
      return;
    }
    const load = async () => {
      try {
        const r = await fetch(`${API_BASE}/stats/security`, {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (r.status === 401 || r.status === 403) {
          setAuthErr("无权限或登录已过期,请用管理员账号重新登录。");
          clearInterval(timer.current);
          return;
        }
        if (!r.ok) throw new Error();
        setData(await r.json());
        setTick((t) => t + 1);
      } catch {
        // 后端不可达(开发):回退 Next 样本(仅假数据,不泄露真实数据)
        try {
          const r = await fetch("/api/stats", { cache: "no-store" });
          setData(await r.json());
          setTick((t) => t + 1);
        } catch {}
      }
    };
    load();
    timer.current = setInterval(load, 5000);
    return () => clearInterval(timer.current);
  }, []);

  if (authErr) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[#FF9F0A]/30 bg-[#FF9F0A]/10 p-6 text-center">
        <p className="text-sm text-[#9a6200]">{authErr}</p>
        <a href="/login" className="btn-primary mt-4 !py-2 !text-sm">去登录</a>
      </div>
    );
  }

  if (!data) {
    return <div className="grid h-64 place-items-center text-black/40">加载安全数据…</div>;
  }

  const o = data.overview;
  return (
    <div className="space-y-5">
      {/* 顶部状态 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">安全总览</h1>
          <p className="text-sm text-black/45">Security Overview · 最近 1 小时 · 每 5 秒刷新</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1.5 text-xs font-medium text-emerald-600">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> 实时 · tick {tick}
          </span>
          <span className={`rounded-full px-3 py-1.5 text-xs font-medium ${data.source === "clickhouse" ? "bg-brand/10 text-brand" : "bg-black/5 text-black/50"}`}>
            {data.source === "clickhouse" ? "ClickHouse 实时" : "样本数据(未连 CH)"}
          </span>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <Kpi label="总请求" value={fmt(o.requests)} />
        <Kpi label="已拦截" value={fmt(o.blocked)} accent="text-[#FF375F]" />
        <Kpi label="挑战" value={fmt(o.challenged)} accent="text-[#FF9F0A]" />
        <Kpi label="拦截率" value={o.blockRate + "%"} accent="text-[#FF375F]" />
        <Kpi label="平均风险" value={String(o.avgRisk)} accent={o.avgRisk > 50 ? "text-[#FF375F]" : "text-brand"} />
        <Kpi label="QPS" value={fmt(o.qps)} accent="text-accent" />
      </div>

      {/* 流量趋势 + 攻击类型 */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="请求 / 拦截趋势(QPM)" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data.timeseries} margin={{ left: -16, right: 8, top: 4 }}>
              <defs>
                <linearGradient id="gReq" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0A84FF" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0A84FF" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gBlk" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF375F" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#FF375F" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#00000010" vertical={false} />
              <XAxis dataKey="t" tick={{ fontSize: 11, fill: "#888" }} interval={9} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#888" }} tickLine={false} axisLine={false} width={44} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #eee", fontSize: 12 }} />
              <Area type="monotone" dataKey="requests" stroke="#0A84FF" strokeWidth={2} fill="url(#gReq)" name="请求" />
              <Area type="monotone" dataKey="blocked" stroke="#FF375F" strokeWidth={2} fill="url(#gBlk)" name="拦截" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title="攻击类型分布">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={data.attackTypes} dataKey="value" nameKey="name" innerRadius={56} outerRadius={92} paddingAngle={2}>
                {data.attackTypes.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #eee", fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {data.attackTypes.slice(0, 6).map((a, i) => (
              <span key={a.name} className="flex items-center gap-1.5 text-xs text-black/55">
                <span className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                {a.name}
              </span>
            ))}
          </div>
        </Card>
      </div>

      {/* 攻击地图 + 来源国家 */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="实时攻击来源" className="lg:col-span-2">
          <AttackMap countries={data.topCountries} />
        </Card>
        <Card title="Top 来源国家">
          <ul className="space-y-2.5">
            {data.topCountries.map((c, i) => {
              const max = data.topCountries[0]?.value || 1;
              return (
                <li key={c.name}>
                  <div className="flex justify-between text-xs text-black/60">
                    <span>{i + 1}. {c.name}</span><span>{fmt(c.value)}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-black/[0.06]">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand to-accent" style={{ width: `${(c.value / max) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      {/* Top IP + 实时事件 */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Top 攻击 IP">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-black/40">
                <th className="pb-2 font-medium">IP</th><th className="pb-2 font-medium">国家</th>
                <th className="pb-2 text-right font-medium">请求</th><th className="pb-2 text-right font-medium">拦截</th>
              </tr>
            </thead>
            <tbody>
              {data.topIps.map((ip) => (
                <tr key={ip.ip} className="border-t border-black/[0.05]">
                  <td className="py-2 font-mono text-[13px] text-ink">{ip.ip}</td>
                  <td className="py-2 text-black/55">{ip.country}</td>
                  <td className="py-2 text-right text-black/70">{fmt(ip.total)}</td>
                  <td className="py-2 text-right font-medium text-[#FF375F]">{fmt(ip.blocked)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="实时攻击事件">
          <ul className="max-h-[320px] space-y-1.5 overflow-auto no-scrollbar">
            {data.recent.map((e, i) => (
              <li key={i} className="flex items-center gap-3 rounded-xl bg-mist px-3 py-2 text-[13px]">
                <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${e.action === "block" ? "bg-[#FF375F]/10 text-[#FF375F]" : "bg-[#FF9F0A]/10 text-[#FF9F0A]"}`}>
                  {e.action === "block" ? "拦截" : "挑战"}
                </span>
                <span className="font-mono text-ink">{e.ip}</span>
                <span className="text-black/40">{e.country}</span>
                <span className="truncate text-black/55">{e.rule} · {e.uri}</span>
                <span className="ml-auto shrink-0 text-black/35">风险 {e.risk}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <p className="pt-2 text-center text-xs text-black/30">
        数据管道:OpenResty 决策日志 → edge-agent → ClickHouse → /api/stats。未连 ClickHouse 时显示样本数据。
      </p>
    </div>
  );
}

// 攻击地图:深色面板 + 来源国家脉冲点 + 汇聚到中心枢纽的攻击线
function AttackMap({ countries }: { countries: { name: string; value: number }[] }) {
  const hub: [number, number] = [50, 46];
  const max = countries[0]?.value || 1;
  return (
    <div className="relative aspect-[2/1] w-full overflow-hidden rounded-2xl bg-ink">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-48 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/20 blur-3xl" />
      <svg viewBox="0 0 100 50" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        {countries.map((c) => {
          const p = GEO[c.name] || GEO.XX;
          return (
            <line key={c.name} x1={p[0]} y1={p[1] * 0.5} x2={hub[0]} y2={hub[1] * 0.5}
              stroke="#FF375F" strokeWidth={0.2} opacity={0.35} />
          );
        })}
      </svg>
      {countries.map((c) => {
        const p = GEO[c.name] || GEO.XX;
        const size = 6 + (c.value / max) * 14;
        return (
          <div key={c.name} className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${p[0]}%`, top: `${p[1] * 2}%` }}>
            <span className="absolute inset-0 animate-ping rounded-full bg-[#FF375F]/40" style={{ width: size, height: size }} />
            <span className="block rounded-full bg-[#FF375F]" style={{ width: size, height: size }} />
            <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-[10px] text-white/70">{c.name}</span>
          </div>
        );
      })}
      <span className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
        style={{ left: `${hub[0]}%`, top: `${hub[1] * 2}%` }}>
        <span className="absolute inset-0 animate-ping rounded-full bg-accent/60" />
      </span>
    </div>
  );
}
