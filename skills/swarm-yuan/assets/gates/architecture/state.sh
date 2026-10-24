# gate: state
# domain: architecture / enforce: advisory / tier: arch
check_state() {
  echo "=== 状态管理检查（巨型store/prop drilling/派生状态）==="
  local found=0

  # 回归#18 防御：STORE_DIR/COMPONENT_DIR 为单目录标量（非空串才是目录）。
  # 用户误配成数组/空数组时 [[ -n "$STORE_DIR" ]] 在 set -u + bash 3.2 直接 unbound 崩溃；
  # 标量兜底后"If it's an array, treat as unset"——不崩、不假 pass，仅跳过本检查。
  [[ -z "${STORE_DIR:-}" ]] && STORE_DIR=""
  [[ -z "${COMPONENT_DIR:-}" ]] && COMPONENT_DIR=""

  # ---- 1. 巨型 store 检测：store 文件行数 ----
  if [[ -n "$STORE_DIR" && -d "$STORE_DIR" ]]; then
    if [[ "$MAX_STORE_LINES" -gt 0 ]]; then
      local sf
      while IFS= read -r sf; do
        [[ -z "$sf" ]] && continue
        local lines; lines=$(wc -l < "$sf" 2>/dev/null | xargs || echo 0)
        if [[ "$lines" -gt "$MAX_STORE_LINES" ]]; then
          warn "${sf} 有 ${lines} 行（>阈值 ${MAX_STORE_LINES}）——巨型 store 会导致改一个字段全组件重渲染，建议按领域拆分"
        fi
      done < <(find "$STORE_DIR" -type f \( -name '*.ts' -o -name '*.js' \) 2>/dev/null)
    fi
  else
    warn "未配置 STORE_DIR，跳过 store 检查"
  fi

  # ---- 2. Prop Drilling 深度检测：组件 props 透传链 ----
  if [[ -n "$COMPONENT_DIR" && -d "$COMPONENT_DIR" ]]; then
    # 粗筛：检测组件接收 props 后原样透传给子组件（...props / {...this.props}）
    local drilling
    drilling=$(_scan_src '\.\.\.props|\{\.\.\.props\}|\{\.\.\.this\.props\}|rest\.props|remaining.*props' 'ts,tsx,js,jsx,vue,svelte' 'test\|mock\|node_modules' "$COMPONENT_DIR")
    if [[ -n "$drilling" ]]; then
      local dcount; dcount=$(echo "$drilling" | wc -l | xargs || true)
      if [[ "$dcount" -gt 5 ]]; then
        warn "检测到 ${dcount} 处 props 透传（...props）——深度 prop drilling 会使中间组件被迫接收无关 props，建议 Context/compose"
      fi
    fi
  fi

  # ---- 3. 派生状态用 useState 检测（应改 useMemo/直接计算）----
  if [[ -n "$COMPONENT_DIR" && -d "$COMPONENT_DIR" ]]; then
    local derived
    derived=$(_scan_src 'useState\([^)]*(\.map|\.filter|\.reduce|\.sort|\.find|\.length|\.concat)' 'ts,tsx,js,jsx' 'test\|mock\|node_modules' "$COMPONENT_DIR")
    if [[ -n "$derived" ]]; then
      local dcount; dcount=$(echo "$derived" | wc -l | xargs || true)
      warn "检测到 ${dcount} 处 useState 内做派生计算（.map/.filter/.reduce 等）——派生状态应直接计算或 useMemo，存 state 会导致不同步"
      echo "$derived" | head -3 | sed 's/^/    /'
    fi
  fi

  if [[ $found -eq 0 ]]; then
    pass "状态管理检查通过"
  fi
}
