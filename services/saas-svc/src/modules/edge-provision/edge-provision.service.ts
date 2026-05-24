import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";

// 与 bff-edge POST /internal/edge/users 错误码契约对齐(docs/19 §8)
type BffErrorCode =
  | "EDGE_API_NOT_READY"
  | "EDGE_API_UNREACHABLE"
  | "EDGE_API_AUTH_FAILED"
  | "EDGE_USER_CONFLICT"
  | "EDGE_API_ERROR"
  | "BFF_EDGE_UNREACHABLE"
  | "BFF_EDGE_BAD_RESPONSE"
  | string;

// 哪些错误是"瞬时" — 退避后值得再试;其他视为永久(运营介入)。
const TRANSIENT_CODES = new Set<BffErrorCode>([
  "EDGE_API_NOT_READY",      // SDK 仍 placeholder 模式,可能是配置未到位 — 退避等管理员配
  "EDGE_API_UNREACHABLE",    // gRPC 网络抖动
  "BFF_EDGE_UNREACHABLE",    // bff-edge 未起 / 网络
  "EDGE_API_ERROR",          // 5xx 未分类,先视为瞬时,超 maxAttempts 才永久失败
]);

// 永久(立刻 status=failed,不退避):
//   EDGE_API_AUTH_FAILED  — admin token 错(改配置才有用)
//   EDGE_USER_CONFLICT    — username 已被占,需运营手动改 username 重试

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

  // 指数退避(秒):2,4,8,16,32,64,...,封顶 600(10min)
  private backoffSec(attempts: number) {
    return Math.min(600, Math.pow(2, attempts));
  }

  /**
   * 在 PendingEdgeProvision 表创建/重置一条记录,立即触发一次同步尝试。
   * 调用方:AuthService.register 用 .catch() 包,完全不阻塞。
   */
  async scheduleProvision(tenantId: number): Promise<void> {
    // upsert pending 记录(已 done 的不动)
    await this.prisma.pendingEdgeProvision.upsert({
      where: { tenantId },
      create: { tenantId, status: "pending", nextTryAt: new Date() },
      update: {}, // 已存在不动 — 由 cron 或 admin retry 推进
    });
    // 立即尝试一次,失败由 cron 后续重试
    try {
      await this.attemptOne(tenantId);
    } catch (e: any) {
      this.logger.warn(`scheduleProvision tenant=${tenantId} initial attempt threw: ${e?.message || e}`);
    }
  }

  /**
   * Cron / internal endpoint 调用 — 批处理拉一批 due 的 pending,逐个尝试。
   * @returns { processed, ok, transientFail, permanentFail }
   */
  async retryPending(batchSize = 20): Promise<{ processed: number; ok: number; transientFail: number; permanentFail: number }> {
    const now = new Date();
    const due = await this.prisma.pendingEdgeProvision.findMany({
      where: {
        status: { in: ["pending", "retrying"] },
        nextTryAt: { lte: now },
      },
      orderBy: { nextTryAt: "asc" },
      take: batchSize,
      select: { tenantId: true },
    });

    let ok = 0;
    let transientFail = 0;
    let permanentFail = 0;
    for (const { tenantId } of due) {
      const r = await this.attemptOne(tenantId).catch((e) => ({
        outcome: "transient-fail" as const,
        code: "EDGE_API_ERROR" as BffErrorCode,
        reason: String(e?.message || e),
      }));
      if (r.outcome === "ok") ok++;
      else if (r.outcome === "permanent-fail") permanentFail++;
      else transientFail++;
    }
    if (due.length > 0) {
      this.logger.log(`retryPending: processed=${due.length} ok=${ok} transient=${transientFail} permanent=${permanentFail}`);
    }
    return { processed: due.length, ok, transientFail, permanentFail };
  }

  /** 单次尝试。内部 helper,返回 outcome 让调用方决定后续动作。 */
  private async attemptOne(tenantId: number): Promise<
    | { outcome: "ok"; edgeUserId: number }
    | { outcome: "transient-fail"; code: BffErrorCode; reason: string }
    | { outcome: "permanent-fail"; code: BffErrorCode; reason: string }
  > {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { edgeProvision: true },
    });
    if (!tenant) {
      // Tenant 没了,清掉 pending 防止永久挂着
      await this.prisma.pendingEdgeProvision.deleteMany({ where: { tenantId } });
      throw new NotFoundException("tenant not found");
    }

    // 幂等
    if (tenant.edgeUserId) {
      await this.prisma.pendingEdgeProvision.update({
        where: { tenantId },
        data: { status: "done", resolvedAt: new Date() },
      });
      return { outcome: "ok", edgeUserId: tenant.edgeUserId };
    }

    const current = tenant.edgeProvision;
    const attempts = (current?.attempts ?? 0) + 1;

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
      return this.markTransient(tenantId, attempts, "BFF_EDGE_UNREACHABLE", String(e?.message || e), current?.maxAttempts);
    }

    if (!res.ok) {
      let body: any = null;
      try { body = await res.json(); } catch { /* */ }
      const code: BffErrorCode = body?.code || `HTTP_${res.status}`;
      const reason = body?.message || `bff-edge returned ${res.status}`;
      if (TRANSIENT_CODES.has(code)) {
        return this.markTransient(tenantId, attempts, code, reason, current?.maxAttempts);
      }
      return this.markPermanent(tenantId, attempts, code, reason);
    }

    const body = await res.json() as { edgeUserId: number; username: string };
    if (!body?.edgeUserId) {
      return this.markTransient(tenantId, attempts, "BFF_EDGE_BAD_RESPONSE", "missing edgeUserId", current?.maxAttempts);
    }

    // 成功 — 原子写 Tenant.edgeUserId + PendingEdgeProvision.status=done
    try {
      await this.prisma.$transaction([
        this.prisma.tenant.update({
          where: { id: tenantId },
          data: { edgeUserId: body.edgeUserId, edgeUserSyncedAt: new Date() },
        }),
        this.prisma.pendingEdgeProvision.update({
          where: { tenantId },
          data: { status: "done", attempts, lastError: null, resolvedAt: new Date() },
        }),
      ]);
    } catch (e: any) {
      // 并发场景(另一个 worker 也写了)— 再读一次确认
      const fresh = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      if (fresh?.edgeUserId === body.edgeUserId) {
        return { outcome: "ok", edgeUserId: body.edgeUserId };
      }
      // 真冲突 — 回退视为瞬时
      return this.markTransient(tenantId, attempts, "EDGE_API_ERROR", `write back conflict: ${e?.message || e}`, current?.maxAttempts);
    }
    this.logger.log(`provisioned tenant=${tenantId} → edgeUserId=${body.edgeUserId} (attempt ${attempts})`);
    return { outcome: "ok", edgeUserId: body.edgeUserId };
  }

  private async markTransient(
    tenantId: number,
    attempts: number,
    code: BffErrorCode,
    reason: string,
    maxAttempts?: number,
  ): Promise<{ outcome: "transient-fail" | "permanent-fail"; code: BffErrorCode; reason: string }> {
    const cap = maxAttempts ?? 8;
    if (attempts >= cap) {
      return this.markPermanent(tenantId, attempts, code, `${reason} (exceeded ${cap} attempts)`);
    }
    const delaySec = this.backoffSec(attempts);
    const nextTryAt = new Date(Date.now() + delaySec * 1000);
    await this.prisma.pendingEdgeProvision.update({
      where: { tenantId },
      data: { status: "retrying", attempts, lastError: reason, lastErrorAt: new Date(), nextTryAt },
    });
    this.logger.warn(`tenant=${tenantId} transient fail (${code}): ${reason} | next try in ${delaySec}s`);
    return { outcome: "transient-fail", code, reason };
  }

  private async markPermanent(
    tenantId: number,
    attempts: number,
    code: BffErrorCode,
    reason: string,
  ): Promise<{ outcome: "permanent-fail"; code: BffErrorCode; reason: string }> {
    await this.prisma.pendingEdgeProvision.update({
      where: { tenantId },
      data: { status: "failed", attempts, lastError: reason, lastErrorAt: new Date(), resolvedAt: new Date() },
    });
    this.logger.error(`tenant=${tenantId} PERMANENT FAIL (${code}): ${reason}`);
    return { outcome: "permanent-fail", code, reason };
  }

  /**
   * 运营手动 / 用户主动 retry — 重置 status=pending nextTryAt=now,触发一次尝试。
   * 不重置 attempts,以保留历史;运营若想清零可单独走 reset()。
   */
  async manualRetry(tenantId: number): Promise<void> {
    const rec = await this.prisma.pendingEdgeProvision.findUnique({ where: { tenantId } });
    if (!rec) {
      await this.scheduleProvision(tenantId);
      return;
    }
    if (rec.status === "done") return;
    await this.prisma.pendingEdgeProvision.update({
      where: { tenantId },
      data: { status: "pending", nextTryAt: new Date(), lastError: null },
    });
    await this.attemptOne(tenantId).catch((e) =>
      this.logger.warn(`manualRetry tenant=${tenantId} attempt threw: ${e?.message || e}`),
    );
  }

  /** 状态查询(给用户/admin endpoint 返) */
  async getStatus(tenantId: number) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { edgeProvision: true },
    });
    if (!tenant) throw new NotFoundException("tenant not found");
    return {
      tenantId,
      edgeUserId: tenant.edgeUserId,
      edgeUserSyncedAt: tenant.edgeUserSyncedAt,
      provision: tenant.edgeProvision
        ? {
            status: tenant.edgeProvision.status,
            attempts: tenant.edgeProvision.attempts,
            maxAttempts: tenant.edgeProvision.maxAttempts,
            lastError: tenant.edgeProvision.lastError,
            lastErrorAt: tenant.edgeProvision.lastErrorAt,
            nextTryAt: tenant.edgeProvision.nextTryAt,
            resolvedAt: tenant.edgeProvision.resolvedAt,
          }
        : null,
    };
  }

  /**
   * 一次性同步 provision(给 backfill 兼容旧行为用)。
   * 走 PendingEdgeProvision 记录,但不交给 cron,而是阻塞直到尝试完成。
   */
  async provisionNow(tenantId: number) {
    await this.prisma.pendingEdgeProvision.upsert({
      where: { tenantId },
      create: { tenantId, status: "pending", nextTryAt: new Date() },
      update: {},
    });
    return this.attemptOne(tenantId);
  }
}
