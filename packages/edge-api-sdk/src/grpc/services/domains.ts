import * as grpc from "@grpc/grpc-js";
import type { DomainsService } from "../../services/domains";
import type { CreateDomainInput, DomainSummary, EdgeServerId, EdgeUserId } from "../../types";
import { EdgeApiError } from "../../errors";

// GoEdge ServerService 子集实现。
// proto: upstream/EdgeCommon/pkg/rpc/protos/service_server.proto
//   rpc createBasicHTTPServer(CreateBasicHTTPServerRequest) returns (CreateBasicHTTPServerResponse);
//     入参: nodeClusterId, userId, domains[], sslCertIds[], originAddrs[], enableWebsocket
//     出参: serverId
//   rpc findAllUserServers(FindAllUserServersRequest) returns (FindAllUserServersResponse);
//     入参: userId
//     出参: servers[] (简要 Server)
//   rpc findEnabledUserServerBasic(FindEnabledUserServerBasicRequest) returns (...);
//   rpc deleteServer(DeleteServerRequest) returns (RPCSuccess);
//
// 选择 createBasicHTTPServer 而非完整 createServer 的原因:
// 前者一次建好 server+web+reverseProxy,适合 SaaS"添加域名"的典型流程,
// 而 createServer 需要预先创建 HTTPWeb 与 ReverseProxy。

export class GrpcDomainsService implements DomainsService {
  constructor(
    private stub: any,                            // grpc-js Client(由 GrpcEdgeApiClient 注入)
    private metadata: () => grpc.Metadata,
  ) {}

  async create(input: CreateDomainInput): Promise<DomainSummary> {
    if (!input.edgeUserId) throw new EdgeApiError("CreateDomainInput.edgeUserId required");
    if (!input.serverNames?.length) throw new EdgeApiError("CreateDomainInput.serverNames required");

    const req = {
      nodeClusterId: input.clusterId ?? 0, // 0 = GoEdge 默认集群
      userId: input.edgeUserId,
      domains: input.serverNames,
      sslCertIds: [] as number[],          // Step 4 不接 SSL
      originAddrs: input.originAddrs || [],
      enableWebsocket: input.enableWebsocket ?? false,
    };

    return new Promise<DomainSummary>((resolve, reject) => {
      this.stub.createBasicHTTPServer(req, this.metadata(), (err: grpc.ServiceError | null, res: any) => {
        if (err) {
          return reject(new EdgeApiError(
            `ServerService.createBasicHTTPServer failed: ${err.message}`,
            err.code != null ? String(err.code) : undefined,
            err,
          ));
        }
        const id = Number(res?.serverId ?? 0);
        if (!id) return reject(new EdgeApiError("createBasicHTTPServer returned empty serverId"));
        resolve({
          serverId: id,
          name: input.serverNames[0],
          serverNames: input.serverNames,
          isOn: true,
          clusterId: input.clusterId,
        });
      });
    });
  }

  async listByUser(edgeUserId: EdgeUserId): Promise<DomainSummary[]> {
    return new Promise<DomainSummary[]>((resolve, reject) => {
      this.stub.findAllUserServers({ userId: edgeUserId }, this.metadata(), (err: grpc.ServiceError | null, res: any) => {
        if (err) {
          return reject(new EdgeApiError(
            `ServerService.findAllUserServers failed: ${err.message}`,
            err.code != null ? String(err.code) : undefined,
            err,
          ));
        }
        const servers = (res?.servers || []) as any[];
        resolve(servers.map((s) => ({
          serverId: Number(s.id),
          name: String(s.name || ""),
          isOn: !!s.isOn,
        })));
      });
    });
  }

  async findById(serverId: EdgeServerId): Promise<DomainSummary | null> {
    return new Promise<DomainSummary | null>((resolve, reject) => {
      this.stub.findEnabledUserServerBasic({ serverId }, this.metadata(), (err: grpc.ServiceError | null, res: any) => {
        if (err) {
          // 5 NOT_FOUND → null
          if (err.code === grpc.status.NOT_FOUND) return resolve(null);
          return reject(new EdgeApiError(
            `ServerService.findEnabledUserServerBasic failed: ${err.message}`,
            err.code != null ? String(err.code) : undefined,
            err,
          ));
        }
        const s = res?.server;
        if (!s) return resolve(null);
        resolve({
          serverId: Number(s.id),
          name: String(s.name || ""),
          isOn: !!s.isOn,
        });
      });
    });
  }

  async remove(serverId: EdgeServerId): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.stub.deleteServer({ serverId }, this.metadata(), (err: grpc.ServiceError | null) => {
        if (err) {
          return reject(new EdgeApiError(
            `ServerService.deleteServer failed: ${err.message}`,
            err.code != null ? String(err.code) : undefined,
            err,
          ));
        }
        resolve();
      });
    });
  }
}
