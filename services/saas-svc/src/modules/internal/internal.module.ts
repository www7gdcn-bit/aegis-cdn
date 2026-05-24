import { Module } from "@nestjs/common";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { TenantModule } from "../tenant/tenant.module";
import { InternalQuotaController } from "./quota.controller";
import { InternalUserController, InternalEdgeUserController } from "./user-provision.controller";

// 服务间互调入口的总模块。
// Step D.5 加 InternalLogIngestController(占位)。
@Module({
  imports: [SubscriptionsModule, TenantModule],
  controllers: [
    InternalQuotaController,
    InternalUserController,
    InternalEdgeUserController,
  ],
})
export class InternalModule {}
