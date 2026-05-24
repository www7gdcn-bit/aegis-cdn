import {
  Body, Controller, Get, HttpException, HttpStatus, Logger,
  ParseIntPipe, Post, Query, UseGuards,
} from "@nestjs/common";
import { NotImplementedError } from "@aegis/edge-api-sdk";
import { InternalTokenGuard } from "../../core/common/internal-token.guard";
import { EdgeApiClient } from "../../core/edge-api/edge-api.client";
import { AddBlockDto, ReleaseBlockDto, type AddBlockResult } from "./dto";

// /internal/edge/blocks — 全局封禁同步(saas-svc → bff-edge → GoEdge IPList/IPItem)
//
// 错误码契约:
//   502 EDGE_API_NOT_READY    SDK placeholder 模式
//   502 EDGE_API_UNREACHABLE  grpc UNAVAILABLE / DEADLINE
//   401 EDGE_API_AUTH_FAILED  UNAUTHENTICATED / PERMISSION_DENIED
//   400 EDGE_BLOCK_INVALID    INVALID_ARGUMENT(IP 格式/类型不对)
//   404 EDGE_BLOCK_NOT_FOUND  释放时找不到
//   500 EDGE_API_ERROR        其他
@UseGuards(InternalTokenGuard)
@Controller("blocks")
export class BlocksController {
  private readonly logger = new Logger(BlocksController.name);
  constructor(private edgeApi: EdgeApiClient) {}

  /**
   * 新增封禁 — saas-svc 创建 GlobalBlock(type=ip|cidr)时调本接口同步到 GoEdge。
   * 返回 GoEdge 侧 ipItemId,saas-svc 写入 edgeBlockId 字段。
   */
  @Post()
  async add(@Body() dto: AddBlockDto): Promise<AddBlockResult> {
    try {
      const r = await this.edgeApi.ipLists.addToBlocklist({
        ipListId: dto.ipListId,
        value: dto.value,
        type: dto.type,
        reason: dto.reason,
        expiredAt: dto.expiredAt ? new Date(dto.expiredAt) : undefined,
        serverId: dto.serverId,
      });
      this.logger.log(`block ADD value=${dto.value} type=${dto.type} → ipItemId=${r.ipItemId}`);
      return { ipItemId: r.ipItemId, ipListId: dto.ipListId };
    } catch (e: any) {
      throw this.mapError(e);
    }
  }

  /**
   * 释放封禁 — saas-svc admin 释放某 GlobalBlock 时调。
   * 支持两种参数:{ipItemId} 优先;退而求其次 {ipListId, value}。
   */
  @Post("release")
  async release(@Body() dto: ReleaseBlockDto) {
    if (!dto.ipItemId && !(dto.ipListId && dto.value)) {
      throw new HttpException(
        { code: "EDGE_BLOCK_INVALID", message: "release requires ipItemId or (ipListId + value)" },
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      await this.edgeApi.ipLists.removeFromBlocklist({
        ipItemId: dto.ipItemId,
        ipListId: dto.ipListId,
        value: dto.value,
      });
      this.logger.log(`block RELEASE ${dto.ipItemId ? `ipItemId=${dto.ipItemId}` : `${dto.ipListId}/${dto.value}`}`);
      return { success: true };
    } catch (e: any) {
      throw this.mapError(e);
    }
  }

  /** 列表 — 给 saas-svc admin reconcile 用,可选 */
  @Get()
  async list(
    @Query("ipListId", ParseIntPipe) ipListId: number,
    @Query("offset") offsetStr?: string,
    @Query("size") sizeStr?: string,
  ) {
    try {
      const list = await this.edgeApi.ipLists.listBlocklistItems({
        ipListId,
        offset: offsetStr ? Number(offsetStr) : 0,
        size: sizeStr ? Number(sizeStr) : 100,
      });
      return list;
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
      return new HttpException({ code: "EDGE_BLOCK_INVALID", message: msg }, HttpStatus.BAD_REQUEST);
    }
    if (code === "5") {
      return new HttpException({ code: "EDGE_BLOCK_NOT_FOUND", message: msg }, HttpStatus.NOT_FOUND);
    }
    this.logger.error(`blocks op failed: ${msg}`);
    return new HttpException({ code: "EDGE_API_ERROR", message: msg }, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
