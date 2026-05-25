#!/usr/bin/env bash
# scripts/report.sh — 一键生成完整排障报告(到 ./aegis-report-YYYYmmdd-HHMMSS/)
#   含:check 全输出 / docker ps / logs 全量(各 500 行)/ env(脱敏)/ DB 关键表 dump
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

TS="$(date +%Y%m%d-%H%M%S)"
OUT="$AEGIS_REPO_ROOT/aegis-report-$TS"
mkdir -p "$OUT"

banner "生成排障报告 → $OUT"

# 1. git
{
    echo "=== git status ==="; git -C "$AEGIS_REPO_ROOT" status
    echo; echo "=== HEAD ==="; git -C "$AEGIS_REPO_ROOT" log -3 --oneline
    echo; echo "=== submodule status ==="; git -C "$AEGIS_REPO_ROOT" submodule status 2>&1 || true
} > "$OUT/git.txt" 2>&1
pass "git.txt"

# 2. docker ps
{
    echo "=== docker ps -a ==="
    docker ps -a --filter "name=aegis-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    echo; echo "=== docker version ==="; docker --version
    docker compose version 2>/dev/null || docker-compose --version 2>/dev/null
} > "$OUT/docker.txt" 2>&1
pass "docker.txt"

# 3. env(脱敏:SECRET/PASSWORD/TOKEN/KEY 改 ***)
if [ -f "$AEGIS_ENV_FILE" ]; then
    sed -E 's/(SECRET|PASSWORD|TOKEN|KEY)([^=]*)=.*/\1\2=***REDACTED***/g' "$AEGIS_ENV_FILE" > "$OUT/env.redacted.txt"
    pass "env.redacted.txt(SECRET/PASSWORD/TOKEN/KEY 已脱敏)"
fi

# 4. 各容器 logs(各 500 行)
for c in aegis-mysql aegis-redis aegis-edgeapi aegis-edgenode aegis-bff-edge aegis-postgres aegis-saas-svc; do
    if docker inspect "$c" >/dev/null 2>&1; then
        docker logs --tail 500 "$c" > "$OUT/logs-$c.txt" 2>&1 || true
        pass "logs-$c.txt"
    fi
done

# 5. DB 关键表 dump(脱敏前不含密码,仅业务字段)
if mysql_alive; then
    {
        echo "=== edgeNodeClusters ==="
        mysql_q "SELECT id, name, isOn, createdAt FROM edgeNodeClusters;"
        echo; echo "=== edgeNodes ==="
        mysql_q "SELECT id, clusterId, name, isOn, isUp, isInstalled, statusJSON FROM edgeNodes;"
        echo; echo "=== edgeUsers ==="
        mysql_q "SELECT id, username, clusterId, isOn, createdAt FROM edgeUsers;"
        echo; echo "=== edgeServers ==="
        mysql_q "SELECT id, userId, clusterId, name, isOn, state, createdAt FROM edgeServers ORDER BY id DESC LIMIT 50;"
        echo; echo "=== edgeSSLCerts ==="
        mysql_q "SELECT id, name, isCA, isACME, timeBeginAt, timeEndAt, state FROM edgeSSLCerts ORDER BY id DESC LIMIT 50;"
        echo; echo "=== edgeACMEUsers ==="
        mysql_q "SELECT id, providerCode, createdAt FROM edgeACMEUsers;"
        echo; echo "=== edgeACMETasks ==="
        mysql_q "SELECT id, domains, isOk, lastError, createdAt FROM edgeACMETasks ORDER BY id DESC LIMIT 30;"
    } > "$OUT/db-dump.txt" 2>&1
    pass "db-dump.txt"
fi

# 6. check 全输出
bash "$AEGIS_SCRIPT_DIR/check.sh" > "$OUT/check.txt" 2>&1 || true
pass "check.txt"

# 7. 端点 probe
bash "$AEGIS_SCRIPT_DIR/test-api.sh" > "$OUT/api-probe.txt" 2>&1 || true
pass "api-probe.txt"

# 8. tar 打包
tar="aegis-report-$TS.tar.gz"
(cd "$AEGIS_REPO_ROOT" && tar -czf "$tar" "aegis-report-$TS")
pass "打包 → $AEGIS_REPO_ROOT/$tar"

step "报告生成完成"
echo "  目录: $OUT"
echo "  压缩: $AEGIS_REPO_ROOT/$tar"
echo "  发出时附给我或贴 git issue,我可以直接看完整诊断信息(env 已脱敏)"
