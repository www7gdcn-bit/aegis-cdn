import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { BillingService } from "../billing/billing.service";
import { ConfigCompilerService } from "../provisioning/config-compiler.service";
import { CreateAclDto, CreateRateRuleDto, CreateWafRuleDto, UpdateCcDto, UpdateWafDto } from "./dto";

@Injectable()
export class SecurityPolicyService {
  constructor(
    private prisma: PrismaService,
    private compiler: ConfigCompilerService,
    private billing: BillingService,
  ) {}

  private async assertOwned(tenantId: number, domainId: number) {
    const d = await this.prisma.domain.findUnique({ where: { id: domainId }, select: { tenantId: true } });
    if (!d) throw new NotFoundException("domain not found");
    if (d.tenantId !== tenantId) throw new ForbiddenException();
  }

  // 每次策略变更后重新编译并下发到边缘 Redis
  private push(domainId: number) {
    return this.compiler.compileAndPush(domainId);
  }

  async updateCc(tenantId: number, domainId: number, dto: UpdateCcDto) {
    await this.assertOwned(tenantId, domainId);
    await this.billing.assertFeature(tenantId, "cc", "CC 防护");
    await this.prisma.ccPolicy.upsert({
      where: { domainId },
      create: { domainId, ...dto },
      update: { ...dto },
    });
    return this.push(domainId);
  }

  async updateWaf(tenantId: number, domainId: number, dto: UpdateWafDto) {
    await this.assertOwned(tenantId, domainId);
    await this.billing.assertFeature(tenantId, "waf", "WAF 防护");
    await this.prisma.wafPolicy.upsert({
      where: { domainId },
      create: { domainId, ...dto },
      update: { ...dto },
    });
    return this.push(domainId);
  }

  async addWafRule(tenantId: number, domainId: number, dto: CreateWafRuleDto) {
    await this.assertOwned(tenantId, domainId);
    await this.billing.assertFeature(tenantId, "waf", "WAF 防护");
    await this.prisma.wafRule.create({ data: { domainId, ...dto } });
    return this.push(domainId);
  }

  async deleteWafRule(tenantId: number, domainId: number, ruleId: number) {
    await this.assertOwned(tenantId, domainId);
    await this.prisma.wafRule.deleteMany({ where: { id: ruleId, domainId } });
    return this.push(domainId);
  }

  async addAcl(tenantId: number, domainId: number, dto: CreateAclDto) {
    await this.assertOwned(tenantId, domainId);
    await this.prisma.aclRule.create({ data: { domainId, ...dto } });
    return this.push(domainId);
  }

  async deleteAcl(tenantId: number, domainId: number, ruleId: number) {
    await this.assertOwned(tenantId, domainId);
    await this.prisma.aclRule.deleteMany({ where: { id: ruleId, domainId } });
    return this.push(domainId);
  }

  async addRateRule(tenantId: number, domainId: number, dto: CreateRateRuleDto) {
    await this.assertOwned(tenantId, domainId);
    await this.prisma.rateRule.create({ data: { domainId, algo: dto.algo ?? "sliding", dim: dto.dim, window: dto.window, limit: dto.limit } });
    return this.push(domainId);
  }

  async deleteRateRule(tenantId: number, domainId: number, ruleId: number) {
    await this.assertOwned(tenantId, domainId);
    await this.prisma.rateRule.deleteMany({ where: { id: ruleId, domainId } });
    return this.push(domainId);
  }

  // 预览将下发到边缘的配置(只编译并查看,实际也已写入 Redis)
  async preview(tenantId: number, domainId: number) {
    await this.assertOwned(tenantId, domainId);
    return this.compiler.compileAndPush(domainId);
  }
}
