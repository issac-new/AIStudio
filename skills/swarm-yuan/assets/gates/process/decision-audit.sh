# gate: decision-audit
# domain: process / enforce: advisory / tier: full_tail
check_decision_audit() {
  echo "=== 决策审计轨迹完整性（--decision-audit，advisory）==="
  local dec_file="${PROJECT_DIR:-$(pwd)}/.swarm-yuan/decisions.jsonl"
  if [[ ! -f "$dec_file" ]]; then
    warn "decisions.jsonl 不存在（决策未留痕，G1 决策治理；生成流程 draft 期可空）"
    return 0
  fi
  if [[ ! -s "$dec_file" ]]; then
    echo "  ℹ decisions.jsonl 存在但为空（draft 期允许）"
    return 0
  fi
  # ①② 逐行 JSON 合法性 + UserChallenge 五要素（有 python3 用 json.loads，无则 grep 降级）
  local issues=0
  if command -v python3 >/dev/null 2>&1; then
    local py_out
    py_out=$(python3 -c '
import sys, json
phases=set()
for i, line in enumerate(sys.stdin, 1):
    line=line.strip()
    if not line: continue
    try: obj=json.loads(line)
    except Exception as e:
        print("%d: 非法JSON (%s)" % (i, e)); continue
    if obj.get("phase"): phases.add(obj["phase"])
    if obj.get("type")=="UserChallenge":
        for k in ("ai_suggestion","rationale","alternatives","missing_context","cost_if_wrong"):
            if not obj.get(k): print("%d: UserChallenge 缺 %s" % (i, k))
print("PHASES:"+",".join(sorted(phases)) if phases else "PHASES:none")
' < "$dec_file" 2>/dev/null || true)
    # 提取问题行（非 PHASES 行）
    local problems
    problems=$(printf '%s\n' "$py_out" | grep -v '^PHASES:' || true)
    if [[ -n "$problems" ]]; then
      issues=$(printf '%s\n' "$problems" | grep -c . || true)
      printf '%s\n' "$problems" | while IFS= read -r p; do warn "decisions.jsonl:$p"; done
    fi
    local phases
    phases=$(printf '%s\n' "$py_out" | grep '^PHASES:' | sed 's/^PHASES://')
    [[ "$phases" != "none" && -n "$phases" ]] && pass "决策覆盖阶段：$phases"
  else
    # 降级：grep 字段存在性
    local ln=0 dline
    while IFS= read -r dline; do
      ln=$((ln + 1))
      echo "$dline" | grep -q '"type"' || { warn "decisions.jsonl:$ln: 非法JSON（缺 type）"; issues=$((issues+1)); continue; }
      echo "$dline" | grep -q '"type":"UserChallenge"' || continue
      for k in ai_suggestion rationale alternatives missing_context cost_if_wrong; do
        echo "$dline" | grep -q "\"$k\"" || { warn "decisions.jsonl:$ln: UserChallenge 缺 $k"; issues=$((issues+1)); }
      done
    done < "$dec_file"
  fi
  # 汇总
  local total
  total=$(grep -c . "$dec_file" 2>/dev/null || echo 0)
  if [[ "$issues" -eq 0 ]]; then
    pass "决策审计轨迹完整（${total} 条决策，JSON 合法 + UserChallenge 五要素齐备）"
  else
    warn "决策审计轨迹有 ${issues} 处完整性缺口（共 ${total} 条决策）"
  fi
}
