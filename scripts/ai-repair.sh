#!/usr/bin/env bash
# scripts/ai-repair.sh — 调 Claude API 分析 check 输出,返回 JSON action,经白名单后执行
#
# 用法:
#   bash scripts/ai-repair.sh                      # 跑 check + AI 分析(dry-run)
#   AI_AUTO_EXEC=1 bash scripts/ai-repair.sh       # 真执行
#   bash scripts/ai-repair.sh report.txt           # 用已存在的 report 文件,不重新跑 check
#
# 必填 env:
#   ANTHROPIC_API_KEY        Claude API key(.env 或 export)
# 可选:
#   ANTHROPIC_MODEL          默认 claude-sonnet-4-6
#   AI_AUTO_EXEC=1           真执行(默认 dry-run)
#   AI_DEBUG=1               打印每个 action 原 JSON
#   AI_REPAIR_TIMEOUT        API timeout(默认 120s)
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

DIR="$(cd "$(dirname "$0")" && pwd)"

banner "AI 修复(Claude API)"

# 1. 准备 check 输出
INPUT_FILE="${1:-}"
if [ -n "$INPUT_FILE" ] && [ -f "$INPUT_FILE" ]; then
    info "使用现有报告:$INPUT_FILE"
    CHECK_OUT="$INPUT_FILE"
    CLEAN_TMP=0
else
    info "跑 check.sh 收集系统状态 …"
    CHECK_OUT=$(mktemp)
    bash "$DIR/check.sh" > "$CHECK_OUT" 2>&1 || true
    sed -i 's/\x1b\[[0-9;]*m//g' "$CHECK_OUT"
    CLEAN_TMP=1
fi

# 系统已 PASS 就别浪费 token
if grep -q "SYSTEM STATUS: PASS" "$CHECK_OUT"; then
    pass "系统已 PASS,无需 AI"
    [ "$CLEAN_TMP" = "1" ] && rm -f "$CHECK_OUT"
    exit 0
fi

# 2. 工具依赖
for tool in jq curl; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        fail "$tool 未安装(AI 修复必需)"; action "apt install -y $tool"
        exit 2
    fi
done

# 3. API key
API_KEY="${ANTHROPIC_API_KEY:-$(env_get ANTHROPIC_API_KEY)}"
if [ -z "$API_KEY" ]; then
    fail "ANTHROPIC_API_KEY 未配置"
    action "在 deploy/.env 加 ANTHROPIC_API_KEY=sk-ant-xxx;或 export 后重跑"
    [ "$CLEAN_TMP" = "1" ] && rm -f "$CHECK_OUT"
    exit 2
fi
MODEL="${ANTHROPIC_MODEL:-$(env_get ANTHROPIC_MODEL)}"
MODEL="${MODEL:-claude-sonnet-4-6}"
TIMEOUT="${AI_REPAIR_TIMEOUT:-120}"

info "Claude model = $MODEL"
info "auto_exec = $([ "${AI_AUTO_EXEC:-0}" = "1" ] && echo ON || echo OFF/DRY-RUN)"

# 4. 系统提示
PROMPT_FILE="$DIR/lib/ai-repair-prompt.txt"
[ -f "$PROMPT_FILE" ] || { fail "缺 $PROMPT_FILE"; exit 2; }

SYS_PROMPT="$(cat "$PROMPT_FILE")"
USER_MSG="$(cat "$CHECK_OUT")"

# 5. 构造 request body(用 jq -n 防止特殊字符)
REQ_BODY=$(mktemp)
jq -n \
    --arg model "$MODEL" \
    --arg sys "$SYS_PROMPT" \
    --arg user "$USER_MSG" \
    '{
        model: $model,
        max_tokens: 4096,
        system: $sys,
        messages: [{role: "user", content: $user}]
    }' > "$REQ_BODY"

info "调 Claude API(timeout ${TIMEOUT}s)…"

# 6. 调 API
RESP_FILE=$(mktemp)
HTTP_CODE=$(curl -sS -m "$TIMEOUT" \
    -H "x-api-key: $API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" \
    -w '%{http_code}' \
    -o "$RESP_FILE" \
    -X POST "https://api.anthropic.com/v1/messages" \
    -d "@$REQ_BODY" 2>&1) || HTTP_CODE="000"

if [ "$HTTP_CODE" != "200" ]; then
    fail "Claude API HTTP=$HTTP_CODE"
    info "Response:"; cat "$RESP_FILE" | head -50 | sed 's/^/  /'
    rm -f "$REQ_BODY" "$RESP_FILE"
    [ "$CLEAN_TMP" = "1" ] && rm -f "$CHECK_OUT"
    exit 1
fi
pass "Claude API 返回 200"

# 7. 提取 .content[0].text(Claude 的 text response)
TEXT=$(jq -r '.content[0].text // empty' "$RESP_FILE")
if [ -z "$TEXT" ]; then
    fail "Claude 返回空 content"
    cat "$RESP_FILE" | head -20 | sed 's/^/  /'
    rm -f "$REQ_BODY" "$RESP_FILE"
    [ "$CLEAN_TMP" = "1" ] && rm -f "$CHECK_OUT"
    exit 1
fi

# 8. 剥离可能的 ```json``` 围栏(prompt 已禁,但兜底)
ACTIONS_JSON=$(mktemp)
echo "$TEXT" | sed -E 's/^```(json)?$//; s/^```$//' | grep -v '^```' > "$ACTIONS_JSON"

# 9. 交给 ai-exec.sh
if ! bash "$DIR/lib/ai-exec.sh" "$ACTIONS_JSON"; then
    RET=1
else
    RET=0
fi

# 10. 清理
rm -f "$REQ_BODY" "$RESP_FILE" "$ACTIONS_JSON"
[ "$CLEAN_TMP" = "1" ] && rm -f "$CHECK_OUT"

exit "$RET"
