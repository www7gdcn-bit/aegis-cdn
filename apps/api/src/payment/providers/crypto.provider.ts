import { Injectable } from "@nestjs/common";
import { ScaffoldProvider } from "./scaffold-base";

// 加密货币(如 USDT/Coinbase Commerce 等)。后台配置:apiKey、webhookSecret。
// 接入要点:创建 charge → Webhook(HMAC-SHA256)确认链上到账。
@Injectable()
export class CryptoProvider extends ScaffoldProvider {
  readonly code = "crypto";
  readonly displayName = "Crypto";
  protected requiredKeys = ["apiKey", "webhookSecret"];
}
