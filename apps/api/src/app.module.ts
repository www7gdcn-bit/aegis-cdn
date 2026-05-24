import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "./core/prisma/prisma.module";
import { RedisModule } from "./core/redis/redis.module";
import { AuthModule } from "./modules/identity/auth.module";
import { ProvisioningModule } from "./modules/provisioning/provisioning.module";
import { SecurityPolicyModule } from "./modules/security-policy/security-policy.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { BillingModule } from "./modules/billing/billing.module";
import { ComplianceModule } from "./modules/compliance/compliance.module";
import { PaymentModule } from "./modules/payment/payment.module";
import { HealthController } from "./core/health.controller";

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || "dev_jwt_secret_change_me_at_least_32_chars_xx",
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    ProvisioningModule,
    SecurityPolicyModule,
    AnalyticsModule,
    BillingModule,
    ComplianceModule,
    PaymentModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
