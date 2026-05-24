import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";

// 续期阈值:剩余有效期 ≤ 此天数则触发自动续期(LE 默认 90 天证书,30 天续期是工业惯例)
const RENEW_WITHIN_DAYS = Number(process.env.SSL_RENEW_WITHIN_DAYS || "30");

@Injectable()
export class SslService {
  private readonly logger = new Logger(SslService.name);
  private readonly bffBase = (process.env.BFF_EDGE_INTERNAL_URL || "http://localhost:4002").replace(/\/$/, "");

  constructor(private prisma: PrismaService) {}

  private headers() {
    return {
      "Content-Type": "application/json",
      "X-Aegis-Internal-Token": process.env.AEGIS_INTERNAL_SECRET || "",
    };
  }

  private get acmeUserId(): number {
    const v = Number(process.env.EDGE_DEFAULT_ACME_USER_ID || "0");
    return v > 0 ? v : 0;
  }

  /**
   * 单域名签发(同步阻塞,可能 30s-2min)。
   *
   * 前置:
   *   1. SaasDomain.status === "active"(DNS 已验证)
   *   2. Tenant.edgeUserId 已 provision
   *   3. EDGE_DEFAULT_ACME_USER_ID env 已配(平台运营在 GoEdge 注册一个共用 ACME User)
   *
   * 状态机:
   *   none/failed   → pending → issued(成功)/ failed(失败)
   *   issued        → renewing → issued(续期成功)/ issued + lastSslError(续期失败保留旧)
   */
  async issueOrRenew(domainId: number, opts: { isRenew?: boolean } = {}) {
    const d = await this.prisma.saasDomain.findUnique({
      where: { id: domainId },
      include: { tenant: { select: { edgeUserId: true } } },
    });
    if (!d) throw new NotFoundException("domain not found");
    if (d.status !== "active") {
      throw new BadRequestException("仅 status=active 的域名可签发 SSL");
    }
    if (!d.tenant?.edgeUserId) {
      throw new BadRequestException("GoEdge 账户未就绪");
    }
    const acmeUserId = this.acmeUserId;
    if (!acmeUserId) {
      throw new BadRequestException(
        "EDGE_DEFAULT_ACME_USER_ID 未配置 — 请运营先在 GoEdge 注册一个共用 ACME User 并把 id 配到 env",
      );
    }

    const startStatus = opts.isRenew ? "renewing" : "pending";
    await this.prisma.saasDomain.update({
      where: { id: d.id },
      data: { sslStatus: startStatus, lastSslAttemptAt: new Date() },
    });

    // 调 bff-edge 一把签发(createACMETask + runACMETask 同步)
    let res: Response;
    try {
      res = await fetch(`${this.bffBase}/internal/edge/ssl/acme/tasks`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          edgeUserId: d.tenant.edgeUserId,
          acmeUserId,
          domains: [d.domain],         // SAN 仅主域名;cnameTarget 不进 LE 申请(不属于客户)
          authType: "http",            // 第一版用 HTTP-01;DNS-01 留后续
          autoRenew: true,
        }),
      });
    } catch (e: any) {
      const msg = String(e?.message || e);
      return this.fail(d.id, opts.isRenew, "BFF_EDGE_UNREACHABLE", msg);
    }

    if (!res.ok) {
      let body: any = null;
      try { body = await res.json(); } catch { /* */ }
      const code = body?.code || `HTTP_${res.status}`;
      const reason = body?.message || `bff-edge returned ${res.status}`;
      return this.fail(d.id, opts.isRenew, code, reason);
    }

    const body = await res.json() as {
      acmeTaskId: number; isOk: boolean; sslCertId?: number; error?: string;
    };

    if (!body.isOk) {
      return this.fail(d.id, opts.isRenew, "ACME_RUN_FAILED", body.error || "unknown ACME error");
    }
    if (!body.sslCertId) {
      return this.fail(d.id, opts.isRenew, "ACME_NO_CERT_ID", "ACME isOk but no sslCertId");
    }

    // 成功 — 写状态 + 拉 cert 详情拿到期时间
    const now = new Date();
    let expiresAt: Date | null = null;
    try {
      const certRes = await fetch(`${this.bffBase}/internal/edge/ssl/certs/${body.sslCertId}`, {
        headers: this.headers(),
      });
      if (certRes.ok) {
        const cert = await certRes.json() as { timeEndAt?: number };
        if (cert.timeEndAt) expiresAt = new Date(cert.timeEndAt * 1000);
      }
    } catch (e: any) {
      // 拿不到也不算失败 — 后续 cron 会回填
      this.logger.warn(`fetch cert detail failed: ${e?.message || e}`);
    }

    const updated = await this.prisma.saasDomain.update({
      where: { id: d.id },
      data: {
        sslStatus: "issued",
        acmeTaskId: body.acmeTaskId,
        sslCertId: body.sslCertId,
        sslIssuedAt: opts.isRenew ? d.sslIssuedAt ?? now : now,
        sslExpiresAt: expiresAt,
        sslRenewedAt: opts.isRenew ? now : null,
        lastSslError: null,
        // 新签发即标记 binding 待处理,接下来同步调 bindCert
        sslBindingStatus: "pending",
        sslBindingError: null,
      },
    });

    this.logger.log(
      `${opts.isRenew ? "RENEWED" : "ISSUED"} ssl domain=${d.domain} certId=${body.sslCertId} expiresAt=${expiresAt?.toISOString() || "?"}`,
    );

    // 接续:绑证书到 GoEdge server HTTPS 配置(Step 6.5)
    // 失败不覆盖 sslStatus,仅 sslBindingStatus=failed,运营可走 rebind-cert 手动补
    if (d.edgeDomainId) {
      await this.bindCertToServer(d.id, d.edgeDomainId, body.sslCertId).catch((e) => {
        this.logger.warn(`bindCert async error caught: ${e?.message || e}`);
      });
    } else {
      // edgeDomainId 不存在意味着 SaasDomain 状态机异常(active 但没绑 GoEdge server)
      await this.prisma.saasDomain.update({
        where: { id: d.id },
        data: {
          sslBindingStatus: "failed",
          sslBindingError: "domain has no edgeDomainId — 数据异常",
        },
      });
    }

    // 返回最终态(可能含 binding 结果) — findUniqueOrThrow 保证非 null(刚才已 update 过)
    return this.prisma.saasDomain.findUniqueOrThrow({ where: { id: d.id } });
  }

  /**
   * 把证书绑到 GoEdge server HTTPS。
   *
   * 失败策略(用户明确):
   *   - **不覆盖** sslStatus=issued
   *   - 仅写 sslBindingStatus=failed + sslBindingError
   *   - 运营可走 POST /admin/domains/:id/rebind-cert 手动补,无需重新签证书
   */
  async bindCertToServer(domainId: number, edgeDomainId: number, certId: number): Promise<void> {
    let res: Response;
    try {
      res = await fetch(`${this.bffBase}/internal/edge/domains/${edgeDomainId}/bind-cert`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ certId }),
      });
    } catch (e: any) {
      const msg = String(e?.message || e);
      await this.prisma.saasDomain.update({
        where: { id: domainId },
        data: {
          sslBindingStatus: "failed",
          sslBindingError: `BFF_EDGE_UNREACHABLE: ${msg}`,
        },
      });
      this.logger.warn(`bindCert id=${domainId} unreachable: ${msg}`);
      return;
    }

    if (!res.ok) {
      let body: any = null;
      try { body = await res.json(); } catch { /* */ }
      const code = body?.code || `HTTP_${res.status}`;
      const reason = body?.message || `bff-edge returned ${res.status}`;
      await this.prisma.saasDomain.update({
        where: { id: domainId },
        data: {
          sslBindingStatus: "failed",
          sslBindingError: `${code}: ${reason}`,
        },
      });
      this.logger.warn(`bindCert id=${domainId} FAIL: ${code} ${reason}`);
      return;
    }

    const body = await res.json() as { success: boolean; sslPolicyId?: number };
    if (!body.success) {
      await this.prisma.saasDomain.update({
        where: { id: domainId },
        data: {
          sslBindingStatus: "failed",
          sslBindingError: "bff-edge returned success=false without code",
        },
      });
      return;
    }

    await this.prisma.saasDomain.update({
      where: { id: domainId },
      data: {
        sslBindingStatus: "bound",
        sslBindingError: null,
        sslBoundAt: new Date(),
        sslPolicyId: body.sslPolicyId ?? null,
      },
    });
    this.logger.log(`bound cert domainId=${domainId} sslPolicyId=${body.sslPolicyId}`);
  }

  /**
   * 仅重绑(不重新申请证书) — 运营介入用,无需消耗 LE rate limit。
   * 前置:sslCertId 必须存在(否则要走 issueOrRenew)。
   */
  async rebindCert(domainId: number) {
    const d = await this.prisma.saasDomain.findUnique({ where: { id: domainId } });
    if (!d) throw new NotFoundException("domain not found");
    if (!d.sslCertId) {
      throw new BadRequestException("尚未签发证书 — 请先调 issue-ssl,不要用 rebind-cert");
    }
    if (!d.edgeDomainId) {
      throw new BadRequestException("domain 未绑 GoEdge server — 数据异常");
    }
    await this.prisma.saasDomain.update({
      where: { id: d.id },
      data: { sslBindingStatus: "pending", sslBindingError: null },
    });
    await this.bindCertToServer(d.id, d.edgeDomainId, d.sslCertId);
    return this.prisma.saasDomain.findUniqueOrThrow({ where: { id: d.id } });
  }

  private async fail(domainId: number, isRenew: boolean | undefined, code: string, reason: string) {
    const fullReason = `${code}: ${reason}`;
    const data: any = { lastSslError: fullReason, lastSslAttemptAt: new Date() };
    if (isRenew) {
      // 续期失败保留 issued 状态(用旧证书过到期);仅记 lastSslError 警示
      // 但若已 expired,则转 failed
    } else {
      data.sslStatus = "failed";
    }
    const updated = await this.prisma.saasDomain.update({ where: { id: domainId }, data });
    this.logger.warn(`ssl ${isRenew ? "renew" : "issue"} FAIL domain.id=${domainId}: ${fullReason}`);
    return updated;
  }

  /** 状态查询(用户/admin 端点) */
  async getStatus(domainId: number) {
    const d = await this.prisma.saasDomain.findUnique({
      where: { id: domainId },
      select: {
        id: true, domain: true, status: true, sslStatus: true,
        acmeTaskId: true, sslCertId: true,
        sslIssuedAt: true, sslExpiresAt: true, sslRenewedAt: true,
        lastSslAttemptAt: true, lastSslError: true,
      },
    });
    if (!d) throw new NotFoundException("domain not found");
    const daysToExpire = d.sslExpiresAt
      ? Math.floor((d.sslExpiresAt.getTime() - Date.now()) / 86400_000)
      : null;
    return { ...d, daysToExpire };
  }

  /** 一次性自动签发任务的批处理 — cron 调 */
  async runAutoIssueBatch(batchSize = 10): Promise<{ candidates: number; issued: number; renewed: number; failed: number }> {
    // 1) 待首次签发:status=active && sslStatus in [none, failed] && acmeUserId 已配
    if (!this.acmeUserId) return { candidates: 0, issued: 0, renewed: 0, failed: 0 };

    const renewDeadline = new Date(Date.now() + RENEW_WITHIN_DAYS * 86400_000);

    const issueCandidates = await this.prisma.saasDomain.findMany({
      where: { status: "active", sslStatus: { in: ["none", "failed"] } },
      orderBy: [{ lastSslAttemptAt: { sort: "asc", nulls: "first" } }, { id: "asc" }],
      take: batchSize,
      select: { id: true },
    });

    // 2) 续期:status=active && sslStatus=issued && sslExpiresAt 在续期窗口内
    const renewCandidates = await this.prisma.saasDomain.findMany({
      where: {
        status: "active",
        sslStatus: "issued",
        sslExpiresAt: { lte: renewDeadline, not: null },
      },
      orderBy: [{ sslExpiresAt: "asc" }],
      take: Math.max(0, batchSize - issueCandidates.length),
      select: { id: true },
    });

    let issued = 0;
    let renewed = 0;
    let failed = 0;
    for (const c of issueCandidates) {
      try {
        const r = await this.issueOrRenew(c.id, { isRenew: false });
        if (r.sslStatus === "issued") issued++;
        else failed++;
      } catch (e: any) {
        failed++;
        this.logger.warn(`issue id=${c.id} threw: ${e?.message || e}`);
      }
    }
    for (const c of renewCandidates) {
      try {
        const r = await this.issueOrRenew(c.id, { isRenew: true });
        if (r.sslStatus === "issued" && r.sslRenewedAt) renewed++;
        else failed++;
      } catch (e: any) {
        failed++;
        this.logger.warn(`renew id=${c.id} threw: ${e?.message || e}`);
      }
    }

    const candidates = issueCandidates.length + renewCandidates.length;
    if (candidates > 0) {
      this.logger.log(`ssl auto cron: candidates=${candidates} issued=${issued} renewed=${renewed} failed=${failed}`);
    }
    return { candidates, issued, renewed, failed };
  }
}
