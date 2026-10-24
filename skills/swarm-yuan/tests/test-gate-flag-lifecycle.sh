#!/usr/bin/env bash
# test-gate-flag-lifecycle.sh — R126：.gate-fail-flag 生命周期收敛回归锁
#
# 协议（R126 根治后）：
#   写：任何门禁运行 FAIL>0 → precheck 末尾写 flag（tmp+mv 原子替换）。
#   清：仅「覆盖式运行」（--all/--all-full/--compliance-suite，含补跑）且 FAIL==0 → precheck rm。
#   hook（fail-gate-hook.sh）不再按命令文本清 flag（权属收敛，见 hook 头注释第 3 条）。
#
# 修复前缺陷（R126 审计发现）：
#   ① hook PostToolUse「含 precheck.sh 的命令 exit 0 即 rm」——--fix-suggest（FAIL>0 也 exit 0）、
#     --doctor、单门禁绿、cat precheck.sh 都解锁（fail-gate-hook.sh 旧 :370）。
#   ② precheck 单门禁模式 FAIL==0 也 rm 全局 flag（局部绿灯抹全局状态）。
#   ③ 单门禁 fail 经 set -e 直退，汇总与 flag 写入被跳过（hook 拿不到 FAIL_IDS）。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
BASE="$(pwd)"
TMP="$(mktemp -d /tmp/gfl.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# ===== 夹具：最小项目 + 开发态门禁套件（布局同 run-gate-fixture.sh） =====
P="$TMP/proj"
mkdir -p "$P/scripts" "$P/docs" "$P/src" "$P/.swarm-yuan"
for _f in precheck.sh gates-strict.sh gates-warn.sh gates-advisory.sh memory-backends.sh gate-enforce-level.conf; do
  cp "$BASE/assets/$_f" "$P/scripts/$_f"
done
[[ -f "$BASE/scripts/diagram-check.sh" ]] && cp "$BASE/scripts/diagram-check.sh" "$P/scripts/diagram-check.sh"
cat > "$P/scripts/precheck.conf" <<EOF
PROJECT_DIR="$P"
BRANCH_REGEX='.*'
PROTECTED_BRANCHES=()
SECURITY_TOOL="builtin"
WRITABLE_DIRS=("src")
SCAN_DIRS=()
IMPACT_SPEC_FILE="$P/docs/impact-spec.md"
EOF
cat > "$P/docs/impact-spec.md" <<'EOF'
# spec
## 影响范围
src/
EOF
FLAG_FILE="$P/.swarm-yuan/.gate-fail-flag"

# 态1：单门禁 fail（--security 内置检出 eval）→ rc 非 0 且 flag 写入真实 FAIL_IDS
# （修复前：set -e 直退，flag 不写——hook 白名单交集拿不到清单）
printf 'const x = eval("1+1");\n' > "$P/src/app.js"
out="$(bash "$P/scripts/precheck.sh" --security 2>&1)"; rc=$?
[[ $rc -ne 0 ]] && ok "态1 单门禁 fail rc 非 0（实际 ${rc}）" || bad "态1 单门禁 fail rc=${rc}"
if [[ -f "$FLAG_FILE" ]] && grep -q '不安全动态代码执行' "$FLAG_FILE"; then
  ok "态1 单门禁 fail 写 flag 且含真实 fail id（内置门禁 id=检出消息本体）"
else
  bad "态1 flag 未写或缺 id（$(cat "$FLAG_FILE" 2>/dev/null)）"
fi
printf '%s' "$out" | grep -q '门禁检查未通过' \
  && ok "态1 单门禁 fail 走完整汇总（修复建议在列）" || bad "态1 单门禁 fail 仍静默直退"

# 态2：单门禁绿不清 flag（修复前：任何模式 FAIL==0 都 rm——局部绿灯抹全局标记）
printf 'const x = 1 + 1;\n' > "$P/src/app.js"
out="$(bash "$P/scripts/precheck.sh" --security 2>&1)"; rc=$?
[[ $rc -eq 0 ]] && ok "态2 单门禁绿 rc=0" || bad "态2 单门禁绿 rc=$rc"
[[ -f "$FLAG_FILE" ]] && ok "态2 单门禁绿不清 flag（权属=覆盖式运行）" || bad "态2 单门禁绿误清 flag"

# 态3：覆盖式运行绿清 flag（修复后解锁的唯一通道）
out="$(bash "$P/scripts/precheck.sh" --all 2>&1)"; rc=$?
[[ $rc -eq 0 ]] && ok "态3 --all 绿 rc=0" || bad "态3 --all rc=${rc}：$out"
[[ ! -f "$FLAG_FILE" ]] && ok "态3 覆盖式绿清 flag（修复后解锁）" || bad "态3 覆盖式绿未清 flag"

# 态4：覆盖式红重写 flag（写侧对称）
printf 'const x = eval("1+1");\n' > "$P/src/app.js"
out="$(bash "$P/scripts/precheck.sh" --all 2>&1)"; rc=$?
[[ $rc -ne 0 && -f "$FLAG_FILE" ]] && grep -q '不安全动态代码执行' "$FLAG_FILE" \
  && ok "态4 覆盖式红写 flag" || bad "态4 --all fail rc=${rc} flag=$(cat "$FLAG_FILE" 2>/dev/null)"

# 态5：flag 写入原子性（静态断言：tmp+mv 同目录原子替换，无截断直写）
grep -q '\.gate-fail-flag\.tmp\.' "$BASE/assets/precheck.sh" \
  && grep -q 'mv -f "\$_flag_tmp"' "$BASE/assets/precheck.sh" \
  && ok "态5 flag 写入 tmp+mv 原子化" || bad "态5 flag 仍截断直写"

# 态6：hook 侧契约静态断言（PostToolUse 不再有 rm -f "$FLAG" 清标记分支）
! sed -n '/PostToolUse Bash/,/^fi$/p' "$BASE/assets/hooks/fail-gate-hook.sh" | grep -q 'rm -f "\$FLAG"' \
  && ok "态6 hook PostToolUse 无按文本清 flag 分支" || bad "态6 hook 仍残留文本清 flag"

echo ""
if [[ $FAIL -eq 0 ]]; then
  echo "✓ test-gate-flag-lifecycle 全绿（flag 生命周期：写=任何 fail；清=仅覆盖式绿；hook 不按文本清）"
else
  echo "✗ test-gate-flag-lifecycle 存在失败项" >&2
fi
exit $FAIL
