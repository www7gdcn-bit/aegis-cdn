#!/usr/bin/env bash
# scripts/restart.sh — 重启全部服务(默认 不重建,加 --build 强制重建)
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

banner "重启核心服务"
compose_detect || { fail "compose 未安装"; summary; exit 1; }

if [ "${1:-}" = "--build" ]; then
    info "restart 模式:--build(强制重建镜像)"
    compose_up_tolerant --build --force-recreate mysql redis edgeapi edgenode bff-edge \
        && pass "restart --build 完成" || { fail "restart --build 失败"; exit 1; }
else
    info "restart 模式:仅重启容器(不重建镜像)"
    for svc in mysql redis edgeapi edgenode bff-edge; do
        compose restart "$svc" >/dev/null 2>&1 && pass "$svc restarted" || warn "$svc restart 失败"
    done
fi

summary "重启总结"
exit_code
