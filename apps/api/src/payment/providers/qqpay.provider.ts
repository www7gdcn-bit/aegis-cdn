import { Injectable } from "@nestjs/common";
import { ScaffoldProvider } from "./scaffold-base";

// QQ 钱包。后台配置:mchId、apiKey。接入要点:MD5/HMAC 签名,统一下单 + 异步通知验签。
@Injectable()
export class QQPayProvider extends ScaffoldProvider {
  readonly code = "qqpay";
  readonly displayName = "QQ钱包";
  protected requiredKeys = ["mchId", "apiKey"];
}
