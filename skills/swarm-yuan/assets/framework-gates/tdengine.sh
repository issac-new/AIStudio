# ruleset: tdengine  requires_conf: TDENGINE_SRC_GLOBS
# gates: fw_tdengine_super_table(fail) fw_tdengine_ts_primary(fail) fw_tdengine_subtable_tags(fail) fw_tdengine_tag_design(warn) fw_tdengine_keep(warn) fw_tdengine_write_read_split(warn) fw_tdengine_block_size(warn) fw_tdengine_conn_protocol(warn) fw_tdengine_batch_write(warn) fw_tdengine_index_design(warn)
# harvested-from: 2026-08-26，规律源自 TDengine 3.x 官方文档（建模/标签/keep/一写多读/连接协议）
_fw_tdengine_check() {
  echo "  [tdengine] TDengine 3.x 框架规律"

  local files
  files=$(_fw_resolve_globs ${TDENGINE_SRC_GLOBS[@]+"${TDENGINE_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  if [[ -z "$files" ]]; then
    warn "tdengine: TDENGINE_SRC_GLOBS 未配置或无文件可检"
    return
  fi
  local fa=()
  while IFS= read -r ln; do [[ -n "$ln" ]] && fa+=("$ln"); done <<< "$files"
  if [[ ${#fa[@]} -eq 0 ]]; then
    warn "tdengine: TDENGINE_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  local all_src
  all_src=$(cat "${fa[@]}" 2>/dev/null || true)

  # ====================================================================
  # fw_tdengine_super_table(fail)：多设备表建表但无 CREATE STABLE
  # ====================================================================
  local dev_tables stable_def
  dev_tables=$(printf '%s\n' "$all_src" | grep -nE 'CREATE TABLE[[:space:]]+(d[0-9]+|[a-z]+_[0-9]+)' 2>/dev/null || true)
  stable_def=$(printf '%s\n' "$all_src" | grep -nE 'CREATE STABLE' 2>/dev/null || true)
  # 简单启发：检出多张独立设备表但无 CREATE STABLE → 元数据膨胀风险
  local dev_cnt stable_cnt
  dev_cnt=$(printf '%s\n' "$dev_tables" | grep -cE '.' 2>/dev/null || true)
  stable_cnt=$(printf '%s\n' "$stable_def" | grep -cE '.' 2>/dev/null || true)
  if [[ "${dev_cnt:-0}" -ge 2 && "${stable_cnt:-0}" -eq 0 ]]; then
    _fw_report fail fw_tdengine_super_table "$dev_tables" "检出多张独立设备表但无 CREATE STABLE 超级表建模（元数据膨胀 CWE-400）" "已用超级表建模或无多设备表"
  else
    pass "fw_tdengine_super_table: 已用超级表建模或无多设备表"
  fi

  # ====================================================================
  # fw_tdengine_ts_primary(fail)：建表首列非 TIMESTAMP
  # ====================================================================
  local bad_ts
  bad_ts=$(printf '%s\n' "$all_src" | grep -nE 'CREATE TABLE[[:space:]]+[a-zA-Z0-9_]+[[:space:]]*\([[:space:]]*ts[[:space:]]+(BIGINT|INT|DOUBLE|VARCHAR|FLOAT)' 2>/dev/null || true)
  if [[ -n "$bad_ts" ]]; then
    _fw_report fail fw_tdengine_ts_primary "$bad_ts" "建表首列 ts 非 TIMESTAMP 类型（时序主键建模错误）" "首列 ts 已用 TIMESTAMP 类型"
  else
    pass "fw_tdengine_ts_primary: 首列 ts 已用 TIMESTAMP 类型或无建表"
  fi

  # ====================================================================
  # fw_tdengine_subtable_tags(fail)：USING 但无 TAGS
  # ====================================================================
  local using_no_tags
  using_no_tags=$(printf '%s\n' "$all_src" | grep -nE 'CREATE TABLE[[:space:]]+[a-zA-Z0-9_]+[[:space:]]+USING[[:space:]]+[a-zA-Z0-9_]+[[:space:]]*$' 2>/dev/null || true)
  # 该正则会匹配 USING 后无 TAGS 的单行；多行定义需人工核对，这里仅检单行尾 USING
  if [[ -n "$using_no_tags" ]]; then
    _fw_report fail fw_tdengine_subtable_tags "$using_no_tags" "CREATE TABLE ... USING 但无 TAGS 值（子表无标签，按标签查询失效）" "子表 USING 均带 TAGS 或无 USING"
  else
    pass "fw_tdengine_subtable_tags: 子表 USING 均带 TAGS 或无 USING"
  fi

  # ====================================================================
  # fw_tdengine_tag_design(warn)：标签列数 > 8
  # ====================================================================
  local tag_cols tag_count
  tag_cols=$(printf '%s\n' "$all_src" | grep -nE 'TAGS[[:space:]]*\(' 2>/dev/null || true)
  if [[ -n "$tag_cols" ]]; then
    tag_count=$(printf '%s\n' "$tag_cols" | grep -oE 'TAGS[[:space:]]*\(' | wc -l | xargs)
    # 逐行计数标签列数（按逗号/空格分隔）
    local max_tags=0 line
    while IFS= read -r line; do
      local n
      n=$(printf '%s\n' "$line" | sed -E 's/.*TAGS[[:space:]]*\(//; s/\).*//' | awk -F',' '{print NF}')
      [[ -z "$n" ]] && n=0
      [[ "$n" -gt "$max_tags" ]] && max_tags=$n
    done <<< "$tag_cols"
    if [[ "$max_tags" -gt 8 ]]; then
      warn "fw_tdengine_tag_design: 超级表标签列数 ${max_tags} > 8（标签过多致查询退化 CWE-400）"
    else
      pass "fw_tdengine_tag_design: 标签列数合理（<=8）"
    fi
  else
    pass "fw_tdengine_tag_design: 无超级表标签定义"
  fi

  # ====================================================================
  # fw_tdengine_keep(warn)：超级表/全局未配 KEEP
  # ====================================================================
  local has_stable_or_table has_keep
  has_stable_or_table=$(printf '%s\n' "$all_src" | grep -nE 'CREATE STABLE|CREATE TABLE' 2>/dev/null || true)
  has_keep=$(printf '%s\n' "$all_src" | grep -niE '[[:space:]]KEEP[[:space:]]*=|keep[[:space:]]*=[[:space:]]*[0-9]|KEEP[[:space:]]+[0-9]+' 2>/dev/null || true)
  if [[ -n "$has_stable_or_table" && -z "$has_keep" ]]; then
    warn "fw_tdengine_keep: 检出建表但无 KEEP 保留策略（数据无限增长 CWE-400）"
  else
    pass "fw_tdengine_keep: 已配 KEEP 保留策略或无建表"
  fi

  # ====================================================================
  # fw_tdengine_write_read_split(warn)：单节点既写又读无分离
  # ====================================================================
  local has_cfg has_split
  has_cfg=$(printf '%s\n' "$all_src" | grep -niE 'firstEp|secondEp|fqdn' 2>/dev/null || true)
  if [[ -n "$has_stable_or_table" && -z "$has_cfg" ]]; then
    warn "fw_tdengine_write_read_split: 检出 TDengine 建表但无 firstEp/secondEp 配置（一写多读未分离，读写争用 CWE-400）"
  else
    pass "fw_tdengine_write_read_split: 已配置 firstEp/secondEp 分离或无建表"
  fi

  # ====================================================================
  # fw_tdengine_block_size(warn)：DAYS/ROWS 极端/缺省
  # ====================================================================
  local has_days_rows
  has_days_rows=$(printf '%s\n' "$all_src" | grep -niE 'DAYS[[:space:]]*=|ROWS[[:space:]]*=|DAYS[[:space:]]+[0-9]+|ROWS[[:space:]]+[0-9]+' 2>/dev/null || true)
  if [[ -n "$has_stable_or_table" && -z "$has_days_rows" ]]; then
    warn "fw_tdengine_block_size: 检出建表但无 DAYS/ROWS 调优（数据文件碎片风险 CWE-400）"
  else
    pass "fw_tdengine_block_size: 已配 DAYS/ROWS 或无建表"
  fi

  # ====================================================================
  # fw_tdengine_conn_protocol(warn)：原生 JDBC 而非 WS
  # ====================================================================
  local native_conn ws_conn
  native_conn=$(printf '%s\n' "$all_src" | grep -nE 'jdbc:TAOS[^:]' 2>/dev/null || true)
  ws_conn=$(printf '%s\n' "$all_src" | grep -nE 'jdbc:TAOS-WS|ws://.*:6041|taos://' 2>/dev/null || true)
  if [[ -n "$native_conn" && -z "$ws_conn" ]]; then
    warn "fw_tdengine_conn_protocol: 检出 jdbc:TAOS 原生连接但未用 TAOS-WS（防火墙穿透风险 CWE-754）"
  else
    pass "fw_tdengine_conn_protocol: 已用 TAOS-WS 或无原生连接"
  fi

  # ====================================================================
  # fw_tdengine_batch_write(warn)：单条 INSERT 无批量迹象
  # ====================================================================
  local single_insert batch_hint
  single_insert=$(printf '%s\n' "$all_src" | grep -nE 'INSERT INTO[[:space:]]+[a-zA-Z0-9_]+[[:space:]]+VALUES' 2>/dev/null || true)
  batch_hint=$(printf '%s\n' "$all_src" | grep -niE 'INSERT INTO.*VALUES.*,.*,.*,|taosStmt|stmt\.|batch|addBatch' 2>/dev/null || true)
  if [[ -n "$single_insert" && -z "$batch_hint" ]]; then
    warn "fw_tdengine_batch_write: 检出单条 INSERT 但无批量/stmt 迹象（写入吞吐低 CWE-400）"
  else
    pass "fw_tdengine_batch_write: 已用批量写入或无 INSERT"
  fi

  # ====================================================================
  # fw_tdengine_index_design(warn)：高频过滤列未设为 TAGS
  # ====================================================================
  # 启发：建表含普通列但查询 WHERE 过滤该列，而该列非 TAGS → 退化全 vnode 扫
  local where_col
  where_col=$(printf '%s\n' "$all_src" | grep -niE 'WHERE[[:space:]]+[a-z_]+[[:space:]]*=' 2>/dev/null || true)
  if [[ -n "$where_col" && -n "$has_stable_or_table" ]]; then
    # 仅提示人工核对过滤列是否设为 TAGS
    warn "fw_tdengine_index_design: 检出 WHERE 过滤（须核对过滤列是否已设为 TAGS，否则全 vnode 扫描 CWE-400）"
  else
    pass "fw_tdengine_index_design: 无 WHERE 过滤或无建表"
  fi
}
