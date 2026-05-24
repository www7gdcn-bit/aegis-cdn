import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { AuthModule } from "./auth/auth.module";
import { DomainsModule } from "./domains/domains.module";
import { ProtectionModule } from "./protection/protection.module";
import { StatsModule } from "./stats/stats.module";
import { BillingModule } from "./billing/billing.module";
import { ComplianceModule } from "./compliance/compliance.module";
import { PaymentModule } from "./payment/payment.module";
import { HealthController } from "./health.controller";

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
    DomainsModule,
    ProtectionModule,
    StatsModule,
    BillingModule,
    ComplianceModule,
    PaymentModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
