import {
  BadRequestException, ConflictException, ForbiddenException,
  Injectable, Logger, NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { PrismaService } from "../../core/prisma/prisma.service";
import { AddDomainDto } from "./dto";

@Injectable()
export class DomainsService {
  private readonly logger = new Logger(DomainsService.name);
  private readonly bffBase = (process.env.BFF_EDGE_INTERNAL_URL || "http://localhost:4002").replace(/\/$/, "");
  private readonly cnameSuffix = process.env.EDGE_CNAME_SUFFIX || "aegiscdn.com";

  constructor(private prisma: PrismaService) {}

  private headers() {
    return {
      "Content-Type": "application/json",
      "X-Aegis-Internal-Token": process.env.AEGIS_INTERNAL_SECRET || "",
    };
  }

  private genCnameTarget() {
    return `${randomBytes(4).toString("hex")}.${this.cnameSuffix}`;
  }

  /** 形成 GoEdge 接受的 origin 串(必须带协议) */
  private normalizeOrigin(originHost?: string): string | null {
    if (!originHost) return null;
    const trimmed = originHost.trim();
    if (/^[a-z]+:\/\//i.test(trimmed)) return trimmed;
    return `http://${trimmed}`;
  }

  async list(tenantId: number) {
    return this.prisma.saasDomain.findMany({
      where: { tenantId },
      orderBy: { id: "desc" },
      select: {
        id: true,
        domain: true,
        cnameTarget: true,
        edgeDomainId: true,
        status: true,
        sslStatus: true,
        verificationStatus: true,
        originHost: true,
        lastError: true,
        createdAt: true,
        edgeSyncedAt: true,
      },
    });
  }

  async getById(tenantId: number, id: number) {
    const d = await this.prisma.saasDomain.findFirst({ where: { id, tenantId } });
    if (!d) throw new NotFoundException("domain not found");
    return d;
  }

  async getCname(tenantId: number, id: number) {
    const d = await this.getById(tenantId, id);
    return { domain: d.domain, cnameTarget: d.cnameTarget, instruction: `请在您的 DNS 中把 ${d.domain} 的 CNAME 解析到 ${d.cnameTarget}` };
  }

  /**
   * 添加域名 — 主链路:
   *   1. 校验唯一性(全局唯一)
   *   2. 生成 cnameTarget,入库 status=pending
   *   3. 调 bff-edge POST /internal/edge/domains(传 serverNames=[domain, cnameTarget])
   *   4. 成功:写 edgeDomainId、edgeSyncedAt、status=dns_pending
   *   5. 失败:写 lastError、status=failed
   *
   * 前置:Tenant.edgeUserId 必须已就绪(Phase 3 Step 3 异步 provision 完成),否则 422 抛错。
   * 客户应先轮询 /edge-provision/me 等到 status=done 再加域名(前端可拦截)。
   */
  async add(tenantId: number, dto: AddDomainDto) {
    const domain = dto.domain.trim().toLowerCase();
    const existing = await this.prisma.saasDomain.findUnique({ where: { domain } });
    if (existing) {
      if (existing.tenantId === tenantId) {
        throw new ConflictException("您已接入过此域名");
      }
      throw new ConflictException("此域名已被其他用户接入");
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, edgeUserId: true },
    });
    if (!tenant) throw new NotFoundException("tenant not found");
    if (!tenant.edgeUserId) {
      throw new BadRequestException(
        "GoEdge 账户尚未就绪 — 请等待异步 provision 完成(轮询 /api/v1/saas/edge-provision/me 看 status=done 后重试)",
      );
    }

    const cnameTarget = this.genCnameTarget();
    const originAddr = this.normalizeOrigin(dto.originHost);
    // 缺源站时给个明显占位让 GoEdge 不拒;客户后续通过 PATCH 改源站(本步不做)
    const defaultOrigin = "http://127.0.0.1:8080";

    const created = await this.prisma.saasDomain.create({
      data: {
        tenantId,
        domain,
        cnameTarget,
        originHost: dto.originHost?.trim() || null,
        status: "pending",
      },
    });

    // 调 bff-edge — 失败立即写 status=failed 返回 502
    let res: Response;
    try {
      res = await fetch(`${this.bffBase}/internal/edge/domains`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          tenantId,
          edgeUserId: tenant.edgeUserId,
          serverNames: [domain, cnameTarget],
          originAddrs: [originAddr || defaultOrigin],
        }),
      });
    } catch (e: any) {
      await this.markFailed(created.id, "BFF_EDGE_UNREACHABLE", String(e?.message || e));
      throw new BadRequestException({ code: "BFF_EDGE_UNREACHABLE", message: String(e?.message || e) });
    }

    if (!res.ok) {
      let body: any = null;
      try { body = await res.json(); } catch { /* */ }
      const code = body?.code || `HTTP_${res.status}`;
      const reason = body?.message || `bff-edge returned ${res.status}`;
      await this.markFailed(created.id, code, reason);
      // 把 bff-edge 的 HTTP 状态码原样透回(409/400/502 等)
      throw new BadRequestException({ code, message: reason, bffStatus: res.status });
    }

    const body = await res.json() as { edgeDomainId: number };
    if (!body?.edgeDomainId) {
      await this.markFailed(created.id, "BFF_EDGE_BAD_RESPONSE", "missing edgeDomainId");
      throw new BadRequestException({ code: "BFF_EDGE_BAD_RESPONSE" });
    }

    const updated = await this.prisma.saasDomain.update({
      where: { id: created.id },
      data: {
        edgeDomainId: body.edgeDomainId,
        edgeSyncedAt: new Date(),
        status: "dns_pending",        // 等用户 DNS 配 CNAME
        lastError: null,
      },
    });

    this.logger.log(`tenant=${tenantId} added domain=${domain} → edgeDomainId=${body.edgeDomainId} cname=${cnameTarget}`);
    return updated;
  }

  async remove(tenantId: number, id: number) {
    const d = await this.getById(tenantId, id);
    // 调 bff-edge 删 GoEdge server(若已绑定 edgeDomainId)
    if (d.edgeDomainId) {
      try {
        await fetch(`${this.bffBase}/internal/edge/domains/${d.edgeDomainId}`, {
          method: "DELETE",
          headers: this.headers(),
        });
      } catch (e: any) {
        this.logger.warn(`remove tenant=${tenantId} domain=${d.domain}: bff-edge delete failed, 继续删本地: ${e?.message || e}`);
      }
    }
    await this.prisma.saasDomain.delete({ where: { id: d.id } });
    return { ok: true };
  }

  /** 用户主动暂停 — 不动 GoEdge,只置本地状态(Step 6+ 才推到 GoEdge updateServerIsOn) */
  async pause(tenantId: number, id: number) {
    const d = await this.getById(tenantId, id);
    if (d.status === "paused") return d;
    return this.prisma.saasDomain.update({
      where: { id: d.id },
      data: { status: "paused" },
    });
  }

  async resume(tenantId: number, id: number) {
    const d = await this.getById(tenantId, id);
    if (d.status !== "paused") return d;
    return this.prisma.saasDomain.update({
      where: { id: d.id },
      data: { status: d.edgeDomainId ? "dns_pending" : "pending" },
    });
  }

  private async markFailed(id: number, code: string, reason: string) {
    await this.prisma.saasDomain.update({
      where: { id },
      data: {
        status: "failed",
        lastError: `${code}: ${reason}`,
        lastErrorAt: new Date(),
      },
    });
  }
}
