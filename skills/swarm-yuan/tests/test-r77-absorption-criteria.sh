#!/usr/bin/env bash
# test-r77-absorption-criteria.sh — R77 吸收判据制度化轮防复发锁
#
# 锁三件事：
# ① 决策 46（吸收判据两问）在位——R76 教训的长期规则载体；
# ② capability-map 对账纪律第 5 条（消费节点真实性）在位；
# ③ 技术选型三问在 spec-template（模板本体）与 template-spec（填充指引）双侧在位——
#    模板与指引双向同步（R59 纪律），单边删除即红。
set -u
cd "$(dirname "${0}")/.." || exit 1
pass=0; fail=0
ok()  { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }

DE=../docs/design-evolution.md
CM=references/capability-map.md
ST=assets/spec-template.md
TS=references/template-spec.md
R76=../docs/research/R76-flow-orchestration-absorption.md

# ---- L1 决策 46 在位 ----
grep -qF '### 决策 46：吸收判据两问' "$DE" && ok "L1 决策 46 标题在位" || bad "L1 决策 46 被删"
grep -qF '哪个环节缺这个' "$DE" && grep -qF '谁在什么场景消费' "$DE" \
  && ok "L1b 吸收两问文本在位" || bad "L1b 两问文本漂移"
grep -qF '登记行本身不算证据' "$DE" \
  && ok "L1c 登记不算证据口径在位" || bad "L1c 登记证据口径漂移"

# ---- L2 capability-map 纪律第 5 条 ----
grep -qF '5. 消费节点真实性' "$CM" && ok "L2 对账纪律第 5 条在位" || bad "L2 第 5 条被删"

# ---- L3 选型三问：模板本体在位 ----
grep -qF '**技术选型三问**' "$ST" && ok "L3 spec-template 三问块在位" || bad "L3 三问块被删"
for anchor in '现状被什么击穿' '不用 X 的最强做法是什么' '决策变量是什么'; do
  grep -qF "$anchor" "$ST" && ok "L3b 模板锚在位: ${anchor}" || bad "L3b 模板锚缺失: ${anchor}"
done

# ---- L4 指引侧同步在位（模板↔指引双向同步）----
grep -qF '§2 决策记录选型三问' "$TS" && ok "L4 template-spec 同步行在位" || bad "L4 指引侧同步缺失（单边漂移）"
grep -qF '选型三问' "$TS" && grep -qF '被什么击穿' "$TS" \
  && ok "L4b 指引侧三问要素在位" || bad "L4b 指引侧要素缺失"

# ---- L5 R76 教训档在位（方法六条+教训）----
grep -qF '吸收对象错置' "$R76" && ok "L5 R76 教训档在位" || bad "L5 R76 台账丢失"
grep -qF '论证方法六条' "$R76" && ok "L5b 方法六条记档在位" || bad "L5b 方法六条丢失"
grep -qF '自研轻量 Flow 六模块' references/industry-profile-payment.md 2>/dev/null \
  && bad "L5c R76 内容残留（未回退干净）" || ok "L5c R76 内容未回流"

# ---- L6 新增文本面（三问块区域）禁用词不出现（r68 清单子集；spec-template 全文含 R60 既有"随发"，不在 r68 执法面，不追）----
_new_sec=$(sed -n '/^## 2\. 决策记录/,/^## 3\./p' "$ST")
for w in '接线' '三件套' '假绿' '空转'; do
  if printf '%s' "$_new_sec" | grep -qF "$w"; then
    bad "L6 禁用词出现: ${w}"
  else
    ok "L6 禁用词未出现: ${w}"
  fi
done

echo "—— r77 防复发锁：$pass 通过 / $fail 失败 ——"
[[ $fail -eq 0 ]] || exit 1
