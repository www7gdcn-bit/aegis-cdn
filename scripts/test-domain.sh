#!/usr/bin/env bash
# scripts/test-domain.sh — 域名解析测试
#   用 TEST_REAL_DOMAIN(.env 或 export)指定真实测试域名
#   默认查 dig A 记录 + CNAME(若 CNAME 指向 aegiscdn)
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

banner "域名解析测试 ($TEST_REAL_DOMAIN)"

if [ -z "$TEST_REAL_DOMAIN" ]; then
    skip "未设 TEST_REAL_DOMAIN,跳过(export TEST_REAL_DOMAIN=your.example.com 后重跑)"
    summary; exit 0
fi

if ! command -v dig >/dev/null 2>&1; then
    warn "dig 未安装,fallback host"
    HAVE_DIG=0
else
    HAVE_DIG=1
fi

CNAME_SUFFIX="$(env_get EDGE_CNAME_SUFFIX)"
CNAME_SUFFIX="${CNAME_SUFFIX:-aegiscdn.com}"

# CNAME
if [ $HAVE_DIG -eq 1 ]; then
    cname=$(dig +short CNAME "$TEST_REAL_DOMAIN" @8.8.8.8 2>/dev/null | head -1 | sed 's/\.$//')
else
    cname=$(host -t CNAME "$TEST_REAL_DOMAIN" 2>/dev/null | grep -oE 'alias for [^ ]+' | awk '{print $3}' | sed 's/\.$//')
fi

if [ -n "$cname" ]; then
    info "CNAME: $TEST_REAL_DOMAIN → $cname"
    if [[ "$cname" == *"$CNAME_SUFFIX"* ]]; then
        pass "CNAME 指向 *.$CNAME_SUFFIX(已接入)"
    else
        warn "CNAME 不指向 *.$CNAME_SUFFIX(可能未配 / 用 A 记录直接指向 EdgeNode)"
    fi
else
    info "无 CNAME 记录,看 A 记录"
fi

# A
if [ $HAVE_DIG -eq 1 ]; then
    a_records=$(dig +short A "$TEST_REAL_DOMAIN" @8.8.8.8 2>/dev/null)
else
    a_records=$(host -t A "$TEST_REAL_DOMAIN" 2>/dev/null | grep -oE 'has address [0-9.]+' | awk '{print $3}')
fi

if [ -n "$a_records" ]; then
    pass "A 记录:"
    echo "$a_records" | sed 's/^/    /'
else
    fail "无 A 记录解析"
    action "在 DNS 服务商配 $TEST_REAL_DOMAIN CNAME → <hex>.$CNAME_SUFFIX(saas-svc 创建域名时分配)"
fi

summary "域名解析总结"
exit_code
