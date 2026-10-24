#!/usr/bin/env bash
# test-ontology-knowledge.sh — 业务本体知识层接线断言（本体轮 2026-10-22）
#
# 覆盖两件产物的六面接线：文件实存/路由头、分发清单、SKILL.md 路由表、
# capability-map 登记、task-router 任务分派、facts 数字口径。另断言分发面
# 不含占位符与未勾选 checkbox（目标技能 --verify-completeness 会扫描
# references/*.md，未勾选项会让 --mark-active 失败）。
#
# 用法: bash tests/test-ontology-knowledge.sh
set -u
cd "$(dirname "${0}")/.." || exit 1
pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }
has() {  # $1=文件 $2=固定串 $3=说明
  if grep -qF -- "$2" "$1" 2>/dev/null; then ok "$3"; else bad "$3（缺: $2）"; fi
}
hasnt() {  # $1=文件 $2=ERE $3=说明
  if grep -qE -- "$2" "$1" 2>/dev/null; then bad "$3（命中: $2）"; else ok "$3"; fi
}

BO=references/business-ontology-methodology.md
FIBO=references/fibo-financial-ontology.md

echo "▶ 文件实存与路由头"
for f in "$BO" "$FIBO"; do
  if [[ -s "$f" ]]; then ok "$f 非空"; else bad "$f 缺失或为空"; fi
  has "$f" "何时读我" "$f 带路由头"
done

echo "▶ 分发面纪律（目标技能 --verify-completeness 兼容）"
for f in "$BO" "$FIBO"; do
  hasnt "$f" '待填充|（填入|<占位符>|填充指引' "$f 无占位符模式"
  hasnt "$f" '^[[:space:]]*- \[ \]' "$f 无未勾选 checkbox"
done
for f in "$BO" "$FIBO"; do
  _sz=$(wc -c < "$f" | tr -d ' ')
  if [[ "$_sz" -le 40960 ]]; then ok "$f 体积 ${_sz}B ≤ 40KiB"; else bad "$f 体积 ${_sz}B 超 40KiB（分发预算失控）"; fi
done

echo "▶ 分发清单登记"
has scripts/generate-skill.sh '"references/business-ontology-methodology.md|ref|standard"' \
  "UNIVERSAL_FILES 登记 business-ontology-methodology"
has scripts/generate-skill.sh '"references/fibo-financial-ontology.md|ref|standard"' \
  "UNIVERSAL_FILES 登记 fibo-financial-ontology"

echo "▶ SKILL.md 与能力清单互指"
has SKILL.md "business-ontology-methodology" "SKILL.md 路由 business-ontology-methodology"
has SKILL.md "fibo-financial-ontology" "SKILL.md 路由 fibo-financial-ontology"
has references/capability-map.md "business-ontology-methodology" "capability-map 登记 business-ontology-methodology"
has references/capability-map.md "fibo-financial-ontology" "capability-map 登记 fibo-financial-ontology"

echo "▶ 任务路由可达"
has references/task-methodology-router.md "business-ontology-methodology" \
  "task-router 可到达 business-ontology-methodology"
has references/task-methodology-router.md "fibo-financial-ontology" \
  "task-router 可到达 fibo-financial-ontology"

echo "▶ 数字口径"
# shellcheck disable=SC1090
. assets/facts.conf
_ref_true=$(find references -maxdepth 1 -name '*.md' | wc -l | tr -d ' ')
if [[ "${FACT_REFERENCES:-0}" == "$_ref_true" ]]; then
  ok "FACT_REFERENCES=${FACT_REFERENCES} 与 references 实数一致"
else
  bad "FACT_REFERENCES=${FACT_REFERENCES:-?} != ${_ref_true}"
fi
_uf_true=$(sed -n '/^UNIVERSAL_FILES=(/,/^)/p' scripts/generate-skill.sh | grep -cE '^  "')
if [[ "${FACT_UNIVERSAL_FILES:-0}" == "$_uf_true" ]]; then
  ok "FACT_UNIVERSAL_FILES=${FACT_UNIVERSAL_FILES} 与清单实数一致"
else
  bad "FACT_UNIVERSAL_FILES=${FACT_UNIVERSAL_FILES:-?} != ${_uf_true}"
fi

echo "▶ FIBO 源码基线锚点"
for anchor in 'master_2026Q3' '2d73435' '3060' '948' '265' 'OMG Commons' \
  'Customer' 'LegalEntityIdentifier' 'InternationalSecuritiesIdentificationNumber' \
  'FinancialInstrument' 'Position' 'MonetaryAmount'; do
  has "$FIBO" "$anchor" "FIBO 文档含锚点 ${anchor}"
done
for anchor in 'Party–Role' 'Identifier–Scheme' '十四项机器校验'; do
  has "$BO" "$anchor" "方法论含锚点 ${anchor}"
done

echo "PASS test-ontology-knowledge (${pass} ok, ${fail} fail)"
[[ "$fail" -eq 0 ]]
