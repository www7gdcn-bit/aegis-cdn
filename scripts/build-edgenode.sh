#!/usr/bin/env bash
# scripts/build-edgenode.sh
#
# Phase 1 Step 2 雏形 — 仅打通 happy path 与目录契约。
# rsync 合并、patch apply、CI 集成留待 Phase 6/7(CC/WAF 增强 overlay 实战)定稿。
#
# 用法:
#   bash scripts/build-edgenode.sh           → 等价 GOOS=linux GOARCH=amd64
#
# EdgeNode 注意事项:
#   - EdgeNode 依赖 cgo 包(libinjection、libwebp)
#   - 必须在 Linux 原生环境编译,或带完整 cross-compile 工具链(zig/musl-cross)
#   - Windows / macOS 本机 cross-compile linux/amd64 会失败(cgo 限制),非脚本问题
#
# 退出码:
#   0  success
#   1  upstream 缺失 / submodule 未 init
#   2  overlay 路径错位
#   3  go build 失败
#   4  本机无 cgo 编译器(且未关 CGO_ENABLED)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UPSTREAM_DIR="$REPO_ROOT/upstream/EdgeNode"
OVERLAY_DIR="$REPO_ROOT/overlays/EdgeNode"
GOOS="${GOOS:-linux}"
GOARCH="${GOARCH:-amd64}"
BUILD_TAGS="aegis"

# --- 1. 检查 upstream submodule 是否已 init ---
if [ ! -d "$UPSTREAM_DIR" ] || [ ! -f "$UPSTREAM_DIR/go.mod" ]; then
  echo "ERROR: upstream/EdgeNode 不存在或未 init。" >&2
  echo "       请先在仓库根跑:git submodule update --init upstream/EdgeNode upstream/EdgeCommon" >&2
  exit 1
fi
if [ ! -d "$REPO_ROOT/upstream/EdgeCommon" ]; then
  echo "ERROR: upstream/EdgeCommon 不存在(EdgeNode 通过 replace ../EdgeCommon 依赖它)。" >&2
  exit 1
fi

# --- 2. 检查 overlays/EdgeNode 目录契约 ---
if [ ! -d "$OVERLAY_DIR" ]; then
  echo "ERROR: overlays/EdgeNode 不存在。" >&2
  exit 2
fi

# --- 3. cgo 环境提醒(EdgeNode 必需)---
if [ "${CGO_ENABLED:-1}" = "1" ] && ! command -v cc >/dev/null 2>&1 && ! command -v gcc >/dev/null 2>&1; then
  echo "ERROR: 本机未检测到 C 编译器(cc/gcc),EdgeNode 需要 cgo(libinjection + libwebp)。" >&2
  echo "       Linux: apt-get install build-essential libinjection-dev libwebp-dev" >&2
  echo "       (若要纯 Go 部分编译: CGO_ENABLED=0 bash $0,但 waf/injectionutils 与 gowebp 会被排除)" >&2
  exit 4
fi

# --- 4. rsync overlay 到 upstream(Phase 1 Step 2 暂为 no-op)---
OVERLAY_GO_COUNT=$(find "$OVERLAY_DIR" -type f -name "*.go" 2>/dev/null | wc -l || echo 0)
if [ "$OVERLAY_GO_COUNT" -gt 0 ]; then
  echo "==> rsync $OVERLAY_GO_COUNT overlay .go files into upstream/EdgeNode/"
  rsync -av \
    --include='*/' --include='*.go' --exclude='*' \
    "$OVERLAY_DIR/" "$UPSTREAM_DIR/"
else
  echo "==> overlays/EdgeNode 暂无 .go 文件(Phase 1 Step 2 骨架阶段),跳过 rsync"
fi

# --- 5. patches/ 应用(Phase 1 Step 2 暂为 no-op)---
PATCHES_DIR="$REPO_ROOT/overlays/patches"
EDGENODE_PATCHES=$(find "$PATCHES_DIR" -maxdepth 1 -name "EdgeNode-*.patch" 2>/dev/null || true)
if [ -n "$EDGENODE_PATCHES" ]; then
  echo "==> apply EdgeNode patches:"
  for p in $EDGENODE_PATCHES; do
    echo "  - $p"
    (cd "$UPSTREAM_DIR" && git apply --check "$p" && git apply "$p")
  done
fi

# --- 6. go build -tags aegis ---
echo "==> go build (GOOS=$GOOS GOARCH=$GOARCH CGO_ENABLED=${CGO_ENABLED:-1} -tags $BUILD_TAGS) in upstream/EdgeNode"
cd "$UPSTREAM_DIR"
if GOOS="$GOOS" GOARCH="$GOARCH" go build -tags "$BUILD_TAGS" ./...; then
  echo "==> build OK"
else
  echo "ERROR: go build 失败" >&2
  exit 3
fi

echo
echo "NOTE: upstream/EdgeNode 工作树此时含有 overlay/patch 注入,git status 会脏。"
echo "      若需还原:cd upstream/EdgeNode && git reset --hard"
