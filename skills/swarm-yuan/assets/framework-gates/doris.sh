# ruleset: doris  requires_conf: DORIS_SRC_GLOBS
# gates: fw_doris_bucket(warn) fw_doris_replication(fail) fw_doris_rollup(warn) fw_doris_colocate(warn) fw_doris_mv_refresh(warn) fw_doris_varchar_width(warn) fw_doris_index(warn) fw_doris_dynamic_partition(warn) fw_doris_stream_load(warn) fw_doris_resource_group(warn)
# harvested-from: 2026-08-26，规律源自 Apache Doris 2.x 数据模型/索引/物化视图/资源隔离官方文档
_fw_doris_check() {
  echo "  [doris] Apache Doris 2.x 框架规律"

  local files
  files=$(_fw_resolve_globs ${DORIS_SRC_GLOBS[@]+"${DORIS_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  if [[ -z "$files" ]]; then
    warn "doris: DORIS_SRC_GLOBS 未配置或无文件可检"
    return
  fi
  local fa=()
  while IFS= read -r ln; do [[ -n "$ln" ]] && fa+=("$ln"); done <<< "$files"
  if [[ ${#fa[@]} -eq 0 ]]; then
    warn "doris: DORIS_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  local all_src
  all_src=$(cat "${fa[@]}" 2>/dev/null || true)

  # ====================================================================
  # fw_doris_replication(fail)：replication_num 与 BE 节点数不匹配（启发：单节点=3 或多节点=1）
  # CWE-754：建表失败或单点故障
  # ====================================================================
  local rep_val
  rep_val=$(printf '%s\n' "$all_src" | grep -oiE '"?replication_num"?[[:space:]]*=[[:space:]]*"?[0-9]+' 2>/dev/null | grep -oE '[0-9]+$' | head -1 || true)
  local be_count
  be_count=$(printf '%s\n' "$all_src" | grep -ciE 'be.conf|backend|"backends"' 2>/dev/null || true)
  if [[ -n "$rep_val" ]]; then
    if [[ "$rep_val" -gt 1 && "${be_count:-0}" -eq 0 ]]; then
      # 多副本但无 BE 集群信号（单节点场景）→ 建表失败
      _fw_report fail fw_doris_replication "$rep_val" "replication_num=${rep_val} 但无多 BE 节点信号（单节点须 replication_num=1，否则建表失败 CWE-754）" "副本数与 BE 节点数匹配"
    elif [[ "$rep_val" -eq 1 && "${be_count:-0}" -gt 0 ]]; then
      warn "fw_doris_replication: replication_num=1 但疑似多 BE 集群（单副本失去容灾，建议 >=2）"
    else
      pass "fw_doris_replication: 副本数与 BE 节点数匹配"
    fi
  else
    pass "fw_doris_replication: 未显式配 replication_num（用默认 3，多节点安全）"
  fi

  # ====================================================================
  # fw_doris_bucket(warn)：建表无 DISTRIBUTED BY HASH
  # ====================================================================
  local has_table has_bucket
  has_table=$(printf '%s\n' "$all_src" | grep -nE 'CREATE TABLE' 2>/dev/null || true)
  has_bucket=$(printf '%s\n' "$all_src" | grep -nE 'DISTRIBUTED BY HASH|BUCKETS|BEGIN WITH' 2>/dev/null || true)
  if [[ -n "$has_table" && -z "$has_bucket" ]]; then
    warn "fw_doris_bucket: 检出 CREATE TABLE 但无 DISTRIBUTED BY HASH/BUCKETS（数据倾斜风险 CWE-400）"
  else
    pass "fw_doris_bucket: 已分桶或无建表"
  fi

  # ====================================================================
  # fw_doris_rollup(warn)：高频聚合查询无 ROLLUP/物化视图
  # ====================================================================
  local has_groupby has_rollup
  has_groupby=$(printf '%s\n' "$all_src" | grep -nE 'GROUP BY' 2>/dev/null || true)
  has_rollup=$(printf '%s\n' "$all_src" | grep -niE 'ROLLUP|MATERIALIZED VIEW' 2>/dev/null || true)
  if [[ -n "$has_groupby" && -z "$has_rollup" ]]; then
    warn "fw_doris_rollup: 检出 GROUP BY 聚合但无 ROLLUP/物化视图（固定聚合全表扫 CWE-400）"
  else
    pass "fw_doris_rollup: 已用 ROLLUP/物化视图或无聚合"
  fi

  # ====================================================================
  # fw_doris_colocate(warn)：同分桶键 join 无 COLOCATE WITH
  # ====================================================================
  local has_join has_colocate
  has_join=$(printf '%s\n' "$all_src" | grep -nE '\bJOIN\b' 2>/dev/null || true)
  has_colocate=$(printf '%s\n' "$all_src" | grep -niE 'COLOCATE WITH|colocate_with' 2>/dev/null || true)
  if [[ -n "$has_join" && -z "$has_colocate" && -n "$has_bucket" ]]; then
    warn "fw_doris_colocate: 检出 JOIN 且已分桶但无 COLOCATE WITH（跨节点 shuffle CWE-400）"
  else
    pass "fw_doris_colocate: 已用 Colocate Join 或无分桶 join"
  fi

  # ====================================================================
  # fw_doris_mv_refresh(warn)：物化视图无 REFRESH 策略
  # ====================================================================
  local has_mv has_refresh
  has_mv=$(printf '%s\n' "$all_src" | grep -niE 'CREATE MATERIALIZED VIEW' 2>/dev/null || true)
  has_refresh=$(printf '%s\n' "$all_src" | grep -niE 'REFRESH (ASYNC|MANUAL|ON COMMIT|EVERY)|refresh[[:space:]]*=' 2>/dev/null || true)
  if [[ -n "$has_mv" && -z "$has_refresh" ]]; then
    warn "fw_doris_mv_refresh: 检出 CREATE MATERIALIZED VIEW 但无 REFRESH 策略（结果过期）"
  else
    pass "fw_doris_mv_refresh: 物化视图已配 REFRESH 或无物化视图"
  fi

  # ====================================================================
  # fw_doris_varchar_width(warn)：VARCHAR 不设长度上限
  # ====================================================================
  local wide_varchar
  wide_varchar=$(printf '%s\n' "$all_src" | grep -nE 'VARCHAR[[:space:]]*\([0-9]{4,}\)|VARCHAR[[:space:]]*$' 2>/dev/null || true)
  if [[ -n "$wide_varchar" ]]; then
    warn "fw_doris_varchar_width: 检出超宽 VARCHAR(>=1000) 或未设长度（存储/内存膨胀 CWE-400）"
  else
    pass "fw_doris_varchar_width: VARCHAR 长度合理声明"
  fi

  # ====================================================================
  # fw_doris_index(warn)：高基数列等值查询未建 Bitmap 索引
  # ====================================================================
  local has_where has_bitmap
  has_where=$(printf '%s\n' "$all_src" | grep -niE 'WHERE[[:space:]]+[a-z_]+[[:space:]]*=|IN[[:space:]]*\(' 2>/dev/null || true)
  has_bitmap=$(printf '%s\n' "$all_src" | grep -niE 'BITMAP|INDEX' 2>/dev/null || true)
  if [[ -n "$has_where" && -z "$has_bitmap" && -n "$has_table" ]]; then
    warn "fw_doris_index: 检出 WHERE/IN 过滤但无 BITMAP/INDEX 声明（高基数列点查慢 CWE-400）"
  else
    pass "fw_doris_index: 已建索引或无过滤查询"
  fi

  # ====================================================================
  # fw_doris_dynamic_partition(warn)：按时间增长数据无 dynamic_partition
  # ====================================================================
  local has_time_col has_dyn
  has_time_col=$(printf '%s\n' "$all_src" | grep -niE 'dt[[:space:]]|DATE|datetime|PARTITION BY' 2>/dev/null || true)
  has_dyn=$(printf '%s\n' "$all_src" | grep -niE 'dynamic_partition' 2>/dev/null || true)
  if [[ -n "$has_time_col" && -z "$has_dyn" && -n "$has_table" ]]; then
    warn "fw_doris_dynamic_partition: 检出时间列/分区但无 dynamic_partition（手动管理分区 CWE-754）"
  else
    pass "fw_doris_dynamic_partition: 已开动态分区或无时间分区表"
  fi

  # ====================================================================
  # fw_doris_stream_load(warn)：Stream Load 批次过小（逐行）
  # ====================================================================
  local single_load
  single_load=$(printf '%s\n' "$all_src" | grep -niE 'StreamLoad|stream_load|addBatch|insert into.*values.*\n' 2>/dev/null || true)
  if [[ -n "$single_load" ]]; then
    # 仅提示：无法静态判定批次大小，提示人工核对
    warn "fw_doris_stream_load: 检出 Stream Load/批量导入（须核对单批次 >=100MB，过小导入吞吐低 CWE-400）"
  else
    pass "fw_doris_stream_load: 无 Stream Load 导入"
  fi

  # ====================================================================
  # fw_doris_resource_group(warn)：无 query_timeout/Resource Group
  # ====================================================================
  local has_query has_rg
  has_query=$(printf '%s\n' "$all_src" | grep -niE 'SELECT|INSERT' 2>/dev/null || true)
  has_rg=$(printf '%s\n' "$all_src" | grep -niE 'query_timeout|resource_group|ResourceGroup' 2>/dev/null || true)
  if [[ -n "$has_query" && -z "$has_rg" ]]; then
    warn "fw_doris_resource_group: 检出查询但无 query_timeout/Resource Group（大查询雪崩风险 CWE-400）"
  else
    pass "fw_doris_resource_group: 已配资源隔离或无查询"
  fi
}
