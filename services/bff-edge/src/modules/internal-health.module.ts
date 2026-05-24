import { Controller, Get, Module, UseGuards } from "@nestjs/common";
import { InternalTokenGuard } from "../core/common/internal-token.guard";
import { EdgeApiClient } from "../core/edge-api/edge-api.client";

// /internal/edge/health — 比 /health 多带 internal token,可暴露更多内部状态。
@UseGuards(InternalTokenGuard)
@Controller("health") // 全局前缀 internal/edge/ 已注入
class InternalHealthController {
  constructor(private edgeApi: EdgeApiClient) {}

  @Get()
  internalHealth() {
    return {
      ok: true,
      service: "bff-edge",
      edgeApi: this.edgeApi.describe(),
      saasSvc: process.env.SAAS_SVC_INTERNAL_URL || null,
      // Phase 3 Step 2+ 这里可以加 sdk ping、saas-svc reachability 等深度检查
    };
  }
}

@Module({ controllers: [InternalHealthController] })
export class InternalHealthModule {}
