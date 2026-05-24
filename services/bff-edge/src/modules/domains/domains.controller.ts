import {
  Body, Controller, Delete, Get, HttpException, HttpStatus, Logger,
  Param, ParseIntPipe, Post, Query, UseGuards,
} from "@nestjs/common";
import { NotImplementedError } from "@aegis/edge-api-sdk";
import { InternalTokenGuard } from "../../core/common/internal-token.guard";
import { EdgeApiClient } from "../../core/edge-api/edge-api.client";
import { CreateEdgeDomainDto, type CreateEdgeDomainResult } from "./dto";

// /internal/edge/domains — saas-svc 调,把 SaaS 用户的域名落到 GoEdge。
//
// 错误码契约(与 /internal/edge/users 对齐):
//   502 EDGE_API_NOT_READY    SDK placeholder 模式
//   502 EDGE_API_UNREACHABLE  grpc UNAVAILABLE / DEADLINE_EXCEEDED
//   401 EDGE_API_AUTH_FAILED  UNAUTHENTICATED / PERMISSION_DENIED
//   409 EDGE_DOMAIN_CONFLICT  ALREADY_EXISTS(域名已被接入)
//   400 EDGE_DOMAIN_INVALID   INVALID_ARGUMENT(域名格式/源站格式不对)
//   500 EDGE_API_ERROR        其他
@UseGuards(InternalTokenGuard)
@Controller("domains")
export class DomainsController {
  private readonly logger = new Logger(DomainsController.name);
  constructor(private edgeApi: EdgeApiClient) {}

  @Post()
  async create(@Body() dto: CreateEdgeDomainDto): Promise<CreateEdgeDomainResult> {
    try {
      const d = await this.edgeApi.domains.create({
        edgeUserId: dto.edgeUserId,
        serverNames: dto.serverNames,
        originAddrs: dto.originAddrs,
        clusterId: dto.clusterId,
        enableWebsocket: dto.enableWebsocket,
      });
      this.logger.log(
        `created GoEdge server id=${d.serverId} names=[${dto.serverNames.join(",")}] (saas tenantId=${dto.tenantId})`,
      );
      return { edgeDomainId: d.serverId, serverNames: dto.serverNames };
    } catch (e: any) {
      throw this.mapError(e);
    }
  }

  // GET /internal/edge/domains?edgeUserId=N
  @Get()
  async list(@Query("edgeUserId", ParseIntPipe) edgeUserId: number) {
    try {
      const list = await this.edgeApi.domains.listByUser(edgeUserId);
      return list.map((d) => ({ edgeDomainId: d.serverId, name: d.name, isOn: d.isOn }));
    } catch (e: any) {
      throw this.mapError(e);
    }
  }

  @Get(":serverId")
  async findById(@Param("serverId", ParseIntPipe) serverId: number) {
    try {
      const d = await this.edgeApi.domains.findById(serverId);
      if (!d) throw new HttpException({ code: "EDGE_DOMAIN_NOT_FOUND" }, HttpStatus.NOT_FOUND);
      return { edgeDomainId: d.serverId, name: d.name, isOn: d.isOn };
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      throw this.mapError(e);
    }
  }

  @Delete(":serverId")
  async remove(@Param("serverId", ParseIntPipe) serverId: number) {
    try {
      await this.edgeApi.domains.remove(serverId);
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
    if (code === "6" || msg.includes("exists")) {
      return new HttpException({ code: "EDGE_DOMAIN_CONFLICT", message: msg }, HttpStatus.CONFLICT);
    }
    if (code === "3") {
      return new HttpException({ code: "EDGE_DOMAIN_INVALID", message: msg }, HttpStatus.BAD_REQUEST);
    }
    this.logger.error(`domains.${e?.method || "?"} failed: ${msg}`);
    return new HttpException({ code: "EDGE_API_ERROR", message: msg }, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
