import { Module } from "@nestjs/common";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { TenantModule } from "../tenant/tenant.module";
import { InternalQuotaController } from "./quota.controller";
import { InternalUserController, InternalEdgeUserController } from "./user-provision.controller";
import { InternalLogIngestController } from "./log-ingest/log-ingest.controller";

// 服务间互调入口的总模块。
@Module({
  imports: [SubscriptionsModule, TenantModule],
  controllers: [
    InternalQuotaController,
    InternalUserController,
    InternalEdgeUserController,
    InternalLogIngestController, // Step D.5:6 个占位日志端点
  ],
})
export class InternalModule {}
