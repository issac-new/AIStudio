# ruleset: spark  requires_conf: SPARK_SRC_GLOBS
# gates: fw_spark_data_skew(warn) fw_spark_shuffle_partitions(warn) fw_spark_broadcast(warn) fw_spark_collect(fail) fw_spark_persist(warn) fw_spark_checkpoint(warn) fw_spark_streaming_watermark(warn)
# harvested-from: 2026-08-26，规律源自 Apache Spark 3.x RDD 编程指南 / Spark SQL 性能调优 / Structured Streaming 官方文档
_fw_spark_check() {
  echo "  [spark] Apache Spark 3.x 框架规律"

  local files
  files=$(_fw_resolve_globs ${SPARK_SRC_GLOBS[@]+"${SPARK_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  if [[ -z "$files" ]]; then
    warn "spark: SPARK_SRC_GLOBS 未配置或无文件可检"
    return
  fi
  local fa=()
  while IFS= read -r ln; do [[ -n "$ln" ]] && fa+=("$ln"); done <<< "$files"
  if [[ ${#fa[@]} -eq 0 ]]; then
    warn "spark: SPARK_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # 合并所有源文件文本（注释已保留以读取 broadcast 等调用；collect 等文本在注释里也属代码示意，可接受）
  local all_src
  all_src=$(cat "${fa[@]}" 2>/dev/null || true)

  # ====================================================================
  # fw_spark_collect(fail)：全量拉到 driver 致 OOM（CWE-400）
  # ====================================================================
  local collect_hits
  # R118：`.limit(N).collect()` / `.take(N)` / `.head(N)` 是有界拉取（Spark 官方推荐替代），
  # 不得按“全量拉到 driver”误报。框架门禁转为阻断后 spark compliant 夹具实证。
  collect_hits=$(printf '%s\n' "$all_src" | grep -nE '\.collect\(\)|\.collectAsList\(' 2>/dev/null \
    | grep -vE '\.limit\([0-9]+\)\.collect\(\)|\.take\([0-9]+\)|\.head\([0-9]+\)' || true)
  if [[ -n "$collect_hits" ]]; then
    _fw_report fail fw_spark_collect "$collect_hits" ".collect()/.collectAsList() 全量拉到 driver（大数据集 OOM，CWE-400）" "无全量 collect 到 driver 的反模式"
  else
    pass "fw_spark_collect: 无全量 collect 到 driver 的反模式"
  fi

  # ====================================================================
  # fw_spark_data_skew(warn)：热点 key 聚合未 repartition/salting
  # ====================================================================
  local agg_hits repart_hits
  agg_hits=$(printf '%s\n' "$all_src" | grep -nE 'groupByKey\(|reduceByKey\(|[^A-Za-z]groupBy\(' 2>/dev/null || true)
  repart_hits=$(printf '%s\n' "$all_src" | grep -nE 'repartition\(|salting|saltingBy|withSalt' 2>/dev/null || true)
  if [[ -n "$agg_hits" && -z "$repart_hits" ]]; then
    _fw_report warn fw_spark_data_skew "$agg_hits" "检出 groupByKey/reduceByKey/groupBy 但无 repartition/salting（热点 key 数据倾斜）" "聚合算子均配了 repartition/salting 打散"
  else
    pass "fw_spark_data_skew: 聚合算子已配 repartition/salting 或无可疑聚合"
  fi

  # ====================================================================
  # fw_spark_shuffle_partitions(warn)：未配 spark.sql.shuffle.partitions
  # ====================================================================
  local has_shuffle_conf
  has_shuffle_conf=$(printf '%s\n' "$all_src" | grep -nE 'spark\.sql\.shuffle\.partitions|spark\.default\.parallelism' 2>/dev/null || true)
  if [[ -z "$has_shuffle_conf" ]]; then
    warn "fw_spark_shuffle_partitions: 未配置 spark.sql.shuffle.partitions / spark.default.parallelism（默认 200 分区，shuffle 瓶颈 CWE-400）"
  else
    pass "fw_spark_shuffle_partitions: 已配置 shuffle 分区参数"
  fi

  # ====================================================================
  # fw_spark_broadcast(warn)：join 未 broadcast 小表 / 广播变量序列化
  # ====================================================================
  local join_hits has_broadcast
  join_hits=$(printf '%s\n' "$all_src" | grep -nE '\.join\(|Join\(' 2>/dev/null || true)
  has_broadcast=$(printf '%s\n' "$all_src" | grep -nE 'broadcast\(|sc\.broadcast|Broadcast\(' 2>/dev/null || true)
  if [[ -n "$join_hits" && -z "$has_broadcast" ]]; then
    _fw_report warn fw_spark_broadcast "$join_hits" "检出 join 但无 broadcast()（大表×小表未广播，shuffle 放大 CWE-400）" "join 已用 broadcast 或无可疑 join"
  else
    pass "fw_spark_broadcast: join 已用 broadcast 或无可疑 join"
  fi

  # ====================================================================
  # fw_spark_persist(warn)：同一 RDD/DF 多 action 无 persist/cache
  # ====================================================================
  local action_cnt
  action_cnt=$(printf '%s\n' "$all_src" | grep -cE '^\s*[A-Za-z0-9_]+\.((count|save|take|show|first|foreach|write)\b|write\.)' 2>/dev/null || true)
  local has_persist
  has_persist=$(printf '%s\n' "$all_src" | grep -nE '\.persist\(|\.cache\(|persist\(|cache\(' 2>/dev/null || true)
  if [[ "${action_cnt:-0}" -ge 2 && -z "$has_persist" ]]; then
    warn "fw_spark_persist: 同一 RDD/DF 检出多个 action（>=2）但未 persist/cache（lineage 重复计算 CWE-400）"
  else
    pass "fw_spark_persist: 多 action 已 persist/cache 或单 action"
  fi

  # ====================================================================
  # fw_spark_checkpoint(warn)：迭代循环无 checkpoint 截断 lineage
  # ====================================================================
  local loop_hits has_cp
  loop_hits=$(printf '%s\n' "$all_src" | grep -nE '\b(while|for)\b.*\{|while[[:space:]]*\(|for[[:space:]]*\(' 2>/dev/null || true)
  has_cp=$(printf '%s\n' "$all_src" | grep -nE 'setCheckpointDir|\.checkpoint\(|Checkpoint' 2>/dev/null || true)
  if [[ -n "$loop_hits" && -z "$has_cp" ]]; then
    warn "fw_spark_checkpoint: 检出迭代循环（while/for）但无 setCheckpointDir/.checkpoint()（lineage 爆炸风险 CWE-400）"
  else
    pass "fw_spark_checkpoint: 迭代算法已配 checkpoint 或无长 lineage 循环"
  fi

  # ====================================================================
  # fw_spark_streaming_watermark(warn)：流式 window 聚合无 watermark
  # ====================================================================
  local window_hits has_wm
  window_hits=$(printf '%s\n' "$all_src" | grep -nE 'window\(|\.groupBy\(.*window|GroupState|mapGroupsWithState' 2>/dev/null || true)
  has_wm=$(printf '%s\n' "$all_src" | grep -nE 'withWatermark|withWatermarks' 2>/dev/null || true)
  if [[ -n "$window_hits" && -z "$has_wm" ]]; then
    _fw_report warn fw_spark_streaming_watermark "$window_hits" "检出 window/状态聚合但无 withWatermark（流式状态无限增长 CWE-400）" "流式聚合已配 watermark 或无状态聚合"
  else
    pass "fw_spark_streaming_watermark: 流式聚合已配 watermark 或无状态聚合"
  fi
}
