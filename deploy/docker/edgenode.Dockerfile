# deploy/docker/edgenode.Dockerfile — Phase 1 Step 3
#
# 多阶段构建 GoEdge EdgeNode 边缘节点镜像。
#
# 与 edgeapi.Dockerfile 的关键区别:
#   - EdgeNode 必需 cgo(libinjection / libwebp / nftables)
#   - 因此 CGO_ENABLED=1,且 builder/runtime 都装相应系统库
#
# 构建上下文必须是仓库根(EdgeNode 用 `replace ../EdgeCommon` 依赖 EdgeCommon)。
#
# 用法(从仓库根):
#   docker build -f deploy/docker/edgenode.Dockerfile --build-arg BUILD_TAGS=aegis -t aegis/edgenode:dev .

ARG GO_VERSION=1.21

# ═══════════════════════════════════════════════════════════════
# Stage 1: builder(带 cgo 工具链 + libinjection / libwebp 开发包)
# ═══════════════════════════════════════════════════════════════
FROM golang:${GO_VERSION}-bookworm AS builder

ARG BUILD_TAGS=""

ENV GOPROXY=https://proxy.golang.org,direct \
    CGO_ENABLED=1 \
    GOOS=linux \
    GOARCH=amd64

# cgo 系统依赖:
#   build-essential — gcc/make 等
#   libinjection-dev — internal/waf/injectionutils 必需
#   libwebp-dev      — github.com/iwind/gowebp 必需
#   rsync            — overlay 注入
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        build-essential \
        libinjection-dev \
        libwebp-dev \
        rsync \
        pkg-config \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /src

COPY upstream/EdgeCommon /src/EdgeCommon
COPY upstream/EdgeNode   /src/EdgeNode

# overlays 注入(Phase 6/7 有内容时生效)
COPY overlays/EdgeNode   /tmp/overlay-edgenode
COPY overlays/EdgeCommon /tmp/overlay-edgecommon
RUN set -eu; \
    if [ "$(find /tmp/overlay-edgenode -name '*.go' 2>/dev/null | wc -l)" -gt 0 ]; then \
        echo "==> rsync overlays/EdgeNode/*.go -> EdgeNode/"; \
        rsync -a --include='*/' --include='*.go' --exclude='*' /tmp/overlay-edgenode/ /src/EdgeNode/; \
    fi; \
    if [ "$(find /tmp/overlay-edgecommon -name '*.go' 2>/dev/null | wc -l)" -gt 0 ]; then \
        echo "==> rsync overlays/EdgeCommon/*.go -> EdgeCommon/"; \
        rsync -a --include='*/' --include='*.go' --exclude='*' /tmp/overlay-edgecommon/ /src/EdgeCommon/; \
    fi

WORKDIR /src/EdgeNode
RUN go mod download

RUN if [ -z "$BUILD_TAGS" ]; then \
        echo "==> build community (cgo, no tags)"; \
        go build -trimpath -ldflags '-s -w' -o /out/edge-node ./cmd/edge-node; \
    else \
        echo "==> build with tags: $BUILD_TAGS"; \
        go build -trimpath -tags "$BUILD_TAGS" -ldflags '-s -w' -o /out/edge-node ./cmd/edge-node; \
    fi

# ═══════════════════════════════════════════════════════════════
# Stage 2: runtime(带 cgo so + 内核工具)
# ═══════════════════════════════════════════════════════════════
FROM debian:bookworm-slim AS runtime

# 运行期 so:
#   libinjection 与 libwebp 的 .so(只装 runtime 包,不带 -dev)
#   nftables / iptables — DDoS 内核防火墙集成(EdgeNode internal/firewalls/)
#   ca-certificates / tzdata — 通用
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        ca-certificates \
        tzdata \
        libinjection2 \
        libwebp7 \
        nftables \
        iptables \
        gettext-base \
 && rm -rf /var/lib/apt/lists/*

ENV TZ=Asia/Shanghai

WORKDIR /app

COPY --from=builder /out/edge-node              /app/bin/edge-node
COPY --from=builder /src/EdgeNode/build/configs /app/configs.template
COPY --from=builder /src/EdgeNode/build/pages   /app/pages
COPY --from=builder /src/EdgeNode/build/www     /app/www

COPY deploy/docker/edgenode-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh /app/bin/edge-node

EXPOSE 80 443
VOLUME ["/app/configs", "/app/cache", "/app/logs"]

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["start"]
