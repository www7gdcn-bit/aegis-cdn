import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { SslService } from "./ssl.service";

/**
 * SslAutoIssueCron — 每 5 分钟扫:
 *   - status=active && sslStatus in [none, failed] → 自动签发
 *   - status=active && sslStatus=issued && sslExpiresAt 在 30 天内 → 自动续期
 *
 * 关闭:SSL_AUTO_CRON=off
 *
 * 注:每次签发阻塞 30s-2min(LE 实际签发),5min 周期能容纳 1-3 次试,
 * batchSize 设小一些(10)避免阻塞过久;同时 running flag 防 reentry。
 */
@Injectable()
export class SslAutoIssueCron {
  private readonly logger = new Logger(SslAutoIssueCron.name);
  private readonly enabled = (process.env.SSL_AUTO_CRON || "on").toLowerCase() !== "off";
  private running = false;

  constructor(private svc: SslService) {
    if (!this.enabled) {
      this.logger.warn("SslAutoIssueCron disabled by SSL_AUTO_CRON=off");
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async tick() {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      await this.svc.runAutoIssueBatch(10);
    } catch (e: any) {
      this.logger.error(`ssl cron tick error: ${e?.message || e}`);
    } finally {
      this.running = false;
    }
  }
}
