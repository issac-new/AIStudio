#!/usr/bin/env bash
# test-capability-map-g25.sh — G25 文档索引断言族变异回归断言（R54 全面排查轮）
#
# 缺口背景：G25 六断言（载体/孤儿/幽灵/互指/文档路由覆盖/分发范围）是 warn 级自检，
# 此前零测试覆盖——断言被重构弄坏（grep 模式改错/检查段被删）会"永远绿"。
# 按 R44 先例（warn 级断言须负向断言），本测试逐态注入违规证明六断言真的能拦：
#   态0 正向：真实三件（map/router/UNIVERSAL 块）原样 → 六 ✓ 全出、零 warn
#   态1 孤儿：references 放 map 未收录档 → 须 warn"孤儿档"
#   态2 幽灵：map 追加不存在档名的表行 → 须 warn"幽灵档"
#   态3 分派落档：router 抹掉一个方法论档名 → 须 warn"分派落档"
#   态4 随技能分发缺口：UNIVERSAL 块删一个已分派档 → 须 warn"随技能分发缺口"
# 变异回归锚：函数经 sed 从 self-check.sh 提取（改名/移位即提取失败 → 红）。
#
# 用法: bash tests/test-capability-map-g25.sh
set -u
cd "$(dirname "${0}")/.." || exit 1
TMP="$(mktemp -d "${TMPDIR:-/tmp}/swarm-g25.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }

# --- 提取被测函数（提取失败=变异回归锚断裂，直接红）---
sed -n '/^check_capability_map_wiring() {/,/^}/p' scripts/self-check.sh > "$TMP/g25fn.sh"
grep -q 'check_capability_map_wiring' "$TMP/g25fn.sh" \
  && ok "G25 函数提取成功（变异回归锚在位）" \
  || { bad "G25 函数提取失败（check_capability_map_wiring 被改名/移位）"; echo "PASS test-capability-map-g25 (${pass} ok, ${fail} fail)"; exit 1; }

# --- 造最小 base（真三件：map/router/UNIVERSAL 块 + 13 方法论档 + SKILL.md）---
mk_base() {
  rm -rf "$TMP/base"; mkdir -p "$TMP/base/references" "$TMP/base/scripts"
  cp references/*.md "$TMP/base/references/"
  sed -n '/^UNIVERSAL_FILES=(/,/^)/p' scripts/generate-skill.sh > "$TMP/base/scripts/generate-skill.sh"
  echo "capability-map" > "$TMP/base/SKILL.md"
  # harness 放 base/scripts/ —— 函数内 base=$(dirname $0)/.. 由此解析到 base/
  { echo '#!/usr/bin/env bash'; echo 'warn() { echo "WARNHIT|$1"; }';
    echo '. "$(dirname "$0")/../../g25fn.sh" >/dev/null 2>&1 || exit 9';
    echo 'check_capability_map_wiring'; } > "$TMP/base/scripts/harness.sh"
}

run_g25() { bash "$TMP/base/scripts/harness.sh" 2>&1; }

# --- 态0 正向：六 ✓ 全出、零 WARNHIT ---
mk_base
out=$(run_g25)
if printf '%s' "$out" | grep -q '文档索引双向一致性校验通过' && ! printf '%s' "$out" | grep -q 'WARNHIT'; then
  ok "态0 正向：六断言全绿、零 warn"
else
  bad "态0 应全绿却出 warn：${out}"
fi
# 六面机器存在性：正向输出必须含六个 ✓ 标签（断言段被删即红）
for label in '存在且非空' '未登记文档检查' '失效引用检查' '两级互指' '文档路由覆盖' '分发范围'; do
  printf '%s' "$out" | grep -q "$label" && ok "态0 含断言面：${label}" || bad "态0 缺断言面：${label}（检查段被删）"
done

# --- 态1 孤儿：map 未收录档 → 须 warn 孤儿档 ---
mk_base
echo "x" > "$TMP/base/references/zz-orphan-doc.md"
out=$(run_g25)
printf '%s' "$out" | grep -q 'WARNHIT|G25 孤儿档' \
  && ok "态1 孤儿档被拦（map 未收录档现形）" || bad "态1 孤儿注入未拦：${out}"

# --- 态2 幽灵：map 追加不存在档的表行 → 须 warn 幽灵档 ---
mk_base
printf '| ghost-fake-doc | 测试注入（R54 变异回归断言） | 开发工作流 | 触发 |\n' >> "$TMP/base/references/capability-map.md"
out=$(run_g25)
printf '%s' "$out" | grep -q 'WARNHIT|G25 幽灵档' \
  && ok "态2 幽灵档被拦（清单登记不存在档现形）" || bad "态2 幽灵注入未拦：${out}"

# --- 态3 分派落档：router 抹掉一个方法论档名 → 须 warn 分派落档 ---
mk_base
sed 's/togaf-metamodel-methodology/togaf-metamodel-methodoX/g' \
  "$TMP/base/references/task-methodology-router.md" > "$TMP/t" && mv "$TMP/t" "$TMP/base/references/task-methodology-router.md"
out=$(run_g25)
printf '%s' "$out" | grep -q 'WARNHIT|G25 分派落档' \
  && ok "态3 分派落档被拦（方法论不可从路由表现形）" || bad "态3 分派落档注入未拦：${out}"

# --- 态4 随技能分发缺口：UNIVERSAL 块删一个已分发档（且 router 无【生成器侧】标注）→ 须 warn 随技能分发缺口 ---
mk_base
grep -v 'knowledge-lifecycle-methodology' "$TMP/base/scripts/generate-skill.sh" > "$TMP/t" && mv "$TMP/t" "$TMP/base/scripts/generate-skill.sh"
out=$(run_g25)
printf '%s' "$out" | grep -q 'WARNHIT|G25 随技能分发缺口' \
  && ok "态4 随技能分发缺口被拦（分派引用但目标技能无此档现形）" || bad "态4 随技能分发缺口注入未拦：${out}"

# --- 态5 扩面随技能分发缺口（R55：⑥ 断言从 *-methodology.md 扩到全档名）---
# 抹掉一个非 *-methodology 行为档（context-engineering-layering）的【生成器侧】标注 → 须 warn
mk_base
sed 's/context-engineering-layering（【生成器侧】）/context-engineering-layering/' \
  "$TMP/base/references/task-methodology-router.md" > "$TMP/t" && mv "$TMP/t" "$TMP/base/references/task-methodology-router.md"
out=$(run_g25)
printf '%s' "$out" | grep -q 'WARNHIT|G25 随技能分发缺口' \
  && ok "态5 扩面被拦（非 *-methodology 档缺【生成器侧】标注现形）" || bad "态5 扩面注入未拦（⑥ 仍只查方法论档？）：${out}"

echo "PASS test-capability-map-g25 (${pass} ok, ${fail} fail)"
[[ $fail -eq 0 ]]
