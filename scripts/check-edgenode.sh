#!/usr/bin/env bash
# scripts/check-edgenode.sh — EdgeNode 注册状态 + 端口监听
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

banner "EdgeNode 健康检查"

container_running aegis-edgenode || { fail "aegis-edgenode 未 running"; summary; exit 1; }
pass "aegis-edgenode container running"

# DB:edgeNodes 行 + isOn/isUp/isInstalled
node_count="$(mysql_q "SELECT COUNT(*) FROM edgeNodes;")"
node_count="${node_count:-0}"
if [ "$node_count" = "0" ]; then
    fail "edgeNodes 表为空 — EdgeNode 未注册到 EdgeAPI"
    action "看 docker logs aegis-edgenode;确认 EDGE_NODE_CLUSTER_ID/SECRET 与 EdgeAPI 一致"
else
    pass "edgeNodes 行数 = $node_count"
    while IFS=$'\t' read -r id cid is_on is_up is_inst; do
        [ -z "${id:-}" ] && continue
        if [ "$is_on" = "1" ] && [ "$is_up" = "1" ] && [ "$is_inst" = "1" ]; then
            pass "  edgeNode id=$id cluster=$cid isOn/Up/Installed=1/1/1"
        else
            warn "  edgeNode id=$id isOn=$is_on isUp=$is_up isInstalled=$is_inst(期望全 1)"
            action "等 30s heartbeat 或 SQL 兜底:UPDATE edgeNodes SET isOn=1,isUp=1,isInstalled=1;"
        fi
    done < <(mysql_q "SELECT id, clusterId, isOn, isUp, isInstalled FROM edgeNodes;")
fi

# 容器内 80/443 端口
for port in 80 443; do
    if docker exec aegis-edgenode sh -c "echo > /dev/tcp/127.0.0.1/$port" 2>/dev/null; then
        pass "EdgeNode 容器内 :$port 监听中"
    else
        warn "EdgeNode 容器内 :$port 不通(未接入域名时正常)"
    fi
done

# 宿主映射端口(从 .env 读 EDGE_NODE_HTTP_PORT / HTTPS_PORT)
h80="$(env_get EDGE_NODE_HTTP_PORT)"; h443="$(env_get EDGE_NODE_HTTPS_PORT)"
h80="${h80:-8080}"; h443="${h443:-8443}"
for hp in "$h80" "$h443"; do
    if timeout 3 bash -c ">/dev/tcp/127.0.0.1/$hp" 2>/dev/null; then
        pass "宿主 :$hp 已转发到 EdgeNode"
    else
        warn "宿主 :$hp 不通(端口未占用 / 防火墙)"
    fi
done

# 日志关键错误
err=$(docker logs --tail 100 aegis-edgenode 2>&1 | grep -cE "ERROR|FATAL|panic" || true)
if [ "$err" = "0" ]; then
    pass "最近 100 行日志无 ERROR/FATAL/panic"
else
    warn "最近 100 行有 $err 条 ERROR — bash scripts/logs-edgenode.sh 详查"
fi

summary "EdgeNode 检查总结"
exit_code
