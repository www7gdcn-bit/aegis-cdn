#!/usr/bin/env bash
# scripts/test-acme.sh — ACME 用户 / 任务状态扫描
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

banner "ACME 状态扫描"

mysql_alive || { fail "mysql 不可用"; summary; exit 1; }

# ACME Users
users=$(mysql_q "SELECT id, accountKey, providerCode, createdAt FROM edgeACMEUsers ORDER BY id;")
n_users=$(echo "$users" | grep -c .)
if [ "$n_users" = "0" ] || [ -z "$users" ]; then
    fail "edgeACMEUsers 为空 — 平台还没注册 ACME 账户"
    action "在 EdgeAdmin 或 SQL 注册 LE/ZeroSSL 账户;saas-svc .env 设 EDGE_DEFAULT_ACME_USER_ID"
else
    pass "edgeACMEUsers 共 $n_users 行"
    while IFS=$'\t' read -r id _ provider created; do
        [ -z "$id" ] && continue
        info "  user id=$id provider=$provider createdAt=$created"
    done <<< "$users"
fi

# ACME tasks 状态分布
tasks_total=$(mysql_q "SELECT COUNT(*) FROM edgeACMETasks;"); tasks_total="${tasks_total:-0}"
if [ "$tasks_total" = "0" ]; then
    info "edgeACMETasks 为空(还没触发签发)"
else
    pass "edgeACMETasks 共 $tasks_total 行"
    ok_count=$(mysql_q "SELECT COUNT(*) FROM edgeACMETasks WHERE isOk=1;"); ok_count="${ok_count:-0}"
    fail_count=$((tasks_total - ok_count))
    [ "$ok_count" -gt 0 ]   && pass "  isOk=1(成功)= $ok_count"
    [ "$fail_count" -gt 0 ] && warn "  isOk=0(失败/进行中)= $fail_count"

    # 最近 3 个失败的任务
    if [ "$fail_count" -gt 0 ]; then
        info "最近 3 个未成功的 task(id / domains / lastError):"
        mysql_q "SELECT id, domains, lastError, createdAt FROM edgeACMETasks WHERE isOk=0 ORDER BY id DESC LIMIT 3;" \
            | sed 's/^/    /'
    fi
fi

# saas-svc 配置
acme_user_id=$(env_get EDGE_DEFAULT_ACME_USER_ID)
if [ -z "$acme_user_id" ]; then
    warn "EDGE_DEFAULT_ACME_USER_ID 未配 — saas-svc SslAutoIssueCron 会跳过"
    action "在 .env 设置 EDGE_DEFAULT_ACME_USER_ID 为 edgeACMEUsers 表中某行 id"
else
    pass "EDGE_DEFAULT_ACME_USER_ID = $acme_user_id"
fi

ssl_cron=$(env_get SSL_AUTO_CRON); ssl_cron="${ssl_cron:-on}"
info "SSL_AUTO_CRON = $ssl_cron"

summary "ACME 总结"
exit_code
