import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ComplianceService } from "./compliance.service";
import { SubmitKycDto } from "./dto";
import { JwtAuthGuard, AuthUser } from "../../core/common/jwt-auth.guard";
import { CurrentUser } from "../../core/common/current-user.decorator";

// 租户侧:提交 / 查看企业实名(KYC)
@UseGuards(JwtAuthGuard)
@Controller("compliance")
export class ComplianceController {
  constructor(private svc: ComplianceService) {}

  @Get("kyc")
  myKyc(@CurrentUser() u: AuthUser) {
    return this.svc.myKyc(u.tenantId!);
  }

  @Post("kyc")
  submit(@CurrentUser() u: AuthUser, @Body() dto: SubmitKycDto) {
    return this.svc.submitKyc(u.tenantId!, dto);
  }
}
