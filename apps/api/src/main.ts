import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

// 生产环境启动前置安全校验:杜绝默认/弱密钥上线
function assertProdSecrets() {
  if (process.env.NODE_ENV !== "production") return;
  const s = process.env.JWT_SECRET || "";
  if (s.length < 32 || s.includes("change_me") || s.startsWith("dev_") || s.includes("local_dev")) {
    throw new Error("[aegis-api] 生产环境必须设置强 JWT_SECRET(>=32 位随机串)。");
  }
  if (!process.env.DATABASE_URL) throw new Error("[aegis-api] 缺少 DATABASE_URL");
  if ((process.env.CORS_ORIGINS || "").includes("localhost")) {
    console.warn("[aegis-api] 警告:CORS_ORIGINS 仍含 localhost,生产请改为真实前端域名");
  }
}

async function bootstrap() {
  assertProdSecrets();
  // rawBody:true 保留原始报文,供支付回调验签(Stripe/微信等)使用
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: (process.env.CORS_ORIGINS || "http://localhost:3000").split(","),
    credentials: true,
  });
  const port = Number(process.env.PORT || 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[aegis-api] listening on http://0.0.0.0:${port}/api/v1`);
}
bootstrap();
