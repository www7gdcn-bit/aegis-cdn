/* eslint-disable no-console */
/**
 * services/saas-svc/scripts/backfill-edge-users.ts
 *
 * 给已有 Tenant 创建 GoEdge user 并回写 Tenant.edgeUserId。
 *
 * Phase 3 Step 3 起:走 PendingEdgeProvision queue 机制(本表是 retry 单一真源)。
 *
 * 用法:
 *   # dry-run(默认):列出待 provision 的 Tenant,不发请求
 *   npx ts-node services/saas-svc/scripts/backfill-edge-users.ts
 *
 *   # 同步真跑(立刻调 bff-edge,串行,失败立即报)
 *   npx ts-node services/saas-svc/scripts/backfill-edge-users.ts --apply
 *
 *   # 异步入 queue(给每个 Tenant 创建 PendingEdgeProvision,由 saas-svc cron 后台处理)
 *   npx ts-node services/saas-svc/scripts/backfill-edge-users.ts --apply --queue
 *
 *   # 限定 N 个
 *   npx ts-node services/saas-svc/scripts/backfill-edge-users.ts --apply --limit 10
 *
 * 依赖 env:
 *   DATABASE_URL                 saas-svc 的 Postgres
 *   BFF_EDGE_INTERNAL_URL        默认 http://localhost:4002(--queue 模式下不需要,saas-svc 自己跑)
 *   AEGIS_INTERNAL_SECRET        与 bff-edge 共享(--queue 模式下不需要)
 *
 * --queue 模式优点:
 *   - 不阻塞脚本(几秒返回);失败由 saas-svc 自动重试
 *   - 复用 saas-svc 的指数退避 + 错误分类逻辑
 *   - 适合大批量 Tenant
 * --queue 模式缺点:
 *   - 需要 saas-svc 在跑(cron 在线)
 *   - 失败原因要去查 PendingEdgeProvision 表
 *
 * 不带 --queue:直接 fetch bff-edge,串行;适合小批量调试。
 */

import { PrismaClient } from "../prisma/generated/client";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const useQueue = args.has("--queue");
const limitIdx = process.argv.indexOf("--limit");
const limit = limitIdx > 0 ? Number(process.argv[limitIdx + 1] || "0") || 0 : 0;

const bffBase = (process.env.BFF_EDGE_INTERNAL_URL || "http://localhost:4002").replace(/\/$/, "");
const internalToken = process.env.AEGIS_INTERNAL_SECRET || "";

async function main() {
  if (apply && !useQueue && !internalToken) {
    console.error("ERROR: 同步模式需要 AEGIS_INTERNAL_SECRET");
    process.exit(2);
  }

  const prisma = new PrismaClient();
  try {
    const pending = await prisma.tenant.findMany({
      where: { edgeUserId: null },
      orderBy: { id: "asc" },
      ...(limit > 0 ? { take: limit } : {}),
      select: { id: true, name: true },
    });

    const modeLabel = !apply ? "DRY-RUN" : useQueue ? "APPLY(queue)" : "APPLY(sync)";
    console.log(`[backfill-edge-users] mode=${modeLabel} pending=${pending.length}`);
    if (pending.length === 0) {
      console.log("[backfill-edge-users] 无待 provision tenant,结束。");
      return;
    }

    if (!apply) {
      console.log("[backfill-edge-users] 待 provision Tenant 列表(前 50 个):");
      pending.slice(0, 50).forEach((t) => console.log(`  - id=${t.id}  name="${t.name}"`));
      console.log("\n[backfill-edge-users] dry-run 结束。加 --apply [--queue] 真跑。");
      return;
    }

    if (useQueue) {
      // 异步:每个 tenant 创建/重置 PendingEdgeProvision,交给 saas-svc cron 处理
      console.log("[backfill-edge-users] --queue 模式:写 PendingEdgeProvision 表,saas-svc cron 异步处理");
      let queued = 0;
      for (const t of pending) {
        try {
          await prisma.pendingEdgeProvision.upsert({
            where: { tenantId: t.id },
            create: { tenantId: t.id, status: "pending", nextTryAt: new Date() },
            update: { status: "pending", nextTryAt: new Date(), attempts: 0, lastError: null },
          });
          console.log(`  → queued tenant=${t.id}`);
          queued++;
        } catch (e: any) {
          console.log(`  ! tenant=${t.id} queue error: ${e?.message || e}`);
        }
      }
      console.log(`\n[backfill-edge-users] queued ${queued} / ${pending.length} pending tenants.`);
      console.log("  saas-svc cron 每 30s 扫一次;查询状态:GET /api/v1/saas/admin/edge-provision");
      return;
    }

    // 同步:直接 fetch bff-edge,串行
    let ok = 0;
    let fail = 0;
    for (const t of pending) {
      const res = await callBffProvision(t.id, t.name);
      if (res.ok) {
        await prisma.tenant.update({
          where: { id: t.id },
          data: { edgeUserId: res.edgeUserId, edgeUserSyncedAt: new Date() },
        });
        // 同步写 PendingEdgeProvision = done(保持表单一真源)
        await prisma.pendingEdgeProvision.upsert({
          where: { tenantId: t.id },
          create: {
            tenantId: t.id,
            status: "done",
            attempts: 1,
            resolvedAt: new Date(),
          },
          update: { status: "done", attempts: { increment: 1 }, lastError: null, resolvedAt: new Date() },
        });
        console.log(`  ✓ tenant=${t.id} → edgeUserId=${res.edgeUserId}`);
        ok++;
      } else {
        console.log(`  ✗ tenant=${t.id}  code=${res.code} reason=${res.reason}`);
        fail++;
      }
    }
    console.log(`\n[backfill-edge-users] done.  ok=${ok}  fail=${fail}`);
    if (fail > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

type ProvisionRes =
  | { ok: true; edgeUserId: number }
  | { ok: false; code: string; reason: string };

async function callBffProvision(tenantId: number, name: string): Promise<ProvisionRes> {
  let res: Response;
  try {
    res = await fetch(`${bffBase}/internal/edge/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Aegis-Internal-Token": internalToken,
      },
      body: JSON.stringify({
        tenantId,
        username: `saas-tenant-${tenantId}`,
        remark: `${name} (saas tenantId=${tenantId})`,
      }),
    });
  } catch (e: any) {
    return { ok: false, code: "BFF_EDGE_UNREACHABLE", reason: String(e?.message || e) };
  }
  if (!res.ok) {
    let body: any = null;
    try { body = await res.json(); } catch { /* */ }
    return {
      ok: false,
      code: body?.code || `HTTP_${res.status}`,
      reason: body?.message || `bff-edge returned ${res.status}`,
    };
  }
  const body = await res.json() as { edgeUserId: number };
  if (!body?.edgeUserId) {
    return { ok: false, code: "BFF_EDGE_BAD_RESPONSE", reason: "missing edgeUserId" };
  }
  return { ok: true, edgeUserId: body.edgeUserId };
}

main().catch((e) => {
  console.error("[backfill-edge-users] fatal:", e);
  process.exit(1);
});
