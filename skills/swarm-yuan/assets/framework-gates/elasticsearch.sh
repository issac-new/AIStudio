# ruleset: elasticsearch  requires_conf: ES_SRC_GLOBS
# gates: fw_es_deep_pagination(fail) fw_es_wildcard_prefix(fail) fw_es_refresh_interval(warn) fw_es_bulk_backpressure(warn) fw_es_mapping_explosion(warn) fw_es_dynamic_mapping(warn) fw_es_filter_context(warn) fw_es_agg_depth(warn) fw_es_ilm(warn) fw_es_reindex_conflict(warn) fw_es_scroll_release(warn) fw_es_version_compat(warn) fw_es_connection_pool(warn)
# harvested-from: P3（2026-07-17），规律源自 Elasticsearch 9.x 官方文档与 Java API Client 文档
_fw_elasticsearch_check() {
  echo "  [elasticsearch] Elasticsearch 9.x 框架规律"

  # ---------- 收集源文件清单（Java + 配置 + json 统一入 srcarr） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${ES_SRC_GLOBS[@]+"${ES_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "elasticsearch: ES_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # 拆分 Java 文件 vs 配置/json 文件
  local javaarr=() cfgarr=()
  local f
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      *.java) javaarr+=("$f") ;;
      *.yml|*.yaml|*.properties|*.json|pom.xml|*.xml|*.gradle|*.gradle.kts) cfgarr+=("$f") ;;
    esac
  done

  local j c ln

  # ====================================================================
  # fw_es_deep_pagination(fail)：from+size 深分页
  # ====================================================================
  local dp_fail="" dp_warn=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    ln=$(grep -nE '\.from\([[:space:]]*[0-9]{5,}|"from"[[:space:]]*:[[:space:]]*[0-9]{5,}' "$j" 2>/dev/null || true)
    [[ -n "$ln" ]] && dp_fail="${dp_fail}${j}:${ln}
" && continue
    ln=$(grep -nE '\.from\([[:space:]]*[0-9]{4,}|"from"[[:space:]]*:[[:space:]]*[0-9]{4,}' "$j" 2>/dev/null || true)
    [[ -n "$ln" ]] && dp_warn="${dp_warn}${j}:${ln}
"
  done
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    ln=$(grep -nE '"from"[[:space:]]*:[[:space:]]*[0-9]{5,}' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && dp_fail="${dp_fail}${c}:${ln}
"
  done
  if [[ -n "$dp_fail" ]]; then
    fail "fw_es_deep_pagination: from+size 深分页超 10000（超 max_result_window 报错，深翻页堆内存线性膨胀，须改 search_after+PIT）:
${dp_fail}"
  elif [[ -n "$dp_warn" ]]; then
    warn "fw_es_deep_pagination: from ≥ 1000（深分页须评估 search_after）:
${dp_warn}"
  else
    pass "fw_es_deep_pagination: 未检出深分页"
  fi

  # ====================================================================
  # fw_es_wildcard_prefix(fail)：wildcard/query_string 前缀通配
  # ====================================================================
  local wc_fail=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    ln=$(grep -nE 'wildcardQuery\([^)]*"[?*]|queryStringQuery\("[^"]*[*]|QueryBuilders\.wildcardQuery\([^)]*\*' "$j" 2>/dev/null || true)
    [[ -n "$ln" ]] && wc_fail="${wc_fail}${j}:${ln}
"
  done
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    ln=$(grep -nE '"wildcard"[^}]*"value"[^}]*"[*?]|"query_string"[^}]*"query"[^}]*"[*]' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && wc_fail="${wc_fail}${c}:${ln}
"
  done
  _fw_report fail fw_es_wildcard_prefix "$wc_fail" "wildcard/query_string 前缀通配（退化为全 term 扫描，近似全表扫描拖垮集群，改用 ngram/search_as_you_type）" "未检出前缀通配查询"

  # ====================================================================
  # fw_es_refresh_interval(warn)：bulk 写入须权衡 refresh_interval
  # ====================================================================
  local has_bulk=0 ri_ok=0
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    if grep -qE 'BulkRequest|\.bulk\(' "$j" 2>/dev/null; then has_bulk=1; break; fi
  done
  if [[ "$has_bulk" -eq 1 ]]; then
    for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
      if grep -qE 'refresh_interval' "$c" 2>/dev/null; then ri_ok=1; break; fi
    done
    for j in "${javaarr[@]+"${javaarr[@]}"}"; do
      if grep -qE 'refresh_interval|Refresh:' "$j" 2>/dev/null; then ri_ok=1; break; fi
    done
  fi
  if [[ "$has_bulk" -eq 0 ]]; then
    pass "fw_es_refresh_interval: 无批量写入，跳过"
  elif [[ "$ri_ok" -eq 1 ]]; then
    pass "fw_es_refresh_interval: 已见 refresh_interval 权衡配置"
  else
    warn "fw_es_refresh_interval: 检出 bulk 批量写入但无 refresh_interval 配置（导入期建议 -1，在线按延迟容忍调至 5s~30s）"
  fi

  # ====================================================================
  # fw_es_bulk_backpressure(warn)：bulk 须背压重试
  # ====================================================================
  local bp_bad=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    grep -qE 'BulkRequest|\.bulk\(' "$j" 2>/dev/null || continue
    if ! grep -qE 'EsRejectedExecutionException|Backoff|Retry|BulkIngester|retry' "$j" 2>/dev/null; then
      bp_bad="${bp_bad}${j}
"
    fi
  done
  _fw_report warn fw_es_bulk_backpressure "$bp_bad" "bulk 写入无 EsRejectedExecutionException/退避重试/BulkIngester（429 时整批丢弃数据丢失）" "bulk 背压处理齐备或无 bulk"

  # ====================================================================
  # fw_es_mapping_explosion(warn)：total_fields.limit 防 mapping 爆炸
  # ====================================================================
  local has_mapping=0 tfl_ok=0
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if grep -qE '"mappings"|index\.mapping' "$c" 2>/dev/null; then has_mapping=1; fi
    if grep -qE 'total_fields\.limit' "$c" 2>/dev/null; then tfl_ok=1; fi
  done
  if [[ "$has_mapping" -eq 0 ]]; then
    pass "fw_es_mapping_explosion: 无 mappings 定义文件，跳过"
  elif [[ "$tfl_ok" -eq 1 ]]; then
    pass "fw_es_mapping_explosion: 已显式配置 total_fields.limit"
  else
    warn "fw_es_mapping_explosion: 有 mappings 但未显式设 index.mapping.total_fields.limit（默认 1000，动态实体/日志 KV 易字段爆炸）"
  fi

  # ====================================================================
  # fw_es_dynamic_mapping(warn)：dynamic 须 false/strict
  # ====================================================================
  local dyn_bad="" dyn_any=0
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    grep -qE '"mappings"' "$c" 2>/dev/null || continue
    dyn_any=1
    ln=$(grep -nE '"dynamic"[[:space:]]*:[[:space:]]*"?true' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && dyn_bad="${dyn_bad}${c}:${ln}
" && continue
    if ! grep -qE '"dynamic"[[:space:]]*:[[:space:]]*"?(false|strict)"?' "$c" 2>/dev/null; then
      dyn_bad="${dyn_bad}${c}(mappings 未声明 dynamic，默认 true)
"
    fi
  done
  if [[ "$dyn_any" -eq 0 ]]; then
    pass "fw_es_dynamic_mapping: 无 mappings 文件，跳过"
  elif [[ -n "$dyn_bad" ]]; then
    warn "fw_es_dynamic_mapping: 生产索引 dynamic 须收敛为 false/strict（脏字段写入导致 mapping 无序膨胀）:
${dyn_bad}"
  else
    pass "fw_es_dynamic_mapping: dynamic 已收敛"
  fi

  # ====================================================================
  # fw_es_filter_context(warn)：精确过滤须放 filter 上下文
  # ====================================================================
  local fc_bad=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    ln=$(grep -nE '\.must\([[:space:]]*(QueryBuilders\.)?(termQuery|termsQuery|rangeQuery|existsQuery)' "$j" 2>/dev/null || true)
    [[ -n "$ln" ]] && fc_bad="${fc_bad}${j}:${ln}
"
  done
  _fw_report warn fw_es_filter_context "$fc_bad" "term/terms/range/exists 放入 must 参与打分（精确过滤须放 filter 上下文，免 score 且可缓存）" "精确过滤已在 filter 上下文或无 bool 查询"

  # ====================================================================
  # fw_es_agg_depth(warn)：聚合嵌套深度收敛
  # ====================================================================
  local agg_bad=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    local cnt
    cnt=$(grep -cE '\.subAggregation\(' "$j" 2>/dev/null || true)
    cnt=${cnt:-0}
    if [[ "$cnt" -ge 3 ]]; then
      agg_bad="${agg_bad}${j}(subAggregation x${cnt})
"
    fi
  done
  _fw_report warn fw_es_agg_depth "$agg_bad" "聚合嵌套 ≥3 层（bucket 开销按层 size 乘积膨胀，受 search.max_buckets 65535 约束）" "聚合嵌套深度可控"

  # ====================================================================
  # fw_es_ilm(warn)：时序索引须 ILM
  # ====================================================================
  local ilm_bad=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    ln=$(grep -nE '"[a-z_]+-[0-9]{4}\.[0-9]{2}|IndexRequest\("[a-z_]+-[0-9]{4}|-[0-9]{4}-[0-9]{2}-[0-9]{2}"' "$j" 2>/dev/null || true)
    [[ -n "$ln" ]] && ilm_bad="${ilm_bad}${j}:${ln}
"
  done
  if [[ -n "$ilm_bad" ]]; then
    local ilm_ok=0
    for f in "${srcarr[@]}"; do
      if grep -qiE 'ilm|LifecyclePolicy|lifecycle_name' "$f" 2>/dev/null; then ilm_ok=1; break; fi
    done
    if [[ "$ilm_ok" -eq 0 ]]; then
      warn "fw_es_ilm: 检出日期模式索引名但全仓无 ILM/lifecycle 配置（索引只增不减终将磁盘打满）:
${ilm_bad}"
    else
      pass "fw_es_ilm: 时序索引已见 ILM 配置"
    fi
  else
    pass "fw_es_ilm: 未检出日期模式索引"
  fi

  # ====================================================================
  # fw_es_reindex_conflict(warn)：reindex 须声明 conflicts 策略
  # ====================================================================
  local rx_bad=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    grep -qE '_reindex|ReindexRequest' "$j" 2>/dev/null || continue
    if ! grep -qE 'conflicts|setConflicts|proceed' "$j" 2>/dev/null; then
      rx_bad="${rx_bad}${j}
"
    fi
  done
  _fw_report warn fw_es_reindex_conflict "$rx_bad" "reindex 调用未声明 conflicts 策略（版本冲突默认中止，迁移半成品）" "reindex 已声明冲突策略或无 reindex"

  # ====================================================================
  # fw_es_scroll_release(warn)：scroll 须 ClearScroll 释放
  # ====================================================================
  local sc_bad=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    grep -qE 'SearchScrollRequest|\.scroll\(' "$j" 2>/dev/null || continue
    if ! grep -qE 'ClearScroll|clearScroll|deletePit' "$j" 2>/dev/null; then
      sc_bad="${sc_bad}${j}
"
    fi
  done
  _fw_report warn fw_es_scroll_release "$sc_bad" "scroll 使用未显式 ClearScroll/deletePit（上下文堆积占堆、segment 无法回收）" "scroll 释放齐备或无 scroll"

  # ====================================================================
  # fw_es_version_compat(warn)：8/9 移除 RHLC 与 type
  # ====================================================================
  local vc_bad=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    ln=$(grep -nE 'RestHighLevelClient|include_type_name' "$j" 2>/dev/null || true)
    [[ -n "$ln" ]] && vc_bad="${vc_bad}${j}:${ln}
"
  done
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    ln=$(grep -nE 'elasticsearch-rest-high-level-client|include_type_name' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && vc_bad="${vc_bad}${c}:${ln}
"
  done
  _fw_report warn fw_es_version_compat "$vc_bad" "检出 RestHighLevelClient/include_type_name（8/9 已移除，须迁移 co.elastic.clients:elasticsearch-java）" "客户端为 elasticsearch-java 或无版本不兼容痕迹"

  # ====================================================================
  # fw_es_connection_pool(warn)：连接池与超时显式配置
  # ====================================================================
  local cp_bad=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    grep -qE 'RestClient\.builder' "$j" 2>/dev/null || continue
    if ! grep -qE 'setMaxConnTotal|setMaxConnPerRoute|RequestConfig|setConnectTimeout|setSocketTimeout' "$j" 2>/dev/null; then
      cp_bad="${cp_bad}${j}
"
    fi
  done
  _fw_report warn fw_es_connection_pool "$cp_bad" "RestClient.builder 未显式配连接池/超时（默认 maxConnTotal=30/maxConnPerRoute=10 偏小，须按 QPS 显式配置）" "连接池/超时已配置或未自建 RestClient"

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
