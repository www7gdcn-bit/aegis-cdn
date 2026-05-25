import * as grpc from "@grpc/grpc-js";
import type { BindCertInput, BindCertResult, DomainsService } from "../../services/domains";
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
    private stub: any,                            // ServerService stub
    private metadata: () => grpc.Metadata,
    private sslPolicyStub?: any,                  // SSLPolicyService stub(Step 6.5 注入,bindCert 用)
  ) {}

  async create(input: CreateDomainInput): Promise<DomainSummary> {
    if (!input.edgeUserId) throw new EdgeApiError("CreateDomainInput.edgeUserId required");
    if (!input.serverNames?.length) throw new EdgeApiError("CreateDomainInput.serverNames required");

    const req = {
      // **不能传 0** — admin 模式下 GoEdge v1.3.9 service_server.go:228 有 bug:
      //   会用 FindUserClusterId(tx, userId=0) 查 WHERE id=0 → 返 0 → 报 invalid。
      // 客户端必须显式传 > 0 才能跳过 admin else if 分支。
      nodeClusterId: input.clusterId ?? 0,
      userId: input.edgeUserId,
      domains: input.serverNames,
      sslCertIds: [] as number[],          // Step 4 不接 SSL
      originAddrs: input.originAddrs || [],
      enableWebsocket: input.enableWebsocket ?? false,
    };

    // ── 总是 console.error 打 gRPC 最终 protobuf payload(原 EDGE_API_DEBUG 门控移除)──
    // 实测线上 NestJS Logger 在容器里被压制 / 缓冲,看不到 controller 层日志,
    // SDK 必须无条件打 stderr,docker logs 才一定能抓到 nodeClusterId 真实值。
    // eslint-disable-next-line no-console
    console.error(`[edge-api-sdk] grpc → ServerService.createBasicHTTPServer FINAL_PAYLOAD=${JSON.stringify(req)} | input.clusterId=${JSON.stringify(input.clusterId)} input.edgeUserId=${input.edgeUserId}`);

    return new Promise<DomainSummary>((resolve, reject) => {
      this.stub.createBasicHTTPServer(req, this.metadata(), (err: grpc.ServiceError | null, res: any) => {
        if (err) {
          // 失败时再打一次完整 payload + grpc code(与上面入口日志成对,便于 grep)
          // eslint-disable-next-line no-console
          console.error(`[edge-api-sdk] createBasicHTTPServer FAIL grpcCode=${err.code} msg=${err.message} | FINAL_PAYLOAD=${JSON.stringify(req)}`);
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

  // Phase 3 Step 6.5 — 把证书绑到 server HTTPS 配置上
  async bindCert(input: BindCertInput): Promise<BindCertResult> {
    if (!this.sslPolicyStub) {
      throw new EdgeApiError("sslPolicyStub not injected — GrpcEdgeApiClient 构造时漏注 SSLPolicyService stub");
    }
    if (!input.serverId) throw new EdgeApiError("BindCertInput.serverId required");
    if (!input.certId) throw new EdgeApiError("BindCertInput.certId required");

    const http2Enabled = input.http2Enabled ?? true;
    const listenPort = String(input.listenPort ?? 443);

    // 1) createSSLPolicy
    // sslCertsJSON 是 bytes,装 SSLCertRef[] 的 JSON:[{sslCertId, isOn}]
    // GoEdge 内部解析 — 字段名按 EdgeCommon model_ssl_cert.proto 的 camelCase 规范
    const sslCertsJSON = Buffer.from(JSON.stringify([
      { sslCertId: input.certId, isOn: true },
    ]), "utf8");

    const sslPolicyId: number = await new Promise((resolve, reject) => {
      this.sslPolicyStub.createSSLPolicy(
        {
          http2Enabled,
          http3Enabled: false,
          minVersion: "TLS 1.2",
          sslCertsJSON,
          hstsJSON: Buffer.alloc(0),
          clientAuthType: 0,
          clientCACertsJSON: Buffer.alloc(0),
          cipherSuites: [],
          cipherSuitesIsOn: false,
          ocspIsOn: false,
        },
        this.metadata(),
        (err: grpc.ServiceError | null, res: any) => {
          if (err) {
            return reject(new EdgeApiError(
              `SSLPolicyService.createSSLPolicy failed: ${err.message}`,
              err.code != null ? String(err.code) : undefined,
              err,
            ));
          }
          const id = Number(res?.sslPolicyId ?? 0);
          if (!id) return reject(new EdgeApiError("createSSLPolicy returned empty sslPolicyId"));
          resolve(id);
        },
      );
    });

    // 2) updateServerHTTPS
    // httpsJSON 是 HTTPSProtocolConfig 的 JSON 序列化,核心字段:
    //   isOn / listen[]:NetworkAddressConfig{protocol,portRange} / sslPolicy:{isOn,sslPolicyId} /
    //   http2Enabled / http3Enabled
    const httpsJSON = Buffer.from(JSON.stringify({
      isOn: true,
      listen: [{ protocol: "https", portRange: listenPort }],
      sslPolicy: { isOn: true, sslPolicyId },
      http2Enabled,
      http3Enabled: false,
    }), "utf8");

    await new Promise<void>((resolve, reject) => {
      this.stub.updateServerHTTPS(
        { serverId: input.serverId, httpsJSON },
        this.metadata(),
        (err: grpc.ServiceError | null) => {
          if (err) {
            return reject(new EdgeApiError(
              `ServerService.updateServerHTTPS failed: ${err.message}`,
              err.code != null ? String(err.code) : undefined,
              err,
            ));
          }
          resolve();
        },
      );
    });

    return { sslPolicyId, serverId: input.serverId };
  }
}
