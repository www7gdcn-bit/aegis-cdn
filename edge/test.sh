#!/usr/bin/env bash
# AegisCDN 边缘引擎防护验证脚本(需先 docker compose up)
# 用法:bash test.sh  [BASE_URL]   默认 http://localhost:8080
set -u
BASE="${1:-http://localhost:8080}"
BROWSER_UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
pass() { echo "  ✅ $1"; }
fail() { echo "  ❌ $1 (got $2, want $3)"; }
check() { [ "$2" = "$3" ] && pass "$1 → $2" || fail "$1" "$2" "$3"; }

echo "== AegisCDN 边缘防护验证 @ $BASE =="

echo "[1] 健康检查"
check "health" "$(code "$BASE/aegis-health")" "200"

echo "[2] 正常浏览器请求(应放行 200)"
c=$(code -H "User-Agent: $BROWSER_UA" -H "Accept-Language: zh-CN,zh" -H "Accept: text/html" "$BASE/")
check "browser allow" "$c" "200"

echo "[3] 自动化工具 curl(应进挑战 503)"
c=$(code "$BASE/")   # curl 默认 UA
check "curl challenge" "$c" "503"

echo "[4] WAF:SQL 注入(应拦截 403)"
c=$(code -H "User-Agent: $BROWSER_UA" -H "Accept-Language: zh-CN" "$BASE/?id=1%20union%20select%20password%20from%20users")
check "sqli block" "$c" "403"

echo "[5] WAF:路径穿越(应拦截 403)"
c=$(code -H "User-Agent: $BROWSER_UA" -H "Accept-Language: zh-CN" "$BASE/../../../../etc/passwd")
check "traversal block" "$c" "403"

echo "[6] WAF:XSS(应拦截 403)"
c=$(code -H "User-Agent: $BROWSER_UA" -H "Accept-Language: zh-CN" "$BASE/?q=<script>alert(1)</script>")
check "xss block" "$c" "403"

echo "[7] CC:高频洪水(110 次后应触发限频 → 挑战 503)"
for i in $(seq 1 110); do
  curl -s -o /dev/null -H "User-Agent: $BROWSER_UA" -H "Accept-Language: zh-CN" -H "Accept: text/html" "$BASE/flood" &
  [ $((i % 20)) -eq 0 ] && wait
done
wait
c=$(code -H "User-Agent: $BROWSER_UA" -H "Accept-Language: zh-CN" -H "Accept: text/html" "$BASE/flood")
echo "    第 111 次请求状态:$c (期望 503 挑战;若仍 200 说明阈值未到,可调小 ratelimit.limit)"

echo "== 完成。攻击日志见 openresty 容器 /usr/local/openresty/nginx/logs/access.json.log =="
