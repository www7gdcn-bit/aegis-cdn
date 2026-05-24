import { Module } from "@nestjs/common";
import { EdgeProvisionService } from "./edge-provision.service";

/**
 * Phase 3 Step 2:
 *   只 export service,不暴露 HTTP controller。
 *   调用方:scripts/backfill-edge-users.ts、Phase 3 Step 3 起的 AuthService.register。
 *
 * 故意不接进 register 流程,避免本步骤破坏现有注册功能。
 */
@Module({
  providers: [EdgeProvisionService],
  exports: [EdgeProvisionService],
})
export class EdgeProvisionModule {}
