import { NotImplementedError } from "../errors";
import type { EdgeCertId, EdgeUserId, UploadCertInput } from "../types";

// 代理 GoEdge SSLCertService / SSLPolicyService / ACMETaskService 的常用方法。
export interface SslService {
  uploadCert(input: UploadCertInput): Promise<{ certId: EdgeCertId }>;
  listCertsByUser(userId: EdgeUserId): Promise<Array<{ certId: EdgeCertId; serverName: string }>>;
  removeCert(certId: EdgeCertId): Promise<void>;
  requestAcmeCert(input: { userId: EdgeUserId; serverName: string; dnsProviderId?: number }): Promise<{ taskId: number }>;
}

export class PlaceholderSslService implements SslService {
  async uploadCert(_input: UploadCertInput): Promise<{ certId: EdgeCertId }> {
    throw new NotImplementedError("SslService.uploadCert");
  }
  async listCertsByUser(_userId: EdgeUserId): Promise<Array<{ certId: EdgeCertId; serverName: string }>> {
    throw new NotImplementedError("SslService.listCertsByUser");
  }
  async removeCert(_certId: EdgeCertId): Promise<void> {
    throw new NotImplementedError("SslService.removeCert");
  }
  async requestAcmeCert(_input: { userId: EdgeUserId; serverName: string; dnsProviderId?: number }): Promise<{ taskId: number }> {
    throw new NotImplementedError("SslService.requestAcmeCert");
  }
}
