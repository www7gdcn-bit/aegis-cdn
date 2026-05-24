import { Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Post, UseGuards } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantService } from "../tenant/tenant.service";
import { InternalTokenGuard } from "./internal-token.guard";
import { UserDisableDto, UserProvisionDto } from "./dto";

// /internal/user/* 系列:bff-edge 与 saas-svc 关于 GoEdge user 关联与封禁联动。
// 当前 Phase 2 阶段仅落入口契约;Phase 3 bff-edge 上线后才有真实流量。
@UseGuards(InternalTokenGuard)
@Controller("internal/user")
export class InternalUserController {
  constructor(private prisma: PrismaService, private tenant: TenantService) {}

  // POST /internal/user/provision  — bff-edge 创建 GoEdge user 成功后回写 edgeUserId
  @Post("provision")
  async provision(@Body() dto: UserProvisionDto) {
    return this.tenant.setEdgeUserId(dto.tenantId, { edgeUserId: dto.edgeUserId });
  }

  // POST /internal/user/disable — saas-svc 通知"封禁/欠费",或反向被 bff-edge 通知
  // Phase 2 仅记 status=suspended;Phase 3 由 bff-edge 调 EdgeAPI 关闭 servers
  @Post("disable")
  async disable(@Body() dto: UserDisableDto) {
    return this.prisma.tenant.update({
      where: { id: dto.tenantId },
      data: { status: "suspended" },
      select: { id: true, status: true },
    });
  }
}

// GET /internal/edge-user/:saasUserId — 反查 saas user 对应的 GoEdge user_id
@UseGuards(InternalTokenGuard)
@Controller("internal/edge-user")
export class InternalEdgeUserController {
  constructor(private tenant: TenantService) {}

  @Get(":saasUserId")
  async lookup(@Param("saasUserId", ParseIntPipe) saasUserId: number) {
    const t = await this.tenant.getEdgeUserIdByUserId(saasUserId);
    if (!t) throw new NotFoundException("user/tenant not found");
    return { tenantId: t.id, edgeUserId: t.edgeUserId };
  }
}
