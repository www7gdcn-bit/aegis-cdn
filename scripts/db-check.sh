#!/usr/bin/env bash
# scripts/db-check.sh — 关键表存在 + 行数 + 异常状态扫描
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

banner "数据库结构 + 状态检查"

mysql_alive || { fail "mysql 不可用"; summary; exit 1; }
pass "mysql 连通"

TABLES=(edgeNodeClusters edgeNodes edgeUsers edgeServers edgeSSLCerts edgeACMETasks edgeACMEUsers edgeIPLists edgeIPItems)
for t in "${TABLES[@]}"; do
    n=$(mysql_q "SELECT COUNT(*) FROM $t;" 2>/dev/null)
    if [ -n "$n" ]; then
        info "  $t = $n 行"
    else
        warn "  $t 表不存在或查询失败"
    fi
done

step "异常状态扫描"

# edgeUsers.clusterId
broken=$(mysql_q "SELECT COUNT(*) FROM edgeUsers WHERE clusterId=0 OR clusterId IS NULL;")
broken="${broken:-0}"
if [ "$broken" = "0" ]; then
    pass "edgeUsers.clusterId 全部 > 0"
else
    fail "$broken 个 edgeUsers.clusterId=0/NULL(触发 createServer 'invalid nodeClusterId')"
    action "bash scripts/db-repair.sh 自动修"
fi

# edgeNodes 状态
bad_nodes=$(mysql_q "SELECT COUNT(*) FROM edgeNodes WHERE isOn=0 OR isUp=0 OR isInstalled=0;")
bad_nodes="${bad_nodes:-0}"
if [ "$bad_nodes" = "0" ]; then
    pass "edgeNodes isOn/Up/Installed 全 1"
else
    warn "$bad_nodes 个 edgeNode 状态异常(isOn/Up/Installed 非全 1)"
fi

# edgeNodeClusters id=1 必须存在
[ -n "$(mysql_q "SELECT id FROM edgeNodeClusters WHERE id=1;")" ] \
    && pass "edgeNodeClusters id=1 存在" \
    || fail "edgeNodeClusters id=1 缺失"

# SSL 证书剩余有效期
if [ -n "$(mysql_q "SELECT id FROM edgeSSLCerts LIMIT 1;")" ]; then
    expiring=$(mysql_q "SELECT COUNT(*) FROM edgeSSLCerts WHERE state=1 AND timeEndAt > 0 AND timeEndAt < (UNIX_TIMESTAMP() + 86400*30);")
    expiring="${expiring:-0}"
    if [ "$expiring" -gt 0 ]; then
        warn "$expiring 张证书 ≤30 天内到期"
    else
        pass "无证书 30 天内到期"
    fi
fi

# ACME tasks 失败
if [ -n "$(mysql_q "SELECT id FROM edgeACMETasks LIMIT 1;")" ]; then
    fail_tasks=$(mysql_q "SELECT COUNT(*) FROM edgeACMETasks WHERE isOk=0;")
    fail_tasks="${fail_tasks:-0}"
    if [ "$fail_tasks" -gt 0 ]; then
        warn "$fail_tasks 个 ACME task isOk=0(签发未完成)"
    else
        pass "所有 ACME task isOk=1"
    fi
fi

summary "DB 检查总结"
exit_code
