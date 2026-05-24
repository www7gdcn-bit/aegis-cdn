import { Injectable } from "@nestjs/common";
import { ScaffoldProvider } from "./scaffold-base";

// 支付宝。后台配置:appId、privateKey(应用私钥)、alipayPublicKey(支付宝公钥)。
// 接入要点:RSA2 签名下单(alipay.trade.page.pay / wap)、异步通知 verifyCallback 用支付宝公钥验签。
@Injectable()
export class AlipayProvider extends ScaffoldProvider {
  readonly code = "alipay";
  readonly displayName = "支付宝";
  protected requiredKeys = ["appId", "privateKey", "alipayPublicKey"];
}
