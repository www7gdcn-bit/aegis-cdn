#!/usr/bin/env bash
# scripts/up.sh — 启动全部核心服务(幂等)
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

banner "启动核心服务"

if ! docker_ok; then
    fail "docker daemon 不可达"
    action "sudo systemctl start docker"
    summary; exit_code; exit $?
fi
pass "docker daemon 在线"

compose_detect || { fail "docker compose v2 / docker-compose v1 都未安装"; summary; exit_code; exit $?; }
[ "$AEGIS_COMPOSE_V" = "2" ] && pass "compose = v2" || warn "compose = v1(会自动剥离 name: 字段 + 兜底 ContainerConfig bug)"

info "compose up -d --build mysql redis edgeapi edgenode bff-edge --profile bff"
if compose_up_tolerant --build mysql redis edgeapi edgenode bff-edge; then
    pass "compose up 完成"
else
    fail "compose up 失败"
    summary; exit_code; exit $?
fi

summary "启动总结"
exit_code
