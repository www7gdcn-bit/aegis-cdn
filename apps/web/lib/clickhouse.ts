// ClickHouse 查询助手(HTTP 接口)。仅服务端使用。
const CH_URL = process.env.CLICKHOUSE_URL || "";
const CH_DB = process.env.CLICKHOUSE_DB || "aegis";

export function clickhouseEnabled() {
  return CH_URL !== "";
}

/** 执行 SQL,返回行数组。失败抛错(调用方决定是否回退样本数据)。 */
export async function chQuery<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  if (!CH_URL) throw new Error("CLICKHOUSE_URL not configured");
  const url = `${CH_URL.replace(/\/$/, "")}/?database=${encodeURIComponent(CH_DB)}`;
  const res = await fetch(url, {
    method: "POST",
    body: `${sql} FORMAT JSON`,
    headers: { "Content-Type": "text/plain" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`clickhouse ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { data: T[] };
  return json.data;
}
