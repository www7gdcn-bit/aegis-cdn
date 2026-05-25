#!/usr/bin/env bash
# scripts/check-bff.sh — bff-edge /health + InternalTokenGuard 双向校验
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

banner "bff-edge 健康检查"

container_running aegis-bff-edge || { fail "aegis-bff-edge 未 running"; summary; exit 1; }
pass "aegis-bff-edge container running"

[ "$(container_health aegis-bff-edge)" = "healthy" ] \
    && pass "healthcheck = healthy" \
    || warn "healthcheck != healthy"

# /health 公开
code=$(curl -sS -o /dev/null -w '%{http_code}' -m 5 "$BFF/health" 2>/dev/null || echo "000")
if [ "$code" = "200" ]; then
    pass "GET /health → 200"
else
    fail "GET /health → $code"
    action "docker logs aegis-bff-edge | tail -50"
fi

# /internal/edge/* 不带 token 应 401
code=$(curl -sS -o /dev/null -w '%{http_code}' -m 5 "$BFF/internal/edge/users/1" 2>/dev/null || echo "000")
if [ "$code" = "401" ]; then
    pass "InternalTokenGuard 工作(无 token 返 401)"
else
    warn "/internal/edge/users/1 无 token 应 401,实得 $code"
fi

# /internal/edge/* 带 token 应非 401(可能 200/4xx 业务)
TOKEN="$(env_get AEGIS_INTERNAL_SECRET)"
if [ -n "$TOKEN" ]; then
    code=$(curl -sS -o /dev/null -w '%{http_code}' -m 5 \
        -H "X-Aegis-Internal-Token: $TOKEN" \
        "$BFF/internal/edge/domains?edgeUserId=1" 2>/dev/null || echo "000")
    if [ "$code" != "401" ] && [ "$code" != "000" ]; then
        pass "带 token /internal/edge/domains?edgeUserId=1 → $code(非 401)"
    else
        fail "带 token 仍返 $code — token 不一致或 bff-edge 没读到 AEGIS_INTERNAL_SECRET"
    fi
fi

# env 关键变量
for v in EDGE_API_MODE EDGE_API_GRPC_ADDR EDGE_DEFAULT_CLUSTER_ID EDGE_API_ADMIN_NODE_ID EDGE_API_DEBUG; do
    val=$(docker exec aegis-bff-edge sh -c "echo \"\$$v\"" 2>/dev/null | tr -d '\r')
    if [ -n "$val" ]; then
        case "$v" in *SECRET*|*ID*) info "  $v=$(mask "$val")" ;; *) info "  $v=$val" ;; esac
    else
        warn "  $v 未设置(容器内)"
    fi
done

summary "bff-edge 检查总结"
exit_code
