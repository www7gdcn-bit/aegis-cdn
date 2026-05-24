// 安全可视化数据:接 ClickHouse;未配置/查询失败时回退到样本数据(便于先看效果)。
import { chQuery, clickhouseEnabled } from "./clickhouse";

export type Overview = {
  requests: number;
  blocked: number;
  challenged: number;
  allowed: number;
  blockRate: number; // %
  avgRisk: number;
  qps: number;
};
export type TimePoint = { t: string; requests: number; blocked: number; challenged: number };
export type NameValue = { name: string; value: number };
export type TopIp = { ip: string; country: string; total: number; blocked: number };
export type AttackEvent = { ts: string; ip: string; country: string; action: string; risk: number; rule: string; uri: string };

export type StatsPayload = {
  source: "clickhouse" | "sample";
  overview: Overview;
  timeseries: TimePoint[];
  attackTypes: NameValue[];
  topIps: TopIp[];
  topCountries: NameValue[];
  recent: AttackEvent[];
};

const WINDOW = "ts > now() - INTERVAL 1 HOUR";

async function fromClickHouse(): Promise<StatsPayload> {
  const T = "aegis.request_log";
  const [ov] = await chQuery<{ requests: number; blocked: number; challenged: number; avg_risk: number }>(
    `SELECT count() requests, countIf(action='block') blocked, countIf(action='challenge') challenged, round(avg(risk),1) avg_risk FROM ${T} WHERE ${WINDOW}`
  );
  const ts = await chQuery<{ t: string; requests: number; blocked: number; challenged: number }>(
    `SELECT toString(toStartOfMinute(ts)) t, count() requests, countIf(action='block') blocked, countIf(action='challenge') challenged FROM ${T} WHERE ${WINDOW} GROUP BY t ORDER BY t`
  );
  const types = await chQuery<{ name: string; value: number }>(
    `SELECT if(rule='-', 'other', rule) name, count() value FROM ${T} WHERE ${WINDOW} AND action!='allow' GROUP BY name ORDER BY value DESC LIMIT 8`
  );
  const ips = await chQuery<TopIp>(
    `SELECT ip, any(country) country, count() total, countIf(action='block') blocked FROM ${T} WHERE ${WINDOW} GROUP BY ip ORDER BY total DESC LIMIT 10`
  );
  const countries = await chQuery<{ name: string; value: number }>(
    `SELECT country name, count() value FROM ${T} WHERE ${WINDOW} GROUP BY country ORDER BY value DESC LIMIT 8`
  );
  const recent = await chQuery<AttackEvent>(
    `SELECT toString(ts) ts, ip, country, action, risk, rule, uri FROM ${T} WHERE ${WINDOW} AND action!='allow' ORDER BY ts DESC LIMIT 20`
  );

  const requests = Number(ov?.requests || 0);
  const blocked = Number(ov?.blocked || 0);
  const challenged = Number(ov?.challenged || 0);
  return {
    source: "clickhouse",
    overview: {
      requests, blocked, challenged,
      allowed: requests - blocked - challenged,
      blockRate: requests ? +((blocked / requests) * 100).toFixed(1) : 0,
      avgRisk: Number(ov?.avg_risk || 0),
      qps: +(requests / 3600).toFixed(1),
    },
    timeseries: ts,
    attackTypes: types,
    topIps: ips,
    topCountries: countries,
    recent,
  };
}

// ---- 样本数据(无 ClickHouse 时演示用,带随机使其“活”起来)----
const COUNTRIES = ["CN", "US", "RU", "BR", "IN", "VN", "ID", "DE"];
const RULES = ["cc:ip", "waf:sqli-1", "waf:xss-1", "risk-block", "fake-bot", "waf:traversal-1", "ban", "bot:curl"];
const rnd = (a: number, b: number) => Math.floor(a + Math.random() * (b - a));

function sample(): StatsPayload {
  const now = Date.now();
  const timeseries: TimePoint[] = Array.from({ length: 60 }, (_, i) => {
    const base = rnd(800, 1600);
    const blocked = rnd(40, 260) + (i > 45 ? rnd(200, 900) : 0); // 末尾模拟一波攻击
    return {
      t: new Date(now - (59 - i) * 60000).toISOString().slice(11, 16),
      requests: base + blocked,
      blocked,
      challenged: rnd(10, 90),
    };
  });
  const requests = timeseries.reduce((s, p) => s + p.requests, 0);
  const blocked = timeseries.reduce((s, p) => s + p.blocked, 0);
  const challenged = timeseries.reduce((s, p) => s + p.challenged, 0);
  const attackTypes: NameValue[] = RULES.map((name) => ({ name, value: rnd(120, 2200) })).sort((a, b) => b.value - a.value);
  const topCountries: NameValue[] = COUNTRIES.map((name) => ({ name, value: rnd(200, 5000) })).sort((a, b) => b.value - a.value);
  const topIps: TopIp[] = Array.from({ length: 10 }, () => {
    const total = rnd(300, 4000);
    return {
      ip: `${rnd(1, 223)}.${rnd(0, 255)}.${rnd(0, 255)}.${rnd(1, 254)}`,
      country: COUNTRIES[rnd(0, COUNTRIES.length)],
      total,
      blocked: Math.floor(total * (0.3 + Math.random() * 0.6)),
    };
  }).sort((a, b) => b.total - a.total);
  const recent: AttackEvent[] = Array.from({ length: 20 }, (_, i) => ({
    ts: new Date(now - i * rnd(800, 4000)).toISOString(),
    ip: `${rnd(1, 223)}.${rnd(0, 255)}.${rnd(0, 255)}.${rnd(1, 254)}`,
    country: COUNTRIES[rnd(0, COUNTRIES.length)],
    action: Math.random() > 0.4 ? "block" : "challenge",
    risk: rnd(55, 100),
    rule: RULES[rnd(0, RULES.length)],
    uri: ["/", "/api/login", "/wp-login.php", "/?id=1 union select", "/admin", "/cart"][rnd(0, 6)],
  }));

  return {
    source: "sample",
    overview: {
      requests, blocked, challenged,
      allowed: requests - blocked - challenged,
      blockRate: +((blocked / requests) * 100).toFixed(1),
      avgRisk: rnd(18, 42),
      qps: +(requests / 3600).toFixed(1),
    },
    timeseries, attackTypes, topIps, topCountries, recent,
  };
}

export async function getStats(): Promise<StatsPayload> {
  if (clickhouseEnabled()) {
    try {
      return await fromClickHouse();
    } catch (e) {
      // 查询失败回退样本(并标注),避免后台白屏
      return { ...sample(), source: "sample" };
    }
  }
  return sample();
}
