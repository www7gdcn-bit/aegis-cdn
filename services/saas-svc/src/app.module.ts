import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "./core/prisma/prisma.module";
import { RedisModule } from "./core/redis/redis.module";
import { HealthController } from "./core/health.controller";

// Phase 2 Step A 仅落骨架,业务模块在后续 step 注册。

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || "dev_jwt_secret_change_me_at_least_32_chars_xx",
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
    }),
    PrismaModule,
    RedisModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
