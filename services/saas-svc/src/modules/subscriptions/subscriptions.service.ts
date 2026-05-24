import { HttpException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { Features, PlansService } from "../plans/plans.service";

export type QuotaSnapshot = {
  plan: string;
  status: string;
  domainLimit: number;
  usedDomains: number | null; // Phase 3 起由 bff-edge 调 EdgeAPI 提供;saas-svc 不持有 Domain
  trafficGb: number;
  protectionGbps: number;
  features: Features;
  periodEnd: Date;
};

@Injectable()
export class SubscriptionsService {
  constructor(private prisma: PrismaService, private plans: PlansService) {}

  // 取租户订阅;无则自动建 Starter 试用(7 天)
  async getOrCreate(tenantId: number) {
    let sub = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });
    if (!sub) {
      const starter = await this.plans.findByCode("starter");
      sub = await this.prisma.subscription.create({
        data: {
          tenantId,
          planId: starter.id,
          status: "trialing",
          cycle: "monthly",
          currentPeriodEnd: new Date(Date.now() + 7 * 86400_000),
        },
        include: { plan: true },
      });
    }
    return sub;
  }

  // Phase 2:usedDomains 留 null,Phase 3 由 bff-edge 调 EdgeAPI 拿真实计数。
  // /internal/quota/check 端点可以接受 currentDomainCount 参数从外部传入。
  async getQuota(tenantId: number, currentDomainCount?: number): Promise<QuotaSnapshot> {
    const sub = await this.getOrCreate(tenantId);
    const features = (sub.plan.features as unknown as Features) || ({} as Features);
    return {
      plan: sub.plan.code,
      status: sub.status,
      domainLimit: sub.plan.domainLimit,
      usedDomains: currentDomainCount ?? null,
      trafficGb: sub.plan.trafficGb,
      protectionGbps: sub.plan.protectionGbps,
      features,
      periodEnd: sub.currentPeriodEnd,
    };
  }

  // 配额门控:由 /internal/quota/check 调用,bff-edge 传入当前域名数
  async assertCanAddDomain(tenantId: number, currentDomainCount: number) {
    const q = await this.getQuota(tenantId, currentDomainCount);
    if (currentDomainCount >= q.domainLimit) {
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

  // 由 orders.payOrder / fulfillOrder 调用 — 开通/变更订阅(幂等等价)
  async upsertActive(tenantId: number, planId: number, cycle: "monthly" | "yearly") {
    const days = cycle === "yearly" ? 365 : 30;
    const periodEnd = new Date(Date.now() + days * 86400_000);
    await this.prisma.subscription.upsert({
      where: { tenantId },
      create: {
        tenantId, planId, status: "active", cycle,
        currentPeriodEnd: periodEnd,
      },
      update: {
        planId, status: "active", cycle,
        currentPeriodStart: new Date(),
        currentPeriodEnd: periodEnd,
      },
    });
  }
}
