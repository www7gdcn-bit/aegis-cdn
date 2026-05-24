import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { RedisService } from "../../core/redis/redis.service";
import { ConfigCompilerService } from "../provisioning/config-compiler.service";
import { CreateBlockDto } from "./dto";

// Phase 2 之后本服务只保留:
//   - 接入审核(reviewDomain)        — 行为依赖 ConfigCompiler 推下发到边缘
//   - 全局封禁(blocks)               — 行为依赖 Redis(GoEdge db=0) + Domain 表 + 边缘下发
// KYC 4 个方法已迁到 services/saas-svc/modules/kyc。
@Injectable()
export class ComplianceService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private compiler: ConfigCompilerService,
  ) {}

  // ---- 管理侧:接入审核 ----
  pendingReviews() {
    return this.prisma.domain.findMany({
      where: { reviewStatus: "pending" },
      include: { tenant: { select: { id: true, name: true, kycStatus: true } } },
      orderBy: { id: "asc" },
    });
  }

  async reviewDomain(domainId: number, action: "approve" | "reject") {
    const d = await this.prisma.domain.findUnique({ where: { id: domainId } });
    if (!d) throw new NotFoundException("domain not found");
    if (action === "approve") {
      await this.prisma.domain.update({ where: { id: domainId }, data: { reviewStatus: "approved", status: "active" } });
    } else {
      await this.prisma.domain.update({ where: { id: domainId }, data: { reviewStatus: "rejected", status: "pending" } });
    }
    await this.compiler.compileAndPush(domainId); // 重新下发(approve→enabled, reject→不启用)
    return { id: domainId, action };
  }

  // ---- 管理侧:全局封禁 ----
  listBlocks() {
    return this.prisma.globalBlock.findMany({ orderBy: { id: "desc" } });
  }

  async addBlock(dto: CreateBlockDto, createdBy?: number) {
    const value = dto.value.trim();
    const block = await this.prisma.globalBlock.upsert({
      where: { type_value: { type: dto.type, value } },
      create: { type: dto.type, value, reason: dto.reason, createdBy },
      update: { reason: dto.reason, createdBy },
    });
    if (dto.type === "ip") {
      // 写永久封禁键,边缘 ban.is_banned 命中(跨所有域名)
      await this.redis.set(`aegis:ban:${value}`, "global");
    } else {
      // 域名:置 blocked 并重新下发(边缘对该域名硬拦截)
      const d = await this.prisma.domain.findUnique({ where: { name: value.toLowerCase() } });
      if (d) {
        await this.prisma.domain.update({ where: { id: d.id }, data: { status: "blocked" } });
        await this.compiler.compileAndPush(d.id);
      }
    }
    return block;
  }

  async removeBlock(id: number) {
    const block = await this.prisma.globalBlock.findUnique({ where: { id } });
    if (!block) throw new NotFoundException("block not found");
    await this.prisma.globalBlock.delete({ where: { id } });
    if (block.type === "ip") {
      await this.redis.del(`aegis:ban:${block.value}`);
    } else {
      const d = await this.prisma.domain.findUnique({ where: { name: block.value.toLowerCase() } });
      if (d) {
        // 解封:已审核过的恢复 active,否则回到 pending
        const status = d.reviewStatus === "approved" ? "active" : "pending";
        await this.prisma.domain.update({ where: { id: d.id }, data: { status } });
        await this.compiler.compileAndPush(d.id);
      }
    }
    return { ok: true };
  }
}
