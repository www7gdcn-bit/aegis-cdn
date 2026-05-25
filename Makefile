# AegisCDN — 工程化入口
# 所有命令委派给 scripts/*.sh,Makefile 只做名字映射 + 帮助
#
# 用法:
#   make            (= make help)
#   make up         启动全部服务
#   make check      一键健康巡检 → SYSTEM STATUS: PASS/FAIL
#   make e2e        13 步全链路 E2E
#   make report     生成排障报告(aegis-report-YYYYMMDD-HHMMSS.tar.gz)
#   make logs       聚合最近 50 行(N=200 调行数,Q=ERROR 加 grep)
#   make dev        进入交互菜单

SHELL := /usr/bin/env bash
SCRIPTS := scripts

# 默认行数 + grep 模式(make logs 用)
N ?= 50
Q ?=

.PHONY: help up down restart check e2e dev report doctor ai-repair auto-pilot auto \
        check-docker check-mysql check-redis check-edgeapi check-bff check-edgenode \
        test-domain test-origin test-proxy test-80 test-443 test-ssl test-acme test-api \
        db-check db-repair \
        logs logs-edgeapi logs-bff logs-edgenode

help:
	@echo "AegisCDN 工程化 Makefile"
	@echo ""
	@echo "  ─── 启停 ───"
	@echo "  make up                启动全部服务(幂等)"
	@echo "  make down              停止(保留卷;make down V=1 删卷)"
	@echo "  make restart           重启容器(make restart B=1 强制重建)"
	@echo ""
	@echo "  ─── 巡检 ───"
	@echo "  make check             ★ 一键健康巡检"
	@echo "  make check-docker / check-mysql / check-redis / check-edgeapi / check-bff / check-edgenode"
	@echo ""
	@echo "  ─── 数据库 ───"
	@echo "  make db-check          表存在 + 行数 + 状态扫描"
	@echo "  make db-repair         自动修复(edgeUsers.clusterId=0 → 1)"
	@echo ""
	@echo "  ─── 网络测试 ───"
	@echo "  make test-domain       (需 TEST_REAL_DOMAIN=)"
	@echo "  make test-origin       源站直连"
	@echo "  make test-proxy        完整反代链路(domain+80+443+origin+ssl)"
	@echo "  make test-80 / test-443 / test-ssl / test-acme / test-api"
	@echo ""
	@echo "  ─── 日志 ───"
	@echo "  make logs              聚合(N=200 Q=ERROR 调行数+grep)"
	@echo "  make logs-edgeapi / logs-bff / logs-edgenode"
	@echo ""
	@echo "  ─── 综合 ───"
	@echo "  make e2e               ★ 全链路 E2E(13 步)"
	@echo "  make report            完整排障报告(tar.gz)"
	@echo "  make dev               交互菜单"
	@echo ""
	@echo "  ─── AI Auto-Pilot(自检 → 自修 → 复检循环)───"
	@echo "  make auto              ★★ 一键自治:git pull + auto-pilot"
	@echo "  make auto-pilot        check → doctor → re-check → AI repair → … 最多 5 轮"
	@echo "  make doctor            规则化自动修复(无 AI,确定性 fix)"
	@echo "  make ai-repair         调 Claude 分析 check 输出并执行 JSON action"
	@echo "                         (需 ANTHROPIC_API_KEY;默认 dry-run,AI_AUTO_EXEC=1 真执行)"
	@echo ""
	@echo "Env 覆盖:TEST_REAL_DOMAIN / TEST_ORIGIN / TEST_DOMAIN / TEST_USERNAME"
	@echo "          ANTHROPIC_API_KEY / ANTHROPIC_MODEL / AI_AUTO_EXEC / AUTO_PILOT_MAX_ROUNDS"

up:         ; @bash $(SCRIPTS)/up.sh
down:       ; @bash $(SCRIPTS)/down.sh $(if $(V),--volumes,)
restart:    ; @bash $(SCRIPTS)/restart.sh $(if $(B),--build,)

check:           ; @bash $(SCRIPTS)/check.sh
check-docker:    ; @bash $(SCRIPTS)/check-docker.sh
check-mysql:     ; @bash $(SCRIPTS)/check-mysql.sh
check-redis:     ; @bash $(SCRIPTS)/check-redis.sh
check-edgeapi:   ; @bash $(SCRIPTS)/check-edgeapi.sh
check-bff:       ; @bash $(SCRIPTS)/check-bff.sh
check-edgenode:  ; @bash $(SCRIPTS)/check-edgenode.sh

test-domain:  ; @bash $(SCRIPTS)/test-domain.sh
test-origin:  ; @bash $(SCRIPTS)/test-origin.sh
test-proxy:   ; @bash $(SCRIPTS)/test-proxy.sh
test-80:      ; @bash $(SCRIPTS)/test-80.sh
test-443:     ; @bash $(SCRIPTS)/test-443.sh
test-ssl:     ; @bash $(SCRIPTS)/test-ssl.sh
test-acme:    ; @bash $(SCRIPTS)/test-acme.sh
test-api:     ; @bash $(SCRIPTS)/test-api.sh

db-check:     ; @bash $(SCRIPTS)/db-check.sh
db-repair:    ; @bash $(SCRIPTS)/db-repair.sh

logs:         ; @bash $(SCRIPTS)/logs.sh $(N) $(Q)
logs-edgeapi: ; @bash $(SCRIPTS)/logs-edgeapi.sh $(N)
logs-bff:     ; @bash $(SCRIPTS)/logs-bff.sh $(N)
logs-edgenode:; @bash $(SCRIPTS)/logs-edgenode.sh $(N)

e2e:          ; @bash $(SCRIPTS)/e2e.sh
report:       ; @bash $(SCRIPTS)/report.sh
dev:          ; @bash $(SCRIPTS)/dev.sh

doctor:       ; @bash $(SCRIPTS)/doctor.sh
ai-repair:    ; @bash $(SCRIPTS)/ai-repair.sh
auto-pilot:   ; @bash $(SCRIPTS)/auto-pilot.sh
auto:         ; @bash $(SCRIPTS)/auto-pilot.sh
