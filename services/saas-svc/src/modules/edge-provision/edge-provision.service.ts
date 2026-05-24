import { HttpException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";

/**
 * EdgeProvisionService — saas-svc 调 bff-edge,把 Tenant 同步成 GoEdge user。
 *
 * Phase 3 Step 2 范围:
 *   - 提供 `provisionTenant(tenantId)` 方法 — 调 bff-edge /internal/edge/users
 *   - 成功后写 Tenant.edgeUserId + edgeUserSyncedAt
 *   - **不**接进注册流程(避免破坏现有 register;Phase 3 Step 3 才接)
 *   - 失败:不影响 SaaS 用户;返回 { ok:false, reason } 让调用方决定
 *
 * 入口:
 *   - 测试/手动:从其他模块 import 调
 *   - 批量:scripts/backfill-edge-users.ts
 *
 * 未对接前的 Tenant.edgeUserId 永远为 null,saas-svc/apps-web 现有功能不受影响。
 */
@Injectable()
export class EdgeProvisionService {
  private readonly logger = new Logger(EdgeProvisionService.name);
  private readonly bffBase = (process.env.BFF_EDGE_INTERNAL_URL || "http://localhost:4002").replace(/\/$/, "");

  constructor(private prisma: PrismaService) {}

  private headers() {
    return {
      "Content-Type": "application/json",
      "X-Aegis-Internal-Token": process.env.AEGIS_INTERNAL_SECRET || "",
    };
  }

  /**
   * @returns { ok:true, edgeUserId } 成功;{ ok:false, code, reason } 失败(已落 log)
   */
  async provisionTenant(
    tenantId: number,
  ): Promise<
    | { ok: true; edgeUserId: number; alreadyBound?: boolean }
    | { ok: false; code: string; reason: string; httpStatus?: number }
  > {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException("tenant not found");

    if (tenant.edgeUserId) {
      this.logger.log(`tenant=${tenantId} 已绑定 edgeUserId=${tenant.edgeUserId},跳过`);
      return { ok: true, edgeUserId: tenant.edgeUserId, alreadyBound: true };
    }

    // 调 bff-edge
    let res: Response;
    try {
      res = await fetch(`${this.bffBase}/internal/edge/users`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          tenantId,
          username: `saas-tenant-${tenantId}`,
          remark: `${tenant.name} (saas tenantId=${tenantId})`,
        }),
      });
    } catch (e: any) {
      const msg = String(e?.message || e);
      this.logger.warn(`bff-edge unreachable: ${msg}`);
      return { ok: false, code: "BFF_EDGE_UNREACHABLE", reason: msg };
    }

    if (!res.ok) {
      let body: any = null;
      try { body = await res.json(); } catch { /* */ }
      const code = body?.code || `HTTP_${res.status}`;
      const reason = body?.message || `bff-edge returned ${res.status}`;
      this.logger.warn(`provision failed: ${code} ${reason}`);
      return { ok: false, code, reason, httpStatus: res.status };
    }

    const body = await res.json() as { edgeUserId: number; username: string };
    if (!body?.edgeUserId) {
      return { ok: false, code: "BFF_EDGE_BAD_RESPONSE", reason: "missing edgeUserId" };
    }

    // 回写
    try {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { edgeUserId: body.edgeUserId, edgeUserSyncedAt: new Date() },
      });
    } catch (e: any) {
      // 假设是 unique 冲突(另一个并发请求已写入):再读一次确认
      const fresh = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      if (fresh?.edgeUserId === body.edgeUserId) {
        return { ok: true, edgeUserId: body.edgeUserId, alreadyBound: true };
      }
      this.logger.error(`write back edgeUserId failed: ${e?.message || e}`);
      throw new HttpException("save edgeUserId failed", 500);
    }

    this.logger.log(`provisioned tenant=${tenantId} edgeUserId=${body.edgeUserId}`);
    return { ok: true, edgeUserId: body.edgeUserId };
  }
}
