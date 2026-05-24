import * as grpc from "@grpc/grpc-js";
import type { EdgeApiClient, EdgeApiClientConfig } from "../client";
import { EdgeApiError } from "../errors";
import { buildGoEdgeToken } from "./auth";
import { loadProto } from "./proto-loader";
import { GrpcUsersService } from "./services/users";
import { PlaceholderDomainsService } from "../services/domains";
import { PlaceholderSslService } from "../services/ssl";
import { PlaceholderNodesService } from "../services/nodes";
import { PlaceholderIpListsService } from "../services/ip-lists";

/**
 * GrpcEdgeApiClient — 真实接 GoEdge EdgeAPI gRPC 的 client。
 *
 * Phase 3 Step 2 范围:
 *   - users:  GrpcUsersService(create 真实化;其他方法仍 throw NotImplementedError)
 *   - domains/ssl/nodes/ipLists:仍是 Placeholder(下个 Step 替换)
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

  // 未实现的继续走 Placeholder(throw NotImplementedError)
  readonly domains = new PlaceholderDomainsService();
  readonly ssl = new PlaceholderSslService();
  readonly nodes = new PlaceholderNodesService();
  readonly ipLists = new PlaceholderIpListsService();

  private channel: grpc.Client;

  constructor(public readonly config: EdgeApiClientConfig) {
    if (!config.addr) throw new EdgeApiError("EdgeApiClientConfig.addr required");
    if (!config.adminNodeId || !config.adminNodeSecret) {
      throw new EdgeApiError(
        "GrpcEdgeApiClient 需要 adminNodeId + adminNodeSecret;dev 阶段未配置请用 mode:'placeholder'",
      );
    }

    // 加载 UserService(proto-loader 自动 follow imports)
    const userProto = loadProto("service_user.proto") as any;
    const UserServiceCtor = userProto.pb.UserService;

    // 单一 channel 复用(grpc-js 自带连接复用);后续 service 共享
    const stub = new UserServiceCtor(config.addr, grpc.credentials.createInsecure());
    this.channel = stub;
    this.users = new GrpcUsersService(stub, () => this.buildMetadata());
  }

  private buildMetadata(): grpc.Metadata {
    const md = new grpc.Metadata();
    md.set("nodeid", this.config.adminNodeId);
    md.set("token", buildGoEdgeToken(this.config.adminNodeSecret, this.config.adminNodeId, "admin"));
    return md;
  }

  async close(): Promise<void> {
    try { (this.channel as any).close?.(); } catch { /* noop */ }
  }
}
