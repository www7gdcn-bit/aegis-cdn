import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from "@nestjs/common";
import { KycService } from "./kyc.service";
import { ReviewKycDto } from "./dto";
import { JwtAuthGuard } from "../../core/common/jwt-auth.guard";
import { RolesGuard } from "../../core/common/roles.guard";
import { Roles } from "../../core/common/roles.decorator";

// 平台管理侧:KYC 审批。仅 admin/operator。
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "operator")
@Controller("admin/kyc")
export class AdminKycController {
  constructor(private svc: KycService) {}

  @Get()
  pending() {
    return this.svc.pending();
  }

  @Post(":tenantId")
  review(@Param("tenantId", ParseIntPipe) tenantId: number, @Body() dto: ReviewKycDto) {
    return this.svc.review(tenantId, dto.action);
  }
}
