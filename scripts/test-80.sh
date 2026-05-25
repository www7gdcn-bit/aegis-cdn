#!/usr/bin/env bash
# scripts/test-80.sh — EdgeNode :80(HTTP)对外连通 + 转发
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

banner "EdgeNode :80 测试"

h80=$(env_get EDGE_NODE_HTTP_PORT); h80="${h80:-8080}"

# 宿主端口监听
if timeout 3 bash -c ">/dev/tcp/127.0.0.1/$h80" 2>/dev/null; then
    pass "宿主 :$h80 监听中"
else
    fail "宿主 :$h80 不通"
    action "检查 EDGE_NODE_HTTP_PORT 与 docker-compose port 映射"
    summary; exit 1
fi

# Host 头 → 域名
if [ -n "$TEST_REAL_DOMAIN" ]; then
    info "GET http://127.0.0.1:$h80/ -H 'Host: $TEST_REAL_DOMAIN'"
    out=$(curl -sS -o /dev/null -m 5 -w 'HTTP=%{http_code} time=%{time_total}s\n' \
        -H "Host: $TEST_REAL_DOMAIN" \
        "http://127.0.0.1:$h80/" 2>&1)
    code=$(echo "$out" | grep -oE 'HTTP=[0-9]+' | cut -d= -f2)
    case "$code" in
        2*|3*) pass "域名 → 80 转发 OK:$out" ;;
        404)   warn "返 404(域名未在 GoEdge 接入 / serverName 未注册):$out" ;;
        000|"") fail "无响应" ;;
        *)     warn "HTTP=$code(可能源站异常):$out" ;;
    esac
else
    skip "TEST_REAL_DOMAIN 未设,跳过域名 → 80 转发测试"
fi

summary "80 端口测试总结"
exit_code
