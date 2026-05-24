import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { SetEdgeUserIdDto, UpdateTenantDto } from "./dto";

@Injectable()
export class TenantService {
  constructor(private prisma: PrismaService) {}

  async getById(tenantId: number) {
    const t = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        status: true,
        kycStatus: true,
        edgeUserId: true,
        edgeUserSyncedAt: true,
        createdAt: true,
      },
    });
    if (!t) throw new NotFoundException("tenant not found");
    return t;
  }

  async update(tenantId: number, dto: UpdateTenantDto) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { name: dto.name },
      select: { id: true, name: true, updatedAt: true },
    });
  }

  // 由 /internal/user/provision 回调 — 把 GoEdge users.id 写入 Tenant
  async setEdgeUserId(tenantId: number, dto: SetEdgeUserIdDto) {
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!t) throw new NotFoundException("tenant not found");
    if (t.edgeUserId && t.edgeUserId !== dto.edgeUserId) {
      // 已绑定其他 edge user — 防止误覆盖
      throw new ConflictException(`tenant already bound to edgeUserId=${t.edgeUserId}`);
    }
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { edgeUserId: dto.edgeUserId, edgeUserSyncedAt: new Date() },
      select: { id: true, edgeUserId: true, edgeUserSyncedAt: true },
    });
  }

  // /internal/edge-user/:saasUserId 反查用
  async getEdgeUserIdByUserId(saasUserId: number) {
    const u = await this.prisma.user.findUnique({
      where: { id: saasUserId },
      select: { tenant: { select: { id: true, edgeUserId: true } } },
    });
    return u?.tenant ?? null;
  }
}
