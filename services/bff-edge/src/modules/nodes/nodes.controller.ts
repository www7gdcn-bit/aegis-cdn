import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from "@nestjs/common";
import { InternalTokenGuard } from "../../core/common/internal-token.guard";
import { EdgeApiClient } from "../../core/edge-api/edge-api.client";

// /internal/edge/nodes — 节点状态(运营观察,只读)。
@UseGuards(InternalTokenGuard)
@Controller("nodes")
export class NodesController {
  constructor(private edgeApi: EdgeApiClient) {}

  @Get()
  async list(@Query("clusterId") _clusterId?: string) {
    return { todo: "GET /internal/edge/nodes?clusterId=N — NodeService.FindAllEnabledNodes" };
  }

  @Get(":nodeId")
  async findById(@Param("nodeId", ParseIntPipe) _nodeId: number) {
    return { todo: "GET /internal/edge/nodes/:nodeId — NodeService.FindEnabledNode (含 CPU/MEM/Load)" };
  }
}
