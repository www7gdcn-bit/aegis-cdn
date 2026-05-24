# deploy/docker/edgeapi.Dockerfile — Phase 1 Step 3
#
# 多阶段构建 GoEdge EdgeAPI 控制面镜像。
#
# 构建上下文必须是仓库根(因为要同时 COPY upstream/EdgeAPI 与 upstream/EdgeCommon —
# EdgeAPI 的 go.mod 用 `replace ../EdgeCommon` 依赖 EdgeCommon)。
#
# 用法(从仓库根):
#   docker build -f deploy/docker/edgeapi.Dockerfile --build-arg BUILD_TAGS=aegis -t aegis/edgeapi:dev .
#
# BUILD_TAGS:
#   ""     社区版(Phase 1 Step 3 默认 — 验证起得来)
#   aegis  启用 overlays/(Phase 5 起填 overlay 实现后用)

ARG GO_VERSION=1.21

# ═══════════════════════════════════════════════════════════════
# Stage 1: builder
# ═══════════════════════════════════════════════════════════════
FROM golang:${GO_VERSION}-bookworm AS builder

ARG BUILD_TAGS=""

# Go module 加速(国内构建可改 GOPROXY=https://goproxy.cn)
ENV GOPROXY=https://proxy.golang.org,direct \
    CGO_ENABLED=0 \
    GOOS=linux \
    GOARCH=amd64

WORKDIR /src

# 1. 先 COPY EdgeCommon(EdgeAPI 通过 replace ../EdgeCommon 依赖)
COPY upstream/EdgeCommon /src/EdgeCommon

# 2. COPY EdgeAPI
COPY upstream/EdgeAPI /src/EdgeAPI

# 3. 应用 overlays(Phase 5+ 有内容时生效;Phase 1 Step 3 为 no-op)
COPY overlays/EdgeAPI    /tmp/overlay-edgeapi
COPY overlays/EdgeCommon /tmp/overlay-edgecommon
RUN set -eu; \
    if [ "$(find /tmp/overlay-edgeapi -name '*.go' 2>/dev/null | wc -l)" -gt 0 ]; then \
        echo "==> rsync overlays/EdgeAPI/*.go -> EdgeAPI/"; \
        apt-get update && apt-get install -y --no-install-recommends rsync; \
        rsync -a --include='*/' --include='*.go' --exclude='*' /tmp/overlay-edgeapi/ /src/EdgeAPI/; \
    fi; \
    if [ "$(find /tmp/overlay-edgecommon -name '*.go' 2>/dev/null | wc -l)" -gt 0 ]; then \
        echo "==> rsync overlays/EdgeCommon/*.go -> EdgeCommon/"; \
        command -v rsync >/dev/null 2>&1 || (apt-get update && apt-get install -y --no-install-recommends rsync); \
        rsync -a --include='*/' --include='*.go' --exclude='*' /tmp/overlay-edgecommon/ /src/EdgeCommon/; \
    fi

# 4. 下载依赖 + 编译 edge-api
WORKDIR /src/EdgeAPI
RUN go mod download

RUN if [ -z "$BUILD_TAGS" ]; then \
        echo "==> build community (no tags)"; \
        go build -trimpath -ldflags '-s -w' -o /out/edge-api ./cmd/edge-api; \
    else \
        echo "==> build with tags: $BUILD_TAGS"; \
        go build -trimpath -tags "$BUILD_TAGS" -ldflags '-s -w' -o /out/edge-api ./cmd/edge-api; \
    fi

# ═══════════════════════════════════════════════════════════════
# Stage 2: runtime
# ═══════════════════════════════════════════════════════════════
FROM debian:bookworm-slim AS runtime

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates tzdata wget \
 && rm -rf /var/lib/apt/lists/*

ENV TZ=Asia/Shanghai

WORKDIR /app

# 二进制 + 默认配置模板(setup 时会渲染替换)
COPY --from=builder /out/edge-api               /app/bin/edge-api
COPY --from=builder /src/EdgeAPI/build/configs  /app/configs.template

# entrypoint:首次跑 setup(幂等),之后 exec start
COPY deploy/docker/edgeapi-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh /app/bin/edge-api

EXPOSE 8003 8004
VOLUME ["/app/configs", "/app/logs"]

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["start"]
