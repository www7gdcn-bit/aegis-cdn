#!/usr/bin/env bash
# scripts/check.sh — 全系统健康巡检(orchestrator)
# 按顺序跑 docker → mysql → redis → edgeapi → bff → edgenode → DB,
# 全 PASS 输出 SYSTEM STATUS: PASS,否则 FAIL
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

DIR="$(cd "$(dirname "$0")" && pwd)"
SUB_FAIL=0

step "AegisCDN 全系统健康巡检"

for sub in check-docker.sh check-mysql.sh check-redis.sh check-edgeapi.sh check-bff.sh check-edgenode.sh db-check.sh; do
    if [ -x "$DIR/$sub" ] || [ -f "$DIR/$sub" ]; then
        if bash "$DIR/$sub"; then
            : # 子脚本已自带 SYSTEM STATUS
        else
            SUB_FAIL=$((SUB_FAIL+1))
        fi
    else
        warn "missing $sub(scripts 不全)"
    fi
done

step "全系统总结"
if [ "$SUB_FAIL" -eq 0 ]; then
    printf '%sSYSTEM STATUS: PASS%s — 所有子检查通过\n' "$C_G$C_BOLD" "$C_N"
    exit 0
else
    printf '%sSYSTEM STATUS: FAIL%s — %d 个子检查未通过\n' "$C_R$C_BOLD" "$C_N" "$SUB_FAIL"
    exit 1
fi
