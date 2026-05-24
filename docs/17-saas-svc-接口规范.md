# saas-svc / bff-edge / EdgeAPI 接口规范

版本 v0.1(骨架) · 立项日期 2026-05-24 · 关联 [[docs/15-goedge-secondary-development-plan.md]]

> ⚠️ **本文档为 Phase 0 骨架** — 真实接口签名将在 Phase 2(`services/saas-svc/`
> 从 apps/api 拆出)与 Phase 3(`services/bff-edge/` + `packages/edge-api-sdk/`)
> 中按模块定稿。当前先把**服务边界**、**职责划分**、**数据归属**钉死,
> 避免后续把 SaaS 逻辑塞进 bff 或反过来。

---

## 1. 三个服务的职责边界

```
        客户浏览器 / 运营浏览器
                │
       ┌────────▼────────┐
       │   apps/web      │  Next.js,只做渲染与表单
       └────┬──────┬─────┘
            │REST  │REST
   ┌────────▼──┐  ┌▼─────────────────┐
   │ saas-svc  │  │ bff-edge         │
   │ (NestJS)  │  │ (NestJS)         │
   │ 业务规则  │  │ 协议桥           │
   └────┬──────┘  └────┬─────────────┘
        │ Prisma       │ gRPC
   ┌────▼──────┐  ┌────▼─────────────┐
   │PostgreSQL │  │ EdgeAPI (Go)     │
   │(SaaS)     │  │ + EdgeNode 集群  │
   └───────────┘  └────┬─────────────┘
                       │
                  ┌────▼────┐
                  │ MySQL   │
                  │(GoEdge) │
                  └─────────┘
```

### 1.1 saas-svc — 业务规则的家

- **拥有**:用户 / KYC / 套餐 / 订阅 / 订单 / 支付 / 钱包 / 工单 / API Token / 计费策略
- **数据库**:PostgreSQL(沿用现有 Prisma schema)
- **对外**:`/api/v1/saas/*` REST(JSON)
- **不做**:不直接调 EdgeAPI gRPC;不直接操作 GoEdge MySQL

### 1.2 bff-edge — 唯一允许调 EdgeAPI 的服务

- **拥有**:EdgeAPI gRPC 客户端;`packages/edge-api-sdk` 的服务端实现
- **数据库**:无自有库;读写都过 EdgeAPI
- **对外**:`/api/v1/edge/*` REST(JSON)— 给 apps/web 用
- **核心职责**:
  1. 协议翻译(gRPC ↔ REST/JSON)
  2. 字段重塑(GoEdge 历史命名 → aegis 现代命名)
  3. 调用前权限校验(向 saas-svc 询问"此用户的套餐是否允许此操作")
- **不做**:不存业务状态;不做计费判断(委托 saas-svc)

### 1.3 EdgeAPI / EdgeNode — 数据面控制核心

- **拥有**:CDN 节点、HTTP 服务、SSL 证书、ACME、DNS、WAF 规则、CC 配置
- **数据库**:MySQL(GoEdge 原设计,不动)
- **对外**:gRPC(只对 bff-edge 暴露,**不直接暴露给浏览器**)
- **扩展方式**:通过 [[docs/16-overlay-build-tag-规范.md]] 的 `//go:build aegis` overlay

---

## 2. 三组关键边界

### 2.1 用户身份边界

| 维度 | 谁的真源 | 关联方式 |
| --- | --- | --- |
| User ID(SaaS 侧) | saas-svc PostgreSQL `User.id` | — |
| GoEdge user_id(数据面) | EdgeAPI MySQL `users.id` | saas-svc 在创建 SaaS 用户时,**同步** 调 bff-edge 创建 GoEdge user,把返回的 GoEdge user_id 存回 PG `User.edgeUserId` |
| 鉴权 token | saas-svc 签 JWT,bff-edge 验证(共享 secret) | bff-edge 从 JWT 解出 SaaS user_id → 查 edgeUserId 后再调 gRPC |

### 2.2 计费 / 配额边界

- **门控判断**(能不能加域名 / 能不能开 WAF)= **saas-svc 决定**
- **能力执行**(实际启用 WAF 规则)= **bff-edge → EdgeAPI 执行**
- 调用链:
  1. 浏览器 POST `bff-edge/edge/domains`
  2. bff-edge 先 POST `saas-svc/internal/quota/check`(内部接口,共享密钥)
  3. saas-svc 返回 `allowed: true/false + reason`
  4. allowed → bff-edge 调 EdgeAPI gRPC 真实创建;否则 402

→ **绝不**把套餐规则写进 bff-edge 或 EdgeAPI overlay,套餐规则只能改一个地方:saas-svc。

### 2.3 攻击日志边界

- **采集**:GoEdge EdgeNode 自带 `HTTPAccessLogQueue` → 写 EdgeAPI MySQL(短期) + 推 ClickHouse(长期)
- **展示**:`services/analytics-svc/` 直接读 ClickHouse,**绕过** EdgeAPI 与 saas-svc
- **聚合**:analytics-svc 按租户 id 过滤,租户 id 必须从 JWT 解出后传入,不能信浏览器
- analytics-svc 是只读服务,**不写**任何库

---

## 3. 路由命名公约(草案)

| 前缀 | 服务 | 用途 |
| --- | --- | --- |
| `/api/v1/saas/auth/*` | saas-svc | 登录 / 注册 / Token |
| `/api/v1/saas/billing/*` | saas-svc | 套餐 / 订阅 / 订单 / 支付 |
| `/api/v1/saas/kyc/*` | saas-svc | 实名 |
| `/api/v1/saas/tickets/*` | saas-svc | 工单 |
| `/api/v1/edge/domains/*` | bff-edge | 域名接入 / SSL / 回源 |
| `/api/v1/edge/protection/*` | bff-edge | WAF / CC / ACL |
| `/api/v1/edge/nodes/*` | bff-edge | 节点状态(只读) |
| `/api/v1/edge/analytics/*` | analytics-svc | 攻击数据可视化(Phase 8) |
| `/internal/*` | 服务间互调,**不对外暴露**;入口靠源 IP + 共享密钥双重校验 |

---

## 4. 内部接口契约(saas-svc ↔ bff-edge)

> Phase 2/3 详细定义。先列出**必须存在的**契约名:

- `POST /internal/quota/check` — bff-edge 询问"用户 X 能否做动作 Y"
- `POST /internal/user/provision` — saas-svc 通知 bff-edge "新用户已注册,请在 EdgeAPI 建对应 user"
- `POST /internal/user/disable` — saas-svc 通知 bff-edge "用户欠费/封禁,请暂停其所有域名"
- `GET /internal/edge-user/:saasUserId` — saas-svc 反查 GoEdge user_id

→ 共享密钥用环境变量 `AEGIS_INTERNAL_SECRET`,所有 `/internal/*` 请求带
`X-Aegis-Internal-Token` 头校验。

---

## 5. SDK:`packages/edge-api-sdk`

Phase 3 产物。封装 EdgeAPI gRPC client 为 TypeScript,供 bff-edge 调用。

**只在 bff-edge 内部使用**,不发布到 npm,不给前端用(前端永远走 REST)。

---

## 6. 待定事项

- [ ] saas-svc 与 bff-edge 是否共部署在一个 Node 进程(monorepo workspace)还是分进程
- [ ] gRPC client 用 `@grpc/grpc-js` 还是 `nice-grpc`
- [ ] 是否给 internal 接口加 mTLS(同 K8s 集群内可能不必)
- [ ] analytics-svc 用 NestJS 还是 Go(高吞吐场景 Go 更省内存)
- [ ] 现 apps/api 的 auth/domains/protection/stats 模块在 Phase 2 是**全部废弃**(改调 bff-edge)
      还是**部分保留**(auth 留在 saas-svc)— 倾向后者

---

## 7. 关联

- [[docs/15-goedge-secondary-development-plan.md]] §3 架构图、§5.3 新增服务清单
- [[docs/16-overlay-build-tag-规范.md]] — overlay 是 EdgeAPI 一侧的扩展,本文是服务边界
- [[docs/18-升级与 rebase 流程.md]] — GoEdge 上游 proto 变化时如何同步 SDK
