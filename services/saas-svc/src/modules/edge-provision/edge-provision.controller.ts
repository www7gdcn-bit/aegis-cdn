import { Controller, Get, UseGuards } from "@nestjs/common";
import { EdgeProvisionService } from "./edge-provision.service";
import { JwtAuthGuard, AuthUser } from "../../core/common/jwt-auth.guard";
import { CurrentUser } from "../../core/common/current-user.decorator";

// 用户视角:GET /api/v1/saas/edge-provision/me — 查自己 Tenant 的 GoEdge 绑定状态
@UseGuards(JwtAuthGuard)
@Controller("edge-provision")
export class EdgeProvisionController {
  constructor(private svc: EdgeProvisionService) {}

  @Get("me")
  me(@CurrentUser() u: AuthUser) {
    return this.svc.getStatus(u.tenantId!);
  }
}
