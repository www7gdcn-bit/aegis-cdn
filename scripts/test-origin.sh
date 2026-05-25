#!/usr/bin/env bash
# scripts/test-origin.sh — 直连源站测试(不走 CDN)
#   验证 TEST_ORIGIN 是否真的可达 + 返 200
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

banner "源站直连测试 ($TEST_ORIGIN)"

if [ -z "$TEST_ORIGIN" ]; then
    skip "TEST_ORIGIN 未设"; summary; exit 0
fi

info "GET $TEST_ORIGIN (5s timeout)"
out=$(curl -sS -o /dev/null -m 5 -w 'HTTP=%{http_code} time=%{time_total}s size=%{size_download}\n' "$TEST_ORIGIN" 2>&1 || true)
code=$(echo "$out" | grep -oE 'HTTP=[0-9]+' | head -1 | cut -d= -f2)
case "$code" in
    2*|3*) pass "源站可达:$out" ;;
    4*|5*) warn "源站返 $code:$out(业务错,但 TCP 通)" ;;
    "")    fail "源站无响应 / 超时" ;;
    *)     fail "源站异常:$out" ;;
esac

# 5 次平均延迟
if [ -n "$code" ] && [[ "$code" == 2* || "$code" == 3* ]]; then
    info "5 次延迟采样:"
    for i in 1 2 3 4 5; do
        t=$(curl -sS -o /dev/null -m 5 -w '%{time_total}' "$TEST_ORIGIN" 2>/dev/null || echo "-")
        echo "    #$i: ${t}s"
    done
fi

summary "源站测试总结"
exit_code
