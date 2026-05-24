import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { InternalTokenGuard } from "../internal-token.guard";
import {
  AccessLogEntry, AttackLogEntry, BanLogEntry,
  CcLogEntry, ChallengeLogEntry, LogBatchDto, WafLogEntry,
} from "./log-types";

/**
 * 日志接入占位端点(Phase 2 Step D.5)。
 *
 * **意图**:为未来独立日志服务器 / ClickHouse / analytics-svc 提前留入口契约,
 * EdgeNode 与 analytics-svc 对接时只需打这 6 个 URL,不需要等 saas-svc 改代码。
 *
 * **当前行为(Phase 2)**:接收 + 返回 202 Accepted,**不落库、不走队列、不消费**。
 *
 * **未来归属(Phase 8)**:整套接口将搬到 services/analytics-svc/,
 * 直写 ClickHouse(request_log / attack_event 等)。saas-svc 不再持有日志业务。
 *
 * 端点均守 InternalTokenGuard(X-Aegis-Internal-Token),与其他 /internal/* 一致。
 */
@UseGuards(InternalTokenGuard)
@Controller("internal/log")
export class InternalLogIngestController {
  // 1) 访问日志
  @Post("access")
  @HttpCode(HttpStatus.ACCEPTED)
  ingestAccess(@Body() _batch: LogBatchDto<AccessLogEntry>) {
    // TODO(Phase 8 analytics-svc):写 ClickHouse request_log
    return { accepted: true, target: "access" };
  }

  // 2) 攻击事件汇总(WAF/CC/限频)
  @Post("attack")
  @HttpCode(HttpStatus.ACCEPTED)
  ingestAttack(@Body() _batch: LogBatchDto<AttackLogEntry>) {
    // TODO(Phase 8):写 ClickHouse attack_event
    return { accepted: true, target: "attack" };
  }

  // 3) WAF 命中细节
  @Post("waf")
  @HttpCode(HttpStatus.ACCEPTED)
  ingestWaf(@Body() _batch: LogBatchDto<WafLogEntry>) {
    // TODO(Phase 8):写 ClickHouse waf_hit
    return { accepted: true, target: "waf" };
  }

  // 4) CC 防护命中
  @Post("cc")
  @HttpCode(HttpStatus.ACCEPTED)
  ingestCc(@Body() _batch: LogBatchDto<CcLogEntry>) {
    // TODO(Phase 8):写 ClickHouse cc_hit
    return { accepted: true, target: "cc" };
  }

  // 5) 挑战/Captcha 通过/失败
  @Post("challenge")
  @HttpCode(HttpStatus.ACCEPTED)
  ingestChallenge(@Body() _batch: LogBatchDto<ChallengeLogEntry>) {
    // TODO(Phase 8):写 ClickHouse challenge_event
    return { accepted: true, target: "challenge" };
  }

  // 6) 封禁动作
  @Post("ban")
  @HttpCode(HttpStatus.ACCEPTED)
  ingestBan(@Body() _batch: LogBatchDto<BanLogEntry>) {
    // TODO(Phase 8):写 ClickHouse ban_event
    return { accepted: true, target: "ban" };
  }
}
