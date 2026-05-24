import { BadRequestException, HttpException, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";

type Features = { cc: boolean; waf: boolean; geo: boolean; bot: boolean; dedicated: boolean };

const DEFAULT_PLANS = [
  {
    code: "starter", name: "Starter", tier: 1, priceMonthly: 99, priceYearly: 990,
    protectionGbps: 100, trafficGb: 100, domainLimit: 1, isCustom: false,
    features: { cc: false, waf: false, geo: true, bot: false, dedicated: false } as Features,
  },
  {
    code: "business", name: "Business", tier: 2, priceMonthly: 499, priceYearly: 4990,
    protectionGbps: 300, trafficGb: 1024, domainLimit: 5, isCustom: false,
    features: { cc: true, waf: true, geo: true, bot: true, dedicated: false } as Features,
  },
  {
    code: "enterprise", name: "Enterprise", tier: 3, priceMonthly: 0, priceYearly: 0,
    protectionGbps: 0, trafficGb: 0, domainLimit: 9999, isCustom: true,
    features: { cc: true, waf: true, geo: true, bot: true, dedicated: true } as Features,
  },
];

@Injectable()
export class BillingService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  // 启动时确保默认套餐存在(幂等)
  async onModuleInit() {
    try {
      for (const p of DEFAULT_PLANS) {
        await this.prisma.plan.upsert({
          where: { code: p.code },
          create: { ...p, features: p.features as any },
          update: { name: p.name, tier: p.tier, priceMonthly: p.priceMonthly, priceYearly: p.priceYearly,
            protectionGbps: p.protectionGbps, trafficGb: p.trafficGb, domainLimit: p.domainLimit,
            isCustom: p.isCustom, features: p.features as any },
        });
      }
    } catch {
      // 表尚未建好(首次 db push 前)时忽略;db push 后重启即生效
    }
  }

  getPlans() {
    return this.prisma.plan.findMany({ where: { isActive: true }, orderBy: { tier: "asc" } });
  }

  // 取租户订阅;无则自动建 Starter 试用(7 天)
  async getSubscription(tenantId: number) {
    let sub = await this.prisma.subscription.findUnique({ where: { tenantId }, include: { plan: true } });
    if (!sub) {
      const starter = await this.prisma.plan.findUnique({ where: { code: "starter" } });
      if (!starter) throw new NotFoundException("plans not seeded");
      sub = await this.prisma.subscription.create({
        data: {
          tenantId, planId: starter.id, status: "trialing", cycle: "monthly",
          currentPeriodEnd: new Date(Date.now() + 7 * 86400_000),
        },
        include: { plan: true },
      });
    }
    return sub;
  }

  async getQuota(tenantId: number) {
    const sub = await this.getSubscription(tenantId);
    const usedDomains = await this.prisma.domain.count({ where: { tenantId } });
    const features = (sub.plan.features as unknown as Features) || ({} as Features);
    return {
      plan: sub.plan.code,
      status: sub.status,
      domainLimit: sub.plan.domainLimit,
      usedDomains,
      trafficGb: sub.plan.trafficGb,
      protectionGbps: sub.plan.protectionGbps,
      features,
      periodEnd: sub.currentPeriodEnd,
    };
  }

  async assertCanAddDomain(tenantId: number) {
    const q = await this.getQuota(tenantId);
    if (q.usedDomains >= q.domainLimit) {
      throw new HttpException(`已达套餐域名上限(${q.domainLimit}),请升级套餐`, 402);
    }
  }

  async assertFeature(tenantId: number, key: keyof Features, label: string) {
    const q = await this.getQuota(tenantId);
    if (!q.features?.[key]) {
      throw new HttpException(`当前套餐(${q.plan})不支持「${label}」,请升级到 Business 或更高`, 402);
    }
  }

  async hasFeature(tenantId: number, key: keyof Features) {
    const q = await this.getQuota(tenantId);
    return !!q.features?.[key];
  }

  async createOrder(tenantId: number, planCode: string, cycle: "monthly" | "yearly") {
    const plan = await this.prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan || !plan.isActive) throw new NotFoundException("套餐不存在");
    if (plan.isCustom) throw new BadRequestException("企业版请联系商务定制下单");
    const amount = cycle === "yearly" ? plan.priceYearly : plan.priceMonthly;
    const existing = await this.prisma.subscription.findUnique({ where: { tenantId } });
    const order = await this.prisma.order.create({
      data: {
        orderNo: "AG" + Date.now().toString(36).toUpperCase() + randomBytes(2).toString("hex").toUpperCase(),
        tenantId, type: existing ? "upgrade" : "new", planId: plan.id, cycle, amount, status: "pending",
      },
    });
    return order;
  }

  // 模拟支付:标记已付并开通/变更订阅。(Stripe / 钱包 接入见 docs;此处便于联调)
  async payOrder(tenantId: number, orderId: number, method = "mock") {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, tenantId } });
    if (!order) throw new NotFoundException("订单不存在");
    if (order.status !== "pending") throw new BadRequestException("订单状态不可支付");
    if (!order.planId) throw new BadRequestException("订单缺少套餐");

    const days = order.cycle === "yearly" ? 365 : 30;
    const periodEnd = new Date(Date.now() + days * 86400_000);
    await this.prisma.$transaction([
      this.prisma.order.update({ where: { id: order.id }, data: { status: "paid", method, paidAt: new Date() } }),
      this.prisma.subscription.upsert({
        where: { tenantId },
        create: { tenantId, planId: order.planId, status: "active", cycle: order.cycle || "monthly", currentPeriodEnd: periodEnd },
        update: { planId: order.planId, status: "active", cycle: order.cycle || "monthly", currentPeriodStart: new Date(), currentPeriodEnd: periodEnd },
      }),
    ]);
    return this.getSubscription(tenantId);
  }

  listOrders(tenantId: number) {
    return this.prisma.order.findMany({ where: { tenantId }, orderBy: { id: "desc" } });
  }

  // 供支付系统回调:订单支付成功后开通/变更订阅(幂等)
  async fulfillOrder(orderId: number, method = "gateway") {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || !order.planId) return;
    if (order.status === "paid") return; // 幂等
    const days = order.cycle === "yearly" ? 365 : 30;
    const periodEnd = new Date(Date.now() + days * 86400_000);
    await this.prisma.$transaction([
      this.prisma.order.update({ where: { id: order.id }, data: { status: "paid", method, paidAt: new Date() } }),
      this.prisma.subscription.upsert({
        where: { tenantId: order.tenantId },
        create: { tenantId: order.tenantId, planId: order.planId, status: "active", cycle: order.cycle || "monthly", currentPeriodEnd: periodEnd },
        update: { planId: order.planId, status: "active", cycle: order.cycle || "monthly", currentPeriodStart: new Date(), currentPeriodEnd: periodEnd },
      }),
    ]);
  }
}
