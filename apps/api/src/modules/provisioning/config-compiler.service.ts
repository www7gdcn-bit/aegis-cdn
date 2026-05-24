import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { BillingService } from "../billing/billing.service";

// 把某域名的 DB 策略编译成边缘 OpenResty(config.lua)认识的 JSON,并下发到 Redis。
// 边缘 config.lua 读 aegis:cfg:<domain>;waf.lua 读 aegis:waf:<domain>(自定义规则数组)。
@Injectable()
export class ConfigCompilerService {
  constructor(private prisma: PrismaService, private redis: RedisService, private billing: BillingService) {}

  async compileAndPush(domainId: number) {
    const d = await this.prisma.domain.findUnique({
      where: { id: domainId },
      include: { ccPolicy: true, wafPolicy: true, wafRules: true, aclRules: true, rateRules: true },
    });
    if (!d) throw new Error("domain not found");

    // 套餐功能门控:套餐不含的功能即使 DB 有策略也不下发(后端为准,防绕过)
    const quota = await this.billing.getQuota(d.tenantId);
    const feat: any = quota.features || {};

    // 默认限频(域名未配置时)
    const rateRules =
      d.rateRules.length > 0
        ? d.rateRules.map((r) => ({ dim: r.dim, window: r.window, limit: r.limit, algo: r.algo }))
        : [
            { dim: "ip", window: 10, limit: 100, algo: "sliding" },
            { dim: "ip", window: 60, limit: 600, algo: "sliding" },
          ];

    const acl = d.aclRules.filter((r) => r.enabled);
    const pick = (cat: string, lt: string) =>
      acl.filter((r) => r.category === cat && r.listType === lt).map((r) => r.value);

    const cfg = {
      enabled: d.status === "active" && d.reviewStatus === "approved",
      blocked: d.status === "blocked",   // 违规封禁:边缘对该域名硬拦截
      mode: d.ccPolicy?.mode ?? "normal",
      challenge_score: d.challengeScore,
      block_score: d.blockScore,
      bot_challenge_score: d.botChallengeScore,
      // CC 限频:套餐不含 cc 则不下发(Starter 无 CC)
      ratelimit: !feat.cc || d.ccPolicy?.enabled === false ? [] : rateRules,
      challenge: { on_score: true, types: ["js"] },
      ban: { auto: true, base_ttl: 300, max_ttl: 86400 },
      waf: {
        enabled: !!feat.waf && (d.wafPolicy?.enabled ?? true),
        mode: d.wafPolicy?.mode ?? "block",
        rulesets: (d.wafPolicy?.rulesets ?? "sqli,xss,rce,traversal,webshell")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      },
      whitelist: { ip: pick("ip", "allow"), ua: pick("ua", "allow"), asn: [] as string[] },
      blacklist: { country: pick("geo", "deny"), asn: [] as string[] },
    };

    // 自定义 WAF 规则(边缘 waf.lua 优先于内置规则);套餐无 waf 则清空
    const wafRules = (!feat.waf ? [] : d.wafRules.filter((r) => r.enabled))
      .map((r) => ({
        id: `custom-${r.id}`,
        ruleset: r.ruleset,
        target: r.target,
        op: r.op,
        pattern: r.pattern,
        action: r.action,
        severity: r.severity,
      }));

    // 下发到 Redis
    await this.redis.set(`aegis:cfg:${d.name}`, JSON.stringify(cfg));
    await this.redis.set(`aegis:waf:${d.name}`, JSON.stringify(wafRules));

    // 静态 IP 拉黑 → 直接写永久封禁键(边缘 ban.is_banned 命中)
    for (const r of acl.filter((r) => r.category === "ip" && r.listType === "deny")) {
      await this.redis.set(`aegis:ban:${r.value}`, "manual");
    }

    await this.prisma.domain.update({
      where: { id: domainId },
      data: { configVersion: { increment: 1 } },
    });

    return { domain: d.name, cfg, wafRules, version: d.configVersion + 1 };
  }
}
