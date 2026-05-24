import {
  Body, Controller, Delete, Get, HttpException, HttpStatus, Logger,
  Param, ParseIntPipe, Post, Query, UseGuards,
} from "@nestjs/common";
import { NotImplementedError } from "@aegis/edge-api-sdk";
import { InternalTokenGuard } from "../../core/common/internal-token.guard";
import { EdgeApiClient } from "../../core/edge-api/edge-api.client";
import { RequestAcmeCertDto, type RequestAcmeCertResult } from "./dto";

// /internal/edge/ssl — ACME 签发 + 证书 CRUD。
//
// 错误码契约:
//   502 EDGE_API_NOT_READY    SDK placeholder 模式
//   502 EDGE_API_UNREACHABLE  grpc UNAVAILABLE / DEADLINE_EXCEEDED
//   401 EDGE_API_AUTH_FAILED  UNAUTHENTICATED / PERMISSION_DENIED
//   400 EDGE_SSL_INVALID      INVALID_ARGUMENT
//   404 EDGE_CERT_NOT_FOUND   findCertById not found
//   500 EDGE_API_ERROR        其他
@UseGuards(InternalTokenGuard)
@Controller("ssl")
export class SslController {
  private readonly logger = new Logger(SslController.name);
  constructor(private edgeApi: EdgeApiClient) {}

  // 一把签发 — createACMETask + runACMETask 同步阻塞,返最终结果
  // 注意:runACMETask 可能耗时 30s-2min(LE 实际签发);调用方应有足够 timeout
  @Post("acme/tasks")
  async requestAcme(@Body() dto: RequestAcmeCertDto): Promise<RequestAcmeCertResult> {
    try {
      const r = await this.edgeApi.ssl.requestAcmeCert({
        edgeUserId: dto.edgeUserId,
        acmeUserId: dto.acmeUserId,
        domains: dto.domains,
        authType: dto.authType ?? "http",
        dnsProviderId: dto.dnsProviderId,
        autoRenew: dto.autoRenew ?? true,
      });
      this.logger.log(
        `ACME task=${r.acmeTaskId} isOk=${r.isOk} certId=${r.sslCertId || "-"} domains=[${dto.domains.join(",")}]`,
      );
      return r;
    } catch (e: any) {
      throw this.mapError(e);
    }
  }

  // GET /internal/edge/ssl/certs?edgeUserId=N
  @Get("certs")
  async listCerts(@Query("edgeUserId", ParseIntPipe) edgeUserId: number) {
    try {
      const list = await this.edgeApi.ssl.listCertsByUser(edgeUserId);
      return list;
    } catch (e: any) {
      throw this.mapError(e);
    }
  }

  @Get("certs/:certId")
  async findCert(@Param("certId", ParseIntPipe) certId: number) {
    try {
      const c = await this.edgeApi.ssl.findCertById(certId);
      if (!c) throw new HttpException({ code: "EDGE_CERT_NOT_FOUND" }, HttpStatus.NOT_FOUND);
      return c;
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      throw this.mapError(e);
    }
  }

  @Delete("certs/:certId")
  async removeCert(@Param("certId", ParseIntPipe) certId: number) {
    try {
      await this.edgeApi.ssl.removeCert(certId);
      return { ok: true };
    } catch (e: any) {
      throw this.mapError(e);
    }
  }

  private mapError(e: any): HttpException {
    if (e instanceof NotImplementedError) {
      return new HttpException(
        { code: "EDGE_API_NOT_READY", message: "EdgeAPI SDK in placeholder mode", detail: e.message },
        HttpStatus.BAD_GATEWAY,
      );
    }
    const msg = String(e?.message || e);
    const code: string | undefined = e?.code != null ? String(e.code) : undefined;
    if (code === "14" || code === "4") {
      return new HttpException({ code: "EDGE_API_UNREACHABLE", message: msg }, HttpStatus.BAD_GATEWAY);
    }
    if (code === "16" || code === "7") {
      return new HttpException({ code: "EDGE_API_AUTH_FAILED", message: msg }, HttpStatus.UNAUTHORIZED);
    }
    if (code === "3") {
      return new HttpException({ code: "EDGE_SSL_INVALID", message: msg }, HttpStatus.BAD_REQUEST);
    }
    this.logger.error(`ssl op failed: ${msg}`);
    return new HttpException({ code: "EDGE_API_ERROR", message: msg }, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
