import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards } from "@nestjs/common";
import { ComplianceService } from "./compliance.service";
import { CreateBlockDto, ReviewDto } from "./dto";
import { JwtAuthGuard, AuthUser } from "../../core/common/jwt-auth.guard";
import { RolesGuard } from "../../core/common/roles.guard";
import { Roles } from "../../core/common/roles.decorator";
import { CurrentUser } from "../../core/common/current-user.decorator";

// 平台管理侧:接入审核 / KYC 审核 / 全局封禁。仅 admin/operator。
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "operator")
@Controller("admin")
export class AdminComplianceController {
  constructor(private svc: ComplianceService) {}

  @Get("reviews")
  reviews() {
    return this.svc.pendingReviews();
  }

  @Post("reviews/:id")
  review(@Param("id", ParseIntPipe) id: number, @Body() dto: ReviewDto) {
    return this.svc.reviewDomain(id, dto.action);
  }

  @Get("kyc")
  kyc() {
    return this.svc.pendingKyc();
  }

  @Post("kyc/:tenantId")
  reviewKyc(@Param("tenantId", ParseIntPipe) tenantId: number, @Body() dto: ReviewDto) {
    return this.svc.reviewKyc(tenantId, dto.action);
  }

  @Get("blocks")
  blocks() {
    return this.svc.listBlocks();
  }

  @Post("blocks")
  addBlock(@CurrentUser() u: AuthUser, @Body() dto: CreateBlockDto) {
    return this.svc.addBlock(dto, u.id);
  }

  @Delete("blocks/:id")
  removeBlock(@Param("id", ParseIntPipe) id: number) {
    return this.svc.removeBlock(id);
  }
}
