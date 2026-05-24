import { PlaceholderUsersService, type UsersService } from "./services/users";
import { PlaceholderDomainsService, type DomainsService } from "./services/domains";
import { PlaceholderSslService, type SslService } from "./services/ssl";
import { PlaceholderNodesService, type NodesService } from "./services/nodes";
import { PlaceholderIpListsService, type IpListsService } from "./services/ip-lists";

export type EdgeApiMode = "placeholder" | "grpc";

export interface EdgeApiClientConfig {
  addr: string;             // host:port 例 "edgeapi:8003"
  adminNodeId: string;      // EdgeAPI setup 返回的 adminNodeId
  adminNodeSecret: string;
  /**
   * 强制选择 client 实现:
   *   - "placeholder"(默认):所有方法 throw NotImplementedError,无需 admin 凭证
   *   - "grpc":真接 @grpc/grpc-js;需要 adminNodeId/Secret 与可达的 addr
   * 不传时,若 adminNodeId+Secret 都给齐自动用 "grpc",否则回落 "placeholder"。
   */
  mode?: EdgeApiMode;
  // Phase 3 Step 3+ 加:
  //   tls?: { caPath: string };
  //   timeoutMs?: number;
  //   reconnect?: boolean;
}

export interface EdgeApiClient {
  readonly config: EdgeApiClientConfig;
  readonly mode: EdgeApiMode;
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
 * mode 选择优先级:config.mode 显式指定 > 凭证完整自动 grpc > placeholder。
 *
 * grpc 实现的代码懒加载(require),避免 placeholder 用户被迫装 grpc 原生模块。
 */
export function createEdgeApiClient(config: EdgeApiClientConfig): EdgeApiClient {
  const mode: EdgeApiMode =
    config.mode ??
    (config.adminNodeId && config.adminNodeSecret ? "grpc" : "placeholder");

  if (mode === "grpc") {
    // 懒加载 — placeholder 用户避免装 grpc 原生包
    const { GrpcEdgeApiClient } = require("./grpc/client");
    return new GrpcEdgeApiClient(config);
  }
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
