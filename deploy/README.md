# deploy/ — aegis-cdn 本地 dev 与生产部署

版本 v0.1 · Phase 1 Step 3 落地 · 关联 [[../docs/15-goedge-secondary-development-plan.md]]

## 0. 本目录内容速览

| 文件 / 子目录 | 用途 | 阶段 |
| --- | --- | --- |
| `docker-compose.dev.yml` | **本地 dev 编排**(mysql/redis/edgeapi/edgenode/postgres 5 服务) | Phase 1 Step 3 ← 本文档主体 |
| `.env.example` | dev 环境变量模板 | Phase 1 Step 3 |
| `docker/edgeapi.Dockerfile` | EdgeAPI 镜像(多阶段 + overlay rsync + `-tags aegis` 占位) | Phase 1 Step 3 |
| `docker/edgenode.Dockerfile` | EdgeNode 镜像(带 cgo libinjection/libwebp/nftables) | Phase 1 Step 3 |
| `docker/edgeapi-entrypoint.sh` | 首次自动 `edge-api setup` 建表 + admin token | Phase 1 Step 3 |
| `docker/edgenode-entrypoint.sh` | 从 env 渲染 `cluster.yaml` | Phase 1 Step 3 |
| `nginx/control-plane.conf.example` | 生产前置反代 Nginx 模板 | Phase 0(沿用) |
| `backup.sh` | PG + ClickHouse 备份 | Phase 0(沿用) |

> **dev 环境只覆盖 GoEdge 底座**。`services/saas-svc/` 与 `apps/web` 不在 docker-compose.dev 内,
> 它们走 host 上的 `npm run dev`(贴近开发态)。Phase 4-5 起会有 `docker-compose.app.yml` 把它们也容器化。

---

## 1. 服务清单(5 个)

| 服务 | 容器名 | 镜像 | 用途 |
| --- | --- | --- | --- |
| `mysql`    | `aegis-mysql`    | `mysql:8.0`             | GoEdge EdgeAPI 业务库(db_edge) |
| `redis`    | `aegis-redis`    | `redis:7-alpine`        | GoEdge + SaaS 共享缓存/限频/挑战 cookie |
| `edgeapi`  | `aegis-edgeapi`  | `build:` 本仓 Dockerfile | GoEdge 控制面(gRPC 8003 / REST 8004) |
| `edgenode` | `aegis-edgenode` | `build:` 本仓 Dockerfile | GoEdge 边缘节点(反代 + WAF + CC,80/443) |
| `postgres` | `aegis-postgres` | `postgres:17-alpine`    | **占位** — saas-svc 用,Phase 2 启用 |

**Network**:统一 `aegis-dev` 桥接网,容器间用容器名作 DNS。

**Volumes**(全部命名卷,docker compose down 不会删数据):

- `aegis-mysql-data`、`aegis-redis-data`、`aegis-postgres-data`
- `aegis-edgeapi-configs`(含 `api.yaml` / `db.yaml` / `.admin-token.json`)、`aegis-edgeapi-logs`
- `aegis-edgenode-configs`(含 `cluster.yaml`)、`aegis-edgenode-cache`、`aegis-edgenode-logs`

---

## 2. 端口表

| 服务 | 容器内 | 默认宿主映射 | env 变量 | 备注 |
| --- | --- | --- | --- | --- |
| MySQL    | 3306 | `127.0.0.1:3306` | `MYSQL_PORT`          | 仅 loopback,安全 |
| Redis    | 6379 | `127.0.0.1:6379` | `REDIS_PORT`          | 仅 loopback,安全 |
| EdgeAPI gRPC | 8003 | `127.0.0.1:8003` | `EDGE_API_PORT`     | bff-edge / EdgeNode / EdgeAdmin 都连这里 |
| EdgeAPI REST | 8004 | `127.0.0.1:8004` | `EDGE_API_REST_PORT` | 可选,GoEdge 也提供 REST |
| EdgeNode HTTP  | 80   | `0.0.0.0:8080`   | `EDGE_NODE_HTTP_PORT`  | dev 不抢 80 |
| EdgeNode HTTPS | 443  | `0.0.0.0:8443`   | `EDGE_NODE_HTTPS_PORT` | dev 不抢 443 |
| PostgreSQL | 5432 | `127.0.0.1:5432` | `POSTGRES_PORT`     | 仅 loopback,安全 |

> EdgeNode 端口**故意**暴露 0.0.0.0(测真实回源接入),其余服务全部 loopback only。
> 生产部署看 [[../docs/11-商用部署上线.md]],不用本 compose。

---

## 3. 首次启动 5 步(GoEdge 初始化 — 本文档核心)

### 步骤 1:准备 env

```bash
cp deploy/.env.example deploy/.env
# 编辑 deploy/.env,把所有 ChangeMe_* 改成强密码
# EDGE_NODE_CLUSTER_ID / EDGE_NODE_CLUSTER_SECRET 先留空(步骤 3 才填)
```

### 步骤 2:先起 mysql + redis + edgeapi(**不** 起 edgenode)

```bash
docker compose -f deploy/docker-compose.dev.yml --env-file deploy/.env up -d --build \
    mysql redis edgeapi
```

- 第一次会自动跑 `edge-api setup`(entrypoint 里的逻辑):
  1. 渲染 `configs/db.yaml`(填 MySQL DSN)
  2. 跑 `edge-api setup -api-node-protocol=http -api-node-host=edgeapi -api-node-port=8003`
  3. **GoEdge 自动建表**(执行 `internal/setup/sql.json` 里的 ~80+ DDL)
  4. **创建第一个 admin token**(role=admin),返回 `adminNodeId` + `adminNodeSecret`
  5. **创建第一个 API node** 记录,nodeId/secret 写入 `configs/api.yaml`
- Marker 文件 `/app/configs/.aegis-setup-done` 防止重跑;admin token 落到 `/app/configs/.admin-token.json`

### 步骤 3:取 admin token,创建第一个集群

```bash
# 看 admin token JSON
docker compose -f deploy/docker-compose.dev.yml exec edgeapi \
    cat /app/configs/.admin-token.json
# → 输出形如:
#   {"isOk":true,"adminNodeId":"AaBbCc...","adminNodeSecret":"xxYyZz..."}
```

**第一次创建集群必须调 EdgeAPI gRPC**(D6 决策不引入 EdgeAdmin)。两种方式:

**方式 A:用 grpcurl(推荐)**

```bash
# 在宿主装 grpcurl:https://github.com/fullstorydev/grpcurl
# 拿 EdgeCommon 的 proto:upstream/EdgeCommon/pkg/rpc/protos/
# 用 admin token 调 service_node_cluster.CreateNodeCluster
grpcurl -plaintext \
    -H "nodeid: $ADMIN_NODE_ID" \
    -H "secret: $ADMIN_NODE_SECRET" \
    -import-path upstream/EdgeCommon/pkg/rpc/protos \
    -proto service_node_cluster.proto \
    -d '{"name":"aegis-dev-cluster","grantId":0,"installDir":"/app","timeZone":"Asia/Shanghai","nodeMaxThreads":0,"autoOpenPorts":true,"dnsDomainId":0,"systemServices":{}}' \
    127.0.0.1:8003 pb.NodeClusterService/CreateNodeCluster
# 返回 nodeClusterId,再调 FindEnabledNodeCluster 拿 secret(或直接查 mysql)
```

**方式 B:tmp 起 EdgeAdmin 容器(仅初始化用,完成后停)**

```bash
# 上游官方 EdgeAdmin 镜像(本地 dev 用,不进生产)
# docker run --rm -it --network aegis-dev_aegis-dev -p 7777:7777 \
#     teaoslab/edgeadmin:latest \
#     ...
# (具体步骤待补,本仓 D6 决策弃 EdgeAdmin,此为 dev 应急通道)
```

**方式 C:直接进 mysql 手 INSERT**(最简,但 schema 知识要求高)

```bash
# 仅推荐应急
docker compose exec mysql mysql -u root -p$MYSQL_ROOT_PASSWORD db_edge \
    -e "INSERT INTO edgeNodeClusters(name,secret,isOn) VALUES('aegis-dev-cluster',MD5(RAND()),1); SELECT id,name,secret FROM edgeNodeClusters;"
```

→ 拿到 `clusterId`(数字)与 `secret`(随机字符串)后,**把它们填回 `deploy/.env`**:

```env
EDGE_NODE_CLUSTER_ID=1
EDGE_NODE_CLUSTER_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 步骤 4:起 EdgeNode + Postgres

```bash
docker compose -f deploy/docker-compose.dev.yml --env-file deploy/.env up -d \
    edgenode postgres
```

- entrypoint 读 env 渲染 `cluster.yaml`(cluster 自动接入模式),node 启动时**自动注册**到 EdgeAPI,
  分配 `nodeId`(数字)+ 自己的 `secret`
- 同一 cluster 可以再起 N 个 node(只要它们也有 `EDGE_NODE_CLUSTER_ID`/`SECRET`)

### 步骤 5:验证

```bash
# 1. EdgeAPI 健康
docker compose -f deploy/docker-compose.dev.yml ps
# 2. EdgeNode 已注册(应能在 MySQL 看到记录)
docker compose exec mysql mysql -u root -p$MYSQL_ROOT_PASSWORD db_edge \
    -e "SELECT id,clusterId,status,connectedAPINodes FROM edgeNodes;"
# 3. 边缘 80 端口响应(默认无 server,会 404,但 TCP 通)
curl -v http://127.0.0.1:8080/
```

---

## 4. 关键初始化结论(预研记录)

> 这一节是 Phase 1 Step 3 调研 `upstream/EdgeAPI/cmd/edge-api/main.go` 与 `internal/setup/setup.go` 的产物,
> 留作未来 Phase 同步上游时复核的基线。

| 问题 | 结论 | 来源 |
| --- | --- | --- |
| EdgeAPI 首次 setup 怎么执行 | `edge-api setup -api-node-protocol=http -api-node-host=X -api-node-port=Y`,**幂等** | `cmd/edge-api/main.go:36-55`、`internal/setup/setup.go:69-209` |
| admin 初始账号怎么创建 | setup 自动建 `apiTokens` 表的 admin role token,**返回 JSON 含 adminNodeId+secret** | `setup.go:121-131`(查 `apiTokenDAO.FindEnabledTokenWithRole(.., "admin")`) |
| EdgeNode 如何注册到 EdgeAPI | **两种**:`api_node.yaml`(手动填 nodeId/secret) **或** `cluster.yaml`(填 clusterId/secret,自动注册分配 nodeId) | `upstream/EdgeNode/build/configs/{api_node,cluster}.template.yaml` |
| node id / secret 是否支持 env 自动注入 | **upstream 原生不支持**;但我们 entrypoint 用 env 渲染 `cluster.yaml`,实现等效自动注入 | 自实现 `edgenode-entrypoint.sh` |
| 是否需要手动初始化数据库 | **不需要**;EdgeAPI setup 自动跑 `internal/setup/sql.json` 里的全部 DDL | `setup.go:107-119`(SQLExecutor.Run) |
| 创建第一个 cluster 需要什么 | 必须用 admin token 调 EdgeAPI gRPC `NodeClusterService/CreateNodeCluster`,**没有零依赖 CLI 命令** | `upstream/EdgeAPI/internal/rpc/services/service_node_cluster.go`(社区版) |
| dev 阶段如何绕开"必须先有 cluster"的循环依赖 | 步骤 3 的方式 A/B/C 三选一;长期方案是 Phase 3 的 `bff-edge` 提供 REST 包装 | 见步骤 3 |

---

## 5. 常用运维命令

```bash
# 查看 EdgeAPI 日志
docker compose -f deploy/docker-compose.dev.yml logs -f edgeapi

# 看 admin token(任何时候)
docker compose -f deploy/docker-compose.dev.yml exec edgeapi \
    cat /app/configs/.admin-token.json

# 重新生成 admin token(EdgeAPI 自带 `token` 子命令)
docker compose -f deploy/docker-compose.dev.yml exec edgeapi \
    /app/bin/edge-api token --role=admin

# 进 mysql
docker compose -f deploy/docker-compose.dev.yml exec mysql \
    mysql -u root -p$MYSQL_ROOT_PASSWORD db_edge

# 完全重置(删 db + 配置)
docker compose -f deploy/docker-compose.dev.yml down -v
```

---

## 6. 后续 Phase 接入说明

| Phase | 服务 | 接入点 |
| --- | --- | --- |
| **Phase 2(已完成)** | `services/saas-svc/`(NestJS) | 连 **aegis-postgres**(5432, db=aegis_saas) + **aegis-redis**(6379, db=1)。本 compose 加了占位 service 在 profile=saas;Phase 2 阶段建议宿主 `npm run start:dev -w @aegis/saas-svc`,容器化待 Phase 5 写 Dockerfile |
| **Phase 3** | `services/bff-edge/`(NestJS) | 连 **aegis-edgeapi gRPC**(8003),持有 admin token,提供 REST 给前端 |
| **Phase 4** | `apps/web`(Next.js) | 前端 fetch `bff-edge` 与 `saas-svc`;不直接连 EdgeAPI |
| **Phase 5** | overlays(aegis tag) + saas-svc Dockerfile | 重建镜像加 `--build-arg BUILD_TAGS=aegis`;`docker-compose.dev.yml` 已留参数槽位;saas-svc 也容器化 |
| **Phase 8** | `services/analytics-svc/` + ClickHouse | 新增 `clickhouse` 容器进本 compose,EdgeNode `HTTPAccessLogQueue` 推日志;saas-svc 现有 6 个 `/internal/log/*` 占位端点届时整组搬过去 |

---

## 7. 已知风险点

1. **本机无 Docker 未实跑**:Dockerfile / compose 按生产形态编写,Phase 1 Step 3 未做端到端验证。
   首次实跑很可能踩坑(EdgeAPI build/configs 模板字段细节、cgo 库版本、cluster bootstrap 链)。
   **第一次 Linux/WSL2 上跑必排坑 30-90 分钟**,属预期成本。
2. **EdgeCommon proto 静态文件路径**:Dockerfile 假设 `upstream/EdgeCommon/build/...` 等子目录存在;
   若上游目录调整,build 会失败。Phase 5 第一次跑时会暴露。
3. **集群 bootstrap 循环依赖**:第一次创建 cluster 必须有 admin 介入(grpcurl/EdgeAdmin/直接 SQL),
   **不可能完全 docker compose up -d 一把过**。这是 GoEdge 设计,不是 bug。
4. **EdgeNode cgo 依赖版本**:Debian bookworm 的 `libinjection2`/`libwebp7` 与上游 `gowebp` 绑定的版本可能不严格对齐;
   若 build 阶段链接报错,需调整为编译期源码安装而非 apt 包。
5. **MySQL `boolFields` 列表**:db.yaml 模板里有一长串 boolFields 名,**上游版本升时这个列表可能扩**,
   entrypoint 里写死的列表会过期 → sync upstream 时必查([[../docs/18-升级与 rebase 流程.md]] §3 兼容性 checklist)。
6. **生产不能用本 compose**:本 compose 是 dev 编排,密码走 env、网络无 mTLS、无 secret manager;
   生产看 [[../docs/11-商用部署上线.md]]。

---

## 8. 关联文档

- [[../docs/15-goedge-secondary-development-plan.md]] — v2 北极星,Phase 1 范围定义
- [[../docs/16-overlay-build-tag-规范.md]] §7 — upstream 扩展点摸底(Dockerfile build args 的 BUILD_TAGS 含义)
- [[../docs/17-saas-svc-接口规范.md]] — saas-svc / bff-edge 服务边界(本 compose 留好的对接位)
- [[../docs/18-升级与 rebase 流程.md]] — GoEdge 上游 sync 时本 compose 的兼容性 checklist
- [[../docs/11-商用部署上线.md]] — **生产**部署(不要把本 dev compose 用到生产)
- [[../overlays/README.md]] — overlays 工作原理(Dockerfile 的 rsync 注入步骤)
