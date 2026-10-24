# ruleset: langchain  requires_conf: LANGCHAIN_SRC_GLOBS
# gates: fw_langchain_legacy_imports(fail) fw_langchain_legacy_chain(fail) fw_langchain_hardcoded_key(fail) fw_langchain_dangerous_tool(fail) fw_langchain_sql_chain(warn) fw_langchain_pii_prompt(warn) fw_langchain_retry_timeout(warn) fw_langchain_async_sync(warn) fw_langchain_verbose(warn) fw_langchain_memory_limit(warn) fw_langchain_agent_loop(warn) fw_langchain_untrusted_deser(warn)
# harvested-from: P1/P2（2026-07-20），规律源自 LangChain 0.3.x / 1.0 官方迁移指南与安全策略（https://python.langchain.com/docs/versions/v0_3/ ；https://docs.langchain.com/oss/python/security-policy ；CVE-2023-44467 / CVE-2023-36189 / CVE-2025-68664）
_fw_langchain_check() {
  echo "  [langchain] LangChain 0.3.x / 1.0（LangGraph 生态）框架规律"

  # ---------- 收集源文件清单 ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${LANGCHAIN_SRC_GLOBS[@]+"${LANGCHAIN_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "langchain: LANGCHAIN_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # 代码正文过滤：调公共库 _fw_strip_comments_hash（Python 系，剔 # 注释）

  # ====================================================================
  # fw_langchain_legacy_imports(fail)：0.1 时代导入路径须迁 langchain_core/伙伴包
  # ====================================================================
  local imp_bad=""
  for f in "${srcarr[@]}"; do
    local ln
    ln=$(_fw_strip_comments_hash "$f" | grep -nE 'from[[:space:]]+langchain\.(chat_models|llms|prompts|schema|callbacks|memory|document_loaders|vectorstores|embeddings|text_splitter)[[:space:]]+import' 2>/dev/null || true)
    [[ -n "$ln" ]] && imp_bad="${imp_bad}${f}:${ln}
"
  done
  _fw_report fail fw_langchain_legacy_imports "$imp_bad" "0.1 时代导入路径（langchain.chat_models/llms/prompts/schema 等在 0.3 已移除/弃用；迁 langchain_openai、langchain_core.prompts 等伙伴包）" "无 0.1 时代导入路径"

  # ====================================================================
  # fw_langchain_legacy_chain(fail)：LLMChain/initialize_agent/chain.run() 旧链式 API 须迁 LCEL
  # ====================================================================
  local chn_bad=""
  for f in "${srcarr[@]}"; do
    local ln
    ln=$(_fw_strip_comments_hash "$f" | grep -nE 'LLMChain\(|initialize_agent\(|(chain|agent|executor)\.run\(' 2>/dev/null || true)
    [[ -n "$ln" ]] && chn_bad="${chn_bad}${f}:${ln}
"
  done
  _fw_report fail fw_langchain_legacy_chain "$chn_bad" "旧链式 API（LLMChain 0.1 弃用、initialize_agent 已移除、.run() 改 .invoke()；迁 LCEL prompt|llm|parser 或 create_agent）" "无 LLMChain/initialize_agent/.run() 旧 API"

  # ====================================================================
  # fw_langchain_hardcoded_key(fail)：API 密钥禁硬编码，须环境变量/密钥管理
  # ====================================================================
  local key_bad=""
  for f in "${srcarr[@]}"; do
    local ln
    ln=$(_fw_strip_comments_hash "$f" | grep -nE "(api_key|apikey|api_secret|secret_key|access_token)[[:space:]]*=[[:space:]]*[\"'][^\"']{8,}[\"']" 2>/dev/null || true)
    [[ -n "$ln" ]] && key_bad="${key_bad}${f}:${ln}
"
    ln=$(_fw_strip_comments_hash "$f" | grep -nE "os\.environ\[[\"'][A-Z0-9_]+[\"']\][[:space:]]*=[[:space:]]*[\"'][^\"']+[\"']" 2>/dev/null || true)
    [[ -n "$ln" ]] && key_bad="${key_bad}${f}:${ln}
"
  done
  _fw_report fail fw_langchain_hardcoded_key "$key_bad" "API 密钥硬编码进源码（CWE-798；泄露即计费盗用+数据外泄，须 os.environ.get/密钥管理服务）" "密钥均取自环境变量"

  # ====================================================================
  # fw_langchain_dangerous_tool(fail)：PythonREPL 等代码执行工具须沙箱隔离
  # ====================================================================
  local dt_bad=""
  for f in "${srcarr[@]}"; do
    local ln
    ln=$(_fw_strip_comments_hash "$f" | grep -nE 'PythonREPL|python_repl|PALChain' 2>/dev/null || true)
    [[ -n "$ln" ]] && dt_bad="${dt_bad}${f}:${ln}
"
  done
  _fw_report fail fw_langchain_dangerous_tool "$dt_bad" "PythonREPL/PALChain 代码执行工具（LLM 输出直接进解释器，prompt 注入即 RCE：CVE-2023-44467/CWE-94；仅可在沙箱容器内使用）" "无 PythonREPL/PALChain 危险工具"

  # ====================================================================
  # fw_langchain_sql_chain(warn)：SQLDatabaseChain/create_sql_agent 须只读凭证+人工复核
  # ====================================================================
  local sql_bad=""
  for f in "${srcarr[@]}"; do
    if _fw_strip_comments_hash "$f" | grep -qE 'SQLDatabaseChain|create_sql_agent'; then
      sql_bad="${sql_bad}${f}: SQLDatabaseChain/create_sql_agent（模型生成 SQL 直执行，须只读账号+行级权限+人工复核）
"
    fi
  done
  _fw_report warn fw_langchain_sql_chain "$sql_bad" "模型生成 SQL 直接执行（CVE-2023-36189/CWE-89；官方安全策略要求只读凭证+最小权限）" "无 SQLDatabaseChain/create_sql_agent"

  # ====================================================================
  # fw_langchain_pii_prompt(warn)：prompt 拼接 PII 字段须先脱敏
  # ====================================================================
  local pii_bad=""
  for f in "${srcarr[@]}"; do
    if _fw_strip_comments_hash "$f" | grep -qE 'PromptTemplate|ChatPromptTemplate|\.format\(' \
       && _fw_strip_comments_hash "$f" | grep -qE 'id_card|idcard|phone_number|mobile|passport|ssn|bank_card|身份证|手机号'; then
      pii_bad="${pii_bad}${f}: prompt 模板/格式化涉 PII 字段（身份证/手机号等直送第三方 LLM 即个人信息出境泄露）
"
    fi
  done
  _fw_report warn fw_langchain_pii_prompt "$pii_bad" "PII 进 prompt（CWE-359；GB/T 35273 个人信息安全规范——送 LLM 前须脱敏/假名化）" "prompt 无 PII 字段拼接"

  # ====================================================================
  # fw_langchain_retry_timeout(warn)：Chat 模型构造须显式 timeout/max_retries
  # ====================================================================
  local rt_bad=""
  for f in "${srcarr[@]}"; do
    if _fw_strip_comments_hash "$f" | grep -qE 'Chat(OpenAI|Anthropic|Tongyi|Moonshot|ZhipuAI|Baichuan|Ollama|DeepSeek)\(' \
       && ! _fw_strip_comments_hash "$f" | grep -qE 'timeout|max_retries'; then
      rt_bad="${rt_bad}${f}: Chat 模型构造无 timeout/max_retries（限流/抖动即挂死或雪崩，须显式超时+重试上限）
"
    fi
  done
  _fw_report warn fw_langchain_retry_timeout "$rt_bad" "LLM 调用缺超时与重试上限（429/网络抖动无缓冲；生产须 timeout+max_retries 或 tenacity 退避）" "Chat 模型均配超时/重试"

  # ====================================================================
  # fw_langchain_async_sync(warn)：async 上下文内 .invoke() 同步阻塞须 ainvoke
  # ====================================================================
  local asy_bad=""
  for f in "${srcarr[@]}"; do
    if grep -qE 'async[[:space:]]+def' "$f" 2>/dev/null \
       && _fw_strip_comments_hash "$f" | grep -qE '\.invoke\(' \
       && ! _fw_strip_comments_hash "$f" | grep -qE 'ainvoke'; then
      asy_bad="${asy_bad}${f}: async 函数内同步 .invoke()（LLM 调用数十秒阻塞事件循环；须 await ainvoke）
"
    fi
  done
  _fw_report warn fw_langchain_async_sync "$asy_bad" "async 上下文同步 invoke 阻塞事件循环（并发吞吐崩塌）" "async 路径用 ainvoke 或无 async"

  # ====================================================================
  # fw_langchain_verbose(warn)：verbose=True 生产泄露 prompt/中间步
  # ====================================================================
  local vb_bad=""
  for f in "${srcarr[@]}"; do
    local ln
    ln=$(_fw_strip_comments_hash "$f" | grep -nE 'verbose[[:space:]]*=[[:space:]]*True' 2>/dev/null || true)
    [[ -n "$ln" ]] && vb_bad="${vb_bad}${f}:${ln}
"
  done
  _fw_report warn fw_langchain_verbose "$vb_bad" "verbose=True 全量打印 prompt/工具入参（CWE-532 日志敏感信息泄露；生产关闭或改结构化 trace）" "无 verbose=True"

  # ====================================================================
  # fw_langchain_memory_limit(warn)：ConversationBufferMemory 须 max_token_limit 防爆上下文
  # ====================================================================
  local mem_bad=""
  for f in "${srcarr[@]}"; do
    if _fw_strip_comments_hash "$f" | grep -qE 'ConversationBufferMemory\(' \
       && ! _fw_strip_comments_hash "$f" | grep -qE 'max_token_limit'; then
      mem_bad="${mem_bad}${f}: ConversationBufferMemory 无 max_token_limit（历史无限增长撑爆上下文窗口+token 计费失控；须窗口/摘要记忆或 trim_messages）
"
    fi
  done
  _fw_report warn fw_langchain_memory_limit "$mem_bad" "对话历史无 token 上限（上下文超限即 API 报错，长会话必崩）" "记忆有上限或用 trim/window"

  # ====================================================================
  # fw_langchain_agent_loop(warn)：AgentExecutor 须 max_iterations 防死循环烧钱
  # ====================================================================
  local loop_bad=""
  for f in "${srcarr[@]}"; do
    if _fw_strip_comments_hash "$f" | grep -qE 'AgentExecutor' \
       && ! _fw_strip_comments_hash "$f" | grep -qE 'max_iterations'; then
      loop_bad="${loop_bad}${f}: AgentExecutor 无 max_iterations（agent 工具循环不收敛即无限调用 LLM，token 计费失控）
"
    fi
  done
  _fw_report warn fw_langchain_agent_loop "$loop_bad" "agent 循环无迭代上限（须 max_iterations/max_execution_time 兜底）" "AgentExecutor 有迭代上限或未使用"

  # ====================================================================
  # fw_langchain_untrusted_deser(warn)：allow_dangerous_deserialization=True 须确认产物可信
  # ====================================================================
  local de_bad=""
  for f in "${srcarr[@]}"; do
    local ln
    ln=$(_fw_strip_comments_hash "$f" | grep -nE 'allow_dangerous_deserialization[[:space:]]*=[[:space:]]*True' 2>/dev/null || true)
    [[ -n "$ln" ]] && de_bad="${de_bad}${f}:${ln}
"
  done
  _fw_report warn fw_langchain_untrusted_deser "$de_bad" "危险反序列化开关打开（FAISS 等 pickle 加载，CWE-502；索引文件须自产可信，禁加载外部产物）" "无危险反序列化开关"

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
