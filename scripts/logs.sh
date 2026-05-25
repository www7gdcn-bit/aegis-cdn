#!/usr/bin/env bash
# scripts/logs.sh — 全容器最近 N 行 + grep 关键词
# 用法:
#   bash scripts/logs.sh             → 默认 50 行,无 grep
#   bash scripts/logs.sh 100         → 100 行
#   bash scripts/logs.sh 100 ERROR   → 100 行 grep ERROR
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

N="${1:-50}"
PATTERN="${2:-}"

banner "聚合日志(最近 $N 行 / 全容器)"

for c in aegis-mysql aegis-redis aegis-edgeapi aegis-edgenode aegis-bff-edge; do
    if docker inspect "$c" >/dev/null 2>&1; then
        printf '\n%s━━━ %s ━━━%s\n' "$C_BOLD" "$c" "$C_N"
        if [ -n "$PATTERN" ]; then
            docker logs --tail "$N" "$c" 2>&1 | grep --color=auto -E "$PATTERN" || echo "  (no match for /$PATTERN/)"
        else
            docker logs --tail "$N" "$c" 2>&1
        fi
    fi
done
