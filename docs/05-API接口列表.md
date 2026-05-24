# AegisCDN API 接口列表

版本 v1.0 · 基础路径 `/api/v1` · REST + JSON · NestJS

---

## 1. 规范

- **鉴权**:
  - 控制台/后台:登录后 `JWT` 存 **httpOnly Cookie**(`access` 15min + `refresh` 7d);CSRF 用双提交 Token。
  - OpenAPI(客户程序调用):`Authorization: Bearer <key_id>.<signature>` 或 `X-Api-Key`,基于 `api_key` 表。
  - 边缘:`edge-agent` 用 `X-Node-Token`(`node.agent_token`)。
- **RBAC**:控制器方法用 `@Roles()` + `@RequirePermissions()` 守卫;Console 接口由 `TenantGuard` 注入并强制 `tenant_id`。
- **响应**:`{ "data": ..., "meta": {...} }`;错误 `{ "error": { "code": "DOMAIN_LIMIT_EXCEEDED", "message": "...", "details": [...] } }`。
- **分页**:`?page=1&page_size=20&sort=-created_at`;返回 `meta:{ total, page, page_size }`。
- **错误码(节选)**:`UNAUTHENTICATED 401` `FORBIDDEN 403` `NOT_FOUND 404` `VALIDATION_FAILED 422`
  `RATE_LIMITED 429` `QUOTA_EXCEEDED 402` `CONFLICT 409` `INTERNAL 500`。
- **限流**:登录/注册/找回按 IP+账号;OpenAPI 按 key;统计接口按租户。

---

## 2. 鉴权 Auth `/api/v1/auth`

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| POST | `/auth/register` | 注册(建 tenant + 首账号) | guest |
| POST | `/auth/login` | 登录,下发 Cookie | guest |
| POST | `/auth/refresh` | 刷新 access | cookie |
| POST | `/auth/logout` | 注销 | user |
| POST | `/auth/forgot` | 发送重置邮件 | guest |
| POST | `/auth/reset` | 重置密码 | guest |
| POST | `/auth/verify-email` | 邮箱验证 | guest |
| GET  | `/auth/me` | 当前用户 + 租户 + 角色 + 权限 | user |
| POST | `/auth/2fa/enable` `/auth/2fa/verify` | 开启/校验 2FA | user |

## 3. 租户与账号 `/api/v1`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/PATCH | `/tenant` | 查看/更新本租户资料(KYC) |
| GET/POST | `/members` | 子账号列表 / 邀请 |
| PATCH/DELETE | `/members/:id` | 改角色权限 / 移除 |
| GET/POST | `/api-keys` | API 密钥列表 / 创建 |
| DELETE | `/api-keys/:id` | 吊销 |
| GET/PATCH | `/account` | 个人资料 / 改密 |
| GET/PATCH | `/notifications` | 通知列表 / 标记已读 |

## 4. 域名 `/api/v1/domains`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/domains` | 列表(筛选/分页) |
| POST | `/domains` | 添加域名 → 返回 CNAME + TXT(校验配额) |
| GET | `/domains/:id` | 详情 |
| PATCH | `/domains/:id` | 改协议/分组等 |
| DELETE | `/domains/:id` | 删除 |
| POST | `/domains/:id/verify` | 触发 DNS 校验 |
| POST | `/domains/:id/pause` `/resume` | 暂停 / 恢复 |
| GET/PUT | `/domains/:id/origins` | 回源配置 |
| GET/PUT | `/domains/:id/cache-rules` | 缓存规则 |
| POST | `/domains/:id/purge` | 缓存刷新/预热 |
| GET/PUT | `/domains/:id/https` | 证书/HTTPS 配置 |
| POST | `/domains/:id/cert/issue` | ACME 签发 |
| POST | `/domains/:id/cert/upload` | 上传证书 |
| GET/PUT | `/domains/:id/cc` | CC 防护策略 |
| GET/PUT | `/domains/:id/waf` | WAF 策略 |
| GET/POST/PUT/DELETE | `/domains/:id/waf-rules[/:rid]` | WAF 自定义规则 CRUD |
| GET/POST/DELETE | `/domains/:id/acl[/:rid]` | ACL(IP/地区/UA)CRUD |
| GET | `/domains/:id/config-versions` | 配置版本历史 |
| POST | `/domains/:id/rollback/:version` | 回滚到指定版本 |

## 5. 统计与日志 `/api/v1`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/stats/overview` | 仪表盘汇总(实时卡片) |
| GET | `/stats/traffic` | 流量时序(?domain_id&granularity&from&to) |
| GET | `/stats/requests` | 请求/状态码/命中率时序 |
| GET | `/stats/protection` | 防护次数 / 攻击趋势 |
| GET | `/stats/top` | Top 攻击 IP / 地区 / URI / UA |
| GET | `/logs/attacks` | 攻击事件明细(筛选/分页) |
| GET | `/logs/attacks/export` | 导出 CSV |

## 6. 计费 `/api/v1/billing`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/plans` | 套餐列表(公开) |
| GET | `/billing/subscription` | 当前订阅与配额用量 |
| POST | `/billing/orders` | 下单(new/renew/upgrade/addon) |
| GET | `/billing/orders[/:id]` | 订单列表/详情 |
| POST | `/billing/orders/:id/pay` | 支付(stripe/wallet) |
| GET | `/billing/wallet` | 余额 |
| POST | `/billing/wallet/recharge` | 充值 |
| GET | `/billing/wallet/txns` | 流水 |
| POST | `/billing/coupons/redeem` | 用券 |
| POST | `/webhooks/stripe` | Stripe 回调(验签) |

## 7. 工单 / 公告 `/api/v1`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST | `/tickets` | 工单列表/创建 |
| GET/POST | `/tickets/:id/messages` | 对话 |
| GET | `/announcements` | 站内公告(已发布) |

## 8. OpenAPI(客户程序,API Key 鉴权) `/api/v1/open`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/open/domains` | 域名与状态 |
| POST | `/open/domains/:id/purge` | 程序化刷新缓存 |
| GET | `/open/stats/traffic` | 拉流量数据 |
| GET | `/open/logs/attacks` | 拉攻击日志 |
| PUT | `/open/domains/:id/acl` | 程序化改黑白名单(联动自动封禁) |

## 9. 管理后台 `/api/v1/admin`(operator/admin)

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/admin/dashboard` | 运营看板汇总 |
| GET/PATCH | `/admin/users[/:id]` | 用户/租户管理 |
| POST | `/admin/users/:id/ban` `/unban` | 封禁/解封 |
| PATCH | `/admin/users/:id/plan` | 调整套餐/配额 |
| GET | `/admin/domains` | 全量域名 |
| GET | `/admin/reviews` | 接入审核队列 |
| POST | `/admin/reviews/:domainId/approve` `/reject` | 审核通过/驳回 |
| GET/POST/PATCH/DELETE | `/admin/plans[/:id]` | 套餐 CRUD |
| GET/POST | `/admin/orders` `/admin/orders/:id/refund` | 订单/退款 |
| GET/POST | `/admin/wallets/:tenantId/adjust` | 余额调整 |
| GET/POST/PATCH/DELETE | `/admin/nodes[/:id]` | 节点 CRUD |
| GET/POST/PATCH/DELETE | `/admin/node-groups[/:id]` | 节点组 |
| POST | `/admin/nodes/:id/maintenance` | 维护模式 |
| GET/PUT | `/admin/policies` | 全局防护策略 |
| GET | `/admin/traffic` | 全局流量/攻击 |
| GET/POST/DELETE | `/admin/blocks[/:id]` | 手动封禁域名/IP |
| GET/POST/PATCH | `/admin/announcements[/:id]` | 公告管理 |
| GET/POST | `/admin/tickets[/:id]` | 工单处理 |
| GET | `/admin/audit` | 审计日志 |
| GET/PUT | `/admin/settings` | 系统设置 |

## 10. 边缘 `/api/v1/edge`(edge-agent,X-Node-Token)

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/edge/heartbeat` | 心跳(状态/负载/已应用版本) |
| GET | `/edge/config?since=<cursor>` | 拉取待应用的域名配置(增量) |
| POST | `/edge/config/:taskId/ack` | 回报下发结果(applied/failed) |
| POST | `/edge/logs/ingest` | 批量上报访问/攻击日志(压缩) |
| GET | `/edge/blocks` | 拉全局封禁名单 |

## 11. 系统

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查(DB/Redis) |
| GET | `/ready` | 就绪探针 |
| GET | `/metrics` | Prometheus 指标(内网) |
