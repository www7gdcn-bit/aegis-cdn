#!/usr/bin/env bash
# scripts/logs-edgeapi.sh — EdgeAPI 日志 + 自动高亮 ERROR/panic
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

N="${1:-200}"
banner "aegis-edgeapi(最近 $N 行)"

if [ "${2:-}" = "-f" ] || [ "${1:-}" = "-f" ]; then
    docker logs -f aegis-edgeapi 2>&1 | grep --color=auto -iE "ERROR|FATAL|panic|aegis-debug|.*"
else
    docker logs --tail "$N" aegis-edgeapi 2>&1 | grep --color=auto -iE "ERROR|FATAL|panic|aegis-debug|.*"
fi
