# ruleset: rag-pipeline  requires_conf: RAG_PIPELINE_GLOBS
# gates: fw_rag_embedding_latest(fail) fw_rag_prompt_injection(fail) fw_rag_similarity_threshold(warn) fw_rag_chunk_strategy(warn) fw_rag_rerank(warn) fw_rag_grounding(warn) fw_rag_context_window(warn) fw_rag_hit_monitor(warn) fw_rag_fallback(warn) fw_rag_index_refresh(warn)
# harvested-from: （2026-07-23），规律源自 OWASP LLM Top 10（LLM01/LLM08/LLM09）与 LangChain/LlamaIndex RAG 工程实践
_fw_rag_pipeline_check() {
  echo "  [rag-pipeline] RAG 管线（LangChain/LlamaIndex/自定义）框架规律"

  # ---------- 收集源文件清单（Python/JS/TS） ----------
  local srcs f ln
  local srcarr=()
  srcs=$(_fw_resolve_globs ${RAG_PIPELINE_GLOBS[@]+"${RAG_PIPELINE_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] || continue
    case "$(basename "$ln")" in
      *.py|*.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) srcarr+=("$ln") ;;
    esac
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "rag-pipeline: RAG_PIPELINE_GLOBS 未配置或无文件可检"
    return
  fi

  # 注释剥离器：Python 用 #、JS/TS 用 C 系（剔 // 与块注释行）
  _fw_rag_strip() {
    case "$(basename "$1")" in
      *.py) _fw_strip_comments_hash "$1" ;;
      *) _fw_strip_comments_c "$1" ;;
    esac
  }

  # 检索信号（项目级）：任一文件含检索器调用即视为 RAG 管线
  local retrieval_hit=0
  for f in "${srcarr[@]}"; do
    if _fw_rag_strip "$f" | grep -qE "similarity_search\(|as_retriever\(|similaritySearch|VectorStoreRetriever|\.retrieve\("; then
      retrieval_hit=1
      break
    fi
  done

  # ====================================================================
  # fw_rag_embedding_latest(fail)：embedding/模型 :latest 漂移标签（OWASP LLM08）
  # ====================================================================
  local el_bad=""
  for f in "${srcarr[@]}"; do
    ln=$(_fw_rag_strip "$f" | grep -inE "(model|embed)[A-Za-z_]*[[:space:]]*=[[:space:]]*[\"'][^\"']*:latest[\"']" || true)
    [[ -n "$ln" ]] && el_bad="${el_bad}${f}:${ln}
"
  done
  _fw_report fail fw_rag_embedding_latest "$el_bad" "embedding/模型 :latest 漂移标签（权重更新后向量空间静默变化，新旧向量不可比检索劣化；须固定版本标签或 digest，升级走新索引并行构建+评测切换）" "embedding 模型版本均固定"

  # ====================================================================
  # fw_rag_prompt_injection(fail)：用户输入直拼 prompt（CWE-94 / OWASP LLM01）
  # ====================================================================
  local pi_bad=""
  for f in "${srcarr[@]}"; do
    ln=$(_fw_rag_strip "$f" | grep -inE "f[\"'][^\"']*[{](question|user_input|user_query|query|user_text)" || true)
    [[ -n "$ln" ]] && pi_bad="${pi_bad}${f}:${ln}
"
    ln=$(_fw_rag_strip "$f" | grep -inE "(prompt|instruction)[A-Za-z_]*[[:space:]]*=[[:space:]]*[\"'][^\"']*[\"'][[:space:]]*\+" || true)
    [[ -n "$ln" ]] && pi_bad="${pi_bad}${f}:${ln}
"
    ln=$(_fw_rag_strip "$f" | grep -inE "[$][{](question|user_input|user_query|query|user_text)" || true)
    [[ -n "$ln" ]] && pi_bad="${pi_bad}${f}:${ln}
"
  done
  _fw_report fail fw_rag_prompt_injection "$pi_bad" "用户输入直拼 prompt（CWE-94/OWASP LLM01 prompt 注入，系统提示泄露/答案劫持；须 PromptTemplate 槽位隔离+输入清洗+系统指令明示忽略资料内指令）" "用户输入经模板槽位隔离无直拼"

  # ====================================================================
  # fw_rag_similarity_threshold(warn)：检索须配相似度阈值（CWE-754）
  # ====================================================================
  local th_hit=0
  for f in "${srcarr[@]}"; do
    if _fw_rag_strip "$f" | grep -qiE "score_threshold|similarity_threshold|similarity_cutoff|scoreThreshold|min_score"; then
      th_hit=1
      break
    fi
  done
  if [[ "$retrieval_hit" -eq 0 ]]; then
    pass "fw_rag_similarity_threshold: 无检索调用信号，跳过"
  elif [[ "$th_hit" -eq 1 ]]; then
    pass "fw_rag_similarity_threshold: 已配置相似度阈值"
  else
    warn "fw_rag_similarity_threshold: 检出检索调用但无 score_threshold/similarity_cutoff（默认 Top-K 无分数下限，低分噪声进上下文即幻觉温床 CWE-754；阈值须按 embedding 分布评测标定）"
  fi

  # ====================================================================
  # fw_rag_chunk_strategy(warn)：裸 CharacterTextSplitter 固定大小盲分
  # ====================================================================
  local ck_bad=""
  for f in "${srcarr[@]}"; do
    ln=$(_fw_rag_strip "$f" | grep -nE "(^|[^A-Za-z_])CharacterTextSplitter\(" || true)
    [[ -n "$ln" ]] && ck_bad="${ck_bad}${f}:${ln}
"
  done
  _fw_report warn fw_rag_chunk_strategy "$ck_bad" "固定大小盲分（句子/段落/表格从语义中间劈开，检索命中半句话碎片；须 RecursiveCharacterTextSplitter 起步，Markdown/代码用结构感知分块器，overlap 10~20%）" "无裸 CharacterTextSplitter 盲分"

  # ====================================================================
  # fw_rag_rerank(warn)：检索结果须重排序（cross-encoder 精排）
  # ====================================================================
  local rr_hit=0
  for f in "${srcarr[@]}"; do
    if _fw_rag_strip "$f" | grep -qiE "rerank|CrossEncoder|cross_encoder"; then
      rr_hit=1
      break
    fi
  done
  if [[ "$retrieval_hit" -eq 0 ]]; then
    pass "fw_rag_rerank: 无检索调用信号，跳过"
  elif [[ "$rr_hit" -eq 1 ]]; then
    pass "fw_rag_rerank: 已配置重排序"
  else
    warn "fw_rag_rerank: 检出检索调用但无 rerank/CrossEncoder 信号（向量粗排直出精度天花板低；须两阶段：粗排召回 20~50 → cross-encoder 精排留 3~5 再进上下文）"
  fi

  # ====================================================================
  # fw_rag_grounding(warn)：须配幻觉检测（grounding/citation 引用溯源）
  # ====================================================================
  local gr_hit=0
  for f in "${srcarr[@]}"; do
    if _fw_rag_strip "$f" | grep -qiE "citation|grounding|with_sources|return_source_documents|source_documents|source_nodes"; then
      gr_hit=1
      break
    fi
  done
  if [[ "$retrieval_hit" -eq 0 ]]; then
    pass "fw_rag_grounding: 无检索调用信号，跳过"
  elif [[ "$gr_hit" -eq 1 ]]; then
    pass "fw_rag_grounding: 已配置引用溯源/grounding"
  else
    warn "fw_rag_grounding: 检出检索管线但无 citation/grounding/source_documents 溯源信号（OWASP LLM09 幻觉无据可查；答案须附引用，无命中显式拒答而非硬答）"
  fi

  # ====================================================================
  # fw_rag_context_window(warn)：检索结果拼接须有 token 预算（防超长截断）
  # ====================================================================
  local join_hit=0 budget_hit=0
  for f in "${srcarr[@]}"; do
    if _fw_rag_strip "$f" | grep -qE "\.join\(|combine_documents|StuffDocumentsChain"; then
      join_hit=1
    fi
    if _fw_rag_strip "$f" | grep -qiE "max_tokens|max_context|truncate|trim_messages|context_window"; then
      budget_hit=1
    fi
  done
  if [[ "$join_hit" -eq 0 ]]; then
    pass "fw_rag_context_window: 无检索结果拼接信号，跳过"
  elif [[ "$budget_hit" -eq 1 ]]; then
    pass "fw_rag_context_window: 已配上下文 token 预算"
  else
    warn "fw_rag_context_window: 检索结果 join 直拼但无 max_tokens/truncate 预算（超窗口即 API 报错或静默截断丢关键片段；须按模型窗口定预算，按 rerank 分数装入超预算即停）"
  fi

  # ====================================================================
  # fw_rag_hit_monitor(warn)：须配检索命中率监控
  # ====================================================================
  local hm_hit=0
  for f in "${srcarr[@]}"; do
    if _fw_rag_strip "$f" | grep -qiE "hit_rate|hit_count|retrieval_metric|track_retrieval|recall@"; then
      hm_hit=1
      break
    fi
  done
  if [[ "$retrieval_hit" -eq 0 ]]; then
    pass "fw_rag_hit_monitor: 无检索调用信号，跳过"
  elif [[ "$hm_hit" -eq 1 ]]; then
    pass "fw_rag_hit_monitor: 已配检索命中率监控"
  else
    warn "fw_rag_hit_monitor: 检出检索调用但无命中率/相似度分监控埋点（RAG 质量渐进劣化不可见；须埋点命中率/拒答率并接 metrics 体系，按周回看低分 query）"
  fi

  # ====================================================================
  # fw_rag_fallback(warn)：检索失败/无命中须有 fallback 降级
  # ====================================================================
  local fb_hit=0
  for f in "${srcarr[@]}"; do
    if _fw_rag_strip "$f" | grep -qE "try:|except|fallback|catch[[:space:]]*[({]"; then
      fb_hit=1
      break
    fi
  done
  if [[ "$retrieval_hit" -eq 0 ]]; then
    pass "fw_rag_fallback: 无检索调用信号，跳过"
  elif [[ "$fb_hit" -eq 1 ]]; then
    pass "fw_rag_fallback: 已配检索降级策略"
  else
    warn "fw_rag_fallback: 检出检索调用但无 try/except/fallback 降级（向量库超时/embedding 抖动/全低分三形态须有预案；无命中显式拒答，禁 LLM 凭参数知识硬编）"
  fi

  # ====================================================================
  # fw_rag_index_refresh(warn)：向量索引须定期重建/增量更新
  # ====================================================================
  local idx_hit=0 upd_hit=0
  for f in "${srcarr[@]}"; do
    if _fw_rag_strip "$f" | grep -qE "FAISS\.|Chroma\(|from_documents\(|Pinecone|Milvus|Qdrant|Weaviate|VectorStoreIndex"; then
      idx_hit=1
    fi
    if _fw_rag_strip "$f" | grep -qiE "add_documents|add_texts|upsert|refresh_index|rebuild_index|update_index"; then
      upd_hit=1
    fi
  done
  if [[ "$idx_hit" -eq 0 ]]; then
    pass "fw_rag_index_refresh: 无向量库初始化信号，跳过"
  elif [[ "$upd_hit" -eq 1 ]]; then
    pass "fw_rag_index_refresh: 已有索引增量更新/重建通道"
  else
    warn "fw_rag_index_refresh: 检出向量库初始化但无 add_documents/upsert/rebuild 更新信号（知识腐化：答案引用废止制度、删掉的敏感文档仍可检出；须增量更新+定期全量重建蓝绿切换）"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
