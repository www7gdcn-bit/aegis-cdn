import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

function assertProdSecrets() {
  if (process.env.NODE_ENV !== "production") return;
  const s = process.env.JWT_SECRET || "";
  if (s.length < 32 || s.includes("change_me") || s.startsWith("dev_") || s.includes("local_dev")) {
    throw new Error("[saas-svc] 生产环境必须设置强 JWT_SECRET(>=32 位随机串)。");
  }
  if (!process.env.DATABASE_URL) throw new Error("[saas-svc] 缺少 DATABASE_URL");
  const internal = process.env.AEGIS_INTERNAL_SECRET || "";
  if (internal.length < 32 || internal.includes("change_me") || internal.startsWith("dev_")) {
    throw new Error("[saas-svc] 生产环境必须设置强 AEGIS_INTERNAL_SECRET(>=32 位随机串)。");
  }
}

async function bootstrap() {
  assertProdSecrets();
  // rawBody:true 保留原始报文,供支付回调验签(Stripe/微信等)使用
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: (process.env.CORS_ORIGINS || "http://localhost:3000").split(","),
    credentials: true,
  });
  const port = Number(process.env.PORT || 4001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[saas-svc] listening on http://0.0.0.0:${port}`);
}
bootstrap();
