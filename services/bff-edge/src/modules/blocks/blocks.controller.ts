import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { InternalTokenGuard } from "../../core/common/internal-token.guard";
import { EdgeApiClient } from "../../core/edge-api/edge-api.client";

// /internal/edge/blocks — 全局封禁(同步 saas-svc.GlobalBlock 到 GoEdge ip_list)。
// D2 决策:GlobalBlock 数据归 saas-svc,执行链由 bff-edge 推到 GoEdge ip_list 体系。
@UseGuards(InternalTokenGuard)
@Controller("blocks")
export class BlocksController {
  constructor(private edgeApi: EdgeApiClient) {}

  @Get()
  async list() {
    return { todo: "GET /internal/edge/blocks — IPListService.ListItems (从 GoEdge 全局封禁列表)" };
  }

  @Post()
  async add(@Body() _body: { type: "ipv4" | "ipv6" | "cidr"; value: string; reason?: string; expiresAt?: string }) {
    return { todo: "POST /internal/edge/blocks — IPItemService.CreateIPItem (写到 GoEdge 全局列表)" };
  }

  @Delete(":value")
  async remove(@Param("value") _value: string) {
    return { todo: "DELETE /internal/edge/blocks/:value — IPItemService.DeleteIPItem" };
  }
}
