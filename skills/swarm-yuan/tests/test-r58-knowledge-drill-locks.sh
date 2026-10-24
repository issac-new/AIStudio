#!/usr/bin/env bash
# test-r58-knowledge-drill-locks.sh — R58 知识库真机演练修复的变异回归断言打包
#
# 演练实弹打出 9 缺陷（D1-D9），本文件锁其中可机器化的修复面：
#   L1 D1  数据模型变更配方四查（含对外契约面）——template-spec 文本在位
#   L2 D5  页面三角表承载位——template-spec 文本在位
#   L3 D6  待确认事项清单整合——template-spec 文本在位（notes/cognition.md 落点）
#   L4 D8  过期三态触发双路——SKILL.md 文本在位（内容演化走 git diff）
#   L5 D2  relations-query 空结果三支判别——行为锁（真跑空查询看提示）
#   L6 D3  "禁止改语义"说明词剔除——源码锁（gsub 在位；行为面已由 R58 mark-active 实证）
#   L7 D9  检查器认声明变量不挑形态——行为锁（非 glob 名+标量填值须过；未声明名须拦）
#
# 用法: bash tests/test-r58-knowledge-drill-locks.sh
set -u
cd "$(dirname "${0}")/.." || exit 1
TMP="$(mktemp -d "${TMPDIR:-/tmp}/swarm-r58.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }

# --- L1-L4 文本在位（回归锁：删文本即红）---
grep -q '必须含四查' references/template-spec.md && grep -q '对外契约面' references/template-spec.md \
  && ok "L1 D1 四查+契约面在位" || bad "L1 template-spec 缺四查/契约面（D1 回归）"
grep -q '页面三角表' references/template-spec.md \
  && ok "L2 D5 页面三角承载位在位" || bad "L2 template-spec 缺页面三角表（D5 回归）"
grep -q '待确认事项清单（生成承载）' references/template-spec.md && grep -q 'notes/cognition.md' references/template-spec.md \
  && ok "L3 D6 待确认事项清单整合在位" || bad "L3 template-spec 缺待确认事项清单整合（D6 回归）"
grep -q '内容演化走 git diff' SKILL.md \
  && ok "L4 D8 三态触发双路在位" || bad "L4 SKILL.md 缺三态双路（D8 回归）"

# --- L5 D2 行为锁：空结果三支判别 ---
mkdir -p "$TMP/s1/references"
echo '{"from":"a","to":"b","kind":"import","evidence":"e"}' > "$TMP/s1/references/relations.jsonl"
out=$(bash scripts/relations-query.sh "$TMP/s1" "$TMP" --field no-such-field 2>&1)
printf '%s' "$out" | grep -q '三支判别' \
  && ok "L5 D2 空结果三支判别提示在（行为锁）" || bad "L5 空查询提示缺三支判别：${out}"

# --- L6 D3 源码锁：说明词剔除 gsub 在位 ---
grep -q 'gsub(/禁止改语义/,"",t)' scripts/inventory-verify.sh \
  && ok "L6 D3 禁止改语义剔除在位（源码锁）" || bad "L6 inventory-verify 缺 gsub 剔除（D3 回归）"

# --- L7 D9 行为锁：声明变量不挑名字形态/不挑填值形态 ---
mk_cg() { # $1=dir $2=fill-line
  mkdir -p "$TMP/$1/scripts"
  printf '# t\nstatus: active\n' > "$TMP/$1/SKILL.md"   # 子命令校验 -f SKILL.md（fixture 必须齐）
  printf '# ruleset: vite  requires_conf: VITE_CONFIG_FILE VITE_INJECT_SCRIPT\n' > "$TMP/$1/scripts/precheck.sh"
  printf 'ACTIVE_FRAMEWORKS=("vite")\n' > "$TMP/$1/scripts/precheck.conf"
  printf 'ACTIVE_FRAMEWORKS=("vite")\n%s\n' "$2" > "$TMP/$1/scripts/precheck.arch.conf"
}
mk_cg cg-pass 'VITE_CONFIG_FILE="conf/vite.js"'
if bash scripts/generate-skill.sh --check-framework-globs "$TMP/cg-pass" >/dev/null 2>&1; then
  ok "L7a D9 非 glob 声明名+标量填值通过（行为锁）"
else
  bad "L7a 应通过却拦（D9 名字/形态挑食回归）"
fi
mk_cg cg-fail 'VITE_SRC_GLOBS=("src/**/*.js")'
if bash scripts/generate-skill.sh --check-framework-globs "$TMP/cg-fail" >/dev/null 2>&1; then
  bad "L7b 未声明变量不应通过（R48-G5b 负向语义回归）"
else
  ok "L7b 未声明变量被拦（行为锁）"
fi

# --- L8 契约面同族清剿面锁（R59）：清剿到的家族成员必须带契约面语义（修一处必 grep 同族）---
for _f in assets/spec-template.md references/frameworks/spring-data-jpa.md SKILL.md assets/framework-gates/mybatis.sh scripts/relations-extract.sh scripts/relations-query.sh; do
  grep -q '契约面' "$_f" \
    && ok "L8 清剿面在位: ${_f}" || bad "L8 清剿面丢失: ${_f}（R59 回归）"
done
grep -q '四查齐后才可声明影响面' assets/spec-template.md && grep -q '④ 查\*\*对外契约面\*\*' assets/spec-template.md \
  && ok "L8 四查语义在位（spec 模板本体）" || bad "L8 spec-template 四查被改回三查（R59 回归）"

echo "PASS test-r58-knowledge-drill-locks (${pass} ok, ${fail} fail)"
[[ $fail -eq 0 ]]
