#!/usr/bin/env bash
# deploy/docker/edgenode-entrypoint.sh — Phase 1 Step 3
#
# 职责:
#   1. 首次启动:把 configs/cluster.template.yaml 复制为 cluster.yaml,
#      用 env(AEGIS_CLUSTER_ID / AEGIS_CLUSTER_SECRET / AEGIS_EDGE_API_ENDPOINTS)envsubst 渲染
#   2. 后续启动:cluster.yaml 已存在则跳过,直接 exec edge-node start
#
# 失败条件:
#   - AEGIS_CLUSTER_ID 或 AEGIS_CLUSTER_SECRET 为空 → 阻止启动,提示先去 EdgeAPI 建集群

set -euo pipefail

CONFIGS=/app/configs
TEMPLATES=/app/configs.template
CLUSTER_YAML=$CONFIGS/cluster.yaml

# ─────────────────────────────────────────
# 1. 把模板搬到持久卷(若卷里空)
# ─────────────────────────────────────────
if [ ! -d "$CONFIGS" ] || [ -z "$(ls -A "$CONFIGS" 2>/dev/null || true)" ]; then
    echo "==> first run: copy config templates to $CONFIGS"
    mkdir -p "$CONFIGS"
    cp -rn "$TEMPLATES"/. "$CONFIGS/" 2>/dev/null || true
fi

# ─────────────────────────────────────────
# 2. 渲染 cluster.yaml(集群自动接入模式)
#    每次启动都覆盖,保证跟 env 一致
# ─────────────────────────────────────────
if [ -z "${AEGIS_CLUSTER_ID:-}" ] || [ -z "${AEGIS_CLUSTER_SECRET:-}" ]; then
    cat >&2 <<EOF
═══════════════════════════════════════════════════════════
[ERROR] EdgeNode 启动失败:缺少集群凭证。

  AEGIS_CLUSTER_ID 与 AEGIS_CLUSTER_SECRET 必须设置。

  这两个值由"在 EdgeAPI 创建第一个集群"后获得。详见:
    deploy/README.md 「首次启动 5 步」步骤 3-4

  简易步骤:
    1. 先单独起 mysql/redis/edgeapi:
         docker compose -f deploy/docker-compose.dev.yml up -d mysql redis edgeapi
    2. 取 admin token:
         docker compose exec edgeapi cat /app/configs/.admin-token.json
    3. 用 admin token 调 EdgeAPI gRPC 创建第一个 cluster(详见 README)
    4. 把返回的 clusterId/secret 写回 deploy/.env 的
       EDGE_NODE_CLUSTER_ID / EDGE_NODE_CLUSTER_SECRET
    5. 启动 edgenode:
         docker compose -f deploy/docker-compose.dev.yml up -d edgenode
═══════════════════════════════════════════════════════════
EOF
    exit 1
fi

# 用 envsubst 渲染(EdgeNode 镜像装了 gettext-base)
export AEGIS_EDGE_API_ENDPOINTS AEGIS_CLUSTER_ID AEGIS_CLUSTER_SECRET

cat > "$CLUSTER_YAML" <<EOF
rpc:
  endpoints: [ "${AEGIS_EDGE_API_ENDPOINTS}" ]
clusterId: "${AEGIS_CLUSTER_ID}"
secret: "${AEGIS_CLUSTER_SECRET}"
EOF

echo "==> cluster.yaml rendered (endpoints=${AEGIS_EDGE_API_ENDPOINTS} clusterId=${AEGIS_CLUSTER_ID})"

# ─────────────────────────────────────────
# 3. 保活策略 — start daemon + tail -F run.log(同 EdgeAPI entrypoint 模式)
#
# GoEdge `edge-node start`(EdgeNode/internal/apps/app_cmd.go:runStart 同 EdgeAPI):
#   cmd := exec.Command(this.exe())
#   cmd.Start()                              # fork 子进程后台跑
#   fmt.Println("Edge Node started ok, pid: N"); return  # 主进程立刻 exit 0
#
# 容器中 `exec edge-node start` → 主进程 exit 0 → docker 认为容器死
# → restart: unless-stopped 拉起 → 又跑 → 又退 → 无限 Restarting 循环
#
# 修复:
#   1. 非 exec 调用 edge-node start → fork daemon,主进程立即返回
#   2. sleep 2 等 daemon 初始化 + 开始写 run.log
#   3. touch run.log 防 tail -F 文件不存在
#   4. exec tail -F /app/logs/run.log 作为容器主进程,前台保活 + docker logs 直出 GoEdge 日志
# ─────────────────────────────────────────

LOG_DIR=/app/logs
mkdir -p "$LOG_DIR"
RUN_LOG="$LOG_DIR/run.log"

if [ "$#" -eq 0 ] || [ "${1:-}" = "start" ]; then
    echo "==> launching edge-node daemon (start subcommand,fork to background)"
    /app/bin/edge-node start || {
        echo "[ERROR] edge-node start failed" >&2
        exit 1
    }
    sleep 2
    touch "$RUN_LOG"
    echo "==> daemon started;tailing $RUN_LOG as container PID 1 (foreground keepalive)"
    exec tail -F "$RUN_LOG"
else
    echo "==> exec edge-node $*"
    exec /app/bin/edge-node "$@"
fi
