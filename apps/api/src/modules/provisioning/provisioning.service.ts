import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
import { PrismaService } from "../../core/prisma/prisma.service";
import { BillingService } from "../billing/billing.service";
import { CreateDomainDto } from "./dto";

@Injectable()
export class ProvisioningService {
  constructor(private prisma: PrismaService, private billing: BillingService) {}

  private suffix() {
    return process.env.CNAME_SUFFIX || "aegis-cdn.net";
  }

  async list(tenantId: number) {
    return this.prisma.domain.findMany({
      where: { tenantId },
      orderBy: { id: "desc" },
      include: { _count: { select: { wafRules: true, aclRules: true } } },
    });
  }

  async get(tenantId: number, id: number) {
    const d = await this.prisma.domain.findFirst({
      where: { id, tenantId },
      include: { origins: true, ccPolicy: true, wafPolicy: true, wafRules: true, aclRules: true, rateRules: true },
    });
    if (!d) throw new NotFoundException("domain not found");
    return d;
  }

  async create(tenantId: number, dto: CreateDomainDto) {
    await this.billing.assertCanAddDomain(tenantId); // 套餐域名数配额
    const name = dto.name.trim().toLowerCase();
    if (await this.prisma.domain.findUnique({ where: { name } })) {
      throw new ConflictException("域名已被接入");
    }
    const slug = randomBytes(4).toString("hex");
    const domain = await this.prisma.domain.create({
      data: {
        tenantId,
        name,
        cname: `${slug}.${this.suffix()}`,
        verifyToken: `aegis-verify-${randomBytes(8).toString("hex")}`,
        // 同步建默认策略,便于一接入就有防护
        ccPolicy: { create: {} },
        wafPolicy: { create: {} },
        origins: dto.originAddress
          ? { create: { address: dto.originAddress, port: 80, scheme: "http" } }
          : undefined,
      },
    });
    return domain;
  }

  async remove(tenantId: number, id: number) {
    await this.get(tenantId, id); // 校验归属
    await this.prisma.domain.delete({ where: { id } });
    return { ok: true };
  }

  // 仅用于审核/状态流转(管理员或 demo)
  async setStatus(tenantId: number, id: number, status: string, reviewStatus?: string) {
    await this.get(tenantId, id);
    return this.prisma.domain.update({
      where: { id },
      data: { status, ...(reviewStatus ? { reviewStatus } : {}) },
    });
  }
}
