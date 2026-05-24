import { Injectable, Logger } from "@nestjs/common";
import {
  createEdgeApiClient,
  type EdgeApiClient as SdkClient,
  type EdgeApiMode,
} from "@aegis/edge-api-sdk";

/**
 * EdgeApiClient — bff-edge 内部封装,代理 @aegis/edge-api-sdk 的 client 实例。
 *
 * Mode 选择(EDGE_API_MODE 环境变量;默认 "placeholder"):
 *   - placeholder: 所有方法 throw NotImplementedError(dev 无 EdgeAPI 时可用)
 *   - grpc:        真接 GoEdge EdgeAPI gRPC,需要 EDGE_API_ADMIN_NODE_ID + SECRET
 *
 * Phase 3 Step 2 起:UsersService.create 在 grpc 模式下真实可调;
 * 其他方法仍 throw NotImplementedError(下个 Step 替换)。
 */
@Injectable()
export class EdgeApiClient {
  private readonly logger = new Logger(EdgeApiClient.name);
  private readonly sdk: SdkClient;

  constructor() {
    const envMode = (process.env.EDGE_API_MODE || "").toLowerCase() as EdgeApiMode | "";
    const mode: EdgeApiMode | undefined =
      envMode === "grpc" || envMode === "placeholder" ? envMode : undefined;

    this.sdk = createEdgeApiClient({
      addr: process.env.EDGE_API_GRPC_ADDR || "localhost:8003",
      adminNodeId: process.env.EDGE_API_ADMIN_NODE_ID || "",
      adminNodeSecret: process.env.EDGE_API_ADMIN_NODE_SECRET || "",
      mode,
    });
    this.logger.log(
      `EdgeApiClient mode=${this.sdk.mode} addr=${this.sdk.config.addr} adminConfigured=${!!this.sdk.config.adminNodeId}`,
    );
  }

  // 给 health 与运维诊断用 — 不暴露 secret
  describe() {
    return {
      addr: this.sdk.config.addr,
      mode: this.sdk.mode,
      adminConfigured: !!this.sdk.config.adminNodeId,
    };
  }

  get users()   { return this.sdk.users; }
  get domains() { return this.sdk.domains; }
  get ssl()     { return this.sdk.ssl; }
  get nodes()   { return this.sdk.nodes; }
  get ipLists() { return this.sdk.ipLists; }
}
