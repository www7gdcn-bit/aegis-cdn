import * as grpc from "@grpc/grpc-js";
import type { EdgeApiClient, EdgeApiClientConfig } from "../client";
import { EdgeApiError } from "../errors";
import { buildGoEdgeToken } from "./auth";
import { loadProto } from "./proto-loader";
import { GrpcUsersService } from "./services/users";
import { GrpcDomainsService } from "./services/domains";
import { GrpcSslService } from "./services/ssl";
import { GrpcIpListsService } from "./services/ip-lists";
import { PlaceholderNodesService } from "../services/nodes";

/**
 * GrpcEdgeApiClient — 真实接 GoEdge EdgeAPI gRPC 的 client。
 *
 * Phase 3 Step 2: users.create
 * Phase 3 Step 4: domains 全套
 * Phase 3 Step 6: ssl(requestAcmeCert/findCertById/listCertsByUser/removeCert)
 * Phase 3 Step 6.5: domains.bindCert(createSSLPolicy + updateServerHTTPS)
 * Phase 3 Step 7: ipLists(addToBlocklist/removeFromBlocklist/listBlocklistItems/createList)
 */
export class GrpcEdgeApiClient implements EdgeApiClient {
  readonly mode = "grpc" as const;

  readonly users: GrpcUsersService;
  readonly domains: GrpcDomainsService;
  readonly ssl: GrpcSslService;
  readonly ipLists: GrpcIpListsService;

  // 未实现的继续走 Placeholder(throw NotImplementedError)
  readonly nodes = new PlaceholderNodesService();

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
    const sslPolicyProto = loadProto("service_ssl_policy.proto") as any;
    const sslPolicyStub = new sslPolicyProto.pb.SSLPolicyService(config.addr, creds);
    this.domains = new GrpcDomainsService(serverStub, () => this.buildMetadata(), sslPolicyStub);
    this.stubs.push(serverStub, sslPolicyStub);

    const acmeProto = loadProto("service_acme_task.proto") as any;
    const acmeStub = new acmeProto.pb.ACMETaskService(config.addr, creds);
    const certProto = loadProto("service_ssl_cert.proto") as any;
    const certStub = new certProto.pb.SSLCertService(config.addr, creds);
    this.ssl = new GrpcSslService(acmeStub, certStub, () => this.buildMetadata());
    this.stubs.push(acmeStub, certStub);

    const ipListProto = loadProto("service_ip_list.proto") as any;
    const ipListStub = new ipListProto.pb.IPListService(config.addr, creds);
    const ipItemProto = loadProto("service_ip_item.proto") as any;
    const ipItemStub = new ipItemProto.pb.IPItemService(config.addr, creds);
    this.ipLists = new GrpcIpListsService(ipListStub, ipItemStub, () => this.buildMetadata());
    this.stubs.push(ipListStub, ipItemStub);
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
