#!/usr/bin/env bash
# scripts/build-edgeapi.sh
#
# Phase 1 Step 2 雏形 — 仅打通 happy path 与目录契约。
# rsync 合并、patch apply、CI 集成留待 Phase 5(第一个 overlay 实战)定稿。
#
# 用法:
#   bash scripts/build-edgeapi.sh           → 等价 GOOS=linux GOARCH=amd64
#   GOOS=darwin bash scripts/build-edgeapi.sh
#
# 假设:
#   - 仓库根有 upstream/{EdgeAPI,EdgeCommon} 两个 submodule
#   - upstream/EdgeAPI/go.mod 用 replace 指向 ../EdgeCommon(GoEdge 上游约定)
#   - overlays/EdgeAPI/ 镜像 upstream/EdgeAPI/ 同结构(可空,Phase 1 Step 2 尚无文件)
#
# 退出码:
#   0  success
#   1  upstream 缺失 / submodule 未 init
#   2  overlay 路径错位
#   3  go build 失败

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UPSTREAM_DIR="$REPO_ROOT/upstream/EdgeAPI"
OVERLAY_DIR="$REPO_ROOT/overlays/EdgeAPI"
GOOS="${GOOS:-linux}"
GOARCH="${GOARCH:-amd64}"
BUILD_TAGS="aegis"

# --- 1. 检查 upstream submodule 是否已 init ---
if [ ! -d "$UPSTREAM_DIR" ] || [ ! -f "$UPSTREAM_DIR/go.mod" ]; then
  echo "ERROR: upstream/EdgeAPI 不存在或未 init。" >&2
  echo "       请先在仓库根跑:git submodule update --init upstream/EdgeAPI upstream/EdgeCommon" >&2
  exit 1
fi
if [ ! -d "$REPO_ROOT/upstream/EdgeCommon" ]; then
  echo "ERROR: upstream/EdgeCommon 不存在(EdgeAPI 通过 replace ../EdgeCommon 依赖它)。" >&2
  exit 1
fi

# --- 2. 检查 overlays/EdgeAPI 目录契约 ---
if [ ! -d "$OVERLAY_DIR" ]; then
  echo "ERROR: overlays/EdgeAPI 不存在。" >&2
  exit 2
fi

# --- 3. rsync overlay 到 upstream(Phase 1 Step 2 暂为 no-op,overlays 还没有真文件)---
# 找到所有 *.go 文件(排除 .gitkeep);若有则 rsync 进 upstream
OVERLAY_GO_COUNT=$(find "$OVERLAY_DIR" -type f -name "*.go" 2>/dev/null | wc -l || echo 0)
if [ "$OVERLAY_GO_COUNT" -gt 0 ]; then
  echo "==> rsync $OVERLAY_GO_COUNT overlay .go files into upstream/EdgeAPI/"
  # --include 选 .go,排 .gitkeep
  rsync -av \
    --include='*/' --include='*.go' --exclude='*' \
    "$OVERLAY_DIR/" "$UPSTREAM_DIR/"
else
  echo "==> overlays/EdgeAPI 暂无 .go 文件(Phase 1 Step 2 骨架阶段),跳过 rsync"
fi

# --- 4. patches/ 应用(Phase 1 Step 2 暂为 no-op)---
PATCHES_DIR="$REPO_ROOT/overlays/patches"
EDGEAPI_PATCHES=$(find "$PATCHES_DIR" -maxdepth 1 -name "EdgeAPI-*.patch" 2>/dev/null || true)
if [ -n "$EDGEAPI_PATCHES" ]; then
  echo "==> apply EdgeAPI patches:"
  for p in $EDGEAPI_PATCHES; do
    echo "  - $p"
    (cd "$UPSTREAM_DIR" && git apply --check "$p" && git apply "$p")
  done
fi

# --- 5. go build -tags aegis ---
echo "==> go build (GOOS=$GOOS GOARCH=$GOARCH -tags $BUILD_TAGS) in upstream/EdgeAPI"
cd "$UPSTREAM_DIR"
if GOOS="$GOOS" GOARCH="$GOARCH" go build -tags "$BUILD_TAGS" ./...; then
  echo "==> build OK"
else
  echo "ERROR: go build 失败" >&2
  exit 3
fi

# --- 6. 提示:upstream/ 此时含有 overlay 注入 + (可选)patch 修改,工作树脏 ---
echo
echo "NOTE: upstream/EdgeAPI 工作树此时含有 overlay/patch 注入,git status 会脏。"
echo "      若需还原:cd upstream/EdgeAPI && git reset --hard"
