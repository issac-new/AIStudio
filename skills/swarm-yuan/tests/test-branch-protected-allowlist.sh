#!/usr/bin/env bash
# test-branch-protected-allowlist.sh — branch 门保护分支白名单语义守门（2026-11-12 根治
# 「主检出在 main 跑 precheck 恒红→fail-gate-hook 锁死 Write/Edit」误报的配套回归）
# 语义契约：挡「保护分支上的实质开发改动」，不挡「检出恰在保护分支」——与仓工作流对齐
# （AGENTS.md 规则 3：worktree/feature 分支开发→main 合并→chore/docs 直提）。
#   放行：merge 态（MERGE_HEAD 在）/ 工作区零变更 / 变更全部命中 PROTECTED_BRANCH_ALLOW
#   拦截：白名单外实质改动（白名单未配置=任何变更都拦，既有安装不静默放宽）
# 覆盖：① fixture 组七态（main+src 拦 / main+docs 放 / main 零变更放 / legacy 全拦 /
#           master 拦 / feat 放 / 坏名拦）＋计数锁防夹具静默删除后空转假绿
#       ② merge 态放行端到端（冲突工作区＋MERGE_HEAD，白名单外源码仍绿）
#       ③ 静态锚：conf 模板默认白名单在位；gates-strict 与域源 branch.sh 双落位同步；
#           生成物 conf 随发白名单键（分发链不断链）
set -uo pipefail
BASE="$(cd "$(dirname "$0")/.." && pwd)"
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# ===== ① fixture 组七态 =====
LOG="$(mktemp "${TMPDIR:-/tmp}/brallow-fx.XXXXXX")"
if bash "$BASE/tests/run-gate-fixture.sh" branch >"$LOG" 2>&1; then
  ok "①a branch fixture 组全绿（main+src 拦 / main+docs 放 / main 零变更放 / legacy 全拦 / master 拦 / feat 放 / 坏名拦）"
else
  bad "①a branch fixture 组失败：$(tail -3 "$LOG")"
fi
grep -q '共 7，PASS 7，FAIL 0' "$LOG" \
  && ok "①b 夹具计数恰 7 且全过（防夹具静默删除后空转假绿）" \
  || bad "①b 夹具计数异常：$(grep '共' "$LOG")"
rm -f "$LOG"

# ===== ② merge 态放行（端到端：冲突工作区 + MERGE_HEAD → branch 门绿）=====
T="$(mktemp -d "${TMPDIR:-/tmp}/brallow.XXXXXX")"
trap 'rm -rf "${T}"' EXIT
S="$T/scripts"; mkdir -p "$S"
for _f in precheck.sh gates-strict.sh gates-warn.sh gates-advisory.sh gate-enforce-level.conf memory-backends.sh; do
  cp "$BASE/assets/$_f" "$S/$_f"
done
P="$T/proj"; mkdir -p "$P"
git init -q "$P" && git -C "$P" symbolic-ref HEAD refs/heads/main
git -C "$P" config user.email t@t.local && git -C "$P" config user.name t
printf 'base\n' > "$P/a.txt"; git -C "$P" add a.txt
git -C "$P" commit -qm 基线
git -C "$P" checkout -qb feat/x; printf 'feat\n' > "$P/a.txt"
git -C "$P" commit -qam feat改动
git -C "$P" checkout -q main; printf 'main\n' > "$P/a.txt"
git -C "$P" commit -qam main改动
if git -C "$P" merge feat/x >/dev/null 2>&1; then
  bad "② 前置失败：merge 未产生冲突（夹具自损，检查构造）"
else
  git -C "$P" rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1 \
    && ok "②a 前置：merge 冲突态在（MERGE_HEAD 存在）" \
    || bad "②a 前置异常：无 MERGE_HEAD"
fi
cat > "$S/precheck.conf" <<EOF
PROJECT_DIR="$P"
PROTECTED_BRANCHES=("main")
PROTECTED_BRANCH_ALLOW="*.md docs/**"
BRANCH_REGEX='^(feat|fix|refactor)/.+'
EOF
_out="$(bash "$S/precheck.sh" --branch 2>&1)"; _rc=$?
if [[ "$_rc" -eq 0 ]] && printf '%s' "$_out" | grep -q '保护分支 main：merge 态/零变更/仅白名单改动'; then
  ok "②b merge 态放行（冲突工作区白名单外源码仍绿，rc=0）"
else
  bad "②b merge 态被误拦（rc=${_rc}）：$(printf '%s' "$_out" | grep '分支' | head -2)"
fi
# 撤销 merge 态后，工作区再留白名单外改动 → 立即回到拦截态（放行仅限 merge 进行中；
# merge --abort 本身会把工作区还原成干净态，须另行制造改动才是有效对照）
git -C "$P" merge --abort
printf 'dev-on-main\n' > "$P/a.txt"
_out2="$(bash "$S/precheck.sh" --branch 2>&1)"; _rc2=$?
if [[ "$_rc2" -eq 1 ]] && printf '%s' "$_out2" | grep -q '保护分支 main 上有实质开发改动'; then
  ok "②c 非 merge 态的白名单外改动恢复拦截（放行仅限 merge 进行中）"
else
  bad "②c 非 merge 态未恢复拦截（rc=${_rc2}）"
fi

# ===== ③ 静态锚（conf 默认＋双落位＋生成物随发）=====
grep -qF 'PROTECTED_BRANCH_ALLOW="*.md docs/** .swarm-yuan/** vendor/**"' "$BASE/assets/precheck.conf" \
  && ok "③a conf 模板默认白名单在位（*.md＋docs/**＋.swarm-yuan/**＋vendor/**，对齐 AGENTS.md 规则 1/3）" \
  || bad "③a conf 模板缺 PROTECTED_BRANCH_ALLOW 默认值"
for _loc in assets/gates-strict.sh assets/gates/process/branch.sh; do
  grep -q '_branch_change_allowed' "$BASE/$_loc" && grep -q 'PROTECTED_BRANCH_ALLOW' "$BASE/$_loc" \
    && ok "③b ${_loc} 落位白名单判定（域源与扁平运行态同步）" \
    || bad "③b ${_loc} 缺 _branch_change_allowed/PROTECTED_BRANCH_ALLOW（双落位失同步）"
done
# 生成物随发：lite 档端到端生成 → conf 含白名单键（分发链不断链）
GP="$T/genproj"; mkdir -p "$GP/src"
printf '[package]\nname = "svcbr"\nversion = "0.1.0"\nedition = "2021"\n' > "$GP/Cargo.toml"
printf 'fn main() {}\n' > "$GP/src/main.rs"
GH="$T/genhome"; mkdir -p "$GH"
if HOME="$GH" bash "$BASE/scripts/generate-skill.sh" --profile lite svcbr "$GP" "$GP/.claude/skills" >/dev/null 2>&1 \
   && grep -qF 'PROTECTED_BRANCH_ALLOW=' "$GP/.claude/skills/svcbr/scripts/precheck.conf"; then
  ok "③c 生成物 conf 随发白名单键（生成器→产物分发链在位）"
else
  bad "③c 生成物 conf 缺 PROTECTED_BRANCH_ALLOW（分发断链）"
fi

if [[ "$FAIL" -eq 0 ]]; then echo "PASS test-branch-protected-allowlist"; else echo "FAIL test-branch-protected-allowlist"; exit 1; fi
