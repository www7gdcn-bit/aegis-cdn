#!/usr/bin/env bash
# scripts/logs-edgenode.sh — EdgeNode 日志
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

N="${1:-200}"
banner "aegis-edgenode(最近 $N 行)"

if [ "${2:-}" = "-f" ] || [ "${1:-}" = "-f" ]; then
    docker logs -f aegis-edgenode 2>&1 | grep --color=auto -iE "ERROR|FATAL|panic|cluster|ACME|.*"
else
    docker logs --tail "$N" aegis-edgenode 2>&1 | grep --color=auto -iE "ERROR|FATAL|panic|cluster|ACME|.*"
fi
