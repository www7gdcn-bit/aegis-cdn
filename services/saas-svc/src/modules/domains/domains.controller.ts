import {
  Body, Controller, Delete, ForbiddenException, Get, NotFoundException,
  Param, ParseIntPipe, Post, UseGuards,
} from "@nestjs/common";
import { DomainsService } from "./domains.service";
import { DomainVerificationService } from "./domain-verification.service";
import { SslService } from "./ssl.service";
import { AddDomainDto } from "./dto";
import { JwtAuthGuard, AuthUser } from "../../core/common/jwt-auth.guard";
import { CurrentUser } from "../../core/common/current-user.decorator";

// 用户视角:管自己 Tenant 下的域名。
@UseGuards(JwtAuthGuard)
@Controller("domains")
export class DomainsController {
  constructor(
    private domains: DomainsService,
    private verify: DomainVerificationService,
    private ssl: SslService,
  ) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.domains.list(u.tenantId!);
  }

  @Post()
  add(@CurrentUser() u: AuthUser, @Body() dto: AddDomainDto) {
    return this.domains.add(u.tenantId!, dto);
  }

  @Get(":id")
  get(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.domains.getById(u.tenantId!, id);
  }

  // 单独返回 CNAME 配置指引(便于前端 UI 复用)
  @Get(":id/cname")
  cname(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.domains.getCname(u.tenantId!, id);
  }

  @Delete(":id")
  remove(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.domains.remove(u.tenantId!, id);
  }

  @Post(":id/pause")
  pause(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.domains.pause(u.tenantId!, id);
  }

  @Post(":id/resume")
  resume(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.domains.resume(u.tenantId!, id);
  }

  // Phase 3 Step 5 — DNS 验证状态查询
  @Get(":id/verify-status")
  async verifyStatus(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number) {
    const d = await this.domains.getById(u.tenantId!, id);
    return {
      domain: d.domain,
      status: d.status,
      verificationStatus: d.verificationStatus,
      cnameTarget: d.cnameTarget,
      verified: d.verificationStatus === "verified",
      verifiedAt: d.verifiedAt,
      lastVerifyAt: d.lastVerifyAt,
      lastVerifyError: d.lastVerifyError,
    };
  }

  // 手动触发一次 DNS 检测 — "我已完成解析,立即检测"
  @Post(":id/verify")
  async verifyNow(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number) {
    // 校验归属
    const d = await this.domains.getById(u.tenantId!, id);
    if (d.status !== "dns_pending") {
      // 不阻止 — 返回当前状态让前端处理
      return {
        skipped: true,
        reason: `当前 status=${d.status},仅 dns_pending 状态需检测`,
        domain: d.domain,
        status: d.status,
        verificationStatus: d.verificationStatus,
      };
    }
    const r = await this.verify.verifyAndUpdate(id);
    return {
      domain: d.domain,
      ...(r.outcome === "skipped"
        ? { outcome: "skipped" }
        : {
            outcome: r.outcome.result,
            ...(r.outcome.result !== "matched" ? { reason: r.outcome.reason } : {}),
            ...(r.outcome.result !== "error" ? { resolvedCnames: r.outcome.resolvedCnames } : {}),
          }),
      status: r.record.status,
      verificationStatus: r.record.verificationStatus,
      verified: r.record.verificationStatus === "verified",
      verifiedAt: r.record.verifiedAt,
      lastVerifyAt: r.record.lastVerifyAt,
      lastVerifyError: r.record.lastVerifyError,
    };
  }

  // Phase 3 Step 6 — SSL/ACME
  @Get(":id/ssl")
  async sslStatus(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number) {
    await this.domains.getById(u.tenantId!, id);          // 校验归属
    return this.ssl.getStatus(id);
  }

  // 手动触发立即签发(用户点'立即开启 HTTPS' 按钮)
  // 注:同步阻塞最长 ~2min(LE 实际签发);前端应有 timeout/loading
  @Post(":id/issue-ssl")
  async issueSsl(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number) {
    const d = await this.domains.getById(u.tenantId!, id); // 校验归属
    if (d.status !== "active") {
      return {
        skipped: true,
        reason: `当前 domain status=${d.status},仅 active 可签发`,
        ssl: await this.ssl.getStatus(id),
      };
    }
    const result = await this.ssl.issueOrRenew(id, { isRenew: false });
    return {
      sslStatus: result.sslStatus,
      sslCertId: result.sslCertId,
      sslIssuedAt: result.sslIssuedAt,
      sslExpiresAt: result.sslExpiresAt,
      lastSslError: result.lastSslError,
    };
  }
}
