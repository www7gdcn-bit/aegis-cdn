#!/usr/bin/env bash
# scripts/check-docker.sh — Docker / compose 状态检查
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

banner "Docker / Compose 健康检查"

if ! command -v docker >/dev/null 2>&1; then
    fail "docker CLI 未安装"
    action "https://docs.docker.com/engine/install/"
    summary; exit 1
fi
pass "docker = $(docker --version | head -1)"

docker_ok && pass "docker daemon 在线" || {
    fail "docker daemon 不可达"; action "sudo systemctl start docker"
    summary; exit 1
}

if docker compose version >/dev/null 2>&1; then
    pass "docker compose v2 = $(docker compose version --short)"
elif command -v docker-compose >/dev/null 2>&1; then
    warn "compose v1:$(docker-compose --version | head -1) — 建议升级到 v2"
    action "apt remove docker-compose && apt install docker-compose-plugin"
else
    fail "无 docker compose v2 / docker-compose v1"; summary; exit 1
fi

# 列出 aegis 项目的容器
info "项目容器列表:"
for c in aegis-mysql aegis-redis aegis-edgeapi aegis-edgenode aegis-bff-edge aegis-postgres aegis-saas-svc; do
    st="$(container_status "$c")"
    hl="$(container_health "$c")"
    case "$st" in
        running)
            if [ "$hl" = "healthy" ] || [ "$hl" = "none" ]; then
                pass "  $c → $st / health=$hl"
            else
                warn "  $c → $st / health=$hl"
            fi
            ;;
        missing)  skip "  $c → 未创建(可能未在 profile 中)" ;;
        *)        fail "  $c → $st" ;;
    esac
done

summary "Docker 检查总结"
exit_code
