import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { PaymentService } from "./payment.service";
import { UpdateGatewayDto, RefundDto } from "./dto";
import { JwtAuthGuard } from "../../core/common/jwt-auth.guard";
import { RolesGuard } from "../../core/common/roles.guard";
import { Roles } from "../../core/common/roles.decorator";

// 管理侧:支付网关配置(商户ID/Key/Secret/开关/手续费/汇率/图标/排序/沙盒,后台热更新)+ 支付查询/退款
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "operator")
@Controller("admin/payment-gateways")
export class AdminPaymentController {
  constructor(private svc: PaymentService) {}

  @Get()
  list() {
    return this.svc.adminListGateways();
  }

  @Patch(":code")
  update(@Param("code") code: string, @Body() dto: UpdateGatewayDto) {
    return this.svc.adminUpdateGateway(code, dto);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "operator")
@Controller("admin/payments")
export class AdminPaymentsController {
  constructor(private svc: PaymentService) {}

  @Get()
  list() {
    return this.svc.adminListPayments();
  }

  @Post(":no/refund")
  refund(@Param("no") no: string, @Body() dto: RefundDto) {
    return this.svc.refund(no, dto.reason);
  }
}
