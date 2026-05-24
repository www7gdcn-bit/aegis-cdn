import { Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";

export type Features = { cc: boolean; waf: boolean; geo: boolean; bot: boolean; dedicated: boolean };

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
export class PlansService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  // 启动时确保默认套餐存在(幂等)。表未建好时静默吞下,db push/migrate 后重启即生效。
  async onModuleInit() {
    try {
      for (const p of DEFAULT_PLANS) {
        await this.prisma.plan.upsert({
          where: { code: p.code },
          create: { ...p, features: p.features as any },
          update: {
            name: p.name, tier: p.tier,
            priceMonthly: p.priceMonthly, priceYearly: p.priceYearly,
            protectionGbps: p.protectionGbps, trafficGb: p.trafficGb,
            domainLimit: p.domainLimit, isCustom: p.isCustom,
            features: p.features as any,
          },
        });
      }
    } catch {
      // 首次 db push 前忽略
    }
  }

  listActive() {
    return this.prisma.plan.findMany({ where: { isActive: true }, orderBy: { tier: "asc" } });
  }

  async findByCode(code: string) {
    const plan = await this.prisma.plan.findUnique({ where: { code } });
    if (!plan) throw new NotFoundException(`plan not found: ${code}`);
    return plan;
  }

  async findById(id: number) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException(`plan not found: id=${id}`);
    return plan;
  }
}
