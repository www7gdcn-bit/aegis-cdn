import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { KycService } from "./kyc.service";
import { SubmitKycDto } from "./dto";
import { JwtAuthGuard, AuthUser } from "../../core/common/jwt-auth.guard";
import { CurrentUser } from "../../core/common/current-user.decorator";

// 租户侧:提交 / 查看企业实名(KYC)
@UseGuards(JwtAuthGuard)
@Controller("kyc")
export class KycController {
  constructor(private svc: KycService) {}

  @Get("me")
  mine(@CurrentUser() u: AuthUser) {
    return this.svc.mine(u.tenantId!);
  }

  @Post()
  submit(@CurrentUser() u: AuthUser, @Body() dto: SubmitKycDto) {
    return this.svc.submit(u.tenantId!, dto);
  }
}
