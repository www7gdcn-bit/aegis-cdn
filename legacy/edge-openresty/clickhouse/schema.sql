-- AegisCDN 攻击/访问日志(ClickHouse)。edge-agent 把边缘 JSON 日志批量写入这里。
-- 按天分区,按套餐设 TTL;聚合走物化视图,后台可视化读聚合表(秒级)。

CREATE DATABASE IF NOT EXISTS aegis;

-- 明细:每条请求的决策记录
CREATE TABLE IF NOT EXISTS aegis.request_log
(
    ts          DateTime,
    domain      LowCardinality(String),
    ip          String,
    country     LowCardinality(String),
    asn         UInt32,
    method      LowCardinality(String),
    uri         String,
    status      UInt16,
    action      LowCardinality(String),   -- allow | challenge | block
    risk        UInt8,                      -- 0-100
    rule        String,
    reason      String,
    bot         LowCardinality(String),
    ua          String,
    bytes       UInt64,
    rt          Float32,                    -- 请求耗时(秒)
    ray         String
)
ENGINE = MergeTree
PARTITION BY toYYYYMMDD(ts)
ORDER BY (domain, ts, ip)
TTL ts + INTERVAL 30 DAY;                   -- 套餐相关:Starter 7d / Business 30d / Enterprise 90d+

-- 每分钟聚合(可视化:QPS / 拦截 / 风险趋势)
CREATE TABLE IF NOT EXISTS aegis.traffic_1m
(
    minute      DateTime,
    domain      LowCardinality(String),
    requests    UInt64,
    blocked     UInt64,
    challenged  UInt64,
    bytes       UInt64,
    avg_risk    Float32
)
ENGINE = SummingMergeTree
PARTITION BY toYYYYMMDD(minute)
ORDER BY (domain, minute);

CREATE MATERIALIZED VIEW IF NOT EXISTS aegis.mv_traffic_1m TO aegis.traffic_1m AS
SELECT
    toStartOfMinute(ts)                              AS minute,
    domain,
    count()                                          AS requests,
    countIf(action = 'block')                        AS blocked,
    countIf(action = 'challenge')                    AS challenged,
    sum(bytes)                                       AS bytes,
    avg(risk)                                        AS avg_risk
FROM aegis.request_log
GROUP BY minute, domain;

-- Top 攻击来源(按 IP / ASN / 国家)可直接从 request_log 聚合查询:
--   SELECT ip, count() c FROM aegis.request_log
--   WHERE action='block' AND ts > now()-3600 GROUP BY ip ORDER BY c DESC LIMIT 20;
