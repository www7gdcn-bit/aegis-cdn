#!/usr/bin/env bash
# scripts/test-443.sh — EdgeNode :443(HTTPS)对外连通
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

banner "EdgeNode :443 测试"

h443=$(env_get EDGE_NODE_HTTPS_PORT); h443="${h443:-8443}"

if timeout 3 bash -c ">/dev/tcp/127.0.0.1/$h443" 2>/dev/null; then
    pass "宿主 :$h443 监听中"
else
    fail "宿主 :$h443 不通"; summary; exit 1
fi

if [ -n "$TEST_REAL_DOMAIN" ]; then
    info "GET https://127.0.0.1:$h443/ -H 'Host: $TEST_REAL_DOMAIN' --resolve"
    out=$(curl -sS -o /dev/null -m 8 -w 'HTTP=%{http_code} time=%{time_total}s ssl_verify=%{ssl_verify_result}\n' \
        --resolve "$TEST_REAL_DOMAIN:$h443:127.0.0.1" \
        -k "https://$TEST_REAL_DOMAIN:$h443/" 2>&1)
    code=$(echo "$out" | grep -oE 'HTTP=[0-9]+' | cut -d= -f2)
    case "$code" in
        2*|3*) pass "HTTPS 链路通:$out" ;;
        404)   warn "返 404:$out" ;;
        000|"") fail "无响应(TLS 握手可能失败,跑 test-ssl.sh 详查)" ;;
        *)     warn "HTTP=$code:$out" ;;
    esac
else
    skip "TEST_REAL_DOMAIN 未设,跳过 HTTPS GET"
fi

summary "443 端口测试总结"
exit_code
