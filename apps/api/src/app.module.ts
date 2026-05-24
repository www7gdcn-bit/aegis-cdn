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
// JwtModule 配置为"仅验证"模式 — 不再签发 JWT。
// JWT 由 saas-svc(:4001/api/v1/saas/auth)签发,本服务通过共享 JWT_SECRET 验证。
// JwtAuthGuard 用 jwt.verifyAsync(),签名相关 signOptions 已删除以避免误用。

@Module({
  imports: [
    JwtModule.register({
      global: true,
      // 必须与 saas-svc 同 secret;读不到时给一个明显占位,assertProdSecrets() 在生产会拒绝启动
      secret: process.env.JWT_SECRET || "dev_jwt_secret_change_me_at_least_32_chars_xx",
      // 无 signOptions — 本服务不签发 JWT
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
