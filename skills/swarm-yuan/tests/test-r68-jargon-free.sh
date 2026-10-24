#!/usr/bin/env bash
# test-r68-jargon-free.sh — 黑话清零防复发锁（R68/R69 标准术语纪律）
#
# 目标"消除黑话，必须使用标准术语"的机器执法：禁用自造词在用户面零出现。
# 禁用清单 = 已被标准术语替换的自造词；机器锚（文件名/变量名/占位词/【生成器侧】）不受此锁。
# 新增文档写作时若引入禁用词，本测试即红——防复发。
# R78 执法面扩容：assets/（随技能分发的模板/脚本/conf——目标技能侧用户直接可见）纳入扫描；
# 豁免边界（历史账本/维护者面，改写=篡改登记史，不用标准词替换）：
#   - assets/facts.conf —— 数字登记账本（各键值的历史成因链原文，等同 CHANGELOG 历史条目）
#   - scripts/（生成器侧，不分发）、tests/（锁定义自身含禁用词表）、CHANGELOG.md/docs/（历史档案）
set -u
cd "$(dirname "${0}")/.." || exit 1
pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }

# 禁用自造词清单（标准术语见 docs/usage-manual.md 术语词典）
# 禁用自造词清单（标准术语见 docs/usage-manual.md 术语词典）
# (^|[^连])接线：只禁“运行时接线”式黑话；“连接线”是图表标准术语，不误伤。
BANNED="(^|[^连])接线|机械执法|机械式|税制|弧线表|认知面|三件套|变异锁|悬置清单|能力地图|零占位符|双态夹具|流A|流B|随发|分派零落档|随发或声明|假绿|假红|失锚|空转|承载位|双宿主|教义|三值化|互为正反|收官|会师|又一实证|[^图]谱系"

hits=$(grep -rEn "$BANNED" SKILL.md README.md references/*.md 2>/dev/null | grep -v '原.*"' | head -10)
if [[ -z "$hits" ]]; then
  ok "用户面（SKILL.md/README/references/*.md）禁用自造词零出现"
else
  bad "禁用自造词残留（用标准术语）："
  printf '%s\n' "$hits"
fi

# R78：随发资产面（目标技能侧用户直接可见：模板/门禁脚本/conf/ontology/hooks）
asset_hits=$(grep -rEn "$BANNED" assets/ 2>/dev/null | grep -v 'facts\.conf' | grep -v '\.bak' | head -10)
if [[ -z "$asset_hits" ]]; then
  ok "随发资产面（assets/，facts.conf 登记账本豁免）禁用自造词零出现"
else
  bad "随发资产面禁用自造词残留（按 docs/usage-manual.md 术语词典替换）："
  printf '%s\n' "$asset_hits"
fi

# 机器锚必须在位（防误伤——改叙事不得动机器锚）
for anchor in '调用追踪' '方法论引用' '生成器侧' '待填充' '填充指引'; do
  cnt=$(grep -rl "$anchor" scripts/*.sh references/template-spec.md 2>/dev/null | wc -l | tr -d ' ')
  [[ "$cnt" -ge 1 ]] && ok "机器锚在位: ${anchor}" || bad "机器锚丢失: ${anchor}（误伤）"
done

# --- 终态纪律锁：历史包袱禁入用户面 ---
# 终态文档 = 干净完整的方案描述；过程历史归 docs/design-evolution.md（决策全文）、
# CHANGELOG.md（轮次账）与 docs/research/（调研档案）。禁类与豁免：
#   ① 裸轮次标记（R21/R83-D1 式）——豁免：docs/research/R\d+-<slug>.md 文件名锚、UNECE/UN 法规编号（本仓引用的全部法规号为 R155/R156，新增其他法规号时先扩 sed 豁免行）
#   ② 半步编号（⓪.5/①.5 式带圈数字加点，及 Step 4.5 式小数步骤号）——生成流程唯一编号口径在 references/generation-flow.md（Step 1-13 连续编号）
#   ③ 轮次簿记句（补核/薄轮不开档/watch 维持/轮次台账）
#   ④ 版本注记日期戳（"（YYYY-MM-DD 核）"式）——证据分级的"核验"日期（标准/URL 访问与复核日期）不在禁类
#   ⑤ 工作包标签（WP-P1/WP-Z3 式）——历史工作包的考古标签，同轮次标记归档
#   ⑥ 编年簿记句（版本注记：/方法论无新增落地单元/patch 号下/对账通过/登记不展开/候选登记/无吸收/环境事实登记/记档行）——逐版刷新轮的流水账与自对账发言
#   ⑦ 变迁叙事句（升级为/升为/曾…改为/回退修正/被回退/不吸收）——终态文档只述现状，演进史归 docs/ 与 CHANGELOG
#   ⑧ 派生过程句（吸收自/整合自 X/移植自/改写为 swarm-yuan/借鉴 X/吸收点：）——来源署名一律"来源：X vN"一行式，吸收过程叙事归 README 附录 B 登记表
# 决策编号（决策 N）不在禁类：它是 README 附录 C 溯源表的引用机制，指向 design-evolution.md 决策全文。
# 上游项目版本/PR 证据锚（如 v1.91.8.0 #2994）与表格"来源版本"列、逐版能力事实（能力+版本锚）不在禁类；
# 禁的是"过程怎么改出来的"叙事，不是"能力是什么"事实。
_terminal_scan="SKILL.md README.md references/*.md ../docs/usage-manual.md .claude/commands/swarm-yuan.md"

round_hits=$(grep -rEn '[[:<:]]R[0-9]+[[:>:]]' $_terminal_scan 2>/dev/null \
  | sed -E 's#R[0-9]+-[a-zA-Z0-9_.-]+\.md#文件名锚#g; s#(UN|UNECE) R[0-9]+#REG-EXEMPT#g; s#[[:<:]]R15[56][[:>:]]#REG-EXEMPT#g' \
  | grep -E '[[:<:]]R[0-9]+[[:>:]]')
if [[ -z "$round_hits" ]]; then
  ok "终态纪律①：用户面零裸轮次标记（文件名锚与 UN 法规号豁免）"
else
  bad "终态纪律①：裸轮次标记残留（历史归 design-evolution/CHANGELOG/docs/research）："
  printf '%s\n' "$round_hits" | head -5
fi

half_hits=$(grep -rEn '[⓪①②③④⑤⑥⑦⑧⑨]\.[0-9]' $_terminal_scan 2>/dev/null)
half_hits="${half_hits}"$'\n'$(grep -rEn 'Step [0-9]+\.[0-9]' $_terminal_scan 2>/dev/null)
half_hits=$(printf '%s\n' "$half_hits" | grep -v '^$')
if [[ -z "$half_hits" ]]; then
  ok "终态纪律②：用户面零半步编号（编号唯一口径在 generation-flow.md，Step 1-13 连续）"
else
  bad "终态纪律②：半步编号残留（带圈加点或 Step N.M 式补丁号）："
  printf '%s\n' "$half_hits" | head -5
fi

ledger_hits=$(grep -rEn '补核|薄轮不开档|watch 维持|轮次台账' $_terminal_scan 2>/dev/null)
if [[ -z "$ledger_hits" ]]; then
  ok "终态纪律③：用户面零轮次簿记句"
else
  bad "终态纪律③：轮次簿记句残留："
  printf '%s\n' "$ledger_hits" | head -5
fi

stamp_hits=$(grep -rEn '[0-9] 核[，）]' $_terminal_scan 2>/dev/null)
if [[ -z "$stamp_hits" ]]; then
  ok "终态纪律④：用户面零版本注记日期戳（证据核验日期豁免）"
else
  bad "终态纪律④：版本注记日期戳残留："
  printf '%s\n' "$stamp_hits" | head -5
fi

wp_hits=$(grep -rEn 'WP-[A-Z][A-Za-z0-9]*' $_terminal_scan 2>/dev/null)
if [[ -z "$wp_hits" ]]; then
  ok "终态纪律⑤：用户面零工作包标签（WP-xxx，历史归 design-evolution）"
else
  bad "终态纪律⑤：工作包标签残留："
  printf '%s\n' "$wp_hits" | head -5
fi

chronicle_hits=$(grep -rEn '版本注记|方法论无新增落地单元|无新增落地单元|patch 号下|对账通过|登记不展开|候选登记|无吸收|环境事实登记|记档行' $_terminal_scan 2>/dev/null)
if [[ -z "$chronicle_hits" ]]; then
  ok "终态纪律⑥：用户面零编年簿记句（逐版流水账与自对账发言归 docs/upstream-baseline）"
else
  bad "终态纪律⑥：编年簿记句残留："
  printf '%s\n' "$chronicle_hits" | head -5
fi

transition_hits=$(grep -rEn '升级为|升为「|曾[^。]{0,30}改为|回退修正|被回退|不吸收' $_terminal_scan 2>/dev/null)
if [[ -z "$transition_hits" ]]; then
  ok "终态纪律⑦：用户面零变迁叙事句（演进史归 CHANGELOG/design-evolution）"
else
  bad "终态纪律⑦：变迁叙事句残留（改写为现状描述）："
  printf '%s\n' "$transition_hits" | head -5
fi

deriv_pat='吸收自|整合自 ?[A-Za-z]|移植自|改写为 swarm-yuan|借鉴 [A-Za-z]|吸收点：'
deriv_hits=$(grep -rEn "$deriv_pat" $_terminal_scan 2>/dev/null)
deriv_hits="${deriv_hits}"$'\n'$(grep -rEn "$deriv_pat" assets/ 2>/dev/null | grep -v 'facts\.conf' | grep -v '\.bak')
deriv_hits=$(printf '%s\n' "$deriv_hits" | grep -v '^$')
if [[ -z "$deriv_hits" ]]; then
  ok "终态纪律⑧：用户面与随发面零派生过程句（来源一律「来源：X vN」一行式）"
else
  bad "终态纪律⑧：派生过程句残留："
  printf '%s\n' "$deriv_hits" | head -5
fi


# ---- 术语统一锁：一概念一名（用户面禁非规范变体；"地图"字面不锁——"阅读地图"等合法用法） ----
_term_hits=$(grep -nE '零件目录|项目地图|执勤九节点|翻 active|详尽构件库清单' SKILL.md README.md references/*.md ../../docs/usage-manual.md 2>/dev/null | grep -vE '已废弃|曾称|:[0-9]+:\|' | head -5 || true)
if [ -z "$_term_hits" ]; then
  ok "术语统一：用户面零非规范变体（组件库清单/开发工作流九节点/激活/门禁执法）"
else
  bad "术语变体残留（规范名见 usage-manual 禁用对照表）：$_term_hits"
fi


# ---- 术语统一锁（随发面）：模板/脚本提示串与用户面同规 ----
_term_ship_hits=$(grep -rnE '零件目录|项目地图|执勤九节点|翻 active|详尽构件库清单' assets/ scripts/ 2>/dev/null | grep -vE '已废弃|旧称' | head -5 || true)
if [ -z "$_term_ship_hits" ]; then
  ok "术语统一（随发面）：模板与脚本提示串零非规范变体"
else
  bad "随发面术语变体残留：$_term_ship_hits"
fi

echo "PASS test-r68-jargon-free (${pass} ok, ${fail} fail)"
[[ $fail -eq 0 ]]
