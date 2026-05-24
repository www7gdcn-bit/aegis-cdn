# overlay build tag 规范

版本 v0.1(骨架) · 立项日期 2026-05-24 · 关联 [[docs/15-goedge-secondary-development-plan.md]]

> ⚠️ **本文档为 Phase 0 骨架** — 规则、命令、模板的细节将在 Phase 1
> (`upstream/` submodule + `overlays/` 空骨架落地)与 Phase 5(第一个 overlay
> `service_plan_aegis` 实战)中逐步定稿。当前提供**契约骨架**与**为什么这么做**,
> 让后续二开有据可循。

---

## 1. 为什么用 build tag,而不是 fork / patch

| 方案 | 优点 | 劣点 | 是否选用 |
| --- | --- | --- | --- |
| **硬 fork(独立分支)** | 改起来无拘束 | 升级 = 合并地狱;每次 GoEdge 上游迭代都要手动 rebase 全代码 | ✗ |
| **patch 文件** | 修改可追踪 | patch 漂移;upstream 文件行号一变就崩 | △(仅用于个别 stub 替换不掉的小修) |
| **`//go:build aegis` 旁路文件** | upstream 文件零改动;升级 = 跑 `git submodule update` 即可 | 必须 upstream 已经提供"扩展点"(stub 或可替换函数) | ✓ **首选** |

**铁律**:**对 `upstream/` 下任何文件的修改都视为最后手段**。
能用新建 `*_aegis.go` 文件解决的,**不准** 改 upstream。

---

## 2. 命名规范

### 2.1 文件名后缀

| 用途 | 后缀 | 示例 |
| --- | --- | --- |
| aegis 商业化扩展实现 | `_aegis.go` | `service_plan_aegis.go` |
| aegis 专用类型 / 常量 | `_aegis.go` | `const_aegis.go` |
| aegis 专用测试 | `_aegis_test.go` | `service_plan_aegis_test.go` |
| 必要的 upstream patch(尽量避免) | `*.patch`,放 `overlays/patches/` | `EdgeAPI-rpc-server-bootstrap.patch` |

### 2.2 build tag 头

每个 aegis overlay 文件**第一行**必须是:

```go
//go:build aegis
// +build aegis
```

(双行兼容 Go 1.17 前后的 build tag 语法。)

GoEdge 社区版的对应 stub 文件通常带:

```go
//go:build !plus && !aegis
// +build !plus,!aegis
```

→ 我们的 aegis 文件被启用时,自动**互斥替换** community 的 stub。
→ 不启用 `-tags aegis` 时,行为退化为 GoEdge 社区版,**不会**因 overlay 文件存在而破坏。

### 2.3 目录镜像

`overlays/EdgeAPI/internal/...` 路径**严格镜像** `upstream/EdgeAPI/internal/...`。
- 好处:rebase 上游时一眼能看出哪些扩展点可能受影响
- 工具脚本(§4)依赖这个对齐做合并

---

## 3. 哪些扩展点可以用 aegis tag 注入(待详定)

> 这里只列**已确认存在 community/plus 互斥点**的入口,详细函数签名 Phase 5 实战时补。

| 模块 | community stub | 我们的 aegis 实现 |
| --- | --- | --- |
| 套餐 | `EdgeAPI/internal/rpc/services/service_plan_community.go` | `service_plan_aegis.go` |
| 用户订阅 | `service_user_plan_community.go` | `service_user_plan_aegis.go` |
| 防护模板 | (新增,无 stub) | `service_protection_template_aegis.go` |
| 节点上限等常量 | `internal/const/const_community.go` | `const_aegis.go` |
| 用户账户 / 余额 | `db/models/user_account_*.go` 部分 stub | `user_account_aegis.go` |
| WAF 跨节点信誉 | (新增 checkpoint) | `EdgeNode/.../checkpoints/cc_global_reputation_aegis.go` |
| Coraza CRS 旁路 | (新增层) | `EdgeNode/.../waf/coraza_layer_aegis.go` |

> **待办**:Phase 1 进 submodule 后,跑 `grep -rE "//go:build (!?plus|!?aegis)"` 扫一遍
> 上游所有扩展点,在本文表格里登记完整清单。

---

## 4. 构建流程(待 Phase 1 脚本落地)

```bash
# scripts/build-edgeapi.sh  (待写)
set -euo pipefail

# 1. 把 overlays/EdgeAPI/ 同步到 upstream/EdgeAPI/(rsync,不删 upstream 自身文件)
rsync -av overlays/EdgeAPI/ upstream/EdgeAPI/

# 2. 在 upstream/EdgeAPI/ 下用 aegis tag 编译
cd upstream/EdgeAPI
go build -tags aegis -o ../../bin/edgeapi-aegis ./cmd/edgeapi
```

**清理**:构建完后 `git status upstream/` 应该**只显示**我们 overlay 进去的文件;
若显示 upstream 自身文件被修改,说明有人违规直接改了 upstream,**必须回滚**。

**未决细节**(Phase 1 定):
- 是否引入 Bazel / Mage,还是纯 shell + go build 就够
- CI 上如何同时跑社区版构建(无 tag)+ aegis 版构建(有 tag),保证两套都不破
- overlay → upstream 合并是 rsync 还是 symlink,哪个对 IDE 索引更友好

---

## 5. 红线清单

- ❌ 不准直接修改 `upstream/` 下任何 `.go` 文件(patches/ 是最后手段且需 PR review)
- ❌ 不准在 aegis overlay 里改 EdgeCommon proto 既有字段(只能加新 service / 新 field)
- ❌ 不准在 `*_aegis.go` 里 import 任何**没有** aegis tag 保护的 community 私有符号
  (会导致 aegis 关闭时编译失败)
- ✅ 必须给每个 aegis overlay 写至少一行 `// 用途:` 注释,说明替换的是 community 哪个 stub
- ✅ 必须每次 `git submodule update` 后跑一次 `scripts/build-edgeapi.sh` 验证 overlay 仍能编译

---

## 6. 关联

- [[docs/15-goedge-secondary-development-plan.md]] §5(模块复用 / 扩展 / 新增 / 不改)
- [[docs/17-saas-svc-接口规范.md]] — overlay 在 EdgeAPI 一侧,SaaS 服务在另一侧,通过 gRPC + REST 解耦
- [[docs/18-升级与 rebase 流程.md]] — 上游同步时如何检查 overlay 是否仍兼容

---

## 7. GoEdge upstream 扩展点摸底结果(Phase 1 Step 2,2026-05-24)

> 扫描对象:`upstream/EdgeCommon@v1.3.9.1` / `upstream/EdgeAPI@v1.3.9.1` / `upstream/EdgeNode@v1.3.9`。
> 全仓 `//go:build` 标签共 **114 个文件**,其中 plus/community/aegis 相关 **62 个**(其余是 OS/arch 平台 tag,如 `linux` / `darwin` / `arm64`)。

### 7.1 命名规律

| upstream 文件名后缀 | build tag | 含义 | 我们的应对 |
| --- | --- | --- | --- |
| `*_community.go` | `//go:build !plus` | 社区版默认 stub(常为空实现) | 写 `*_aegis.go`(`//go:build plus \|\| aegis`)替换 |
| `*_ext.go` | `//go:build !plus` | 社区版扩展占位(常 return nil) | 同上 |
| `*_plus.go` | `//go:build plus` | 商业版独占实现 | 不动(D5 不买 Plus);我们的 `aegis` tag 平行存在 |
| `*_test.go` 带 plus tag | `//go:build plus` / `!plus` | 测试分版本跑 | 不动 |

→ 倾向命名:`overlays/.../<name>_aegis.go`,内部 `//go:build aegis`,**与 plus 互斥**;
  这样 community/plus/aegis 三轨并行,商业用户用 plus,我们 SaaS 部署用 aegis,
  纯开源测试用 community。

### 7.2 EdgeAPI 关键 stub(套餐 / 用户 / 节点 / 配额 — 商业化必填)

| upstream 路径 | tag | 我们 overlay 目标 |
| --- | --- | --- |
| `internal/rpc/services/service_plan_community.go` | `!plus` | **`service_plan_aegis.go`** — 套餐 CRUD |
| `internal/rpc/services/service_user_plan_community.go` | `!plus` | **`service_user_plan_aegis.go`** — 用户订阅 |
| `internal/rpc/services/service_server_community.go` | `!plus` | **`service_server_aegis.go`** — Server CRUD 加套餐门控 hook |
| `internal/rpc/services/service_http_web_community.go` | `!plus` | `service_http_web_aegis.go`(按需) |
| `internal/rpc/services/users/service_user_ext.go` | `!plus` | `service_user_aegis.go`(按需) |
| `internal/rpc/services/service_admin_ext.go` | `!plus` | `service_admin_aegis.go`(按需) |
| `internal/rpc/services/service_node_ext.go` | `!plus` | 暂不动 |
| `internal/rpc/services/service_node_cluster_ext.go` | `!plus` | 暂不动 |
| `internal/rpc/services/service_http_access_log_ext.go` | `!plus` | 暂不动(走 analytics-svc 旁路) |
| `internal/rpc/utils/utils_ext.go` | `!plus` | 暂不动 |

### 7.3 EdgeAPI dao 层 stub(数据访问 — 与套餐/节点配额关联)

| upstream 路径 | tag | 用途 |
| --- | --- | --- |
| `internal/db/models/plan_dao.go` | `!plus` | 套餐 DAO |
| `internal/db/models/user_plan_dao.go` | `!plus` | 用户订阅 DAO |
| `internal/db/models/user_plan_stat_dao_community.go` | `!plus` | 套餐用量统计 |
| `internal/db/models/user_dao_ext.go` | `!plus` | 用户扩展字段(余额/状态) |
| `internal/db/models/node_dao_ext.go` / `node_dao_limit.go` | `!plus` | 节点上限/扩展 |
| `internal/db/models/node_log_dao_ext.go` / `node_login_dao_ext.go` | `!plus` | 节点日志/登录 |
| `internal/db/models/node_task_dao_ext.go` | `!plus` | 节点任务下发 |
| `internal/db/models/node_threshold_dao_ext.go` | `!plus` | 节点阈值告警 |
| `internal/db/models/node_traffic_daily_stat_dao_ext.go` | `!plus` | 节点流量日统计 |
| `internal/db/models/node_value_dao_ext.go` | `!plus` | 节点监控值 |
| `internal/db/models/node_ip_address_dao_community.go` | `!plus` | 节点 IP 管理 |
| `internal/db/models/server_dao_ext.go` / `server_dao_copy_ext.go` | `!plus` | Server 扩展(套餐配额对接点) |
| `internal/db/models/message_task_dao_ext.go` | `!plus` | 消息任务(告警通知) |
| `internal/db/models/authority/authority_key_dao_community.go` | `!plus` | 授权 key(商业版 license 校验) |
| `internal/db/models/db_node_initializer_ext.go` | `!plus` | DB 节点初始化扩展 |

### 7.4 EdgeAPI const(常量上限 — 套餐能力的源头)

| upstream 路径 | tag | 用途 |
| --- | --- | --- |
| `internal/const/const_community.go` | `!plus` | DefaultMaxNodes / MaxServers / MaxDomainsPerServer 等 |
| `internal/const/build.go` | `!plus` | 构建标识(community/plus 字符串) |

→ **首批 overlay 重点**:`const_aegis.go` 覆盖上限,套餐 enterprise 可解锁更大值。

### 7.5 EdgeNode 关键 !plus 文件(数据面行为 — CC/UAM/OSS/HTTP3 等)

| upstream 路径 | tag | 备注 |
| --- | --- | --- |
| `internal/nodes/http_request_cc.go` | `!plus` | **CC 防护入口 — Phase 6 增强这里** |
| `internal/nodes/http_request_uam.go` | `!plus` | Under Attack Mode |
| `internal/nodes/http_request_plan_before.go` | `!plus` | 套餐配额前置检查(关键) |
| `internal/nodes/http_request_oss.go` | `!plus` | OSS 回源 |
| `internal/nodes/http_request_ln.go` | `!plus` | 负载相关 |
| `internal/nodes/http_request_hls.go` | `!plus` | HLS 直播 |
| `internal/nodes/http_request_http3.go` | `!plus` | HTTP/3 |
| `internal/nodes/http_writer_ext.go` | `!plus` | 响应写入扩展 |
| `internal/nodes/listener_base_ext.go` | `!plus` | 监听器扩展 |
| `internal/nodes/node_tasks_ext.go` | `!plus` | 节点任务执行扩展 |
| `internal/nodes/toa_manager.go` | `!plus` | TOA(TCP option address)真实 IP 透传 |
| `internal/caches/storage_file_ext.go` | `!plus` | 文件缓存扩展 |
| `internal/caches/reader_file_mmap.go` | `!plus` | mmap 缓存读 |
| `internal/compressions/{reader,writer}_brotli.go` | `!plus \|\| !linux` | Brotli 压缩(plus + linux 用商业实现) |
| `internal/utils/minifiers/minify.go` | `!plus` | HTML/CSS/JS 压缩 |
| `internal/firewalls/nftables/set_ext.go` | `linux && !plus` | nftables 集合扩展(仅 Linux) |
| `internal/const/build.go` / `build_plus.go` | `!plus` / `plus` | 构建标识 |

### 7.6 EdgeCommon `pkg/serverconfigs` / `pkg/nodeconfigs` 配置层 stub

| upstream 路径 | tag | 用途 |
| --- | --- | --- |
| `pkg/serverconfigs/http_cc_config.go` | `!plus` | CC 配置结构 — overlay 时小心,改 struct 会影响所有版本 |
| `pkg/serverconfigs/http_auth_methods.go` | `!plus` | 鉴权方法 |
| `pkg/serverconfigs/http_auth_policy_init.go` | `!plus` | 鉴权策略初始化 |
| `pkg/serverconfigs/ossconfigs/oss_*.go` | `!plus` | OSS 配置 |
| `pkg/nodeconfigs/http_cc_policy.go` | `!plus` | CC 策略下发结构 |
| `pkg/nodeconfigs/uam_policy.go` | `!plus` | UAM 策略 |
| `pkg/nodeconfigs/toa_config.go` | `!plus` | TOA 配置 |

→ **特别警告**:EdgeCommon 是 proto/struct 共享包,**不要改既有字段**;
  必须新增能力时,优先在 SaaS 侧(saas-svc Postgres)存,或 overlay 加新 struct,
  通过 EdgeCommon 既有的 `extras` / `ext` JSON 字段透传。详见 [[docs/18-升级与 rebase 流程.md]] §3。

### 7.7 WAF 引擎全景(EdgeNode `internal/waf/`)

WAF 主体引擎**没有** community/plus 互斥点 — 全部是统一实现,community 与 plus 共用。
扩展手段是**新增 checkpoint / action**,而不是替换现有的。

**已有 30+ checkpoints**(`internal/waf/checkpoints/`):
- `cc.go` / `cc2.go` — CC 维度计数(IP / cookie / header / etc)**← Phase 6 加 cc_global_reputation_aegis.go / cc_asn_aegis.go**
- `request_*.go`(arg/args/body/cookie/header/host/method/path/uri/url/user_agent/referer/remote_addr/scheme/length/json_arg/form_arg/...) — HTTP 请求维度
- `request_geo_{country,province,city}_name.go` / `request_isp_name.go` — IP 库地理/ASN
- `response_*.go`(bytes_sent/status/header/general_header_length) — 响应维度
- `sample_request.go` / `sample_response.go` — 抽样

**已有 14 actions**(`internal/waf/action_*.go`):
- 拦截类:`block` / `page` / `redirect`
- 挑战类:**`captcha`** / **`js_cookie`**(类似 5 秒盾)
- 重定向类:`get_302` / `post_307`
- 标记类:`tag` / `record_ip` / `log` / `notify`
- 转移类:`go_group` / `go_set` / `allow`

**Captcha / Challenge 生态**(`internal/waf/`):
- `captcha_generator.go` / `captcha_validator.go` / `captcha_counter.go` — captcha 完整闭环
- `allow_cookie_info.go` — 通过 captcha 后的 cookie 凭证

→ **Phase 6 CC 增强方案**:不动 WAF 主流程,只**新增 checkpoint**:
  - `overlays/EdgeNode/internal/waf/checkpoints/cc_global_reputation_aegis.go`(`${cc.global_score}` 读 Redis 全局信誉)
  - `overlays/EdgeNode/internal/waf/checkpoints/cc_asn_aegis.go`(`${cc.asn_requests:N}` 按 ASN 限频)
  - 配套 `overlays/EdgeAPI/internal/rpc/services/service_protection_template_aegis.go`(轻度/中度/重度/Under Attack 一键模板)

→ **Phase 7 Coraza 旁路方案**:`overlays/EdgeNode/internal/waf/coraza_layer_aegis.go` 在原 WAF allow 流程末尾再过 Coraza,**不替换** GoEdge WAF 引擎。

### 7.8 EdgeAPI gRPC 服务全景

`upstream/EdgeAPI/internal/rpc/services/` 共 **116 个 service_*.go 文件**,
proto 定义在 `upstream/EdgeCommon/pkg/rpc/protos/*.proto`。**bff-edge 通过这套 gRPC 接入边缘控制面**(详 [[docs/17-saas-svc-接口规范.md]] §1.2)。

按用途分类(节选):
- **节点/集群**:service_node / node_cluster / node_group / node_region / node_ip_address(_log/_threshold) / node_task / node_log / node_value / node_threshold / node_grant / node_stream / node_login
- **HTTP 服务**:service_server(_group) / http_web / http_location / http_rewrite_rule / http_header(_policy) / http_websocket / http_fastcgi / origin / reverse_proxy
- **缓存**:http_cache_policy / http_cache_task(_key)
- **防火墙/WAF**:service_firewall / http_firewall_policy / http_firewall_rule_group / http_firewall_rule_set
- **SSL/ACME**:**service_ssl_cert / service_ssl_policy** / service_acme_authentication / service_acme_provider(_account) / service_acme_task / service_acme_user
- **DNS**:service_dns / dns_domain / dns_provider / dns_task
- **访问日志**:service_http_access_log(_ext)
- **统计**:service_server_bandwidth_stat / server_daily_stat / server_domain_hourly_stat / server_region_*_monthly_stat / server_client_*_monthly_stat / api_method_stat / metric_chart / metric_item / metric_stat
- **IP 库**:service_ip_library(_artifact/_file) / ip_list / ip_item
- **消息/通知**:service_message(_media/_recipient/_task)
- **登录/会话**:service_login(_session/_ticket)
- **管理员/API token**:service_admin / api_token / api_access_token
- **套餐(社区版 stub)**:service_plan(_community) — **首批 aegis overlay**

### 7.9 ACME / SSL 真实可用清单

`upstream/EdgeAPI/internal/acme/`(11 文件)+ 2 个 RPC service:
- `account.go` / `user.go` / `key.go` — ACME 账户管理
- `providers.go` / `providers_ext.go`(`!plus`) — ACME 提供商注册表(Let's Encrypt 等)
- `http_provider.go` — HTTP-01 挑战
- `dns_provider.go` — DNS-01 挑战(配合 `internal/dnsclients/` 各家 DNS 厂商)
- `task.go` — ACME 自动续期任务
- `auth_callback.go` / `request.go` — 颁发回调

→ **SSL/ACME 模块直接复用**,不写 overlay。bff-edge 调用 EdgeAPI gRPC 的 `service_ssl_cert` / `service_ssl_policy` / `service_acme_*` 即可。

### 7.10 摸底总结(下一步实战优先级)

| 优先级 | overlay 目标文件 | 阶段 | 关联 |
| --- | --- | --- | --- |
| P0 | `overlays/EdgeAPI/internal/const/const_aegis.go` | Phase 5 | 改默认上限 |
| P0 | `overlays/EdgeAPI/internal/rpc/services/service_plan_aegis.go` | Phase 5 | 套餐 CRUD |
| P0 | `overlays/EdgeAPI/internal/rpc/services/service_user_plan_aegis.go` | Phase 5 | 用户订阅 |
| P0 | `overlays/EdgeAPI/internal/rpc/services/service_server_aegis.go` | Phase 5 | Server 加套餐门控 hook |
| P1 | `overlays/EdgeNode/internal/waf/checkpoints/cc_global_reputation_aegis.go` | Phase 6 | 新 checkpoint(无 stub,纯加) |
| P1 | `overlays/EdgeAPI/internal/rpc/services/service_protection_template_aegis.go` | Phase 6 | 新 service(无 stub,纯加,需新 proto?) |
| P2 | `overlays/EdgeNode/internal/waf/coraza_layer_aegis.go` | Phase 7 | Coraza CRS 旁路 |
| P3 | `overlays/EdgeAPI/internal/db/models/user_account_aegis.go` | Phase 9 | 余额/扣费 |

→ Phase 1 Step 2 **不实施** 任何 overlay 实现,仅落地骨架 + 摸底。
→ Phase 5 起开始按此优先级落第一批文件。
