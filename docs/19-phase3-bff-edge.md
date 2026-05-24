# Phase 3 — bff-edge 桥接层

版本 v0.1 · Phase 3 Step 1 落地 · 关联 [[docs/15-goedge-secondary-development-plan.md]] §9 Phase 3

> 本文是 Phase 3 的 **架构与调用链** 总览。Phase 3 分多步实施,本文随每步更新。
> Step 1 落 **可编译骨架**(本文当前版本对应内容);Step 2+ 起真接 EdgeAPI gRPC。

---

## 0. 一句话定位

**bff-edge = saas-svc / apps-web 与 GoEdge EdgeAPI 之间的协议桥 + 唯一守门员**。

- 唯一允许调 EdgeAPI gRPC 的服务
- 持有 admin node 凭证,代表平台账户操作 GoEdge
- 向上以 REST/JSON 暴露;向下走 gRPC
- 不持有任何业务库;不签发 JWT;只做协议转换 + 配额前置校验

---

## 1. 三层架构(Phase 3 落地形态)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    客户浏览器 / 运营浏览器                                   │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │ HTTPS
                ┌────────────────▼────────────────┐
                │     apps/web (Next.js :3000)    │
                │  官网 · 客户控制台 · 管理后台      │
                └────┬───────────────────┬────────┘
            REST(JWT)│                   │REST(JWT)
       ┌─────────────▼───────┐   ┌───────▼──────────────┐
       │   saas-svc :4001    │   │   bff-edge :4002     │
       │   (NestJS)          │   │   (NestJS)           │
       │                     │   │                      │
       │  - 用户/Tenant/KYC  │   │  EdgeAPI gRPC 桥     │
       │  - 套餐/订阅/订单    │   │  - users / domains   │
       │  - 支付适配器        │   │  - ssl / nodes       │
       │  - 工单/钱包         │   │  - ip-lists(blocks) │
       │  - GlobalBlock(数据)│   │                      │
       │                     │   │ ← 唯一可调 EdgeAPI    │
       │  签发 JWT(唯一)     │   │ ← 仅验证 JWT          │
       └────┬───────┬────────┘   └────┬─────────────────┘
            │       │  /internal/* 互调  │ gRPC + admin node 凭证
            │       └────────────────────┤
       ┌────▼──────┐                     ▼
       │PostgreSQL │           ┌──────────────────────────────┐
       │aegis_saas │           │ GoEdge 集群                  │
       └───────────┘           │                              │
                               │ ┌─────────┐ ┌──────────────┐ │
                               │ │EdgeAPI  │ │N × EdgeNode  │ │
                               │ │  :8003  │ │              │ │
                               │ └────┬────┘ └──────────────┘ │
                               │      ▼                       │
                               │  ┌─────────┐                 │
                               │  │ MySQL   │                 │
                               │  │ db_edge │                 │
                               │  └─────────┘                 │
                               └──────────────────────────────┘
```

---

## 2. bff-edge 端口与接口分组

| 端口 | 路径前缀 | 守卫 | 用途 |
| --- | --- | --- | --- |
| `:4002` | `/health` | 公开 | k8s 探测 |
| `:4002` | `/internal/edge/health` | InternalTokenGuard | 内部深度健康(含 SDK 状态、saas-svc 可达性) |
| `:4002` | `/internal/edge/users/*` | InternalTokenGuard | GoEdge user 增/查/启停(给 saas-svc 调) |
| `:4002` | `/internal/edge/domains/*` | InternalTokenGuard | 域名(GoEdge server)CRUD |
| `:4002` | `/internal/edge/ssl/*` | InternalTokenGuard | 证书 + ACME 自动签发 |
| `:4002` | `/internal/edge/nodes/*` | InternalTokenGuard | 节点状态(只读) |
| `:4002` | `/internal/edge/blocks/*` | InternalTokenGuard | 全局封禁(同步 saas-svc.GlobalBlock 到 GoEdge ip_list) |

> **Phase 3 Step 1**:5 个分组 controller 均为占位,handler 返回 `{ todo: "..." }`,
> 标注未来真实调用的 EdgeAPI gRPC 方法名。Step 2 起按优先级填实现。

---

## 3. 调用链 — 三个典型场景

### 3.1 注册流程(saas-svc → bff-edge → EdgeAPI)

```
浏览器
  └─► POST /api/v1/saas/auth/register
        ├─ saas-svc 建 Tenant + User(PG)
        ├─ saas-svc 异步 POST /internal/edge/users (X-Aegis-Internal-Token)
        │   └─► bff-edge.users.create()
        │         └─► EdgeApiClient.users.create() → gRPC UserService.CreateUser
        │               └─► EdgeAPI 在 MySQL users 表插入 → 返 user_id
        ├─ saas-svc 回写 Tenant.edgeUserId + edgeUserSyncedAt
        └─ 返回 JWT(payload 含 edgeUserId,后续请求一次取出)
```

**Phase 3 Step 1 行为**:saas-svc 还未触发上述异步;bff-edge 端点存在但返回 todo。
**Phase 3 Step 2 行为**:bff-edge 真接 gRPC,Tenant.edgeUserId 真实写入。
**Step 2 上线时**:跑 `services/saas-svc/scripts/backfill-edge-users.ts` 对存量 Tenant 一次性 provision。

### 3.2 加域名(浏览器 → apps/web → bff-edge,加 saas-svc 配额前置)

```
浏览器
  └─► POST /api/v1/edge/domains  (apps/web 转 bff-edge)
        └─► bff-edge.domains.create()
              ├─ 1. 解 JWT → tenantId + edgeUserId
              ├─ 2. POST saas-svc/internal/quota/check  { tenantId, action:"add_domain", currentDomainCount }
              │     └─ saas-svc 返 allowed:true|false (status:402 时拒绝)
              ├─ 3. allowed → EdgeApiClient.domains.create({ userId: edgeUserId, serverName })
              │     └─► gRPC ServerService.CreateServer
              └─ 返回 { serverId, serverName, ... }
```

### 3.3 封禁恶意 IP(运营手动 → saas-svc → bff-edge → GoEdge ip_list)

```
管理后台
  └─► POST /api/v1/saas/admin/blocks  (写 saas-svc.GlobalBlock 表 — 数据归属)
        └─ saas-svc 同步触发 POST bff-edge/internal/edge/blocks
              └─► bff-edge.blocks.add()
                    └─► EdgeApiClient.ipLists.addItemToGlobalBlocklist({...})
                          └─► gRPC IPItemService.CreateIPItem → GoEdge 全局封禁列表
                                └─► EdgeNode 通过 IP 库 + firewall 命中拦截
```

→ 运营审计在 saas-svc(谁封的、何时、为什么),执行在 GoEdge,bff-edge 是单向同步通道。

---

## 4. Tenant.edgeUserId 写入流程(Phase 3 演进)

| 阶段 | Tenant.edgeUserId 是否填 | 谁写 |
| --- | --- | --- |
| Phase 2(已完成) | 永远 null | 无 |
| Phase 3 Step 1(本步) | 仍为 null;入口契约就绪未触发 | 无 |
| Phase 3 Step 2(下一步) | 注册时实时写;存量靠 backfill 脚本 | saas-svc(收到 bff-edge 回应后回写) |
| Phase 3 Step 3+ | 同步失败重试 / 解绑 / 重绑场景完善 | saas-svc + 失败队列 |

### 写入入口

- 实时:`saas-svc /api/v1/saas/auth/register` → bff-edge `POST /internal/edge/users` → `saas-svc.TenantService.setEdgeUserId()`
  - 注:saas-svc 已在 Phase 2 Step C2 实现 `setEdgeUserId()`(含冲突保护),Step D 已实现 `POST /internal/user/provision`(bff-edge → saas-svc 的回调入口)。
- 补偿:`services/saas-svc/scripts/backfill-edge-users.ts`(待 Step 2 写)— 遍历 `Tenant where edgeUserId IS NULL`,逐个调 bff-edge。

### JWT payload 同步

- saas-svc 签 JWT 时已读 Tenant.edgeUserId 一并放入(Phase 2 C1 已实现),Step 2 起前端/bff-edge 即可零额外查询用到它。

---

## 5. packages/edge-api-sdk 架构

```
packages/edge-api-sdk/
├── src/
│   ├── index.ts             公共入口 export
│   ├── client.ts            createEdgeApiClient(config) → EdgeApiClient
│   ├── errors.ts            EdgeApiError + NotImplementedError
│   ├── types.ts             EdgeUserId/EdgeServerId/CreateUserInput/...
│   └── services/
│       ├── users.ts         UsersService 接口 + PlaceholderUsersService 实现
│       ├── domains.ts       DomainsService
│       ├── ssl.ts           SslService(含 ACME)
│       ├── nodes.ts         NodesService(只读)
│       └── ip-lists.ts      IpListsService(blocks)
└── package.json             @aegis/edge-api-sdk(workspace,无 npm publish)
```

**职责**:
- 屏蔽 gRPC 细节(channel/metadata/proto codegen),向上暴露**TypeScript-friendly** 方法
- Phase 3 Step 1:全 Placeholder,bff-edge 起得来,health 报 `mode: "placeholder"`
- Phase 3 Step 2:接 `@grpc/grpc-js`;proto 文件从 `upstream/EdgeCommon/pkg/rpc/protos/` codegen;
  config 加 `tls`/`timeoutMs`/`reconnect`;mode 切到 `"grpc"`

**为什么不让 bff-edge 直接装 @grpc/grpc-js**:
- bff-edge 关注 HTTP/业务编排;SDK 关注 gRPC/proto,职责清晰
- Phase 5 起若有 admin-svc / analytics-svc 也需要调 EdgeAPI,可共享 SDK 无重复

---

## 6. 端口表(全量,Phase 3 Step 1 后)

| 服务 | 端口 | 范围 |
| --- | --- | --- |
| apps/web | 3000 | dev 浏览器 |
| apps/api(残留) | 4000 | Phase 3 起逐项下线 |
| **services/saas-svc** | **4001** | SaaS 业务规则 |
| **services/bff-edge** | **4002** | EdgeAPI 桥接 ← 本 Phase 新增 |
| GoEdge EdgeAPI gRPC | 8003 | bff-edge 通过 SDK 调 |
| GoEdge EdgeNode | 80/443 | 边缘反代 |

---

## 7. Phase 3 路线图

| Step | 范围 | 状态 |
| --- | --- | --- |
| Step 1 | bff-edge 骨架 + SDK placeholder + 5 个分组 controller 占位 + 文档 | 已完成 |
| Step 2 | SDK 真接 @grpc/grpc-js + admin metadata + UserService.create 真实化 + bff-edge `POST /users` + saas-svc EdgeProvisionService(不接 register) + backfill 脚本 | 已完成(本机最大化自测,Linux 实测顺延到 Phase 3 收尾前 E2E) |
| Step 3 | register 自动 provisionTenant + PendingEdgeProvision retry queue + cron 30s + provision-status endpoints + backfill --queue + Tenant.edgeUserId 自动绑定 | 已完成 |
| Step 4 | Domains Onboarding:SDK DomainsService + bff-edge `/domains` 4 endpoints + saas-svc SaasDomain 表 + 5 状态机 + 用户 REST(添加/列表/CNAME/删除/暂停/恢复) | 已完成 |
| **Step 5** | **DNS 验证自动激活:DomainVerificationService(三态)+ Cron 60s + 用户 REST verify-status/verify + Admin REST 跨租户视图** | **已完成** |
| **Step 6** | **SSL/ACME 自动签发 + 自动续期:SDK SslService 真实化(requestAcmeCert/findCertById/listCertsByUser/removeCert)+ bff-edge `/ssl` 4 endpoints + saas-svc SslService(状态机 none/pending/issued/failed/expired/renewing)+ SslAutoIssueCron 5min + 续期阈值 30 天 + 用户 ssl-status/issue-ssl + admin 强制签发** | **本步,已完成** |
| Step 7 | blocks 单向同步链路(saas-svc.addBlock → bff-edge → GoEdge ip_list);
            apps/api 残留 reviewDomain / addBlock 整体下线 | 待启 |
| Step 8 | nodes 只读 + 运营观察前端 | 待启 |
| Final  | E2E Linux 实测(包含 register + provision + domain + DNS verify + SSL + WAF + CC) | 待启 |

---

## 13. Phase 3 Step 5+6 落地清单(DNS 验证 + SSL/ACME)

### Step 5 — DNS 验证

**SaasDomain 加 3 字段**:`verifiedAt` / `lastVerifyAt` / `lastVerifyError`

**DomainVerificationService**(`dns/promises`):
- `DNS_RESOLVERS=8.8.8.8,1.1.1.1`(env 可配,默认公共 DNS)
- 三态 `matched / mismatch / error`,忽略大小写 + 末尾点
- `verifyAndUpdate(id)`:matched → `status=active,verificationStatus=verified,verifiedAt=now`;
  其他 → 只更 `lastVerifyAt + lastVerifyError`
- 仅 `status=dns_pending` 才验证;其他 skip

**Cron** @Cron(EVERY_MINUTE),`DOMAIN_VERIFY_CRON=off` 可关

**用户 REST**:
- `GET /api/v1/saas/domains/:id/verify-status`
- `POST /api/v1/saas/domains/:id/verify` — "我已配 DNS,立即检测"

**Admin REST**:
- `GET /api/v1/saas/admin/domains?status=&verificationStatus=`
- `GET /api/v1/saas/admin/domains/:id` — 含 kycStatus
- `POST /api/v1/saas/admin/domains/:id/verify` — 运营强制重跑

### Step 6 — SSL/ACME

**SaasDomain 加 7 字段**:`acmeTaskId / sslCertId @unique / sslIssuedAt / sslExpiresAt /
sslRenewedAt / lastSslAttemptAt / lastSslError`

**sslStatus 状态机**:
```
none / failed ──→ pending ──→ issued ──→ renewing ──→ issued / (issued + lastSslError)
                                  ↓                       ↓
                                failed                   issued + 接近 expired → 自动再 renew
```

**SDK SslService 真实化**:
| 方法 | 调 GoEdge | 说明 |
| --- | --- | --- |
| `requestAcmeCert` | `createACMETask` + `runACMETask` | 同步阻塞,可能 30s-2min;返 `{acmeTaskId, isOk, sslCertId?, error?}` |
| `findCertById` | `findEnabledSSLCertConfig` | 解 `sslCertJSON` bytes |
| `listCertsByUser` | `listSSLCerts(userId)` | paged(offset/size) |
| `removeCert` | `deleteSSLCert` | |
| `uploadCert` | (Placeholder) | Step 8+ 用户自带证书场景 |

**bff-edge endpoints**(`/internal/edge/ssl/*`,InternalTokenGuard):
- `POST /ssl/acme/tasks` — 一把签发
- `GET /ssl/certs?edgeUserId=N` / `GET /ssl/certs/:certId` / `DELETE /ssl/certs/:certId`

**saas-svc SslService**(`modules/domains/`):
- `issueOrRenew(domainId, {isRenew?})`:
  - 前置:`status=active`,`Tenant.edgeUserId` 就绪,`EDGE_DEFAULT_ACME_USER_ID` 已配
  - 写 `sslStatus=pending|renewing` → 调 bff-edge → 成功写 `issued + certId + expiresAt`
  - 续期失败保留 `issued`(用旧证书过到期);首次签发失败转 `failed`
- `runAutoIssueBatch(10)`:
  - 选 1: `status=active && sslStatus in [none,failed]`(按 lastSslAttemptAt 最旧)
  - 选 2: `status=active && sslStatus=issued && sslExpiresAt ≤ now+30d`(按 expiresAt 最早)
- 配套 `SslAutoIssueCron` @Cron(EVERY_5_MINUTES),`SSL_AUTO_CRON=off` 可关

**用户 REST**:
- `GET /api/v1/saas/domains/:id/ssl` — 状态详情(含 `daysToExpire`)
- `POST /api/v1/saas/domains/:id/issue-ssl` — 立即签发(同步阻塞 ~2min)

**Admin REST**:
- `POST /api/v1/saas/admin/domains/:id/issue-ssl` — 强制签发(运营介入)
- `GET /api/v1/saas/admin/domains/:id/ssl` — 完整详情

### LE / ZeroSSL 切换

GoEdge ACMEUser 注册时绑定 ACMEProvider(letsencrypt 或 zerossl)。
**切换方式**:平台运营在 GoEdge 内建一个 ZeroSSL 的 ACMEUser(`acmeProviderId=2` 之类),
把 `EDGE_DEFAULT_ACME_USER_ID` 改成它的 id 即可,saas-svc 代码无须改。

第一版 LE 即可:免费、无限量、HTTP-01 兼容性最好。

### 完整业务链(已闭环,代码层)

```
1. POST /auth/register
   → JWT(edgeUserId=null)
2. 异步 scheduleProvision → bff-edge createUser → Tenant.edgeUserId=N
   (前端轮询 /edge-provision/me 看 status=done)
3. POST /domains  {"domain":"example.com","originHost":"origin.foo.com"}
   → saas-svc 生成 cnameTarget = a1b2c3d4.aegiscdn.com
   → bff-edge createBasicHTTPServer → SaasDomain.status=dns_pending
4. 用户改 DNS:example.com CNAME → a1b2c3d4.aegiscdn.com
5. DomainVerificationCron(60s)自动检测 → matched → status=active
   或用户点 POST /domains/:id/verify 立即检测
6. SslAutoIssueCron(5min)自动签发 → sslStatus=issued
   或用户点 POST /domains/:id/issue-ssl 立即签发(同步阻塞 ~2min)
7. LE 90 天到期前 30 天 SslAutoIssueCron 自动续期
8. 客户请求 https://example.com → EdgeNode 用 sslCertId 对应的证书握手 → 反代到 origin.foo.com
```

**注**:第 8 步要求 GoEdge `updateServerHTTPS` 把 `sslCertId` 绑到 server 的 HTTPS 配置上 — 
本 Step 6 **未做**(只签发了证书,没绑到 server)。下一 Step 或同 Step 收尾补 `bindCertToServer` 调用。

---

## 14. Phase 3 Step 6 未完成的小尾巴(下一步必补)

- **`updateServerHTTPS` 绑定证书到 server**:Step 6 签发了证书,但 GoEdge server 的 HTTPS
  配置没绑定到 sslCertId,EdgeNode 实际握手仍用默认证书。要补:
  - SDK `domains.bindCert(serverId, certId)` 方法 → 调 `ServerService.updateServerHTTPS`
  - saas-svc.SslService.issueOrRenew 成功后 → 调 bff-edge bindCert
- **DNS-01 挑战**:第一版只 HTTP-01;如客户用 CDN 前置时需 DNS-01。Step 6+ 再加。
- **ACME 失败 backoff**:当前失败立 fail,下次 cron 立刻再试 → 应加退避(类似 EdgeProvision)。
- **ZeroSSL ACMEUser 文档化**:运营如何在 GoEdge 注册 ZeroSSL ACMEUser 的具体 RPC 调用。

---

## 15. 关联文档

---

## 8. Phase 3 Step 2 落地清单(2026-05-24)

### SDK 新增能力

- 依赖:`@grpc/grpc-js` ^1.12 + `@grpc/proto-loader` ^0.7
- 入库 proto:`packages/edge-api-sdk/proto/`(由 `scripts/sync-proto.sh` 递归 follow imports 同步,Step 2 共 7 个文件 = service_user.proto + 6 依赖)
- 新增 `src/grpc/auth.ts`:`buildGoEdgeToken(secret, nodeId, type)` — AES-256-CFB(key 32B pad space / iv 16B pad space)+ JSON `{type, timestamp, userId:0}` + base64
- 新增 `src/grpc/client.ts`:`GrpcEdgeApiClient`,每次 RPC 调用前重新生成 token 注入 metadata `{nodeid, token}`
- 新增 `src/grpc/services/users.ts`:`GrpcUsersService.create` 真实调用 `pb.UserService/createUser`
- `createEdgeApiClient(config)` 支持 `mode: "placeholder" | "grpc"`;未指定时按凭证完整性自动选

### bff-edge 真实化

- `POST /internal/edge/users`:接 SDK 真实 createUser
- 错误码契约(返回 body 含 `code`):
  - 502 `EDGE_API_NOT_READY`   (SDK placeholder 模式)
  - 502 `EDGE_API_UNREACHABLE` (grpc UNAVAILABLE/DEADLINE)
  - 401 `EDGE_API_AUTH_FAILED` (UNAUTHENTICATED/PERMISSION_DENIED)
  - 409 `EDGE_USER_CONFLICT`   (ALREADY_EXISTS)
  - 500 `EDGE_API_ERROR`       (其他)
- `EdgeApiClient` 读 `EDGE_API_MODE` env(优先级:env > 凭证自动判断)

### saas-svc 新增

- `modules/edge-provision/`:`EdgeProvisionService.provisionTenant(tenantId)`
  - 调 bff-edge `POST /internal/edge/users`
  - 成功后写 `Tenant.edgeUserId` + `edgeUserSyncedAt`
  - 失败返结构化 `{ok:false, code, reason}`(不抛异常),调用方决定是否重试
  - **不接进** register 流程(避免破坏现有注册;Phase 3 Step 3 才接)
- `scripts/backfill-edge-users.ts`:CLI 工具,默认 dry-run,`--apply` 真跑,可 `--limit N`

---

## 9. 未端到端实测的风险清单(Step 2 必须列清,Step 3 前实测)

> 本机 Windows 无 Docker;EdgeAPI gRPC 未跑过。下列假设需在 Linux/WSL2 环境跑通后才能视为已验证。

| # | 风险 | 触发条件 | 应对 |
| --- | --- | --- | --- |
| 1 | **AES-256-CFB segment size 不匹配** | Node `aes-256-cfb` 与 Go `cipher.NewCFBEncrypter` 实际加密对接 | Node 默认是 CFB-128,Go 也是 128;但若实测解密失败,尝试 `aes-256-cfb8` 或自实现 segment-by-segment XOR |
| 2 | **proto-loader 包名解析** | `userProto.pb.UserService` 路径若上游 proto `package` 字段调整即断 | 实测后将路径常量化 + 加单元测试 |
| 3 | **GoEdge `password` 为空被拒** | CreateUserRequest 字段 password 当前传空 | 实测若拒,改为 saas-svc 生成强随机 + 不落库(GoEdge 仅用作占位) |
| 4 | **clusterId=0 行为** | Step 2 传 `nodeClusterId: 0` 期待"默认集群" | 实测若 GoEdge 拒绝,需先 list cluster 选第一个 / 或从 env 注入 `EDGE_DEFAULT_CLUSTER_ID` |
| 5 | **gRPC TLS** | EdgeAPI 默认非 TLS(`createInsecure`);生产应走 TLS | Phase 3 Step 3+ 加 `config.tls.caPath`,生产部署文档化 |
| 6 | **bff-edge connection 复用** | 当前 `GrpcEdgeApiClient` 直接 new UserService stub | proto-loader 推荐每个 service 独立 stub;Step 3 起 domains/ssl 加时统一 channel(`new grpc.Client(addr, creds)` + 各 service 复用) |
| 7 | **错误码映射不全** | grpc.status code 14 种,只映射了 4 种 | 实测后按真实落到的 code 补;尤其 `2 UNKNOWN`(GoEdge 业务异常常用) |
| 8 | **proto 字段缺失** | model_user / model_user_feature / model_node_value 等若上游升级删字段 | sync 时 docs/18 §3 checklist 必查 |

**实测最小步骤**:已迁移到独立 runbook → [[docs/20-phase3-step2-linux-runbook.md]]

---

## 10. Phase 3 Step 3 落地清单(2026-05-24)

### Schema 新增 PendingEdgeProvision 表

```
PendingEdgeProvision
  tenantId    @unique        ← 关联 Tenant 1:1
  status      pending | retrying | done | failed
  attempts    int            ← 已尝试次数
  maxAttempts default 8      ← 超过即 status=failed(运营介入)
  lastError   String?        ← 上次失败原因(bff-edge code/message)
  lastErrorAt DateTime?
  nextTryAt   DateTime       ← cron 扫描条件
  resolvedAt  DateTime?      ← done/failed 终态时间戳
  @@index([status, nextTryAt])
```

Tenant.edgeUserId 真正写入只在 status=done 那次 transaction,二者强一致。

### EdgeProvisionService 扩展

| 方法 | 用途 |
| --- | --- |
| `scheduleProvision(tenantId)` | register 异步入口;upsert pending 记录 + 立即试一次 |
| `retryPending(batchSize=20)` | cron 调;批量处理 due 的 pending/retrying 记录 |
| `attemptOne(tenantId)`(私有) | 单次尝试,返回 outcome ∈ ok/transient-fail/permanent-fail |
| `manualRetry(tenantId)` | admin 触发;重置 status=pending 并立即试 |
| `getStatus(tenantId)` | 状态查询(给前端/admin) |
| `provisionNow(tenantId)` | backfill 兼容用,同步阻塞直到完成 |

**错误分类**(`TRANSIENT_CODES`):
- 瞬时(退避重试):`EDGE_API_NOT_READY` / `EDGE_API_UNREACHABLE` / `BFF_EDGE_UNREACHABLE` / `EDGE_API_ERROR`
- 永久(立 failed):`EDGE_API_AUTH_FAILED` / `EDGE_USER_CONFLICT` / `BFF_EDGE_BAD_RESPONSE`
- 退避:指数 `2^attempts` 秒,封顶 600s;超 maxAttempts → status=failed

### Cron

`EdgeProvisionCron` 用 `@nestjs/schedule` 每 30s 跑一次 `retryPending(20)`。
- 单实例 reentry 保护:`this.running` flag
- 可关:`EDGE_PROVISION_CRON=off`(dev 静默用)
- Multi-instance 不防重(Phase 4+ 加 advisory lock 或 BullMQ)

### REST endpoints

| 路径 | 守 | 用途 |
| --- | --- | --- |
| `GET /api/v1/saas/edge-provision/me` | JwtAuthGuard | 查自己 Tenant 状态(前端可轮询) |
| `GET /api/v1/saas/admin/edge-provision?status=failed` | Jwt + Roles | 运营 dashboard,可按 status 过滤 |
| `GET /api/v1/saas/admin/edge-provision/:tenantId` | Jwt + Roles | 查指定 Tenant 详细状态 |
| `POST /api/v1/saas/admin/edge-provision/:tenantId/retry` | Jwt + Roles | 手动 retry(失败后运营介入) |
| `POST /internal/edge-provision/process-pending` | InternalTokenGuard | 外部 cron / scheduler 触发(可叠加 saas-svc 自带 cron) |

### AuthService.register 接入

```ts
// register 末尾:
setImmediate(() => {
  this.edgeProvision.scheduleProvision(tenant.id).catch(...);
});
return this.sign({...});  // 立刻返回,不阻塞
```

- **完全不阻塞 register**:setImmediate + 内部 catch,任何异常都不影响 access_token
- **前端拿到 JWT 后**:轮询 `/edge-provision/me` 直到 status=done(或失败时显示客服联系)

### backfill 优化

新增 `--queue` flag:
- 不带 `--queue`(默认 sync):脚本直接调 bff-edge,串行,失败立刻报
- 带 `--queue`:写 PendingEdgeProvision 表后秒退出,交给 saas-svc cron 异步处理
- 适合大批量 backfill 或 saas-svc 已部署的场景

### 调用关系图

```
浏览器 POST /auth/register
   └─► AuthService.register
         ├─ Tenant + User 入 PG
         ├─ setImmediate(scheduleProvision(tenantId))
         │     └─► PendingEdgeProvision upsert(status=pending)
         │     └─► attemptOne(tenantId) ─► POST bff-edge/internal/edge/users
         │           ├─ 200 → Tx{ Tenant.edgeUserId, PendingEdgeProvision.status=done }
         │           ├─ 瞬时失败 → status=retrying, nextTryAt=now+2^N sec
         │           └─ 永久失败 → status=failed
         └─ return JWT(edgeUserId=null) ← 立刻返回

后台
   EdgeProvisionCron @Cron(30s)
     └─► retryPending(20) ─► attemptOne(每条 due)…

运营/前端
   GET /edge-provision/me           查我的 Tenant 状态
   GET /admin/edge-provision        看 dashboard
   POST /admin/edge-provision/:id/retry  手动重试
```

---

## 11. Phase 3 Step 4 落地清单(Domains Onboarding,2026-05-24)

### SDK 真实化

- `proto/` 新增 8 个文件(`service_server.proto` 链路依赖)— sync-proto.sh ENTRY_PROTOS 加 `service_server.proto` 重跑
- `src/grpc/services/domains.ts` 新建 `GrpcDomainsService`:
  - `create`  → `ServerService.createBasicHTTPServer(domains[], originAddrs[], enableWebsocket?)` 一次建好 server+web+reverseProxy
  - `listByUser` → `findAllUserServers(userId)`
  - `findById`  → `findEnabledUserServerBasic(serverId)`(NOT_FOUND 返 null)
  - `remove`    → `deleteServer(serverId)`
- `src/grpc/client.ts` 加 `serverStub`(独立 stub,与 `userStub` 共享底层 channel)
- `src/types.ts`:`CreateDomainInput` 改字段:`serverNames: string[]` + `originAddrs: string[]` +
  `clusterId?` + `enableWebsocket?`,与 GoEdge createBasicHTTPServer 字段对齐

### bff-edge 4 endpoints

| 路径 | 守 | 调 SDK |
| --- | --- | --- |
| POST `/internal/edge/domains` | InternalToken | `domains.create` |
| GET `/internal/edge/domains?edgeUserId=N` | InternalToken | `domains.listByUser` |
| GET `/internal/edge/domains/:serverId` | InternalToken | `domains.findById` |
| DELETE `/internal/edge/domains/:serverId` | InternalToken | `domains.remove` |

错误码契约:
- 502 `EDGE_API_NOT_READY` / `EDGE_API_UNREACHABLE`
- 401 `EDGE_API_AUTH_FAILED`
- 409 `EDGE_DOMAIN_CONFLICT`(ALREADY_EXISTS)
- 400 `EDGE_DOMAIN_INVALID`(INVALID_ARGUMENT)
- 404 `EDGE_DOMAIN_NOT_FOUND`(findById)
- 500 `EDGE_API_ERROR`

### saas-svc 新增

**新增 SaasDomain 表**:
```
SaasDomain
  id / tenantId @relation Tenant / domain @unique / edgeDomainId @unique
  cnameTarget @unique(<hex>.aegiscdn.com,EDGE_CNAME_SUFFIX 可配)
  status     pending|dns_pending|active|paused|failed
  sslStatus  none|pending|active|failed   (Step 6+ 才用)
  verificationStatus pending|verified|failed (DNS 检测预留)
  originHost / lastError / lastErrorAt / edgeSyncedAt
  @@index([tenantId]) @@index([status])
```

**DomainsService**(`modules/domains/`):
- `add(tenantId, {domain, originHost?})`:
  - 校验 domain 全局唯一(跨租户)
  - 必须 `Tenant.edgeUserId` 已就绪(否则 400 提示等 provision)
  - 生成 `cnameTarget=<hex>.aegiscdn.com` + 入库 status=pending
  - 调 bff-edge,成功 → status=dns_pending + 写 edgeDomainId
  - 失败 → status=failed + 透传 bff-edge code/message
- `list/getById/getCname/remove/pause/resume`

**用户 REST**(`/api/v1/saas/domains/*`,JwtAuthGuard):
| Method | Path | 用途 |
| --- | --- | --- |
| GET | `/domains` | 列表 |
| POST | `/domains` | 添加(返回完整记录含 cnameTarget) |
| GET | `/domains/:id` | 详情 |
| GET | `/domains/:id/cname` | CNAME 解析指引(独立端点,前端 UI 复用) |
| DELETE | `/domains/:id` | 删除(级联调 bff-edge DELETE) |
| POST | `/domains/:id/pause` | 暂停(本地状态;Step 6+ 才推 GoEdge) |
| POST | `/domains/:id/resume` | 恢复 |

### 状态机

```
[用户 POST]
   ↓
pending ───┬──→ dns_pending ───(后续 DNS 检测/SSL/CC...)──→ active
           │                                                  │
           ├──→ failed (bff-edge/grpc 错)              ┌──[用户 pause]
           │                                          ↓
           └──[原子事务回滚]                        paused ←─[resume]
```

### 完整业务链(用户视角)

```
1. POST /api/v1/saas/auth/register
   → 拿 JWT(edgeUserId=null)
2. 轮询 GET /api/v1/saas/edge-provision/me
   → status=done + edgeUserId 就绪
3. POST /api/v1/saas/domains  {"domain":"example.com","originHost":"origin.foo.com"}
   → 返 {id, cnameTarget:"a1b2c3d4.aegiscdn.com", status:"dns_pending", edgeDomainId}
4. 在自己的 DNS 把 example.com 配 CNAME → a1b2c3d4.aegiscdn.com
5. GoEdge EdgeNode 接到客户请求 → 命中 server → 反代到 origin.foo.com
```

至此 SaaS 第一条业务链路打通(完整链路 Linux E2E 实测仍待统一安排)。

---

## 12. 关联文档

- [[docs/15-goedge-secondary-development-plan.md]] §9 Phase 3 范围定义
- [[docs/17-saas-svc-接口规范.md]] §1.2 bff-edge 职责边界、§4 内部接口契约
- [[docs/18-升级与 rebase 流程.md]] — 上游 proto 变化时 SDK 需要 regen
- Phase 2 总结见 commit 区间 `bfb3966..bae2237`
