#!/bin/bash
# retro-org-execution.test.sh — run31 组织执行三机制与 G2 重放起点守门
# 支持 AIPAY_SCENARIO_UNDER_TEST 指向变异副本：正常实现必须全绿，关键条件变异必须失败。
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SC="${AIPAY_SCENARIO_UNDER_TEST:-$HERE/aipay-scenario.sh}"
CTRL="$(mktemp -d /tmp/retro-org-execution.XXXXXX)" || exit 1
CTRL="$(cd "$CTRL" && pwd -P)"  # macOS git worktree list 返回 /private/tmp 物理路径，指纹计算须同源
trap 'rm -rf "$CTRL"' EXIT
fails=0
ok() { printf 'PASS %s\n' "$*"; }
bad() { printf 'FAIL %s\n' "$*"; fails=$((fails+1)); }
check() { # <condition...> <label>；调用方用 if 保护，不在此隐藏失败
  local _label="$1"; shift
  if "$@"; then ok "$_label"; else bad "$_label"; fi
}

FNS="$(sed -n '/# ORG_EXECUTION_HELPERS_BEGIN/,/# ORG_EXECUTION_HELPERS_END/p' "$SC")"
[[ -n "$FNS" ]] || { echo 'FAIL 组织执行函数块提取失败'; exit 1; }
eval "$FNS"

STATE="$CTRL/state.env"
ISSUES="$CTRL/issues.log"
DMS="$CTRL/dm.log"
NOTES="$CTRL/note.log"
HERMES_CALLS="$CTRL/hermes-calls.log"
export HERMES_CALLS
HERMES_ROOT="$CTRL/hermes"
HERMES_BIN="$CTRL/hermes-bin"
RFD_ID=RFD-001
mkdir -p "$HERMES_ROOT"
cat > "$HERMES_BIN" <<'STUB'
#!/bin/bash
printf '%s\n' "$*" >> "$HERMES_CALLS"
exit "${HERMES_ASSIGN_RC:-0}"
STUB
chmod +x "$HERMES_BIN"

sget() { grep -s "^$1=" "$STATE" 2>/dev/null | head -1 | cut -d= -f2-; return 0; }
sset() { grep -v "^$1=" "$STATE" 2>/dev/null > "$STATE.tmp" || true; printf '%s=%s\n' "$1" "$2" >> "$STATE.tmp"; mv "$STATE.tmp" "$STATE"; }
issue_once() {
  grep -qF "ISSUE|$1|$2|" "$ISSUES" 2>/dev/null && return 0
  printf 'ISSUE|%s|%s|%s\n' "$1" "$2" "$3" >> "$ISSUES"
}
dm_send_tracked() { printf 'DM|%s|%s|%s|%s\n' "$1" "$2" "$3" "${4:-}" >> "$DMS"; printf 'evt-stub'; }
load_token() { printf 'tok-fanfan'; }
mx_dm_send() { printf 'DM|%s|%s|%s\n' "$1" "$2" "$3" >> "$DMS"; printf 'evt-stub'; }
agent_mxid() { printf '@%s-agent:matrix.test' "$1"; }
note() { printf '%s\n' "$*" >> "$NOTES"; }
workspace() { printf '%s/workspaces/%s/aipaydev\n' "$CTRL" "$1"; }
# 复评卡年龄由用例控制；assign 仍走真实 HERMES_BIN stub 验证动作。
org_review_todo_created() { printf '%s\n' "${REVIEW_CREATED:-0}"; }

reset_obs() {
  : > "$STATE"; : > "$ISSUES"; : > "$DMS"; : > "$NOTES"; : > "$HERMES_CALLS"
}
reset_obs

# ── ① 强制验收锚：三要素+无提交声明，既有结论锚不破坏 ──
ANCHOR="$(org_fix_acceptance_anchor feat/SEC-X SEC-FIX-DONE t_sec_1)"
for _text in '完成定义=git commit 并 git push origin feat/SEC-X' 'SEC-FIX-DONE commit=<提交号> card=t_sec_1' '验收锚=分支名=feat/SEC-X＋提交号=<提交号>＋评审卡号=t_sec_1' '无提交=未完成' '禁止只回执不落地'; do
  if printf '%s' "$ANCHOR" | grep -qF "$_text"; then ok "验收锚含：$_text"; else bad "验收锚缺：$_text"; fi
done
for _text in '安全评审 FAIL 退回' 'G2 架构评审退回' 'G5 退回自动分派' 'G5 退回：' 'G3 补证：'; do
  grep -qF "$_text" "$SC" && ok "派修点保留：$_text" || bad "派修点缺失：$_text"
done
for _text in 'DEV-DONE-DEV-PAYCORE-C' 'SECURITY-GATE-PASS' 'ARCH-GATE-PASS' 'READY-GATE-PASS' 'FIX-DONE-<DEF-X>'; do
  grep -qF "$_text" "$SC" && ok "既有断言保留：$_text" || bad "既有断言丢失：$_text"
done
[[ "$(grep -c 'org_fix_acceptance_anchor' "$SC")" -ge 12 ]] \
  && ok '缺项修复派发点已批量接统一验收锚' || bad '统一验收锚接线点不足'

# ── ② G2 起点映射：只从未过闸位续跑，显式全链复演例外 ──
[[ "$(org_g2_replay_start smoke 1 '')" == archgate ]] && ok 'G2 smoke→archgate' || bad 'G2 smoke 未映射 archgate'
[[ "$(org_g2_replay_start review 1 '')" == archgate ]] && ok 'G2 review→archgate' || bad 'G2 review 未映射 archgate'
[[ "$(org_g2_replay_start archgate 1 '')" == archgate ]] && ok 'G2 archgate 保持' || bad 'G2 archgate 映射漂移'
[[ "$(org_g2_replay_start devimpl 1 '')" == devimpl ]] && ok '后续 START_STEP 不回退' || bad '后续 START_STEP 被误改'
[[ "$(org_g2_replay_start smoke '' '')" == smoke ]] && ok '系分未成仍从原起点' || bad '系分未成被误跳'
[[ "$(org_g2_replay_start smoke 1 1799999999)" == smoke ]] && ok 'G2 已过不重映射' || bad 'G2 已过被误跳'
[[ "$(org_g2_replay_start smoke 1 '' 1)" == smoke ]] && ok 'MX_FULL_REPLAY 人工全链复演保留' || bad '人工全链复演被误拦'
[[ "$(org_g2_replay_start smoke 1 '' 0 review)" == smoke ]] && ok 'UNTIL_STEP 截止 G2 前不形成空区间' || bad 'UNTIL_STEP 区间语义破坏'
grep -qF 'START_STEP="$(org_g2_replay_start' "$SC" && ok '场景入口实际接 G2 起点映射' || bad 'G2 映射函数未接场景入口'

# ── ③ WIP 纯判据：双时钟、阈值边界、非脏态 ──
org_wip_timeout_should_escalate 1 10000 8000 8000 1800 && ok 'WIP 达 1800s 双时钟触发' || bad 'WIP 达阈值未触发'
org_wip_timeout_should_escalate 1 10000 8000 9000 1800 && bad 'WIP 脏态不足阈值误触发' || ok 'WIP 新脏态不立即误报'
org_wip_timeout_should_escalate 1 10000 9000 8000 1800 && bad 'WIP HEAD 年龄不足误触发' || ok 'WIP 新 HEAD 不误报'
org_wip_timeout_should_escalate 0 10000 8000 8000 1800 && bad '干净工作区误报 WIP' || ok '干净工作区不触发'

# 真实 git 主工作区+linked worktree：首次武装、超时升级、同指纹幂等、新 HEAD 复位。
REPO="$CTRL/workspaces/chen/aipaydev"
LINKED="$CTRL/chen-fix-wip"
DIRECTOR_CLONE="$REPO"
mkdir -p "$(dirname "$REPO")"
git init -q -b main "$REPO"
git -C "$REPO" config user.email retro@test.invalid
git -C "$REPO" config user.name retro-test
printf 'base\n' > "$REPO/file.txt"
git -C "$REPO" add file.txt
GIT_AUTHOR_DATE='2001-09-09T01:46:40Z' GIT_COMMITTER_DATE='2001-09-09T01:46:40Z' git -C "$REPO" commit -q -m 'test: base'
git -C "$REPO" update-ref refs/remotes/origin/main HEAD
git -C "$REPO" update-ref refs/remotes/origin/integration/RFD-001 HEAD
git -C "$REPO" worktree add -q -b fix/wip "$LINKED"
printf 'dirty-one\n' >> "$LINKED/file.txt"
sset security_rgid t_sec_1
NOW=2000000000
org_wip_scan_owner chen "$NOW" 1800
[[ ! -s "$DMS" ]] && ok 'WIP 首次发现只武装不告警' || bad 'WIP 首次发现即误告警'
WKEY="$(printf '%s' "$LINKED" | shasum | cut -c1-16)"
sset "org_wip_seen_${WKEY}" $((NOW-1800))
org_wip_scan_owner chen "$NOW" 1800
[[ "$(grep -cF 'ISSUE|wip-timeout|' "$ISSUES")" -eq 1 && "$(grep -c '^DM|' "$DMS")" -eq 2 ]] \
  && ok 'WIP 超时记 issue＋导演台/属主双 DM' || bad 'WIP 超时升级动作不符'
grep -qF '分支名=fix/wip' "$DMS" && grep -qF '评审卡号=t_sec_1' "$DMS" && grep -qF '无提交=未完成' "$DMS" \
  && ok 'WIP DM 带分支/提交/卡锚' || bad 'WIP DM 验收锚不全'
org_wip_scan_owner chen "$NOW" 1800
[[ "$(grep -cF 'ISSUE|wip-timeout|' "$ISSUES")" -eq 1 && "$(grep -c '^DM|' "$DMS")" -eq 2 ]] \
  && ok 'WIP 同工作区同指纹只告警一次' || bad 'WIP 同指纹重复告警'
# 新提交后仍有脏改：HEAD 变化重新武装，不能沿用旧超时。
git -C "$LINKED" add file.txt
GIT_AUTHOR_DATE='2033-04-01T00:00:00Z' GIT_COMMITTER_DATE='2033-04-01T00:00:00Z' git -C "$LINKED" commit -q -m 'fix: checkpoint'
printf 'dirty-two\n' >> "$LINKED/file.txt"
org_wip_scan_owner chen "$NOW" 1800
[[ "$(grep -c '^DM|' "$DMS")" -eq 2 ]] && ok 'WIP 新 HEAD 后重新计时' || bad 'WIP 新 HEAD 未复位'

# ── ④ 复审代位：todo+1800s 才 assign+DM，同卡幂等 ──
org_review_timeout_should_delegate todo 10000 8200 1800 && ok '复审 todo 达阈值纯判据触发' || bad '复审达阈值纯判据未触发'
org_review_timeout_should_delegate running 10000 8200 1800 && bad '复审非 todo 纯判据误触发' || ok '复审非 todo 不触发'
org_review_timeout_should_delegate todo 10000 8201 1800 && bad '复审未达阈值纯判据误触发' || ok '复审未达阈值不触发'
reset_obs
REVIEW_CREATED=8201
org_review_delegate_card arch arch-governance t_arch_1 arch-governance-reviewer ARCH-GATE main 10000 1800
[[ ! -s "$HERMES_CALLS" && ! -s "$DMS" ]] && ok '复审未达阈值不代位' || bad '复审未达阈值误代位'
REVIEW_CREATED=8200
org_review_delegate_card arch arch-governance t_arch_1 arch-governance-reviewer ARCH-GATE main 10000 1800
grep -qF 'kanban --board arch-governance assign t_arch_1 arch-governance-reviewer' "$HERMES_CALLS" \
  && ok '复审超时导演台实际 assign owner' || bad '复审超时未 assign owner'
grep -qF '评审卡 t_arch_1@arch-governance' "$DMS" && grep -qF 'ARCH-GATE-PASS' "$DMS" && grep -qF '分支名=main' "$DMS" \
  && ok '复审 DM 带卡锚/判词/分支提交锚' || bad '复审 DM 任务书锚不全'
[[ "$(grep -cF 'ISSUE|review-todo-timeout|t_arch_1|' "$ISSUES")" -eq 1 ]] && ok '复审超时 issue 留痕' || bad '复审超时缺 issue'
org_review_delegate_card arch arch-governance t_arch_1 arch-governance-reviewer ARCH-GATE main 10000 1800
[[ "$(grep -c '^DM|' "$DMS")" -eq 1 && "$(wc -l < "$HERMES_CALLS" | tr -d ' ')" -eq 1 ]] \
  && ok '复审同卡同创建时间只代位一次' || bad '复审代位重复派发'
REVIEW_CREATED=0
org_review_delegate_card arch arch-governance t_arch_other arch-governance-reviewer ARCH-GATE main 10000 1800
[[ "$(grep -c '^DM|' "$DMS")" -eq 1 ]] && ok '非 todo/时间缺席不猜龄代位' || bad '非 todo 被误代位'

# ── ⑤ 等待环实际接线：复用 MX_TICK_FN，不新增守护进程 ──
grep -qF 'MX_TICK_FN=org_execution_watch_once' "$SC" && ok 'G2 等待环接组织巡检' || bad 'G2 等待环未接组织巡检'
grep -qF '_stage_tick() { pretest_prestart_once; dependency_watch_once; org_execution_watch_once; }' "$SC" \
  && ok '缺陷/测试等待 tick 接组织巡检' || bad '缺陷等待 tick 未接组织巡检'
grep -qF '_g5_tick() { mx_prep_early_start_tick; pretest_prestart_once; dependency_watch_once; org_execution_watch_once; }' "$SC" \
  && ok 'G5 等待 tick 接组织巡检' || bad 'G5 等待 tick 未接组织巡检'

if (( fails == 0 )); then echo 'retro-org-execution: ALL-PASS'; else echo "retro-org-execution: ${fails} FAIL"; exit 1; fi
