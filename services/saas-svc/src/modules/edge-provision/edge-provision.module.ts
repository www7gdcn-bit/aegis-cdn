import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { EdgeProvisionService } from "./edge-provision.service";
import { EdgeProvisionCron } from "./edge-provision.cron";
import { EdgeProvisionController } from "./edge-provision.controller";
import { AdminEdgeProvisionController } from "./admin-edge-provision.controller";
import { InternalEdgeProvisionController } from "./internal-edge-provision.controller";

/**
 * Phase 3 Step 3:
 *   - service 提供 schedule/retry/getStatus/manualRetry/provisionNow
 *   - cron 每 30s 跑 retryPending
 *   - 3 个 controller:user(/edge-provision/me)、admin(/admin/edge-provision/*)、
 *     internal(/internal/edge-provision/process-pending)
 *   - 被 identity/auth.module import,AuthService.register 末尾 fire scheduleProvision
 */
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [EdgeProvisionService, EdgeProvisionCron],
  controllers: [
    EdgeProvisionController,
    AdminEdgeProvisionController,
    InternalEdgeProvisionController,
  ],
  exports: [EdgeProvisionService],
})
export class EdgeProvisionModule {}
