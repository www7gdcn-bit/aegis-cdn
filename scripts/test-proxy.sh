#!/usr/bin/env bash
# scripts/test-proxy.sh — 完整反代链路:DNS → EdgeNode → 源站
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

banner "反代链路全程测试"

DIR="$(cd "$(dirname "$0")" && pwd)"
SUB_FAIL=0
for sub in test-domain.sh test-80.sh test-443.sh test-origin.sh test-ssl.sh; do
    if [ -f "$DIR/$sub" ]; then
        bash "$DIR/$sub" || SUB_FAIL=$((SUB_FAIL+1))
    fi
done

step "反代链路总结"
if [ $SUB_FAIL -eq 0 ]; then
    printf '%sPROXY STATUS: PASS%s\n' "$C_G$C_BOLD" "$C_N"; exit 0
else
    printf '%sPROXY STATUS: FAIL%s — %d 个子链路失败\n' "$C_R$C_BOLD" "$C_N" "$SUB_FAIL"; exit 1
fi
