#!/usr/bin/env bash
# deploy/docker/edgeapi-entrypoint.sh
#
# 职责:
#   1. 首次启动:渲染 configs/db.yaml(GoEdge dbs.Config 格式 — env=prod 嵌套),
#      跑 edge-api setup 建表 + 建 admin token,捕获 adminNodeId/adminNodeSecret
#      写到 /app/configs/.admin-token.json(便于 docker logs/cat 取出)
#   2. 后续启动:跳过 setup,直接 exec edge-api start
#
# 幂等性:setup 自己检查表已存在/admin token 已存在,可安全重跑;但为避免日志噪声,
# 用 marker 文件守门。Marker 含版本号:升级 entrypoint 时 bump 让旧实例自动重跑 setup
# (db.yaml 格式变化等场景必需,Phase 3 Final E2E 期间从 v1 → v2)。
#
# 关键修复(2026-05-25):
#   GoEdge 运行时读 db.yaml 用 gopkg.in/yaml.v3 反序列化到 dbs.Config struct
#   (见 upstream/EdgeAPI/internal/configs/db_config.go + iwind/TeaGo/dbs/config.go),
#   期望嵌套格式 { default: {db: prod}, dbs: {prod: {driver, dsn, ...}} }。
#   build/configs/db.template.yaml 内的 user/password/host/database/boolFields 平面格式
#   是 GoEdge **install 工具的输入模板**,**不是运行时格式** — 必须由 entrypoint 渲染为
#   dbs.Config 嵌套格式后,setup 命令的 LoadDBConfig + config.DBs[Tea.Env="prod"] 才能解析到。

set -euo pipefail

CONFIGS=/app/configs
TEMPLATES=/app/configs.template
# v2:db.yaml 格式从平面改为 dbs.Config 嵌套 — 旧 v1 marker 失效,setup 重跑
MARKER=$CONFIGS/.aegis-setup-done-v2

# ─────────────────────────────────────────
# 1. 首次:把模板搬到持久卷(若卷里没有 api.template.yaml)
#    注:db.template.yaml 也会被搬,但下面会被我们渲染的 db.yaml 覆盖 — 这是正确行为
# ─────────────────────────────────────────
if [ ! -f "$CONFIGS/api.template.yaml" ]; then
    echo "==> first run: copy config templates to $CONFIGS"
    cp -rn "$TEMPLATES"/. "$CONFIGS/" 2>/dev/null || true
fi

# ─────────────────────────────────────────
# 2. 渲染 db.yaml(每次都覆盖) — dbs.Config 嵌套格式
# ─────────────────────────────────────────
# 转义密码中的单引号(YAML single-quoted 里 ' 写作 '')
ESC_PASS="${AEGIS_MYSQL_PASSWORD//\'/\'\'}"

# DSN 用 go-sql-driver/mysql 格式: user:pass@tcp(host:port)/db?params
# 注:password 含 @ 时 go-sql-driver 解析正常(从右向左找 @tcp(),倒推 user:pass)
# multiStatements:setup.go 会自动追加,这里不必预置
DSN="${AEGIS_MYSQL_USER}:${AEGIS_MYSQL_PASSWORD}@tcp(${AEGIS_MYSQL_HOST}:${AEGIS_MYSQL_PORT})/${AEGIS_MYSQL_DATABASE}?charset=utf8mb4&timeout=30s&parseTime=true&loc=Local"

cat > "$CONFIGS/db.yaml" <<EOF
default:
  db: prod
  prefix: edge

dbs:
  prod:
    driver: mysql
    dsn: '${DSN//\'/\'\'}'
    connections:
      pool: 10
      max: 100
      life: 5m
EOF

# ─────────────────────────────────────────
# 3. 首次 setup(建表 + 建 admin token + 写 api.yaml)
# ─────────────────────────────────────────
if [ ! -f "$MARKER" ]; then
    echo "==> running edge-api setup ..."
    echo "    DB host=${AEGIS_MYSQL_HOST}:${AEGIS_MYSQL_PORT} user=${AEGIS_MYSQL_USER} db=${AEGIS_MYSQL_DATABASE}"
    echo "    API node proto=${EDGE_API_PROTOCOL} host=${EDGE_API_HOST} port=${EDGE_API_PORT}"

    SETUP_OUT=$(/app/bin/edge-api setup \
        -api-node-protocol="${EDGE_API_PROTOCOL}" \
        -api-node-host="${EDGE_API_HOST}" \
        -api-node-port="${EDGE_API_PORT}" 2>&1 || true)

    echo "$SETUP_OUT"
    if ! echo "$SETUP_OUT" | grep -q '"isOk":true'; then
        echo "[ERROR] edge-api setup failed. Check output above." >&2
        echo "[HINT] 常见原因:" >&2
        echo "  - db.yaml 格式不对 → 看 /app/configs/db.yaml 是否含 'dbs:' + 'prod:' 嵌套" >&2
        echo "  - MySQL 连接 → 容器内 'mysqladmin ping -h ${AEGIS_MYSQL_HOST}'" >&2
        echo "  - 用户权限 → '${AEGIS_MYSQL_USER}' 需有 db_edge 的全部权限" >&2
        exit 1
    fi

    # 提取 admin token JSON,落地到 configs 供运维 cat 取
    echo "$SETUP_OUT" | grep -oE '\{.*"isOk":true.*\}' > "$CONFIGS/.admin-token.json" || true
    touch "$MARKER"

    echo
    echo "═══════════════════════════════════════════════════════════"
    echo "  EdgeAPI setup OK. Admin token(用于 bff-edge 鉴权):"
    echo "    docker compose -f deploy/docker-compose.dev.yml exec edgeapi cat /app/configs/.admin-token.json"
    echo "═══════════════════════════════════════════════════════════"
fi

# ─────────────────────────────────────────
# 4. 保活策略 — start daemon + tail -F run.log
#
# 背景:
#   GoEdge `edge-api start`(app_cmd.go:runStart)是给 systemctl 用的:
#     exec.Command(this.exe()).Start()        # fork 子进程后台跑
#     fmt.Println("Edge API started ok, pid:..."); return   # 主进程立刻退出
#
#   若 entrypoint 用 `exec edge-api start`,主进程退出 → 容器 Exit 0
#   → restart policy 拉起 → 又跑 → 又退 → 无限 Restarting 循环。
#
# 修复(按用户要求采用经典容器保活模式):
#   1. 普通(非 exec)调用 `edge-api start`:fork 出 daemon 后立即返回,
#      daemon 子进程脱离 entrypoint 继续运行(写 /app/logs/run.log + listen :8003)
#   2. 确保 run.log 存在(避免 tail -F 启动时文件不存在)
#   3. exec tail -F /app/logs/run.log 作为容器主进程:
#      - 阻塞前台,容器保活
#      - 同时 docker logs 直接看到 GoEdge run.log 真实内容
#      - 收到 SIGTERM(docker stop)时 tail 退出 → 容器停止
#
# 注:本方案不感知 daemon 崩溃(tail 不知道) — daemon 崩了容器仍 running。
# healthcheck 应能识别,见 docs/20 §3.2。
# 显式子命令(setup/upgrade/issues/token/...)按原样 exec,便于 docker exec 调试。
# ─────────────────────────────────────────

LOG_DIR=/app/logs
mkdir -p "$LOG_DIR"
RUN_LOG="$LOG_DIR/run.log"

if [ "$#" -eq 0 ] || [ "${1:-}" = "start" ]; then
    echo "==> launching edge-api daemon (start subcommand,fork to background)"
    # 非 exec,普通调用 — 返回后继续 entrypoint 后续步骤
    /app/bin/edge-api start || {
        echo "[ERROR] edge-api start failed" >&2
        exit 1
    }

    # 给 daemon 一点时间初始化 listen sock + 写 run.log
    sleep 2

    # 确保日志文件存在(避免 tail -F 在文件出现前空跑;daemon 写 run.log 是异步)
    touch "$RUN_LOG"

    echo "==> daemon started;tailing $RUN_LOG as container PID 1 (foreground keepalive)"
    # tail -F:文件不存在时等待,文件被 truncate/rotate 时自动重开。容器主进程 = tail
    exec tail -F "$RUN_LOG"
else
    echo "==> exec edge-api $*"
    exec /app/bin/edge-api "$@"
fi
