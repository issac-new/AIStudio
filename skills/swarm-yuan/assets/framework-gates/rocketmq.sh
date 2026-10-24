# ruleset: rocketmq  requires_conf: ROCKETMQ_SRC_GLOBS
# gates: fw_rocketmq_idempotent_consumer(fail) fw_rocketmq_orderly_listener(fail) fw_rocketmq_tx_checkback(fail) fw_rocketmq_retry_dlq(warn) fw_rocketmq_backlog(warn) fw_rocketmq_delay(warn) fw_rocketmq_batch(warn) fw_rocketmq_filter(warn) fw_rocketmq_broadcast(warn) fw_rocketmq_order_scope(warn) fw_rocketmq_trace(warn) fw_rocketmq_group_consistency(warn)
# harvested-from: P3 深化（2026-07-17），规律源自 RocketMQ 5.5.0 / rocketmq-spring 2.3.x 官方文档
_fw_rocketmq_check() {
  echo "  [rocketmq] RocketMQ 5.x / rocketmq-spring 2.3.x 框架规律"

  # ---------- 收集源文件清单（Java + 配置文件统一入 srcarr） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${ROCKETMQ_SRC_GLOBS[@]+"${ROCKETMQ_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "rocketmq: ROCKETMQ_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # 拆分 Java 文件 vs 配置/构建文件
  local javaarr=() cfgarr=()
  local f
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      *.java) javaarr+=("$f") ;;
      *.yml|*.yaml|*.properties|pom.xml|build.gradle|*.gradle|*.gradle.kts) cfgarr+=("$f") ;;
    esac
  done

  # 代码正文过滤：调公共库 _fw_strip_comments_c（C 系，剥离行注释与块注释行，防注释中关键字误命中）

  # ====================================================================
  # fw_rocketmq_idempotent_consumer(fail)：消费端必须幂等
  # ====================================================================
  local listener_files
  listener_files=$(grep -rlE '@RocketMQMessageListener\b|MessageListenerConcurrently|MessageListenerOrderly|RocketMQListener' "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null || true)
  local idem_bad=""
  while IFS= read -r lf; do
    [[ -z "$lf" ]] && continue
    # 跳过纯接口/抽象定义（无消费体的 RocketMQListener 接口声明文件）
    if ! _fw_strip_comments_c "$lf" | grep -qE 'onMessage|consume'; then
      continue
    fi
    if ! _fw_strip_comments_c "$lf" | grep -qiE '幂等|idempot|dedup|去重|setIfAbsent|setnx|ON DUPLICATE|insertIgnore|uk_[a-z]|unique[[:space:]]+key|consumeOnce|existsConsumed'; then
      idem_bad="${idem_bad}${lf}
"
    fi
  done <<< "$listener_files"
  if [[ -z "$listener_files" ]]; then
    pass "fw_rocketmq_idempotent_consumer: 无消费者监听器，跳过"
  elif [[ -n "$idem_bad" ]]; then
    fail "fw_rocketmq_idempotent_consumer: 消费端无幂等去重（at-least-once 必然重复投递，须 msgKey SETNX / DB 唯一键）:
${idem_bad}"
  else
    pass "fw_rocketmq_idempotent_consumer: 消费端均有幂等痕迹"
  fi

  # ====================================================================
  # fw_rocketmq_orderly_listener(fail)：顺序消息消费端须 ORDERLY
  # ====================================================================
  local orderly_send=""
  orderly_send=$(grep -rlE 'sendOrderly|MessageQueueSelector' "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null || true)
  if [[ -z "$orderly_send" ]]; then
    pass "fw_rocketmq_orderly_listener: 无顺序消息发送，跳过"
  else
    local orderly_consume=""
    orderly_consume=$(grep -rlE 'ORDERLY|MessageListenerOrderly' "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null || true)
    if [[ -z "$orderly_consume" ]]; then
      fail "fw_rocketmq_orderly_listener: 检出 sendOrderly 顺序发送但消费端无 ORDERLY 监听（并发监听破坏分区顺序语义）:
${orderly_send}"
    else
      pass "fw_rocketmq_orderly_listener: 顺序发送配套 ORDERLY 消费"
    fi
  fi

  # ====================================================================
  # fw_rocketmq_tx_checkback(fail)：事务消息须 checkLocalTransaction 回查
  # ====================================================================
  local tx_files=""
  tx_files=$(grep -rlE 'TransactionListener|executeLocalTransaction|sendMessageInTransaction|@RocketMQTransactionListener' "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null || true)
  if [[ -z "$tx_files" ]]; then
    pass "fw_rocketmq_tx_checkback: 无事务消息，跳过"
  else
    local cb_hit=""
    cb_hit=$(grep -rlE 'checkLocalTransaction' "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null || true)
    if [[ -z "$cb_hit" ]]; then
      fail "fw_rocketmq_tx_checkback: 检出事务消息但未实现 checkLocalTransaction 回查（half 消息悬挂，本地事务与消息状态不一致）:
${tx_files}"
    else
      pass "fw_rocketmq_tx_checkback: 事务消息已实现回查"
    fi
  fi

  # ====================================================================
  # fw_rocketmq_retry_dlq(warn)：重试次数收敛 + DLQ 兜底
  # ====================================================================
  if [[ -z "$listener_files" ]]; then
    pass "fw_rocketmq_retry_dlq: 无消费者监听器，跳过"
  else
    local retry_hit=0 j c
    for j in "${javaarr[@]+"${javaarr[@]}"}"; do
      _fw_strip_comments_c "$j" | grep -qE 'maxReconsumeTimes' && { retry_hit=1; break; }
    done
    if [[ "$retry_hit" -eq 0 ]]; then
      for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
        grep -qE 'max-reconsume-times|maxReconsumeTimes' "$c" 2>/dev/null && { retry_hit=1; break; }
      done
    fi
    if [[ "$retry_hit" -eq 0 ]]; then
      warn "fw_rocketmq_retry_dlq: 消费者未显式配置 maxReconsumeTimes（默认 16 次重试后进 %DLQ%，须显式收敛 + DLQ 监控兜底）"
    else
      pass "fw_rocketmq_retry_dlq: 已显式配置重试次数"
    fi
  fi

  # ====================================================================
  # fw_rocketmq_backlog(warn)：消费并发度显式配置防堆积
  # ====================================================================
  if [[ -z "$listener_files" ]]; then
    pass "fw_rocketmq_backlog: 无消费者监听器，跳过"
  else
    local conc_hit=0
    for j in "${javaarr[@]+"${javaarr[@]}"}"; do
      _fw_strip_comments_c "$j" | grep -qE 'consumeThread|consumeMessageBatchMaxSize' && { conc_hit=1; break; }
    done
    if [[ "$conc_hit" -eq 0 ]]; then
      for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
        grep -qE 'consume-thread|consumeThread' "$c" 2>/dev/null && { conc_hit=1; break; }
      done
    fi
    if [[ "$conc_hit" -eq 0 ]]; then
      warn "fw_rocketmq_backlog: 消费并发度未显式配置（consumeThreadNumber/consumeMessageBatchMaxSize；消费速率须 ≥ 生产速率防堆积）"
    else
      pass "fw_rocketmq_backlog: 消费并发度已显式配置"
    fi
  fi

  # ====================================================================
  # fw_rocketmq_delay(warn)：延迟消息用 broker 定时，禁 sleep
  # ====================================================================
  local sleep_bad="" delay_api_hit=0
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    _fw_strip_comments_c "$j" | grep -qE 'setDelayTimeLevel|setDeliverTimeMs|withDelayTimeLevel|messageDelayLevel' && delay_api_hit=1
    # 仅检查含 RocketMQ 生产/消费语义的文件内的 Thread.sleep
    if grep -qE 'RocketMQ|MQProducer|MQPushConsumer' "$j" 2>/dev/null; then
      local sl
      sl=$(_fw_strip_comments_c "$j" | grep -nE 'Thread\.sleep' || true)
      [[ -n "$sl" ]] && sleep_bad="${sleep_bad}${j}:${sl}
"
    fi
  done
  if [[ -n "$sleep_bad" ]]; then
    warn "fw_rocketmq_delay: RocketMQ 相关代码检出 Thread.sleep（禁止 sleep/轮询模拟延迟，用 setDelayTimeLevel / 5.x setDeliverTimeMs）:
${sleep_bad}"
  elif [[ "$delay_api_hit" -eq 1 ]]; then
    pass "fw_rocketmq_delay: 使用 broker 延迟/定时消息 API"
  else
    pass "fw_rocketmq_delay: 无延迟消息与 sleep 模拟，跳过"
  fi

  # ====================================================================
  # fw_rocketmq_batch(warn)：批量消息约束确认
  # ====================================================================
  local batch_hit=""
  batch_hit=$(grep -rnE 'sendBatch|\.send\([^)]*(Collection|List)<|\.send\([a-zA-Z_][a-zA-Z0-9_]*[sS]\)' "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null | grep -vE 'convertAndSend|syncSend|asyncSend' || true)
  _fw_report warn fw_rocketmq_batch "${batch_hit}" "检出批量发送（须同 topic、总大小 ≤4MiB 自行切分、失败降级单发定位毒丸）" "无批量发送，跳过"

  # ====================================================================
  # fw_rocketmq_filter(warn)：SQL92 过滤须 broker 开关
  # ====================================================================
  local sql_hit=""
  sql_hit=$(grep -rnE 'MessageSelector\.bySql|SelectorType\.SQL92|bySql' "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null || true)
  _fw_report warn fw_rocketmq_filter "${sql_hit}" "检出 SQL92 过滤（broker 须 enablePropertyFilter=true；能用 tag 就不用 SQL92，大流量 CPU 开销）" "无 SQL92 过滤，跳过"

  # ====================================================================
  # fw_rocketmq_broadcast(warn)：广播模式确认可丢失
  # ====================================================================
  local bc_hit=""
  bc_hit=$(grep -rnE 'BROADCASTING|broadcasting' "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null || true)
  _fw_report warn fw_rocketmq_broadcast "${bc_hit}" "检出广播模式（失败不重试 + 实例重启错过窗口消息，仅限缓存刷新等可丢失场景）" "无广播模式（默认集群模式）"

  # ====================================================================
  # fw_rocketmq_order_scope(warn)：分区顺序 vs 全局顺序
  # ====================================================================
  if [[ -z "$orderly_send" ]]; then
    pass "fw_rocketmq_order_scope: 无顺序消息，跳过"
  else
    warn "fw_rocketmq_order_scope: 检出顺序消息发送，人工确认走分区顺序（shardingKey 哈希选队列）而非全局单队列（全局顺序吞吐被单队列锁死）:
${orderly_send}"
  fi

  # ====================================================================
  # fw_rocketmq_trace(warn)：生产须开消息轨迹
  # ====================================================================
  local rmq_usage=0 trace_hit=0
  [[ -n "$listener_files" || -n "$orderly_send" ]] && rmq_usage=1
  if [[ "$rmq_usage" -eq 0 ]]; then
    for j in "${javaarr[@]+"${javaarr[@]}"}"; do
      grep -qE 'RocketMQTemplate|DefaultMQProducer|DefaultMQPushConsumer' "$j" 2>/dev/null && { rmq_usage=1; break; }
    done
  fi
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    grep -qE 'enableMsgTrace|enable-msg-trace' "$c" 2>/dev/null && { trace_hit=1; break; }
  done
  if [[ "$trace_hit" -eq 0 ]]; then
    for j in "${javaarr[@]+"${javaarr[@]}"}"; do
      grep -qE 'enableMsgTrace' "$j" 2>/dev/null && { trace_hit=1; break; }
    done
  fi
  if [[ "$rmq_usage" -eq 0 ]]; then
    pass "fw_rocketmq_trace: 无 RocketMQ 使用迹象，跳过"
  elif [[ "$trace_hit" -eq 1 ]]; then
    pass "fw_rocketmq_trace: 已开启消息轨迹"
  else
    warn "fw_rocketmq_trace: 检出 RocketMQ 使用但未开 enableMsgTrace（生产/消费双侧均须开启，否则链路故障无法定位）"
  fi

  # ====================================================================
  # fw_rocketmq_group_consistency(warn)：同组订阅关系须一致
  # ====================================================================
  local dup_groups gc_bad=""
  dup_groups=$(grep -hoE 'consumerGroup[[:space:]]*=[[:space:]]*"[^"]+"' "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null \
    | sed -E 's/.*"([^"]+)".*/\1/' | sort | uniq -d || true)
  while IFS= read -r grp; do
    [[ -z "$grp" ]] && continue
    local topics
    topics=$(grep -lE "consumerGroup[[:space:]]*=[[:space:]]*\"${grp}\"" "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null \
      | xargs grep -hoE 'topic[[:space:]]*=[[:space:]]*"[^"]+"' 2>/dev/null \
      | sed -E 's/.*"([^"]+)".*/\1/' | sort -u || true)
    local tcount
    tcount=$(printf '%s\n' "$topics" | grep -cE '.' || true)
    if [[ "${tcount:-0}" -gt 1 ]]; then
      gc_bad="${gc_bad}consumerGroup=${grp} 订阅了 ${tcount} 个不同 topic（同组订阅关系必须一致）
"
    fi
  done <<< "$dup_groups"
  _fw_report warn fw_rocketmq_group_consistency "${gc_bad}" "同一 consumerGroup 订阅不同 topic（broker 端订阅互相覆盖，消息静默丢弃）" "无同组多 topic 订阅"

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
