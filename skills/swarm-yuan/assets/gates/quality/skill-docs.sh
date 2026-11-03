# gate: skill-docs
# domain: quality / enforce: warn / tier: arch
check_skill_docs() {
  echo "=== 目标技能文档检查（反合理化表 / 体积预算 / sidecar 路由头）==="
  local root="${PROJECT_DIR:-.}"
  local smd="${root}/SKILL.md"
  if [[ ! -f "$smd" ]]; then
    skip_if_unconfigured "当前目录无 SKILL.md（非目标技能根），文档检查跳过"
    return 0
  fi
  local bad=0

  # 1) 体积预算：SKILL.md 行数
  local lb="${SKILL_LINE_BUDGET:-200}"
  local lines; lines=$(wc -l < "$smd" | tr -d ' ')
  if [[ "$lines" -gt "$lb" ]]; then
    fail "gate_skill_docs: SKILL.md ${lines} 行 > 预算 ${lb}（流程细节下沉 workflow.md/references/，SKILL.md 只做路由）"
    bad=1
  fi

  # 2) sidecar 数量与"何时读我"路由头
  local smax="${SKILL_SIDECAR_MAX:-12}"
  local scount=0 f head3
  if [[ -d "${root}/references" ]]; then
    scount=$(find "${root}/references" -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')
  fi
  if [[ "$scount" -gt "$smax" ]]; then
    fail "gate_skill_docs: references/*.md ${scount} 份 > 预算 ${smax}（超预算说明该合并或下沉，不是继续加档）"
    bad=1
  fi
  for f in "${root}"/references/*.md; do
    [[ -f "$f" ]] || continue
    head3=$(head -3 "$f")
    case "$head3" in
      *何时读我*|*"When to read"*) : ;;
      *) fail "gate_skill_docs: ${f} 缺「何时读我」路由头（首 3 行须给出可判定的读取条件，禁止裸档）"; bad=1 ;;
    esac
  done

  # 3) 反合理化表：段存在、位于红旗段之前、行数下限、每行 Reality 带可核锚点
  if ! grep -q '^## *常见合理化借口' "$smd" && ! grep -q '^## *Common Rationalizations' "$smd"; then
    fail "gate_skill_docs: SKILL.md 缺「## 常见合理化借口」段——每个可跳步的门禁都要有一条 借口→事实反驳 的配对"
    return 0
  fi
  local ln_rat ln_red rows minrows
  ln_rat=$(grep -n '^## *\(常见合理化借口\|Common Rationalizations\)' "$smd" | head -1 | cut -d: -f1)
  ln_red=$(grep -n '^## *\(红旗\|Red Flags\)' "$smd" | head -1 | cut -d: -f1)
  if [[ -n "$ln_red" && -n "$ln_rat" && "$ln_rat" -gt "$ln_red" ]]; then
    fail "gate_skill_docs: 反合理化表（第 ${ln_rat} 行）应在红旗段（第 ${ln_red} 行）之前——借口要先于症状被反驳"
    bad=1
  fi
  # 数据行 = 以 | 开头且不是表头/分隔行
  rows=$(awk -v s="$ln_rat" 'NR > s && /^\|/ && !/^\|[[:space:]]*-/ && !/\|[[:space:]]*(借口|Rationalization|Excuse)[[:space:]]*\|/ {n++} NR > s && /^## / && NR != s {exit} END {print n+0}' "$smd")
  minrows="${RATIONALIZATION_MIN_ROWS:-4}"
  if [[ "$rows" -lt "$minrows" ]]; then
    fail "gate_skill_docs: 反合理化表仅 ${rows} 行 < 下限 ${minrows}（从本技能的核心步骤反推：每个可跳步至少一条）"
    bad=1
  fi
  # 每行 Reality 须含可核锚点（门禁名/命令/tests 路径/file:line）
  local noanchor
  noanchor=$(awk -v s="$ln_rat" 'NR > s && /^\|/ && !/^\|[[:space:]]*-/ && !/\|[[:space:]]*(借口|Rationalization|Excuse)[[:space:]]*\|/ {
      n = split($0, c, "|"); if (n < 4) next
      r = c[3]
      if (r !~ /gate_[a-z_]+|`[^`]+`|tests\/|scripts\/|\.sh|\.ts|\.py|:[0-9]+/) print substr($0, 1, 90)
    } NR > s && /^## / && NR != s {exit}' "$smd")
  if [[ -n "$noanchor" ]]; then
    fail "gate_skill_docs: 反合理化表存在无可核锚点的反驳行（Reality 须给门禁名/命令/tests 路径/file:line，禁空话（只写"不应该跳过"不算反驳））——$(printf '%s' "$noanchor" | head -1)"
    bad=1
  fi

  # 4) 原则卡结构（防 pstack 式残片：每卡 ≥12 行且四段齐全）
  local pf pfn pfl
  for pf in "${root}"/principles/*.md; do
    [[ -f "$pf" ]] || continue
    pfn=$(basename "$pf"); pfl=$(wc -l < "$pf" | tr -d ' ')
    if [[ "$pfl" -lt 12 ]]; then
      fail "gate_skill_docs: 原则卡 ${pfn} 仅 ${pfl} 行 < 12——残片即失效（pstack 有 4 张卡被发布流程截断而无校验）"
      bad=1
      continue
    fi
    for _sec in 适用时机 理由 模式 自检; do
      grep -q "$_sec" "$pf" || { fail "gate_skill_docs: 原则卡 ${pfn} 缺「${_sec}」段——四段齐全才允许引用"; bad=1; }
    done
  done

  [[ "$bad" -eq 0 ]] && pass "目标技能文档：SKILL.md ${lines}/${lb} 行、sidecar ${scount}/${smax} 份、反合理化表 ${rows} 行且反驳带锚"
  return 0
}
