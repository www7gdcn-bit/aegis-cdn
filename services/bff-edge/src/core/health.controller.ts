import { Controller, Get } from "@nestjs/common";
import { EdgeApiClient } from "./edge-api/edge-api.client";

// 公开健康检查 — k8s readiness/liveness 探测用,无需鉴权。
@Controller("health")
export class HealthController {
  constructor(private edgeApi: EdgeApiClient) {}

  @Get()
  health() {
    return {
      ok: true,
      service: "bff-edge",
      edgeApi: this.edgeApi.describe(), // placeholder client 状态
    };
  }
}
