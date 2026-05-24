import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { SubmitKycDto } from "./dto";

@Injectable()
export class KycService {
  constructor(private prisma: PrismaService) {}

  // ---- 租户侧 ----

  async submit(tenantId: number, info: SubmitKycDto) {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { kycInfo: info as any, kycStatus: "pending" },
    });
    return { kycStatus: "pending" };
  }

  async mine(tenantId: number) {
    const t = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { kycStatus: true, kycInfo: true },
    });
    return t;
  }

  // ---- 管理侧 ----

  pending() {
    return this.prisma.tenant.findMany({
      where: { kycStatus: "pending" },
      select: { id: true, name: true, kycInfo: true, kycStatus: true, createdAt: true },
      orderBy: { id: "asc" },
    });
  }

  async review(tenantId: number, action: "approve" | "reject") {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { kycStatus: action === "approve" ? "approved" : "rejected" },
    });
    return { tenantId, action };
  }
}
