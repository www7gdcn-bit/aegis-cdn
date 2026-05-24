import { NotImplementedError } from "../errors";
import type { EdgeCertId, EdgeUserId, UploadCertInput } from "../types";

// 代理 GoEdge SSLCertService / ACMETaskService 的常用方法。
//
// requestAcmeCert 一把搞定:createACMETask + runACMETask(同步阻塞,可能 30s-2min)
// authType = "http"(默认,HTTP-01 挑战,需要域名 CNAME 已生效到边缘节点)
// authType = "dns"(DNS-01,需要 dnsProviderId 提前配置)

export type AcmeAuthType = "http" | "dns";

export interface RequestAcmeCertInput {
  edgeUserId: EdgeUserId;
  acmeUserId: number;          // 平台共用的 ACME User(管理员事先在 GoEdge 注册)
  domains: string[];           // 申请 SAN 域名;LE 同任务可多域名(<= 100 SAN)
  authType?: AcmeAuthType;     // 默认 'http'
  dnsProviderId?: number;      // authType=dns 时必填
  autoRenew?: boolean;         // 默认 true(GoEdge 自动续期)
}

export interface RequestAcmeCertResult {
  acmeTaskId: number;
  isOk: boolean;
  sslCertId?: EdgeCertId;      // isOk=true 时填
  error?: string;              // isOk=false 时 LE 返的错(rate limit、dns、等)
}

export interface CertSummary {
  certId: EdgeCertId;
  name?: string;
  serverNames?: string[];      // 证书 SAN
  timeBeginAt?: number;        // unix sec
  timeEndAt?: number;          // unix sec
  isCA?: boolean;
  isAvailable?: boolean;
}

export interface SslService {
  /** ACME 自动签发(创建任务 → 同步 run,阻塞返回最终结果) */
  requestAcmeCert(input: RequestAcmeCertInput): Promise<RequestAcmeCertResult>;

  /** 上传已有证书(用户自带证书场景);Step 6 占位,未实现 */
  uploadCert(input: UploadCertInput): Promise<{ certId: EdgeCertId }>;

  findCertById(certId: EdgeCertId): Promise<CertSummary | null>;
  listCertsByUser(userId: EdgeUserId): Promise<CertSummary[]>;
  removeCert(certId: EdgeCertId): Promise<void>;
}

export class PlaceholderSslService implements SslService {
  async requestAcmeCert(_input: RequestAcmeCertInput): Promise<RequestAcmeCertResult> {
    throw new NotImplementedError("SslService.requestAcmeCert");
  }
  async uploadCert(_input: UploadCertInput): Promise<{ certId: EdgeCertId }> {
    throw new NotImplementedError("SslService.uploadCert");
  }
  async findCertById(_certId: EdgeCertId): Promise<CertSummary | null> {
    throw new NotImplementedError("SslService.findCertById");
  }
  async listCertsByUser(_userId: EdgeUserId): Promise<CertSummary[]> {
    throw new NotImplementedError("SslService.listCertsByUser");
  }
  async removeCert(_certId: EdgeCertId): Promise<void> {
    throw new NotImplementedError("SslService.removeCert");
  }
}
