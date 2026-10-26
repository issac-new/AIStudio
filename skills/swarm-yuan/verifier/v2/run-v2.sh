#!/usr/bin/env bash
# run-v2.sh — 外部有效性测量（v2 Phase 2 脚本骨架，2026-08-15）
#
# 问题：v1 只证"重构前后一致"（内部自洽）；本脚本量化"门禁能否拦截真实缺陷"（外部有效）。
# 方法（见 external-validity.md §方法）：
#   对语料里每个真实 bug：对「引入 commit」跑 precheck --all-full 记录是否 fail（拦截），
#   对「修复 commit」跑同一门禁集记录是否 pass（不误报）。recall/precision/F1 汇总报告。
#
# 语料格式（corpus.tsv，Tab 分隔，# 开头为注释行）：
#   <品类>	<bug_id>	<引入commit的仓库URL>	<引入commit_sha>	<修复commit_sha>	<bug类型>
#   仓库须为可 clone 的 git URL（脚本浅克隆到临时目录）；sha 须在该仓库可达。
#   语料标注（Phase 1，≥30 Java/JS + ≥3 非 Java/JS 品类各 ≥10）由人工/AI 从 R9/R10 项目
#   git 历史采集，本脚本只消费不采集。
#
# 用法:
#   bash verifier/v2/run-v2.sh [corus.tsv]     # 缺省 verifier/v2/corpus.tsv
#   bash verifier/v2/run-v2.sh --smoke         # 冒烟：用内置 2 行最小语料跑通全链路
# 输出: verifier/v2/report.md（recall/precision/F1 + 逐 bug 明细 + 失败案例分析占位）
# 退出码: 0=测量完成（不论是否达阈值）；1=语料/环境错误。达阈值与否只写进报告（Phase 5 断言另做）。
set -uo pipefail
BASE="$(cd "$(dirname "$0")/../.." && pwd)"          # 技能根
V2DIR="$BASE/verifier/v2"
PRECHECK="$BASE/assets/precheck.sh"
GATES=""
for g in gates-strict.sh gates-warn.sh gates-advisory.sh; do
  [[ -f "$BASE/assets/$g" ]] && GATES="$GATES $BASE/assets/$g"
done
THRESH_RECALL="0.5"; THRESH_PRECISION="0.7"   # external-validity.md 验收阈值

ok()  { printf '  ✓ %s\n' "$1"; }
bad() { printf '  ✗ %s\n' "$1" >&2; FAIL=1; }

# ---- 语料选择 ----
SMOKE=0
if [[ "${1:-}" == "--smoke" ]]; then SMOKE=1; fi
CORPUS="${1:-$V2DIR/corpus.tsv}"
if [[ "$SMOKE" -eq 1 ]]; then
  # 冒烟语料：用本仓库自身历史构造（bug=修复 commit 的父引入；此处取一个已知修复轮次做占位，
  # 冒烟只验证"脚本全链路可跑"——clone/checkout/跑门禁/汇总——不构成外部有效性证据）。
  CORPUS="$(mktemp /tmp/v2smoke.tsv.XXXXXX)"
  repo="https://github.com/issac-new/Swarm-yuan.git"
  # 2239eeb=十轮 facts 漂移修复（引入=其父）；作为语料行仅冒烟
  printf 'smoke\tSMOKE-1\t%s\t2239eeb^\t2239eeb\tconf-drift\n' "$repo" > "$CORPUS"
  printf 'smoke\tSMOKE-2\t%s\t1914ae6^\t1914ae6\tdocs\n' "$repo" >> "$CORPUS"
fi
[[ -f "$CORPUS" ]] || { echo "✗ 语料不存在: ${CORPUS}（Phase 1 标注后生成，格式见本脚本头部注释）" >&2; exit 1; }
[[ -f "$PRECHECK" ]] || { echo "✗ 未找到 $PRECHECK" >&2; exit 1; }

echo "=== v2 外部有效性测量（语料: ${CORPUS})==="
WORK="$(mktemp -d /tmp/v2measure.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

total=0; intercepted=0; clean_pass=0
: > "$WORK/detail.tsv"

# ---- 逐 bug 测量 ----
while IFS=$'\t' read -r cat bid repo intro_sha fix_sha btype; do
  case "$cat" in ''|'#'*) continue;; esac
  total=$((total+1))
  rdir="$WORK/r${total}"
  if ! git clone --quiet --depth 50 "$repo" "$rdir" 2>/dev/null; then
    printf '%s\t%s\tclone-fail\t-\t-\n' "$cat" "$bid" >> "$WORK/detail.tsv"; continue
  fi
  # 跑门禁的函数：checkout 到 sha → conf 用 ci 最小配置（PROJECT_DIR=克隆目录）→ precheck --all-full
  run_gates_on() { # $1=sha
    local sd; sd="$WORK/s${total}_$(printf '%s' "$1" | tr -c 'a-f0-9' '_')"
    mkdir -p "$sd"
    cp "$PRECHECK" $GATES "$sd/" 2>/dev/null
    ( cd "$rdir" && git checkout --quiet "$1" 2>/dev/null ) || return 99
    {
      echo "PROJECT_DIR=\"$rdir\""
      echo 'PROTECTED_BRANCHES=("main" "master")'
      echo "WRITABLE_DIRS=(\"$rdir\")"
      echo 'TEST_CMD=""'; echo 'BUILD_CMD=""'
      echo "SCAN_DIRS=(\"$rdir\")"
      echo 'SENSITIVE_TOOL=builtin'; echo 'SECURITY_TOOL=builtin'
      echo "SPEC_FILE=\"$rdir/README.md\""
    } > "$sd/precheck.conf"
    ( cd "$rdir" && bash "$sd/precheck.sh" --all-full >/dev/null 2>&1 )
  }
  rc_intro=$(run_gates_on "$intro_sha"); rc_intro=${rc_intro:-99}
  rc_fix=$(run_gates_on "$fix_sha"); rc_fix=${rc_fix:-99}
  # 拦截判定：引入 commit 上任一门禁 fail（非零退出）= 拦截
  # 误报判定：修复 commit 上 pass（零退出）= 干净
  hit=0; [[ "$rc_intro" -ne 0 && "$rc_intro" -ne 99 ]] && { hit=1; intercepted=$((intercepted+1)); }
  fp=0;  [[ "$rc_fix" -eq 0 ]] && { fp=1; clean_pass=$((clean_pass+1)); }
  printf '%s\t%s\t%s\tintro_rc=%s\tfix_rc=%s\thit=%s\tclean=%s\n' \
    "$cat" "$bid" "$btype" "$rc_intro" "$rc_fix" "$hit" "$fp" >> "$WORK/detail.tsv"
done < "$CORPUS"

# ---- 汇总 ----
recall="n/a"; precision="n/a"; f1="n/a"
if [[ "$total" -gt 0 ]]; then
  recall=$(awk -v i="$intercepted" -v t="$total" 'BEGIN{ if(t>0) printf "%.2f", i/t }')
  precision=$(awk -v c="$clean_pass" -v t="$total" 'BEGIN{ if(t>0) printf "%.2f", c/t }')
  f1=$(awk -v r="$recall" -v p="$precision" 'BEGIN{ if(r+p>0) printf "%.2f", 2*r*p/(r+p); else printf "n/a" }')
fi
cats=$(cut -f1 "$WORK/detail.tsv" | grep -v '^#' | sort -u | wc -l | xargs)
{
  echo "# v2 外部有效性测量报告"
  echo
  echo "- 生成时间: $(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date)"
  echo "- 语料: ${CORPUS}（bugs=${total}，品类数=${cats}）"
  echo "- 指标: recall=${recall}（拦截 $intercepted/${total}）· precision=${precision}（修复后干净 $clean_pass/${total}）· F1=$f1"
  echo "- 阈值（external-validity.md）: recall≥$THRESH_RECALL · precision≥$THRESH_PRECISION · 品类≥3（非 Java/JS）· 每品类≥10"
  echo "- 结论: $(awk -v r="$recall" -v p="$precision" -v c="$cats" 'BEGIN{
    if(r=="n/a"){print "无有效测量（语料为空或全部 clone 失败）——此报告不构成外部有效性证据"; exit}
    m=(r>=0.5&&p>=0.7)?"达阈值":"未达阈值"; print m "（品类数=" c "）"}')"
  echo
  echo "## 逐 bug 明细"
  echo '```'
  cat "$WORK/detail.tsv"
  echo '```'
  echo
  echo "## 失败案例分析（占位——Phase 3 人工填写）"
  echo "- recall 漏报的 bug 为何漏（门禁规则盲区/品类不适配）：待填"
  echo "- precision 误报的 bug 为何误（规则过严/与 bug 无关）：待填"
} > "$V2DIR/report.md"

echo "  指标: recall=$recall · precision=$precision · F1=${f1}（bugs=${total}）"
echo "  报告: $V2DIR/report.md"
[[ "$SMOKE" -eq 1 ]] && echo "  （冒烟模式：仅验证脚本链路，不构成外部有效性证据）"
exit 0
