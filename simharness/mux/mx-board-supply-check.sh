#!/bin/bash
# mx-board-supply-check.sh — 账号板供给核验（prelaunch ⑫；run16 首跑实锤配套）。
# mx-clean --apply 归档清走全部账号板（含 board.json），板供给在 mx-setup 第 5 段——
# 「clean 后首跑」路径缺供给即驱动步 5 必炸「板元数据缺失」。
# 判据：每个编制账号的全部账号板 board.json 在位且带 profiles 围栏。
# 供给面（缺板时执行，与 mx-setup 第 5 段同款幂等循环）：
#   source mux/mx-lib.sh; source mux/mx-scenario-lib.sh
#   for u in $(node_users); do for b in $(boards_of "$u"); do
#     slug="${b%%:*}"
#     HERMES_HOME="$HERMES_ROOT" "$HERMES_BIN" kanban boards create "$slug" --name "$slug"
#     set_board_team "$slug" "$(agent_profile "$u" "${b##*:}")"
#   done; done
set -u
LC_ALL=C
HERE="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$HERE/mux/mx-lib.sh" 2>/dev/null
# shellcheck disable=SC1091
source "$HERE/mux/mx-scenario-lib.sh"
miss=0
for u in $(node_users); do
  for b in $(boards_of "$u"); do
    slug="${b%%:*}"
    bj="$HERMES_ROOT/kanban/boards/$slug/board.json"
    if [[ ! -f "$bj" ]]; then
      echo "缺板 $slug"
      miss=$((miss+1))
    elif ! grep -q '"profiles"' "$bj" 2>/dev/null; then
      echo "缺围栏 $slug"
      miss=$((miss+1))
    fi
  done
done
# fleet-manifest（run16 首跑第二实锤：mx-clean 清走活树 manifest、无重建路径——
# people_reconcile 的 jq 对账必失败记单。恢复法：cp 归档件回活树并核用户数=编制数）。
FM="$SIM_ROOT/fleet-manifest.json"
_n_inst=$(node_users | wc -l | tr -d ' ')
if ! jq -e --argjson n "$_n_inst" '[.users[].user] | length == $n' "$FM" >/dev/null 2>&1; then
  echo "fleet-manifest 缺失或用户数≠编制（${_n_inst}）——cp 归档件回 $FM 或重跑 write_fleet_manifest"
  miss=$((miss+1))
fi
if [[ "$miss" -gt 0 ]]; then
  echo "账号板供给缺口 ${miss} 项（供给循环见本文件头注释）"
  exit 1
fi
echo "账号板供给齐（board.json+profiles 围栏+fleet-manifest）"
