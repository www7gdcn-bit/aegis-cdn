import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { EdgeProvisionService } from "./edge-provision.service";

/**
 * EdgeProvisionCron — 每 30 秒扫一次 PendingEdgeProvision 表,处理 due 的记录。
 *
 * 关闭条件:设 EDGE_PROVISION_CRON=off(便于 dev 单独跑 bff-edge mock 测试时静默)。
 *
 * Multi-instance saas-svc 部署:简单版每个实例都会跑,Postgres 行级锁靠 status 转移做幂等
 *   (从 pending/retrying → 短暂期间另一个 worker 选中同一行会再做一次 — 业务幂等 OK)。
 * 严格防重:Phase 4+ 可加 advisory lock 或 BullMQ。当前 Phase 3 不必。
 */
@Injectable()
export class EdgeProvisionCron {
  private readonly logger = new Logger(EdgeProvisionCron.name);
  private readonly enabled = (process.env.EDGE_PROVISION_CRON || "on").toLowerCase() !== "off";
  private running = false;

  constructor(private svc: EdgeProvisionService) {
    if (!this.enabled) {
      this.logger.warn("EdgeProvisionCron disabled by EDGE_PROVISION_CRON=off");
    }
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async tick() {
    if (!this.enabled) return;
    if (this.running) {
      // 上一轮还没结束 — 跳过,避免堆积
      return;
    }
    this.running = true;
    try {
      await this.svc.retryPending(20);
    } catch (e: any) {
      this.logger.error(`cron tick error: ${e?.message || e}`);
    } finally {
      this.running = false;
    }
  }
}
