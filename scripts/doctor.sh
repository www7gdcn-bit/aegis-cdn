#!/usr/bin/env bash
# scripts/doctor.sh — 规则化自动修复(无 AI)
#   跑 check.sh 拿到结果,对已知 FAIL pattern 直接修复,然后复检
#   修不了的 → 列在 [MANUAL]
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

DIR="$(cd "$(dirname "$0")" && pwd)"

banner "Doctor 规则化自动修复"

# 跑一次 check,保存输出
CHECK_OUT=$(mktemp)
bash "$DIR/check.sh" > "$CHECK_OUT" 2>&1 || true
# 去色
sed -i 's/\x1b\[[0-9;]*m//g' "$CHECK_OUT"

# 全 PASS → 直接退出
if grep -q "SYSTEM STATUS: PASS" "$CHECK_OUT"; then
    pass "系统已 PASS,无需修复"
    rm -f "$CHECK_OUT"
    summary "Doctor 结果"; exit 0
fi

# 抽 FAIL 行
FAIL_LINES=$(grep -E "\[FAIL\]" "$CHECK_OUT" || true)
info "发现 $(echo "$FAIL_LINES" | grep -c .) 条 FAIL,尝试规则修复 …"

FIXED=0
SKIPPED=0

# ── 已知 fix patterns ───────────────────────────────────────────────

# 1. edgeUsers.clusterId=0
if echo "$FAIL_LINES" | grep -qE "edgeUsers\.clusterId"; then
    printf '\n%s[FIX]%s edgeUsers.clusterId=0 → 调 db-repair.sh\n' "$C_M" "$C_N"
    if bash "$DIR/db-repair.sh"; then
        pass "db-repair.sh 完成"
        FIXED=$((FIXED+1))
    else
        fail "db-repair.sh 失败"
    fi
fi

# 2. 某容器未 running / exited
for c in aegis-mysql aegis-redis aegis-edgeapi aegis-bff-edge aegis-edgenode; do
    if echo "$FAIL_LINES" | grep -qE "$c.*(未 running|exited|missing)"; then
        printf '\n%s[FIX]%s %s 未 running → docker restart\n' "$C_M" "$C_N" "$c"
        if docker restart "$c" >/dev/null 2>&1; then
            pass "$c restarted,等 15s 复测 healthcheck"
            sleep 15
            FIXED=$((FIXED+1))
        else
            fail "docker restart $c 失败"
            action "看 docker logs $c — 可能 .env 缺关键变量"
        fi
    fi
done

# 3. /health → 000 / 502 → restart bff-edge
if echo "$FAIL_LINES" | grep -qE "GET /health → (000|502)"; then
    printf '\n%s[FIX]%s bff-edge /health 异常 → docker restart\n' "$C_M" "$C_N"
    docker restart aegis-bff-edge >/dev/null 2>&1 && {
        sleep 10; pass "bff-edge restarted"; FIXED=$((FIXED+1))
    } || fail "restart 失败"
fi

# 4. edgeNodeClusters id=1 缺失
if echo "$FAIL_LINES" | grep -qE "edgeNodeClusters id=1 (不存在|缺失)"; then
    warn "edgeNodeClusters id=1 缺失 — EdgeAPI setup 没跑完(规则修复无法自动判断卷状态)"
    action "docker volume rm aegis-dev_aegis-edgeapi-configs && bash scripts/restart.sh(会清空 EdgeAPI 配置卷,setup 重跑)"
    SKIPPED=$((SKIPPED+1))
fi

# 5. ENV 缺失类(必须人工)
if echo "$FAIL_LINES" | grep -qE "(EDGE_NODE_CLUSTER_ID|EDGE_NODE_CLUSTER_SECRET|EDGE_API_ADMIN_NODE_(ID|SECRET)).*未"; then
    warn "ENV 凭证缺失 — 必须人工填(SECRET/ID 类不在自动修范围)"
    action "看 deploy/.env.example 注释,在 EdgeAdmin 后台或 SQL 取凭证,填到 deploy/.env"
    SKIPPED=$((SKIPPED+1))
fi

# 6. ChangeMe 占位
if echo "$FAIL_LINES" | grep -qE "仍是 ChangeMe"; then
    warn "deploy/.env 仍有 ChangeMe 占位 — 必须人工填强随机值"
    action "openssl rand -hex 32 → 替换 .env 里的 ChangeMe_*"
    SKIPPED=$((SKIPPED+1))
fi

# 7. edgeNodes 状态全 0(超过 60s 仍未上)
if echo "$FAIL_LINES" | grep -qE "edgeNodes 表为空"; then
    warn "edgeNodes 表为空 — EdgeNode 未注册成功(规则不强改,需看日志)"
    action "看 docker logs aegis-edgenode 与 docker logs aegis-edgeapi 找注册错"
    SKIPPED=$((SKIPPED+1))
fi

# ── 复检 ─────────────────────────────────────────────────────────────
step "复检"
RECHECK=$(mktemp)
bash "$DIR/check.sh" > "$RECHECK" 2>&1 || true
sed -i 's/\x1b\[[0-9;]*m//g' "$RECHECK"

if grep -q "SYSTEM STATUS: PASS" "$RECHECK"; then
    printf '\n%sSYSTEM STATUS: PASS%s (Doctor 修复了 %d 项)\n' "$C_G$C_BOLD" "$C_N" "$FIXED"
    rm -f "$CHECK_OUT" "$RECHECK"; exit 0
else
    REMAIN=$(grep -cE "\[FAIL\]" "$RECHECK" || true)
    printf '\n%sSYSTEM STATUS: FAIL%s (规则修复 %d 项,跳过 %d 项,仍剩 %d 个 FAIL)\n' "$C_R$C_BOLD" "$C_N" "$FIXED" "$SKIPPED" "$REMAIN"
    info "→ 继续跑 bash scripts/ai-repair.sh 让 AI 接手(需 ANTHROPIC_API_KEY)"
    rm -f "$CHECK_OUT" "$RECHECK"; exit 1
fi
