# gate: consistency-cross
# domain: architecture / enforce: advisory / tier: arch
check_consistency_cross() {
  echo "=== BDAT 跨域一致性检查（TOGAF：业务-应用-数据命名一致 + 数据所有权 SoR）==="
  local found=0

  # ---- 1. 业务域术语表 vs 代码标识符命名一致性 ----
  if [[ -z "$GLOSSARY_FILE" ]]; then
    warn "未配置 GLOSSARY_FILE，跳过 BDAT 命名一致性检查（新建 GLOSSARY_FILE，格式：| 业务名 | 代码标识符 |（每行一个概念，供 --consistency-cross 校验））"
  elif [[ ! -f "$GLOSSARY_FILE" ]]; then
    warn "术语表文件不存在：${GLOSSARY_FILE}（TOGAF 要求业务域有统一术语表，避免同名异义/异名同义）"
  else
    # 解析术语表：每行 "业务名 <TAB> 代码标识符" 或 "| 业务名 | 代码标识符 |"
    # 跳过表头行（恰好是"业务名"）与分隔行（---）
    local entries; entries=$(LC_ALL=C awk '
      /^\|/ {
        gsub(/^\||\|$/,""); n=split($0,a,"|");
        if (n>=2) {
          gsub(/^ +| +$/,"",a[1]); gsub(/^ +| +$/,"",a[2]);
          if(a[1]!=""&&a[2]!="" && a[1]!="业务名" && a[1]!="业务" && a[1]!="名字" && a[1]!="标识符" && a[2] !~ /^[-:]+$/)
            print a[1]"\t"a[2]
        }
      }
      /\t/ { n=split($0,a,"\t"); if(a[1]!=""&&a[2]!=""&&a[1]!="业务名") print a[1]"\t"a[2] }
    ' "$GLOSSARY_FILE" 2>/dev/null || true)
    if [[ -n "$entries" ]]; then
      local biz code
      while IFS=$'\t' read -r biz code; do
        [[ -z "$biz" || -z "$code" ]] && continue
        # 检查代码中是否存在该标识符（粗筛：grep 类名/函数名/表名）
        # 注意 BSD grep：--include 必须紧跟 -r 选项，pattern 用 -e 防止 - 开头
        local hits
        hits=$(grep -rnwF --include='*.ts' --include='*.js' --include='*.py' --include='*.go' --include='*.sql' -e "$code" "${WRITABLE_DIRS[@]+"${WRITABLE_DIRS[@]}"}" 2>/dev/null | wc -l | xargs || true)
        if [[ "$hits" -eq 0 ]]; then
          warn "术语表中的代码标识符 '${code}'（业务名：${biz}）在代码中未找到——可能命名已漂移或术语表过时"
        fi
      done <<< "$entries"
    fi
  fi

  # ---- 2. 数据所有权（System of Record）检查 ----
  if [[ -z "$SOR_FILE" ]]; then
    warn "未配置 SOR_FILE，跳过数据所有权检查（新建 SOR_FILE，格式：| 实体 | 权威源 | 允许读 | 允许写 |（每个数据实体一行））"
  elif [[ ! -f "$SOR_FILE" ]]; then
    warn "数据所有权文件不存在：${SOR_FILE}（TOGAF 要求明确每个数据实体的 System of Record，避免双写不一致）"
  else
    # 解析 SoR 表：| 实体 | 权威源 | 允许读 | 允许写 |
    local sor_entries; sor_entries=$(LC_ALL=C awk '
      /^\|/ && !/^\|[-: ]+\|/ && !/实体|实体名/ {
        gsub(/^\||\|$/,""); n=split($0,a,"|");
        if (n>=2) { gsub(/^ +| +$/,"",a[1]); gsub(/^ +| +$/,"",a[2]); if(a[1]!="") print a[1]"\t"a[2] }
      }
    ' "$SOR_FILE" 2>/dev/null || true)
    if [[ -n "$sor_entries" ]]; then
      # 仅校验 SoR 表存在且实体有登记，详细双写检测需人工
      pass "数据所有权表存在（${SOR_FILE}），含 $(echo "$sor_entries" | wc -l | xargs) 个实体登记"
    fi
  fi

  if [[ $found -eq 0 ]]; then
    pass "BDAT 跨域一致性检查通过"
  fi
}
