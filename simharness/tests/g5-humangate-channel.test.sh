#!/bin/bash
# g5-humangate-channel.test.sh — G5 HumanGate 产品通道三函数守门（2026-10-31 产品收尾批）
# 覆盖：注册取 id/注册失败记单、decide 成功/404 幂等分诊/真失败记单、历史探测命中/缺席记单。
# 实现单一事实源=mx-scenario-lib.sh 三函数（sed 提取执行，stub studio/note/issue_once）。
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fails=0
CTRL="$(mktemp -d /tmp/g5-hg-chan.XXXXXX)" || exit 1
trap 'rm -rf "$CTRL"' EXIT

# ── 提取被测函数（venv-packages-preflight.test.sh 同款模式）──
FNS="$(sed -n '/^g5_humangate_register()/,/^}/p; /^g5_humangate_decide()/,/^}/p; /^g5_humangate_history_probe()/,/^}/p' "$HERE/mux/mx-scenario-lib.sh")"
[[ "$(printf '%s\n' "$FNS" | grep -c '^g5_humangate_')" -eq 3 ]] || { echo "FAIL 提取三函数失败"; exit 1; }

# ── stub 外部面 ──
STUDIO_LOG="$CTRL/studio.log"; NOTE_LOG="$CTRL/note.log"; ISSUE_LOG="$CTRL/issue.log"
: > "$STUDIO_LOG"; : > "$NOTE_LOG"; : > "$ISSUE_LOG"
MODE="" # reg-ok|reg-empty|decide-ok|decide-404|decide-fail|probe-hit|probe-miss
studio() { # <method> <path> [jwt] [body]
  printf '%s %s\n' "$1" "$2" >> "$STUDIO_LOG"
  case "$2" in
    /api/approvals/human-gate/)
      case "$MODE" in
        reg-ok)    printf '{"ok":true,"request":{"id":"hg-run-card-1","status":"pending"}}' ;;
        *)         printf '{"ok":false}' ;;
      esac ;;
    /api/approvals/human-gate/hg-run-card-1/decide)
      case "$MODE" in decide-ok) return 0 ;; *) return 1 ;; esac ;;
    /api/approvals/history*)
      case "$MODE" in probe-hit) printf '"entries":[{"targetId":"t_e492c92f","decision":"approved"}]' ;;
        *) printf '"entries":[]' ;; esac ;;
  esac
}
note() { printf '%s\n' "$*" >> "$NOTE_LOG"; }
issue_once() { printf '%s|%s|%s\n' "$1" "$2" "$3" >> "$ISSUE_LOG"; }

eval "$FNS"

# ── ① 注册成功：取 id＋note＋走对端点 ──
MODE=reg-ok
OUT="$(g5_humangate_register "tok1" "t_e492c92f" "20261101-v8-run24" "G5 发布准出 · RFD-001" "posture=standard")"
if [[ "$OUT" == "hg-run-card-1" ]] && grep -q '批准单已注册' "$NOTE_LOG" \
   && grep -q '^POST /api/approvals/human-gate/$' "$STUDIO_LOG" \
   && ! grep -q 'g5-humangate-register-failed' "$ISSUE_LOG"; then
  echo "PASS ① 注册成功取 id＋收件箱端点＋零记单"
else
  echo "FAIL ① 注册形态（out=${OUT}）"; fails=$((fails+1))
fi

# ── ② 注册失败：空 id＋记单不阻断 ──
: > "$NOTE_LOG"; : > "$ISSUE_LOG"
MODE=reg-empty
OUT="$(g5_humangate_register "tok1" "t_e492c92f" "r" "t" "d")"
if [[ -z "$(printf '%s' "$OUT" | head -1)" ]] && grep -q 'g5-humangate-register-failed' "$ISSUE_LOG"; then
  echo "PASS ② 注册失败记单不阻断"
else
  echo "FAIL ② 注册失败形态（out=${OUT}）"; fails=$((fails+1))
fi

# ── ③ decide 成功：rc0＋台账 note ──
: > "$NOTE_LOG"; : > "$ISSUE_LOG"
MODE=decide-ok
if g5_humangate_decide "tok1" "hg-run-card-1" "standard 代批" \
   && grep -q '代批已落产品审批台账' "$NOTE_LOG" && ! grep -q 'decide-failed' "$ISSUE_LOG"; then
  echo "PASS ③ decide 成功 rc0＋留痕 note"
else
  echo "FAIL ③ decide 成功形态"; fails=$((fails+1))
fi

# ── ④ decide 失败但批准单在册（404 已裁决幂等）：rc0＋幂等 note＋零记单 ──
: > "$NOTE_LOG"; : > "$ISSUE_LOG"
MODE=decide-404
studio_list_override() { printf '{"ok":true,"requests":[{"id":"hg-run-card-1","status":"approved"}]}'; }
# 内联覆写分诊用的 GET 返回（studio stub 对 /api/approvals/human-gate/ 的 GET 走 reg 分支会
# 给 ok:false——404 分诊真实语义=GET 列表含该 id 即幂等；这里以 MODE=decide-404 供 stub 返回在册）
studio() {
  printf '%s %s\n' "$1" "$2" >> "$STUDIO_LOG"
  case "$2" in
    /api/approvals/human-gate/hg-run-card-1/decide) return 1 ;;
    /api/approvals/human-gate/) [[ "$1" == GET ]] && printf '{"requests":[{"id":"hg-run-card-1","status":"approved"}]}' ;;
  esac
}
if g5_humangate_decide "tok1" "hg-run-card-1" "standard 代批" \
   && grep -q '幂等' "$NOTE_LOG" && ! grep -q 'decide-failed' "$ISSUE_LOG"; then
  echo "PASS ④ decide 404 在册=幂等 rc0"
else
  echo "FAIL ④ 幂等分诊"; fails=$((fails+1))
fi

# ── ⑤ decide 真失败（不在册）：rc1＋记单 ──
: > "$NOTE_LOG"; : > "$ISSUE_LOG"
studio() {
  printf '%s %s\n' "$1" "$2" >> "$STUDIO_LOG"
  case "$2" in
    /api/approvals/human-gate/hg-run-card-1/decide) return 1 ;;
    /api/approvals/human-gate/) printf '{"requests":[]}' ;;
  esac
}
if g5_humangate_decide "tok1" "hg-run-card-1" "standard 代批"; then
  echo "FAIL ⑤ 真失败应 rc1"; fails=$((fails+1))
elif grep -q 'g5-approval-decide-failed' "$ISSUE_LOG"; then
  echo "PASS ⑤ decide 真失败 rc1＋记单"
else
  echo "FAIL ⑤ 记单缺失"; fails=$((fails+1))
fi

# ── ⑥⑦ 探测命中/缺席 ──
studio() {
  printf '%s %s\n' "$1" "$2" >> "$STUDIO_LOG"
  case "$MODE" in
    probe-hit) printf '"entries":[{"targetId":"t_e492c92f"}]' ;;
    *) printf '"entries":[]' ;;
  esac
}
: > "$NOTE_LOG"; : > "$ISSUE_LOG"
MODE=probe-hit
g5_humangate_history_probe "tok1" "t_e492c92f"
MODE=probe-miss
g5_humangate_history_probe "tok1" "t_e492c92f"
if grep -q '产品审批历史在案' "$NOTE_LOG" && grep -q 'g5-approval-history-missing' "$ISSUE_LOG"; then
  echo "PASS ⑥⑦ 探测命中 note／缺席记单"
else
  echo "FAIL ⑥⑦ 探测形态"; fails=$((fails+1))
fi

# 射手接线断言：aipay-scenario G5 块必须调三函数（漏接线=函数成孤儿）
grep -q 'g5_humangate_register "$_g5_tok"' "$HERE/aipay-scenario.sh" \
  && grep -q 'g5_humangate_decide "$_g5_tok"' "$HERE/aipay-scenario.sh" \
  && grep -q 'g5_humangate_history_probe "$_rel_tok"' "$HERE/aipay-scenario.sh" \
  && echo "PASS ⑧ 场景脚本三调用点在位" \
  || { echo "FAIL ⑧ aipay-scenario 未接三函数"; fails=$((fails+1)); }

[ "$fails" -eq 0 ] && echo "g5-humangate-channel: ALL-PASS" || { echo "g5-humangate-channel: ${fails} FAIL"; exit 1; }
