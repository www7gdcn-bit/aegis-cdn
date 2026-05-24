import * as grpc from "@grpc/grpc-js";
import type { EdgeApiClient, EdgeApiClientConfig } from "../client";
import { EdgeApiError } from "../errors";
import { buildGoEdgeToken } from "./auth";
import { loadProto } from "./proto-loader";
import { GrpcUsersService } from "./services/users";
import { GrpcDomainsService } from "./services/domains";
import { PlaceholderSslService } from "../services/ssl";
import { PlaceholderNodesService } from "../services/nodes";
import { PlaceholderIpListsService } from "../services/ip-lists";

/**
 * GrpcEdgeApiClient — 真实接 GoEdge EdgeAPI gRPC 的 client。
 *
 * Phase 3 Step 2:users.create 真实化
 * Phase 3 Step 4:domains 真实化(create/listByUser/findById/remove)
 *
 * 每次 RPC 调用会:
 *   1. 用 buildGoEdgeToken(secret, nodeId, "admin") 生成新 token(含 timestamp)
 *   2. 注入 metadata { nodeid, token }
 *   3. 走默认 insecure 信道(EdgeAPI 默认非 TLS;生产 TLS 需上游配)
 */
export class GrpcEdgeApiClient implements EdgeApiClient {
  readonly mode = "grpc" as const;

  // 真实 service:
  readonly users: GrpcUsersService;
  readonly domains: GrpcDomainsService;

  // 未实现的继续走 Placeholder(throw NotImplementedError)
  readonly ssl = new PlaceholderSslService();
  readonly nodes = new PlaceholderNodesService();
  readonly ipLists = new PlaceholderIpListsService();

  private userStub: any;
  private serverStub: any;

  constructor(public readonly config: EdgeApiClientConfig) {
    if (!config.addr) throw new EdgeApiError("EdgeApiClientConfig.addr required");
    if (!config.adminNodeId || !config.adminNodeSecret) {
      throw new EdgeApiError(
        "GrpcEdgeApiClient 需要 adminNodeId + adminNodeSecret;dev 阶段未配置请用 mode:'placeholder'",
      );
    }

    const creds = grpc.credentials.createInsecure();

    // 加载并实例化各 service stub。grpc-js 在底层维护一个共享的 channel 池,
    // 多个 service 用同 addr+creds 创 stub 时自动复用 TCP/HTTP2 连接。
    const userProto = loadProto("service_user.proto") as any;
    this.userStub = new userProto.pb.UserService(config.addr, creds);
    this.users = new GrpcUsersService(this.userStub, () => this.buildMetadata());

    const serverProto = loadProto("service_server.proto") as any;
    this.serverStub = new serverProto.pb.ServerService(config.addr, creds);
    this.domains = new GrpcDomainsService(this.serverStub, () => this.buildMetadata());
  }

  private buildMetadata(): grpc.Metadata {
    const md = new grpc.Metadata();
    md.set("nodeid", this.config.adminNodeId);
    md.set("token", buildGoEdgeToken(this.config.adminNodeSecret, this.config.adminNodeId, "admin"));
    return md;
  }

  async close(): Promise<void> {
    try { (this.userStub as any).close?.(); } catch { /* noop */ }
    try { (this.serverStub as any).close?.(); } catch { /* noop */ }
  }
}
