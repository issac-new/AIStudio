#!/usr/bin/env bash
# test-check-impact-baseline.sh — R25-PR2 回归锚：check_impact 基线短路
#
# 实仓回归实证（2026-09-12 flask/mybatis-3）：刚激活、无待审变更的存量项目基线跑
# --all-full 即红"未找到 spec 文档"——TOGAF"变更须做影响分析"前提是有变更。
# 修复：HEAD 在基点（_git_base）且工作区 clean → 放行；有变更 → 维持原 fail 语义。
set -uo pipefail
# GATES/ASSETS 须在 cd 舞步前定格：$0 为相对路径（cd tests 后裸文件名调用）时，
# cd 之后再解析 dirname 会在新 cwd 下失效（R30-D1：./.. 连升两级落到仓库根）
GATES="$(cd "$(dirname "${0}")/.." && pwd)/assets/gates-warn.sh"
ASSETS="$(cd "$(dirname "${0}")/.." && pwd)/assets"   # 态 5 用
cd "$(dirname "${0}")/.." || exit 1
TMP="$(mktemp -d /tmp/imp.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# stub 门禁输出函数 + check_impact 依赖（_git_base/_find_spec_file 与全局变量）
setup_stubs() {
  pass() { echo "PASS:$1" > "$TMP/out.txt"; }
  warn() { echo "WARN:$1" > "$TMP/out.txt"; }
  fail() { echo "FAIL:$1" > "$TMP/out.txt"; }
  _git_base() { git rev-parse --verify HEAD^{commit} 2>/dev/null || echo ""; }
  _find_spec_file() { return 1; }   # 无 spec（原实现此形态必 fail）
  SPEC_FILE=""; IMPACT_SPEC_FILE=""
  source "$GATES"
}

# --- 态 1：clean 基线（HEAD==base、工作区干净）→ 放行 ---
PROJ="$TMP/clean-proj"
mkdir -p "$PROJ" && cd "$PROJ"
git init -q && git config user.email t@t.local && git config user.name t
echo "x" > a.txt && git add -A && git commit -qm init
cd - >/dev/null
(cd "$PROJ" && setup_stubs && check_impact > /dev/null 2>&1)
grep -q "PASS:基线无待审变更" "$TMP/out.txt" 2>/dev/null \
  && ok "态1 clean 基线放行（不再要求 spec）" || bad "态1 基线仍红: $(cat "$TMP/out.txt" 2>/dev/null)"

# --- 态 1b：clean 基线 + 技能/账本未跟踪目录（实仓实证形态）→ 仍放行 ---
mkdir -p "$PROJ/.claude/skills/demo" "$PROJ/.swarm-yuan"
echo "skeleton" > "$PROJ/.claude/skills/demo/SKILL.md"
echo '{}' > "$PROJ/.swarm-yuan/decisions.jsonl"
(cd "$PROJ" && setup_stubs && check_impact > /dev/null 2>&1)
grep -q "PASS:基线无待审变更" "$TMP/out.txt" 2>/dev/null \
  && ok "态1b 技能/账本未跟踪目录不算待审变更（porcelain 目录形态）" || bad "态1b 仍被顶住: $(cat "$TMP/out.txt" 2>/dev/null)"

# --- 态 2：有脏工作区（待审变更）→ 维持原 fail 语义 ---
echo "pending change" >> "$PROJ/a.txt"
(cd "$PROJ" && setup_stubs && check_impact > /dev/null 2>&1)
grep -q "FAIL:未找到 spec 文档" "$TMP/out.txt" 2>/dev/null \
  && ok "态2 有待审变更仍拦（执法语义保持）" || bad "态2 有变更不拦: $(cat "$TMP/out.txt" 2>/dev/null)"

# --- 态 3：工作区 clean 但领先基点（feat 分支领先 main，模拟真实 _git_base=main）→ 维持拦 ---
cd "$PROJ" && git checkout -q -- a.txt && git checkout -qb feat && echo "committed change" > b.txt && git add -A && git commit -qm change
MAIN_SHA=$(git rev-parse master 2>/dev/null || git rev-parse main)
cd - >/dev/null
(cd "$PROJ" && setup_stubs && _git_base() { echo "$MAIN_SHA"; } && check_impact > /dev/null 2>&1)
grep -q "FAIL:未找到 spec 文档" "$TMP/out.txt" 2>/dev/null \
  && ok "态3 领先基点的提交仍拦" || bad "态3 领先提交不拦: $(cat "$TMP/out.txt" 2>/dev/null)"

# --- 态 4：非 git 目录 → 不短路（维持原 fail，防非 git 项目误放行）---
PROJ2="$TMP/nogit-proj"
mkdir -p "$PROJ2" && cd - >/dev/null
(cd "$PROJ2" && setup_stubs && check_impact > /dev/null 2>&1)
grep -q "FAIL:未找到 spec 文档" "$TMP/out.txt" 2>/dev/null \
  && ok "态4 非 git 目录维持原 fail" || bad "态4 非 git 目录误放行: $(cat "$TMP/out.txt" 2>/dev/null)"

# --- 态 5：真实 precheck 集成——set -euo pipefail 环境下干净基线不得崩 ---
# v2.13.2 回归实证：态 1-4 是 stub 形态（source gates-warn.sh，无 set -e），结构性测不出
# _imp_dirty 裸 grep 赋值在 porcelain 为空/全被豁免滤掉时退出 1 → pipefail 杀整个 precheck。
# 本态走真实 precheck.sh 端到端：干净仓 + --impact → 须 rc 0 且短路放行。
PROJ3="$TMP/real-precheck"
mkdir -p "$PROJ3/scripts" "$PROJ3/docs"
printf '# spec\n## 影响范围\n- x\n' > "$PROJ3/docs/spec.md"
for _f in precheck.sh gates-strict.sh gates-warn.sh gates-advisory.sh gate-enforce-level.conf; do
  cp "$ASSETS/$_f" "$PROJ3/scripts/$_f"
done
printf 'PROJECT_DIR="%s"\nIMPACT_SPEC_FILE="docs/spec.md"\n' "$PROJ3" > "$PROJ3/scripts/precheck.conf"
(cd "$PROJ3" && git init -q && git symbolic-ref HEAD refs/heads/main \
  && git config user.email t@t.local && git config user.name t \
  && git add -A && git commit -qm init)
out3=$( cd "$PROJ3" && bash scripts/precheck.sh --impact 2>&1 ); rc3=$?
[[ $rc3 -eq 0 ]] && printf '%s\n' "$out3" | grep -q '基线无待审变更' \
  && ok "态5 真实 precheck 干净基线不崩且短路放行" \
  || bad "态5 真实 precheck 崩溃或未放行（rc=${rc3}）: $(printf '%s\n' "$out3" | tail -3 | tr '\n' ' ')"

[[ $FAIL -eq 0 ]] && { echo "PASS test-check-impact-baseline"; exit 0; } || { echo "FAIL test-check-impact-baseline" >&2; exit 1; }
