import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from "@nestjs/common";
import { EdgeProvisionService } from "./edge-provision.service";
import { JwtAuthGuard } from "../../core/common/jwt-auth.guard";
import { RolesGuard } from "../../core/common/roles.guard";
import { Roles } from "../../core/common/roles.decorator";
import { PrismaService } from "../../core/prisma/prisma.service";

// 管理侧:平台运营查看与干预所有 Tenant 的 provision 状态。
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "operator")
@Controller("admin/edge-provision")
export class AdminEdgeProvisionController {
  constructor(private svc: EdgeProvisionService, private prisma: PrismaService) {}

  // 列出待处理 / 失败的(用于 dashboard)
  @Get()
  async list(@Query("status") status?: string) {
    const where = status ? { status } : {};
    return this.prisma.pendingEdgeProvision.findMany({
      where,
      orderBy: { id: "desc" },
      take: 200,
      include: { tenant: { select: { id: true, name: true, edgeUserId: true } } },
    });
  }

  @Get(":tenantId")
  status(@Param("tenantId", ParseIntPipe) tenantId: number) {
    return this.svc.getStatus(tenantId);
  }

  // 手动 retry — 重置 status=pending,立即触发一次尝试
  @Post(":tenantId/retry")
  retry(@Param("tenantId", ParseIntPipe) tenantId: number) {
    return this.svc.manualRetry(tenantId).then(() => this.svc.getStatus(tenantId));
  }
}
