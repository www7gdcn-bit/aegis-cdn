import { HttpException, Injectable, Logger } from "@nestjs/common";

// 与 saas-svc /internal/quota/* 端点的契约对齐(独立声明,跨服务不共享类型)
type Features = { cc: boolean; waf: boolean; geo: boolean; bot: boolean; dedicated: boolean };

export type QuotaSnapshot = {
  plan: string;
  status: string;
  domainLimit: number;
  usedDomains: number | null;
  trafficGb: number;
  protectionGbps: number;
  features: Features;
  periodEnd: string | Date;
};

type QuotaCheckResult = {
  allowed: boolean;
  reason?: string;
  status?: number;
  plan?: string;
  domainLimit?: number;
};

/**
 * 调 saas-svc 的 /internal/quota/* 端点做配额门控。
 *
 * apps/api 现已不直接持有 Plan/Subscription 表(Phase 2 D3),
 * 凡涉及套餐能力/域名上限的判断都改走本客户端 RPC。
 *
 * 开发态:saas-svc 未启时 fetch 会失败。设 AEGIS_QUOTA_DEV_BYPASS=true 后:
 *   - check 失败时打 warn 并放行(allowed: true)
 *   - getSnapshot 失败时返回保底快照(features 全 true,无套餐上限)
 * 生产环境不要设此变量,否则配额体系形同虚设。
 */
@Injectable()
export class QuotaClient {
  private readonly logger = new Logger(QuotaClient.name);
  private readonly base = (process.env.SAAS_SVC_INTERNAL_URL || "http://localhost:4001").replace(/\/$/, "");
  private readonly devBypass = process.env.AEGIS_QUOTA_DEV_BYPASS === "true";

  private get token() {
    return process.env.AEGIS_INTERNAL_SECRET || "";
  }

  private headers() {
    return {
      "Content-Type": "application/json",
      "X-Aegis-Internal-Token": this.token,
    };
  }

  private bypassSnapshot(reason: string): QuotaSnapshot {
    this.logger.warn(
      `quota snapshot upstream 不可达,DEV_BYPASS=on,使用保底快照: ${reason}`,
    );
    return {
      plan: "dev-bypass",
      status: "active",
      domainLimit: 9999,
      usedDomains: null,
      trafficGb: 0,
      protectionGbps: 0,
      features: { cc: true, waf: true, geo: true, bot: true, dedicated: true },
      periodEnd: new Date(Date.now() + 365 * 86400_000),
    };
  }

  private bypassCheck(reason: string): QuotaCheckResult {
    this.logger.warn(`quota check upstream 不可达,DEV_BYPASS=on,放行: ${reason}`);
    return { allowed: true };
  }

  private async post(path: string, body: any): Promise<any> {
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
      });
    } catch (e: any) {
      if (this.devBypass) return null;
      throw new HttpException(`quota upstream unreachable: ${e?.message || e}`, 502);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new HttpException(`quota upstream ${res.status}: ${text}`, res.status);
    }
    return res.json();
  }

  private async get(path: string): Promise<any> {
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, { headers: this.headers() });
    } catch (e: any) {
      if (this.devBypass) return null;
      throw new HttpException(`quota upstream unreachable: ${e?.message || e}`, 502);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new HttpException(`quota upstream ${res.status}: ${text}`, res.status);
    }
    return res.json();
  }

  async getSnapshot(tenantId: number): Promise<QuotaSnapshot> {
    const data = await this.get(`/internal/quota/snapshot/${tenantId}`);
    if (data === null) return this.bypassSnapshot(`tenantId=${tenantId}`);
    return data as QuotaSnapshot;
  }

  async getFeatures(tenantId: number): Promise<Features> {
    const snap = await this.getSnapshot(tenantId);
    return snap.features;
  }

  async assertCanAddDomain(tenantId: number, currentDomainCount: number) {
    const r = await this.post("/internal/quota/check", {
      tenantId,
      action: "add_domain",
      currentDomainCount,
    });
    if (r === null) return; // dev bypass
    if (!r.allowed) {
      throw new HttpException(r.reason || "套餐域名配额已达上限,请升级", r.status || 402);
    }
  }

  async assertFeature(tenantId: number, feature: keyof Features, label: string) {
    const r = await this.post("/internal/quota/check", {
      tenantId,
      action: "use_feature",
      feature,
      featureLabel: label,
    });
    if (r === null) return; // dev bypass
    if (!r.allowed) {
      throw new HttpException(r.reason || `当前套餐不支持「${label}」`, r.status || 402);
    }
  }
}
