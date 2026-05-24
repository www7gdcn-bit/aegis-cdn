import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from "@nestjs/common";
import { OrdersService } from "./orders.service";
import { CreateOrderDto } from "./dto";
import { JwtAuthGuard, AuthUser } from "../../core/common/jwt-auth.guard";
import { CurrentUser } from "../../core/common/current-user.decorator";

@UseGuards(JwtAuthGuard)
@Controller("orders")
export class OrdersController {
  constructor(private orders: OrdersService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.orders.list(u.tenantId!);
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateOrderDto) {
    return this.orders.create(u.tenantId!, dto.planCode, dto.cycle);
  }

  // mock 支付通道(联调用)。真实支付走 POST /api/v1/saas/payments
  @Post(":id/pay")
  pay(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.orders.simulatePay(u.tenantId!, id);
  }
}
