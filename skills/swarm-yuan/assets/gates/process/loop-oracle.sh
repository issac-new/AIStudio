# gate: loop-oracle
# domain: process / enforce: strict / tier: explicit
check_loop_oracle() {
  echo "=== Oracle Gate 循环状态核验（--loop-oracle，strict）==="
  local state_dir="${PROJECT_DIR:-$(pwd)}/.swarm-yuan"
  # 找 loop 状态文件（cwd 哈希命名 loop-<hash>.md）
  local loop_state=""
  if [[ -d "$state_dir" ]]; then
    loop_state=$(ls -1 "$state_dir"/loop-*.md 2>/dev/null | head -1 || true)
  fi

  # Z3 fail-closed：LOOP_ORACLE_REQUIRED=1 但无 loop → fail
  if [[ "${LOOP_ORACLE_REQUIRED:-0}" == "1" && -z "$loop_state" ]]; then
    if [[ -n "${LOOP_ORACLE_EXEMPT_REASON:-}" ]]; then
      warn "loop-oracle 检查已豁免（${LOOP_ORACLE_EXEMPT_REASON}）——fail-closed：豁免须显式声明理由"
    else
      fail "gate_loop_oracle_required: LOOP_ORACLE_REQUIRED=1 但无活跃 loop 状态文件——强制要求走 Oracle 验证（${state_dir}/loop-*.md 不存在）。或填 LOOP_ORACLE_EXEMPT_REASON 豁免理由"
    fi
    return
  fi

  # 无 loop 状态文件 → 未启用，pass 不阻塞
  if [[ -z "$loop_state" ]]; then
    pass "loop-oracle: 无活跃 loop（未启用 Oracle Gate，不阻塞——用 bash scripts/setup-loop.sh 启动）"
    return
  fi

  local found=0
  local history="${state_dir}/loop-history.jsonl"

  # ② loop 活跃但无 history.jsonl → fail
  if [[ ! -f "$history" ]]; then
    fail "gate_loop_oracle_no_history: loop 状态文件存在（${loop_state}）但无 loop-history.jsonl——loop 启动后未完成一轮迭代"
    found=1
  else
    # ① 读最后一条状态，断言 status=complete
    local last_status
    last_status=$(tail -1 "$history" 2>/dev/null | sed -E 's/.*"status":"([^"]+)".*/\1/' || true)
    if [[ "$last_status" != "complete" ]]; then
      fail "gate_loop_oracle_incomplete: loop 未完成（最后状态: ${last_status:-unknown}）——Oracle Gate 要求 verify_command 通过才完成"
      found=1
    else
      pass "loop-oracle: 最后一次 promise 被 Oracle 接受（status=complete）"
    fi

    # ③ Stall Detection warn（promise_rejections≥5）
    local last_rejections
    last_rejections=$(tail -1 "$history" 2>/dev/null | sed -E 's/.*"rejections":([0-9]+).*/\1/' || echo "0")
    [[ "$last_rejections" =~ ^[0-9]+$ ]] || last_rejections=0
    if [[ "$last_rejections" -ge 5 ]]; then
      warn "loop-oracle: Stall Detection 触发（promise_rejections=${last_rejections}）——建议人工介入或重新审视需求"
    fi
  fi

  [[ $found -eq 0 ]] && { pass "Oracle Gate 循环状态核验通过"; return 0; }
}
