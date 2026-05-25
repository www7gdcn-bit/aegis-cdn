# deploy/docker/bff-edge.Dockerfile — Phase 3 Step 2.5
#
# 多阶段构建 services/bff-edge 镜像。
#
# 构建上下文必须是仓库根(需要 monorepo workspace 配置 + packages/edge-api-sdk + services/bff-edge)。
#
# 用法(从仓库根):
#   docker build -f deploy/docker/bff-edge.Dockerfile -t aegis/bff-edge:dev .
#
# 关键点:
#   - bff-edge 依赖 @aegis/edge-api-sdk(workspace 包,symlink 关联)
#   - SDK 依赖 @grpc/grpc-js(prebuilt binary,无需 g++)+ @grpc/proto-loader
#   - SDK proto/*.proto 是 vendored 资源,运行时 @grpc/proto-loader 用相对路径
#     ../proto 加载(packages/edge-api-sdk/dist/grpc/../../proto)
#   - 必须保留 monorepo 目录结构(/app/packages + /app/services + /app/node_modules)

ARG NODE_VERSION=20

# ═══════════════════════════════════════════════════════════════
# Stage 1: builder — install deps + build SDK + build bff-edge
# ═══════════════════════════════════════════════════════════════
FROM node:${NODE_VERSION}-alpine AS builder

WORKDIR /workspace

# @grpc/grpc-js 通常带 prebuilt linux-musl binary,但保险加 build tools
RUN apk add --no-cache python3 make g++ libc6-compat

# 1. 先 copy package.json + lock(利用 docker cache layer)
COPY package.json package-lock.json ./
COPY packages/edge-api-sdk/package.json ./packages/edge-api-sdk/
COPY services/bff-edge/package.json ./services/bff-edge/
# 防其他 workspace 解析失败,带上 workspace 通配匹配的占位
COPY services/saas-svc/package.json ./services/saas-svc/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# 2. install 全工作区(--ignore-scripts 防 prisma postinstall 等触发)
RUN npm install --workspaces --include-workspace-root --ignore-scripts

# 3. copy SDK + bff-edge 源码(其他 service 不需要 build)
COPY packages/edge-api-sdk ./packages/edge-api-sdk
COPY services/bff-edge ./services/bff-edge

# 4. build SDK(tsc → packages/edge-api-sdk/dist)
RUN cd packages/edge-api-sdk && npx tsc -p tsconfig.json

# 5. build bff-edge(nest build → services/bff-edge/dist)
RUN cd services/bff-edge && npx nest build

# ═══════════════════════════════════════════════════════════════
# Stage 2: runtime — 只含运行 bff-edge 必需的产物
# ═══════════════════════════════════════════════════════════════
FROM node:${NODE_VERSION}-alpine AS runtime

# curl 给 healthcheck;libc6-compat 给 @grpc/grpc-js native
RUN apk add --no-cache curl libc6-compat tini

WORKDIR /app

# 复制 workspace 结构(保留 symlink @aegis/edge-api-sdk → packages/edge-api-sdk)
# node 解析 require('@aegis/edge-api-sdk') 走 node_modules/@aegis/edge-api-sdk → ../../packages/edge-api-sdk
COPY --from=builder /workspace/package.json /workspace/package-lock.json ./
COPY --from=builder /workspace/node_modules ./node_modules

# SDK:dist + package.json + proto(运行时 @grpc/proto-loader 加载)
COPY --from=builder /workspace/packages/edge-api-sdk/package.json   ./packages/edge-api-sdk/
COPY --from=builder /workspace/packages/edge-api-sdk/dist           ./packages/edge-api-sdk/dist
COPY --from=builder /workspace/packages/edge-api-sdk/proto          ./packages/edge-api-sdk/proto

# bff-edge:dist + package.json
COPY --from=builder /workspace/services/bff-edge/package.json   ./services/bff-edge/
COPY --from=builder /workspace/services/bff-edge/dist           ./services/bff-edge/dist

ENV NODE_ENV=production \
    PORT=4002

EXPOSE 4002

# tini 处理 PID 1 信号转发(node 进程直接当 PID 1 时,SIGTERM 不会优雅 stop)
ENTRYPOINT ["/sbin/tini", "--"]

WORKDIR /app/services/bff-edge
CMD ["node", "dist/main.js"]
