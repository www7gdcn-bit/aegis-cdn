import { PlaceholderUsersService, type UsersService } from "./services/users";
import { PlaceholderDomainsService, type DomainsService } from "./services/domains";
import { PlaceholderSslService, type SslService } from "./services/ssl";
import { PlaceholderNodesService, type NodesService } from "./services/nodes";
import { PlaceholderIpListsService, type IpListsService } from "./services/ip-lists";

export interface EdgeApiClientConfig {
  addr: string;             // host:port 例 "edgeapi:8003"
  adminNodeId: string;      // EdgeAPI setup 返回的 adminNodeId
  adminNodeSecret: string;
  // Phase 3 Step 2+ 加:
  //   tls?: { caPath: string };
  //   timeoutMs?: number;
  //   reconnect?: boolean;
}

export interface EdgeApiClient {
  readonly config: EdgeApiClientConfig;
  readonly mode: "placeholder" | "grpc";  // 当前只能是 placeholder
  readonly users: UsersService;
  readonly domains: DomainsService;
  readonly ssl: SslService;
  readonly nodes: NodesService;
  readonly ipLists: IpListsService;
  close(): Promise<void>;
}

/**
 * 创建 SDK client 实例。
 *
 * Phase 3 Step 1:
 *   - 返回 PlaceholderClient,所有 service 方法 throw NotImplementedError
 *   - bff-edge 启动不会因为缺真实 EdgeAPI 而失败(便于离线 dev)
 *
 * Phase 3 Step 2+:
 *   - 根据 config.addr 建 @grpc/grpc-js channel
 *   - 加 metadata interceptor 自动注入 nodeid/secret
 *   - 返回 GrpcClient 实现
 */
export function createEdgeApiClient(config: EdgeApiClientConfig): EdgeApiClient {
  return new PlaceholderClient(config);
}

class PlaceholderClient implements EdgeApiClient {
  readonly mode = "placeholder" as const;
  readonly users = new PlaceholderUsersService();
  readonly domains = new PlaceholderDomainsService();
  readonly ssl = new PlaceholderSslService();
  readonly nodes = new PlaceholderNodesService();
  readonly ipLists = new PlaceholderIpListsService();

  constructor(public readonly config: EdgeApiClientConfig) {}

  async close(): Promise<void> {
    // no-op
  }
}
