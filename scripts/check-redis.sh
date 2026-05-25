#!/usr/bin/env bash
# scripts/check-redis.sh — Redis 连通 + INFO 基本指标
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

banner "Redis 健康检查"

container_running aegis-redis || { fail "aegis-redis 未 running"; summary; exit 1; }
pass "aegis-redis container running"

PW="$(env_get REDIS_PASSWORD)"
[ -n "$PW" ] || { fail "REDIS_PASSWORD 未配置"; summary; exit 1; }

pong="$(docker exec aegis-redis redis-cli -a "$PW" --no-auth-warning ping 2>/dev/null | tr -d '\r')"
if [ "$pong" = "PONG" ]; then
    pass "redis-cli ping = PONG"
else
    fail "redis ping 失败:'$pong'(密码可能不对)"
    summary; exit 1
fi

info "redis INFO(精简):"
docker exec aegis-redis redis-cli -a "$PW" --no-auth-warning INFO 2>/dev/null \
    | grep -E "^(redis_version|connected_clients|used_memory_human|db[0-9]+):" | sed 's/^/    /'

# 抽样 GoEdge / 我们 SaaS 在 redis 写入的 key
total="$(docker exec aegis-redis redis-cli -a "$PW" --no-auth-warning DBSIZE 2>/dev/null | tr -d '\r')"
info "DBSIZE = $total"

summary "Redis 检查总结"
exit_code
