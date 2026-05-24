import { NotImplementedError } from "../errors";
import type { CreateDomainInput, DomainSummary, EdgeServerId, EdgeUserId } from "../types";

export interface BindCertInput {
  serverId: EdgeServerId;
  certId: number;       // SSLCert.id (来自 SslService.requestAcmeCert)
  http2Enabled?: boolean;  // 默认 true
  listenPort?: number;     // 默认 443
}

export interface BindCertResult {
  sslPolicyId: number;
  serverId: EdgeServerId;
}

// 代理 GoEdge ServerService 的常用方法子集。
export interface DomainsService {
  create(input: CreateDomainInput): Promise<DomainSummary>;
  listByUser(edgeUserId: EdgeUserId): Promise<DomainSummary[]>;
  findById(serverId: EdgeServerId): Promise<DomainSummary | null>;
  remove(serverId: EdgeServerId): Promise<void>;

  /**
   * 绑定证书到 server 的 HTTPS 配置(Phase 3 Step 6.5)。
   *
   * 内部两步:
   *   1) SSLPolicyService.createSSLPolicy({http2Enabled, sslCertsJSON:[{sslCertId, isOn:true}]})
   *      → sslPolicyId
   *   2) ServerService.updateServerHTTPS(serverId, httpsJSON:{
   *        isOn:true, listen:[{protocol:"https", portRange:"443"}],
   *        sslPolicy:{isOn:true, sslPolicyId},
   *        http2Enabled
   *      })
   *
   * 续期场景:每次都 createSSLPolicy(新 id),旧的不清理;saas-svc 记录最新 sslPolicyId。
   */
  bindCert(input: BindCertInput): Promise<BindCertResult>;
}

export class PlaceholderDomainsService implements DomainsService {
  async create(_input: CreateDomainInput): Promise<DomainSummary> {
    throw new NotImplementedError("DomainsService.create");
  }
  async listByUser(_edgeUserId: EdgeUserId): Promise<DomainSummary[]> {
    throw new NotImplementedError("DomainsService.listByUser");
  }
  async findById(_serverId: EdgeServerId): Promise<DomainSummary | null> {
    throw new NotImplementedError("DomainsService.findById");
  }
  async remove(_serverId: EdgeServerId): Promise<void> {
    throw new NotImplementedError("DomainsService.remove");
  }
  async bindCert(_input: BindCertInput): Promise<BindCertResult> {
    throw new NotImplementedError("DomainsService.bindCert");
  }
}
