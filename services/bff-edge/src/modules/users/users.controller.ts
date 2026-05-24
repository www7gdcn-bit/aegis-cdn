import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from "@nestjs/common";
import { InternalTokenGuard } from "../../core/common/internal-token.guard";
import { EdgeApiClient } from "../../core/edge-api/edge-api.client";

// /internal/edge/users — 给 saas-svc 调,把 SaaS Tenant 同步成 GoEdge user。
@UseGuards(InternalTokenGuard)
@Controller("users") // 全局前缀 internal/edge/ 已注入
export class UsersController {
  constructor(private edgeApi: EdgeApiClient) {}

  /**
   * 创建 GoEdge user(Phase 3 Step 2 真实实现)。
   * Phase 3 Step 1:占位,返回 todo。
   *
   * 调用方:saas-svc /api/v1/saas/auth/register 异步调本端点 →
   *         成功后 saas-svc 写 Tenant.edgeUserId。
   */
  @Post()
  async create(@Body() _body: { tenantId: number; username: string; email?: string; remark?: string }) {
    // TODO Phase 3 Step 2: this.edgeApi.users.create({...})
    return { todo: "POST /internal/edge/users — Phase 3 Step 2 真实接 EdgeAPI gRPC UserService.CreateUser" };
  }

  @Get(":edgeUserId")
  async findById(@Param("edgeUserId", ParseIntPipe) _edgeUserId: number) {
    return { todo: "GET /internal/edge/users/:edgeUserId — UserService.FindEnabledUser" };
  }

  @Post(":edgeUserId/disable")
  async disable(@Param("edgeUserId", ParseIntPipe) _edgeUserId: number) {
    return { todo: "POST /internal/edge/users/:edgeUserId/disable" };
  }

  @Post(":edgeUserId/enable")
  async enable(@Param("edgeUserId", ParseIntPipe) _edgeUserId: number) {
    return { todo: "POST /internal/edge/users/:edgeUserId/enable" };
  }
}
