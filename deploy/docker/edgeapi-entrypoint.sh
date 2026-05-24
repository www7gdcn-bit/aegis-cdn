#!/usr/bin/env bash
# deploy/docker/edgeapi-entrypoint.sh — Phase 1 Step 3
#
# 职责:
#   1. 首次启动:渲染 configs/db.yaml(MySQL DSN),跑 edge-api setup 建表 + 建 admin token,
#      捕获 adminNodeId/adminNodeSecret 写到 /app/configs/.admin-token.json(便于 docker logs/cat 取出)
#   2. 后续启动:跳过 setup,直接 exec edge-api start
#
# 幂等性:setup 自己检查表已存在/admin token 已存在,可安全重跑;但为避免日志噪声,我们以 marker 文件守门。

set -euo pipefail

CONFIGS=/app/configs
TEMPLATES=/app/configs.template
MARKER=$CONFIGS/.aegis-setup-done

# ─────────────────────────────────────────
# 1. 首次:把模板搬到持久卷(若卷里空)
# ─────────────────────────────────────────
if [ ! -f "$CONFIGS/api.template.yaml" ]; then
    echo "==> first run: copy config templates to $CONFIGS"
    cp -rn "$TEMPLATES"/. "$CONFIGS/" 2>/dev/null || true
fi

# ─────────────────────────────────────────
# 2. 渲染 db.yaml(每次都覆盖,保证密码/host 跟 env 一致)
# ─────────────────────────────────────────
cat > "$CONFIGS/db.yaml" <<EOF
user: "${AEGIS_MYSQL_USER}"
password: "${AEGIS_MYSQL_PASSWORD}"
host: "${AEGIS_MYSQL_HOST}:${AEGIS_MYSQL_PORT}"
database: "${AEGIS_MYSQL_DATABASE}"
boolFields: [ "uamIsOn", "followPort", "requestHostExcludingPort", "autoRemoteStart", "autoInstallNftables", "enableIPLists", "detectAgents", "checkingPorts", "enableRecordHealthCheck", "offlineIsNotified", "http2Enabled", "http3Enabled", "enableHTTP2", "retry50X", "retry40X", "autoSystemTuning", "disableDefaultDB", "autoTrimDisks", "enableGlobalPages", "ignoreLocal", "ignoreSearchEngine" ]
EOF

# ─────────────────────────────────────────
# 3. 首次 setup(建表 + 建 admin token + 写 api.yaml)
# ─────────────────────────────────────────
if [ ! -f "$MARKER" ]; then
    echo "==> running edge-api setup ..."
    SETUP_OUT=$(/app/bin/edge-api setup \
        -api-node-protocol="${EDGE_API_PROTOCOL}" \
        -api-node-host="${EDGE_API_HOST}" \
        -api-node-port="${EDGE_API_PORT}" 2>&1 || true)

    echo "$SETUP_OUT"
    echo "$SETUP_OUT" | grep -q '"isOk":true' || {
        echo "[ERROR] edge-api setup failed. Check output above." >&2
        exit 1
    }

    # 提取 admin token JSON,落地到 configs 供运维 cat 取
    echo "$SETUP_OUT" | grep -oE '\{.*"isOk":true.*\}' > "$CONFIGS/.admin-token.json" || true
    touch "$MARKER"

    echo
    echo "═══════════════════════════════════════════════════════════"
    echo "  EdgeAPI setup OK. Admin token(用于 bff-edge / EdgeAdmin 登录):"
    echo "    docker compose -f deploy/docker-compose.dev.yml exec edgeapi cat /app/configs/.admin-token.json"
    echo "═══════════════════════════════════════════════════════════"
fi

# ─────────────────────────────────────────
# 4. exec 主进程(支持 docker compose stop 接收信号)
# ─────────────────────────────────────────
exec /app/bin/edge-api "$@"
