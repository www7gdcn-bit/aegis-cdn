#!/usr/bin/env bash
# scripts/auto-pilot.sh — 全自动 check → repair → recheck 循环(最多 N 轮)
#
# 流程:
#   Round 1: check → 若 PASS 退出 / 否则 doctor.sh(规则修复)→ recheck
#   Round 2-N: check → 若 PASS 退出 / 否则 ai-repair.sh(Claude AI)→ recheck
#   直到 PASS 或耗尽 MAX_ROUNDS
#
# env:
#   AUTO_PILOT_MAX_ROUNDS    最多轮数,默认 5
#   AI_AUTO_EXEC             1 = AI 真执行(默认 0,只 dry-run)
#   ANTHROPIC_API_KEY        没填则跳过 AI,只跑 doctor
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

DIR="$(cd "$(dirname "$0")" && pwd)"
MAX="${AUTO_PILOT_MAX_ROUNDS:-5}"
LOG_DIR="$AEGIS_REPO_ROOT/auto-pilot-logs"
mkdir -p "$LOG_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
LOG="$LOG_DIR/auto-pilot-$TS.log"
exec > >(tee -a "$LOG") 2>&1

step "Auto-Pilot 开始(最多 $MAX 轮)"
info "日志:$LOG"

# 上来先 git pull(可选,设 SKIP_GIT_PULL=1 跳过)
if [ "${SKIP_GIT_PULL:-0}" != "1" ]; then
    info "git pull --rebase(SKIP_GIT_PULL=1 可关)…"
    if git -C "$AEGIS_REPO_ROOT" pull --rebase --autostash origin main 2>&1 | tail -5; then
        pass "git pull OK"
    else
        warn "git pull 失败,继续(可能离线 / 冲突)"
    fi
fi

# 容器没起就先 up
if ! container_running aegis-mysql || ! container_running aegis-bff-edge; then
    info "核心容器未全 running,先 up …"
    bash "$DIR/up.sh" || warn "up 失败,继续 check 看具体"
fi

PILOT_RESULT="FAIL"
LAST_FAIL_COUNT=99999

for round in $(seq 1 "$MAX"); do
    step "Round $round / $MAX"

    # check
    RC_OUT=$(mktemp)
    bash "$DIR/check.sh" > "$RC_OUT" 2>&1 || true
    sed -i 's/\x1b\[[0-9;]*m//g' "$RC_OUT"
    cat "$RC_OUT"

    if grep -q "SYSTEM STATUS: PASS" "$RC_OUT"; then
        pass "Round $round:check 通过"
        PILOT_RESULT="PASS"
        rm -f "$RC_OUT"
        break
    fi

    CURR_FAIL=$(grep -cE "\[FAIL\]" "$RC_OUT" || true)
    info "Round $round:FAIL=$CURR_FAIL"
    rm -f "$RC_OUT"

    # 如果上一轮已经修过但 FAIL 数没变,说明卡住了
    if [ "$round" -gt 1 ] && [ "$CURR_FAIL" -ge "$LAST_FAIL_COUNT" ]; then
        warn "FAIL 数未减少(上轮=$LAST_FAIL_COUNT 这轮=$CURR_FAIL)— 可能卡住"
        if [ "$round" -ge 3 ]; then
            warn "Round $round 仍卡住,中止循环"
            break
        fi
    fi
    LAST_FAIL_COUNT="$CURR_FAIL"

    # 决定修复器
    if [ "$round" = "1" ]; then
        info "Round 1 → 规则化修复(doctor.sh)"
        bash "$DIR/doctor.sh" || warn "doctor 未完全修好,继续"
    else
        # Round 2+ → AI 修复
        AI_KEY="${ANTHROPIC_API_KEY:-$(env_get ANTHROPIC_API_KEY)}"
        if [ -z "$AI_KEY" ]; then
            warn "ANTHROPIC_API_KEY 未配 — AI 修复跳过,再跑一次 doctor 兜底"
            bash "$DIR/doctor.sh" || true
        else
            info "Round $round → AI 修复(ai-repair.sh)"
            bash "$DIR/ai-repair.sh" || warn "ai-repair 报错,继续下轮"
        fi
    fi

    # 复检短等待(让重启的容器 ready)
    info "等 10s 让服务稳定 …"
    sleep 10
done

# ─── 最终复检 + 报告 ────────────────────────────────────────────────
step "Auto-Pilot 最终复检"
FINAL=$(mktemp)
bash "$DIR/check.sh" > "$FINAL" 2>&1 || true
sed -i 's/\x1b\[[0-9;]*m//g' "$FINAL"
cat "$FINAL"

if grep -q "SYSTEM STATUS: PASS" "$FINAL"; then
    PILOT_RESULT="PASS"
fi

step "Auto-Pilot 总结"
printf '日志:%s\n' "$LOG"
if [ "$PILOT_RESULT" = "PASS" ]; then
    printf '%sSYSTEM STATUS: PASS%s — Auto-Pilot 完成\n' "$C_G$C_BOLD" "$C_N"
    rm -f "$FINAL"
    exit 0
else
    printf '%sSYSTEM STATUS: FAIL%s — 已尝试 %d 轮,剩余 FAIL %d 项\n' \
        "$C_R$C_BOLD" "$C_N" "$MAX" "$(grep -cE "\[FAIL\]" "$FINAL" || echo "?")"
    info "→ 生成完整排障报告:bash scripts/report.sh"
    info "→ 看日志:$LOG"
    rm -f "$FINAL"
    exit 1
fi
