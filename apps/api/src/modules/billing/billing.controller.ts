import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from "@nestjs/common";
import { BillingService } from "./billing.service";
import { CreateOrderDto } from "./dto";
import { JwtAuthGuard, AuthUser } from "../../core/common/jwt-auth.guard";
import { CurrentUser } from "../../core/common/current-user.decorator";

@Controller("billing")
export class BillingController {
  constructor(private billing: BillingService) {}

  @Get("plans") // 公开:官网定价页
  plans() {
    return this.billing.getPlans();
  }

  @UseGuards(JwtAuthGuard)
  @Get("subscription")
  subscription(@CurrentUser() u: AuthUser) {
    return this.billing.getSubscription(u.tenantId!);
  }

  @UseGuards(JwtAuthGuard)
  @Get("quota")
  quota(@CurrentUser() u: AuthUser) {
    return this.billing.getQuota(u.tenantId!);
  }

  @UseGuards(JwtAuthGuard)
  @Get("orders")
  orders(@CurrentUser() u: AuthUser) {
    return this.billing.listOrders(u.tenantId!);
  }

  @UseGuards(JwtAuthGuard)
  @Post("orders")
  createOrder(@CurrentUser() u: AuthUser, @Body() dto: CreateOrderDto) {
    return this.billing.createOrder(u.tenantId!, dto.planCode, dto.cycle);
  }

  @UseGuards(JwtAuthGuard)
  @Post("orders/:id/pay")
  pay(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.billing.payOrder(u.tenantId!, id);
  }
}
