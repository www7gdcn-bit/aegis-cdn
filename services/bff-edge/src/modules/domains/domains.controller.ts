import {
  Body, Controller, Delete, Get, HttpException, HttpStatus, Logger,
  Param, ParseIntPipe, Post, Query, UseGuards,
} from "@nestjs/common";
import { IsInt, Min } from "class-validator";
import { NotImplementedError } from "@aegis/edge-api-sdk";
import { InternalTokenGuard } from "../../core/common/internal-token.guard";
import { EdgeApiClient } from "../../core/edge-api/edge-api.client";
import { CreateEdgeDomainDto, type CreateEdgeDomainResult } from "./dto";

class BindCertDto {
  @IsInt() @Min(1) certId!: number;
}

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
    // ── 三层 payload 日志(用 console.error 写 stderr,绕开 NestJS Logger level 压制)──
    // 实测 Linux 服务器上 this.logger.log 不出现在 docker logs,这里直接 stderr 写。
    // eslint-disable-next-line no-console
    console.error(`[bff-edge:DomainsController.create] incoming dto=${JSON.stringify(dto)}`);

    // ⚠️ GoEdge v1.3.9 服务端 CreateBasicHTTPServer 有逻辑陷阱(service_server.go:218-237):
    //   } else if adminId > 0 && req.UserId > 0 && req.NodeClusterId <= 0 {
    //       nodeClusterId, _ := SharedUserDAO.FindUserClusterId(tx, userId)
    //       // ↑ 用的是 userId(=0,admin 调时)而**不是** req.UserId
    //       req.NodeClusterId = nodeClusterId  // 取 0,后续 if<=0 报 invalid
    //   }
    // 即便我们已经把 edgeUsers.clusterId 设为 1,此 bug 仍触发(因为它查 WHERE id=0)。
    //
    // 唯一 workaround:**客户端直接传 nodeClusterId > 0**,跳过整个 else if 分支。
    // 从 env EDGE_DEFAULT_CLUSTER_ID(默认 1) 注入,与 UsersController 同模式。
    const rawEnvClusterId = process.env.EDGE_DEFAULT_CLUSTER_ID;
    const envClusterId = Number(rawEnvClusterId || "1");
    if (!Number.isFinite(envClusterId) || envClusterId <= 0) {
      // eslint-disable-next-line no-console
      console.error(`[bff-edge:DomainsController.create] FAIL EDGE_CONFIG_ERROR rawEnv=${JSON.stringify(rawEnvClusterId)} parsed=${envClusterId}`);
      throw new HttpException(
        { code: "EDGE_CONFIG_ERROR", message: "EDGE_DEFAULT_CLUSTER_ID 未配或无效;必须 >0(GoEdge 默认集群通常 id=1)" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    // dto.clusterId 优先(saas-svc 显式传时);未传则用 env 默认
    const clusterId = dto.clusterId ?? envClusterId;

    const sdkInput = {
      edgeUserId: dto.edgeUserId,
      serverNames: dto.serverNames,
      originAddrs: dto.originAddrs,
      clusterId,
      enableWebsocket: dto.enableWebsocket,
    };

    // 中间层 transformed payload(已确定 clusterId 来源,可与 incoming dto 对比)
    // eslint-disable-next-line no-console
    console.error(`[bff-edge:DomainsController.create] transformed sdkInput=${JSON.stringify(sdkInput)} | rawEnvClusterId=${JSON.stringify(rawEnvClusterId)} envClusterId=${envClusterId} dtoClusterId=${JSON.stringify(dto.clusterId)} resolvedClusterId=${clusterId}`);

    try {
      const d = await this.edgeApi.domains.create(sdkInput);
      // eslint-disable-next-line no-console
      console.error(
        `[bff-edge:DomainsController.create] OK serverId=${d.serverId} names=[${dto.serverNames.join(",")}] clusterId=${clusterId} (saas tenantId=${dto.tenantId})`,
      );
      return { edgeDomainId: d.serverId, serverNames: dto.serverNames };
    } catch (e: any) {
      // 失败时打 incoming dto + transformed sdkInput + grpc code + msg(三层串)
      // eslint-disable-next-line no-console
      console.error(
        `[bff-edge:DomainsController.create] FAIL grpcCode=${e?.code ?? "?"} msg=${e?.message || e}\n  incomingDto=${JSON.stringify(dto)}\n  transformedSdkInput=${JSON.stringify(sdkInput)}`,
      );
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

  /**
   * 把证书绑到 server 的 HTTPS 配置(Phase 3 Step 6.5)。
   * 内部 SDK 两步:createSSLPolicy + updateServerHTTPS。
   * 返回 { success, sslPolicyId }。
   */
  @Post(":serverId/bind-cert")
  async bindCert(
    @Param("serverId", ParseIntPipe) serverId: number,
    @Body() dto: BindCertDto,
  ) {
    try {
      const r = await this.edgeApi.domains.bindCert({
        serverId,
        certId: dto.certId,
      });
      this.logger.log(`bound certId=${dto.certId} → serverId=${serverId} sslPolicyId=${r.sslPolicyId}`);
      return { success: true, sslPolicyId: r.sslPolicyId, serverId };
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
