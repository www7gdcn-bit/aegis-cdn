// services/saas-svc/src/modules/internal/log-ingest/log-types.ts
//
// 日志接入 6 个端点的 payload 契约(预留)。
// Phase 2 阶段 saas-svc 不消费这些数据,EdgeNode / analytics-svc 也未对接;
// 留下契约让未来对接零摩擦。Phase 8 起 analytics-svc 替代 saas-svc 真正消费。

import { IsArray, IsInt, IsOptional, IsString } from "class-validator";

// 公共字段:所有日志条目共有
export interface BaseLogEntry {
  ts: number;              // unix ms
  tenantId?: number;       // SaaS 租户 id(可选,未知时为空)
  edgeUserId?: number;     // GoEdge user_id(可选)
  nodeId?: string | number; // 来源 EdgeNode
  serverId?: string | number; // GoEdge server(域名)id
  clientIp?: string;
  country?: string;        // GeoIP 解析
  asn?: number;
}

// 1) /internal/log/access — 访问日志(高频,生产应批量 + 走 ClickHouse 而非 saas-svc)
export interface AccessLogEntry extends BaseLogEntry {
  method: string;
  host?: string;
  uri?: string;
  status?: number;
  bytesSent?: number;
  durationMs?: number;
  ua?: string;
  referer?: string;
  cacheStatus?: string;    // HIT|MISS|EXPIRED|BYPASS
}

// 2) /internal/log/attack — 攻击事件(WAF/CC/限频统一)
export interface AttackLogEntry extends BaseLogEntry {
  attackType: string;      // sqli | xss | rce | cc | rate | bot | ...
  ruleId?: string | number;
  severity?: "low" | "medium" | "high" | "critical";
  action?: string;         // block | challenge | log | captcha
  reason?: string;
  uri?: string;
  ua?: string;
}

// 3) /internal/log/waf — WAF 命中细节(可附原始请求片段)
export interface WafLogEntry extends BaseLogEntry {
  policyId?: number;
  ruleSetId?: number;
  ruleId?: number;
  ruleName?: string;
  matchedField?: string;   // uri | args | body | cookie | header.X
  matchedValue?: string;
  action: string;
}

// 4) /internal/log/cc — CC 防护命中(挑战/限频/封禁)
export interface CcLogEntry extends BaseLogEntry {
  policyId?: number;
  dim?: string;            // ip | uri | cookie | session | ua | asn | country
  threshold?: number;
  observed?: number;       // 实际计数
  action: string;          // allow | challenge | captcha | block
}

// 5) /internal/log/challenge — 挑战/Captcha 通过/失败
export interface ChallengeLogEntry extends BaseLogEntry {
  challengeType: "js_cookie" | "captcha" | "uam" | string;
  result: "passed" | "failed" | "issued";
  attemptCount?: number;
}

// 6) /internal/log/ban — IP/ASN/国家 封禁动作(临时/永久/自动学习)
export interface BanLogEntry extends BaseLogEntry {
  banType: "ip" | "cidr" | "asn" | "country";
  value: string;
  durationSec?: number;    // 0 / 缺 = 永久
  reason?: string;
  source?: "manual" | "auto-learn" | "rule";
}

// 批量 DTO(各端点接受 entries: T[])。
// class-validator 暂只校验外形(数组 + 大小);具体字段校验 Phase 8 用 analytics-svc 自己的 schema。

export class LogBatchDto<T> {
  @IsArray()
  entries!: T[];

  @IsOptional() @IsString()
  source?: string;          // edgenode-1 | edgenode-2 | ...

  @IsOptional() @IsInt()
  batchSeq?: number;        // 可选去重序号
}
