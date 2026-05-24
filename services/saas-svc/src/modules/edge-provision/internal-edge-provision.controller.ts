import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import { EdgeProvisionService } from "./edge-provision.service";
import { InternalTokenGuard } from "../internal/internal-token.guard";

class ProcessPendingDto {
  @IsOptional() @IsInt() @Min(1) @Max(200)
  batchSize?: number;
}

// 内部触发:外部 cron / scheduler 调本端点强制跑一轮(saas-svc 自带 cron 也跑,可叠加)。
@UseGuards(InternalTokenGuard)
@Controller("internal/edge-provision")
export class InternalEdgeProvisionController {
  constructor(private svc: EdgeProvisionService) {}

  @Post("process-pending")
  process(@Body() dto: ProcessPendingDto) {
    return this.svc.retryPending(dto.batchSize ?? 20);
  }
}
