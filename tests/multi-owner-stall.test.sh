#!/bin/bash
# multi-owner-stall.test.sh — 分桶判活守门（run19 根治件配套）
# 三场景（违一即 FAIL）：
#   ①个体催办隔离：aa 活/aa 静默双锚中 bb 静默过半 → 催办只 @bb（aa 被 bb 外的
#     活跃掩盖的历史形态——原实现永不催，分桶后按人催）；aa 活着不判死（防误杀）。
#   ②全员静默判死：aa/bb 都个体静默满 idle → 组级判死（保持原防误杀语义：
#     全员静默才杀），MX_MULTI_FAILED_LEGS 齐全。
#   ③复活重新武装：bb 被催后复活（日志增长）→ nudged 复位；再静默 → 可再催。
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fails=0

FN_SRC="$(sed -n '/^wait_alive_truth_multi()/,/^}/p' "$HERE/mux/mx-scenario-lib.sh")"
[[ -n "$FN_SRC" ]] || { echo "FAIL 提取 wait_alive_truth_multi 失败"; exit 1; }

CTRL="$(mktemp -d /tmp/multi-owner-stall.XXXXXX)" || exit 1
trap '[[ -n "${BG_PID:-}" ]] && kill "$BG_PID" 2>/dev/null; rm -rf "$CTRL"' EXIT
export HERMES_ROOT="$CTRL/hermes"
export MX_POLL_IVAL=1 MX_NUDGE_MIN_HALF=2 MX_ALIVE_HARD_SEC=16
export SCAN_ROOM="" MX_PROGRESS_FN=""

# ── stub 外部面 ──
note() { printf '%s\n' "$*" >> "$CTRL/note.log"; }
mx_send() { printf 'ROOM=%s|MENTION=%s|TEXT=%s\n' "$2" "$4" "$3" >> "$CTRL/sent.log"; printf 'evt-stub'; }
load_token() { printf 'tok-stub'; }
sget() { [[ "$1" = room_analysis ]] && printf '!room:stub'; }
agent_mxid() { printf '@%s-agent:stub' "$1"; }
auto_approve() { :; }
_nudge_branch_intel() { :; }
hb_refresh_cache() { return 1; }
hb_all_ok() { return 1; }
hb_agent_lw() { echo 0; }
hb_any_stalled() { return 1; }
hb_is_remote() { return 1; }
wait_truth() { return 1; }
# 判活面 stub：按 profile 名读 CTRL/<agent>.ts 的 epoch（测试控制活动/静默）
_agent_log_last_work_ts() {
  local f="$CTRL/$(basename "$(dirname "$(dirname "$1")")").ts"
  [[ -f "$f" ]] && cat "$f" || echo 0
}
eval "$FN_SRC"

mkdir -p "$HERMES_ROOT/profiles/aa/logs" "$HERMES_ROOT/profiles/bb/logs"
touch "$HERMES_ROOT/profiles/aa/logs/agent.log" "$HERMES_ROOT/profiles/bb/logs/agent.log"

run_case() { # <anchors...>（锚直接透传，无 case-name）
  : > "$CTRL/note.log"; : > "$CTRL/sent.log"
  MX_MULTI_FAILED_LEGS=""
  wait_alive_truth_multi 4 "aa,bb" "$@"
  return $?
}

NOW=$(date +%s)

# ── ① aa 持续活动 / bb 静默 1h → 只催 bb、不判死（硬窗满退出）──
echo $((NOW)) > "$CTRL/aa.ts"
echo $((NOW-3600)) > "$CTRL/bb.ts"
( while :; do date +%s > "$CTRL/aa.ts"; sleep 1; done ) &
BG_PID=$!
RC=0; run_case "锚A@aa@false" "锚B@bb@false" || RC=$?
kill "$BG_PID" 2>/dev/null; wait "$BG_PID" 2>/dev/null; BG_PID=""
S1=$(grep -c 'MENTION=@bb-agent' "$CTRL/sent.log" || true)
S1_AA=$(grep -c 'MENTION=.*aa-agent' "$CTRL/sent.log" || true)
if [[ "$RC" -ne 0 && "$S1" -ge 1 && "$S1_AA" -eq 0 ]] && grep -q "个体静默过半.*bb" "$CTRL/note.log" && grep -q "硬窗" "$CTRL/note.log"; then
  echo "PASS ① 催办只 @bb（aa 活跃不再掩盖）；aa 活着未判死（硬窗满退出）"
else echo "FAIL ① rc=$RC 催bb=$S1 催aa=$S1_AA note=$(tail -3 "$CTRL/note.log" | tr '\n' ';')"; fails=1; fi

# ── ② 双双静默满 idle → 组级判死，FAILED_LEGS 齐 ──
echo $((NOW-7200)) > "$CTRL/aa.ts"
echo $((NOW-7200)) > "$CTRL/bb.ts"
RC=0; run_case "锚A@aa@false" "锚B@bb@false" || RC=$?
if [[ "$RC" -eq 1 && "$MX_MULTI_FAILED_LEGS" = "锚A,锚B" ]] && grep -q "个体空转全员静默" "$CTRL/note.log"; then
  echo "PASS ② 全员个体静默才判死（防误杀语义保持），FAILED_LEGS=锚A,锚B"
else echo "FAIL ② rc=$RC legs=$MX_MULTI_FAILED_LEGS"; fails=1; fi

# ── ③ bb 被催→复活→再静默 → 第二次催（重新武装）──
echo $((NOW)) > "$CTRL/aa.ts"
echo $((NOW-3600)) > "$CTRL/bb.ts"
( while :; do date +%s > "$CTRL/aa.ts"; sleep 1; done ) &
BG_PID=$!
# bb 静默 3 秒（过半被催）→ 复活 2 秒 → 再静默 4 秒（应再催）
( sleep 6; date +%s > "$CTRL/bb.ts" ) &
RC=0; run_case "锚B@bb@false" "锚A@aa@false" || RC=$?
kill "$BG_PID" 2>/dev/null; wait "$BG_PID" 2>/dev/null; BG_PID=""
S3=$(grep -c 'MENTION=@bb-agent' "$CTRL/sent.log" || true)
if [[ "$S3" -ge 2 ]]; then
  echo "PASS ③ 复活重置 nudged、再静默可再催（共 $S3 次）"
else echo "FAIL ③ 催bb次数=$S3（应≥2）sent=$(cat "$CTRL/sent.log" 2>/dev/null | tr '\n' ';')"; fails=1; fi

(( fails == 0 )) && echo "ALL-PASS" || { echo "HAS-FAIL"; exit 1; }
