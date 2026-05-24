import { Body, Controller, Param, Post, Req } from "@nestjs/common";
import { PaymentService } from "./payment.service";

// 网关异步回调入口(公开,无 JWT)。安全靠:provider 验签 + IP 白名单 + 幂等。
// 需要原始 body 做签名校验(NestFactory 已开启 rawBody)。
@Controller("payments/callback")
export class CallbackController {
  constructor(private svc: PaymentService) {}

  @Post(":gateway")
  async callback(@Param("gateway") gateway: string, @Req() req: any, @Body() body: any) {
    const rawBody: string = req.rawBody ? req.rawBody.toString("utf8") : JSON.stringify(body || {});
    return this.svc.handleCallback(gateway, {
      headers: req.headers,
      rawBody,
      query: req.query,
      body,
      ip: req.ip,
    });
  }
}
