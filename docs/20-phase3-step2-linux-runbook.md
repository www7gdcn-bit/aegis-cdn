# Phase 3 Step 2 — Linux 真 EdgeAPI 实测 Runbook

版本 v1.0 · 2026-05-24 · 关联 [[docs/19-phase3-bff-edge.md]] §9

本 runbook 用于在 Linux/WSL2 服务器上端到端验证 Step 2 的 user 创建链路:
**saas-svc → bff-edge → edge-api-sdk → GoEdge EdgeAPI gRPC**。

预计耗时:**30 分钟**(含 docker 镜像拉取)。

---

## 0. 已在本机自测确认通过的(无需 Linux 再做)

| 项 | 验证方式 | 结论 |
| --- | --- | --- |
| AES-256-CFB token 互通 | Node SDK 生成 → 上游 EdgeAPI 同实现解密 → 明文 JSON 比对 | ✅ 完全匹配 |
| Proto-loader 加载 service_user.proto | mock gRPC server + SDK 实跑 | ✅ `pb.UserService.service` 路径正确 |
| Metadata `nodeid`/`token` 注入与读取 | mock server 解出 → 验明文 type=admin | ✅ 头部名 + 编码全对 |
| SDK createUser 字段映射 | mock server 收到 username/source/remark | ✅ 字段名与 proto 对齐 |
| 错误码 4 → 502 / 6 → 409 / 16 → 401 / 14 → 502 / NotImpl → 502 | 完整 5 类 curl 实测 | ✅ 全部正确映射 |
| `EDGE_API_MODE=placeholder/grpc` 模式切换 | env 切换 + /health 反映 mode | ✅ 切换正常 |
| `/internal/edge/status` 守 InternalTokenGuard | 无 token → 401 / 有 token → 200 | ✅ 守卫工作正常 |

**剩余只能在真 EdgeAPI 验证的**:
1. EdgeAPI 是否接受 `nodeClusterId=0` 当"默认集群"(若拒,需先 list 集群选首个)
2. CreateUserRequest `password=""` 是否被服务端拒绝
3. 真实 gRPC 链路的 timeout / 重试 / connection 复用行为
4. gRPC TLS 生产配置(Step 2 用 insecure)
5. EdgeAPI 在 docker 编排下的 setup 行为(api.yaml / db.yaml 渲染、首次建表)

---

## 1. 前置要求

| 工具 | 版本 |
| --- | --- |
| Docker | 24+ |
| docker compose | v2 |
| Node.js | 20+ |
| Go | 1.21+(可选,token 互通 self-test 用) |
| git | 2.30+ |

---

## 2. 准备代码与 env

```bash
# 1. clone + submodule
git clone <repo> aegis-cdn && cd aegis-cdn
git submodule update --init --recursive upstream/EdgeAPI upstream/EdgeNode upstream/EdgeCommon

# 2. 装依赖
npm install --workspaces --include-workspace-root

# 3. 编译 SDK + bff-edge + saas-svc
npx tsc -p packages/edge-api-sdk/tsconfig.json
npx nest build -p services/bff-edge/tsconfig.json   # 或 cd services/bff-edge && npm run build
npx nest build -p services/saas-svc/tsconfig.json

# 4. 配置 dev env
cp deploy/.env.example deploy/.env
# 编辑 deploy/.env:
#   MYSQL_ROOT_PASSWORD / MYSQL_PASSWORD / REDIS_PASSWORD / POSTGRES_PASSWORD → 改强密码
#   AEGIS_JWT_SECRET   → 32+ 字符随机串
#   AEGIS_INTERNAL_SECRET → 32+ 字符随机串
#   EDGE_NODE_CLUSTER_ID/SECRET → 暂留空(本 runbook 仅起 EdgeAPI 不起 EdgeNode)
```

---

## 3. 启动 GoEdge 控制面(只起 EdgeAPI,不起 EdgeNode)

```bash
docker compose -f deploy/docker-compose.dev.yml --env-file deploy/.env \
    up -d --build mysql redis edgeapi

# 等待 ~60s 让 edgeapi entrypoint 自动跑完 setup
docker compose -f deploy/docker-compose.dev.yml logs -f edgeapi
# 看到 "EdgeAPI setup OK. Admin token..." 之后 Ctrl+C 退出 follow
```

**预期 logs 关键行**:
```
==> running edge-api setup ...
{"adminNodeId":"...", "adminNodeSecret":"...", "isOk":true}
═══════════════════════════════════════════════════════════
  EdgeAPI setup OK. Admin token...
═══════════════════════════════════════════════════════════
[edge-api] listening on ...
```

**取 admin token**(下一步要用):
```bash
docker compose -f deploy/docker-compose.dev.yml exec edgeapi cat /app/configs/.admin-token.json
# → {"adminNodeId":"ADMIN_NODE_ID_FROM_HERE","adminNodeSecret":"SECRET_FROM_HERE","isOk":true}
```

**排错**:
- 容器立刻退出 → `logs edgeapi`,大概率 MySQL 未 healthy;再等 30s 或检查 `MYSQL_ROOT_PASSWORD`
- setup 报 `multiStatements` → 已被 entrypoint 自动加,若仍报检查 mysql 容器内部连接
- admin-token.json 不存在 → 看 entrypoint 输出是否有 `isOk:true`;无则 setup 失败

---

## 4. 启动 bff-edge(宿主跑,grpc 模式)

新开终端,把 admin token 填进 env 跑 bff-edge:

```bash
cd aegis-cdn

# 从 admin-token.json 取出来填这里
export EDGE_API_ADMIN_NODE_ID="<从 step 3 拿>"
export EDGE_API_ADMIN_NODE_SECRET="<从 step 3 拿>"

PORT=4002 \
  JWT_SECRET="any-32-chars-for-init-validation-only" \
  AEGIS_INTERNAL_SECRET="$(grep AEGIS_INTERNAL_SECRET deploy/.env | cut -d= -f2)" \
  EDGE_API_MODE=grpc \
  EDGE_API_GRPC_ADDR=127.0.0.1:8003 \
  node services/bff-edge/dist/main.js
```

**预期启动日志**:
```
[Nest] LOG [EdgeApiClient] EdgeApiClient mode=grpc addr=127.0.0.1:8003 adminConfigured=true
...
[Nest] LOG [RoutesResolver] UsersController {/internal/edge/users}:
...
[bff-edge] listening on http://0.0.0.0:4002/internal/edge
```

---

## 5. 走通核心 curl

```bash
# 5.1 公开 health(应返回 mode=grpc, adminConfigured=true)
curl -s http://127.0.0.1:4002/health | jq .

# 5.2 内部 status(带 token,期 200)
curl -s -H "X-Aegis-Internal-Token: $AEGIS_INTERNAL_SECRET" \
    http://127.0.0.1:4002/internal/edge/status | jq .

# 5.3 创建 GoEdge user(核心目标!)
INTERNAL_TOKEN=$(grep AEGIS_INTERNAL_SECRET deploy/.env | cut -d= -f2)
curl -s -w "\nHTTP=%{http_code}\n" -X POST \
    -H "Content-Type: application/json" \
    -H "X-Aegis-Internal-Token: $INTERNAL_TOKEN" \
    -d '{"tenantId":1,"username":"linux-test-001","email":"linux@aegis-test.local"}' \
    http://127.0.0.1:4002/internal/edge/users
```

**预期输出(成功)**:
```json
{"edgeUserId":1,"username":"linux-test-001"}
HTTP=201
```

**验证 MySQL 真的写入了**:
```bash
docker compose -f deploy/docker-compose.dev.yml exec mysql \
    mysql -uroot -p"$MYSQL_ROOT_PASSWORD" db_edge \
    -e "SELECT id, username, source, remark, createdAt FROM users ORDER BY id DESC LIMIT 5;"
```

**预期**:能看到 `linux-test-001` 一行,id 与 curl 返回的 edgeUserId 一致。

---

## 6. 5.3 失败时按错误码排查

| 返回 | code | 排查 |
| --- | --- | --- |
| HTTP 502 | `EDGE_API_NOT_READY` | SDK 在 placeholder 模式 — 检查 `EDGE_API_MODE=grpc` 是否进了 bff-edge 进程 env |
| HTTP 502 | `EDGE_API_UNREACHABLE` | docker `ps` 看 edgeapi 是否 healthy;`netstat -tlnp \| grep 8003` 看端口是否监听 |
| HTTP 401 | `EDGE_API_AUTH_FAILED` | **风险 #1 黄灯亮** — admin token 解密失败。可能原因:<br/>① ADMIN_NODE_ID/SECRET 复制错了(注意空格/末尾换行)<br/>② Node `aes-256-cfb` 与 Go `cipher.NewCFBEncrypter` 实际不互通(本机自测已通过但不能 100% 排除 docker 内 Go 版本差异)<br/>排查:跑 `node packages/edge-api-sdk/scripts/test-compat/gen-token.cjs "$EDGE_API_ADMIN_NODE_SECRET" "$EDGE_API_ADMIN_NODE_ID" \| go run packages/edge-api-sdk/scripts/test-compat/`,看是否能解出 JSON |
| HTTP 409 | `EDGE_USER_CONFLICT` | username 已存在 — 改个名重试 |
| HTTP 500 | `EDGE_API_ERROR` | 看 bff-edge 日志,大概率与 `nodeClusterId` 或 `password` 字段有关 |

**如果 `EDGE_API_ERROR` 显示 cluster 相关**:
- 这就是 docs/19 §9 风险 #3 / #4 浮现
- 解法:进 mysql 看 `edgeNodeClusters` 表,把第一行 id 通过 env 传:
  ```
  # 当前 SDK 写死 nodeClusterId=0,如果 GoEdge 拒绝,
  # 改 packages/edge-api-sdk/src/grpc/services/users.ts 的 nodeClusterId 字段或
  # 加 env EDGE_DEFAULT_CLUSTER_ID 让 SDK 读
  ```

---

## 7. saas-svc backfill 端到端

```bash
# 起 postgres(若 step 3 没起)
docker compose -f deploy/docker-compose.dev.yml --profile saas \
    --env-file deploy/.env up -d postgres

# 跑 saas-svc prisma 建表
cd services/saas-svc
DATABASE_URL="postgresql://aegis:<POSTGRES_PASSWORD>@127.0.0.1:5432/aegis_saas?schema=public" \
    npx prisma db push
cd ../..

# 手动插一行 Tenant 模拟"存量数据"
docker compose -f deploy/docker-compose.dev.yml exec postgres \
    psql -U aegis -d aegis_saas \
    -c "INSERT INTO \"Tenant\"(\"name\") VALUES('LegacyTenant-1');"

# dry-run(应列出 1 个 pending tenant)
cd services/saas-svc
DATABASE_URL="postgresql://aegis:<POSTGRES_PASSWORD>@127.0.0.1:5432/aegis_saas?schema=public" \
  BFF_EDGE_INTERNAL_URL=http://127.0.0.1:4002 \
  AEGIS_INTERNAL_SECRET="$INTERNAL_TOKEN" \
  npx ts-node scripts/backfill-edge-users.ts

# --apply 真跑
DATABASE_URL="postgresql://aegis:<POSTGRES_PASSWORD>@127.0.0.1:5432/aegis_saas?schema=public" \
  BFF_EDGE_INTERNAL_URL=http://127.0.0.1:4002 \
  AEGIS_INTERNAL_SECRET="$INTERNAL_TOKEN" \
  npx ts-node scripts/backfill-edge-users.ts --apply
```

**预期 --apply 输出**:
```
[backfill-edge-users] mode=APPLY bff=http://127.0.0.1:4002 pending=1
  ✓ tenant=1 → edgeUserId=2
[backfill-edge-users] done.  ok=1  fail=0
```

**验证 PG 回写**:
```bash
docker compose -f deploy/docker-compose.dev.yml exec postgres \
    psql -U aegis -d aegis_saas \
    -c "SELECT id, name, \"edgeUserId\", \"edgeUserSyncedAt\" FROM \"Tenant\";"
```

`edgeUserId` 不为 NULL → backfill 通畅。

---

## 8. 清理

```bash
docker compose -f deploy/docker-compose.dev.yml --profile saas \
    --env-file deploy/.env down -v
# -v 删卷,完整重置;不加 -v 保留数据下次复用
```

---

## 9. 实测后回填风险表

跑完后请在 [[docs/19-phase3-bff-edge.md]] §9 把已确认通过的风险打勾。

| 风险 | 关闭条件 |
| --- | --- |
| #1 AES-CFB 加密互通 | 已在本机 self-test 关闭;Linux 这里走通 5.3 算交叉确认 |
| #2 Proto-loader 包路径 | 已在本机 mock 测关闭;Linux 通过 5.3 算交叉确认 |
| #3 password 为空 | Linux 走通 5.3 时验证 |
| #4 nodeClusterId=0 行为 | Linux 走通 5.3 时验证;若 5.3 报 cluster 错误则需补 list-cluster helper |
| #5 gRPC TLS | 本步骤用 insecure,Phase 3 Step 3+ 部署生产时验证 |
| #6 connection 复用 | Step 5+ 加 domains/ssl 时需要时验证 |
| #7 错误码映射 | 已在本机覆盖 4/14 status code;实际 EdgeAPI 业务错可能出 code=2 UNKNOWN,Linux 实测后按真实补 |
| #8 proto 字段升级 | 上游 sync 时检查,与本 Step 无关 |

---

## 10. Phase 3 Step 6.5 — SSL 绑定真实生效验证(P0)

签发证书只是第一步,**必须验证 EdgeNode 真的用了该证书握手**。

### 10.1 前置准备

1. 完整跑过 §5(添加域名)+ Step 5(DNS 验证通过 → status=active)
2. saas-svc 已配 `EDGE_DEFAULT_ACME_USER_ID`(平台运营在 GoEdge 注册的共用 ACME User)
3. EdgeNode 容器已起,80/443 端口暴露

### 10.2 触发 SSL 签发 + 绑定

方式 A:等 `SslAutoIssueCron`(每 5min)自动跑;
方式 B:立即触发:
```bash
INTERNAL_TOKEN=$(grep AEGIS_INTERNAL_SECRET deploy/.env | cut -d= -f2)
# 用户视角:
JWT="..."  # 用户登录后拿
curl -X POST "http://127.0.0.1:4001/api/v1/saas/domains/<id>/issue-ssl" \
     -H "Authorization: Bearer $JWT"
```

期望返回(同步阻塞 30s-2min):
```json
{
  "sslStatus": "issued",
  "sslCertId": 1,
  "sslIssuedAt": "...",
  "sslExpiresAt": "..."   // 约 90 天后
}
```

### 10.3 验证绑定状态

```bash
curl "http://127.0.0.1:4001/api/v1/saas/domains/<id>/ssl" \
     -H "Authorization: Bearer $JWT"
```

**关键字段**:
- `sslStatus: "issued"` — ACME 签发成功
- `sslBindingStatus: "bound"` — **证书已绑到 GoEdge server HTTPS 配置**
- `sslBoundAt` — 不为 null
- `sslPolicyId` — GoEdge 新建的 SSLPolicy id

若 `sslBindingStatus=failed`:
```bash
# 看错误
curl -s "http://127.0.0.1:4001/api/v1/saas/admin/domains/<id>" \
     -H "Authorization: Bearer $ADMIN_JWT" | jq '.sslBindingError'

# 手动重绑(无需重签证书,不消耗 LE rate limit)
curl -X POST "http://127.0.0.1:4001/api/v1/saas/admin/domains/<id>/rebind-cert" \
     -H "Authorization: Bearer $ADMIN_JWT"
```

### 10.4 真实证书握手验证(必测)

```bash
# 假设 example.com 已配 CNAME 到 <hex>.aegiscdn.com,DNS 已生效
curl -Iv https://example.com 2>&1 | grep -E "subject|issuer|HTTP/"
```

**预期输出**:
```
*  subject: CN=example.com
*  issuer: C=US; O=Let's Encrypt; CN=R3   (或 R10/R11/E5 等 LE 中间证书)
< HTTP/2 200
```

**确认**:
- ✅ subject 与请求域名匹配(`CN=example.com`)
- ✅ issuer 是 Let's Encrypt(**不是** GoEdge 默认自签 `O=GoEdge` / `O=TeaOS`)
- ✅ HTTP/2 协商成功(说明 sslPolicy 的 http2Enabled=true 生效)
- ✅ HTTP 200(或 5xx 取决于源站,**重点是 TLS 握手不报错**)

### 10.5 如果失败 — 排查路径

| 现象 | 可能原因 | 排查 |
| --- | --- | --- |
| `curl: SSL certificate problem` | EdgeNode 用了默认/自签证书,sslPolicy 未生效 | 1. 看 saas-svc 日志看 bindCertToServer 是否调通;2. `docker compose exec mysql mysql ... db_edge -e "SELECT id,httpsJSON FROM edgeServers WHERE id=<edgeDomainId>"` 看 httpsJSON 是否含 sslPolicy 字段;3. EdgeNode 是否需要 reload 配置 |
| `subject=CN=GoEdge` | sslPolicy 内 sslCertId 没生效;httpsJSON.sslPolicy.isOn=false 之类 | 用 admin rebind-cert 重试;若仍失败查 GoEdge SSLPolicyService.findEnabledSSLPolicyConfig |
| `HTTP/1.1`(不是 HTTP/2) | http2Enabled=false,但握手成功 | 不影响 TLS;若要 h2 检查 sslPolicy.http2Enabled 字段 |
| 连接超时 | EdgeNode 443 未起 / 防火墙 | `nc -zv edgenode-host 443` |
| `subject=CN=<hex>.aegiscdn.com` | CNAME 还未生效(用户域名指向 cnameTarget),DNS 缓存 | 等 TTL 过 or `dig +short example.com CNAME` 确认 |

### 10.6 续期验证(可选,长期)

LE 默认 90 天到期。生产环境观察:剩余 30 天时 `SslAutoIssueCron` 应自动续期:
- `sslStatus` 短暂 `renewing` → 回到 `issued`
- `sslRenewedAt` 更新
- `sslExpiresAt` 推后 90 天

手动模拟:在 saas-svc 直接 SQL 把 `sslExpiresAt` 改成 now+10d,等下个 cron 周期触发。
