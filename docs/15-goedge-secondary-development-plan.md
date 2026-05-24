# GoEdge 二开实施方案

版本 v1.0 · 立项日期 2026-05-24 · 本文档是 aegis-cdn v2 北极星

> **本文取代** [[docs/13-平台化架构重定位.md]] 与 [[docs/14-goedge-借鉴分析.md]] §8 §10
> 关于路线方向的部分。docs/01-13 标记为 **v1 自研期归档**,作为历史决策参考保留。

---

## 0. 一句话定位

**aegis-cdn v2 = 在 GoEdge 开源版(BSD-3-Clause)基础上做商业化增强的高防 CDN SaaS 平台**。

- GoEdge = 底座(Base Platform)
- aegis-cdn 增量 = CC 增强、WAF 增强(Coraza 旁路)、SaaS 业务层、现代化前端、攻击日志中心
- 不重造已有轮子;不从零做 CDN

---

## 1. 关键事实(决策依据)

| 项 | 内容 |
| --- | --- |
| GoEdge 仓库 | `TeaOSLab/EdgeAPI` `TeaOSLab/EdgeNode` `TeaOSLab/EdgeCommon` `TeaOSLab/EdgeAdmin` |
| LICENSE | **BSD-3-Clause**(Copyright (c) 2020, LiuXiangChao);允许商业闭源使用 |
| 扩展点机制 | Go build tag — 社区版 `//go:build !plus` / 商业版 `//go:build plus`;**我们用 `//go:build aegis`** |
| 社区版能力 | 反代/缓存/TLS/WAF/CC/SSL/ACME/DNS/节点管理/IP库 **全部完整** |
| 社区版缺口 | 计费/套餐/账户/订单 service 均为 stub(空实现);工单系统不存在 |
| 商业版(Plus) | 闭源,售卖,实现 plus build tag 文件;**aegis 不依赖 Plus,自己实现 aegis tag** |

---

## 2. 七项关键决策(已拍板)

| # | 项 | 决策 | 备注 |
| --- | --- | --- | --- |
| D1 | GoEdge 进仓方式 | **git submodule** | 保留 upstream 官方 git 历史,方便 sync |
| D2 | 现 `packages/shared` 半成品 | **撤回** | 已执行(Phase 0) |
| D3 | 现 `apps/api` 处置 | **拆出 SaaS 部分到 `services/saas-svc`**,其余删除 | 保留 payment/compliance/billing 模块(Phase 2) |
| D4 | 现 `edge/` (OpenResty Lua) | **归档到 `legacy/edge-openresty/`** | 已执行(Phase 0) |
| D5 | GoEdge 商业版授权 | **暂不购买** | 自实现 `aegis` build tag 替代 Plus 功能 |
| D6 | 控制台技术栈 | **统一用 `apps/web` (Next.js)**,弃 EdgeAdmin | 现代化前端,通过 bff-edge 调 EdgeAPI gRPC |
| D7 | docs/14 修正方式 | **就地改 LICENSE 错误 + 顶部加 deprecation notice** | 已执行(Phase 0) |

### 2.1 Submodule 锁定记录(Phase 1 Step 1,2026-05-24)

| submodule | 路径 | 锁定 tag | commit hash |
| --- | --- | --- | --- |
| `TeaOSLab/EdgeCommon` | `upstream/EdgeCommon` | **v1.3.9.1** | `8612bdf8558f561eb7c11ea616744357ad2a1a78` |
| `TeaOSLab/EdgeAPI`    | `upstream/EdgeAPI`    | **v1.3.9.1** | `f61dbb42c5f59996e7a5edd54acbfcbe91de3afa` |
| `TeaOSLab/EdgeNode`   | `upstream/EdgeNode`   | **v1.3.9**   | `b0d1f2c8ea268dacc812f88cdb5acafd5af1414d` |

> 三仓 go.mod 都用 `replace github.com/TeaOSLab/EdgeCommon => ../EdgeCommon`,
> 当前 `upstream/{EdgeCommon,EdgeAPI,EdgeNode}` 同级布局正好匹配 upstream 假设。
> EdgeNode 没有 v1.3.9.1 补丁号(上游未发),其余两仓取各自最新稳定 tag。

**本机 Phase 1 Step 1 编译验证(Windows + go1.26.3)**:

| 仓库 | 验证方式 | 结果 |
| --- | --- | --- |
| EdgeAPI | `GOOS=linux GOARCH=amd64 go build ./...` | ✅ 通过 — module 解析、依赖下载、replace 全部正常 |
| EdgeAPI | 本机 Windows `go build ./...` | ❌ `internal/db/utils/disk.go` 用 Unix-only `unix.Statfs`,缺平台 build tag(上游小瑕疵,不影响 Linux 生产) |
| EdgeNode | cross-compile linux/amd64 (含 cgo) | ❌ 需要 libinjection + libwebp Linux C 工具链,Windows 无法 cross-compile cgo |
| EdgeNode | cross-compile linux/amd64 (`CGO_ENABLED=0`) | ❌ `injectionutils` 与 `gowebp` 设计依赖 cgo,关 cgo 无法替代 |
| EdgeNode | Linux 原生编译 | ⏳ 待 Linux/Docker 环境验证(GoEdge 上游 CI 已保证) |

→ **结论**:submodule 集成正确(go.mod 解析、replace 路径、依赖下载、跨仓引用全部通);
EdgeNode 完整可编需要 Linux + libinjection-dev + libwebp-dev,生产环境天然满足。
**Windows 本机不是 EdgeNode 的目标平台**(边缘节点注定 Linux 部署)。

---

## 3. 三层架构

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    客户浏览器 / 运营浏览器                                  │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │ HTTPS
                ┌────────────────▼────────────────┐
                │     apps/web (Next.js 三端)     │  ← 我们(保留)
                │  官网 · 客户控制台 · 管理后台    │
                └────────┬───────────────┬────────┘
                         │ REST          │ REST
              ┌──────────▼────┐  ┌───────▼──────────────┐
              │  saas-svc     │  │  bff-edge            │
              │  (NestJS)     │  │  (NestJS)            │  ← 我们(新)
              │               │  │                      │
              │  - 用户 / KYC │  │  EdgeAPI gRPC 桥     │
              │  - 套餐 / 订阅│  │  - 域名 / SSL        │
              │  - 支付适配器 │  │  - 防护策略 (CC/WAF) │
              │  - 工单       │  │  - 节点              │
              │  - 钱包       │  │  - 缓存              │
              │  - API Token  │  └──────┬───────────────┘
              └────────┬──────┘         │ gRPC
                       │                ▼
                ┌──────▼────┐  ┌──────────────────────────────┐
                │PostgreSQL │  │ GoEdge 集群                  │
                │(SaaS 业务)│  │                              │
                └───────────┘  │ ┌─────────┐ ┌──────────────┐│
                               │ │EdgeAPI  │ │N × EdgeNode  ││  ← upstream
                               │ │  +      │ │  + overlays/ ││    (build tag aegis)
                               │ │overlays/│ │              ││
                               │ └────┬────┘ └──────────────┘│
                               │      ▼                       │
                               │  ┌─────────┐                 │
                               │  │ MySQL   │  ┌────────────┐ │
                               │  │ (GoEdge)│  │ ClickHouse │ │  ← 我们(新)
                               │  └─────────┘  │(攻击日志)  │ │
                               │               └─────▲──────┘ │
                               └─────────────────────┼────────┘
                                                     │
                                     ┌───────────────┴──┐
                                     │ analytics-svc    │  ← 我们(新)
                                     │ (Node 或 Go)     │
                                     └──────────────────┘
```

**两套数据库**:GoEdge 用 MySQL(原设计),SaaS 用 PostgreSQL(我们已有)。通过 `user_id` 关联,**不共享表**。

---

## 4. 仓库目录结构

```
aegis-cdn/                                  # 我们的仓库
│
├── upstream/                               # ★ GoEdge 上游(git submodule),只读不改
│   ├── EdgeAPI/                            #   submodule:TeaOSLab/EdgeAPI
│   ├── EdgeNode/                           #   submodule:TeaOSLab/EdgeNode
│   ├── EdgeCommon/                         #   submodule:TeaOSLab/EdgeCommon
│   └── (EdgeAdmin/)                        #   暂不引,前端用 apps/web
│
├── overlays/                               # ★ 我们对 GoEdge 的 build tag aegis 注入
│   ├── EdgeAPI/                            #   镜像 upstream/EdgeAPI 同结构
│   │   └── internal/
│   │       ├── const/const_aegis.go        #   //go:build aegis
│   │       ├── rpc/services/
│   │       │   ├── service_plan_aegis.go
│   │       │   ├── service_user_plan_aegis.go
│   │       │   └── service_protection_template_aegis.go
│   │       └── db/models/
│   │           └── user_account_aegis.go
│   ├── EdgeNode/
│   │   └── internal/
│   │       └── waf/
│   │           ├── checkpoints/cc_global_reputation_aegis.go
│   │           └── coraza_layer_aegis.go
│   └── patches/                            #   必要时的 patch(尽量不用)
│
├── services/                               # ★ 独立旁路服务(我们的 SaaS 大本营)
│   ├── saas-svc/                           #   NestJS,从 apps/api 拆出
│   ├── bff-edge/                           #   NestJS,EdgeAPI gRPC ↔ REST 桥
│   └── analytics-svc/                      #   攻击日志中心 + ClickHouse
│
├── apps/                                   # ★ 现代化前端(保留)
│   └── web/                                #   Next.js 14 三端
│
├── packages/                               # ★ 共享 SDK
│   └── edge-api-sdk/                       #   EdgeAPI gRPC client 的 TS 封装(Phase 3)
│
├── deploy/                                 # ★ 编排
│   ├── docker-compose.dev.yml              #   GoEdge + 我们服务一键起(Phase 1 新写)
│   └── docker-compose.prod.yml
│
├── scripts/                                # ★ 构建/同步脚本
│   ├── build-edgeapi.sh                    #   overlays → upstream + go build -tags aegis
│   ├── build-edgenode.sh
│   └── sync-upstream.sh
│
├── legacy/                                 # ★ v1 自研期归档(已执行)
│   └── edge-openresty/                     #   原 edge/ + docker-compose.yml
│
└── docs/                                   # 设计文档
    ├── 00-README.md                        #   总索引 + v1/v2 划分
    ├── 01-13/                              #   v1 自研期归档(原地保留)
    ├── 14-...                              #   GoEdge 借鉴分析(已加 deprecation notice)
    ├── 15-...                              #   本文件(v2 北极星)
    ├── 16-overlay-build-tag-规范.md        #   二开规范
    ├── 17-saas-svc-接口规范.md             #   SaaS 服务边界
    └── 18-升级与 rebase 流程.md            #   GoEdge 上游同步
```

---

## 5. 哪些 GoEdge 模块直接复用 / 扩展 / 新增 / 不改

### 5.1 直接复用(零或极小改动)

| GoEdge 模块 | 用途 |
| --- | --- |
| `EdgeNode/internal/waf/` | WAF 引擎主体(14 action + 30 checkpoint + libinjection) |
| `EdgeNode/internal/caches/` | 本地多后端缓存(memory/file/sqlite/kv) |
| `EdgeNode/internal/firewalls/` | 内核防火墙抽象(firewalld/nftables/iptables) |
| `EdgeNode/internal/iplibrary/` | IP 库 + 封禁多通道执行器 |
| `EdgeNode/internal/nodes/listener_*` | 自研反代核心 |
| `EdgeNode/internal/stats/` | 节点本地预聚合 |
| `EdgeAPI/internal/db/models/{node,server,http_*,ssl_*,acme,dns}` | 节点/服务/HTTP配置/SSL/ACME/DNS 数据模型 |
| `EdgeAPI/internal/rpc/services/service_{node,http_*,ssl_*,dns_*}` | 对应 RPC service |
| `EdgeAPI/internal/acme/` | ACME 客户端(Let's Encrypt 等) |
| `EdgeAPI/internal/dnsclients/` | DNS 厂商集成 |
| `EdgeCommon` pb/configs | 配置 struct 共享包 |

### 5.2 扩展(用 `//go:build aegis` 注入新实现)

| GoEdge 文件 | 扩展产物 | 用途 |
| --- | --- | --- |
| `internal/const/const_community.go` (!plus) | `const_aegis.go` (aegis) | 改 DefaultMaxNodes 等限制 |
| `service_plan_community.go` (stub) | `service_plan_aegis.go` | 实现完整套餐 CRUD |
| `service_user_plan_community.go` (stub) | `service_user_plan_aegis.go` | 实现用户订阅 |
| `service_server_community.go` | `service_server_aegis.go` | 加套餐能力门控 hook |
| `db/models/user_account_*` (部分 stub) | `user_account_aegis.go` | 充值 / 扣费 / 流水 |
| `EdgeNode/internal/waf/checkpoints/cc.go` | `cc_global_reputation_aegis.go` | 跨节点信誉(Redis 全局) |
| `EdgeNode/internal/waf/` 主流程 | `coraza_layer_aegis.go` | Coraza 旁路层(OWASP CRS) |

### 5.3 新增(完全独立的旁路服务)

| 模块 | 形态 | 用途 |
| --- | --- | --- |
| `services/saas-svc/` | NestJS + PostgreSQL | 用户 / KYC / 套餐 / 支付 / 工单 / 钱包 / API Token |
| `services/bff-edge/` | NestJS | EdgeAPI gRPC → REST 桥,给前端用 |
| `services/analytics-svc/` | NestJS 或 Go + ClickHouse | 攻击日志中心(Top IP/URI/ASN/国家/挑战成功率) |
| `apps/web/` (保留) | Next.js 14 | 现代化三端(官网/客户控制台/管理后台) |
| `packages/edge-api-sdk/` | TypeScript | EdgeAPI gRPC client 封装 |

### 5.4 不建议硬改(保留升级能力)

| 模块 | 不动原因 |
| --- | --- |
| `EdgeNode/internal/nodes/listener_*` | 反代核心,改 = 维护 fork 分支 = 升级地狱 |
| `EdgeNode/internal/waf/` 引擎核心(rule/action/checkpoint 主流程) | 同上;增强通过加新 checkpoint/action 实现 |
| `EdgeAPI/internal/rpc/` 主流程(gRPC server 启动/路由) | 同上 |
| `EdgeCommon` proto 既有定义 | 改 proto = 控制面+边缘全要 rebuild;只能加新 service |

**铁律**:对 upstream 的修改必须 **patch 化、可追踪、可在 sync upstream 时 rebase**。

---

## 6. CC 防护增强 — 两层并行

### 6.1 数据面(EdgeNode)

```
overlays/EdgeNode/internal/waf/
├── checkpoints/
│   └── cc_global_reputation_aegis.go      ← ${cc.global_score} 读 Redis 全局信誉(跨节点)
│   └── cc_asn_aegis.go                    ← ${cc.asn_requests:N} 按 ASN 维度限频
└── action_under_attack_mode_aegis.go      ← 一键全域名挑战
```

### 6.2 控制面(EdgeAPI)— "防护模板"

```
overlays/EdgeAPI/internal/rpc/services/
└── service_protection_template_aegis.go
```

提供:轻度 / 中度 / 重度 / Under Attack 四个等级模板,客户一键切换 →
映射到 GoEdge 既有的 firewall_policy / firewall_rule_group / cc 阈值。
套餐能力门控:Starter 只能用"轻度",Enterprise 能用全部。

---

## 7. WAF 增强 — Coraza 旁路(不替换 GoEdge WAF)

```
请求 ─▶ EdgeNode listener ─▶ [GoEdge WAF(原)] ─▶ [Coraza/CRS(aegis 补充层)] ─▶ 回源
                                  │                        │
                                  └─ block/allow/...       └─ block/allow(只看 CRS 规则)
```

理由:GoEdge WAF 自研引擎已成熟(40 operator + 30 checkpoint + libinjection),
替换它是 1-2 个月工作 + 升级地狱。**Coraza 只引入 GoEdge 缺的:OWASP CRS 4000+ 现成规则**。

实现方式可选:
- A. `coraza_layer_aegis.go`:在 WAF.MatchRequest 流程末尾(原 WAF allow 的请求)再过 Coraza
- B. `action_coraza_check_aegis.go`:把 Coraza 当 action,用户在 GoEdge 规则里显式调用

---

## 8. 商业 SaaS 层独立旁路

理由(详见 §3 架构图):
1. SaaS 业务与 CDN 数据面**生命周期不同**,SaaS 改动不应触发 EdgeAPI/EdgeNode 重启
2. SaaS 用 NestJS(已有,做得好)比硬塞进 Go 栈成本低
3. blast radius 隔离 — SaaS 故障不影响 CDN 可用性
4. 独立扩容(支付高峰不需要扩边缘节点)

数据隔离:GoEdge MySQL(原设计) vs SaaS PostgreSQL(我们),通过 `user_id` 关联。

---

## 9. Phase 路线图

| Phase | 范围 | 工作量 | 状态 |
| --- | --- | --- | --- |
| **0** | 决策落地:撤回 packages/shared、归档 edge/、修正 docs/14、新建 docs/15-18 骨架 | 1 天 | **进行中** |
| **1** | 工程脚手架:submodule 引 GoEdge 三仓;overlays/ 空骨架;`deploy/docker-compose.dev.yml` 起 GoEdge dev 环境 | 1-2 天 | 待启 |
| **2** | `services/saas-svc/` 重构(从 apps/api 拆出 payment/compliance/billing) | 2-3 天 | 待启 |
| **3** | `services/bff-edge/` 桥 + `packages/edge-api-sdk` 给前端用 | 2-3 天 | 待启 |
| **4** | `apps/web` 后端从自家 NestJS 改为调 `bff-edge` | 1-2 天 | 待启 |
| **5** | overlays 第一版:`service_plan_aegis` + `service_user_plan_aegis` | 2-3 天 | 待启 |
| **6** | CC 增强:`protection_template_aegis` + `cc_global_reputation` checkpoint | 3-5 天 | 待启 |
| **7** | WAF 增强:Coraza 旁路 + OWASP CRS 接入 | 3-5 天 | 待启 |
| **8** | `services/analytics-svc/` + ClickHouse 攻击日志中心 | 3-5 天 | 待启 |
| **9** | SaaS 增量模块:工单、钱包、API Token、运营报表 | 3-5 天 | 待启 |

---

## 10. 关联文档

- [[docs/00-README.md]] — 总索引 + v1/v2 划分(待建)
- [[docs/14-goedge-借鉴分析.md]] — GoEdge 架构观察(§1-7 仍有效,§8/10 已作废)
- [[docs/16-overlay-build-tag-规范.md]] — 二开 build tag 命名 + 构建流程(骨架)
- [[docs/17-saas-svc-接口规范.md]] — saas-svc / bff-edge / EdgeAPI 边界(骨架)
- [[docs/18-升级与 rebase 流程.md]] — GoEdge 上游同步流程(骨架)
- [[legacy/edge-openresty/DEPRECATED.md]] — v1 自研期归档说明
