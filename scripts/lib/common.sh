# scripts/lib/common.sh — 所有脚本共用的工具/常量/helper
# 用法:source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"  (从 scripts/*.sh 调)
# 或   source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh" (从 scripts/sub/*.sh 调)
#
# 不可执行(不是脚本入口),仅被 source。

# ─── 防重复 source ─────────────────────────────────────────────────────
[ -n "${AEGIS_COMMON_SOURCED:-}" ] && return 0
AEGIS_COMMON_SOURCED=1

# ─── 路径 ──────────────────────────────────────────────────────────────
AEGIS_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AEGIS_REPO_ROOT="$(cd "$AEGIS_SCRIPT_DIR/.." && pwd)"
AEGIS_ENV_FILE="${ENV_FILE:-$AEGIS_REPO_ROOT/deploy/.env}"
AEGIS_COMPOSE_FILE="${COMPOSE_FILE:-$AEGIS_REPO_ROOT/deploy/docker-compose.dev.yml}"
AEGIS_PROJECT_NAME="${PROJECT_NAME:-aegis-dev}"

# ─── 颜色 ──────────────────────────────────────────────────────────────
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
    C_G=$'\033[0;32m'; C_R=$'\033[0;31m'; C_Y=$'\033[1;33m'
    C_B=$'\033[0;34m'; C_D=$'\033[0;36m'; C_M=$'\033[0;35m'
    C_BOLD=$'\033[1m'; C_N=$'\033[0m'
else
    C_G=""; C_R=""; C_Y=""; C_B=""; C_D=""; C_M=""; C_BOLD=""; C_N=""
fi

# ─── 计数 + 失败原因 + 人工操作项 ─────────────────────────────────────
AEGIS_PASS_COUNT=${AEGIS_PASS_COUNT:-0}
AEGIS_FAIL_COUNT=${AEGIS_FAIL_COUNT:-0}
AEGIS_WARN_COUNT=${AEGIS_WARN_COUNT:-0}
AEGIS_SKIP_COUNT=${AEGIS_SKIP_COUNT:-0}
AEGIS_FAIL_REASONS=()
AEGIS_NEXT_ACTIONS=()

pass()   { printf '%s[PASS]%s %s\n' "$C_G" "$C_N" "$*"; AEGIS_PASS_COUNT=$((AEGIS_PASS_COUNT+1)); }
fail()   { printf '%s[FAIL]%s %s\n' "$C_R" "$C_N" "$*"; AEGIS_FAIL_COUNT=$((AEGIS_FAIL_COUNT+1)); AEGIS_FAIL_REASONS+=("$*"); }
warn()   { printf '%s[WARN]%s %s\n' "$C_Y" "$C_N" "$*"; AEGIS_WARN_COUNT=$((AEGIS_WARN_COUNT+1)); }
info()   { printf '%s[INFO]%s %s\n' "$C_B" "$C_N" "$*"; }
skip()   { printf '%s[SKIP]%s %s\n' "$C_D" "$C_N" "$*"; AEGIS_SKIP_COUNT=$((AEGIS_SKIP_COUNT+1)); }
action() { AEGIS_NEXT_ACTIONS+=("$*"); }

step() {
    printf '\n%s━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%s\n' "$C_B" "$C_N"
    printf '%s  %s%s\n' "$C_B" "$*" "$C_N"
    printf '%s━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%s\n' "$C_B" "$C_N"
}

# 在某个子脚本输出"模块名 + 状态"标题,被 check.sh 等 orchestrator 调用前打
banner() {
    printf '\n%s═══ %s ═══%s\n' "$C_BOLD" "$*" "$C_N"
}

# ─── env 读取 ─────────────────────────────────────────────────────────
env_get() {
    [ -f "$AEGIS_ENV_FILE" ] || { printf ''; return; }
    grep -E "^$1=" "$AEGIS_ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | sed 's/\r$//'
}

env_required() {
    local v
    v="$(env_get "$1")"
    if [ -z "$v" ] || [[ "$v" == ChangeMe* ]]; then
        fail "env $1 未配置 / 仍是 ChangeMe 占位"
        return 1
    fi
    printf '%s' "$v"
}

mask() {
    local v="$1"
    if [ ${#v} -gt 16 ]; then printf '%s…(len=%d)' "${v:0:8}" "${#v}"
    else printf '%s' "$v"; fi
}

# ─── docker 工具 ──────────────────────────────────────────────────────
docker_ok() { docker info >/dev/null 2>&1; }

container_status() {
    docker inspect "$1" --format '{{.State.Status}}' 2>/dev/null || printf 'missing'
}
container_health() {
    docker inspect "$1" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' 2>/dev/null || printf 'missing'
}
container_running() {
    [ "$(container_status "$1")" = "running" ]
}
container_healthy() {
    local h
    h="$(container_health "$1")"
    [ "$h" = "healthy" ] || [ "$h" = "none" ] && container_running "$1"
}

# 等容器进入 healthy(无 healthcheck 就等 running),超时返回 1
wait_container() {
    local name="$1"; local timeout="${2:-180}"; local elapsed=0
    local has_hc status
    has_hc="$(docker inspect "$name" --format '{{if .State.Health}}1{{else}}0{{end}}' 2>/dev/null || echo 0)"
    while [ "$elapsed" -lt "$timeout" ]; do
        if [ "$has_hc" = "1" ]; then
            status="$(container_health "$name")"
            [ "$status" = "healthy" ] && { printf '%s' "$status"; return 0; }
        else
            status="$(container_status "$name")"
            [ "$status" = "running" ] && { printf '%s' "$status"; return 0; }
        fi
        case "$status" in exited|dead) printf '%s' "$status"; return 1 ;; esac
        sleep 3; elapsed=$((elapsed+3))
    done
    printf '%s' "$status"
    return 1
}

# ─── docker compose(v1 / v2 自适应)──────────────────────────────────
compose_detect() {
    if docker compose version >/dev/null 2>&1; then
        AEGIS_COMPOSE_V=2
        AEGIS_COMPOSE_FILE_EFF="$AEGIS_COMPOSE_FILE"
    elif command -v docker-compose >/dev/null 2>&1; then
        AEGIS_COMPOSE_V=1
        # v1 不支持顶层 'name:' 字段,自动剥离
        AEGIS_COMPOSE_FILE_EFF="$(mktemp /tmp/aegis-compose-v1.XXXXXX.yml)"
        grep -vE '^name:[[:space:]]' "$AEGIS_COMPOSE_FILE" > "$AEGIS_COMPOSE_FILE_EFF"
    else
        AEGIS_COMPOSE_V=0
        return 1
    fi
    return 0
}

compose() {
    if [ -z "${AEGIS_COMPOSE_V:-}" ]; then compose_detect || return 1; fi
    if [ "$AEGIS_COMPOSE_V" = "2" ]; then
        docker compose -p "$AEGIS_PROJECT_NAME" -f "$AEGIS_COMPOSE_FILE_EFF" --env-file "$AEGIS_ENV_FILE" --profile bff "$@"
    else
        docker-compose -p "$AEGIS_PROJECT_NAME" -f "$AEGIS_COMPOSE_FILE_EFF" --env-file "$AEGIS_ENV_FILE" --profile bff "$@"
    fi
}

# 兜底 v1 KeyError: ContainerConfig — 若错但容器都 Up 则视为成功
compose_up_tolerant() {
    local out; out=$(mktemp)
    if compose up -d "$@" 2>&1 | tee "$out"; then
        rm -f "$out"; return 0
    fi
    if grep -qE "KeyError.*(ContainerConfig|Config)" "$out"; then
        warn "docker-compose v1 已知 bug:KeyError(engine ≥23 + compose 1.x 不兼容)"
        local all=1 c
        for c in aegis-mysql aegis-redis aegis-edgeapi aegis-edgenode aegis-bff-edge; do
            container_running "$c" || all=0
        done
        rm -f "$out"
        if [ $all -eq 1 ]; then
            warn "容器实际已 running,降级继续"
            action "(可选)迁 compose v2:apt remove docker-compose && apt install docker-compose-plugin"
            return 0
        fi
    fi
    rm -f "$out"
    return 1
}

# ─── MySQL ────────────────────────────────────────────────────────────
AEGIS_MYSQL_ROOT_PW_CACHED=""
mysql_q() {
    local sql="$1"
    if [ -z "$AEGIS_MYSQL_ROOT_PW_CACHED" ]; then
        AEGIS_MYSQL_ROOT_PW_CACHED="$(env_get MYSQL_ROOT_PASSWORD)"
    fi
    docker exec aegis-mysql mysql -uroot -p"$AEGIS_MYSQL_ROOT_PW_CACHED" db_edge -N -s -e "$sql" 2>/dev/null | tr -d '\r'
}

mysql_alive() {
    container_running aegis-mysql || return 1
    [ "$(mysql_q "SELECT 1;")" = "1" ]
}

# ─── HTTP / curl helpers ──────────────────────────────────────────────
BFF="${BFF_URL:-http://127.0.0.1:4002}"

bff_curl() {
    # bff_curl METHOD PATH [JSON_BODY]
    local method="$1"; local path="$2"; local body="${3:-}"
    local token; token="$(env_get AEGIS_INTERNAL_SECRET)"
    local args=(-sS -m 30 -w '\n%{http_code}'
        -H "X-Aegis-Internal-Token: $token"
        -X "$method" "$BFF$path")
    if [ -n "$body" ]; then
        args+=(-H 'Content-Type: application/json' -d "$body")
    fi
    curl "${args[@]}" 2>&1
}

http_code() { printf '%s' "$1" | tail -1; }
http_body() { printf '%s' "$1" | sed '$d'; }

# ─── 测试常量(可被 env 覆盖)─────────────────────────────────────────
TEST_TENANT_ID="${TEST_TENANT_ID:-1}"
TEST_USERNAME="${TEST_USERNAME:-aegis-e2e-tenant}"
TEST_EMAIL="${TEST_EMAIL:-aegis-e2e@example.com}"
TEST_DOMAIN="${TEST_DOMAIN:-e2e-aegis.example.com}"
TEST_ORIGIN="${TEST_ORIGIN:-http://156.245.207.41:80}"
TEST_REAL_DOMAIN="${TEST_REAL_DOMAIN:-}"   # 真实 DNS 已解析到 edgenode 的域名(test-domain/443/ssl 用)

# ─── 报告 / 汇总 ──────────────────────────────────────────────────────
summary() {
    local title="${1:-总结}"
    step "$title"
    local total=$((AEGIS_PASS_COUNT + AEGIS_FAIL_COUNT))
    printf 'PASS: %s%d%s  FAIL: %s%d%s  WARN: %s%d%s  SKIP: %s%d%s\n' \
        "$C_G" "$AEGIS_PASS_COUNT" "$C_N" \
        "$C_R" "$AEGIS_FAIL_COUNT" "$C_N" \
        "$C_Y" "$AEGIS_WARN_COUNT" "$C_N" \
        "$C_D" "$AEGIS_SKIP_COUNT" "$C_N"
    if [ "$AEGIS_FAIL_COUNT" -eq 0 ]; then
        printf '%sSYSTEM STATUS: PASS%s\n' "$C_G$C_BOLD" "$C_N"
    else
        printf '%sSYSTEM STATUS: FAIL%s\n' "$C_R$C_BOLD" "$C_N"
        local r
        for r in "${AEGIS_FAIL_REASONS[@]}"; do
            printf '  %s-%s %s\n' "$C_R" "$C_N" "$r"
        done
    fi
    if [ ${#AEGIS_NEXT_ACTIONS[@]} -gt 0 ]; then
        printf '\n%s人工操作项:%s\n' "$C_Y" "$C_N"
        local i=1 a
        for a in "${AEGIS_NEXT_ACTIONS[@]}"; do
            printf '  %s%d)%s %s\n' "$C_Y" "$i" "$C_N" "$a"
            i=$((i+1))
        done
    fi
}

exit_code() {
    [ "$AEGIS_FAIL_COUNT" -eq 0 ] && return 0 || return 1
}
