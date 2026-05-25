#!/usr/bin/env bash
# scripts/lib/ai-exec.sh — 解析 Claude 返回的 JSON action 列表,白名单校验后执行
# 用法:bash scripts/lib/ai-exec.sh <actions.json>
#
# 控制 env:
#   AI_AUTO_EXEC=1   真执行(默认 0,dry-run 只打印)
#   AI_DEBUG=1       打印每个 action 的原 JSON
set -uo pipefail
source "$(cd "$(dirname "$0")/.." && pwd)/lib/common.sh"

JSON_FILE="${1:-}"
[ -f "$JSON_FILE" ] || { fail "ai-exec: JSON 文件不存在:$JSON_FILE"; exit 2; }

if ! command -v jq >/dev/null 2>&1; then
    fail "jq 未安装(ai-exec 必需)"
    action "apt install -y jq"
    exit 2
fi

# 校验 JSON 合法
if ! jq . "$JSON_FILE" >/dev/null 2>&1; then
    fail "ai-exec: JSON 解析失败 — Claude 返回了非 JSON 内容"
    info "原始内容:"
    cat "$JSON_FILE" | sed 's/^/    /'
    exit 2
fi

DRY=1
[ "${AI_AUTO_EXEC:-0}" = "1" ] && DRY=0

DIAG="$(jq -r '.diagnosis // "(无)"' "$JSON_FILE")"
ROOT="$(jq -r '.root_cause // "(无)"' "$JSON_FILE")"
CONF="$(jq -r '.confidence // "low"' "$JSON_FILE")"

banner "AI 修复方案(confidence=$CONF)"
info "诊断:$DIAG"
info "根因:$ROOT"
[ "$DRY" = "1" ] && warn "DRY-RUN 模式(AI_AUTO_EXEC=1 才真执行)"

# 安全校验
is_safe_shell() {
    local c="$1"
    [[ "$c" =~ ^bash[[:space:]]+scripts/[a-zA-Z0-9_.\-/]+\.sh(\ [a-zA-Z0-9_.\-]+)*$ ]] || return 1
    [[ "$c" =~ (rm|cp|mv|chmod|curl|wget|ssh|scp|tee|;|\&\&|\|\||\||>|<) ]] && return 1
    return 0
}

is_safe_sql() {
    local q="$1"; local up="${q^^}"
    [[ "$up" =~ (DROP|TRUNCATE|ALTER[[:space:]]+TABLE) ]] && return 1
    # DELETE 必须带 WHERE
    if [[ "$up" =~ ^[[:space:]]*DELETE ]]; then
        [[ "$up" =~ WHERE ]] || return 1
    fi
    return 0
}

is_safe_env_key() {
    local k="$1"
    case "$k" in
        EDGE_DEFAULT_CLUSTER_ID|AEGIS_QUOTA_DEV_BYPASS|SSL_AUTO_CRON|DOMAIN_VERIFY_CRON|EDGE_API_DEBUG|EDGE_API_MODE|SSL_RENEW_WITHIN_DAYS) return 0 ;;
    esac
    # 任何包含 SECRET/PASSWORD/TOKEN/KEY 的 key 拒绝(EDGE_API_PROTOCOL/PORT/HOST 等也拒绝,白名单制)
    return 1
}

is_safe_compose() {
    local s="$1"; local up="${s^^}"
    [[ "$up" =~ (DOWN.*-V|RM[[:space:]]|--VOLUMES) ]] && return 1
    return 0
}

# ─── 执行每个 action ────────────────────────────────────────────────
N=$(jq '.actions | length' "$JSON_FILE")
info "共 $N 个 action"

EXEC_PASS=0
EXEC_FAIL=0
EXEC_SKIP=0

for i in $(seq 0 $((N-1))); do
    kind="$(jq -r ".actions[$i].kind" "$JSON_FILE")"
    risk="$(jq -r ".actions[$i].risk // \"medium\"" "$JSON_FILE")"
    reason="$(jq -r ".actions[$i].reason // \"\"" "$JSON_FILE")"

    printf '\n%s── Action #%d  kind=%s  risk=%s ──%s\n' "$C_BOLD" "$((i+1))" "$kind" "$risk" "$C_N"
    [ -n "$reason" ] && info "原因:$reason"
    [ "${AI_DEBUG:-0}" = "1" ] && jq ".actions[$i]" "$JSON_FILE" | sed 's/^/  /'

    case "$kind" in
        shell)
            cmd="$(jq -r ".actions[$i].args.command" "$JSON_FILE")"
            if ! is_safe_shell "$cmd"; then
                fail "[REJECT] shell 白名单不通过:$cmd"
                EXEC_FAIL=$((EXEC_FAIL+1))
                continue
            fi
            if [ "$DRY" = "1" ]; then
                info "[DRY] $cmd"
                EXEC_SKIP=$((EXEC_SKIP+1))
            else
                info "[EXEC] $cmd"
                if eval "$cmd"; then
                    pass "shell 执行成功"
                    EXEC_PASS=$((EXEC_PASS+1))
                else
                    fail "shell 执行失败(exit=$?)"
                    EXEC_FAIL=$((EXEC_FAIL+1))
                fi
            fi
            ;;

        sql)
            q="$(jq -r ".actions[$i].args.query" "$JSON_FILE")"
            if ! is_safe_sql "$q"; then
                fail "[REJECT] SQL 含禁用关键字(DROP/TRUNCATE/无 WHERE DELETE):$q"
                EXEC_FAIL=$((EXEC_FAIL+1))
                continue
            fi
            info "SQL: $q"
            if [ "$DRY" = "1" ]; then
                info "[DRY] 跳过 SQL 执行"
                EXEC_SKIP=$((EXEC_SKIP+1))
            else
                if out=$(mysql_q "$q" 2>&1); then
                    pass "SQL OK"
                    [ -n "$out" ] && info "结果:$(echo "$out" | head -10 | sed 's/^/  /')"
                    EXEC_PASS=$((EXEC_PASS+1))
                else
                    fail "SQL 失败:$out"
                    EXEC_FAIL=$((EXEC_FAIL+1))
                fi
            fi
            ;;

        edit_env)
            k="$(jq -r ".actions[$i].args.key" "$JSON_FILE")"
            v="$(jq -r ".actions[$i].args.value" "$JSON_FILE")"
            if ! is_safe_env_key "$k"; then
                fail "[REJECT] env key 不在白名单(SECRET/PASSWORD/TOKEN 必须人工):$k"
                EXEC_FAIL=$((EXEC_FAIL+1))
                continue
            fi
            info "edit_env: $k=$v"
            if [ "$DRY" = "1" ]; then
                info "[DRY] 跳过 .env 修改"
                EXEC_SKIP=$((EXEC_SKIP+1))
            else
                if grep -qE "^$k=" "$AEGIS_ENV_FILE"; then
                    sed -i.bak -E "s|^$k=.*|$k=$v|" "$AEGIS_ENV_FILE"
                else
                    printf '\n%s=%s\n' "$k" "$v" >> "$AEGIS_ENV_FILE"
                fi
                pass ".env 已更新:$k=$v(备份 .env.bak)"
                EXEC_PASS=$((EXEC_PASS+1))
            fi
            ;;

        compose)
            s="$(jq -r ".actions[$i].args.subcommand" "$JSON_FILE")"
            if ! is_safe_compose "$s"; then
                fail "[REJECT] compose 子命令含 -v / --volumes / rm:$s"
                EXEC_FAIL=$((EXEC_FAIL+1))
                continue
            fi
            info "compose $s"
            if [ "$DRY" = "1" ]; then
                info "[DRY] 跳过 compose 执行"
                EXEC_SKIP=$((EXEC_SKIP+1))
            else
                # shellcheck disable=SC2086
                if compose $s; then
                    pass "compose $s 成功"
                    EXEC_PASS=$((EXEC_PASS+1))
                else
                    fail "compose $s 失败"
                    EXEC_FAIL=$((EXEC_FAIL+1))
                fi
            fi
            ;;

        wait)
            sec="$(jq -r ".actions[$i].args.seconds" "$JSON_FILE")"
            if ! [[ "$sec" =~ ^[0-9]+$ ]] || [ "$sec" -lt 1 ] || [ "$sec" -gt 300 ]; then
                fail "[REJECT] wait.seconds 越界:$sec(允许 1-300)"
                EXEC_FAIL=$((EXEC_FAIL+1))
                continue
            fi
            info "等待 ${sec}s …"
            [ "$DRY" = "1" ] || sleep "$sec"
            pass "等待完成"
            EXEC_PASS=$((EXEC_PASS+1))
            ;;

        manual)
            note="$(jq -r ".actions[$i].args.note" "$JSON_FILE")"
            warn "[MANUAL] $note"
            action "$note"
            EXEC_SKIP=$((EXEC_SKIP+1))
            ;;

        *)
            fail "[REJECT] 未知 action kind:$kind"
            EXEC_FAIL=$((EXEC_FAIL+1))
            ;;
    esac
done

# 人工事项
HUMAN_N=$(jq '.needs_human | length' "$JSON_FILE")
if [ "$HUMAN_N" -gt 0 ]; then
    step "Claude 标记的人工事项"
    for i in $(seq 0 $((HUMAN_N-1))); do
        warn "  - $(jq -r ".needs_human[$i]" "$JSON_FILE")"
    done
fi

printf '\n%sAI Exec 总结%s  PASS=%d  FAIL=%d  SKIP=%d\n' "$C_BOLD" "$C_N" "$EXEC_PASS" "$EXEC_FAIL" "$EXEC_SKIP"
[ "$EXEC_FAIL" -eq 0 ]
