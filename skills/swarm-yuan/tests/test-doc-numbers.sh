#!/usr/bin/env bash
# test-doc-numbers.sh — 用户面文档数字口径防复发测试（事实源派生版）
#
# 背景：assets/facts.conf 是数字单一事实源。旧版把「当时的新值」硬编码成
# present 断言（56 门禁 / 197 变量 / 核心 11 / 标准 29 / strict 20），facts.conf
# 前进到 59 / 204 / 12 / 32 / strict 23 后，防漂移脚本反把旧值锁成了新值：
# 测试自己成了漂移源，且成功摘要还打印着新值（自相矛盾的假绿）。
# 本版两条机制：
#   ① 与 FACT_ 键对应的期望值一律由 facts.conf 派生，facts 变了断言跟着变；
#   ② 泛化陈旧扫描（scan_numeric）逐模式核对活文档中的计数型短语，
#      任一处与真值不符即报红，不再依赖逐条维护的 present 清单。
# 已退役的历史值仍由 absent 清单兜底，防止回退。
#
# 约束：
#   - bash 3.2 兼容（macOS 默认），set -u，只依赖 grep/sed/wc
#   - 不联网、不写文件、不修改任何资产
#   - 由 tests/run.sh（level 1）与 run-sweep 收集执行
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

# scan_numeric <说明> <ERE> <期望值>：活文档计数型短语泛化陈旧扫描。
# 只收「陈述现状」的活文档；历史陈述与调研档案（docs/research/、
# docs/design-evolution.md、references/dsh-engineering-methodology.md）不在白名单内。
# ERE 须能匹配一个含数字的短语，取短语内首个数字与真值比对；不匹配的文档跳过。
STALE_DOCS="README.md CLAUDE.md docs/usage-manual.md scripts/generate-skill.sh \
.claude/commands/swarm-yuan.md references/standards-compliance.md \
references/template-spec.md references/four-theories-methodology.md \
references/case-studies/articulation-orchestration.md references/generation-flow.md \
references/governance-agents.md references/task-methodology-router.md \
references/quality-management-standards.md references/security-spec.md \
references/context-engineering-layering.md references/frontend-design-methodology.md \
references/business-ontology-methodology.md references/codex-methodology.md \
references/industry-profile-finance.md"

scan_numeric() {
  local label="$1" ere="$2" exp="$3" f line ln phrase num
  CHECKS=$((CHECKS + 1))
  for f in $STALE_DOCS; do
    [ -f "$ROOT/$f" ] || continue
    while IFS= read -r line; do
      [ -n "$line" ] || continue
      ln="${line%%:*}"
      phrase="$(printf '%s\n' "${line#*:}" | grep -oE -- "$ere" | head -1 || true)"
      [ -n "$phrase" ] || continue
      num="$(printf '%s\n' "$phrase" | grep -oE '[0-9]+' | head -1)"
      [ -n "$num" ] || continue
      if [ "$num" != "$exp" ]; then
        fail "$f:$ln '$phrase' 计数=${num}，期望 ${exp}（${label}；真值 assets/facts.conf）"
      fi
    done < <(grep -nE -- "$ere" "$ROOT/$f" 2>/dev/null || true)
  done
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
facts_eq FACT_GATES_TOTAL 59
facts_eq FACT_GATES_CORE 12
facts_eq FACT_GATES_ARCH 20
facts_eq FACT_GATES_STANDARD 32
facts_eq FACT_GATES_COMPLIANCE 19
facts_eq FACT_GATES_FULL 53
facts_eq FACT_GATES_ADVISORY_ONLY 6
facts_eq FACT_ENFORCE_STRICT 23
facts_eq FACT_ENFORCE_WARN 21
facts_eq FACT_ENFORCE_ADVISORY 15
# 决策 54：执行面复杂度预算（引擎域源 / 框架注入），冻结值变化须同步预算与文档
facts_eq FACT_ENGINE_CODE_LOC_MAX 8600
facts_eq FACT_FRAMEWORK_GATE_LOC_MAX 18469
facts_eq FACT_FRAMEWORKS 81
facts_eq FACT_RUNTIMES 15
facts_eq FACT_RUNTIMES_DEEP 4
facts_eq FACT_RUNTIMES_CLI 6
facts_eq FACT_RUNTIMES_METHOD 5
facts_eq FACT_FEATURE_CARDS 17
facts_eq FACT_FEATURE_CARDS_P0 6
facts_eq FACT_FEATURE_CARDS_P1 11
facts_eq FACT_CONF_VARS 204
facts_eq FACT_CONF_VARS_CORE 30
facts_eq FACT_CONF_VARS_ARCH 126
facts_eq FACT_REFERENCES 61
facts_eq FACT_SPEC_SECTIONS 26
# 合规检查点库（compliance 档随发）：主表/罚则库条数机械计数对账（口径见 facts.conf 合规检查点库段）
facts_eq FACT_INSPECTION_CHECKPOINTS 173
facts_eq FACT_PENALTY_CLAUSES 21
count_eq "执法检查主表 TECH 行" "references/regulatory-checkpoint-table.md" '^\| P[123]·' 173
count_eq "处罚条款库 P 行" "references/compliance-checkpoints.md" '^\| P-[0-9][0-9] ' 21
count_eq "采购 AI 检查项 PA 行" "references/compliance-checkpoints.md" '^\| PA-[0-9][0-9] ' 40
present "compliance-checkpoints 口径头引用 173/21" "references/compliance-checkpoints.md" 'FACT_INSPECTION_CHECKPOINTS=173、FACT_PENALTY_CLAUSES=21'
facts_eq FACT_SKILLMD_BYTES_BUDGET "${FACT_SKILLMD_BYTES_BUDGET}"
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

# ===== 1. 门禁总数（facts 派生；已退役值 55/56 零残留） =====
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
# 56 是旧版测试错锁的「新值」（v2.99.0 起真值 59），本轮退役。
absent "README 门禁旧值 56" "README.md" '56 / 56|合计 56|门禁预算 56'
absent "CLAUDE.md 门禁旧值 56" "CLAUDE.md" '56 quality gates'
absent "usage-manual 门禁旧值 56" "docs/usage-manual.md" '56 个门禁|56 门禁'
absent "case-study 门禁旧值 56" "references/case-studies/articulation-orchestration.md" '「56 道|56 门禁'
present "CLAUDE.md 门禁真值（facts 派生）" "CLAUDE.md" "${FACT_GATES_TOTAL} quality gates"
present "usage-manual 门禁真值（facts 派生）" "docs/usage-manual.md" "${FACT_GATES_TOTAL} 个门禁"
present "case-study 门禁真值（facts 派生）" \
  "references/case-studies/articulation-orchestration.md" "${FACT_GATES_TOTAL} 门禁"
present "four-theories 可达率真值（facts 派生）" \
  "references/four-theories-methodology.md" "${FACT_GATES_TOTAL}/${FACT_GATES_TOTAL}"

# ===== 2. 门禁子族（facts 派生；已退役值 10/11/18/28/29 零残留） =====
absent "usage-manual 核心门禁旧值 10" "docs/usage-manual.md" \
  '跑 10 个|核心 10 |标准 28'
absent "usage-manual 子族旧值" "docs/usage-manual.md" '核心 11|架构 18|标准 29|跑 11 个'
absent "standards-compliance 子族旧值" "references/standards-compliance.md" \
  '标准 29|FULL 50|核心 11|架构 18'
absent "command 子族旧值" ".claude/commands/swarm-yuan.md" \
  '标准 29|核心 11|架构 18|197 个配置变量'
present "usage-manual 核心序列（facts 派生）" "docs/usage-manual.md" "跑 ${FACT_GATES_CORE} 个"
present "usage-manual 核心表含 --spec-first" "docs/usage-manual.md" '--spec-first'
present "usage-manual 标准序列（facts 派生）" "docs/usage-manual.md" "标准 ${FACT_GATES_STANDARD}"
present "usage-manual 合规序列（facts 派生）" "docs/usage-manual.md" "合规 ${FACT_GATES_COMPLIANCE}"
present "standards-compliance 标准/核心/架构（facts 派生）" \
  "references/standards-compliance.md" \
  "标准 ${FACT_GATES_STANDARD}（核心 ${FACT_GATES_CORE}\+架构 ${FACT_GATES_ARCH}）"
present "README 门禁分层闭合（facts 派生）" "README.md" \
  "核心 ${FACT_GATES_CORE} \+ 架构 ${FACT_GATES_ARCH} \+ 合规 ${FACT_GATES_COMPLIANCE}"
present "command 标准序列（facts 派生）" \
  ".claude/commands/swarm-yuan.md" \
  "标准 ${FACT_GATES_STANDARD} 门禁（核心 ${FACT_GATES_CORE} \+ 架构 ${FACT_GATES_ARCH}）"

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

# ===== 6. 配置变量（facts 派生；已退役值 173/184/197/200 零残留） =====
absent "standards-compliance 变量旧值 173" \
  "references/standards-compliance.md" '173 变量'
absent "command 变量旧值 184/core 19" \
  ".claude/commands/swarm-yuan.md" '184 个配置变量|core 19 \+'
absent "README 变量旧值 197/200" "README.md" '配置变量 / 上限 \| 197 / 200'
absent "usage-manual 变量旧值 197" "docs/usage-manual.md" '197 个变量|197 变量'
absent "standards-compliance 变量旧值 197" "references/standards-compliance.md" '197 变量'
present "usage-manual 变量真值（facts 派生）" "docs/usage-manual.md" \
  "${FACT_CONF_VARS} 个变量"
present "standards-compliance 变量真值（facts 派生）" \
  "references/standards-compliance.md" "${FACT_CONF_VARS} 变量"
present "README 变量/上限（facts 派生）" "README.md" \
  "配置变量 / 上限 \| ${FACT_CONF_VARS} / ${FACT_CONF_VARS_BUDGET}"
present "command 变量/core 拆分（facts 派生）" \
  ".claude/commands/swarm-yuan.md" \
  "${FACT_CONF_VARS} 个配置变量（precheck.conf 三件套：core ${FACT_CONF_VARS_CORE}"

# ===== 7. references 篇数（facts 派生；旧值 50/51/53/57 档零残留） =====
absent "usage-manual references 旧值 51 档" "docs/usage-manual.md" \
  '51 档|51 个 \.md'
absent "usage-manual references 旧值 53 档" "docs/usage-manual.md" \
  '"53 档"=53 个 \.md'
absent "usage-manual references 旧值 57 档" "docs/usage-manual.md" \
  '"57 档"=57 个 \.md'
present "usage-manual references 真值（facts 派生）" "docs/usage-manual.md" \
  "\"${FACT_REFERENCES} 档\"=${FACT_REFERENCES} 个 \.md"

# ===== 8. 预算（facts 联动：FACT_SKILLMD_BYTES_BUDGET / FACT_ARTIFACT_BYTES_BUDGET；旧值 10240/11264/11392/8KB/500KiB/512000 零残留） =====
absent "README 预算旧值" "README.md" \
  '10240|≈8KB|500KiB|512000'
absent "usage-manual SKILL.md 预算旧值" "docs/usage-manual.md" '≤8KB'
absent "four-theories 预算旧值" "references/four-theories-methodology.md" \
  '≤8KB|≤500KiB'
present "README SKILL.md 预算（facts 联动）" "README.md" \
  "${FACT_SKILLMD_BYTES_BUDGET}B（≈11KiB 锚）"
present "README references 预算真值（facts 联动）" "README.md" \
  "${FACT_ARTIFACT_BYTES_BUDGET:-618496}B（$(( ${FACT_ARTIFACT_BYTES_BUDGET:-618496} / 1024 ))KiB"
present "usage-manual SKILL.md 预算（facts 联动）" "docs/usage-manual.md" \
  "${FACT_SKILLMD_BYTES_BUDGET}B，约 11KiB"
present "four-theories 预算（facts 联动）" \
  "references/four-theories-methodology.md" "${FACT_SKILLMD_BYTES_BUDGET}"
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
present "usage-manual 兼容工具口径" "docs/usage-manual.md" '兼容工具'
count_eq "install.sh 安装分支数" "install.sh" \
  '^[[:space:]]*--(claude|cursor|codex|opencode|windsurf|gemini|kimi|zcode)\)' 8

# ===== 11. 门禁静态分层（facts 派生；旧值 16/18/20/21 零残留） =====
absent "template-spec 分层旧值" "references/template-spec.md" \
  '\| strict \| 16 \|| \| warn \| 18 \|| \| advisory \| 20 \|'
absent "template-spec strict 旧值 20" "references/template-spec.md" \
  '\| strict \| 20 \|'
present "template-spec strict（facts 派生）" "references/template-spec.md" \
  "\| strict \| ${FACT_ENFORCE_STRICT} \|"
present "template-spec warn（facts 派生）" "references/template-spec.md" \
  "\| warn \| ${FACT_ENFORCE_WARN} \|"
present "template-spec advisory（facts 派生）" "references/template-spec.md" \
  "\| advisory \| ${FACT_ENFORCE_ADVISORY} \|"
present "case-study strict（facts 派生）" \
  "references/case-studies/articulation-orchestration.md" "strict ${FACT_ENFORCE_STRICT}"
present "case-study warn（facts 派生）" \
  "references/case-studies/articulation-orchestration.md" "warn ${FACT_ENFORCE_WARN}"

# ===== 12. 决策索引 1-58（旧值 1-38/1-46 零残留；上限见 design-evolution.md 决策 58） =====
absent "usage-manual 决策索引旧值" "docs/usage-manual.md" '决策 1-38'
absent "usage-manual 决策索引旧值 46" "docs/usage-manual.md" '决策 1-46'
present "usage-manual 决策索引真值" "docs/usage-manual.md" '决策 1-58'

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
TDN_EXEMPT=" clean-code-metrics-methodology.md business-ontology-methodology.md bugfix-runbook.md fibo-financial-ontology.md agent-skills-methodology.md ai-process-records.md canary-monitoring.md capability-map.md claude-code-capabilities.md code-graph-tools.md codex-security-methodology.md cognition-framework.md cognitive-bias.md controlled-language-methodology.md cordis-composability-methodology.md cost-estimation-methodology.md crypto-spec.md cwe-database.md decision-governance.md diagram-production-methodology.md domain-knowledge.md dsh-engineering-methodology.md frontend-design-methodology.md governance-agents.md gsd-patterns.md industry-profile-automotive.md industry-profile-energy.md industry-profile-finance.md industry-profile-gov.md industry-profile-industrial.md industry-profile-medical.md industry-profile-payment.md industry-profile-telecom.md logic-razor.md mattpocock-skills-methodology.md mcp-governance.md mea-loop-methodology.md memory-persistence.md remote-debug-jvm.md review-methodology.md rsi-evidence-methodology.md security-certification-profiles.md security-spec.md subagent-orchestration.md task-methodology-router.md failure-taxonomy.md knowledge-retrieval-ladder.md pstack-methodology.md "
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

# ===== 泛化陈旧扫描（事实源派生；覆盖白名单内全部活文档）=====
# 逐条 present 只能锁已登记的短语；本节按「计数型短语模式」横扫，新写的文档
# 只要带同类短语就自动入锁。期望值全部取自 facts.conf，facts 前进无需改断言。
# 不扫裸「N 个门禁」/「N 个质量门禁」：方法论档里的 4/5/16 个门禁是分档子集计数，
# 不是总数（曾误报）。总数由 quality gates / 门禁三档 / 全 N 门禁 / 预算表四类精确模式覆盖。
scan_numeric "门禁总数" '[0-9]+ quality gates' "$FACT_GATES_TOTAL"
scan_numeric "门禁总数" '[0-9]+ 门禁三档' "$FACT_GATES_TOTAL"
scan_numeric "门禁总数" '全 [0-9]+ 门禁' "$FACT_GATES_TOTAL"
scan_numeric "门禁总数" '≈ [0-9]+ 门禁' "$FACT_GATES_TOTAL"
scan_numeric "门禁总数/预算" '门禁总数 / 预算上限 \| [0-9]+' "$FACT_GATES_TOTAL"
scan_numeric "配置变量" '[0-9]+ 个配置变量' "$FACT_CONF_VARS"
scan_numeric "配置变量" '[0-9]+ 个变量' "$FACT_CONF_VARS"
scan_numeric "配置变量" '[0-9]+ 变量真实值' "$FACT_CONF_VARS"
scan_numeric "配置变量/预算" '配置变量 / 上限 \| [0-9]+' "$FACT_CONF_VARS"
scan_numeric "核心门禁" '核心 [0-9]+' "$FACT_GATES_CORE"
scan_numeric "架构门禁" '架构 [0-9]+' "$FACT_GATES_ARCH"
# 标准/跑 两模式须带后续限定词：否则「标准 9 节点」（工作流节点数）与
# 「额外跑 20 个」（架构门禁数）会被误判成标准序列/核心序列。
scan_numeric "标准门禁" '标准 [0-9]+ 门禁' "$FACT_GATES_STANDARD"
scan_numeric "合规门禁" '合规 [0-9]+' "$FACT_GATES_COMPLIANCE"
scan_numeric "核心序列" '跑 [0-9]+ 个，通常' "$FACT_GATES_CORE"
scan_numeric "FULL 序列" 'FULL [0-9]+' "$FACT_GATES_FULL"
scan_numeric "advisory-only" 'advisory-only [0-9]+' "$FACT_GATES_ADVISORY_ONLY"
scan_numeric "门禁可达率" '[0-9]+/[0-9]+ 门禁可达率' "$FACT_GATES_TOTAL"
scan_numeric "门禁可达率" '[0-9]+/[0-9]+ 可达率断言' "$FACT_GATES_TOTAL"
scan_numeric "references 篇数" '"[0-9]+ 档"=' "$FACT_REFERENCES"
scan_numeric "strict 分层" 'strict [0-9]+' "$FACT_ENFORCE_STRICT"
scan_numeric "warn 分层" 'warn [0-9]+' "$FACT_ENFORCE_WARN"
scan_numeric "advisory 分层" 'advisory [0-9]+' "$FACT_ENFORCE_ADVISORY"

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
