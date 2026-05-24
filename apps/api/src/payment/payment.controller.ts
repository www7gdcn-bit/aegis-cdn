import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { PaymentService } from "./payment.service";
import { CreatePaymentDto } from "./dto";
import { JwtAuthGuard, AuthUser } from "../common/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";

@UseGuards(JwtAuthGuard)
@Controller("payments")
export class PaymentController {
  constructor(private svc: PaymentService) {}

  @Get("methods")
  methods() {
    return this.svc.methods();
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreatePaymentDto, @Req() req: any) {
    return this.svc.create(u.tenantId!, dto, req.ip);
  }

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.svc.list(u.tenantId!);
  }

  @Get(":no")
  get(@CurrentUser() u: AuthUser, @Param("no") no: string) {
    return this.svc.get(u.tenantId!, no);
  }

  // 模拟支付(mock/沙盒):无需真实网关跑通"已支付"
  @Post(":no/simulate")
  simulate(@CurrentUser() u: AuthUser, @Param("no") no: string) {
    return this.svc.simulatePaid(u.tenantId!, no);
  }

  // 简易发票(可前端渲染/下载为 PDF)
  @Get(":no/invoice")
  async invoice(@CurrentUser() u: AuthUser, @Param("no") no: string) {
    const p = await this.svc.get(u.tenantId!, no);
    return {
      invoiceNo: "INV-" + p.paymentNo,
      paymentNo: p.paymentNo,
      subject: p.subject,
      amount: p.amount,
      fee: p.fee,
      currency: p.currency,
      status: p.status,
      paidAt: p.paidAt,
      seller: "AegisCDN",
      issuedAt: new Date(),
    };
  }
}
