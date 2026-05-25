#!/usr/bin/env bash
# scripts/check-mysql.sh — MySQL 连通 + 关键表行数
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

banner "MySQL 健康检查"

container_running aegis-mysql || { fail "aegis-mysql 未 running"; summary; exit 1; }
pass "aegis-mysql container running"

[ "$(container_health aegis-mysql)" = "healthy" ] \
    && pass "healthcheck = healthy" \
    || warn "healthcheck != healthy(可能还在 start_period 内)"

if ! mysql_alive; then
    fail "mysql ping 失败 — 检查 MYSQL_ROOT_PASSWORD 是否与 .env 一致"
    summary; exit 1
fi
pass "mysql ping 成功(SELECT 1)"

for tbl in edgeNodeClusters edgeNodes edgeUsers edgeServers edgeSSLCerts edgeACMETasks edgeACMEUsers edgeIPLists edgeIPItems; do
    n="$(mysql_q "SELECT COUNT(*) FROM $tbl;" 2>/dev/null)"
    if [ -n "$n" ]; then
        info "  $tbl rows = $n"
    else
        warn "  $tbl 表不存在或查询失败"
    fi
done

# 关键状态:edgeNodeClusters id=1
if [ -n "$(mysql_q "SELECT id FROM edgeNodeClusters WHERE id=1;")" ]; then
    pass "edgeNodeClusters id=1 存在"
else
    fail "edgeNodeClusters id=1 不存在 — EdgeAPI setup 未完成"
    action "看 docker logs aegis-edgeapi 确认 setup OK,或清 aegis-edgeapi-configs 卷重启"
fi

summary "MySQL 检查总结"
exit_code
