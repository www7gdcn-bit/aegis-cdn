import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "./core/prisma/prisma.module";
import { RedisModule } from "./core/redis/redis.module";
import { HealthController } from "./core/health.controller";
import { AuthModule } from "./modules/identity/auth.module";
import { TenantModule } from "./modules/tenant/tenant.module";
import { PlansModule } from "./modules/plans/plans.module";
import { SubscriptionsModule } from "./modules/subscriptions/subscriptions.module";

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
    TenantModule,
    PlansModule,
    SubscriptionsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
