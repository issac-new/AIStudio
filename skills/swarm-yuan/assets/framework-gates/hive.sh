# ruleset: hive  requires_conf: HIVE_SRC_GLOBS
# gates: fw_hive_partition(warn) fw_hive_bucket(warn) fw_hive_execution_engine(warn) fw_hive_acid(fail) fw_hive_vectorization(warn) fw_hive_orc(warn) fw_hive_dynamic_partition(fail) fw_hive_external_location(warn)
# harvested-from: 2026-08-26，规律源自 Apache Hive 3.x LanguageManual DDL / 事务文档 / 向量化 / 存储格式官方文档
_fw_hive_check() {
  echo "  [hive] Apache Hive 3.x 框架规律"

  local files
  files=$(_fw_resolve_globs ${HIVE_SRC_GLOBS[@]+"${HIVE_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  if [[ -z "$files" ]]; then
    warn "hive: HIVE_SRC_GLOBS 未配置或无文件可检"
    return
  fi
  local fa=()
  while IFS= read -r ln; do [[ -n "$ln" ]] && fa+=("$ln"); done <<< "$files"
  if [[ ${#fa[@]} -eq 0 ]]; then
    warn "hive: HIVE_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  local all_src
  all_src=$(cat "${fa[@]}" 2>/dev/null || true)

  # ====================================================================
  # fw_hive_acid(fail)：事务表但未配 DbTxnManager
  # CWE-754：ACID 表写操作抛异常
  # ====================================================================
  local has_txn_table has_dbtxn
  has_txn_table=$(printf '%s\n' "$all_src" | grep -nE "transactional'='true'|transactional\"='true'|'transactional'='true'" 2>/dev/null || true)
  has_dbtxn=$(printf '%s\n' "$all_src" | grep -nE 'DbTxnManager|hive\.txn\.manager' 2>/dev/null || true)
  if [[ -n "$has_txn_table" && -z "$has_dbtxn" ]]; then
    _fw_report fail fw_hive_acid "$has_txn_table" "检出事务表 TBLPROPERTIES('transactional'='true') 但未配 hive.txn.manager=DbTxnManager（MERGE/UPDATE/DELETE 失败 CWE-754）" "事务表已配 DbTxnManager 或无事务表"
  else
    pass "fw_hive_acid: 事务表已配 DbTxnManager 或无事务表"
  fi

  # ====================================================================
  # fw_hive_dynamic_partition(fail)：动态分区 INSERT 但未 nonstrict
  # CWE-754：写入被 strict 模式拒绝
  # ====================================================================
  local has_dyn_insert has_nonstrict
  has_dyn_insert=$(printf '%s\n' "$all_src" | grep -nE 'INSERT OVERWRITE TABLE[[:space:]]+[^[:space:]]+[[:space:]]+PARTITION' 2>/dev/null || true)
  has_nonstrict=$(printf '%s\n' "$all_src" | grep -nE 'dynamic\.partition\.mode[[:space:]]*=[[:space:]]*nonstrict|dynamic-partition\.mode.*nonstrict' 2>/dev/null || true)
  if [[ -n "$has_dyn_insert" && -z "$has_nonstrict" ]]; then
    _fw_report fail fw_hive_dynamic_partition "$has_dyn_insert" "检出动态分区 INSERT 但未设 hive.exec.dynamic.partition.mode=nonstrict（写入被 strict 模式拒绝 CWE-754）" "动态分区已设 nonstrict 模式或无动态分区写入"
  else
    pass "fw_hive_dynamic_partition: 动态分区已设 nonstrict 或无动态分区写入"
  fi

  # ====================================================================
  # fw_hive_execution_engine(warn)：含 HQL/配置但引擎为 mr 或未设
  # ====================================================================
  local has_hql has_tez
  has_hql=$(printf '%s\n' "$all_src" | grep -nE 'CREATE TABLE|INSERT OVERWRITE|SELECT' 2>/dev/null || true)
  has_tez=$(printf '%s\n' "$all_src" | grep -nE 'execution\.engine[[:space:]]*=[[:space:]]*tez|execution-engine.*tez|set hive.execution.engine=tez' 2>/dev/null || true)
  if [[ -n "$has_hql" && -z "$has_tez" ]]; then
    warn "fw_hive_execution_engine: 检出 HQL 操作但未设 hive.execution.engine=tez（默认 mr 批处理慢，建议切 Tez/LLAP）"
  else
    pass "fw_hive_execution_engine: 已设 Tez 引擎或无 HQL 操作"
  fi

  # ====================================================================
  # fw_hive_orc(warn)：建表 STORED AS 非 ORC
  # ====================================================================
  local create_tbl has_orc
  create_tbl=$(printf '%s\n' "$all_src" | grep -nE 'CREATE TABLE|CREATE EXTERNAL TABLE' 2>/dev/null || true)
  has_orc=$(printf '%s\n' "$all_src" | grep -nE 'STORED AS ORC' 2>/dev/null || true)
  if [[ -n "$create_tbl" && -z "$has_orc" ]]; then
    warn "fw_hive_orc: 检出 CREATE TABLE 但无 STORED AS ORC（TEXTFILE 列式低效，建议 ORC 列式+压缩）"
  else
    pass "fw_hive_orc: 建表已用 ORC 格式或无建表语句"
  fi

  # ====================================================================
  # fw_hive_vectorization(warn)：ORC 表但 vectorized 未开
  # ====================================================================
  local has_vec_off
  has_vec_off=$(printf '%s\n' "$all_src" | grep -nE 'vectorized\.execution\.enabled[[:space:]]*=[[:space:]]*false' 2>/dev/null || true)
  if [[ -n "$has_orc" && -n "$has_vec_off" ]]; then
    warn "fw_hive_vectorization: ORC 表但 hive.vectorized.execution.enabled=false（未向量化，CPU 利用率低）"
  else
    pass "fw_hive_vectorization: 向量化未显式关闭或表非 ORC"
  fi

  # ====================================================================
  # fw_hive_partition(warn)：分区表但查询无分区列谓词
  # ====================================================================
  local has_part_def has_part_pred
  has_part_def=$(printf '%s\n' "$all_src" | grep -nE 'PARTITIONED BY' 2>/dev/null || true)
  has_part_pred=$(printf '%s\n' "$all_src" | grep -nE 'WHERE[[:space:]]+[a-z_]+[[:space:]]*=|PARTITION \(' 2>/dev/null || true)
  if [[ -n "$has_part_def" && -z "$has_part_pred" ]]; then
    warn "fw_hive_partition: 检出 PARTITIONED BY 表但查询无分区列谓词（全分区扫描 IO 放大 CWE-400）"
  else
    pass "fw_hive_partition: 查询已用分区列谓词或表未分区"
  fi

  # ====================================================================
  # fw_hive_bucket(warn)：分桶表 join 但 bucket 未对齐
  # ====================================================================
  local has_cluster has_join
  has_cluster=$(printf '%s\n' "$all_src" | grep -nE 'CLUSTERED BY|INTO [0-9]+ BUCKETS' 2>/dev/null || true)
  has_join=$(printf '%s\n' "$all_src" | grep -nE '\bJOIN\b' 2>/dev/null || true)
  if [[ -n "$has_cluster" && -z "$has_join" ]]; then
    # 仅分桶无 join 不告警（分流到 join 场景）
    pass "fw_hive_bucket: 分桶表但无 join（bucket map join 无法评估，跳过）"
  elif [[ -n "$has_cluster" && -n "$has_join" ]]; then
    # 分桶且 join：无法静态判定 bucket 数匹配，提示人工核对
    warn "fw_hive_bucket: 检出分桶表 + JOIN（须核对 bucket 列==join 列且 bucket 数成倍数，否则 shuffle 放大）"
  else
    pass "fw_hive_bucket: 无分桶表 join 场景"
  fi

  # ====================================================================
  # fw_hive_external_location(warn)：external table 无 LOCATION
  # ====================================================================
  local ext_no_loc
  ext_no_loc=$(printf '%s\n' "$all_src" | awk '
    /CREATE EXTERNAL TABLE/ { inext=1; line=$0 }
    inext && /LOCATION/ { inext=0 }
    inext && /;[[:space:]]*$/ && !/LOCATION/ { print NR": "line; inext=0 }
  ' 2>/dev/null || true)
  # awk 单行边界不可靠，退化为 grep 双条件：external 存在但 LOCATION 不在同文件任意处
  if [[ -n "$create_tbl" ]]; then
    if printf '%s\n' "$all_src" | grep -qE 'CREATE EXTERNAL TABLE' 2>/dev/null; then
      if ! printf '%s\n' "$all_src" | grep -qE 'LOCATION' 2>/dev/null; then
        warn "fw_hive_external_location: 检出 CREATE EXTERNAL TABLE 但无 LOCATION（数据漂移风险）"
      else
        pass "fw_hive_external_location: external 表已指定 LOCATION"
      fi
    else
      pass "fw_hive_external_location: 无 external 表"
    fi
  else
    pass "fw_hive_external_location: 无建表语句"
  fi
}
