import { Injectable, Logger } from "@nestjs/common";
import { createEdgeApiClient, type EdgeApiClient as SdkClient } from "@aegis/edge-api-sdk";

/**
 * EdgeApiClient — bff-edge 内部封装,代理 @aegis/edge-api-sdk 的 client 实例。
 *
 * Phase 3 Step 1 行为:
 *   - SDK 是 placeholder(不真接 gRPC),所有方法 throw NotImplementedError
 *   - 本类负责持有单例 + 暴露 describe() 给 health 检查看
 *
 * Phase 3 Step 2+ 行为:
 *   - SDK 内会建真实 gRPC connection 到 EDGE_API_GRPC_ADDR
 *   - 用 EDGE_API_ADMIN_NODE_ID / SECRET 作为 metadata 鉴权
 *   - 本类的方法签名不变(SDK 屏蔽 gRPC 细节)
 */
@Injectable()
export class EdgeApiClient {
  private readonly logger = new Logger(EdgeApiClient.name);
  private readonly sdk: SdkClient;

  constructor() {
    this.sdk = createEdgeApiClient({
      addr: process.env.EDGE_API_GRPC_ADDR || "localhost:8003",
      adminNodeId: process.env.EDGE_API_ADMIN_NODE_ID || "",
      adminNodeSecret: process.env.EDGE_API_ADMIN_NODE_SECRET || "",
    });
    this.logger.log(`EdgeApiClient configured for ${this.sdk.config.addr} (placeholder mode)`);
  }

  // 给 health 与运维诊断用 — 不暴露 secret
  describe() {
    return {
      addr: this.sdk.config.addr,
      mode: this.sdk.mode,                     // "placeholder" | "grpc"
      adminConfigured: !!this.sdk.config.adminNodeId,
    };
  }

  // 后续 Phase 真接 gRPC 后,在此暴露 5 个 service group 的代理:
  //   users()    -> sdk.users
  //   domains()  -> sdk.domains
  //   ssl()      -> sdk.ssl
  //   nodes()    -> sdk.nodes
  //   ipLists()  -> sdk.ipLists  (用于 blocks)
  // Phase 3 Step 1 不暴露,modules/* 拿到 EdgeApiClient 后只能调 describe()。
  get users()   { return this.sdk.users; }
  get domains() { return this.sdk.domains; }
  get ssl()     { return this.sdk.ssl; }
  get nodes()   { return this.sdk.nodes; }
  get ipLists() { return this.sdk.ipLists; }
}
