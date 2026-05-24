# AegisCDN 控制面 API(NestJS + Prisma + PostgreSQL + Redis)

阶段③核心:鉴权 / 租户 / 域名接入 + **防护策略下发到 Redis**,边缘 OpenResty 热加载,打通控制面 → 数据面。

## 控制面 → 数据面闭环

```
管理员在后台改 CC/WAF/ACL/限频
   → NestJS 写 DB(Prisma/PostgreSQL)
   → ConfigCompiler 编译成边缘认识的 JSON
   → 写 Redis: aegis:cfg:<domain> / aegis:waf:<domain>
   → 边缘 config.lua / waf.lua 在 10s 内热加载(无需 reload)→ 策略生效
```

> 关键:控制面与边缘**必须共用同一个 Redis**。`ConfigCompilerService` 产出的 JSON 形状
> 与 `edge/openresty/lua/aegis/config.lua` 的 `DEFAULTS` 完全对齐。

## 本地运行

```bash
cd apps/api
cp .env.example .env                 # 改 DATABASE_URL / REDIS_URL / JWT_SECRET
npm install
npx prisma generate
npx prisma migrate dev --name init   # 需要可连接的 PostgreSQL
npm run start:dev                     # http://localhost:4000/api/v1
```

或用 Docker:`docker compose -f docker-compose.api.yml up -d --build`(自带 PG + Redis,启动自动迁移)。

## 接口(已实现)

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/v1/auth/register` | 注册(建租户 + 首账号;首个用户=平台管理员) |
| POST | `/api/v1/auth/login` | 登录,返回 JWT |
| GET | `/api/v1/auth/me` | 当前用户 |
| GET/POST/DELETE | `/api/v1/domains[/:id]` | 域名 CRUD(租户隔离,分配 CNAME) |
| POST | `/api/v1/domains/:id/activate` | (demo)审核通过+激活并下发 |
| PUT | `/api/v1/domains/:id/cc` | 更新 CC 策略 → 下发 |
| PUT | `/api/v1/domains/:id/waf` | 更新 WAF 策略 → 下发 |
| POST/DELETE | `/api/v1/domains/:id/waf-rules[/:rid]` | 自定义 WAF 规则 → 下发 |
| POST/DELETE | `/api/v1/domains/:id/acl[/:rid]` | IP/地区/UA 黑白名单 → 下发 |
| POST/DELETE | `/api/v1/domains/:id/rate-rules[/:rid]` | 限频规则 → 下发 |
| POST | `/api/v1/domains/:id/deploy` | 手动重新编译并下发(返回将下发的 JSON) |
| GET | `/api/v1/health` | 健康检查(查 DB) |

## 验证下发是否生效

```bash
# 改了策略后,直接看 Redis 里下发的内容
redis-cli get "aegis:cfg:example.com"
redis-cli get "aegis:waf:example.com"
```

## 说明 / 边界

- 本机无 PostgreSQL/Redis,**未端到端实跑**;`nest build` + `prisma generate` 已验证编译通过。
- RBAC 目前用 `user.role` 粗粒度(user/operator/admin);细粒度 permission 表见 docs/02,后续接入。
- 计费 / 工单 / 公告 / 节点管理等模块本阶段未做(见 docs 路线图)。
- 鉴权目前 JWT 走 Authorization Bearer;前端 httpOnly Cookie 方案在前端接入时统一。
