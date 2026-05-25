#!/usr/bin/env bash
# scripts/test-self-signed-ssl.sh — 一键自签证书 → 绑到 GoEdge server → 验 HTTPS 握手
#
# 用法:
#   bash scripts/test-self-signed-ssl.sh
#   bash scripts/test-self-signed-ssl.sh static.ddos6tfanghu.com 3      # 指定域名 + serverId
#   FORCE_NEW_CERT=1 bash scripts/test-self-signed-ssl.sh                # 强制重发(不复用已有)
#
# 目标:绕过 Let's Encrypt / ACME,先把 EdgeNode 的 TLS 链路打通。
#       浏览器不信任 OK(curl -k 跳过),Let's Encrypt 留给 ACME cron。
#
# 步骤:
#   1) openssl 生成 RSA-2048 自签 cert(含 SAN),CN=$DOMAIN,365 天
#   2) 检查 edgeServers id=$SERVER_ID 存在
#   3) 幂等查 edgeSSLCerts 是否已有同 serverName 自签证书(复用,FORCE_NEW_CERT=1 强制新建)
#   4) SQL INSERT edgeSSLCerts(certData/keyData 用 UNHEX 注入)
#   5) POST /internal/edge/domains/$SERVER_ID/bind-cert {certId}
#      → 内部 SDK:createSSLPolicy + updateServerHTTPS(同时启 HTTPS listener)
#   6) 等 8s 让 EdgeNode 拉新配置
#   7) curl -vk --resolve $DOMAIN:$h443:127.0.0.1 https://$DOMAIN:$h443/
#   8) 校验:TLS 握手 OK + subject 含 $DOMAIN → PASS

set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

DOMAIN="${1:-${SELF_SIGN_DOMAIN:-static.ddos6tfanghu.com}}"
SERVER_ID="${2:-${SELF_SIGN_SERVER_ID:-3}}"
DAYS="${SELF_SIGN_DAYS:-365}"

# 简单注入防御 — 只允许 DNS 合法字符
if ! [[ "$DOMAIN" =~ ^[a-zA-Z0-9.-]+$ ]]; then
    fail "DOMAIN 含非法字符:$DOMAIN"; exit 2
fi
if ! [[ "$SERVER_ID" =~ ^[0-9]+$ ]]; then
    fail "SERVER_ID 非数字:$SERVER_ID"; exit 2
fi

banner "自签证书 + HTTPS 链路测试 — $DOMAIN (serverId=$SERVER_ID)"

# ─── 前置 ─────────────────────────────────────────────────────────────
for tool in openssl xxd curl; do
    command -v "$tool" >/dev/null 2>&1 || { fail "$tool 未安装"; exit 2; }
done
mysql_alive || { fail "aegis-mysql 不可用"; exit 2; }
container_running aegis-bff-edge || { fail "aegis-bff-edge 未 running"; exit 2; }

# ─── 1) 生成自签证书 ─────────────────────────────────────────────────
step "1/7  openssl 生成自签证书"
TMP=$(mktemp -d /tmp/aegis-selfsign.XXXXXX)
trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/openssl.cnf" <<EOF
[req]
distinguished_name = req_dn
req_extensions     = v3_req
prompt             = no

[req_dn]
C  = CN
O  = AegisCDN Test
CN = $DOMAIN

[v3_req]
subjectAltName     = DNS:$DOMAIN
extendedKeyUsage   = serverAuth, clientAuth
basicConstraints   = CA:FALSE
keyUsage           = digitalSignature, keyEncipherment
EOF

if ! openssl req -x509 -newkey rsa:2048 -nodes -days "$DAYS" \
        -keyout "$TMP/key.pem" -out "$TMP/cert.pem" \
        -config "$TMP/openssl.cnf" -extensions v3_req 2>/dev/null; then
    fail "openssl req 失败"; exit 1
fi
pass "生成 $TMP/cert.pem + key.pem($DAYS 天)"

info "证书 subject:"
openssl x509 -in "$TMP/cert.pem" -noout -subject -issuer -dates | sed 's/^/    /'

# ─── 2) 检查 server ──────────────────────────────────────────────────
step "2/7  检查 edgeServers id=$SERVER_ID"
srv=$(mysql_q "SELECT id, name, userId, clusterId FROM edgeServers WHERE id=$SERVER_ID;")
if [ -z "$srv" ]; then
    fail "edgeServers id=$SERVER_ID 不存在"
    info "现有 server(最近 5):"; mysql_q "SELECT id, name, isOn FROM edgeServers ORDER BY id DESC LIMIT 5;" | sed 's/^/    /'
    summary; exit 1
fi
pass "edgeServers: $srv"

# ─── 3) 幂等检查 — 已有同 serverName 自签证就复用 ────────────────────
step "3/7  幂等查 edgeSSLCerts"
EXISTING_CERT=""
if [ "${FORCE_NEW_CERT:-0}" != "1" ]; then
    EXISTING_CERT=$(mysql_q "SELECT id FROM edgeSSLCerts WHERE serverName='$DOMAIN' AND isACME=0 AND state=1 ORDER BY id DESC LIMIT 1;")
fi

if [ -n "$EXISTING_CERT" ]; then
    pass "已有 edgeSSLCerts id=$EXISTING_CERT 复用(FORCE_NEW_CERT=1 可强制重发)"
    CERT_ID="$EXISTING_CERT"
else
    # ─── 4) SQL INSERT ──────────────────────────────────────────────
    step "4/7  INSERT edgeSSLCerts"
    CERT_HEX=$(xxd -p "$TMP/cert.pem" | tr -d '\n')
    KEY_HEX=$(xxd -p "$TMP/key.pem" | tr -d '\n')
    NOW=$(date +%s)
    END=$((NOW + DAYS * 86400))
    CERT_NAME="aegis-self-$DOMAIN-$NOW"

    info "name=$CERT_NAME timeEndAt=$END"

    # 用 mysql 容器 -e 一次性跑(单条 SQL 即可,不依赖跨连接 LAST_INSERT_ID)
    if ! mysql_q "INSERT INTO edgeSSLCerts (
        adminId, userId, isOn, state, createdAt,
        name, description, certData, keyData, serverName,
        isCA, groupIds, timeBeginAt, timeEndAt,
        dnsNames, commonNames, isACME, acmeTaskId
    ) VALUES (
        1, 0, 1, 1, $NOW,
        '$CERT_NAME', 'aegis self-signed test cert',
        UNHEX('$CERT_HEX'), UNHEX('$KEY_HEX'), '$DOMAIN',
        0, '[]', $NOW, $END,
        '[\"$DOMAIN\"]', '[]', 0, 0
    );" >/dev/null 2>&1; then
        fail "INSERT edgeSSLCerts 失败"
        action "确认 edgeSSLCerts 表 schema 与 GoEdge v1.3.9.1 一致;手动:bash scripts/check-mysql.sh"
        exit 1
    fi

    CERT_ID=$(mysql_q "SELECT id FROM edgeSSLCerts WHERE name='$CERT_NAME';")
    if [ -z "$CERT_ID" ]; then
        fail "INSERT 后查不到 name='$CERT_NAME' 的 cert"; exit 1
    fi
    pass "edgeSSLCerts 新建 id=$CERT_ID"
fi

# ─── 5) bind-cert ─────────────────────────────────────────────────────
step "5/7  POST /internal/edge/domains/$SERVER_ID/bind-cert"
TOKEN="$(env_get AEGIS_INTERNAL_SECRET)"
[ -n "$TOKEN" ] || { fail "AEGIS_INTERNAL_SECRET 未配"; exit 1; }

bind_payload=$(printf '{"certId":%d}' "$CERT_ID")
info "payload: $bind_payload"
resp=$(curl -sS -m 30 -w '\n%{http_code}' \
    -H 'Content-Type: application/json' \
    -H "X-Aegis-Internal-Token: $TOKEN" \
    -X POST "$BFF/internal/edge/domains/$SERVER_ID/bind-cert" \
    -d "$bind_payload" 2>&1 || true)
http=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')

case "$http" in
    200|201)
        pass "bind-cert HTTP=$http"
        info "  $body"
        ;;
    *)
        fail "bind-cert HTTP=$http body=$body"
        action "看 docker logs aegis-bff-edge | grep -E '(bind-cert|SSLPolicy)' 查 SDK 报错"
        # 不立即退出 — 已有 cert 可能已绑过,继续测 HTTPS
        ;;
esac

# ─── 6) 等 EdgeNode 拉配置 ───────────────────────────────────────────
step "6/7  等 EdgeNode 拉新 sslPolicy 配置"
info "GoEdge EdgeAPI 推送 + EdgeNode 拉,通常 5-10s"
sleep 8
pass "等待结束"

# ─── 7) HTTPS 握手测试 ───────────────────────────────────────────────
step "7/7  curl -vk https://$DOMAIN"
h443=$(env_get EDGE_NODE_HTTPS_PORT); h443=${h443:-8443}

# 用 --resolve 强制 DNS 指本机宿主端口,绕过公网 DNS
curl_out=$(curl -vk --resolve "$DOMAIN:$h443:127.0.0.1" \
    -m 10 -o /dev/null \
    -w 'HTTP=%{http_code} ssl_verify=%{ssl_verify_result} time=%{time_total}s\n' \
    "https://$DOMAIN:$h443/" 2>&1 || true)

# 抽关键行展示
echo "$curl_out" | grep -E "(subject:|issuer:|SSL connection|TLS|verify|HTTP=|HTTP/[12])" | sed 's/^/    /'

# 判定
TLS_OK=0
SUBJECT_MATCH=0
HTTP_CODE=""

if echo "$curl_out" | grep -qE "(SSL connection using|TLSv1\.[23])"; then
    TLS_OK=1
fi
if echo "$curl_out" | grep -qE "subject:.*CN[[:space:]]*=[[:space:]]*$DOMAIN"; then
    SUBJECT_MATCH=1
fi
HTTP_CODE=$(echo "$curl_out" | grep -oE 'HTTP=[0-9]+' | head -1 | cut -d= -f2)

[ $TLS_OK -eq 1 ]        && pass "TLS 握手成功"        || fail "TLS 握手失败"
[ $SUBJECT_MATCH -eq 1 ] && pass "subject CN 匹配 $DOMAIN" || warn "subject CN 不匹配(可能 EdgeNode 仍在用旧策略)"

case "$HTTP_CODE" in
    2*|3*) pass "HTTP=$HTTP_CODE(链路完全打通)" ;;
    4*|5*) warn "HTTP=$HTTP_CODE(TLS OK,源站业务错可忽略)" ;;
    "")    fail "无 HTTP 响应(TLS 后连接断了)" ;;
    *)     warn "HTTP=$HTTP_CODE" ;;
esac

# ─── 总结 ─────────────────────────────────────────────────────────────
summary "自签 SSL 测试总结"

if [ "$AEGIS_FAIL_COUNT" -eq 0 ]; then
    info ""
    info "下一步(可选):"
    info "  - 浏览器访问 https://$DOMAIN(会弹自签警告,正常)"
    info "  - 当你准备好真实 DNS + LE 时,跑 bash scripts/test-acme.sh"
    info "  - 公网测试:curl -vk https://$DOMAIN/(若 DNS 已生效)"
fi
exit_code
