#!/usr/bin/env bash
# scripts/test-ssl.sh — TLS 证书握手 + Subject/Issuer/有效期
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

banner "TLS 证书测试 ($TEST_REAL_DOMAIN)"

if [ -z "$TEST_REAL_DOMAIN" ]; then
    skip "TEST_REAL_DOMAIN 未设"; summary; exit 0
fi

if ! command -v openssl >/dev/null 2>&1; then
    fail "openssl 未安装"; summary; exit 1
fi

h443=$(env_get EDGE_NODE_HTTPS_PORT); h443="${h443:-8443}"

info "openssl s_client -connect 127.0.0.1:$h443 -servername $TEST_REAL_DOMAIN"
cert=$(echo | openssl s_client -connect "127.0.0.1:$h443" \
    -servername "$TEST_REAL_DOMAIN" -showcerts 2>/dev/null \
    | openssl x509 -noout -subject -issuer -dates 2>/dev/null)

if [ -z "$cert" ]; then
    fail "TLS 握手失败 / 拿不到证书"
    action "看 docker logs aegis-edgenode 查 TLS 错误"
    summary; exit 1
fi

echo "$cert" | sed 's/^/    /'

subj=$(echo "$cert" | grep -oE "subject=.*" | head -1)
issu=$(echo "$cert" | grep -oE "issuer=.*"  | head -1)
notAfter=$(echo "$cert" | grep -oE 'notAfter=.*' | head -1 | cut -d= -f2)

if echo "$subj" | grep -qE "$TEST_REAL_DOMAIN|\*\."; then
    pass "subject 匹配 $TEST_REAL_DOMAIN"
else
    warn "subject 不匹配:$subj"
fi

if echo "$issu" | grep -qiE "Let's Encrypt|ZeroSSL|R3|R10|R11|E5"; then
    pass "issuer = 公网 CA(Let's Encrypt / ZeroSSL)"
elif echo "$issu" | grep -qiE "GoEdge|TeaOS|self-signed"; then
    fail "issuer = GoEdge 默认自签证书(ACME 未生效)"
    action "看 saas-svc 的 SslAutoIssueCron / EdgeAPI edgeACMETasks 表"
else
    info "issuer = $issu"
fi

# 剩余天数
if [ -n "$notAfter" ]; then
    end_ts=$(date -d "$notAfter" +%s 2>/dev/null || echo 0)
    if [ "$end_ts" -gt 0 ]; then
        now_ts=$(date +%s)
        days=$(( (end_ts - now_ts) / 86400 ))
        if [ "$days" -gt 30 ]; then
            pass "剩余 $days 天"
        elif [ "$days" -gt 7 ]; then
            warn "剩余 $days 天(<30 天,临近续期)"
        else
            fail "剩余 $days 天(<7 天,必须立即续期)"
        fi
    fi
fi

summary "TLS 测试总结"
exit_code
