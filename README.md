# AegisCDN — 商用级高防 CDN / DDoS 防护 SaaS 平台

> 品牌名 **AegisCDN**(Aegis = 宙斯之盾,可改)。Apple × Cloudflare 风格的企业级安全加速平台。
> Slogan: **Enterprise Anti-DDoS CDN · Global Acceleration · Intelligent Protection · Always Online**

本仓库当前阶段为 **文档先行**:完整产品需求、数据库设计、页面与功能结构、API、套餐、首页文案、
目录结构与开发计划已全部成文,见 [`docs/`](./docs)。确认后按开发计划分阶段编码,每阶段实测可跑。

---

## 文档索引

| # | 文档 | 内容 |
| --- | --- | --- |
| 01 | [产品需求文档 (PRD)](docs/01-产品需求文档.md) | 定位、角色、业务流程、功能清单、非功能需求、合规边界 |
| 02 | [数据库设计](docs/02-数据库设计.md) | PostgreSQL 全表结构 + 索引 + 关系 + DDL |
| 03 | [前端页面结构](docs/03-前端页面结构.md) | 官网 / 用户控制台 / 管理后台 的路由与页面 |
| 04 | [后台功能结构](docs/04-后台功能结构.md) | 用户后台与管理员后台的功能模块树 |
| 05 | [API 接口列表](docs/05-API接口列表.md) | REST 接口规范、鉴权、错误码、全量端点 |
| 06 | [套餐与计费设计](docs/06-套餐与计费设计.md) | Starter/Business/Enterprise + 计费模型 + 配额 |
| 07 | [首页 UI 文案](docs/07-首页UI文案.md) | Apple 风格逐模块中英文文案 + 视觉规范 |
| 08 | [目录结构与开发计划](docs/08-目录结构与开发计划.md) | Monorepo 结构、技术栈、9 阶段交付路线 |

---

## 技术栈(已确认)

- **前端**:Next.js 14 (App Router) + TypeScript + Tailwind CSS + Framer Motion,Apple 风格设计系统,响应式
- **后端**:NestJS + Prisma + **PostgreSQL** + Redis + JWT(httpOnly Cookie)+ RBAC + BullMQ(异步队列)
- **边缘控制层**:OpenResty(Nginx + Lua),平台下发真实配置,边缘 `edge-agent` 拉配置 / 推日志
- **基础设施**:Docker Compose、Nginx 反代、ACME/Let's Encrypt 证书、宝塔可部署

## 系统架构(控制面 / 数据面分离)

```
                         ┌────────────────────────────────────────────┐
   企业客户 ──CNAME──▶   │              边缘节点(数据面 / Data Plane)        │
  (their-site.com        │   OpenResty(Nginx+Lua)                       │
   → cname.aegis-cdn.net)│   ├─ 反向代理 / 缓存 / 回源                      │
                         │   ├─ WAF 规则引擎(lua)                         │
                         │   ├─ CC 防护 / 限速(lua-resty-limit)           │
                         │   ├─ IP / 地区 / UA 黑白名单(GeoIP2)            │
                         │   └─ edge-agent:拉配置 + 推访问/攻击日志          │
                         └───────────────▲──────────────┬───────────────┘
                                配置下发   │              │  日志上报
                         ┌───────────────┴──────────────▼───────────────┐
                         │            控制面(Control Plane)               │
                         │   NestJS API  ◀─JWT/RBAC─▶  Next.js 前端         │
                         │   ├─ 用户 / 域名 / 套餐 / 订单 / 计费              │
                         │   ├─ 配置编译器(domain → OpenResty conf)         │
                         │   ├─ 日志聚合(BullMQ)→ 流量/攻击统计             │
                         │   PostgreSQL + Redis                            │
                         └────────────────────────────────────────────────┘
```

## 防护能力的真实边界(务必先读)

| 能力 | 落地方式 | 真实度 |
| --- | --- | --- |
| 网站加速 / 缓存 / 回源 | OpenResty proxy_cache + 缓存规则 | ✅ 真实 |
| HTTPS / 证书管理 | ACME 自动签发 + SNI | ✅ 真实 |
| CC 防护 / 频率限制 | lua-resty-limit-req/conn | ✅ 真实 |
| WAF(SQLi/XSS/路径穿越等) | Lua 规则引擎 + 规则集 | ✅ 真实 |
| IP / 地区 / UA / Bot 拦截 | GeoIP2 + UA 指纹 + ACL | ✅ 真实 |
| 流量 / 请求 / 命中率 / 攻击日志 | OpenResty 日志 → 聚合 | ✅ 真实 |
| **L3/L4 大流量 DDoS 清洗(数百 G)** | **依赖上游带宽 / Anycast / 云清洗** | ⚠️ 基础设施级,平台侧提供对接与展示,非软件能凭空产生带宽 |

> 套餐里的 "100G/300G/500G 防护" 是**售卖口径(承诺清洗容量)**,需由你的真实上游带宽 +
> (可选)云清洗服务支撑。平台负责调度、计费、规则、监控与展示,不夸大为"软件即拥有 T 级带宽"。
