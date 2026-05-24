# AegisCDN 边缘安全引擎(OpenResty + Lua + Redis)

系统核心:在边缘**内联**完成 CC 防护、智能 WAF、Bot 识别、风险评分、动态挑战与封禁。
判定全在 LuaJIT 里微秒级完成,**不回控制面问**;控制面只下发规则(写 Redis)和读日志(ClickHouse)。

> ⚠️ 运行环境:**Linux + OpenResty**。开发机是 Windows、无 Docker/OpenResty,
> 因此这套 Lua **尚未在本地实跑**(本地跑不了 Lua)。请在装了 Docker 的 Linux / Mac / WSL2
> 上用下面命令验证,或部署到你的边缘 VPS。代码按生产形态编写,逻辑已逐模块自审。

## 一键起本地验证环境

```bash
cd edge
docker compose -f docker-compose.edge.yml up -d     # openresty + redis + demo源站 + clickhouse
bash test.sh                                         # 自动跑 7 项防护验证
```

浏览器打开 http://localhost:8080 :
- 用正常浏览器访问 → 放行(看到 whoami 源站回显)
- 用 `curl http://localhost:8080/` → 返回「正在验证您的浏览器」5 秒盾页(503)

## 手动验证示例

```bash
# 正常浏览器(放行 200)
curl -s -o /dev/null -w '%{http_code}\n' -A "Mozilla/5.0 ... Chrome/124" -H "Accept-Language: zh-CN" http://localhost:8080/

# curl 自动化(挑战 503)
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/

# SQL 注入(拦截 403)
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:8080/?id=1 union select pwd from users"

# 路径穿越(拦截 403)
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:8080/../../etc/passwd"
```

## 防护流水线(`lua/aegis/access.lua`)

```
0 白名单 → 1 封禁/黑名单 → 2 WAF → 3 Bot 识别 → 4 多维限频
→ 5 风险评分(0-100)→ 6 决策(放行/挑战/拦截)→ 7 挑战校验 → 回源 → 决策日志
```

| 模块 | 文件 | 能力 |
| --- | --- | --- |
| 编排 | `access.lua` | 流水线;Redis 故障自动 fail-open |
| 配置 | `config.lua` | 域名配置 Redis 下发 + shared dict 缓存(热更新) |
| Redis | `redis.lua` | 连接池 + 原子脚本 |
| 限频 | `ratelimit.lua` | 多维(ip/uri/cookie/session/ua/asn/country)× 多窗口 × 滑动窗口/令牌桶/漏桶 |
| Bot | `bot.lua` | 自动化签名、缺失头启发式、真假 GoogleBot(rDNS 校验) |
| WAF | `waf.lua` | OWASP 内置签名(SQLi/XSS/RCE/SSRF/XXE/穿越/WebShell)+ 自定义规则(Redis JSON 热更新) |
| 指纹 | `fingerprint.lua` | HTTP/UA 指纹(可用)+ JA3/TLS(best-effort,需 OpenResty ssl 钩子验证) |
| 风险 | `risk.lua` | 多特征加权 0-100 |
| 挑战 | `challenge.lua` | 5 秒盾 / JS Challenge,HMAC Cookie 校验,采集浏览器指纹 |
| 封禁 | `ban.lua` | 临时/永久/CIDR/ASN/国家,自动学习指数退避,白名单优先 |
| 日志 | `log.lua` | 结构化决策 JSON → ClickHouse |

## 配置(默认见 `config.lua` 的 `DEFAULTS`)

生产由控制面写入 Redis `aegis:cfg:<domain>`(JSON),边缘 10s 内热加载。关键阈值:
`challenge_score=50`、`block_score=80`、`bot_challenge_score=60`、`ratelimit[]`、`waf.rulesets`、`whitelist/blacklist`。

## 与控制面/日志的衔接(后续阶段)

- `edge/agent/`(Go):tail `access.json.log` → 批量写 ClickHouse(本阶段未实现,schema 已就绪)。
- 控制面(NestJS)写 `aegis:cfg:*` / `aegis:waf:*` 下发规则;读 ClickHouse 出可视化。

## 已知边界 / 待在 Linux 上验证

- 本地未实跑(无 Lua 运行时);需在 Docker/Linux 验证后再上生产。
- JA3 为 best-effort 骨架,需 HTTPS + `ssl_client_hello_by_lua` 在 OpenResty 上补全 cipher/ext 原始解析。
- **GeoIP 已实现**(`geo.lua` + lua-resty-maxminddb,GeoIP 增强镜像 `Dockerfile`):放入 `geoip/GeoLite2-Country.mmdb`
  即真实解析国家、地区拦截生效;无 mmdb/库则**优雅降级为 XX**。ASN 维度暂留 0(需 GeoLite2-ASN,后续)。
- **real_ip 已配**(`nginx.conf` 的 `set_real_ip_from`):边缘前有 LB 时按真实客户端 IP 限频/封禁。
- 大流量 L3/L4 清洗不在此层(普通 VPS 用户态),如需对接上游云清洗。
