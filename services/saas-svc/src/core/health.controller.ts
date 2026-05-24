import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "./prisma/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true, db: "up", service: "saas-svc" };
    } catch (e) {
      return { ok: false, db: "down", service: "saas-svc" };
    }
  }
}
