#!/usr/bin/env bash
# scripts/e2e-edge-domain.sh
#
# 一键 E2E 验证 createDomain 链路:
#   git commit / bff-edge env / edgeUsers.clusterId / edgeNodes / curl / tail logs
#
# 用法(在 Linux 服务器仓库根):
#   bash scripts/e2e-edge-domain.sh
#
# env 可调:
#   COMPOSE_FILE      默认 deploy/docker-compose.dev.yml
#   ENV_FILE          默认 deploy/.env
#   TEST_DOMAIN       默认 e2e-$(date +%s).example.com(每次自动唯一)
#   TEST_ORIGIN       默认 156.245.207.41:80
#   TEST_EDGE_USER_ID 默认从 edgeUsers 表自动取 id MAX
#   INTERNAL_TOKEN    默认从 ENV_FILE 取 AEGIS_INTERNAL_SECRET
#
# 输出:每步 [PASS]/[FAIL]/[INFO] + 最终 PASS/FAIL 总结

set -uo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-deploy/docker-compose.dev.yml}"
ENV_FILE="${ENV_FILE:-deploy/.env}"
TEST_DOMAIN="${TEST_DOMAIN:-e2e-$(date +%s).example.com}"
TEST_ORIGIN="${TEST_ORIGIN:-156.245.207.41:80}"

G=$'\033[0;32m'; R=$'\033[0;31m'; Y=$'\033[1;33m'; B=$'\033[0;34m'; N=$'\033[0m'

PASS_COUNT=0
FAIL_COUNT=0
FAIL_REASONS=()

pass()  { echo "${G}[PASS]${N} $*"; PASS_COUNT=$((PASS_COUNT+1)); }
fail()  { echo "${R}[FAIL]${N} $*"; FAIL_COUNT=$((FAIL_COUNT+1)); FAIL_REASONS+=("$*"); }
info()  { echo "${B}[INFO]${N} $*"; }
warn()  { echo "${Y}[WARN]${N} $*"; }

info "============================================================"
info " Aegis E2E: createDomain 链路验证"
info " repo: $(pwd)"
info " test domain: $TEST_DOMAIN"
info " test origin: $TEST_ORIGIN"
info "============================================================"

if [ ! -f "$ENV_FILE" ]; then
    fail "ENV_FILE=$ENV_FILE 不存在 — cp deploy/.env.example $ENV_FILE 后再跑"
    echo
    echo "${R}=== E2E 总结:0/1 PASS,前置失败 ===${N}"
    exit 2
fi

MYSQL_ROOT_PASSWORD=$(grep -E '^MYSQL_ROOT_PASSWORD=' "$ENV_FILE" | head -1 | cut -d= -f2-)
INTERNAL_TOKEN="${INTERNAL_TOKEN:-$(grep -E '^AEGIS_INTERNAL_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2-)}"

# ───────────────────── 1. git commit ─────────────────────
info "[1/7] 检查 git commit"
if HEAD_COMMIT=$(git rev-parse --short HEAD 2>/dev/null); then
    pass "HEAD = $HEAD_COMMIT ($(git log -1 --format=%s))"
else
    fail "git rev-parse 失败"
fi

# ───────────────────── 2. 容器状态 ─────────────────────
info "[2/7] 检查容器状态"
for svc in aegis-mysql aegis-redis aegis-edgeapi aegis-bff-edge; do
    status=$(docker inspect "$svc" --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' 2>/dev/null || echo "missing")
    if [[ "$status" == running* ]]; then
        pass "$svc: $status"
    else
        fail "$svc 未 running: $status"
    fi
done

# ───────────────────── 3. bff-edge env ─────────────────────
info "[3/7] 检查 bff-edge 关键 env"
bff_env=$(docker exec aegis-bff-edge env 2>/dev/null || echo "")
for var in EDGE_API_MODE EDGE_API_GRPC_ADDR EDGE_DEFAULT_CLUSTER_ID EDGE_API_ADMIN_NODE_ID; do
    val=$(echo "$bff_env" | grep -E "^$var=" | head -1 | cut -d= -f2-)
    if [ -z "$val" ]; then
        fail "$var 未设置"
    elif [ "$var" = "EDGE_API_ADMIN_NODE_ID" ]; then
        pass "$var=${val:0:12}..."
    else
        pass "$var=$val"
    fi
done
env_cid=$(echo "$bff_env" | grep -E '^EDGE_DEFAULT_CLUSTER_ID=' | cut -d= -f2-)
if [ -z "$env_cid" ] || ! [ "$env_cid" -gt 0 ] 2>/dev/null; then
    fail "EDGE_DEFAULT_CLUSTER_ID=$env_cid 必须 > 0(否则触发 GoEdge service_server.go:228 bug)"
fi

# ───────────────────── 4. edgeUsers.clusterId ─────────────────────
info "[4/7] 检查 edgeUsers.clusterId"
users_out=$(docker exec aegis-mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" db_edge -N -e \
    "SELECT id, username, clusterId FROM edgeUsers;" 2>&1)
if echo "$users_out" | grep -qE "(ERROR|Access denied)"; then
    fail "查询 edgeUsers 失败: $users_out"
elif [ -z "$users_out" ]; then
    warn "edgeUsers 表为空 — 先跑 saas-svc auth/register 创建 user"
else
    bad=0
    last_id=""
    while read -r id uname cid; do
        [ -z "$id" ] && continue
        last_id="$id"
        if [ -z "$cid" ] || ! [ "$cid" -gt 0 ] 2>/dev/null; then
            fail "edgeUsers id=$id username=$uname clusterId=$cid (必须 > 0)"
            bad=$((bad+1))
        else
            pass "edgeUsers id=$id username=$uname clusterId=$cid"
        fi
    done <<< "$users_out"
    TEST_EDGE_USER_ID="${TEST_EDGE_USER_ID:-$last_id}"
    info "TEST_EDGE_USER_ID 选用 $TEST_EDGE_USER_ID"
fi

# ───────────────────── 5. edgeNodes ─────────────────────
info "[5/7] 检查 edgeNodes(GoEdge 需至少一可用节点)"
nodes_out=$(docker exec aegis-mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" db_edge -N -e \
    "SELECT id, clusterId, isOn, isUp, isInstalled FROM edgeNodes;" 2>&1)
if [ -z "$nodes_out" ] || echo "$nodes_out" | grep -qE "(ERROR|Access denied)"; then
    fail "edgeNodes 表为空或查询失败"
else
    while read -r id cid is_on is_up is_inst; do
        [ -z "$id" ] && continue
        if [ "$is_on" = "1" ] && [ "$is_up" = "1" ] && [ "$is_inst" = "1" ]; then
            pass "edgeNodes id=$id clusterId=$cid isOn/Up/Installed=1/1/1"
        else
            fail "edgeNodes id=$id clusterId=$cid isOn=$is_on isUp=$is_up isInstalled=$is_inst (期望全 1)"
        fi
    done <<< "$nodes_out"
fi

# ───────────────────── 6. POST /internal/edge/domains ─────────────────────
info "[6/7] 调 bff-edge /internal/edge/domains"
if [ -z "${TEST_EDGE_USER_ID:-}" ]; then
    fail "TEST_EDGE_USER_ID 未确定,跳过 curl"
elif [ -z "$INTERNAL_TOKEN" ]; then
    fail "INTERNAL_TOKEN 未设置"
else
    payload="{\"tenantId\":1,\"edgeUserId\":$TEST_EDGE_USER_ID,\"serverNames\":[\"$TEST_DOMAIN\"],\"originAddrs\":[\"$TEST_ORIGIN\"]}"
    info "request payload: $payload"
    resp=$(curl -s -w "\n%{http_code}" -X POST \
        -H 'Content-Type: application/json' \
        -H "X-Aegis-Internal-Token: $INTERNAL_TOKEN" \
        -d "$payload" \
        http://127.0.0.1:4002/internal/edge/domains 2>&1)
    http_code=$(echo "$resp" | tail -1)
    body=$(echo "$resp" | sed '$d')
    info "response HTTP=$http_code body=$body"
    if [ "$http_code" = "201" ] || [ "$http_code" = "200" ]; then
        pass "createDomain HTTP=$http_code"
    else
        fail "createDomain HTTP=$http_code body=$body"
    fi
fi

# ───────────────────── 7. tail logs ─────────────────────
info "[7/7] 最近 40 行 bff-edge 日志"
docker logs --tail 40 aegis-bff-edge 2>&1 | sed 's/^/  /' || true

info "[7/7] 最近 30 行 edgeapi 日志"
docker logs --tail 30 aegis-edgeapi 2>&1 | sed 's/^/  /' || true

# ───────────────────── 总结 ─────────────────────
info "============================================================"
TOTAL=$((PASS_COUNT + FAIL_COUNT))
if [ "$FAIL_COUNT" -eq 0 ]; then
    echo "${G}=== E2E 总结: $PASS_COUNT/$TOTAL PASS ✓ ===${N}"
    exit 0
else
    echo "${R}=== E2E 总结: $PASS_COUNT/$TOTAL PASS, $FAIL_COUNT FAIL ✗ ===${N}"
    for r in "${FAIL_REASONS[@]}"; do
        echo "${R}  - $r${N}"
    done
    echo
    info "排查路径(按 createBasicHTTPServer 链路):"
    info "  1. 看 bff-edge logs 是否含 'createBasicHTTPServer payload:' 行 → 看 nodeClusterId 是否 > 0"
    info "  2. 看 '[edge-api-sdk] grpc →' 行 → 看 SDK 实发 payload(需 EDGE_API_DEBUG=on)"
    info "  3. 看 edgeapi /app/logs/run.log 是否含具体错误"
    info "  4. 详细排障表:docs/20 §3.3.7"
    exit 1
fi
