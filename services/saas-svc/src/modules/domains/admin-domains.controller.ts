import { Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { DomainVerificationService } from "./domain-verification.service";
import { SslService } from "./ssl.service";
import { JwtAuthGuard } from "../../core/common/jwt-auth.guard";
import { RolesGuard } from "../../core/common/roles.guard";
import { Roles } from "../../core/common/roles.decorator";

/**
 * 运营后台:跨租户查全部域名。
 *
 * 列表返回所有排查所需字段:
 *   id / tenantId / tenant.name / domain / cnameTarget / edgeDomainId
 *   status / sslStatus / verificationStatus
 *   verifiedAt / lastVerifyAt / lastVerifyError
 *   lastError / lastErrorAt
 *   edgeSyncedAt / createdAt
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "operator")
@Controller("admin/domains")
export class AdminDomainsController {
  constructor(
    private prisma: PrismaService,
    private verify: DomainVerificationService,
    private ssl: SslService,
  ) {}

  // 列表 — 可按 status / verificationStatus 过滤,take=200
  @Get()
  async list(
    @Query("status") status?: string,
    @Query("verificationStatus") verificationStatus?: string,
  ) {
    return this.prisma.saasDomain.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(verificationStatus ? { verificationStatus } : {}),
      },
      orderBy: { id: "desc" },
      take: 200,
      include: { tenant: { select: { id: true, name: true, edgeUserId: true } } },
    });
  }

  @Get(":id")
  async detail(@Param("id", ParseIntPipe) id: number) {
    return this.prisma.saasDomain.findUnique({
      where: { id },
      include: { tenant: { select: { id: true, name: true, edgeUserId: true, kycStatus: true } } },
    });
  }

  // 管理员手动重跑某域名的 DNS 检测(运营介入排查用)
  @Post(":id/verify")
  async forceVerify(@Param("id", ParseIntPipe) id: number) {
    return this.verify.verifyAndUpdate(id);
  }

  // 管理员手动触发 SSL 签发/续期(覆盖 status 检查;同步阻塞)
  @Post(":id/issue-ssl")
  async forceIssueSsl(@Param("id", ParseIntPipe) id: number) {
    return this.ssl.issueOrRenew(id);
  }

  @Get(":id/ssl")
  async sslDetail(@Param("id", ParseIntPipe) id: number) {
    return this.ssl.getStatus(id);
  }

  /**
   * Phase 3 Step 6.5 — 手动重绑证书。
   *
   * 场景:ACME 签发成功(sslStatus=issued, sslCertId 已写),但 bindCert 失败
   *   (sslBindingStatus=failed)— 通常是 GoEdge createSSLPolicy 或 updateServerHTTPS
   *   返错。运营修复 GoEdge 后调本接口,无需重新申请证书(避免 LE rate limit)。
   */
  @Post(":id/rebind-cert")
  async rebindCert(@Param("id", ParseIntPipe) id: number) {
    return this.ssl.rebindCert(id);
  }
}
