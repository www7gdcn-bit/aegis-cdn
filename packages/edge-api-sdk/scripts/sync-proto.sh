#!/usr/bin/env bash
# packages/edge-api-sdk/scripts/sync-proto.sh
#
# 把 GoEdge upstream proto 按"递归 follow import"复制到 SDK 内,作为 vendored 资源。
# 这样 SDK npm install 后无需 upstream/ 也能 load proto。
#
# Phase 3 Step 2:只复制 service_user.proto 链路所需的最小集。
# 后续步骤(domains/ssl/...)再在 ENTRY_PROTOS 里追加并重跑本脚本。
#
# 用法:从仓库根 `bash packages/edge-api-sdk/scripts/sync-proto.sh`
#      或 `npm run sync-proto -w @aegis/edge-api-sdk`

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SRC="$REPO_ROOT/upstream/EdgeCommon/pkg/rpc/protos"
# 放在包顶层 proto/,dev (ts-node) 与 dist 都用相对路径 ../proto 解析
DST="$REPO_ROOT/packages/edge-api-sdk/proto"

if [ ! -d "$SRC" ]; then
    echo "ERROR: upstream/EdgeCommon/pkg/rpc/protos 不存在;请先 'git submodule update --init'" >&2
    exit 1
fi

# 入口 proto(后续步骤新增):
ENTRY_PROTOS=(
    "service_user.proto"
    "service_server.proto"     # Phase 3 Step 4 — 域名 onboarding
    "service_acme_task.proto"  # Phase 3 Step 6 — ACME 自动证书签发
    "service_ssl_cert.proto"   # Phase 3 Step 6 — SSL 证书查询/删除
)

# 先清空目标(避免上次同步后清单变小残留)
rm -rf "$DST"
mkdir -p "$DST/models"

# BFS 递归 follow import
declare -A visited
queue=("${ENTRY_PROTOS[@]}")
copied=0
while [ ${#queue[@]} -gt 0 ]; do
    current="${queue[0]}"
    queue=("${queue[@]:1}")
    if [ -n "${visited[$current]:-}" ]; then continue; fi
    visited["$current"]=1

    src_file="$SRC/$current"
    if [ ! -f "$src_file" ]; then
        echo "WARN: proto not found in upstream: $current" >&2
        continue
    fi

    dst_file="$DST/$current"
    mkdir -p "$(dirname "$dst_file")"
    cp "$src_file" "$dst_file"
    copied=$((copied + 1))

    while IFS= read -r imp; do
        queue+=("$imp")
    done < <(grep -oE 'import "[^"]+\.proto"' "$src_file" | sed -E 's|import "||; s|"||')
done

echo "synced $copied proto files to packages/edge-api-sdk/proto/"
