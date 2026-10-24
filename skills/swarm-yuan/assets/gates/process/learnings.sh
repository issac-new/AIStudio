# gate: learnings
# domain: process / enforce: advisory / tier: explicit
check_learnings() {
  echo "=== 学习闭环检查（--learnings，advisory）==="
  local learn_file="${PROJECT_DIR:-$(pwd)}/.swarm-yuan/learnings.jsonl"
  if [[ ! -f "$learn_file" ]]; then
    warn "learnings.jsonl 不存在（学习未留痕；learn 闭环——建议对近期 门禁失败记录根因与修复模式）"
    return 0
  fi
  if [[ ! -s "$learn_file" ]]; then
    echo "  ℹ learnings.jsonl 存在但为空（尚无学习记录）"
    return 0
  fi
  # 检查 JSONL 合法性 + 近 30 天记录覆盖率
  local issues=0 total=0 recent=0
  if command -v python3 >/dev/null 2>&1; then
    local py_out
    py_out=$(python3 -c '
import sys, json, time
now = time.time()
total = 0
recent = 0
low_confidence = 0
gates_with_learning = set()
for i, line in enumerate(sys.stdin, 1):
    line = line.strip()
    if not line: continue
    total += 1
    try:
        obj = json.loads(line)
    except Exception:
        print("%d: 非法JSON" % i); continue
    ts = obj.get("ts", "")
    if ts:
        try:
            t = time.mktime(time.strptime(ts[:19], "%Y-%m-%dT%H:%M:%S"))
            if now - t < 30 * 86400: recent += 1
        except Exception: pass
    for k in ("gate", "root_cause", "fix_pattern"):
        if not obj.get(k):
            print("%d: 缺 %s 字段" % (i, k)); break
    # 置信度字段检查（gstack learn 移植）
    conf = obj.get("confidence", "")
    if conf and conf not in ("high", "medium", "low"):
        print("%d: confidence 非法值（%s，须 high/medium/low）" % (i, conf))
    elif conf == "low":
        low_confidence += 1
    # 收集有学习记录的门禁（反哺门禁覆盖度）
    g = obj.get("gate", "")
    if g: gates_with_learning.add(g)
print("TOTAL:%d RECENT:%d LOW_CONF:%d GATES:%d" % (total, recent, low_confidence, len(gates_with_learning)))
print("GATES_WITH_LEARNING:" + ",".join(sorted(gates_with_learning)))
' < "$learn_file" 2>/dev/null || true)
    while IFS= read -r ln; do
      [[ -z "$ln" ]] && continue
      case "$ln" in
        TOTAL:*)
          total=$(echo "$ln" | sed 's/.*TOTAL:\([0-9]*\).*/\1/')
          recent=$(echo "$ln" | sed 's/.*RECENT:\([0-9]*\).*/\1/')
          local _low_conf _gates_covered
          _low_conf=$(echo "$ln" | sed 's/.*LOW_CONF:\([0-9]*\).*/\1/')
          _gates_covered=$(echo "$ln" | sed 's/.*GATES:\([0-9]*\).*/\1/')
          ;;
        GATES_WITH_LEARNING:*)
          local _gates_list; _gates_list="${ln#GATES_WITH_LEARNING:}"
          if [[ -n "$_gates_list" ]]; then
            echo "  ℹ 有学习记录的门禁：$(echo "$_gates_list" | tr ',' ' ')"
          fi
          ;;
        *) echo "  ⚠ $ln"; issues=$((issues+1));;
      esac
    done <<< "$py_out"
  else
    # 无 python3 降级：只查行数和非空
    total=$(grep -c . "$learn_file" 2>/dev/null || echo 0)
    echo "  ℹ 无 python3，降级为行数检查（${total} 条记录）"
  fi
  if [[ "$total" -gt 0 && "$recent" -eq 0 ]]; then
    warn "learnings.jsonl 有 ${total} 条记录但近 30 天无新增——学习闭环停滞（learn 闭环：门禁失败应触发根因记录）"
  elif [[ "$total" -gt 0 ]]; then
    echo "  ✓ 学习闭环活跃（${total} 条记录，近 30 天 ${recent} 条）"
  fi
  if [[ $issues -eq 0 ]]; then
    pass "学习闭环检查通过（learnings.jsonl 格式合法，${total} 条记录）"
  fi
}
