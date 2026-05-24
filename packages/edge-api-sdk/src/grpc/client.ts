import * as grpc from "@grpc/grpc-js";
import type { EdgeApiClient, EdgeApiClientConfig } from "../client";
import { EdgeApiError } from "../errors";
import { buildGoEdgeToken } from "./auth";
import { loadProto } from "./proto-loader";
import { GrpcUsersService } from "./services/users";
import { GrpcDomainsService } from "./services/domains";
import { GrpcSslService } from "./services/ssl";
import { PlaceholderNodesService } from "../services/nodes";
import { PlaceholderIpListsService } from "../services/ip-lists";

/**
 * GrpcEdgeApiClient — 真实接 GoEdge EdgeAPI gRPC 的 client。
 *
 * Phase 3 Step 2: users.create
 * Phase 3 Step 4: domains 全套
 * Phase 3 Step 6: ssl(requestAcmeCert/findCertById/listCertsByUser/removeCert)
 */
export class GrpcEdgeApiClient implements EdgeApiClient {
  readonly mode = "grpc" as const;

  readonly users: GrpcUsersService;
  readonly domains: GrpcDomainsService;
  readonly ssl: GrpcSslService;

  // 未实现的继续走 Placeholder(throw NotImplementedError)
  readonly nodes = new PlaceholderNodesService();
  readonly ipLists = new PlaceholderIpListsService();

  private stubs: any[] = [];

  constructor(public readonly config: EdgeApiClientConfig) {
    if (!config.addr) throw new EdgeApiError("EdgeApiClientConfig.addr required");
    if (!config.adminNodeId || !config.adminNodeSecret) {
      throw new EdgeApiError(
        "GrpcEdgeApiClient 需要 adminNodeId + adminNodeSecret;dev 阶段未配置请用 mode:'placeholder'",
      );
    }

    const creds = grpc.credentials.createInsecure();

    const userProto = loadProto("service_user.proto") as any;
    const userStub = new userProto.pb.UserService(config.addr, creds);
    this.users = new GrpcUsersService(userStub, () => this.buildMetadata());
    this.stubs.push(userStub);

    const serverProto = loadProto("service_server.proto") as any;
    const serverStub = new serverProto.pb.ServerService(config.addr, creds);
    this.domains = new GrpcDomainsService(serverStub, () => this.buildMetadata());
    this.stubs.push(serverStub);

    const acmeProto = loadProto("service_acme_task.proto") as any;
    const acmeStub = new acmeProto.pb.ACMETaskService(config.addr, creds);
    const certProto = loadProto("service_ssl_cert.proto") as any;
    const certStub = new certProto.pb.SSLCertService(config.addr, creds);
    this.ssl = new GrpcSslService(acmeStub, certStub, () => this.buildMetadata());
    this.stubs.push(acmeStub, certStub);
  }

  private buildMetadata(): grpc.Metadata {
    const md = new grpc.Metadata();
    md.set("nodeid", this.config.adminNodeId);
    md.set("token", buildGoEdgeToken(this.config.adminNodeSecret, this.config.adminNodeId, "admin"));
    return md;
  }

  async close(): Promise<void> {
    for (const s of this.stubs) {
      try { s?.close?.(); } catch { /* noop */ }
    }
  }
}
