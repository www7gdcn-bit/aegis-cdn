import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { RequestMethod, ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

function assertProdSecrets() {
  if (process.env.NODE_ENV !== "production") return;
  const s = process.env.JWT_SECRET || "";
  if (s.length < 32 || s.includes("change_me") || s.startsWith("dev_") || s.includes("local_dev")) {
    throw new Error("[bff-edge] 生产环境必须设置强 JWT_SECRET(>=32 位随机串)。");
  }
  const internal = process.env.AEGIS_INTERNAL_SECRET || "";
  if (internal.length < 32 || internal.includes("change_me") || internal.startsWith("dev_")) {
    throw new Error("[bff-edge] 生产环境必须设置强 AEGIS_INTERNAL_SECRET(>=32 位随机串)。");
  }
  if (!process.env.EDGE_API_GRPC_ADDR) {
    throw new Error("[bff-edge] 缺少 EDGE_API_GRPC_ADDR");
  }
}

async function bootstrap() {
  assertProdSecrets();
  const app = await NestFactory.create(AppModule);

  // 业务路由统一 /internal/edge/*(给 saas-svc / apps/web 内部调用,守 InternalTokenGuard)。
  // /health 不带前缀,公开;Phase 3 后续真业务路由也可能加 /api/v1/edge/* 公开分组(JWT)。
  app.setGlobalPrefix("internal/edge", {
    exclude: [{ path: "health", method: RequestMethod.ALL }],
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: (process.env.CORS_ORIGINS || "http://localhost:3000").split(","),
    credentials: true,
  });
  const port = Number(process.env.PORT || 4002);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[bff-edge] listening on http://0.0.0.0:${port}/internal/edge`);
}
bootstrap();
