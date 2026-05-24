/* eslint-disable no-console */
/**
 * services/saas-svc/scripts/backfill-edge-users.ts
 *
 * 给已有 Tenant 创建 GoEdge user 并回写 Tenant.edgeUserId。
 *
 * 用法:
 *   # dry-run(默认):列出待 provision 的 Tenant,不发请求
 *   npx ts-node services/saas-svc/scripts/backfill-edge-users.ts
 *
 *   # 真跑
 *   npx ts-node services/saas-svc/scripts/backfill-edge-users.ts --apply
 *
 *   # 限定 N 个
 *   npx ts-node services/saas-svc/scripts/backfill-edge-users.ts --apply --limit 10
 *
 * 依赖 env:
 *   DATABASE_URL                 saas-svc 的 Postgres
 *   BFF_EDGE_INTERNAL_URL        默认 http://localhost:4002
 *   AEGIS_INTERNAL_SECRET        与 bff-edge 共享
 *
 * 不会破坏已有 Tenant 的 edgeUserId(若已绑定则跳过)。
 */

import { PrismaClient } from "../prisma/generated/client";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const limitIdx = process.argv.indexOf("--limit");
const limit = limitIdx > 0 ? Number(process.argv[limitIdx + 1] || "0") || 0 : 0;

const bffBase = (process.env.BFF_EDGE_INTERNAL_URL || "http://localhost:4002").replace(/\/$/, "");
const internalToken = process.env.AEGIS_INTERNAL_SECRET || "";

async function main() {
  if (!internalToken) {
    console.error("ERROR: AEGIS_INTERNAL_SECRET 未设置");
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

    console.log(`[backfill-edge-users] mode=${apply ? "APPLY" : "DRY-RUN"} bff=${bffBase} pending=${pending.length}`);
    if (pending.length === 0) {
      console.log("[backfill-edge-users] 无待 provision tenant,结束。");
      return;
    }

    if (!apply) {
      console.log("[backfill-edge-users] 待 provision Tenant 列表(前 50 个):");
      pending.slice(0, 50).forEach((t) => console.log(`  - id=${t.id}  name="${t.name}"`));
      console.log("\n[backfill-edge-users] dry-run 结束。加 --apply 参数真跑。");
      return;
    }

    let ok = 0;
    let fail = 0;
    for (const t of pending) {
      const res = await callBffProvision(t.id, t.name);
      if (res.ok) {
        await prisma.tenant.update({
          where: { id: t.id },
          data: { edgeUserId: res.edgeUserId, edgeUserSyncedAt: new Date() },
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
