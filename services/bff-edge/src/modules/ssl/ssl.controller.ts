import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, UseGuards } from "@nestjs/common";
import { InternalTokenGuard } from "../../core/common/internal-token.guard";
import { EdgeApiClient } from "../../core/edge-api/edge-api.client";

// /internal/edge/ssl — SSL 证书 + ACME 自动签发。
@UseGuards(InternalTokenGuard)
@Controller("ssl")
export class SslController {
  constructor(private edgeApi: EdgeApiClient) {}

  @Get("certs")
  async listCerts(@Query("edgeUserId", ParseIntPipe) _edgeUserId: number) {
    return { todo: "GET /internal/edge/ssl/certs?edgeUserId=N — SSLCertService" };
  }

  @Post("certs")
  async upload(@Body() _body: { edgeUserId: number; serverName: string; certPem: string; keyPem: string }) {
    return { todo: "POST /internal/edge/ssl/certs — SSLCertService.CreateSSLCert" };
  }

  @Delete("certs/:certId")
  async remove(@Param("certId", ParseIntPipe) _certId: number) {
    return { todo: "DELETE /internal/edge/ssl/certs/:certId" };
  }

  // ACME(Let's Encrypt 等)自动签发任务
  @Post("acme/tasks")
  async createAcmeTask(@Body() _body: { edgeUserId: number; serverName: string; dnsProviderId?: number }) {
    return { todo: "POST /internal/edge/ssl/acme/tasks — ACMETaskService.CreateAcmeTask" };
  }
}
