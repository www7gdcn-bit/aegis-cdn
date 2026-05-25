#!/usr/bin/env bash
# scripts/down.sh — 停止全部服务(保留数据卷)
# 加 --volumes 才删卷:bash scripts/down.sh --volumes
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

banner "停止全部服务"

compose_detect || { fail "compose 未安装"; summary; exit 1; }

if [ "${1:-}" = "--volumes" ] || [ "${1:-}" = "-v" ]; then
    warn "将一并删除数据卷(mysql/redis/postgres/configs/logs 全部清空)"
    read -r -p "确认?输入 yes 继续:" ans
    [ "$ans" = "yes" ] || { info "取消"; exit 0; }
    compose down -v && pass "compose down -v 完成" || { fail "compose down -v 失败"; exit 1; }
else
    compose down && pass "compose down 完成(数据卷保留)" || { fail "compose down 失败"; exit 1; }
fi

summary "停止总结"
exit_code
