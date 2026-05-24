import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DomainVerificationService } from "./domain-verification.service";

/**
 * DomainVerificationCron — 每 60 秒扫一次 status=dns_pending 的域名,跑 DNS CNAME 检测。
 *
 * 关闭条件:DOMAIN_VERIFY_CRON=off
 *
 * Reentry 保护:running flag(避免上一批没跑完就开新批,DNS 慢时累积)
 */
@Injectable()
export class DomainVerificationCron {
  private readonly logger = new Logger(DomainVerificationCron.name);
  private readonly enabled = (process.env.DOMAIN_VERIFY_CRON || "on").toLowerCase() !== "off";
  private running = false;

  constructor(private svc: DomainVerificationService) {
    if (!this.enabled) {
      this.logger.warn("DomainVerificationCron disabled by DOMAIN_VERIFY_CRON=off");
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      await this.svc.runBatch(20);
    } catch (e: any) {
      this.logger.error(`cron tick error: ${e?.message || e}`);
    } finally {
      this.running = false;
    }
  }
}
