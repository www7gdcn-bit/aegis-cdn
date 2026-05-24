import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "./core/prisma/prisma.module";
import { RedisModule } from "./core/redis/redis.module";
import { QuotaClientModule } from "./core/quota-client/quota-client.module";
import { ProvisioningModule } from "./modules/provisioning/provisioning.module";
import { SecurityPolicyModule } from "./modules/security-policy/security-policy.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { ComplianceModule } from "./modules/compliance/compliance.module";
import { HealthController } from "./core/health.controller";

// Phase 2 后:apps/api 仅保留与"边缘数据面"相关的模块。
//   identity / billing / payment / kyc 已迁出到 services/saas-svc。
//   provisioning / security-policy / compliance(剩接入审核+封禁)/ analytics 留下,
//   Phase 3 起整体由 bff-edge 接管 EdgeAPI gRPC,本服务届时整体废弃。
//
// JwtModule 当前仍同时支持签发(开发期向后兼容)与验证 —
// Step F 会改为仅验证(共享 saas-svc 签的 JWT)。

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || "dev_jwt_secret_change_me_at_least_32_chars_xx",
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
    }),
    PrismaModule,
    RedisModule,
    QuotaClientModule,
    ProvisioningModule,
    SecurityPolicyModule,
    AnalyticsModule,
    ComplianceModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
