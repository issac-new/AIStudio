#!/usr/bin/env bash
# test-r87-full-regression.sh — R87 全量回归轮缺陷修复变异锁（D3：_norm_ver 尾注截断）
#
# D3 实锤：codebase.md 版本表列带自然尾注（"4.5.14（devDep）"）时，_norm_ver 只剥 range
# 前缀不剥括号注记 → 基线≠当前假阳性 fail，且报错信息两侧显示相同版本（自相矛盾）。
# 修复：从第一个括号（全角（/半角(）起截断。本锁五向断言：
#   ① D3 修复面：带全角尾注基线 == 纯版本当前（修复前红）
#   ② D3 修复面：带半角尾注基线 == range 前缀当前（修复前红）
#   ③ 负向不误放：真实版本差仍被判不等（防修复过宽）
#   ④ R75-D2 语义保持：^5.7 == 5.7.0（数字段补齐不被本次修复破坏）
#   ⑤ RELEASE 语义保持：无括号形态 2.1.4.RELEASE 原样比较（括号截断不波及）
#   ⑥ e2e：mini codebase.md（注记列）+ 同版本 package.json → check_deps 通过
set -u
cd "$(dirname "${0}")/.." || exit 1
pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }

# --- 提取被测函数（提取失败=变异回归锚断裂）---
TMP="$(mktemp -d "${TMPDIR:-/tmp}/r87d3.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
sed -n '/^_norm_ver() {/,/^}/p' assets/gates-warn.sh > "$TMP/fn.sh"
grep -q '_norm_ver' "$TMP/fn.sh" \
  && ok "函数提取成功（变异回归锚在位）" \
  || { bad "提取失败（_norm_ver 被改名/移位）"; echo "PASS test-r87-full-regression (${pass} ok, ${fail} fail)"; exit 1; }

# 独立执行器：source 函数后比较两版本
ver_eq() { # $1=基线 $2=当前 → 0=相等
  bash -c "source '$TMP/fn.sh'; [[ \"\$(_norm_ver '$1')\" == \"\$(_norm_ver '$2')\" ]]"
}

ver_eq '4.5.14（devDep）' '4.5.14' \
  && ok "① 全角尾注基线 == 纯版本当前（D3 修复面）" \
  || bad "① 全角尾注仍判不等（D3 复发）"

ver_eq '4.5.14 (dev)' '^4.5.14' \
  && ok "② 半角尾注基线 == range 前缀当前（D3 修复面）" \
  || bad "② 半角尾注仍判不等（D3 复发）"

if ver_eq '4.5.14' '4.5.15'; then
  bad "③ 真实版本差被判相等（修复过宽——误放真变更）"
else
  ok "③ 真实版本差仍判不等（负向不误放）"
fi

ver_eq '^5.7' '5.7.0' \
  && ok "④ R75-D2 语义保持（^5.7 == 5.7.0）" \
  || bad "④ R75-D2 补齐语义被破坏"

ver_eq '2.1.4.RELEASE' '2.1.4.RELEASE' \
  && ok "⑤ RELEASE 无括号形态原样相等（截断不波及）" \
  || bad "⑤ RELEASE 形态被误伤"

# --- ⑥ e2e：check_deps 对注记基线不再 fail ---
mkdir -p "$TMP/proj" "$TMP/skill/references" "$TMP/skill/scripts"
cp assets/gates-warn.sh "$TMP/skill/scripts/"
cat > "$TMP/skill/references/codebase.md" <<'MD'
# codebase
| 组件 | 版本 | 说明 |
|------|------|------|
| vite | 4.5.14（devDep） | 构建器 |
| vue | 2.7.16 | 框架 |
MD
cat > "$TMP/proj/package.json" <<'JSON'
{
  "name": "mini",
  "devDependencies": { "vite": "4.5.14" },
  "dependencies": { "vue": "2.7.16" }
}
JSON
(cd "$TMP/proj" && git init -q . && git add -A && git -c user.email=t@t -c user.name=t commit -qm init) >/dev/null 2>&1
out=$(cd "$TMP/proj" && PROJECT_DIR="$TMP/proj" _CONF_DIR="$TMP/skill/scripts" \
  bash "$TMP/skill/scripts/gates-warn.sh" --deps 2>&1 || true)
# gates-warn.sh 可能需要 precheck 运行时环境；退化为函数级 e2e：直接调用 check_deps
if ! grep -q 'check_deps()' "$TMP/skill/scripts/gates-warn.sh"; then
  echo "  ⊹ e2e 跳过（gates-warn 独立运行需 precheck 环境）"
else
  # 24h 审查（2026-10-04）：原断言只查「依赖版本被变更」缺席——source 失败/函数
  # 未定义时输出为空，负向 grep 恒绿（空转守门；pass() 定义在 precheck.sh，
  # 原 sed 从 gates-warn.sh 提取恒为空，成功行从未真正出现）。改为：先补
  # pass/warn/fail 三垫片（gates-warn.sh 头注明示依赖 precheck 注入），再以
  # check_deps 自产的横幅行作正向标记——没跑到检查本体=红。
  e2e_out=$(cd "$TMP/proj" && bash -c "
    PROJECT_DIR='$TMP/proj'
    source '$TMP/skill/scripts/gates-warn.sh' 2>/dev/null || true
    SPEC_GLOB='docs/specs/*.md'
    pass() { echo \"PASS \$*\"; }
    warn() { echo \"WARN \$*\"; }
    fail() { echo \"FAIL \$*\"; }
    check_deps 2>&1" || true)
  if ! printf '%s' "$e2e_out" | grep -q '=== 依赖版本锁定检查'; then
    bad "⑥ e2e check_deps 未真正运行（源载失败/函数缺席——原版此处空转放绿）"
  elif printf '%s' "$e2e_out" | grep -q '依赖版本被变更'; then
    bad "⑥ e2e 注记基线仍报变更（check_deps 链路未吃到修复）"
  else
    ok "⑥ e2e check_deps 对注记基线零误报"
  fi
fi

echo "PASS test-r87-full-regression (${pass} ok, ${fail} fail)"
[[ $fail -eq 0 ]]
