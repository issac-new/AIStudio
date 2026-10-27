#!/usr/bin/env bash
# test-activation-contract.sh — strict 激活最终产物契约（Task 4 / A05）
# 真实 create → 填充最小项目知识 → mark-active；负向场景只改变一个条件。
set -uo pipefail
BASE="$(cd "$(dirname "$0")/.." && pwd)"
DEMO="$BASE/tests/e2e/java-demo"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ✓ %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  ✗ %s\n' "$1" >&2; }
SB="$(mktemp -d "${TMPDIR:-/tmp}/activation-contract.XXXXXX")"
trap 'rm -rf "$SB"' EXIT

make_skill() { # $1=目录后缀 → stdout 技能根
  local out="$SB/$1"
  mkdir -p "$out"
  SKIP_BAT=1 bash "$BASE/scripts/generate-skill.sh" --profile standard m-dev "$DEMO" "$out" >/dev/null 2>&1 || return 1
  local s="$out/m-dev"
  for rf in codebase dev-guide release reference-manual; do
    printf '# %s.md\n真实内容（激活契约样本）\n' "$rf" > "$s/references/${rf}.md"
  done
  cat > "$s/references/reference-manual.md" <<'EOF'
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
  printf '# dev-guide.md\n\n## 开发偏好\n\n暂无已记录偏好\n' > "$s/references/dev-guide.md"
  printf '# recipes.md\n\n## §A 业务功能清单\n\n| 功能 | 入口路径 |\n|------|------|\n\n## §B 任务配方\n\n（暂无）\n' > "$s/references/recipes.md"
  sed -i.bak -e 's|（填充指引：触发条件 + 项目关键词）|m-dev 开发技能|' \
             -e 's|（填充指引：项目名 + 需求交付全流程技能）|m-dev 需求交付技能|' "$s/SKILL.md"
  rm -f "$s/SKILL.md.bak"
  awk '/^## 填充指引/{skip=1; next} /^## /{skip=0} !skip' "$s/SKILL.md" > "$s/SKILL.md.tmp" && mv "$s/SKILL.md.tmp" "$s/SKILL.md"
  grep -v '^> 填充指引\|^> 节点名对齐\|（流程图，标注' "$s/references/workflow.md" > "$s/references/workflow.md.tmp" && mv "$s/references/workflow.md.tmp" "$s/references/workflow.md"
  if [[ -f "$s/references/framework-knowledge.md" ]]; then
    sed -i.bak -e 's/：待填充（证据：待填充）/：样本规律（证据：样本）/' -e 's/待填充/样本/g' "$s/references/framework-knowledge.md"
    rm -f "$s/references/framework-knowledge.md.bak"
  fi
  printf '# snippets\nnpm run dev\n' > "$s/scripts/snippets.md"
  printf '# mcp-tools\npsql -c "SELECT 1"\n' > "$s/scripts/mcp-tools.md"
  if [[ -f "$s/scripts/tunnel.conf" ]]; then
    printf 'JUMP_HOST="e2e@bastion-sample"\nTUNNELS="db:15432:db-sample:5432"\n' > "$s/scripts/tunnel.conf"
  fi
  sed -i.bak 's/^COVERAGE_MIN=.*/COVERAGE_MIN=80/' "$s/scripts/precheck.conf" && rm -f "$s/scripts/precheck.conf.bak"
  printf '\nSPRINGBOOT_SRC_GLOBS=("src/main/java/**/*.java")\nSHARDING_KEY_COLUMNS=("user_id")\nLOMBOK_SRC_GLOBS=("src/main/java/**/*.java")\nMYBATIS_MAPPER_DIRS=("src/main/resources/mapper")\nWRITABLE_DIRS=("src")\n' >> "$s/scripts/precheck.conf"
  mkdir -p "$s/.swarm-yuan"
  printf '{"type":"Taste","ai_suggestion":"激活契约样本","user_action":"approved","ts":"2026-01-01T00:00:00Z"}\n' > "$s/.swarm-yuan/decisions.jsonl"
  printf '%s\n' "$s"
}

expect_block() { # $1=技能根 $2=标签 $3=可选输出匹配
  local s="$1" label="$2" match="${3:-}" out rc
  sed -i.bak 's/^status: active/status: draft/' "$s/SKILL.md" 2>/dev/null || true
  out="$(bash "$BASE/scripts/generate-skill.sh" --mark-active "$s" 2>&1)"; rc=$?
  [[ $rc -ne 0 ]] && grep -q '^status: draft' "$s/SKILL.md" && ok "$label 阻断且保持 draft" || bad "$label 未阻断（rc=${rc} out=${out}）"
  if [[ -n "$match" ]]; then
    printf '%s' "$out" | grep -q "$match" && ok "$label 错误原因可见" || bad "$label 缺少错误锚: $out"
  fi
}

# 正向：严格激活、manifest 重渲染、激活报告落盘。
s="$(make_skill positive)"
bash "$BASE/scripts/generate-skill.sh" --mark-active "$s" > "$SB/positive.log" 2>&1
rc=$?
[[ $rc -eq 0 ]] && grep -q '^status: active' "$s/SKILL.md" && ok '正向 strict 激活' || { bad "正向激活失败"; tail -12 "$SB/positive.log" >&2; }
[[ -f "$s/skill-manifest.json" ]] && python3 -m json.tool "$s/skill-manifest.json" >/dev/null 2>&1 && ok 'manifest 合法且已重渲染' || bad 'manifest 缺失/非法'
[[ -f "$s/.swarm-yuan/activation-report.json" ]] && grep -q 'strict-pass' "$s/.swarm-yuan/activation-report.json" && ok '激活报告 strict-pass' || bad '激活报告缺失'

# 缺 reference-manual：必需对象缺失不得跳过。
s="$(make_skill missing-rm)"; mv "$s/references/reference-manual.md" "$s/references/reference-manual.md.off"
expect_block "$s" '缺 reference-manual' '必需核验对象'

# 非对象 JSON 与 UserChallenge:incomplete 均不得激活。
s="$(make_skill bad-json)"; printf 'null\n' > "$s/.swarm-yuan/decisions.jsonl"
expect_block "$s" '非对象决策' 'JSON对象'
s="$(make_skill incomplete)"; printf '{"type":"UserChallenge:incomplete","ai_suggestion":"x","user_action":"approved"}\n' > "$s/.swarm-yuan/decisions.jsonl"
expect_block "$s" '不完整 UserChallenge' 'incomplete'

# standard/compliance 缺九节点工作流不得激活。
s="$(make_skill no-workflow)"; printf '# 空工作流\n' > "$s/references/workflow.md"
expect_block "$s" '缺九节点工作流' '九节点'

# 最终 reference-manual 超预算不得激活。
s="$(make_skill over-budget)"; python3 - "$s/references/reference-manual.md" <<'PY'
import sys
p=sys.argv[1]
with open(p,'a') as f: f.write('\n' + ('x' * 34000))
PY
expect_block "$s" 'reference-manual 超预算' '预算'

# 清单重复行去重：同一路径重复登记只计一次。
dup="$SB/dup"; mkdir -p "$dup/references" "$dup/proj"
printf '@Entity\nclass User {}\n' > "$dup/proj/User.java"
cat > "$dup/references/reference-manual.md" <<'EOF'
## §9 数据模型
| 单元 | 路径 |
|------|------|
| User | `User.java` |
| User | `User.java` |
EOF
out="$(bash "$BASE/scripts/inventory-verify.sh" "$dup/proj" --skill-dir "$dup" --form common --tsv 2>&1)"
printf '%s' "$out" | grep -q $'数据模型 / ORM 实体\t1\t2\t' && ok '重复清单行去重（不额外增加计数）' || bad "重复行计数: $out"

# 非零枚举但无清单：strict 必须拒绝 NO_LIST。
nl="$SB/no-list"; mkdir -p "$nl/references" "$nl/proj"
printf '@Entity\nclass User {}\n' > "$nl/proj/User.java"
printf '# 空清单\n' > "$nl/references/reference-manual.md"
bash "$BASE/scripts/inventory-verify.sh" "$nl/proj" --skill-dir "$nl" --form common --tsv --strict > "$SB/nolist.log" 2>&1
rc=$?
[[ $rc -eq 1 ]] && grep -q 'NO_LIST' "$SB/nolist.log" && ok '非零枚举 NO_LIST strict 阻断' || bad "NO_LIST strict rc=${rc}"

# 枚举器真实异常：构造 grep --include 失败，不能被折叠成零枚举。
badbin="$SB/badbin"; mkdir -p "$badbin"
cat > "$badbin/grep" <<'EOF'
#!/usr/bin/env bash
for a in "$@"; do [[ "$a" == --include=* ]] && exit 2; done
exec /usr/bin/grep "$@"
EOF
chmod +x "$badbin/grep"
PATH="$badbin:$PATH" bash "$BASE/scripts/inventory-verify.sh" "$dup/proj" --skill-dir "$dup" --form common --tsv --strict > "$SB/scan-error.log" 2>&1
rc=$?
[[ $rc -eq 1 ]] && grep -q 'SCAN_ERROR' "$SB/scan-error.log" && ok '枚举异常 SCAN_ERROR strict 阻断' || bad "SCAN_ERROR strict rc=${rc} out=$(tail -4 "$SB/scan-error.log")"

printf 'test-activation-contract: PASS %s / FAIL %s\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
