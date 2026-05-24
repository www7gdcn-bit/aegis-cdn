// @aegis/edge-api-sdk — Phase 3 Step 1 骨架
//
// 封装 GoEdge EdgeAPI gRPC 客户端,供 services/bff-edge 调用。
// Phase 3 Step 1:placeholder 实现,所有方法 throw NotImplementedError。
// Phase 3 Step 2+:接 @grpc/grpc-js,proto 由 upstream/EdgeCommon/pkg/rpc/protos/ 自动生成。

export * from "./types";
export * from "./errors";
export { createEdgeApiClient } from "./client";
export type { EdgeApiClient, EdgeApiClientConfig } from "./client";
export type { UsersService } from "./services/users";
export type { DomainsService } from "./services/domains";
export type { SslService } from "./services/ssl";
export type { NodesService } from "./services/nodes";
export type { IpListsService } from "./services/ip-lists";
