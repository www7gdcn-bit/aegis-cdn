#!/usr/bin/env bash
# scripts/aegis-e2e.sh — 全项目一键验收
#
# 在 Linux 服务器仓库根执行:
#   bash scripts/aegis-e2e.sh
#
# 行为(全部幂等,重跑不破坏数据):
#   1. git 状态(commit / 本地改动 / 与 origin/main 同步)
#   2. deploy/.env 必填变量检查
#   3. Docker / docker compose 版本探测(v1 自动剥离 'name:' 字段)
#   4. 启动并等待 mysql / redis / edgeapi / edgenode / bff-edge healthy
#   5. DB 检查 + 自动修复(edgeUsers.clusterId=0 → 1)
#   6. E2E:createUser → createDomain(已存在则复用,不产生脏数据)
#   7. PASS/FAIL 统一报告 + 失败时 tail 关键容器日志 + 列出人工操作项
#
# 可调 env:
#   COMPOSE_FILE         默认 deploy/docker-compose.dev.yml
#   ENV_FILE             默认 deploy/.env
#   PROJECT_NAME         默认 aegis-dev(compose v1 用 -p)
#   TEST_TENANT_ID       默认 1
#   TEST_USERNAME        默认 aegis-e2e-tenant
#   TEST_EMAIL           默认 aegis-e2e@example.com
#   TEST_DOMAIN          默认 e2e-aegis.example.com(固定 → 幂等复用)
#   TEST_ORIGIN          默认 http://156.245.207.41:80
#   WAIT_TIMEOUT         默认 180(秒)
#   SKIP_GIT_FETCH       默认 0(=1 时跳过 git fetch,内网无外网时用)
#
# 退出码:
#   0 全 PASS
#   1 业务步骤 FAIL
#   2 前置缺失(.env 缺 / docker 缺)无法继续

set -uo pipefail

# ─── 路径 / 默认 ────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-deploy/docker-compose.dev.yml}"
ENV_FILE="${ENV_FILE:-deploy/.env}"
PROJECT_NAME="${PROJECT_NAME:-aegis-dev}"

TEST_TENANT_ID="${TEST_TENANT_ID:-1}"
TEST_USERNAME="${TEST_USERNAME:-aegis-e2e-tenant}"
TEST_EMAIL="${TEST_EMAIL:-aegis-e2e@example.com}"
TEST_DOMAIN="${TEST_DOMAIN:-e2e-aegis.example.com}"
TEST_ORIGIN="${TEST_ORIGIN:-http://156.245.207.41:80}"

WAIT_TIMEOUT="${WAIT_TIMEOUT:-180}"
SKIP_GIT_FETCH="${SKIP_GIT_FETCH:-0}"

# ─── 颜色 / 计数 ────────────────────────────────────────────────────────
if [ -t 1 ]; then
    G=$'\033[0;32m'; R=$'\033[0;31m'; Y=$'\033[1;33m'; B=$'\033[0;34m'; D=$'\033[0;36m'; N=$'\033[0m'
else
    G=""; R=""; Y=""; B=""; D=""; N=""
fi

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
FAIL_REASONS=()
NEXT_ACTIONS=()

EDGE_USER_ID=""
EDGE_DOMAIN_ID=""

pass()   { echo "${G}[PASS]${N} $*"; PASS_COUNT=$((PASS_COUNT+1)); }
fail()   { echo "${R}[FAIL]${N} $*"; FAIL_COUNT=$((FAIL_COUNT+1)); FAIL_REASONS+=("$*"); }
info()   { echo "${B}[INFO]${N} $*"; }
warn()   { echo "${Y}[WARN]${N} $*"; }
skip()   { echo "${D}[SKIP]${N} $*"; SKIP_COUNT=$((SKIP_COUNT+1)); }
action() { NEXT_ACTIONS+=("$*"); }

step() {
    echo
    echo "${B}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
    echo "${B}  $*${N}"
    echo "${B}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
}

env_get() {
    [ -f "$ENV_FILE" ] || { echo ""; return; }
    grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | sed 's/\r$//'
}

mask() {
    local v="$1"
    if [ ${#v} -gt 16 ]; then
        echo "${v:0:8}…(len=${#v})"
    else
        echo "$v"
    fi
}

# 容器 -> mysql 执行
# 注意:必须等 mysql healthy 之后才可用
MYSQL_ROOT_PASSWORD_CACHED=""
mysql_exec() {
    local sql="$1"
    if [ -z "$MYSQL_ROOT_PASSWORD_CACHED" ]; then
        MYSQL_ROOT_PASSWORD_CACHED=$(env_get MYSQL_ROOT_PASSWORD)
    fi
    docker exec aegis-mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD_CACHED" db_edge -N -s -e "$sql" 2>/dev/null | tr -d '\r'
}

# 失败时统一 tail 关键容器日志
tail_relevant_logs() {
    echo
    echo "${Y}--- 关键容器日志(失败诊断,最近 40 行)---${N}"
    for c in aegis-bff-edge aegis-edgeapi aegis-edgenode aegis-mysql; do
        if docker inspect "$c" >/dev/null 2>&1; then
            echo "${Y}--- $c ---${N}"
            docker logs --tail 40 "$c" 2>&1 | sed 's/^/  /' || true
            echo
        fi
    done
    echo "${Y}--- bff-edge / edgeapi 'aegis-debug' 行(payload 三层日志)---${N}"
    docker logs aegis-bff-edge 2>&1 | grep -E '(payload|aegis-debug|FAIL)' | tail -20 | sed 's/^/  /' || true
    echo
}

summary_exit() {
    local code="$1"
    step "总结"
    local total=$((PASS_COUNT + FAIL_COUNT))
    echo "PASS: ${G}$PASS_COUNT${N}  FAIL: ${R}$FAIL_COUNT${N}  SKIP: ${D}$SKIP_COUNT${N}  (total ${total})"
    if [ $FAIL_COUNT -eq 0 ] && [ "$code" = "0" ]; then
        echo
        echo "${G}✓ ALL CHECKS PASSED${N}"
        echo "  edgeUserId    = ${EDGE_USER_ID:-<未生成>}"
        echo "  edgeDomainId  = ${EDGE_DOMAIN_ID:-<未生成>}"
        echo "  serverName    = $TEST_DOMAIN"
        echo "  cnameTarget   = (saas-svc 层生成 — 本脚本未启 saas-svc,如需可宿主跑 'npm run start:dev -w @aegis/saas-svc')"
    else
        echo
        echo "${R}✗ FAIL — ${#FAIL_REASONS[@]} 项${N}"
        for r in "${FAIL_REASONS[@]}"; do
            echo "  ${R}-${N} $r"
        done
    fi

    if [ ${#NEXT_ACTIONS[@]} -gt 0 ]; then
        echo
        echo "${Y}人工要做的事:${N}"
        local i=1
        for a in "${NEXT_ACTIONS[@]}"; do
            echo "  ${Y}${i})${N} $a"
            i=$((i+1))
        done
    fi

    exit "$code"
}

# ═════════════════════════════════════════════════════════════════════════
# 1. git 状态
# ═════════════════════════════════════════════════════════════════════════
step "1/7  git 状态"

if [ ! -d .git ] && [ ! -f .git ]; then
    fail "不在 git 仓库根目录(.git 不存在)"
    action "cd 到 aegis-cdn 仓库根再跑"
    summary_exit 2
fi

HEAD_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "?")
HEAD_MSG=$(git log -1 --format=%s 2>/dev/null || echo "?")
info "HEAD = $HEAD_COMMIT  $HEAD_MSG"
pass "git rev-parse OK"

if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    warn "工作树有未提交改动 — 不阻塞执行,但下次 git pull 前需 stash/commit:"
    git status --short 2>/dev/null | head -10 | sed 's/^/    /'
fi

if [ "$SKIP_GIT_FETCH" != "1" ]; then
    if git fetch origin main --quiet 2>/dev/null; then
        behind=$(git rev-list HEAD..origin/main --count 2>/dev/null || echo 0)
        ahead=$(git rev-list origin/main..HEAD --count 2>/dev/null || echo 0)
        if [ "$behind" -gt 0 ]; then
            warn "本地落后 origin/main $behind 个 commit,ahead=$ahead"
            action "git pull --rebase origin main(确保用最新 fix)"
        else
            pass "HEAD 与 origin/main 同步(ahead=$ahead, behind=0)"
        fi
    else
        warn "git fetch origin 失败(无网络/无认证)— 跳过同步检查"
    fi
else
    info "SKIP_GIT_FETCH=1,跳过 fetch"
fi

# ═════════════════════════════════════════════════════════════════════════
# 2. .env 必填变量
# ═════════════════════════════════════════════════════════════════════════
step "2/7  deploy/.env 必填变量"

if [ ! -f "$ENV_FILE" ]; then
    fail "$ENV_FILE 不存在"
    action "cp deploy/.env.example $ENV_FILE,然后把 ChangeMe_* 改成强随机密码"
    summary_exit 2
fi
pass "$ENV_FILE 存在"

REQUIRED_VARS=(
    AEGIS_INTERNAL_SECRET
    EDGE_API_ADMIN_NODE_ID
    EDGE_API_ADMIN_NODE_SECRET
    EDGE_NODE_CLUSTER_ID
    EDGE_NODE_CLUSTER_SECRET
    EDGE_DEFAULT_CLUSTER_ID
    MYSQL_ROOT_PASSWORD
    REDIS_PASSWORD
    AEGIS_JWT_SECRET
)

ENV_OK=1
for var in "${REQUIRED_VARS[@]}"; do
    val=$(env_get "$var")
    if [ -z "$val" ]; then
        fail "$var 未设置(空值)"
        ENV_OK=0
        case "$var" in
            EDGE_API_ADMIN_NODE_ID|EDGE_API_ADMIN_NODE_SECRET)
                action "等 edgeapi 容器起来后,跑 'docker exec aegis-edgeapi cat /app/configs/.admin-token.json' 取 adminNodeId/Secret,填到 $ENV_FILE 的 EDGE_API_ADMIN_NODE_ID / EDGE_API_ADMIN_NODE_SECRET"
                ;;
            EDGE_NODE_CLUSTER_ID|EDGE_NODE_CLUSTER_SECRET)
                action "在 EdgeAdmin 后台或 SQL(SELECT id, secret FROM edgeNodeClusters)取 cluster 凭证,填到 $ENV_FILE 的 EDGE_NODE_CLUSTER_ID / EDGE_NODE_CLUSTER_SECRET"
                ;;
            AEGIS_INTERNAL_SECRET|AEGIS_JWT_SECRET)
                action "在 $ENV_FILE 设置 $var,建议:openssl rand -hex 32"
                ;;
            *)
                action "在 $ENV_FILE 设置 $var"
                ;;
        esac
    elif [[ "$val" == ChangeMe* ]]; then
        fail "$var 仍是 ChangeMe 占位符"
        ENV_OK=0
        action "在 $ENV_FILE 把 $var 改成真实强随机值(openssl rand -hex 32)"
    else
        case "$var" in
            *SECRET*|*PASSWORD*)
                pass "$var=$(mask "$val")"
                ;;
            *)
                pass "$var=$val"
                ;;
        esac
    fi
done

cid=$(env_get EDGE_DEFAULT_CLUSTER_ID)
if [ -n "$cid" ] && [ "$cid" -gt 0 ] 2>/dev/null; then
    :
else
    fail "EDGE_DEFAULT_CLUSTER_ID='$cid' 必须 > 0(规避 GoEdge service_server.go:218-237 admin 模式 bug)"
    action "在 $ENV_FILE 设 EDGE_DEFAULT_CLUSTER_ID=1(若已建 cluster id=1)"
    ENV_OK=0
fi

[ $ENV_OK -eq 0 ] && summary_exit 2

# ═════════════════════════════════════════════════════════════════════════
# 3. Docker / Compose
# ═════════════════════════════════════════════════════════════════════════
step "3/7  Docker / docker compose"

if ! command -v docker >/dev/null 2>&1; then
    fail "docker CLI 未安装"
    action "https://docs.docker.com/engine/install/"
    summary_exit 2
fi
pass "docker = $(docker --version 2>&1 | head -1)"

if ! docker info >/dev/null 2>&1; then
    fail "docker daemon 不可达(可能未启动或当前用户没 docker group 权限)"
    action "sudo systemctl start docker  或  把当前用户加入 docker group:sudo usermod -aG docker \$USER"
    summary_exit 2
fi
pass "docker daemon 在线"

COMPOSE_USE_V2=0
COMPOSE_FILE_EFFECTIVE="$COMPOSE_FILE"
if docker compose version >/dev/null 2>&1; then
    COMPOSE_USE_V2=1
    pass "docker compose v2 = $(docker compose version --short 2>&1 | head -1)"
elif command -v docker-compose >/dev/null 2>&1; then
    warn "未找到 docker compose v2,降级 docker-compose v1 = $(docker-compose --version 2>&1 | head -1)"
    warn "v1 不支持 compose 文件顶层 'name:' 字段,自动剥离生成临时 yaml"
    TMP_COMPOSE=$(mktemp /tmp/aegis-compose-v1.XXXXXX.yml)
    grep -vE '^name:[[:space:]]' "$COMPOSE_FILE" > "$TMP_COMPOSE"
    COMPOSE_FILE_EFFECTIVE="$TMP_COMPOSE"
    info "临时 yaml: $TMP_COMPOSE"
else
    fail "docker compose v2 / docker-compose v1 都未安装"
    action "安装 docker compose plugin:https://docs.docker.com/compose/install/"
    summary_exit 2
fi

# 组装 compose 命令(数组形式,避免引号/转义问题)
if [ $COMPOSE_USE_V2 -eq 1 ]; then
    COMPOSE=(docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE_EFFECTIVE" --env-file "$ENV_FILE" --profile bff)
else
    COMPOSE=(docker-compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE_EFFECTIVE" --env-file "$ENV_FILE" --profile bff)
fi

# ═════════════════════════════════════════════════════════════════════════
# 4. 容器启动 + 等待健康
# ═════════════════════════════════════════════════════════════════════════
step "4/7  启动容器并等待就绪"

info "exec: ${COMPOSE[*]} up -d --build mysql redis edgeapi edgenode bff-edge"
if ! "${COMPOSE[@]}" up -d --build mysql redis edgeapi edgenode bff-edge; then
    fail "docker compose up 失败 — 看上面的 build / config 报错"
    action "单独跑:${COMPOSE[*]} build mysql 等子命令看具体错误"
    tail_relevant_logs
    summary_exit 1
fi
pass "docker compose up 已发出"

wait_healthy() {
    local name="$1"
    local timeout="$2"
    local elapsed=0
    local status="?"
    while [ "$elapsed" -lt "$timeout" ]; do
        status=$(docker inspect "$name" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || echo missing)
        case "$status" in
            healthy|running)
                # 对 mysql/redis/edgeapi/bff-edge 来说,healthy 才算就绪;
                # 没 healthcheck 的容器(edgenode)拿到 running 也认
                local has_hc
                has_hc=$(docker inspect "$name" --format '{{if .State.Health}}1{{else}}0{{end}}' 2>/dev/null || echo 0)
                if [ "$has_hc" = "1" ]; then
                    [ "$status" = "healthy" ] && { echo "$status"; return 0; }
                else
                    [ "$status" = "running" ] && { echo "$status"; return 0; }
                fi
                ;;
            exited|dead)
                echo "$status"
                return 1
                ;;
        esac
        sleep 3
        elapsed=$((elapsed+3))
    done
    echo "$status"
    return 1
}

WAIT_FAIL=0
for svc in aegis-mysql aegis-redis aegis-edgeapi aegis-edgenode aegis-bff-edge; do
    info "等待 $svc 就绪(timeout ${WAIT_TIMEOUT}s)..."
    if final_status=$(wait_healthy "$svc" "$WAIT_TIMEOUT"); then
        pass "$svc → $final_status"
    else
        fail "$svc 未在 ${WAIT_TIMEOUT}s 内就绪:status=$final_status"
        WAIT_FAIL=1
        case "$svc" in
            aegis-edgeapi)
                action "看 docker logs aegis-edgeapi,若 setup 失败,清空 aegis-edgeapi-configs volume 重来:docker volume rm aegis-dev_aegis-edgeapi-configs"
                ;;
            aegis-edgenode)
                action "看 docker logs aegis-edgenode,通常是 EDGE_NODE_CLUSTER_ID / SECRET 没填或不正确"
                ;;
            aegis-bff-edge)
                action "看 docker logs aegis-bff-edge,EDGE_API_ADMIN_NODE_ID / SECRET 没填 / 错时 nest 会启动失败"
                ;;
        esac
    fi
done

if [ $WAIT_FAIL -eq 1 ]; then
    tail_relevant_logs
    summary_exit 1
fi

# ═════════════════════════════════════════════════════════════════════════
# 5. DB 检查 / 自动修复
# ═════════════════════════════════════════════════════════════════════════
step "5/7  数据库检查 / 修复"

# 5.1 edgeNodeClusters id=1
cluster_row=$(mysql_exec "SELECT id, name FROM edgeNodeClusters WHERE id=1;")
if [ -n "$cluster_row" ]; then
    pass "edgeNodeClusters id=1 存在:$cluster_row"
else
    fail "edgeNodeClusters id=1 不存在(EdgeAPI setup 通常自动建)"
    action "看 docker logs aegis-edgeapi 确认 setup 成功;若失败,清 aegis-edgeapi-configs volume 重新启动 edgeapi"
fi

# 5.2 edgeUsers.clusterId 自动修
broken_users=$(mysql_exec "SELECT COUNT(*) FROM edgeUsers WHERE clusterId=0 OR clusterId IS NULL;")
broken_users="${broken_users:-0}"
if [ "$broken_users" -gt 0 ] 2>/dev/null; then
    warn "$broken_users 个 edgeUsers 的 clusterId=0/NULL,自动修复为 1"
    mysql_exec "UPDATE edgeUsers SET clusterId=1 WHERE clusterId=0 OR clusterId IS NULL;" >/dev/null
    after=$(mysql_exec "SELECT COUNT(*) FROM edgeUsers WHERE clusterId=0 OR clusterId IS NULL;")
    after="${after:-0}"
    if [ "$after" = "0" ]; then
        pass "edgeUsers.clusterId 修复完成($broken_users 行 → clusterId=1)"
    else
        fail "edgeUsers 修复后仍有 $after 行 clusterId<=0"
    fi
else
    pass "edgeUsers.clusterId 全部 > 0(或表为空)"
fi

# 5.3 edgeNodes
node_total=$(mysql_exec "SELECT COUNT(*) FROM edgeNodes;")
node_total="${node_total:-0}"
if [ "$node_total" = "0" ]; then
    warn "edgeNodes 表为空 — EdgeNode 还没注册到 EdgeAPI(集群凭证不正确 / 启动失败)"
    action "看 docker logs aegis-edgenode,确认 cluster.yaml 渲染正确且能连到 EdgeAPI:8003"
    # 不阻断:createUser/Domain 仍可跑,只是真实流量不会被节点处理
else
    pass "edgeNodes 行数 = $node_total"
    bad_nodes=0
    while IFS=$'\t' read -r id cid is_on is_up is_inst; do
        [ -z "${id:-}" ] && continue
        if [ "$is_on" = "1" ] && [ "$is_up" = "1" ] && [ "$is_inst" = "1" ]; then
            pass "  edgeNodes id=$id clusterId=$cid isOn/Up/Installed=1/1/1"
        else
            warn "  edgeNodes id=$id clusterId=$cid isOn=$is_on isUp=$is_up isInstalled=$is_inst(期望全 1)"
            bad_nodes=$((bad_nodes+1))
        fi
    done < <(mysql_exec "SELECT id, clusterId, isOn, isUp, isInstalled FROM edgeNodes;")
    if [ "$bad_nodes" -gt 0 ]; then
        action "$bad_nodes 个 edgeNode 状态异常 — isUp 由 heartbeat 触发,等 30s 后重跑;或 SQL 兜底 UPDATE edgeNodes SET isOn=1, isUp=1, isInstalled=1;"
    fi
fi

# ═════════════════════════════════════════════════════════════════════════
# 6. E2E:createUser → createDomain
# ═════════════════════════════════════════════════════════════════════════
step "6/7  E2E createUser + createDomain"

INTERNAL_TOKEN=$(env_get AEGIS_INTERNAL_SECRET)
BFF="http://127.0.0.1:4002"

# 6.1 createUser(幂等)
info "POST $BFF/internal/edge/users  tenantId=$TEST_TENANT_ID username=$TEST_USERNAME"
user_payload=$(printf '{"tenantId":%d,"username":"%s","email":"%s"}' \
    "$TEST_TENANT_ID" "$TEST_USERNAME" "$TEST_EMAIL")
resp=$(curl -sS -m 30 -w '\n%{http_code}' \
    -H 'Content-Type: application/json' \
    -H "X-Aegis-Internal-Token: $INTERNAL_TOKEN" \
    -X POST "$BFF/internal/edge/users" \
    -d "$user_payload" 2>&1) || true
http=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')

case "$http" in
    200|201)
        EDGE_USER_ID=$(echo "$body" | grep -oE '"edgeUserId":[[:space:]]*[0-9]+' | head -1 | grep -oE '[0-9]+')
        pass "createUser HTTP=$http edgeUserId=$EDGE_USER_ID body=$body"
        ;;
    409)
        EDGE_USER_ID=$(mysql_exec "SELECT id FROM edgeUsers WHERE username='$TEST_USERNAME' ORDER BY id DESC LIMIT 1;")
        if [ -n "$EDGE_USER_ID" ]; then
            pass "createUser HTTP=409 → SQL 取回 edgeUserId=$EDGE_USER_ID(幂等复用)"
        else
            fail "createUser HTTP=409 但 SQL 查 username=$TEST_USERNAME 无记录,body=$body"
        fi
        ;;
    *)
        fail "createUser HTTP=$http body=$body"
        action "看 docker logs aegis-bff-edge,EDGE_API_DEBUG=on 时 SDK 会打 gRPC 完整 payload + grpc code"
        ;;
esac

# 6.2 createDomain(幂等)— 先 list 看是否已存在
if [ -n "$EDGE_USER_ID" ]; then
    info "GET  $BFF/internal/edge/domains?edgeUserId=$EDGE_USER_ID  (检查 $TEST_DOMAIN 是否已存在)"
    list_resp=$(curl -sS -m 30 \
        -H "X-Aegis-Internal-Token: $INTERNAL_TOKEN" \
        "$BFF/internal/edge/domains?edgeUserId=$EDGE_USER_ID" 2>&1) || list_resp=""

    if echo "$list_resp" | grep -q "\"name\":\"$TEST_DOMAIN\""; then
        EDGE_DOMAIN_ID=$(mysql_exec "SELECT id FROM edgeServers WHERE name='$TEST_DOMAIN' ORDER BY id DESC LIMIT 1;")
        skip "createDomain 已存在 → 复用 edgeDomainId=$EDGE_DOMAIN_ID(幂等)"
    else
        info "POST $BFF/internal/edge/domains  serverNames=[$TEST_DOMAIN] originAddrs=[$TEST_ORIGIN]"
        dom_payload=$(printf '{"tenantId":%d,"edgeUserId":%d,"serverNames":["%s"],"originAddrs":["%s"]}' \
            "$TEST_TENANT_ID" "$EDGE_USER_ID" "$TEST_DOMAIN" "$TEST_ORIGIN")
        resp=$(curl -sS -m 60 -w '\n%{http_code}' \
            -H 'Content-Type: application/json' \
            -H "X-Aegis-Internal-Token: $INTERNAL_TOKEN" \
            -X POST "$BFF/internal/edge/domains" \
            -d "$dom_payload" 2>&1) || true
        http=$(echo "$resp" | tail -1)
        body=$(echo "$resp" | sed '$d')

        case "$http" in
            200|201)
                EDGE_DOMAIN_ID=$(echo "$body" | grep -oE '"edgeDomainId":[[:space:]]*[0-9]+' | head -1 | grep -oE '[0-9]+')
                pass "createDomain HTTP=$http edgeDomainId=$EDGE_DOMAIN_ID body=$body"
                ;;
            409)
                EDGE_DOMAIN_ID=$(mysql_exec "SELECT id FROM edgeServers WHERE name='$TEST_DOMAIN' ORDER BY id DESC LIMIT 1;")
                skip "createDomain HTTP=409 → SQL 取回 edgeDomainId=$EDGE_DOMAIN_ID(幂等复用)"
                ;;
            *)
                fail "createDomain HTTP=$http body=$body"
                action "看 docker logs aegis-bff-edge | grep -E '(payload|FAIL)';确认 EDGE_DEFAULT_CLUSTER_ID > 0(规避 GoEdge service_server.go:218-237 bug)"
                ;;
        esac
    fi

    # 6.3 落库验证 + status
    if [ -n "$EDGE_DOMAIN_ID" ]; then
        info "SQL 验证 edgeServers id=$EDGE_DOMAIN_ID"
        srv_row=$(mysql_exec "SELECT id, name, isOn, state, clusterId, userId FROM edgeServers WHERE id=$EDGE_DOMAIN_ID;")
        if [ -n "$srv_row" ]; then
            pass "edgeServers 落库:$srv_row"
        else
            fail "edgeServers WHERE id=$EDGE_DOMAIN_ID 查不到行 — 写入未持久化"
        fi
    fi
else
    skip "EDGE_USER_ID 未取得,跳过 createDomain"
fi

# ═════════════════════════════════════════════════════════════════════════
# 7. 失败时 tail logs + 报告
# ═════════════════════════════════════════════════════════════════════════
step "7/7  报告"

if [ $FAIL_COUNT -gt 0 ]; then
    tail_relevant_logs
fi

if [ $FAIL_COUNT -eq 0 ]; then
    summary_exit 0
else
    summary_exit 1
fi
