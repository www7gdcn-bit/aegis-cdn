#!/usr/bin/env bash
# scripts/db-repair.sh — 自动修复已知 DB 异常
#   1. edgeUsers.clusterId=0 → EDGE_DEFAULT_CLUSTER_ID(默认 1)
#   2. edgeNodes 状态 isOn/Up/Installed 兜底(可选,加 --force-nodes)
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

banner "DB 自动修复"

mysql_alive || { fail "mysql 不可用"; summary; exit 1; }

DEFAULT_CLUSTER="$(env_get EDGE_DEFAULT_CLUSTER_ID)"
DEFAULT_CLUSTER="${DEFAULT_CLUSTER:-1}"

# 修复 edgeUsers.clusterId
broken=$(mysql_q "SELECT COUNT(*) FROM edgeUsers WHERE clusterId=0 OR clusterId IS NULL;")
broken="${broken:-0}"
if [ "$broken" -gt 0 ] 2>/dev/null; then
    info "修复 $broken 个 edgeUsers.clusterId=0/NULL → $DEFAULT_CLUSTER"
    mysql_q "UPDATE edgeUsers SET clusterId=$DEFAULT_CLUSTER WHERE clusterId=0 OR clusterId IS NULL;" >/dev/null
    after=$(mysql_q "SELECT COUNT(*) FROM edgeUsers WHERE clusterId=0 OR clusterId IS NULL;")
    [ "${after:-0}" = "0" ] && pass "edgeUsers.clusterId 修复完成" || fail "修复后仍 $after 行"
else
    pass "edgeUsers.clusterId 无需修复"
fi

if [ "${1:-}" = "--force-nodes" ]; then
    bad=$(mysql_q "SELECT COUNT(*) FROM edgeNodes WHERE isOn=0 OR isUp=0 OR isInstalled=0;")
    bad="${bad:-0}"
    if [ "$bad" -gt 0 ] 2>/dev/null; then
        warn "--force-nodes:强制 UPDATE 所有 edgeNodes 为 isOn/Up/Installed=1($bad 行)"
        warn "(慎用 — 真实状态由 heartbeat 维护,人为改值仅适合本地测)"
        mysql_q "UPDATE edgeNodes SET isOn=1, isUp=1, isInstalled=1 WHERE isOn=0 OR isUp=0 OR isInstalled=0;" >/dev/null
        pass "edgeNodes 强制修复完成"
    fi
fi

summary "DB 修复总结"
exit_code
