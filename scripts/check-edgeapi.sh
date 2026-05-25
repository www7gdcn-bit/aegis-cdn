#!/usr/bin/env bash
# scripts/check-edgeapi.sh — EdgeAPI gRPC 端口 + admin-token + 日志关键词
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

banner "EdgeAPI 健康检查"

container_running aegis-edgeapi || { fail "aegis-edgeapi 未 running"; summary; exit 1; }
pass "aegis-edgeapi container running"

[ "$(container_health aegis-edgeapi)" = "healthy" ] \
    && pass "healthcheck = healthy" \
    || warn "healthcheck != healthy(start_period 60s 内属正常)"

# admin-token.json 存在 → setup 成功标志
if docker exec aegis-edgeapi test -f /app/configs/.admin-token.json 2>/dev/null; then
    pass "/app/configs/.admin-token.json 存在(setup 已完成)"
    nodeid="$(docker exec aegis-edgeapi cat /app/configs/.admin-token.json 2>/dev/null \
        | grep -oE '"adminNodeId"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')"
    [ -n "$nodeid" ] && info "  adminNodeId(前 12) = ${nodeid:0:12}…"
else
    fail "/app/configs/.admin-token.json 不存在 — setup 未跑完"
    action "看 docker logs aegis-edgeapi;清 aegis-edgeapi-configs 卷重启"
fi

# 端口 8003(gRPC) — 容器内 TCP 探测
if docker exec aegis-edgeapi sh -c "echo > /dev/tcp/127.0.0.1/8003" 2>/dev/null; then
    pass "EdgeAPI gRPC 端口 :8003 监听中"
else
    fail "EdgeAPI :8003 不通"
fi

# 日志关键词扫描(最近 100 行)
err_count="$(docker logs --tail 100 aegis-edgeapi 2>&1 | grep -cE "ERROR|FATAL|panic" || true)"
if [ "$err_count" = "0" ]; then
    pass "最近 100 行日志无 ERROR/FATAL/panic"
else
    warn "最近 100 行有 $err_count 条 ERROR/FATAL/panic — bash scripts/logs-edgeapi.sh 详查"
fi

summary "EdgeAPI 检查总结"
exit_code
