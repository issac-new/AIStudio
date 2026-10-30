#!/usr/bin/env bash
# test-doc-numbers.sh — 用户面文档数字口径防复发测试
#
# 背景：assets/facts.conf 是数字单一事实源，但用户面文档曾成片漂移
# （55/56 门禁、79/81 框架、13/14 运行时、10240/11264 预算等）。本测试把已定稿的
# 口径钉成机械断言：旧值不得残留（grep -n 逐行输出 file:line），新值必须存在。
#
# 约束：
#   - bash 3.2 兼容（macOS 默认），set -u，只依赖 grep/sed/wc
#   - 不联网、不写文件、不修改任何资产
#   - 不在 run-sweep/CI 中自动执行（是否接入由主线决定）
#
# 用法：bash tests/test-doc-numbers.sh
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAILS=0
CHECKS=0

fail() { FAILS=$((FAILS + 1)); printf 'FAIL: %s\n' "$1" >&2; }

# absent <说明> <文件> <ERE>：旧值命中即失败，逐行打印 file:line:内容
absent() {
  local label="$1" file="$2" ere="$3" hits
  CHECKS=$((CHECKS + 1))
  if [ ! -f "$ROOT/$file" ]; then fail "${file} 不存在（${label}）"; return 0; fi
  hits="$(grep -nE -- "$ere" "$ROOT/$file" 2>/dev/null || true)"
  if [ -n "$hits" ]; then
    FAILS=$((FAILS + 1))
    printf '%s\n' "$hits" | while IFS= read -r line; do
      printf 'FAIL[%s] %s:%s\n' "$label" "$file" "$line" >&2
    done
  fi
}

# present <说明> <文件> <ERE>：新值缺失即失败
present() {
  local label="$1" file="$2" ere="$3"
  CHECKS=$((CHECKS + 1))
  if [ ! -f "$ROOT/$file" ]; then fail "${file} 不存在（${label}）"; return 0; fi
  grep -qE -- "$ere" "$ROOT/$file" 2>/dev/null \
    || fail "${file} 缺新值 /${ere}/（${label}）"
}

# count_eq <说明> <文件> <ERE> <期望数>：机械计数断言
count_eq() {
  local label="$1" file="$2" ere="$3" exp="$4" n
  CHECKS=$((CHECKS + 1))
  if [ ! -f "$ROOT/$file" ]; then fail "${file} 不存在（${label}）"; return 0; fi
  n="$(grep -cE -- "$ere" "$ROOT/$file" 2>/dev/null || true)"
  n="${n:-0}"
  [ "$n" = "$exp" ] || fail "$file $label 计数=${n}，期望 ${exp}（/$ere/）"
}

# facts_eq <KEY> <期望值>：facts.conf 数字源锁（源变了须同步文档与本测试）
facts_eq() {
  local key="$1" exp="$2" actual
  CHECKS=$((CHECKS + 1))
  eval "actual=\${$key:-__MISSING__}"
  [ "$actual" = "$exp" ] \
    || fail "facts.conf $key=${actual}，期望 ${exp}（数字源变了：同步用户面文档与本测试）"
}

if [ -f "$ROOT/assets/facts.conf" ]; then
  # shellcheck disable=SC1090
  . "$ROOT/assets/facts.conf"
else
  fail "assets/facts.conf 缺失（数字单一事实源不可读）"
fi

# ===== 0. facts.conf 数字锁 =====
facts_eq FACT_GATES_TOTAL 56
facts_eq FACT_GATES_CORE 11
facts_eq FACT_GATES_ARCH 18
facts_eq FACT_GATES_STANDARD 29
facts_eq FACT_GATES_COMPLIANCE 19
facts_eq FACT_GATES_FULL 50
facts_eq FACT_GATES_ADVISORY_ONLY 6
facts_eq FACT_ENFORCE_STRICT 21
facts_eq FACT_ENFORCE_WARN 20
facts_eq FACT_ENFORCE_ADVISORY 15
# 决策 54：执行面复杂度预算（引擎域源 / 框架注入），冻结值变化须同步预算与文档
facts_eq FACT_ENGINE_CODE_LOC_MAX 7980
facts_eq FACT_FRAMEWORK_GATE_LOC_MAX 18469
facts_eq FACT_FRAMEWORKS 81
facts_eq FACT_RUNTIMES 15
facts_eq FACT_RUNTIMES_DEEP 4
facts_eq FACT_RUNTIMES_CLI 6
facts_eq FACT_RUNTIMES_METHOD 5
facts_eq FACT_FEATURE_CARDS 17
facts_eq FACT_FEATURE_CARDS_P0 6
facts_eq FACT_FEATURE_CARDS_P1 11
facts_eq FACT_CONF_VARS 199
facts_eq FACT_CONF_VARS_CORE 30
facts_eq FACT_CONF_VARS_ARCH 121
facts_eq FACT_REFERENCES 58
# 合规检查点库（compliance 档随发）：主表/罚则库条数机械计数对账（口径见 facts.conf 合规检查点库段）
facts_eq FACT_INSPECTION_CHECKPOINTS 173
facts_eq FACT_PENALTY_CLAUSES 21
count_eq "执法检查主表 TECH 行" "references/regulatory-checkpoint-table.md" '^\| P[123]·' 173
count_eq "处罚条款库 P 行" "references/compliance-checkpoints.md" '^\| P-[0-9][0-9] ' 21
count_eq "采购 AI 检查项 PA 行" "references/compliance-checkpoints.md" '^\| PA-[0-9][0-9] ' 40
present "compliance-checkpoints 口径头引用 173/21" "references/compliance-checkpoints.md" 'FACT_INSPECTION_CHECKPOINTS=173、FACT_PENALTY_CLAUSES=21'
facts_eq FACT_SKILLMD_BYTES_BUDGET 11392
facts_eq FACT_SKILLMD_BYTES_HARD_CAP 20000
present "README SKILL.md 硬顶 20000" "README.md" '20000B 硬顶'
facts_eq FACT_ARTIFACT_BYTES_BUDGET 618496
# R126 补登（悬空引用根治）：两键此前被文档头引用为口径权威源但 facts.conf 缺位
facts_eq FACT_CWE_ENTRIES 60
facts_eq FACT_CERT_PROFILES 5

# ===== 0b. R126 补登键的真值对账（声明即对账，防装饰性死配置） =====
count_eq "CWE 条目行数=facts" "references/cwe-database.md" '^\| CWE-' "$FACT_CWE_ENTRIES"
count_eq "认证 Profile 节数=facts" "references/security-certification-profiles.md" '^## [0-9]+\. [^-]' "$FACT_CERT_PROFILES"
# context-engineering-layering.md 曾手抄 FACT_REFERENCES=33（漂移实锤，R126 修复）——旧值零残留
absent "context-engineering 手抄 FACT_REFERENCES 旧值" "references/context-engineering-layering.md" \
  'FACT_REFERENCES=[0-9]'
absent "context-engineering 门禁冻结旧值 55" "references/context-engineering-layering.md" \
  '门禁数保持 55'

# ===== 1. 门禁总数 56（旧值 55 零残留） =====
absent "CLAUDE.md 门禁旧值 55" "CLAUDE.md" \
  '55 quality gates|55 个质量门禁|\(55 gates|the 55 gates'
absent "usage-manual 门禁旧值 55" "docs/usage-manual.md" \
  '门禁 55|55 个门禁|55 个，四结果|55 个，结果'
absent "case-study 门禁旧值 55" "references/case-studies/articulation-orchestration.md" \
  '55 门禁|「55 道|warn 22'
absent "four-theories 可达率旧值 55" "references/four-theories-methodology.md" \
  '55/55'
absent "knowledge-lifecycle 门禁旧值 55" "references/knowledge-lifecycle-methodology.md" \
  '门禁 55'
absent "lazy-generation 门禁旧值 55" "references/lazy-generation-methodology.md" \
  '门禁 55'
absent "template-spec 门禁旧值 55" "references/template-spec.md" \
  '门禁 55'
absent "upstream-baseline 门禁旧值 55" "docs/upstream-baseline.md" \
  '自持 55 门禁|55 门禁预算'
present "CLAUDE.md 门禁新值 56" "CLAUDE.md" '56 quality gates'
present "usage-manual 门禁新值 56" "docs/usage-manual.md" '56 个门禁'
present "case-study 门禁新值 56" "references/case-studies/articulation-orchestration.md" '56 门禁'
present "four-theories 可达率新值 56" "references/four-theories-methodology.md" '56/56'

# ===== 2. 核心 11 / 标准 29 / 合规 19 =====
absent "usage-manual 核心门禁旧值 10" "docs/usage-manual.md" \
  '跑 10 个|核心 10 |标准 28'
present "usage-manual 核心门禁 11" "docs/usage-manual.md" '跑 11 个'
present "usage-manual 核心表含 --spec-first" "docs/usage-manual.md" '--spec-first'
present "usage-manual 标准 29" "docs/usage-manual.md" '标准 29'
present "usage-manual 合规 19" "docs/usage-manual.md" '合规 19'
present "standards-compliance 标准 29（核心 11+架构 18）" \
  "references/standards-compliance.md" '标准 29（核心 11\+架构 18）'
present "README 核心 11/架构 18/合规 19" "README.md" \
  '核心 11 \+ 架构 18 \+ 合规 19'
present "command 标准 29（核心 11+架构 18）" \
  ".claude/commands/swarm-yuan.md" '标准 29 门禁（核心 11 \+ 架构 18）'

# ===== 3. 框架规则集 81（旧值 79/80 零残留） =====
absent "CLAUDE.md 框架旧值 79" "CLAUDE.md" \
  '79-framework|79 supported frameworks|79-fixture|79 ruleset|79 per-framework'
absent "usage-manual 框架旧值 79" "docs/usage-manual.md" '79 个框架|79 框架'
absent "standards-compliance 框架旧值 79" "references/standards-compliance.md" \
  '79 规则集|79/79'
absent "CONTRIBUTING fixture 旧值 79" "CONTRIBUTING.md" 'fixtures 79'
absent "php 规则集旧值 79" "references/frameworks/php.md" '79 规则集'
absent "ruby 规则集旧值 80" "references/frameworks/ruby.md" '80 规则集'
present "CLAUDE.md 框架新值 81" "CLAUDE.md" '81-framework'
present "usage-manual 框架新值 81" "docs/usage-manual.md" '81 个框架规则集'
present "standards-compliance 框架新值 81" \
  "references/standards-compliance.md" '81 规则集'
present "CONTRIBUTING fixture 新值 81" "CONTRIBUTING.md" 'fixtures 81'
present "php 规则集新值 81" "references/frameworks/php.md" '81 规则集'
present "ruby 规则集新值 81" "references/frameworks/ruby.md" '81 规则集'
present "README 框架规则集 81" "README.md" '框架规则集 \| 81'

# ===== 4. 运行时 15 / CLI 6（旧值 14/CLI 5 零残留） =====
absent "CLAUDE.md 运行时旧值 14" "CLAUDE.md" \
  '14 = 含方法论引用|14 个运行时|14 运行时'
absent "generation-flow 运行时旧值 14" "references/generation-flow.md" \
  '14 为含方法论引用|14 运行时'
absent "usage-manual 运行时旧值 14" "docs/usage-manual.md" \
  '14 运行时|CLI 整合 5|"14"='
absent "standards-compliance 运行时旧值 14" "references/standards-compliance.md" \
  '14 运行时'
absent "quality-management 运行时旧值 14" "references/quality-management-standards.md" \
  '14 运行时'
absent "togaf 运行时旧值 14" "references/togaf-metamodel-methodology.md" \
  '14 运行时'
absent "upstream-baseline 口径注旧值 21 行/14 整合" "docs/upstream-baseline.md" \
  '本表 21 行|14 整合运行时 \+ dsh'
present "CLAUDE.md 运行时新值 15" "CLAUDE.md" '15 = 含方法论引用'
present "generation-flow 运行时新值 15" "references/generation-flow.md" \
  '15 为含方法论引用'
present "usage-manual 运行时新值 15" "docs/usage-manual.md" '15 运行时整合口径'
present "usage-manual 深度/CLI/方法论 4/6/5" "docs/usage-manual.md" \
  '深度 4 \+ CLI 6 \+ 方法论 5'
present "standards-compliance 运行时新值 15" \
  "references/standards-compliance.md" '15 运行时'
present "quality-management 运行时新值 15" \
  "references/quality-management-standards.md" '15 运行时整合'
present "togaf 运行时新值 15" "references/togaf-metamodel-methodology.md" \
  '不进 15 运行时计数'
present "upstream-baseline 本表 22 行" "docs/upstream-baseline.md" '本表 22 行'
present "upstream-baseline 15 整合运行时" "docs/upstream-baseline.md" '15 整合运行时'
present "upstream-baseline FACT_RUNTIMES=15" "docs/upstream-baseline.md" 'FACT_RUNTIMES=15'
present "upstream-baseline CLI 6 + 方法论 5" "docs/upstream-baseline.md" \
  'CLI 6 \+ 方法论 5'
present "README 运行时分层 4/6/5" "README.md" \
  '15 个整合（深度 4 \+ CLI 6 \+ 方法论 5'

# ===== 5. 特征卡 17 / P1 11（旧值 P1 十项零残留） =====
absent "exploration-guide P1 旧值十项" "references/exploration-guide.md" \
  'P1 十项'
present "exploration-guide P1 十一项含第 17 项" \
  "references/exploration-guide.md" \
  'P1 十一项 = \{2,3,6,7,8,9,10,12,13,14,17\}'
present "usage-manual 特征卡第 15 项" "docs/usage-manual.md" \
  '\| 15 \| \*\*编排调用关系及约束\*\*'
present "usage-manual 特征卡第 16 项" "docs/usage-manual.md" \
  '\| 16 \| \*\*详尽组件库清单\*\*'
present "usage-manual 特征卡第 17 项" "docs/usage-manual.md" \
  '\| 17 \| \*\*合规与质量特性基线\*\*'
present "README 特征卡 17 / P1 11" "README.md" \
  '17 项（P0 六项强制，P1 十一项可增量）'

# ===== 6. 配置变量 197（旧值 173/184/core 19 零残留） =====
absent "standards-compliance 变量旧值 173" \
  "references/standards-compliance.md" '173 变量'
absent "command 变量旧值 184/core 19" \
  ".claude/commands/swarm-yuan.md" '184 个配置变量|core 19 \+'
present "usage-manual 变量 197" "docs/usage-manual.md" '197 个变量'
present "standards-compliance 变量 197" \
  "references/standards-compliance.md" '197 变量'
present "README 变量 197 / 上限 200" "README.md" \
  '配置变量 / 上限 \| 197 / 200'
present "command 变量 197 / core 28" \
  ".claude/commands/swarm-yuan.md" \
  '197 个配置变量（precheck.conf 三件套：core 28'

# ===== 7. references 53 篇（旧值 50/51 档零残留） =====
absent "usage-manual references 旧值 51 档" "docs/usage-manual.md" \
  '51 档|51 个 \.md'
absent "usage-manual references 旧值 53 档" "docs/usage-manual.md" \
  '"53 档"=53 个 \.md'
present "usage-manual references 57 档" "docs/usage-manual.md" \
  '"57 档"=57 个 \.md'

# ===== 8. 预算 11392B / 577536B（旧值 10240/11264/8KB/500KiB/512000 零残留） =====
absent "README 预算旧值" "README.md" \
  '10240|≈8KB|500KiB|512000'
absent "usage-manual SKILL.md 预算旧值" "docs/usage-manual.md" '≤8KB'
absent "four-theories 预算旧值" "references/four-theories-methodology.md" \
  '≤8KB|≤500KiB'
present "README SKILL.md 预算 11392" "README.md" \
  '11392B（≈11KiB 锚）'
present "README references 预算真值（facts 联动）" "README.md" \
  "${FACT_ARTIFACT_BYTES_BUDGET:-618496}B（$(( ${FACT_ARTIFACT_BYTES_BUDGET:-618496} / 1024 ))KiB"
present "usage-manual SKILL.md 预算 11392" "docs/usage-manual.md" \
  '11392B，约 11KiB'
present "four-theories 预算 11392" \
  "references/four-theories-methodology.md" '11392'
# R125：旧预算写法零残留（散文区不再出现裸 6 位字节预算；附录 A 一处为例外）。
# 此前本测试对 four-theories 断言旧值 577536 必须存在，等于给漂移上锁。
absent "four-theories 预算旧值 577536" \
  "references/four-theories-methodology.md" '577536'
absent "README 附录 D 预算旧值（散文区裸字节数）" "README.md" \
  '577536B|564KiB'
# CLAUDE.md 运行时英文：旧值 14 不得残留；真值由 FACT_RUNTIMES 决定（present 联动）。
# 此前 absent 用 `integrates 1[0-9] external` 连新值 15 也误杀。
absent "CLAUDE.md 运行时英文旧值 14（英文盲区）" "CLAUDE.md" \
  'integrates 14 external'
present "CLAUDE.md 运行时英文真值（FACT_RUNTIMES 联动）" "CLAUDE.md" \
  "integrates ${FACT_RUNTIMES:-15} external"

# ===== 9. 上游基线 22 行（旧值 21 零残留） =====
absent "README 基线旧值 21" "README.md" \
  '登记 21|21 项供应链|21 项运行时'
absent "upstream-baseline 表头旧值 21" "docs/upstream-baseline.md" '本表 21 行'
present "README 登记 22" "README.md" '登记 22（'
present "README 22 项供应链登记" "README.md" '22 项供应链登记'
present "README 22 项运行时许可证" "README.md" '22 项运行时许可证'
present "upstream-baseline 22 行机器锚" "docs/upstream-baseline.md" \
  '22 行'
present "upstream-baseline 22 个上游运行时" "docs/upstream-baseline.md" \
  '22 个上游运行时'
count_eq "upstream-baseline 登记表行数" "docs/upstream-baseline.md" \
  '^\|.*baseline_status=' 22

# ===== 10. 安装宿主 8（旧值 7 零残留） =====
absent "usage-manual 安装目标旧值 7" "docs/usage-manual.md" \
  '全部 7 工具|"7"=\*\*安装目标'
absent "usage-manual 安装工具旧值 7" "docs/usage-manual.md" \
  '检测 7 工具|兼容 7 工具'
absent "codex-methodology 安装目标旧值 7" \
  "references/codex-methodology.md" '7 个安装目标'
present "usage-manual 安装表含 --zcode" "docs/usage-manual.md" '--zcode'
present "usage-manual 安装目标 8" "docs/usage-manual.md" '"8"=\*\*安装目标'
present "CONTRIBUTING 宿主含 ZCode" "CONTRIBUTING.md" 'Kimi/ZCode'
present "usage-manual 兼容 8 工具" "docs/usage-manual.md" '兼容 8 工具'
count_eq "install.sh 安装分支数" "install.sh" \
  '^[[:space:]]*--(claude|cursor|codex|opencode|windsurf|gemini|kimi|zcode)\)' 8

# ===== 11. 门禁静态分层 20/20/16（旧值 16/18/20 零残留） =====
absent "template-spec 分层旧值" "references/template-spec.md" \
  '\| strict \| 16 \|| \| warn \| 18 \|| \| advisory \| 20 \|'
present "template-spec strict 21" "references/template-spec.md" \
  '\| strict \| 20 \|'
present "template-spec warn 21" "references/template-spec.md" \
  '\| warn \| 21 \|'
present "template-spec advisory 15" "references/template-spec.md" \
  '\| advisory \| 15 \|'
present "case-study strict 21" \
  "references/case-studies/articulation-orchestration.md" 'strict 21'
present "case-study warn 21" \
  "references/case-studies/articulation-orchestration.md" 'warn 21'

# ===== 12. 决策索引 1-46（旧值 1-38 零残留） =====
absent "usage-manual 决策索引旧值" "docs/usage-manual.md" '决策 1-38'
present "usage-manual 决策索引新值" "docs/usage-manual.md" '决策 1-46'

# ===== 13. 框架文档终态：轮次标记零残留 =====
absent "php 轮次标记" "references/frameworks/php.md" 'R62|第九棒'
absent "ruby 轮次标记" "references/frameworks/ruby.md" 'R64|第十棒'

# ===== 14. CLAUDE.md 文件数口径：可机械计数、无日期锚 =====
absent "CLAUDE.md 文件数旧锚" "CLAUDE.md" '~25 文件|74K'
present "CLAUDE.md 标准档 90+ 文件" "CLAUDE.md" '标准档约 90\+ 文件'

# ===== R126: 生成器内嵌模板门禁计数（facts 联动，旧值零残留） =====
# generate-skill.sh 的 commands/precheck.md 与 workflow.md 模板曾发「核心 10/标准 28」
# 旧值（facts 真值 CORE=11/STANDARD=29，R101 升档后模板未跟随）——生成物模板同样
# 受数字口径锁约束：手抄数字漂移面不分仓内文档与生成物模板。
absent "生成器模板核心门禁旧值 10" "scripts/generate-skill.sh" '核心 10[： ]'
absent "生成器模板标准门禁旧值 28" "scripts/generate-skill.sh" '标准 28[： ]'
present "生成器模板核心计数=facts" "scripts/generate-skill.sh" "核心 ${FACT_GATES_CORE}："
present "生成器模板标准计数=facts" "scripts/generate-skill.sh" "标准 ${FACT_GATES_STANDARD}[： ]"

# ===== R126: references 漂移锁覆盖登记 =====
# 每个顶层 references/*.md 须在漂移锁视野内：被本测试断言覆盖（断言引用
# references/<basename>），或入豁免清单登记（理由=无 facts 口径手抄数字，
# 或只引用 facts 键名不带值）。新增文档不登记即失败——未登记的顶层 references
# 会游离在漂移锁外，新增即永久脱管。
# frameworks/ 与 case-studies/ 子目录另有配对/路径锁（self-check 守），不在本清单面。
# business-ontology-methodology / fibo-financial-ontology 的 3060/948/265 等数字是
# FIBO 外部基线（随上游发布变），不是 facts.conf 口径；锚点由 test-ontology-knowledge.sh 锁定。
TDN_EXEMPT=" clean-code-metrics-methodology.md business-ontology-methodology.md bugfix-runbook.md fibo-financial-ontology.md agent-skills-methodology.md ai-process-records.md canary-monitoring.md capability-map.md claude-code-capabilities.md code-graph-tools.md codex-security-methodology.md cognition-framework.md cognitive-bias.md controlled-language-methodology.md cordis-composability-methodology.md cost-estimation-methodology.md crypto-spec.md cwe-database.md decision-governance.md diagram-production-methodology.md domain-knowledge.md dsh-engineering-methodology.md frontend-design-methodology.md governance-agents.md gsd-patterns.md industry-profile-automotive.md industry-profile-energy.md industry-profile-finance.md industry-profile-gov.md industry-profile-industrial.md industry-profile-medical.md industry-profile-payment.md industry-profile-telecom.md logic-razor.md mattpocock-skills-methodology.md mcp-governance.md mea-loop-methodology.md memory-persistence.md remote-debug-jvm.md review-methodology.md rsi-evidence-methodology.md security-certification-profiles.md security-spec.md subagent-orchestration.md task-methodology-router.md "
# 备注：cwe-database.md / security-certification-profiles.md 虽在豁免列（不携带跨档口径
# 手抄数），其条目计数已由上方 0b 节 count_eq 机器对账（豁免=无手抄漂移面，非无锁）。
# domain-knowledge.md 的「核心 10 规则集」是框架 fixture 分级轴（非门禁计数轴），不归本锁。
for _doc in "$ROOT/references/"*.md; do
  [ -f "$_doc" ] || continue
  _b="$(basename "$_doc")"
  CHECKS=$((CHECKS + 1))
  case "$TDN_EXEMPT" in *" $_b "*) continue;; esac
  grep -qs "references/$_b" "$ROOT/tests/test-doc-numbers.sh" \
    || fail "references/$_b 未在漂移锁覆盖面（补数字口径断言，或确认无手抄数字后入 TDN_EXEMPT 登记）"
done

# ===== R131: 活文档 generate-skill.sh:NNNN 行号引用零残留（拆分后随重构漂移；历史施工档案 docs/research 豁免）=====
for _doc in "docs/design-evolution.md" "docs/design-compendium.md" "docs/design-compendium-full.md" \
            "docs/usage-manual.md" "README.md" "README.md" "CLAUDE.md"; do
  absent "活文档行号引用 ${_doc}" "$_doc" 'generate-skill\.sh:[0-9]'
done

# ===== 汇总 =====
echo "test-doc-numbers: ${CHECKS} 项断言，${FAILS} 项失败"
if [ "$FAILS" -ne 0 ]; then
  echo "数字口径漂移：按上面 file:line 修复；真值见 assets/facts.conf" >&2
  exit 1
fi
# R126：摘要行数字从 facts.conf 派生——漂移锁自身不得携带硬编码漂移
# （旧版摘要写死 598016，而本测试断言的真值已是 FACT_ARTIFACT_BYTES_BUDGET=614400：
# 防漂移脚本的成功输出本身就是一条漂移数字，「守门脚本注释/文案无人守」同族）。
# 只列 facts 有键的口径；无键数字（旧摘要的「基线 22/宿主 8」）不出现在成功背书里。
echo "✓ 用户面文档数字口径一致（门禁 ${FACT_GATES_TOTAL} / 核心 ${FACT_GATES_CORE} / 标准 ${FACT_GATES_STANDARD} / 合规 ${FACT_GATES_COMPLIANCE} / 框架 ${FACT_FRAMEWORKS} / 运行时 ${FACT_RUNTIMES} / 特征卡 ${FACT_FEATURE_CARDS} / 变量 ${FACT_CONF_VARS} / references ${FACT_REFERENCES} / 预算 ${FACT_SKILLMD_BYTES_BUDGET}+${FACT_ARTIFACT_BYTES_BUDGET}）"
exit 0
