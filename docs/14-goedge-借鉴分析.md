# GoEdge 架构借鉴分析

版本 v1.0 · 归档日期 2026-05-24 · 仅参考,不修改本项目代码

> 本文是对 GoEdge 开源 CDN/WAF 平台的源码架构观察笔记,
> 用于对比 aegis-cdn 的设计、识别可借鉴的部分、识别不必照搬的部分。
> 阅读对象:aegis-cdn 后续设计决策者。
>
> **重要边界声明**:
> - 本文档**只做架构分析**,不直接搬运 GoEdge 任何代码片段进 aegis-cdn。
> - GoEdge 是 AGPL/商业双授权,直接复用代码有合规风险;**借鉴仅限设计思想**。
> - aegis-cdn 已在 [[docs/13]] 确定"成熟件做底层 + 我们做 SaaS"路线,
>   与 GoEdge"全自研"路线**不同**;本文不动摇 [[docs/13]] 决策,只是吸收可用思想。

---

## 1. 源码分析范围

| 项 | 内容 |
| --- | --- |
| 来源包 | `goedge-src.zip`(73MB,5104 文件,含 .git) |
| 解压后保留 | `EdgeAPI/` + `EdgeNode/`(已剔除 `.git/` 与 `EdgeAdmin/`,共 17MB / 1883 文件) |
| 解压位置(外部) | `C:/Users/ROG/goedge-src/`(与 aegis-cdn 同级,**不入本仓库**) |
| 语言/栈 | 纯 Go;自研 ORM(TeaGo);MySQL;gRPC 双向 stream |
| 分析方式 | 广度优先,扫核心子系统目录结构 + 采样关键文件 + 阅读接口定义 |
| 未深入 | EdgeAdmin(前端管理后台)、计费结算细节、DNS 厂商适配实现 |

---

## 2. EdgeNode / EdgeAPI 分工

```
┌─────────────────────────── 控制面 EdgeAPI(Go)──────────────────────────┐
│                                                                         │
│  RPC 服务 116 个(rpc/services/*)  │  数据模型 ~150 张表(db/models/*)  │
│  - service_node / node_cluster /  │  - 节点域:node/cluster/group/...  │
│    node_grant / node_task / ...   │  - 服务域:server/server_bill/...  │
│  - service_http_firewall_policy / │  - HTTP 配置域:web/location/cache/│
│    rule_group / rule_set          │    firewall/header/rewrite/auth.. │
│  - service_ssl_cert / acme_*      │  - SSL 域:ssl_cert/policy + acme  │
│  - service_user / plan / ...      │  - 计费:plan/user_bill/server_bill│
│                                   │    traffic_package/user_account   │
│  installers/(节点远程 SSH 安装)   │  - DNS 域:ns_cluster/ns_node/dns  │
│  acme/(ACME 客户端实现)           │                                   │
└─────────────────────────────────────────────────────────────────────────┘
                              ▲
                  gRPC 双向 stream + 普通 RPC
                              ▼
┌─────────────────────────── 数据面 EdgeNode(Go)──────────────────────────┐
│                                                                         │
│  nodes/(节点主进程,99 文件)                                            │
│  - node.go(主循环 + 配置版本对比 + 增量任务执行)                       │
│  - api_stream.go(订阅控制面推送)                                       │
│  - node_tasks.go(任务字典 dispatch:ipItemChanged/configChanged/...)    │
│  - listener_http/tcp/udp(自研反代/连接管理)                            │
│  - http_access_log_queue(本地缓冲日志,1s 批量上报)                     │
│  - task_ocsp_update(周期更新 OCSP 装订)                                │
│                                                                         │
│  waf/(自研 WAF 引擎,56 文件)                                           │
│  caches/(本地缓存 多后端:memory/file/sqlite/kv)                        │
│  firewalls/(内核防火墙抽象:firewalld/nftables/iptables/mock)           │
│  iplibrary/(IP 库 + 封禁多通道执行器)                                  │
│  stats/(节点本地预聚合 + 周期批量上报)                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

**对比 aegis-cdn**(参考 [[docs/13]] 当前形态):

| 层 | GoEdge | aegis-cdn |
| --- | --- | --- |
| 控制面 | EdgeAPI(Go + 自研 ORM + MySQL) | apps/api(NestJS + Prisma + PostgreSQL) |
| 控制台 | EdgeAdmin(Go 渲染 HTML 模板) | apps/web(Next.js 14 + 三端 route group) |
| 数据面 | EdgeNode(纯 Go 自研反代) | OpenResty(成熟件) + Lua 防护编排 + Go agent |
| 共享契约 | EdgeCommon Go 包(struct 共用) | Redis JSON(无强 schema) |
| 节点通信 | gRPC 双向 stream | Redis pub/sub + agent 拉 |

---

## 3. 节点通信机制

### 3.1 节点本地配置极简

`api_node.yaml`(EdgeNode 本地配置)**只有 4 个字段**:

```yaml
rpc.endpoints: [https://api.example.com:8080]
rpc.disableUpdate: false
nodeId: <node-id>
secret: <node-secret>
```

其余所有配置(域名/WAF 规则/缓存策略/SSL/...)**全部从控制面拉**,
节点本地无任何"业务态"配置。运维只需把这一份 yaml 发到 VPS。

### 3.2 双向 stream + 任务版本化

```
                ┌─────────────────────────────────────────┐
节点启动        │ gRPC.NodeService.NodeStream(双向流)    │
   │            │ Recv loop:                              │
   ▼            │   - ConnectedAPINode                    │
连接 API ──────▶│   - WriteCache / ReadCache / CleanCache │
   │            │   - NewNodeTask                         │
   │            │   - CheckSystemdService                 │
   │            │   - CheckLocalFirewall                  │
   │            │   - ... (20+ 种消息码)                  │
   │            └─────────────────────────────────────────┘
   │
   ▼
loopTasks 循环 ──▶ FindNodeTasks(lastVersion) ──▶ 拉到增量任务列表
   │                                                  │
   │                                                  ▼
   │                                          按 task.Type 分发执行:
   │                                          - ipItemChanged
   │                                          - configChanged
   │                                          - nodeVersionChanged
   │                                          - scriptsChanged
   │                                          - nodeLevelChanged ...
   │                                                  │
   │                                                  ▼
   └──── finishTask(id, version, err) ◀──────── 回报结果(失败可重试)
```

**关键性质**:
1. 节点掉线重连仍能从上次 version 拉到中间错过的全部任务 —— 无丢失。
2. 任务有类型字典,节点本地按类型精确 dispatch —— 不需要"全量 reload"。
3. 双向 stream 用于**实时性高**事件(缓存清理);任务列表用于**可靠性高**变更(配置/规则)。
   **两条通道并存,各司其职**。

### 3.3 对 aegis-cdn 的对比

| | GoEdge | aegis-cdn 当前 |
| --- | --- | --- |
| 节点配置漂移防护 | 节点几乎无本地业务态,从源头杜绝 | Redis key 是唯一状态,无 yaml |
| 实时通知 | gRPC stream | Redis pub/sub |
| 可靠下发 | 任务表 + 版本号 + 增量拉取 + 重试 | Redis key 覆盖,**错过即丢** |
| 节点上报版本 | 有(节点回报已应用 version) | 无 |
| 跨节点一致性 | 任务表保证最终一致 | 依赖 Redis 一致性 |

---

## 4. 配置下发机制

### 4.1 共享 schema 包(EdgeCommon)

GoEdge 把所有跨进程边界传递的配置 struct 放在 `EdgeCommon` 包:

- `nodeconfigs.NodeConfig`
- `serverconfigs.ServerConfig` / `HTTPCachePolicy`
- `firewallconfigs.HTTPFirewallPolicy` / `FirewallActionConfig`
- `ddosconfigs.*`

控制面写、边缘读,**同一份 Go struct 定义**。
彻底消除"控制面编出的 JSON 边缘解析不了"的协议漂移。

### 4.2 配置版本化

每个配置对象有 `Version int64`。节点本地缓存 `lastAPINodeVersion` /
`lastUpdatingServerListId` 等多个 version 指针,定期与控制面对比,
**只拉变化的部分**(server config 按 serverId 增量,不全量 dump)。

### 4.3 节点本地预编译

`WAF.Init()` 在节点收到 yaml 配置后:
- 把 `${arg.name}` 等 checkpoint 字符串解析为 `CheckpointInterface` 实例 map
- 把 regex 字符串编译为 `*re.Regexp`
- 把 IP 字符串解析为 `net.IP` / `IPRangeList`
- 把 action 配置注入对应 Go 类型(BlockAction/CaptchaAction/...)

**热路径只查 map,不做字符串解析** —— 性能根基之一。

---

## 5. WAF / CC 防护设计

### 5.1 WAF 4 层结构

```
WAF (Inbound / Outbound 两组)
└── RuleGroup
    └── RuleSet (出口配 Action,如 block/captcha)
        └── Rule
            ├── Param:     ${arg.name} / ${args} / ${cookie.x} / ${header.x}
            │              / ${host} / ${geo.country} / ${cname} / ${isp}
            │              / ${cc.requests:60s} / ${json_arg.x} ...
            │              (30+ checkpoint;支持拼接如 ${arg.first}${arg.last})
            ├── Operator:  gt / eq / match / wildcard match / contains
            │              / contains any / contains sql injection
            │              / contains xss / in ip list / ip mod / ip range
            │              / version range / has key ...  (40+ operator)
            └── Value
```

### 5.2 14 种 Action

| Action | 含义 |
| --- | --- |
| `block` | 拦截 |
| `allow` | 放行 |
| `log` | 放行但记录 |
| `captcha` | 显示图形验证码 |
| `js_cookie` | JS 计算 cookie 后放行 |
| `notify` | 触发告警(给运营) |
| `get_302` / `post_307` | GET/POST 重定向认证 |
| `record_ip` | 记录 IP 到列表 |
| `tag` | 给请求打标签(供后续规则识别) |
| `page` | 显示自定义页面 |
| `redirect` | 跳转到指定 URL |
| `go_group` / `go_set` | **规则跳转**(小型 DSL,跳到指定 group/set) |

### 5.3 SQLi/XSS 检测

直接 cgo 集成 **libinjection**(NickGalbreath 工业级 C 库):
- `injectionutils/libinjection_sqli.c`
- `injectionutils/libinjection_xss.c`
- 用 `RuleOperatorContainsSQLInjection` / `RuleOperatorContainsXSS` 暴露给规则

### 5.4 CC 防护 = WAF 的特例

GoEdge **没有独立 CC 模块**。把"过去 N 秒该 IP/UA/Cookie 请求数"
作为 WAF checkpoint `${cc.requests:60s}` 暴露,用户在 WAF 写规则:

```
${cc.requests:60s}  gt  100  →  captcha
```

CC 统计在节点本地内存(fasttime + 计数),**不打 Redis**。
跨节点信誉通过周期上报实现最终一致。

### 5.5 IP 列表三层

- **allow list**(白名单,绕过 WAF)
- **deny list**(黑名单,直接 block)
- **grey list**(灰名单,加压风控)

---

## 6. SSL 证书管理

### 6.1 ACME 协议自研实现

`EdgeAPI/internal/acme/` 自研 ACME 客户端:

| 文件 | 职责 |
| --- | --- |
| `account.go` | ACME 账户管理 |
| `user.go` | ACME 用户(私钥) |
| `key.go` | 密钥生成 |
| `request.go` | ACME 协议请求封装 |
| `task.go` | 证书申请/续期任务 |
| `auth_callback.go` | 域名验证回调 |
| `http_provider.go` | HTTP-01 challenge |
| `dns_provider.go` | DNS-01 challenge(配合 dnsclients/ 多家 DNS 厂商) |
| `providers.go` | CA 提供商抽象(Let's Encrypt / ZeroSSL / ...) |

### 6.2 数据库设计

| 表 | 用途 |
| --- | --- |
| `ssl_cert` | 证书本体(PEM/Key 加密存储) |
| `ssl_cert_group` | 证书分组 |
| `ssl_policy` | TLS 策略(算法套件/最低 TLS 版本) |
| `acme_user` | ACME 用户私钥 |
| `acme_provider_account` | 不同 CA 的账户 |
| `acme_task` / `acme_task_log` | 申请/续期任务 + 日志 |
| `acme_authentication` | 域名验证记录 |

### 6.3 边缘节点 OCSP Stapling

EdgeNode 有 `nodes/task_ocsp_update.go`:周期(默认 1h)从 CA 拉
OCSP response 并装订到 TLS 握手 —— 客户端 TLS 验证不再每次回 CA,
**握手性能 + 隐私双赢**。配置版本号控制下发(`OCSPVersion`)。

### 6.4 对 aegis-cdn 的对比

| | GoEdge | aegis-cdn 当前 |
| --- | --- | --- |
| ACME 实现 | 自研 + 多 CA 抽象 | 未实现(docs 规划用 acme.sh/lego) |
| DNS-01 | 集成多 DNS 厂商 API | 未实现 |
| OCSP Stapling | 自动更新 | 未实现 |
| 多 SSL 策略 | 有(TLS 版本/算法套件分组) | 未实现 |

---

## 7. 日志与统计链路

### 7.1 节点本地日志缓冲

`HTTPAccessLogQueue`(EdgeNode):
- channel 缓冲 `2_000 * (1 + SystemMemoryGB/2)` 条,上限 20000
- 每 **1 秒**批量 gRPC 上报,每次最多 2000 条
- **队列满则丢弃**(`select { default: }` 默认分支)— fail-open,绝不阻塞请求
- 同时支持"本地实时查看者":`HasConns()` 为真时同步推一份给查看者
  → 管理员能"实时看日志流"而不绕 ClickHouse

### 7.2 统计预聚合

`TrafficStatManager`(EdgeNode):
- 节点本地按 `(timestamp, serverId)` 和 `(serverId, timestamp@domain)` 双维度聚合
- 每分钟批量上报已聚合好的 `pb.ServerDailyStat` / `UploadServerDailyStatsRequest_DomainStat`
- 控制面不存明细,只存聚合 → CK/MySQL 压力低一个数量级

### 7.3 多目标日志输出

- **gRPC 上报到控制面** → MySQL `http_access_log` 表(供客户查询近期日志)
- **本地实时查看**(在线管理员)
- **(扩展)** `remotelogs/` 抽象 dao 接口,实现"日志接外部 syslog / 客户自家 ES"

### 7.4 对 aegis-cdn 的对比

| | GoEdge | aegis-cdn 当前 |
| --- | --- | --- |
| 节点本地缓冲 | 内存 channel + 满即丢 | OpenResty 写文件 + Go agent tail |
| 上报周期 | 1s 批量 | agent 按批+定时 flush |
| 预聚合 | 节点先聚合,控制面只存聚合 | 全明细进 ClickHouse,物化视图聚合 |
| 实时查看 | 节点直推 stream | 无,只能查 CK |
| 日志存储 | MySQL(供客户查近期) + 可扩展 | 仅 ClickHouse |

---

## 8. 对 aegis-cdn 的借鉴点

按重要度排序。**所有项目都只是建议,不动手**,等明确决策再启动。

| # | 借鉴点 | 重要度 | 涉及范围 |
| --- | --- | --- | --- |
| 1 | **节点配置极简(只 4 字段) + 其余全拉** | 🔴 高 | 节点接入流程、运维 |
| 2 | **任务版本化 + 增量拉取 + 失败重试** | 🔴 高 | 替代/补强 Redis pub/sub;新建 DeployTask 表 |
| 3 | **共享 schema 包(packages/shared) + 配置对象版本号** | 🔴 高 | [[docs/13]] §5 已规划 packages/shared,可借此推进 |
| 4 | **节点上报已应用 version(对账)** | 🔴 高 | 管理后台显示节点版本差异 |
| 5 | **HTTP 配置细分多表**(cache / firewall / header / rewrite / auth / 各自独立) | 🟡 中 | DB 设计、控制台 UI、套餐能力包装 |
| 6 | **封禁多通道执行器**(Redis + iptables + webhook + 自定义) | 🟡 中 | 边缘 ban.lua 抽象化 |
| 7 | **WAF Checkpoint 抽象**(${arg.x} / ${cc.*} / ${geo.country}) | 🟡 中 | 即使底层换 Coraza,产品 UI 层仍可包装类似语法 |
| 8 | **多种挑战手段并存**(captcha / js_cookie / get_302 / post_307) | 🟡 中 | 边缘 challenge.lua 扩展 |
| 9 | **ACME 多 CA + DNS-01 + OCSP Stapling 自动续期** | 🟡 中 | SSL 模块从零做起;可用现成 acme.sh/lego |
| 10 | **节点本地内核防火墙联动**(nftables DropSourceIP) | 🟢 低 | Linux 生产部署阶段补 |
| 11 | **流量包计费模型**(traffic_package + 时段价差) | 🟢 低 | 商业化 v2 |
| 12 | **日志预聚合(节点先聚合)** | 🟢 低 | CK 压力变高时再做 |
| 13 | **日志 fail-open(队列满即丢)** | 🟢 低 | 改 channel 模式时遵循即可 |
| 14 | **本地实时日志查看通道**(管理员实时调试) | 🟢 低 | 体验向 |

---

## 9. 不建议照搬的部分

| 设计 | 为什么不学 |
| --- | --- |
| **自研 WAF 引擎**(40 operator + 30 checkpoint + 14 action) | [[docs/13]] 已决定用 Coraza/OWASP CRS。回头自研是逆行。可借鉴的是**产品 UI 抽象**,不是底层执行引擎。 |
| **自研 Go 反代 / 连接池 / TLS 栈**(EdgeNode/listener_*.go) | 这是 OpenResty 替代品级别工程。我们已选 OpenResty 做底层。 |
| **自研 ORM(TeaGo)+ 每表 4 文件惯例** | Prisma 已经够好,schema-first 工具链更现代;无需 dao+model+ext+test 四文件。 |
| **121 张主表的细分粒度** | 早期 SaaS 用 ~25 张表(aegis-cdn 现状)够了。按业务实际压力出现时再细分。`message_media_instance` 这种太细。 |
| **gRPC 双向 stream** | 跨语言代价大(我们控制面 NestJS、边缘 Lua),需要 proto + Node gRPC server + Lua gRPC client。**HTTP long-poll / SSE 能达成同样语义**(任务版本化 + 增量拉取),无需 gRPC。 |
| **节点远程 SSH 安装器**(EdgeAPI/installers/) | 客户自己 `docker run` 就行,无需我们登录他们 VPS。GoEdge 这套是给自营客户用的(他们卖整套包安装服务)。 |
| **EdgeCommon Go 包(struct 共用)** | Go 专属,我们跨语言。等价做法:`packages/shared` 放 TS 类型 + JSON Schema,边缘 Lua 用 schema 校验。 |

---

## 10. 后续可落地建议

> 仅为路线候选,**不锁死任何承诺**。任何一项落地前需另行确认范围 + 单独 commit。

### 短期(可与 [[docs/13]] Step 3 SaaS 功能穿插)

| 候选 | 内容 | 估时 |
| --- | --- | --- |
| **建 `packages/shared` 包** | 把配置 JSON 的 TS 类型 + JSON Schema 放进去;前端/控制面/边缘 Lua 三方按同一份契约 | 0.5 天 |
| **配置版本号上报闭环** | agent → 控制面:current_version=N;管理后台显示节点版本差异 | 0.5 天 |
| **任务表 + 任务版本化** | 新增 `DeployTask` 表;agent 拉未完成任务执行后回报;Redis pub/sub 改为"有新任务"通知,任务本体走 HTTP 拉 | 1–2 天 |

### 中期(与 SaaS 功能并行)

| 候选 | 内容 |
| --- | --- |
| **HTTP 配置细分** | DomainConfig 拆为 CachePolicy / HeaderPolicy / RewriteRule / AuthPolicy 独立表 |
| **封禁多通道执行器** | 边缘 ban.lua 抽象化,客户可配 webhook 在封禁时通知自家系统 |
| **SSL/ACME 模块** | 接 acme.sh 或 lego(Go 库)做证书申请/续期,前期不自研 ACME;配 OCSP stapling |
| **流量包 + 钱包模型** | 补 Wallet / WalletTxn / TrafficPackage 表,与 PaymentGateway 串接 |
| **多挑战手段** | 边缘 challenge.lua 增加 captcha(图形)、get_302/post_307,与现有 js_cookie 并存 |

### 长期(Linux 生产部署阶段)

| 候选 | 内容 |
| --- | --- |
| **nftables 内核态拦截** | 节点用 `nft` 命令把高频攻击 IP 写到 set,内核态丢包,卸去 OpenResty 处理压力 |
| **节点本地日志预聚合** | CK 写入压力变高时,在节点先按 (minute, server) 聚合,控制面只存聚合结果 |
| **本地实时日志查看通道** | 管理后台 SSE/WebSocket,节点有连接时同步推送一份日志流 |

---

## 11. 引用与关联

- 路线主文档:[[docs/13-平台化架构重定位.md]]
- 设计前身:[[docs/09-安全引擎架构.md]]、[[docs/12-超大规模CC防护架构.md]]
- 项目记忆:[[project-aegis-cdn]]
- GoEdge 官网:https://goedge.cloud (官方文档与商业版)
- GoEdge 仓库:`TeaOSLab/EdgeAdmin`、`TeaOSLab/EdgeAPI`、`TeaOSLab/EdgeNode`、`TeaOSLab/EdgeCommon`
- 许可:GoEdge 是 AGPL/商业双授权;**不可直接 copy 代码**;借鉴限于设计思想。
