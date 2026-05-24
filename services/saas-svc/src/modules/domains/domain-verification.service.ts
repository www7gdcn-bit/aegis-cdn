import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Resolver } from "dns/promises";
import { PrismaService } from "../../core/prisma/prisma.service";

/**
 * 检测结果三态:
 *   matched   — CNAME 解析返回值中含目标 cnameTarget(忽略大小写、忽略末尾点)
 *   mismatch  — DNS 查询成功但未指向 cnameTarget;dns_pending 状态保留,记 lastVerifyError
 *   error     — DNS 查询失败(NXDOMAIN / 超时 / 网络);dns_pending 状态保留,记 lastVerifyError
 */
export type VerifyOutcome =
  | { result: "matched"; resolvedCnames: string[] }
  | { result: "mismatch"; resolvedCnames: string[]; reason: string }
  | { result: "error"; reason: string };

@Injectable()
export class DomainVerificationService {
  private readonly logger = new Logger(DomainVerificationService.name);
  private readonly resolver: Resolver;

  constructor(private prisma: PrismaService) {
    this.resolver = new Resolver();
    // DNS_RESOLVERS env 可配,默认走公共 DNS 提升可达性(避免容器内默认 resolver 慢/不稳)
    const servers = (process.env.DNS_RESOLVERS || "8.8.8.8,1.1.1.1")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (servers.length > 0) {
      try {
        this.resolver.setServers(servers);
      } catch (e: any) {
        this.logger.warn(`setServers failed (${servers.join(",")}): ${e?.message || e};用系统默认`);
      }
    }
    // 查询超时(毫秒)— Node resolver 不直接支持 timeout 配置,靠 dns/promises 自身的内部超时
  }

  private normalize(host: string): string {
    return host.trim().toLowerCase().replace(/\.$/, "");
  }

  /** 单域名验证 — 不写库,纯计算。供 cron / 手动 / 单测用。 */
  async checkOne(domain: string, cnameTarget: string): Promise<VerifyOutcome> {
    const target = this.normalize(cnameTarget);
    try {
      const records = await this.resolver.resolveCname(domain);
      const normalized = records.map((r) => this.normalize(r));
      if (normalized.includes(target)) {
        return { result: "matched", resolvedCnames: records };
      }
      return {
        result: "mismatch",
        resolvedCnames: records,
        reason: `CNAME 指向 [${records.join(", ")}],不含期望值 ${cnameTarget}`,
      };
    } catch (e: any) {
      const code = e?.code as string | undefined;
      const msg = e?.message || String(e);
      return { result: "error", reason: code ? `${code}: ${msg}` : msg };
    }
  }

  /**
   * 验证某个 SaasDomain 并写库。
   * - matched: status=active, verificationStatus=verified, verifiedAt=now, lastVerifyError=null
   * - 其他: 仅 lastVerifyAt + lastVerifyError;不动 status
   *
   * 已是 active/paused/failed 时跳过(只 dns_pending 才验证);返回 skipped 给调用方提示。
   */
  async verifyAndUpdate(id: number): Promise<{
    outcome: VerifyOutcome | "skipped";
    record: any;
  }> {
    const d = await this.prisma.saasDomain.findUnique({ where: { id } });
    if (!d) throw new NotFoundException("domain not found");
    if (d.status !== "dns_pending") {
      return { outcome: "skipped", record: d };
    }

    const outcome = await this.checkOne(d.domain, d.cnameTarget);
    const now = new Date();
    if (outcome.result === "matched") {
      const updated = await this.prisma.saasDomain.update({
        where: { id },
        data: {
          status: "active",
          verificationStatus: "verified",
          verifiedAt: now,
          lastVerifyAt: now,
          lastVerifyError: null,
        },
      });
      this.logger.log(`domain=${d.domain} VERIFIED → cname → ${d.cnameTarget}`);
      return { outcome, record: updated };
    }
    // mismatch / error
    const updated = await this.prisma.saasDomain.update({
      where: { id },
      data: { lastVerifyAt: now, lastVerifyError: outcome.reason },
    });
    return { outcome, record: updated };
  }

  /** Cron 批处理 — 选 status=dns_pending 且 lastVerifyAt 最旧 的 N 条 */
  async runBatch(batchSize = 20): Promise<{ processed: number; matched: number; pending: number }> {
    const candidates = await this.prisma.saasDomain.findMany({
      where: { status: "dns_pending" },
      orderBy: [{ lastVerifyAt: { sort: "asc", nulls: "first" } }, { id: "asc" }],
      take: batchSize,
      select: { id: true },
    });
    let matched = 0;
    let pending = 0;
    for (const c of candidates) {
      try {
        const r = await this.verifyAndUpdate(c.id);
        if (r.outcome !== "skipped" && r.outcome.result === "matched") matched++;
        else pending++;
      } catch (e: any) {
        this.logger.warn(`verify id=${c.id} threw: ${e?.message || e}`);
        pending++;
      }
    }
    if (candidates.length > 0) {
      this.logger.log(`verify cron: processed=${candidates.length} matched=${matched} pending=${pending}`);
    }
    return { processed: candidates.length, matched, pending };
  }
}
