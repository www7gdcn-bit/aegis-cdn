import { Injectable } from "@nestjs/common";
import { ScaffoldProvider } from "./scaffold-base";

// 微信支付(v3)。后台配置:mchId、appId、apiV3Key、serialNo、privateKey(商户私钥)。
// 接入要点:Native/H5 下单,回调用 AES-256-GCM 解密 + 平台证书验签。
@Injectable()
export class WechatPayProvider extends ScaffoldProvider {
  readonly code = "wechat";
  readonly displayName = "微信支付";
  protected requiredKeys = ["mchId", "appId", "apiV3Key", "privateKey"];
}
