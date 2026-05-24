import { Injectable } from "@nestjs/common";
import { ScaffoldProvider } from "./scaffold-base";

// PayPal(支持 Visa/MasterCard 等卡组)。后台配置:clientId、clientSecret。
// 接入要点:OAuth2 取 token → Orders v2 创建/捕获 → Webhook 验签(transmission signature)。
@Injectable()
export class PaypalProvider extends ScaffoldProvider {
  readonly code = "paypal";
  readonly displayName = "PayPal";
  protected requiredKeys = ["clientId", "clientSecret"];
}
