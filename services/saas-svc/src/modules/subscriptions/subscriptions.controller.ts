import { Controller, Get, UseGuards } from "@nestjs/common";
import { SubscriptionsService } from "./subscriptions.service";
import { JwtAuthGuard, AuthUser } from "../../core/common/jwt-auth.guard";
import { CurrentUser } from "../../core/common/current-user.decorator";

@UseGuards(JwtAuthGuard)
@Controller("subscriptions")
export class SubscriptionsController {
  constructor(private subs: SubscriptionsService) {}

  @Get("me")
  async me(@CurrentUser() u: AuthUser) {
    return this.subs.getOrCreate(u.tenantId!);
  }

  // usedDomains 在 saas-svc 侧返回 null;前端应再调 bff-edge 取真实计数后合并展示。
  @Get("me/quota")
  async quota(@CurrentUser() u: AuthUser) {
    return this.subs.getQuota(u.tenantId!);
  }
}
