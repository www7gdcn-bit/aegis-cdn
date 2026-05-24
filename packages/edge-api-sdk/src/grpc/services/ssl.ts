import * as grpc from "@grpc/grpc-js";
import type { CertSummary, RequestAcmeCertInput, RequestAcmeCertResult, SslService } from "../../services/ssl";
import type { EdgeCertId, EdgeUserId, UploadCertInput } from "../../types";
import { EdgeApiError, NotImplementedError } from "../../errors";

/**
 * GoEdge ACMETaskService + SSLCertService 子集实现。
 *
 * Phase 3 Step 6 范围:
 *   requestAcmeCert  createACMETask + runACMETask 一把(同步阻塞)
 *   findCertById     findEnabledSSLCertConfig(返 bytes JSON,解码)
 *   listCertsByUser  listSSLCerts(userId)
 *   removeCert       deleteSSLCert
 *   uploadCert       仍 throw(Step 6 占位)
 *
 * acmeUserId 由平台运营在 GoEdge 提前建一个共用 user;saas-svc 通过 env
 * EDGE_DEFAULT_ACME_USER_ID 注入。
 *
 * runACMETask 是同步等签发完成 — LE 实测可能 30s-2min;调用方应有 timeout 容忍。
 */
export class GrpcSslService implements SslService {
  constructor(
    private acmeStub: any,
    private certStub: any,
    private metadata: () => grpc.Metadata,
  ) {}

  async requestAcmeCert(input: RequestAcmeCertInput): Promise<RequestAcmeCertResult> {
    if (!input.edgeUserId) throw new EdgeApiError("RequestAcmeCertInput.edgeUserId required");
    if (!input.acmeUserId) throw new EdgeApiError("RequestAcmeCertInput.acmeUserId required(平台运营需先在 GoEdge 注册 ACME User)");
    if (!input.domains?.length) throw new EdgeApiError("RequestAcmeCertInput.domains required");

    // 1) createACMETask
    const createReq = {
      userId: input.edgeUserId,
      acmeUserId: input.acmeUserId,
      dnsProviderId: input.dnsProviderId ?? 0,
      dnsDomain: "",
      domains: input.domains,
      autoRenew: input.autoRenew ?? true,
      authType: input.authType ?? "http",
      authURL: "",
    };
    const createRes: any = await new Promise((resolve, reject) => {
      this.acmeStub.createACMETask(createReq, this.metadata(), (err: grpc.ServiceError | null, res: any) => {
        if (err) {
          return reject(new EdgeApiError(
            `ACMETaskService.createACMETask failed: ${err.message}`,
            err.code != null ? String(err.code) : undefined,
            err,
          ));
        }
        resolve(res);
      });
    });
    const acmeTaskId = Number(createRes?.acmeTaskId ?? 0);
    if (!acmeTaskId) throw new EdgeApiError("createACMETask returned empty acmeTaskId");

    // 2) runACMETask(同步等签发完成)
    const runRes: any = await new Promise((resolve, reject) => {
      this.acmeStub.runACMETask({ acmeTaskId }, this.metadata(), (err: grpc.ServiceError | null, res: any) => {
        if (err) {
          return reject(new EdgeApiError(
            `ACMETaskService.runACMETask failed: ${err.message}`,
            err.code != null ? String(err.code) : undefined,
            err,
          ));
        }
        resolve(res);
      });
    });
    const isOk = !!runRes?.isOk;
    return {
      acmeTaskId,
      isOk,
      sslCertId: isOk && runRes?.sslCertId ? Number(runRes.sslCertId) : undefined,
      error: !isOk ? (runRes?.error || "ACME run failed without error message") : undefined,
    };
  }

  async findCertById(certId: EdgeCertId): Promise<CertSummary | null> {
    return new Promise<CertSummary | null>((resolve, reject) => {
      this.certStub.findEnabledSSLCertConfig({ sslCertId: certId }, this.metadata(), (err: grpc.ServiceError | null, res: any) => {
        if (err) {
          if (err.code === grpc.status.NOT_FOUND) return resolve(null);
          return reject(new EdgeApiError(
            `SSLCertService.findEnabledSSLCertConfig failed: ${err.message}`,
            err.code != null ? String(err.code) : undefined,
            err,
          ));
        }
        const blob = res?.sslCertJSON;
        if (!blob || (Buffer.isBuffer(blob) && blob.length === 0)) return resolve(null);
        let parsed: any;
        try {
          parsed = JSON.parse(Buffer.isBuffer(blob) ? blob.toString("utf8") : String(blob));
        } catch {
          return resolve({ certId });
        }
        resolve({
          certId,
          name: parsed.name,
          serverNames: parsed.dnsNames || parsed.serverNames,
          timeBeginAt: parsed.timeBeginAt,
          timeEndAt: parsed.timeEndAt,
          isCA: parsed.isCA,
          isAvailable: parsed.isAvailable,
        });
      });
    });
  }

  async listCertsByUser(userId: EdgeUserId): Promise<CertSummary[]> {
    return new Promise<CertSummary[]>((resolve, reject) => {
      this.certStub.listSSLCerts(
        { userId, offset: 0, size: 200, isAvailable: false, isExpired: false, expiringDays: 0, keyword: "", isCA: false, domains: [] },
        this.metadata(),
        (err: grpc.ServiceError | null, res: any) => {
          if (err) {
            return reject(new EdgeApiError(
              `SSLCertService.listSSLCerts failed: ${err.message}`,
              err.code != null ? String(err.code) : undefined,
              err,
            ));
          }
          const certs = (res?.sslCerts || []) as any[];
          resolve(certs.map((c) => ({
            certId: Number(c.id ?? c.sslCertId ?? 0),
            name: c.name,
            timeBeginAt: c.timeBeginAt,
            timeEndAt: c.timeEndAt,
            isCA: c.isCA,
            isAvailable: c.isAvailable,
          })));
        },
      );
    });
  }

  async removeCert(certId: EdgeCertId): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.certStub.deleteSSLCert({ sslCertId: certId }, this.metadata(), (err: grpc.ServiceError | null) => {
        if (err) {
          return reject(new EdgeApiError(
            `SSLCertService.deleteSSLCert failed: ${err.message}`,
            err.code != null ? String(err.code) : undefined,
            err,
          ));
        }
        resolve();
      });
    });
  }

  async uploadCert(_input: UploadCertInput): Promise<{ certId: EdgeCertId }> {
    throw new NotImplementedError("GrpcSslService.uploadCert (Phase 3 Step 6 占位,用户自带证书场景留 Step 8+)");
  }
}
