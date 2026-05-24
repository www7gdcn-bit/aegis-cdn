import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
import { PrismaService } from "../../core/prisma/prisma.service";
import { PlansService } from "../plans/plans.service";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private plans: PlansService,
    private subscriptions: SubscriptionsService,
  ) {}

  async create(tenantId: number, planCode: string, cycle: "monthly" | "yearly") {
    const plan = await this.plans.findByCode(planCode);
    if (!plan.isActive) throw new NotFoundException("套餐不存在");
    if (plan.isCustom) throw new BadRequestException("企业版请联系商务定制下单");
    const amount = cycle === "yearly" ? plan.priceYearly : plan.priceMonthly;
    const existing = await this.prisma.subscription.findUnique({ where: { tenantId } });
    return this.prisma.order.create({
      data: {
        orderNo:
          "AG" + Date.now().toString(36).toUpperCase() + randomBytes(2).toString("hex").toUpperCase(),
        tenantId,
        type: existing ? "upgrade" : "new",
        planId: plan.id,
        cycle,
        amount,
        status: "pending",
      },
    });
  }

  list(tenantId: number) {
    return this.prisma.order.findMany({ where: { tenantId }, orderBy: { id: "desc" } });
  }

  // 模拟支付:直接标记已付并开通订阅。(真实支付走 payment 模块 → fulfillOrder)
  async simulatePay(tenantId: number, orderId: number, method = "mock") {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, tenantId } });
    if (!order) throw new NotFoundException("订单不存在");
    if (order.status !== "pending") throw new BadRequestException("订单状态不可支付");
    if (!order.planId) throw new BadRequestException("订单缺少套餐");

    await this.prisma.order.update({
      where: { id: order.id },
      data: { status: "paid", method, paidAt: new Date() },
    });
    await this.subscriptions.upsertActive(
      tenantId,
      order.planId,
      (order.cycle || "monthly") as "monthly" | "yearly",
    );
    return this.subscriptions.getOrCreate(tenantId);
  }

  // 供 payment 模块回调:订单支付成功后开通/变更订阅(幂等)
  async fulfill(orderId: number, method = "gateway") {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || !order.planId) return;
    if (order.status === "paid") return; // 幂等
    await this.prisma.order.update({
      where: { id: order.id },
      data: { status: "paid", method, paidAt: new Date() },
    });
    await this.subscriptions.upsertActive(
      order.tenantId,
      order.planId,
      (order.cycle || "monthly") as "monthly" | "yearly",
    );
  }
}
