# gate: contract
# domain: architecture / enforce: warn / tier: arch
check_contract() {
  echo "=== 接口契约检查（TOGAF：契约版本化 + 防腐层 ACL）==="
  local found=0 _contract_checked=0

  # ---- 1. 契约文件版本化检查 ----
  if [[ -z "$CONTRACT_DIR" ]]; then
    warn "未配置 CONTRACT_DIR，跳过接口契约检查（生成目标技能时设为 docs/contracts）"
  elif [[ ! -d "$CONTRACT_DIR" ]]; then
    warn "契约目录不存在：${CONTRACT_DIR}（新建 CONTRACT_DIR/ 并为每个 API 创建 YAML/JSON 文件，必含 version: x.y.z 字段）"
  else
    local contracts; contracts=$(find "$CONTRACT_DIR" -type f \( -name '*.yaml' -o -name '*.yml' -o -name '*.json' -o -name '*.md' \) 2>/dev/null || true)
    if [[ -z "$contracts" ]]; then
      warn "${CONTRACT_DIR} 目录无契约文件"
    else
      _contract_checked=1
      local cf
      while IFS= read -r cf; do
        [[ -z "$cf" ]] && continue
        # 检查是否含 version 字段（yaml/json/md 都查 version 关键字）
        if ! grep -qE 'version\s*[:=]|## v?[0-9]' "$cf" 2>/dev/null; then
          fail "接口契约缺 version 字段：${cf}（TOGAF 要求系统间接口契约可追溯版本，便于变更影响分析）"
          found=1
        fi
      done <<< "$contracts"
    fi
  fi

  # ---- 2. 防腐层（ACL）检查：跨上下文 import 必须经 ACL 目录中转 ----
  if [[ -n "$ACL_DIR" && ${#CONTEXT_DIRS[@]} -gt 0 ]]; then
    if [[ ! -d "$ACL_DIR" ]]; then
      warn "ACL 目录不存在：${ACL_DIR}（新建 ACL_DIR/ 目录，跨上下文 import 须经此目录中转（在 ACL_DIR 为每个外部上下文建 adapter 文件））"
    else
      # 预解析每个上下文目录为绝对路径
      local ctx_abs=()
      local ci
      for ((ci=0; ci<${#CONTEXT_DIRS[@]}; ci++)); do
        local a; a=$(cd "${CONTEXT_DIRS[$ci]}" 2>/dev/null && pwd -P || echo "")
        ctx_abs+=("$a")
      done
      # 对每个上下文目录的文件，检测其 import 是否解析到其他上下文目录
      local i j
      for ((i=0; i<${#CONTEXT_DIRS[@]}; i++)); do
        local ctx_a="${CONTEXT_DIRS[$i]}"
        [[ -d "$ctx_a" ]] || continue
        local af target
        while IFS= read -r af; do
          [[ -z "$af" ]] && continue
          while IFS= read -r target; do
            [[ -z "$target" ]] && continue
            # 检查 target 是否落在其他上下文目录内
            for ((j=0; j<${#CONTEXT_DIRS[@]}; j++)); do
              [[ $i -eq $j ]] && continue
              local ctx_b_abs="${ctx_abs[$j]}"
              [[ -z "$ctx_b_abs" ]] && continue
              if [[ "$target" == "$ctx_b_abs"* ]]; then
                fail "上下文间直接引用（绕过 ACL）：${af} (${ctx_a}) 直接 import 了 ${CONTEXT_DIRS[$j]}。跨上下文应经 ${ACL_DIR} 防腐层中转"
                found=1
                break
              fi
            done
          done < <(_resolve_rel_imports "$af")
        done < <(find "$ctx_a" -type f \( -name '*.ts' -o -name '*.js' -o -name '*.py' \) 2>/dev/null)
      done
      pass "ACL 防腐层目录存在：${ACL_DIR}"
    fi
  fi

  if [[ $found -eq 0 ]]; then
    if [[ "$_contract_checked" -eq 1 ]]; then
      pass "接口契约检查通过"
    else
      # R118：未配置/目录不存在时不得再打印“通过”（旧版 warn 后仍 pass，自相矛盾）。
      skip_if_unconfigured "CONTRACT_DIR 未配置或目录/契约文件不存在，契约版本化检查未执行"
    fi
  fi
}
