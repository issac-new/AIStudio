# gate: state-phase
# domain: process / enforce: advisory / tier: full_tail
check_state_phase() {
  echo "=== 阶段状态机证据核验（--state-phase，advisory；comet 理念：无证据不流转）==="
  local state_file="${PROJECT_DIR:-$(pwd)}/.swarm-yuan/state.json"
  if [[ ! -f "$state_file" ]]; then
    warn "state.json 不存在（comet 风格状态机未初始化；建议用 state-machine.sh init 初始化变更状态跟踪）"
    return 0
  fi
  if [[ ! -s "$state_file" ]]; then
    echo "  ℹ state.json 存在但为空（draft 期允许）"
    return 0
  fi
  # 解析 JSON：当前阶段 + evidence 字段
  local issues=0 phase="" has_evidence=0
  if command -v python3 >/dev/null 2>&1; then
    local py_out
    py_out=$(python3 -c '
import sys, json
try:
    with open(sys.argv[1]) as f:
        data = json.load(f)
except Exception as e:
    print("PARSE_ERROR: " + str(e)); sys.exit(0)
phase = data.get("current_phase") or data.get("phase") or ""
evidence = data.get("evidence") or data.get("phase_evidence") or {}
if not phase:
    print("MISSING_PHASE")
else:
    print("PHASE:" + phase)
    if isinstance(evidence, dict):
        for ph, ev in evidence.items():
            if not ev:
                print("NO_EVIDENCE:" + ph)
    elif isinstance(evidence, list):
        if len(evidence) == 0:
            print("NO_EVIDENCE:" + phase)
    elif not evidence:
        print("NO_EVIDENCE:" + phase)
    else:
        print("HAS_EVIDENCE")
' "$state_file" 2>/dev/null || true)
    while IFS= read -r ln; do
      [[ -z "$ln" ]] && continue
      case "$ln" in
        PARSE_ERROR:*) echo "  ⚠ state.json JSON 解析失败：${ln#PARSE_ERROR: }"; issues=$((issues+1));;
        MISSING_PHASE*) echo "  ⚠ state.json 缺 current_phase 字段"; issues=$((issues+1));;
        PHASE:*) phase="${ln#PHASE:}";;
        NO_EVIDENCE:*) echo "  ⚠ 阶段 ${ln#NO_EVIDENCE:} 无 evidence 记录（comet：无证据不流转）"; issues=$((issues+1));;
        HAS_EVIDENCE*) has_evidence=1;;
      esac
    done <<< "$py_out"
  else
    # 无 python3 降级：grep 检查关键字段
    phase=$(grep -oE '"current_phase"\s*:\s*"[^"]*"' "$state_file" 2>/dev/null | head -1 || true)
    [[ -z "$phase" ]] && { echo "  ⚠ state.json 缺 current_phase 字段"; issues=$((issues+1)); }
    grep -qE '"evidence"' "$state_file" 2>/dev/null || { echo "  ⚠ state.json 无 evidence 字段"; issues=$((issues+1)); }
  fi
  if [[ $issues -eq 0 ]]; then
    if [[ -n "$phase" ]]; then
      pass "阶段状态机证据核验通过（当前阶段：${phase#PHASE:}，evidence 在案）"
    else
      pass "阶段状态机证据核验通过"
    fi
  fi
}
