#!/usr/bin/env bash
# scripts/logs-bff.sh — bff-edge 日志 + 高亮 DomainsController / edge-api-sdk payload
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

N="${1:-200}"
banner "aegis-bff-edge(最近 $N 行)"

if [ "${2:-}" = "-f" ] || [ "${1:-}" = "-f" ]; then
    docker logs -f aegis-bff-edge 2>&1 \
        | grep --color=auto -iE "DomainsController|UsersController|edge-api-sdk|FAIL|ERROR|payload|.*"
else
    docker logs --tail "$N" aegis-bff-edge 2>&1 \
        | grep --color=auto -iE "DomainsController|UsersController|edge-api-sdk|FAIL|ERROR|payload|.*"
fi
