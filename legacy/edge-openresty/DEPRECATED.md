# DEPRECATED — v1 自研期产物归档

**归档日期**: 2026-05-24
**归档原因**: 项目方向切换为基于 GoEdge 开源版二开(见 [[docs/15-goedge-secondary-development-plan.md]])。
本目录保留 v1 自研期(2026-05-21)完成的 OpenResty + Lua 边缘引擎、Go 日志 agent、
ClickHouse schema、docker-compose 编排,作为**历史快照**,**不再维护、不再演进**。

## 目录内容

| 路径 | 说明 |
| --- | --- |
| `openresty/` | 自研 Lua 引擎(waf/cc/risk/bot/challenge/ban/...) + nginx.conf + GeoIP |
| `agent/` | Go 写的访问日志 tail 上传 agent(本地无 Docker 未端到端实跑) |
| `clickhouse/` | ClickHouse 表 schema + 物化视图 |
| `docker-compose.edge.yml` | 边缘节点单机编排(openresty + redis + clickhouse) |
| `docker-compose.v1.yml` | 原仓库根 docker-compose.yml(全栈编排) |
| `README.md` / `test.sh` | 边缘工程说明 + 7 项验证脚本 |

## 路径警告

`docker-compose.v1.yml` 内的相对路径(如 `./edge/openresty`)是**归档前**的路径,
移动后已失效。如需复跑 v1,请按当时的 git tag/commit 检出整个仓库后再使用,
**不要直接在新仓库结构下 `docker compose up`**。

## v2 GoEdge 二开下的对应

| v1 (本目录) | v2 (GoEdge 二开) |
| --- | --- |
| `openresty/` (Lua 反代 + WAF) | `upstream/EdgeNode/` (Go 自研反代 + WAF) |
| `agent/` (日志 tail) | GoEdge `HTTPAccessLogQueue` + `TrafficStatManager` |
| `clickhouse/` | `services/analytics-svc/` + ClickHouse(待建,Phase 8) |
| `docker-compose.v1.yml` | `deploy/docker-compose.dev.yml`(待建,Phase 1) |
