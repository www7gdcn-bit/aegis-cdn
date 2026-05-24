import { Injectable } from "@nestjs/common";

// ClickHouse HTTP 查询。未配置 CLICKHOUSE_URL 时 enabled=false,调用方回退样本数据。
@Injectable()
export class ClickHouseService {
  private url = process.env.CLICKHOUSE_URL || "";
  private db = process.env.CLICKHOUSE_DB || "aegis";

  enabled() {
    return this.url !== "";
  }

  async query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    if (!this.url) throw new Error("CLICKHOUSE_URL not configured");
    const endpoint = `${this.url.replace(/\/$/, "")}/?database=${encodeURIComponent(this.db)}`;
    const res = await fetch(endpoint, {
      method: "POST",
      body: `${sql} FORMAT JSON`,
      headers: { "Content-Type": "text/plain" },
    });
    if (!res.ok) throw new Error(`clickhouse ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { data: T[] };
    return json.data;
  }
}
