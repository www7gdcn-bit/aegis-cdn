import { Controller, Get, Module, UseGuards } from "@nestjs/common";
import { InternalTokenGuard } from "../core/common/internal-token.guard";
import { EdgeApiClient } from "../core/edge-api/edge-api.client";

/**
 * /internal/edge/status — 内部深度健康状态(带 internal token)。
 *
 * 路径用 "status" 而非 "health" 是为了避开 main.ts 全局前缀 exclude
 * 把所有 "health" controller 排出 internal/edge 前缀的副作用。
 * 公开探活仍是 GET /health(由 core/health.controller.ts 提供)。
 */
@UseGuards(InternalTokenGuard)
@Controller("status") // 全局前缀 internal/edge/ 已注入 → /internal/edge/status
class InternalStatusController {
  constructor(private edgeApi: EdgeApiClient) {}

  @Get()
  internalStatus() {
    return {
      ok: true,
      service: "bff-edge",
      edgeApi: this.edgeApi.describe(),
      saasSvc: process.env.SAAS_SVC_INTERNAL_URL || null,
    };
  }
}

@Module({ controllers: [InternalStatusController] })
export class InternalHealthModule {}
