import { Injectable } from "@nestjs/common";
import { ClickHouseService } from "./clickhouse.service";

export type StatsPayload = {
  source: "clickhouse" | "sample";
  overview: { requests: number; blocked: number; challenged: number; allowed: number; blockRate: number; avgRisk: number; qps: number };
  timeseries: { t: string; requests: number; blocked: number; challenged: number }[];
  attackTypes: { name: string; value: number }[];
  topIps: { ip: string; country: string; total: number; blocked: number }[];
  topCountries: { name: string; value: number }[];
  recent: { ts: string; ip: string; country: string; action: string; risk: number; rule: string; uri: string }[];
};

const WINDOW = "ts > now() - INTERVAL 1 HOUR";
const T = "aegis.request_log";

@Injectable()
export class StatsService {
  constructor(private ch: ClickHouseService) {}

  async security(): Promise<StatsPayload> {
    if (this.ch.enabled()) {
      try {
        return await this.fromClickHouse();
      } catch {
        return { ...sample(), source: "sample" };
      }
    }
    return sample();
  }

  private async fromClickHouse(): Promise<StatsPayload> {
    const [ov] = await this.ch.query<any>(
      `SELECT count() requests, countIf(action='block') blocked, countIf(action='challenge') challenged, round(avg(risk),1) avg_risk FROM ${T} WHERE ${WINDOW}`,
    );
    const timeseries = await this.ch.query<any>(
      `SELECT toString(toStartOfMinute(ts)) t, count() requests, countIf(action='block') blocked, countIf(action='challenge') challenged FROM ${T} WHERE ${WINDOW} GROUP BY t ORDER BY t`,
    );
    const attackTypes = await this.ch.query<any>(
      `SELECT if(rule='-', 'other', rule) name, count() value FROM ${T} WHERE ${WINDOW} AND action!='allow' GROUP BY name ORDER BY value DESC LIMIT 8`,
    );
    const topIps = await this.ch.query<any>(
      `SELECT ip, any(country) country, count() total, countIf(action='block') blocked FROM ${T} WHERE ${WINDOW} GROUP BY ip ORDER BY total DESC LIMIT 10`,
    );
    const topCountries = await this.ch.query<any>(
      `SELECT country name, count() value FROM ${T} WHERE ${WINDOW} GROUP BY country ORDER BY value DESC LIMIT 8`,
    );
    const recent = await this.ch.query<any>(
      `SELECT toString(ts) ts, ip, country, action, risk, rule, uri FROM ${T} WHERE ${WINDOW} AND action!='allow' ORDER BY ts DESC LIMIT 20`,
    );
    const requests = Number(ov?.requests || 0);
    const blocked = Number(ov?.blocked || 0);
    const challenged = Number(ov?.challenged || 0);
    return {
      source: "clickhouse",
      overview: {
        requests, blocked, challenged, allowed: requests - blocked - challenged,
        blockRate: requests ? +((blocked / requests) * 100).toFixed(1) : 0,
        avgRisk: Number(ov?.avg_risk || 0),
        qps: +(requests / 3600).toFixed(1),
      },
      timeseries, attackTypes, topIps, topCountries, recent,
    };
  }
}

// ---- 样本数据(无 ClickHouse 时演示)----
const COUNTRIES = ["CN", "US", "RU", "BR", "IN", "VN", "ID", "DE"];
const RULES = ["cc:ip", "waf:sqli-1", "waf:xss-1", "risk-block", "fake-bot", "waf:traversal-1", "ban", "bot:curl"];
const rnd = (a: number, b: number) => Math.floor(a + Math.random() * (b - a));

function sample(): StatsPayload {
  const now = Date.now();
  const timeseries = Array.from({ length: 60 }, (_, i) => {
    const base = rnd(800, 1600);
    const blocked = rnd(40, 260) + (i > 45 ? rnd(200, 900) : 0);
    return { t: new Date(now - (59 - i) * 60000).toISOString().slice(11, 16), requests: base + blocked, blocked, challenged: rnd(10, 90) };
  });
  const requests = timeseries.reduce((s, p) => s + p.requests, 0);
  const blocked = timeseries.reduce((s, p) => s + p.blocked, 0);
  const challenged = timeseries.reduce((s, p) => s + p.challenged, 0);
  return {
    source: "sample",
    overview: {
      requests, blocked, challenged, allowed: requests - blocked - challenged,
      blockRate: +((blocked / requests) * 100).toFixed(1), avgRisk: rnd(18, 42), qps: +(requests / 3600).toFixed(1),
    },
    timeseries,
    attackTypes: RULES.map((name) => ({ name, value: rnd(120, 2200) })).sort((a, b) => b.value - a.value),
    topCountries: COUNTRIES.map((name) => ({ name, value: rnd(200, 5000) })).sort((a, b) => b.value - a.value),
    topIps: Array.from({ length: 10 }, () => {
      const total = rnd(300, 4000);
      return { ip: `${rnd(1, 223)}.${rnd(0, 255)}.${rnd(0, 255)}.${rnd(1, 254)}`, country: COUNTRIES[rnd(0, COUNTRIES.length)], total, blocked: Math.floor(total * (0.3 + Math.random() * 0.6)) };
    }).sort((a, b) => b.total - a.total),
    recent: Array.from({ length: 20 }, (_, i) => ({
      ts: new Date(now - i * rnd(800, 4000)).toISOString(),
      ip: `${rnd(1, 223)}.${rnd(0, 255)}.${rnd(0, 255)}.${rnd(1, 254)}`,
      country: COUNTRIES[rnd(0, COUNTRIES.length)],
      action: Math.random() > 0.4 ? "block" : "challenge",
      risk: rnd(55, 100),
      rule: RULES[rnd(0, RULES.length)],
      uri: ["/", "/api/login", "/wp-login.php", "/?id=1 union select", "/admin", "/cart"][rnd(0, 6)],
    })),
  };
}
