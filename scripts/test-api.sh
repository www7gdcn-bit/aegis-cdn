#!/usr/bin/env bash
# scripts/test-api.sh — bff-edge 全部 /internal/edge/* 端点轮询
#   不会创建脏数据 — 仅 GET / probe
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

banner "bff-edge API 全端点轮询"

container_running aegis-bff-edge || { fail "bff-edge 未起"; summary; exit 1; }
TOKEN="$(env_get AEGIS_INTERNAL_SECRET)"
[ -n "$TOKEN" ] || { fail "AEGIS_INTERNAL_SECRET 未配"; summary; exit 1; }

# probe 函数:GET 一个 endpoint 看返回码
probe() {
    local label="$1"; local method="$2"; local path="$3"
    local code
    code=$(curl -sS -o /dev/null -m 8 -w '%{http_code}' \
        -X "$method" \
        -H "X-Aegis-Internal-Token: $TOKEN" \
        "$BFF$path" 2>/dev/null || echo "000")
    case "$code" in
        200|201|204) pass "$method $path → $code  ($label)" ;;
        400|404|409) warn "$method $path → $code  ($label,业务可接受)" ;;
        401|403)     fail "$method $path → $code  ($label,鉴权问题)" ;;
        000|"")      fail "$method $path → 无响应  ($label)" ;;
        *)           warn "$method $path → $code  ($label)" ;;
    esac
}

# 1) /health
probe "公开 health"        GET    /health
# 2) users
probe "users.findById(1)"  GET    /internal/edge/users/1
# 3) domains
probe "domains.list 全部"  GET    "/internal/edge/domains?edgeUserId=1"
# 4) ssl
probe "ssl.certs.list"     GET    /internal/edge/ssl/certs
probe "ssl.certs.findById" GET    /internal/edge/ssl/certs/1
# 5) blocks
probe "blocks.list"        GET    /internal/edge/blocks
# 6) nodes
probe "nodes.list"         GET    /internal/edge/nodes
probe "nodes.findById"     GET    /internal/edge/nodes/1

# /health 内部深度
probe "internal/health"    GET    /internal/edge/health

summary "API 端点轮询总结"
exit_code
