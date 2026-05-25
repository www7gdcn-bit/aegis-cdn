#!/usr/bin/env bash
# scripts/e2e.sh — 完整端到端测试(13 步)
# 用法:bash scripts/e2e.sh
# env 覆盖:TEST_REAL_DOMAIN / TEST_ORIGIN / TEST_TENANT_ID / etc(见 lib/common.sh)
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

DIR="$(cd "$(dirname "$0")" && pwd)"

step "AegisCDN 全链路 E2E"

# 1-6) 基础服务巡检 — 直接 source 各 check(累计 PASS/FAIL 到本进程)
run_check() {
    local script="$1"; local label="$2"
    info "[$label] 跑 $script"
    if bash "$DIR/$script"; then :; else
        fail "[$label] $script 失败"
    fi
}

step "1/13  Docker"        ; run_check check-docker.sh   "1/13 docker"
step "2/13  MySQL"         ; run_check check-mysql.sh    "2/13 mysql"
step "3/13  Redis"         ; run_check check-redis.sh    "3/13 redis"
step "4/13  EdgeAPI"       ; run_check check-edgeapi.sh  "4/13 edgeapi"
step "5/13  bff-edge"      ; run_check check-bff.sh      "5/13 bff-edge"
step "6/13  EdgeNode"      ; run_check check-edgenode.sh "6/13 edgenode"

# 7) 域名解析(若 TEST_REAL_DOMAIN 设)
step "7/13  域名解析"
if [ -n "$TEST_REAL_DOMAIN" ]; then
    run_check test-domain.sh "7/13 dns"
else
    skip "TEST_REAL_DOMAIN 未设,跳过"
fi

# 8) 80
step "8/13  EdgeNode :80"
run_check test-80.sh "8/13 :80"

# 9) 443
step "9/13  EdgeNode :443"
run_check test-443.sh "9/13 :443"

# 10) 源站
step "10/13  源站直连"
run_check test-origin.sh "10/13 origin"

# 11) TLS / 证书 issuer
step "11/13  TLS 证书 issuer"
if [ -n "$TEST_REAL_DOMAIN" ]; then
    run_check test-ssl.sh "11/13 ssl"
else
    skip "无 TEST_REAL_DOMAIN"
fi

# 12) ACME 状态
step "12/13  ACME"
run_check test-acme.sh "12/13 acme"

# 13) bff-edge API probe + 创建测试 user/domain(幂等)
step "13/13  bff-edge API + createUser/createDomain"
run_check test-api.sh "13/13 api-probe"

# 13.5) E2E user / domain(幂等,直接复用 aegis-e2e.sh 已有逻辑的子集)
if container_running aegis-bff-edge && container_running aegis-mysql; then
    info "创建测试 user/domain(幂等:存在则复用)"
    TOKEN="$(env_get AEGIS_INTERNAL_SECRET)"

    # createUser
    user_payload=$(printf '{"tenantId":%d,"username":"%s","email":"%s"}' \
        "$TEST_TENANT_ID" "$TEST_USERNAME" "$TEST_EMAIL")
    resp=$(curl -sS -m 30 -w '\n%{http_code}' \
        -H 'Content-Type: application/json' \
        -H "X-Aegis-Internal-Token: $TOKEN" \
        -X POST "$BFF/internal/edge/users" -d "$user_payload" 2>&1 || true)
    code=$(printf '%s' "$resp" | tail -1); body=$(printf '%s' "$resp" | sed '$d')

    case "$code" in
        200|201) EDGE_USER_ID=$(echo "$body" | grep -oE '"edgeUserId":[0-9]+' | head -1 | grep -oE '[0-9]+')
                 pass "createUser HTTP=$code edgeUserId=$EDGE_USER_ID" ;;
        409)     EDGE_USER_ID=$(mysql_q "SELECT id FROM edgeUsers WHERE username='$TEST_USERNAME' ORDER BY id DESC LIMIT 1;")
                 pass "createUser 409 → 复用 edgeUserId=$EDGE_USER_ID(幂等)" ;;
        *)       fail "createUser HTTP=$code body=$body" ;;
    esac

    # createDomain
    if [ -n "${EDGE_USER_ID:-}" ]; then
        list=$(curl -sS -m 30 -H "X-Aegis-Internal-Token: $TOKEN" \
            "$BFF/internal/edge/domains?edgeUserId=$EDGE_USER_ID" 2>&1)
        if echo "$list" | grep -q "\"name\":\"$TEST_DOMAIN\""; then
            EDGE_DOMAIN_ID=$(mysql_q "SELECT id FROM edgeServers WHERE name='$TEST_DOMAIN' ORDER BY id DESC LIMIT 1;")
            skip "createDomain 已存在 → edgeDomainId=$EDGE_DOMAIN_ID(幂等)"
        else
            dom_payload=$(printf '{"tenantId":%d,"edgeUserId":%d,"serverNames":["%s"],"originAddrs":["%s"]}' \
                "$TEST_TENANT_ID" "$EDGE_USER_ID" "$TEST_DOMAIN" "$TEST_ORIGIN")
            resp=$(curl -sS -m 60 -w '\n%{http_code}' \
                -H 'Content-Type: application/json' \
                -H "X-Aegis-Internal-Token: $TOKEN" \
                -X POST "$BFF/internal/edge/domains" -d "$dom_payload" 2>&1 || true)
            code=$(printf '%s' "$resp" | tail -1); body=$(printf '%s' "$resp" | sed '$d')
            case "$code" in
                200|201) EDGE_DOMAIN_ID=$(echo "$body" | grep -oE '"edgeDomainId":[0-9]+' | head -1 | grep -oE '[0-9]+')
                         pass "createDomain HTTP=$code edgeDomainId=$EDGE_DOMAIN_ID" ;;
                409)     EDGE_DOMAIN_ID=$(mysql_q "SELECT id FROM edgeServers WHERE name='$TEST_DOMAIN' ORDER BY id DESC LIMIT 1;")
                         skip "createDomain 409 → 复用 edgeDomainId=$EDGE_DOMAIN_ID" ;;
                *)       fail "createDomain HTTP=$code body=$body" ;;
            esac
        fi
    fi
fi

summary "E2E 全链路总结"
exit_code
