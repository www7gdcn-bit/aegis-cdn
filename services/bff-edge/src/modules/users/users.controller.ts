import {
  Body, Controller, Get, HttpException, HttpStatus, Logger, Param, ParseIntPipe, Post, UseGuards,
} from "@nestjs/common";
import { NotImplementedError } from "@aegis/edge-api-sdk";
import { InternalTokenGuard } from "../../core/common/internal-token.guard";
import { EdgeApiClient } from "../../core/edge-api/edge-api.client";
import { CreateEdgeUserDto, type CreateEdgeUserResult } from "./dto";

// /internal/edge/users — 给 saas-svc 调,把 SaaS Tenant 同步成 GoEdge user。
@UseGuards(InternalTokenGuard)
@Controller("users") // 全局前缀 internal/edge/ 已注入
export class UsersController {
  private readonly logger = new Logger(UsersController.name);
  constructor(private edgeApi: EdgeApiClient) {}

  /**
   * 创建 GoEdge user。
   *
   * Phase 3 Step 2 状态:
   *   - mode=grpc + admin 凭证齐:真实调 UserService.createUser,返回真实 edgeUserId
   *   - mode=placeholder:返回 502 with code=EDGE_API_NOT_READY,saas-svc 收到后应入"待 provision"队列
   *
   * 错误码契约(返回 HTTP body 含 code):
   *   502 EDGE_API_NOT_READY    SDK 处于 placeholder 模式(EdgeAPI 未配)
   *   502 EDGE_API_UNREACHABLE  gRPC 连不上 / 超时
   *   401 EDGE_API_AUTH_FAILED  admin token 失败(secret 不对 / nodeid 过期)
   *   409 EDGE_USER_CONFLICT    username 已存在
   *   500 EDGE_API_ERROR        其他上游错误
   */
  @Post()
  async create(@Body() dto: CreateEdgeUserDto): Promise<CreateEdgeUserResult> {
    // edgeUsers.clusterId 必须 > 0 — 否则后续 createBasicHTTPServer 报 invalid nodeClusterId
    // (服务端 admin 模式下覆盖 req.NodeClusterId = FindUserClusterId(userId))
    // 从 env EDGE_DEFAULT_CLUSTER_ID 注入(默认 1 = setup 时自动建的默认集群)
    const clusterId = Number(process.env.EDGE_DEFAULT_CLUSTER_ID || "1");
    if (!Number.isFinite(clusterId) || clusterId <= 0) {
      throw new HttpException(
        { code: "EDGE_CONFIG_ERROR", message: "EDGE_DEFAULT_CLUSTER_ID 未配或无效;必须 >0(GoEdge 默认集群通常 id=1)" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    try {
      const u = await this.edgeApi.users.create({
        username: dto.username,
        email: dto.email,
        remark: dto.remark || `saas-tenant-${dto.tenantId}`,
        source: "aegis-saas",
        clusterId,
      });
      this.logger.log(`created GoEdge user id=${u.id} username=${u.username} clusterId=${clusterId} (saas tenantId=${dto.tenantId})`);
      return { edgeUserId: u.id, username: u.username };
    } catch (e: any) {
      if (e instanceof NotImplementedError) {
        throw new HttpException(
          { code: "EDGE_API_NOT_READY", message: "EdgeAPI SDK in placeholder mode", detail: e.message },
          HttpStatus.BAD_GATEWAY,
        );
      }
      const msg = String(e?.message || e);
      // 简易错误码映射(grpc-js error.code 是数字 grpc.status):
      //   14 UNAVAILABLE / 4 DEADLINE_EXCEEDED → 502 unreachable
      //   16 UNAUTHENTICATED / 7 PERMISSION_DENIED → 401 auth
      //   6  ALREADY_EXISTS → 409 conflict
      const code: string | undefined = e?.code != null ? String(e.code) : undefined;
      if (code === "14" || code === "4") {
        throw new HttpException({ code: "EDGE_API_UNREACHABLE", message: msg }, HttpStatus.BAD_GATEWAY);
      }
      if (code === "16" || code === "7") {
        throw new HttpException({ code: "EDGE_API_AUTH_FAILED", message: msg }, HttpStatus.UNAUTHORIZED);
      }
      if (code === "6" || msg.includes("exists")) {
        throw new HttpException({ code: "EDGE_USER_CONFLICT", message: msg }, HttpStatus.CONFLICT);
      }
      this.logger.error(`createGoEdgeUser failed: ${msg}`);
      throw new HttpException({ code: "EDGE_API_ERROR", message: msg }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(":edgeUserId")
  async findById(@Param("edgeUserId", ParseIntPipe) _edgeUserId: number) {
    return { todo: "GET /internal/edge/users/:edgeUserId — UserService.FindEnabledUser (Phase 3 Step 3+)" };
  }

  @Post(":edgeUserId/disable")
  async disable(@Param("edgeUserId", ParseIntPipe) _edgeUserId: number) {
    return { todo: "POST /internal/edge/users/:edgeUserId/disable (Phase 3 Step 3+)" };
  }

  @Post(":edgeUserId/enable")
  async enable(@Param("edgeUserId", ParseIntPipe) _edgeUserId: number) {
    return { todo: "POST /internal/edge/users/:edgeUserId/enable (Phase 3 Step 3+)" };
  }
}
