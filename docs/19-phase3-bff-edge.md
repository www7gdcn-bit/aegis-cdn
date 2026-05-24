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
| **Step 1** | bff-edge 骨架 + SDK placeholder + 5 个分组 controller 占位 + 文档 | **本步,已完成** |
| Step 2 | SDK 真接 @grpc/grpc-js + admin metadata + UserService/CreateUser 第一个真实方法 | 待启 |
| Step 3 | bff-edge.users.create 真实化 + saas-svc.register 异步触发 + Tenant.edgeUserId 实时写 | 待启 |
| Step 4 | backfill 脚本 + 失败重试/解绑/重绑流程 | 待启 |
| Step 5 | domains.create 真实化(含 quota 前置) | 待启 |
| Step 6 | ssl + acme | 待启 |
| Step 7 | blocks 单向同步链路(saas-svc.addBlock → bff-edge → GoEdge ip_list);
            apps/api 残留 reviewDomain / addBlock 整体下线 | 待启 |
| Step 8 | nodes 只读 + 运营观察前端 | 待启 |

---

## 8. 关联文档

- [[docs/15-goedge-secondary-development-plan.md]] §9 Phase 3 范围定义
- [[docs/17-saas-svc-接口规范.md]] §1.2 bff-edge 职责边界、§4 内部接口契约
- [[docs/18-升级与 rebase 流程.md]] — 上游 proto 变化时 SDK 需要 regen
- Phase 2 总结见 commit 区间 `bfb3966..bae2237`
