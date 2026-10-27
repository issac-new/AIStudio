#!/usr/bin/env bash
# test-inspection-ledger.sh — 合规检查能力三件套接线与行为断言（合规检查能力轮 2026-10-22）
#
# 覆盖四块：
# ①三件实存与数据契约（路由头/表头 9 列冻结/行数 173-21-40/无占位与未勾选 checkbox）
# ②三模式行为（checklist 按域分组 173 条；ledger 在 active 产物上映射台账 22 条 + draft 状态门
#   fail-closed；agent-audit B1 阳性命中 file:line + 阴性）
# ③档位差异化（compliance 档随发三件；lite/standard 不含）
# ④登记面（dist.tsv/references.tsv/UNIVERSAL_FILES/capability-map/router/SKILL.md/
#   _idx_desc/facts 四键 + test-doc-numbers 计数锁存在）
#
# 用法: bash tests/test-inspection-ledger.sh（parallel_safe：全部写 mktemp；java-demo fixture 先拷贝再作 project-dir）
set -u
cd "$(dirname "${0}")/.." || exit 1
pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1" >&2; fail=$((fail+1)); }
has() {  # $1=文件 $2=固定串 $3=说明
  if grep -qF -- "$2" "$1" 2>/dev/null; then ok "$3"; else bad "$3（缺: $2）"; fi
}
hasnt() {  # $1=文件 $2=ERE $3=说明
  if grep -qE -- "$2" "$1" 2>/dev/null; then bad "$3（命中: $2）"; else ok "$3"; fi
}
G=scripts/generate-skill.sh
LEDGER=scripts/inspection-ledger.sh
CKPT=references/compliance-checkpoints.md
TABLE=references/regulatory-checkpoint-table.md
DEMO=tests/e2e/java-demo

echo "▶ 三件实存与数据契约"
for f in "$LEDGER" "$CKPT" "$TABLE"; do
  if [[ -s "$f" ]]; then ok "$f 非空"; else bad "$f 缺失或为空"; fi
done
for f in "$CKPT" "$TABLE"; do has "$f" "何时读我" "$f 带路由头"; done
bash -n "$LEDGER" && ok "inspection-ledger.sh bash -n 通过" || bad "inspection-ledger.sh 语法错误"
if command -v shellcheck >/dev/null 2>&1; then
  shellcheck -S warning "$LEDGER" >/dev/null 2>&1 && ok "inspection-ledger.sh shellcheck 通过" || bad "inspection-ledger.sh shellcheck 报警"
fi
has "$TABLE" '| 优先级 | 编号 | 技术域 | 控制点 | 检查点 | 判断阈值 | 证据类型 | 义务条款（法规·条号） | 处罚编号 |' "主表表头 9 列冻结契约"
[[ "$(grep -c '^| P[123]·' "$TABLE")" == "173" ]] && ok "主表 TECH 173 行" || bad "主表行数 $(grep -c '^| P[123]·' "$TABLE") ≠ 173"
[[ "$(grep -c '^| P-[0-9][0-9] ' "$CKPT")" == "21" ]] && ok "罚则库 P-01～P-21" || bad "罚则库行数 ≠ 21"
[[ "$(grep -c '^| PA-[0-9][0-9] ' "$CKPT")" == "40" ]] && ok "采购 AI PA 40 行" || bad "PA 行数 ≠ 40"
for f in "$CKPT" "$TABLE"; do
  hasnt "$f" '- \[ \]' "$f 无未勾选 checkbox（mark-active 执法面）"
  hasnt "$f" '（填入' "$f 无填入占位（mark-active 执法面）"
done
has "$CKPT" '## 6. 机检映射表（inspection-ledger.sh 数据源' "机检映射表锚标题（脚本解析契约）"

echo "▶ checklist 模式（解析主表渲染人工核查清单）"
TD="$(mktemp -d "${TMPDIR:-/tmp}/swarm-il.XXXXXX")"
if bash "$LEDGER" checklist --project-dir "$TD" >/dev/null 2>&1; then
  ok "checklist rc=0"
  CL="$TD/.swarm-yuan/inspection/checklist.md"
  [[ "$(grep -c '^| TECH-' "$CL" 2>/dev/null)" == "173" ]] && ok "清单含 173 条 TECH 行" || bad "清单 TECH 行数 ≠ 173"
  [[ "$(grep -c '^## ' "$CL" 2>/dev/null)" -ge 80 ]] && ok "按技术域分组（$(grep -c '^## ' "$CL" 2>/dev/null) 域）" || bad "分组域数异常"
  _mach="$(grep -c '| --' "$CL" 2>/dev/null || true)"
  [[ "${_mach:-0}" -ge 15 ]] && ok "机检标注 ${_mach} 行（映射旗标注入）" || bad "机检标注 ${_mach:-0} 行不足"
  has "$CL" '机检映射覆盖' "统计行在场"
else
  bad "checklist 模式执行失败"
fi

echo "▶ 数据契约变异 fail-closed"
MC="$(mktemp -d "${TMPDIR:-/tmp}/swarm-il-mut.XXXXXX")"
mkdir -p "$MC/scripts" "$MC/references"
cp "$LEDGER" "$MC/scripts/"
cp "$CKPT" "$TABLE" "$MC/references/"
sed -i.bak 's/^## 6\. 机检映射表/## 6. 【已改名】/' "$MC/references/compliance-checkpoints.md" && rm -f "$MC/references/compliance-checkpoints.md.bak"
bash "$MC/scripts/inspection-ledger.sh" checklist --project-dir "$TD" >/dev/null 2>&1
[[ $? -eq 2 ]] && ok "映射锚标题缺失 → fail-closed（rc=2）" || bad "锚标题变异未拦"
cp "$CKPT" "$MC/references/compliance-checkpoints.md"
sed -i.bak '/^| P3·中风险 | TECH-008 /d' "$MC/references/regulatory-checkpoint-table.md" && rm -f "$MC/references/regulatory-checkpoint-table.md.bak"
bash "$MC/scripts/inspection-ledger.sh" checklist --project-dir "$TD" >/dev/null 2>&1
[[ $? -eq 2 ]] && ok "主表行数漂移（173→172）→ fail-closed" || bad "行数漂移未拦"
sed -i.bak 's/| 优先级 | 编号 |/| 优先级 | 序号 |/' "$MC/references/regulatory-checkpoint-table.md" && rm -f "$MC/references/regulatory-checkpoint-table.md.bak"
bash "$MC/scripts/inspection-ledger.sh" checklist --project-dir "$TD" >/dev/null 2>&1
[[ $? -eq 2 ]] && ok "表头列序漂移 → fail-closed" || bad "表头漂移未拦"

echo "▶ 生成器档位差异化（compliance 随发三件；lite/standard 不含）"
DEMOCP="$(mktemp -d "${TMPDIR:-/tmp}/swarm-il-demo.XXXXXX")"
cp -r "$DEMO" "$DEMOCP/demo"
for prof in lite standard compliance; do
  OUT="$(mktemp -d "${TMPDIR:-/tmp}/swarm-il-prof.XXXXXX")"
  if bash "$G" --profile "$prof" p-$prof "$DEMOCP/demo" "$OUT" >/dev/null 2>&1; then
    if [[ "$prof" == "compliance" ]]; then
      for f in scripts/inspection-ledger.sh references/compliance-checkpoints.md references/regulatory-checkpoint-table.md; do
        [[ -f "$OUT/p-$prof/$f" ]] && ok "compliance 档含 $f" || bad "compliance 档缺 $f"
      done
      has "$OUT/p-$prof/SKILL.md" '| scripts/inspection-ledger.sh | 迎检台账工具 |' "产物索引行（工具）"
      has "$OUT/p-$prof/SKILL.md" '| references/compliance-checkpoints.md | 合规检查点库 |' "产物索引行（知识件）"
      has "$OUT/p-$prof/commands/precheck.md" 'inspection-ledger.sh ledger' "precheck 命令含台账入口"
      PROF_COMPLIANCE="$OUT/p-compliance"
    else
      for f in references/compliance-checkpoints.md references/regulatory-checkpoint-table.md; do
        [[ ! -f "$OUT/p-$prof/$f" ]] && ok "$prof 档不含 ${f}（差异化正确）" || bad "$prof 档误含 $f"
      done
      rm -rf "$OUT"
    fi
  else
    bad "$prof 档 create 失败"
  fi
done

echo "▶ ledger 模式（active 产物全链路 + draft 状态门）"
PJ="$(mktemp -d "${TMPDIR:-/tmp}/swarm-il-proj.XXXXXX")"
# draft 产物：套件被状态门禁用，ledger 须 fail-closed 且点名
if bash "$PROF_COMPLIANCE/scripts/inspection-ledger.sh" ledger --project-dir "$PJ" >/dev/null 2>&1; then
  bad "draft 产物 ledger 未被状态门拦（应 rc=2）"
else
  _err="$(bash "$PROF_COMPLIANCE/scripts/inspection-ledger.sh" ledger --project-dir "$PJ" 2>&1 || true)"
  printf '%s' "$_err" | grep -q '状态门禁\|draft' && ok "draft 状态门 fail-closed 且点名" || bad "draft 拦截信息不点名: $_err"
fi
# 填充 + mark-active（配方与 run-gen-e2e §12 一致）
P="$PROF_COMPLIANCE"
for rf in codebase dev-guide release reference-manual; do printf '# %s\n真实内容（回归样本）\n' "$rf" > "$P/references/${rf}.md"; done
printf '# dev-guide\n真实内容\n\n## 开发偏好\n\n暂无\n' > "$P/references/dev-guide.md"
printf '# recipes.md\n\n## §A 业务功能清单\n\n| 功能 | 入口 |\n|---|---|\n\n## §B 任务配方\n\n（暂无）\n' > "$P/references/recipes.md"
sed -i.bak -e 's|（填充指引：触发条件 + 项目关键词）|p-compliance 开发技能（回归样本）|' -e 's|（填充指引：项目名 + 需求交付全流程技能）|p-compliance 交付技能|' "$P/SKILL.md" && rm -f "$P/SKILL.md.bak"
awk '/^## 填充指引/{skip=1; next} /^## /{skip=0} !skip' "$P/SKILL.md" > "$P/SKILL.md.tmp" && mv "$P/SKILL.md.tmp" "$P/SKILL.md"
grep -v '^> 填充指引\|^> 节点名对齐\|（流程图，标注' "$P/references/workflow.md" > "$P/references/workflow.md.tmp" && mv "$P/references/workflow.md.tmp" "$P/references/workflow.md"
if [[ -f "$P/references/framework-knowledge.md" ]]; then
  sed -i.bak -e 's/：待填充（证据：待填充）/：回归样本（证据：回归样本）/' -e 's/待填充/回归样本/g' "$P/references/framework-knowledge.md" && rm -f "$P/references/framework-knowledge.md.bak"
fi
printf '# snippets\nmvn package  # 回归样本\n' > "$P/scripts/snippets.md"
printf '# mcp-tools\npsql -c "SELECT 1"  # 回归样本\n' > "$P/scripts/mcp-tools.md"
[[ -f "$P/scripts/tunnel.conf" ]] && printf 'JUMP_HOST="e2e@bastion"\nTUNNELS="db:15432:db:5432"\n' > "$P/scripts/tunnel.conf"
sed -i.bak 's/^COVERAGE_MIN=.*/COVERAGE_MIN=80/' "$P/scripts/precheck.conf" && rm -f "$P/scripts/precheck.conf.bak"
printf '\nSPRINGBOOT_SRC_GLOBS=("src/main/java/**/*.java")\nSHARDING_KEY_COLUMNS=("user_id")\nLOMBOK_SRC_GLOBS=("src/main/java/**/*.java")\nMYBATIS_MAPPER_DIRS=("src/main/resources/mapper")\nWRITABLE_DIRS=("src")\n' >> "$P/scripts/precheck.conf"
mkdir -p "$P/.swarm-yuan" && printf '{"type":"Taste","ai_suggestion":"回归样本","user_action":"approved","ts":"2026-10-22T00:00:00Z"}\n' > "$P/.swarm-yuan/decisions.jsonl"
# strict 激活需真实清单：非零枚举维度登记（§5 调度任务 / §9 数据模型与 mapper）
cat > "$P/references/reference-manual.md" <<'EOF'
# reference-manual.md
## §5 调度与批处理任务
| 任务 | 入口路径 |
|------|------|
| ReportJob | `src/main/java/com/demo/ReportJob.java` |
| BatchJobConfig | `src/main/java/com/demo/BatchJobConfig.java` |
## §9 数据模型与声明式映射
| 单元 | 路径 |
|------|------|
| User | `src/main/java/com/demo/User.java` |
| UserMapper.xml | `src/main/resources/mapper/UserMapper.xml` |
EOF
if bash "$G" --mark-active "$P" >/dev/null 2>&1; then
  ok "--mark-active 成功（填充配方闭环）"
  if bash "$P/scripts/inspection-ledger.sh" ledger --project-dir "$DEMOCP/demo" >/dev/null 2>&1; then
    ok "active 产物 ledger rc=0（advisory 语义）"
    LG="$DEMOCP/demo/.swarm-yuan/inspection"
    for id in TECH-012 TECH-013 TECH-021 TECH-127 B1; do
      has "$LG/ledger.md" "| $id |" "台账含映射行 $id"
    done
    _jl="$(wc -l < "$LG/ledger.jsonl" | tr -d ' ')"
    [[ "$_jl" == "22" ]] && ok "台账 jsonl 22 条（19 个映射检查点 ×映射去重前全量）" || bad "jsonl 行数 ${_jl} ≠ 22"
    _rows="$(grep -c '^| ' "$LG/ledger.md")"
    [[ "$((_rows - 1))" == "22" ]] && ok "台账 md 数据行 22" || bad "台账数据行 $((_rows - 1)) ≠ 22（含列头行计数 ${_rows}）"
    has "$LG/ledger.md" '映射非判定' "台账头部含映射非判定披露"
    [[ -s "$LG/precheck-raw.log" ]] && ok "precheck 原始输出留档（证据链）" || bad "precheck 原始输出未留档"
  else
    bad "active 产物 ledger 失败"
  fi
else
  bad "--mark-active 失败（填充配方漂移？）"
  tail -5 /dev/null
fi

echo "▶ agent-audit 模式（B1 阳性/阴性）"
AA="$(mktemp -d "${TMPDIR:-/tmp}/swarm-il-aa.XXXXXX")"
printf 'REGRESSION_SECRET_TOKEN="Zx9wY8vU7tS6rQ5p"\n' >> "$P/scripts/precheck.conf"
if bash "$P/scripts/inspection-ledger.sh" agent-audit --project-dir "$AA" >/dev/null 2>&1; then
  AM="$AA/.swarm-yuan/inspection/agent-audit.md"
  has "$AM" 'B1 疑似命中' "B1 阳性：疑似命中清单在场"
  has "$AM" 'REGRESSION_SECRET_TOKEN' "B1 阳性：file:line 证据（变量名可溯）"
  [[ "$(grep -c '^| [A-F][0-9] |' "$AM")" == "20" ]] && ok "A1～F3 全 20 项出证" || bad "A1-F3 出证行数 ≠ 20"
else
  bad "agent-audit（阳性）执行失败"
fi
sed -i.bak '/REGRESSION_SECRET_TOKEN/d' "$P/scripts/precheck.conf" && rm -f "$P/scripts/precheck.conf.bak"
AA2="$(mktemp -d "${TMPDIR:-/tmp}/swarm-il-aa2.XXXXXX")"
if bash "$P/scripts/inspection-ledger.sh" agent-audit --project-dir "$AA2" >/dev/null 2>&1; then
  has "$AA2/.swarm-yuan/inspection/agent-audit.md" 'B1 | 机检未见异常' "B1 阴性：还原后未见异常"
else
  bad "agent-audit（阴性）执行失败"
fi

echo "▶ 登记面（接线六处 + facts 四键 + 计数锁）"
has assets/registry/dist.tsv "scripts/inspection-ledger.sh	target	compliance	copy	gen" "dist.tsv 登记台账工具"
has assets/registry/dist.tsv "references/compliance-checkpoints.md	target	compliance	copy	ref" "dist.tsv 登记知识件"
has assets/registry/dist.tsv "references/regulatory-checkpoint-table.md	target	compliance	copy	ref" "dist.tsv 登记主表"
has assets/registry/references.tsv "compliance-checkpoints	security	" "references.tsv 登记知识件（security 族）"
has assets/registry/references.tsv "regulatory-checkpoint-table	security	" "references.tsv 登记主表（security 族）"
has scripts/generate-skill.sh "scripts/inspection-ledger.sh|gen|compliance" "UNIVERSAL_FILES 含台账工具"
has scripts/generate-skill.sh "references/compliance-checkpoints.md|ref|compliance" "UNIVERSAL_FILES 含知识件"
has scripts/generate-skill.sh "references/regulatory-checkpoint-table.md|ref|compliance" "UNIVERSAL_FILES 含主表"
has scripts/generate-skill.sh 'compliance-checkpoints.md) echo "合规检查点库"' "_idx_desc 知识件用途"
has scripts/generate-skill.sh 'inspection-ledger.sh) echo "迎检台账工具"' "_idx_desc 工具用途"
has references/capability-map.md "| compliance-checkpoints |" "capability-map 登记知识件"
has references/capability-map.md "| regulatory-checkpoint-table |" "capability-map 登记主表"
has references/task-methodology-router.md "迎检自查/强监管合规类" "task-router 迎检路由行"
has SKILL.md "compliance-checkpoints（监管执法检查点库" "SKILL.md 路由表接知识件"
has assets/facts.conf "FACT_UNIVERSAL_FILES=104" "facts FACT_UNIVERSAL_FILES=104"
has assets/facts.conf "FACT_REFERENCES=57" "facts FACT_REFERENCES=57"
has assets/facts.conf "FACT_INSPECTION_CHECKPOINTS=173" "facts FACT_INSPECTION_CHECKPOINTS=173"
has assets/facts.conf "FACT_PENALTY_CLAUSES=21" "facts FACT_PENALTY_CLAUSES=21"
has tests/test-doc-numbers.sh "count_eq \"执法检查主表 TECH 行\"" "doc-numbers 主表计数锁"
has tests/test-doc-numbers.sh "facts_eq FACT_INSPECTION_CHECKPOINTS 173" "doc-numbers facts 锁"

# 清理
rm -rf "$TD" "$MC" "$DEMOCP" "$PJ" "$AA" "$AA2" "${OUT:-}" 2>/dev/null || true

echo
echo "pass=${pass} fail=${fail}"
if [[ $fail -eq 0 ]]; then echo "INSPECTION-LEDGER TEST OK"; exit 0; else echo "INSPECTION-LEDGER TEST FAIL"; exit 1; fi
