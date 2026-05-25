#!/usr/bin/env bash
# scripts/dev.sh — 交互菜单
#   bash scripts/dev.sh         → 菜单
#   bash scripts/dev.sh 3       → 直接跑选项 3
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

DIR="$(cd "$(dirname "$0")" && pwd)"

show_menu() {
    cat <<EOF
${C_BOLD}═══════════════════════════════════════════════════
   AegisCDN 工程化菜单
═══════════════════════════════════════════════════${C_N}
  ${C_G}1${C_N}  start all       (scripts/up.sh)
  ${C_G}2${C_N}  restart all     (scripts/restart.sh)
  ${C_G}3${C_N}  health check    (scripts/check.sh)
  ${C_G}4${C_N}  test domain     (scripts/test-domain.sh)
  ${C_G}5${C_N}  test origin     (scripts/test-origin.sh)
  ${C_G}6${C_N}  test acme/ssl   (scripts/test-acme.sh + test-ssl.sh)
  ${C_G}7${C_N}  test api        (scripts/test-api.sh)
  ${C_G}8${C_N}  db check        (scripts/db-check.sh)
  ${C_G}9${C_N}  collect logs    (scripts/logs.sh)
  ${C_G}10${C_N} generate report (scripts/report.sh)
  ${C_G}11${C_N} full E2E test   (scripts/e2e.sh)
  ${C_Y}12${C_N} db repair       (scripts/db-repair.sh)
  ${C_Y}13${C_N} stop all        (scripts/down.sh)
  ${C_R}q${C_N}  quit
EOF
}

run_choice() {
    case "$1" in
        1)  bash "$DIR/up.sh" ;;
        2)  bash "$DIR/restart.sh" ;;
        3)  bash "$DIR/check.sh" ;;
        4)  bash "$DIR/test-domain.sh" ;;
        5)  bash "$DIR/test-origin.sh" ;;
        6)  bash "$DIR/test-acme.sh"; bash "$DIR/test-ssl.sh" ;;
        7)  bash "$DIR/test-api.sh" ;;
        8)  bash "$DIR/db-check.sh" ;;
        9)  bash "$DIR/logs.sh" ;;
        10) bash "$DIR/report.sh" ;;
        11) bash "$DIR/e2e.sh" ;;
        12) bash "$DIR/db-repair.sh" ;;
        13) bash "$DIR/down.sh" ;;
        q|Q|quit|exit) exit 0 ;;
        *)  fail "无效选项: $1" ;;
    esac
}

# 非交互模式:bash scripts/dev.sh 3
if [ "${1:-}" != "" ]; then
    run_choice "$1"
    exit $?
fi

# 交互菜单
while true; do
    show_menu
    printf '\n选择(1-13 / q): '
    read -r choice || break
    [ -z "$choice" ] && continue
    run_choice "$choice"
    printf '\n%s按 Enter 返回菜单 …%s' "$C_D" "$C_N"; read -r _ || break
done
