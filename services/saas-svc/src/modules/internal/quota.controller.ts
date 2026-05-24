import { Body, Controller, Get, HttpException, Param, ParseIntPipe, Post, UseGuards } from "@nestjs/common";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { InternalTokenGuard } from "./internal-token.guard";
import { QuotaCheckDto, QuotaCheckResult } from "./dto";

// POST /internal/quota/check
// bff-edge 在执行"加域名 / 开 WAF / 开 CC"等动作前,先调本端点问能不能做。
@UseGuards(InternalTokenGuard)
@Controller("internal/quota")
export class InternalQuotaController {
  constructor(private subs: SubscriptionsService) {}

  // 完整快照(features/limit/periodEnd 等),供 apps/api 残留 config-compiler 与
  // 未来 bff-edge 一次性拿到所有配额信息。
  @Get("snapshot/:tenantId")
  snapshot(@Param("tenantId", ParseIntPipe) tenantId: number) {
    return this.subs.getQuota(tenantId);
  }

  @Post("check")
  async check(@Body() dto: QuotaCheckDto): Promise<QuotaCheckResult> {
    const quota = await this.subs.getQuota(dto.tenantId, dto.currentDomainCount);

    try {
      if (dto.action === "add_domain") {
        if (dto.currentDomainCount === undefined) {
          return {
            allowed: false,
            reason: "currentDomainCount required for action=add_domain",
            status: 400,
          };
        }
        await this.subs.assertCanAddDomain(dto.tenantId, dto.currentDomainCount);
      } else if (dto.action === "use_feature") {
        if (!dto.feature) {
          return { allowed: false, reason: "feature required for action=use_feature", status: 400 };
        }
        await this.subs.assertFeature(dto.tenantId, dto.feature, dto.featureLabel || dto.feature);
      }
      return { allowed: true, plan: quota.plan, domainLimit: quota.domainLimit };
    } catch (e: any) {
      // assertFeature/assertCanAddDomain 在不通过时抛 HttpException(402)
      const status = e instanceof HttpException ? e.getStatus() : 500;
      const reason = e instanceof HttpException ? e.message : String(e?.message || e);
      return { allowed: false, reason, status, plan: quota.plan, domainLimit: quota.domainLimit };
    }
  }
}
