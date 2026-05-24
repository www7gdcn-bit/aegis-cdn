import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { CreateBlockDto, ListBlocksQueryDto } from "./dto";

// 判断 value 是 IPv4/IPv6/CIDR/范围(仅基础校验,详细 RFC 留 Linux libnet 验)
const IPV4 = /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
const IPV4_CIDR = /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)\/(3[0-2]|[12]?\d)$/;
const IPV6_LOOSE = /^[0-9a-fA-F:]+$/;
const IPV6_CIDR = /^[0-9a-fA-F:]+\/(12[0-8]|1[01]\d|\d{1,2})$/;

function detectIpAddrType(value: string): "ipv4" | "ipv6" | null {
  if (IPV4.test(value) || IPV4_CIDR.test(value)) return "ipv4";
  if (IPV6_CIDR.test(value) || (IPV6_LOOSE.test(value) && value.includes(":"))) return "ipv6";
  return null;
}

@Injectable()
export class GlobalBlocksService {
  private readonly logger = new Logger(GlobalBlocksService.name);
  private readonly bffBase = (process.env.BFF_EDGE_INTERNAL_URL || "http://localhost:4002").replace(/\/$/, "");

  constructor(private prisma: PrismaService) {}

  private headers() {
    return {
      "Content-Type": "application/json",
      "X-Aegis-Internal-Token": process.env.AEGIS_INTERNAL_SECRET || "",
    };
  }

  private get globalListId(): number {
    const v = Number(process.env.EDGE_GLOBAL_BLOCK_LIST_ID || "0");
    return v > 0 ? v : 0;
  }

  // === 创建封禁 ===

  async create(dto: CreateBlockDto, createdBy?: number) {
    // 校验 + 标准化
    const value = dto.value.trim();
    if (!value) throw new BadRequestException("value required");
    if (dto.type === "domain" && !dto.domainId) {
      throw new BadRequestException("domain 维度封禁必须传 domainId");
    }
    if (dto.type === "ip" && !IPV4.test(value) && !IPV6_LOOSE.test(value)) {
      throw new BadRequestException(`value=${value} 不是合法 IP(ip 类型不允许 CIDR/范围,请用 cidr 类型)`);
    }
    if (dto.type === "cidr" && !IPV4_CIDR.test(value) && !IPV6_CIDR.test(value)) {
      throw new BadRequestException(`value=${value} 不是合法 CIDR`);
    }
    if (dto.type === "tenant") {
      // value 应为数字 tenantId 字符串
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) {
        throw new BadRequestException(`tenant 维度封禁的 value 应为 tenantId 数字字符串`);
      }
    }

    // 同 type+value 已 active 时拒绝
    const dup = await this.prisma.globalBlock.findFirst({
      where: { type: dto.type, value, status: "active" },
    });
    if (dup) {
      throw new ConflictException(`已存在 active 的 ${dto.type} 封禁:id=${dup.id}`);
    }

    const expiresAt = dto.isPermanent ? null : (dto.expiresAt ? new Date(dto.expiresAt) : null);
    const isPermanent = !!dto.isPermanent;
    const block = await this.prisma.globalBlock.create({
      data: {
        type: dto.type,
        value,
        tenantId: dto.tenantId ?? null,
        domainId: dto.domainId ?? null,
        reason: dto.reason ?? null,
        isPermanent,
        expiresAt,
        status: "active",
        createdBy: createdBy ?? null,
        syncStatus: dto.type === "ip" || dto.type === "cidr" ? "pending" : "skipped",
      },
    });

    // 同步到 GoEdge(仅 ip|cidr)
    if (block.syncStatus === "pending") {
      await this.syncToEdge(block.id).catch((e) => {
        this.logger.warn(`syncToEdge id=${block.id} async err: ${e?.message || e}`);
      });
    }

    return this.prisma.globalBlock.findUniqueOrThrow({ where: { id: block.id } });
  }

  // === 同步到 GoEdge(addToBlocklist)===

  async syncToEdge(blockId: number) {
    const b = await this.prisma.globalBlock.findUnique({ where: { id: blockId } });
    if (!b) throw new NotFoundException("block not found");
    if (b.status !== "active") return;
    if (b.type !== "ip" && b.type !== "cidr") return;

    const listId = this.globalListId;
    if (!listId) {
      await this.prisma.globalBlock.update({
        where: { id: blockId },
        data: {
          syncStatus: "failed",
          syncError: "EDGE_GLOBAL_BLOCK_LIST_ID 未配置 — 请运营在 GoEdge 创建 type=black/isGlobal=true 的 IPList 并把 id 配到 env",
        },
      });
      return;
    }

    const ipAddrType = detectIpAddrType(b.value);
    if (!ipAddrType) {
      await this.prisma.globalBlock.update({
        where: { id: blockId },
        data: { syncStatus: "failed", syncError: `value=${b.value} 无法识别为 ipv4/ipv6` },
      });
      return;
    }

    let res: Response;
    try {
      res = await fetch(`${this.bffBase}/internal/edge/blocks`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          ipListId: listId,
          value: b.value,
          type: ipAddrType,
          reason: b.reason || "",
          expiredAt: b.expiresAt?.toISOString(),
        }),
      });
    } catch (e: any) {
      await this.prisma.globalBlock.update({
        where: { id: blockId },
        data: { syncStatus: "failed", syncError: `BFF_EDGE_UNREACHABLE: ${e?.message || e}` },
      });
      this.logger.warn(`sync id=${blockId} unreachable: ${e?.message || e}`);
      return;
    }

    if (!res.ok) {
      let body: any = null;
      try { body = await res.json(); } catch { /* */ }
      const code = body?.code || `HTTP_${res.status}`;
      const reason = body?.message || `bff-edge returned ${res.status}`;
      await this.prisma.globalBlock.update({
        where: { id: blockId },
        data: { syncStatus: "failed", syncError: `${code}: ${reason}` },
      });
      this.logger.warn(`sync id=${blockId} FAIL: ${code} ${reason}`);
      return;
    }

    const body = await res.json() as { ipItemId: number; ipListId: number };
    await this.prisma.globalBlock.update({
      where: { id: blockId },
      data: {
        edgeBlockId: body.ipItemId,
        edgeIpListId: body.ipListId,
        syncStatus: "synced",
        syncError: null,
        syncedAt: new Date(),
      },
    });
    this.logger.log(`block id=${blockId} synced → ipItemId=${body.ipItemId}`);
  }

  // === 释放封禁 ===

  async release(blockId: number, releasedBy?: number, reason?: string) {
    const b = await this.prisma.globalBlock.findUnique({ where: { id: blockId } });
    if (!b) throw new NotFoundException("block not found");
    if (b.status !== "active") {
      throw new BadRequestException(`block id=${blockId} status=${b.status},不可释放`);
    }

    // 先同步到 GoEdge 解封,后更本地状态(避免本地 released 但 GoEdge 仍封)
    if (b.syncStatus === "synced" && (b.type === "ip" || b.type === "cidr")) {
      let res: Response;
      try {
        res = await fetch(`${this.bffBase}/internal/edge/blocks/release`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify(
            b.edgeBlockId
              ? { ipItemId: b.edgeBlockId }
              : { ipListId: b.edgeIpListId, value: b.value },
          ),
        });
      } catch (e: any) {
        // bff-edge 不可达 → 不释放 saas 状态;返结构化错误让 admin 知晓
        throw new BadRequestException({
          code: "BFF_EDGE_UNREACHABLE",
          message: `bff-edge release 失败,保留 active: ${e?.message || e}`,
        });
      }
      if (!res.ok) {
        let body: any = null;
        try { body = await res.json(); } catch { /* */ }
        // bff-edge 报 404 EDGE_BLOCK_NOT_FOUND 时可视为 已不在 GoEdge,允许本地 released
        if (res.status !== 404) {
          throw new BadRequestException({
            code: body?.code || `HTTP_${res.status}`,
            message: body?.message || `bff-edge returned ${res.status}`,
          });
        }
        this.logger.warn(`release id=${blockId}: bff-edge returns 404,假定 GoEdge 已无此条目,继续本地 released`);
      }
    }

    return this.prisma.globalBlock.update({
      where: { id: blockId },
      data: {
        status: "released",
        releasedBy: releasedBy ?? null,
        releasedAt: new Date(),
        releaseReason: reason ?? null,
      },
    });
  }

  // === 查询 ===

  /** 用户视角:仅自己 tenant 触发的封禁(tenantId=自己) */
  async listForTenant(tenantId: number, query: ListBlocksQueryDto) {
    return this.prisma.globalBlock.findMany({
      where: {
        tenantId,                    // 用户只能见自己触发/相关的封禁
        ...(query.type ? { type: query.type } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.domainId ? { domainId: query.domainId } : {}),
        ...(query.value ? { value: { contains: query.value } } : {}),
        ...(query.reason ? { reason: { contains: query.reason } } : {}),
      },
      orderBy: { id: "desc" },
      take: 200,
      select: {
        id: true, type: true, value: true,
        reason: true, status: true, isPermanent: true, expiresAt: true,
        domainId: true, createdAt: true, releasedAt: true,
      },
    });
  }

  /** 管理员视角:全平台 */
  async listForAdmin(query: ListBlocksQueryDto) {
    return this.prisma.globalBlock.findMany({
      where: {
        ...(query.type ? { type: query.type } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.tenantId ? { tenantId: query.tenantId } : {}),
        ...(query.domainId ? { domainId: query.domainId } : {}),
        ...(query.value ? { value: { contains: query.value } } : {}),
        ...(query.reason ? { reason: { contains: query.reason } } : {}),
      },
      orderBy: { id: "desc" },
      take: 500,
      // 全字段返,运营排查用
    });
  }

  async getById(blockId: number) {
    return this.prisma.globalBlock.findUniqueOrThrow({ where: { id: blockId } });
  }

  /** 同步失败的 admin 手动 retry */
  async retrySync(blockId: number) {
    const b = await this.prisma.globalBlock.findUnique({ where: { id: blockId } });
    if (!b) throw new NotFoundException("block not found");
    if (b.status !== "active") throw new BadRequestException("仅 active 状态可重试同步");
    if (b.type !== "ip" && b.type !== "cidr") throw new BadRequestException("仅 ip/cidr 类型需要同步");
    await this.prisma.globalBlock.update({
      where: { id: blockId },
      data: { syncStatus: "pending", syncError: null },
    });
    await this.syncToEdge(blockId);
    return this.prisma.globalBlock.findUniqueOrThrow({ where: { id: blockId } });
  }
}
