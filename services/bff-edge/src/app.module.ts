import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { HealthController } from "./core/health.controller";
import { EdgeApiModule } from "./core/edge-api/edge-api.module";
import { InternalHealthModule } from "./modules/internal-health.module";
import { UsersModule } from "./modules/users/users.module";
import { DomainsModule } from "./modules/domains/domains.module";
import { SslModule } from "./modules/ssl/ssl.module";
import { NodesModule } from "./modules/nodes/nodes.module";
import { BlocksModule } from "./modules/blocks/blocks.module";

// bff-edge 仅验证 JWT(不签发)。共享 saas-svc 的 JWT_SECRET。
@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || "dev_jwt_secret_change_me_at_least_32_chars_xx",
      // 无 signOptions — 本服务不签发 JWT
    }),
    EdgeApiModule,
    InternalHealthModule,
    UsersModule,
    DomainsModule,
    SslModule,
    NodesModule,
    BlocksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
