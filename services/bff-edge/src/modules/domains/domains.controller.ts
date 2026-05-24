import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, UseGuards } from "@nestjs/common";
import { InternalTokenGuard } from "../../core/common/internal-token.guard";
import { EdgeApiClient } from "../../core/edge-api/edge-api.client";

// /internal/edge/domains — 域名(GoEdge server)接入与查询。
@UseGuards(InternalTokenGuard)
@Controller("domains")
export class DomainsController {
  constructor(private edgeApi: EdgeApiClient) {}

  @Get()
  async list(@Query("edgeUserId", ParseIntPipe) _edgeUserId: number) {
    return { todo: "GET /internal/edge/domains?edgeUserId=N — ServerService.FindAllEnabledServersByUserId" };
  }

  @Post()
  async create(@Body() _body: { edgeUserId: number; serverName: string; clusterId?: number }) {
    return { todo: "POST /internal/edge/domains — ServerService.CreateServer (含套餐配额校验:先调 saas-svc /internal/quota/check)" };
  }

  @Get(":serverId")
  async findById(@Param("serverId", ParseIntPipe) _serverId: number) {
    return { todo: "GET /internal/edge/domains/:serverId" };
  }

  @Delete(":serverId")
  async remove(@Param("serverId", ParseIntPipe) _serverId: number) {
    return { todo: "DELETE /internal/edge/domains/:serverId" };
  }
}
