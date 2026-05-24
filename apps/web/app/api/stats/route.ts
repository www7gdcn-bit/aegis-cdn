import { NextResponse } from "next/server";
import { getStats } from "@/lib/stats";

export const dynamic = "force-dynamic"; // 始终实时,不缓存

// GET /api/stats —— 后台攻击可视化数据(ClickHouse 或样本)
// 生产中此查询层迁移到 NestJS 控制面(见 docs/05);本期用 Next 路由便于一体化预览。
export async function GET() {
  const data = await getStats();
  return NextResponse.json(data);
}
