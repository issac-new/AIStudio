# ruleset: rabbitmq  requires_conf: RABBITMQ_SRC_GLOBS
# gates: fw_rabbitmq_manual_ack(fail) fw_rabbitmq_idempotent_consumer(warn) fw_rabbitmq_dlq(warn) fw_rabbitmq_durable_persistent(warn) fw_rabbitmq_connection_reuse(warn) fw_rabbitmq_prefetch(warn) fw_rabbitmq_publisher_confirm(warn) fw_rabbitmq_delay(warn) fw_rabbitmq_quorum(warn) fw_rabbitmq_exchange_type(warn) fw_rabbitmq_consumer_concurrency(warn) fw_rabbitmq_auto_delete(warn) fw_rabbit_endpoint_pair(warn)
# harvested-from: P3 深化（2026-07-17），规律源自 RabbitMQ 4.x（classic 废弃/quorum 默认）/ spring-amqp 3.x/4.x 官方文档
_fw_rabbitmq_check() {
  echo "  [rabbitmq] RabbitMQ 4.x / spring-amqp 3.x/4.x 框架规律"

  # ---------- 收集源文件清单（Java + 配置文件统一入 srcarr） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${RABBITMQ_SRC_GLOBS[@]+"${RABBITMQ_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "rabbitmq: RABBITMQ_SRC_GLOBS 未配置或无文件可检"
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

  # 代码正文过滤辅助：调公共库 _fw_strip_comments_c（剥离行注释与块注释行，防注释中关键字误命中）

  # 常用检出集合
  local listener_files
  listener_files=$(grep -rlE '@RabbitListener\b' "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null || true)
  local rmq_usage=0
  [[ -n "$listener_files" ]] && rmq_usage=1
  if [[ "$rmq_usage" -eq 0 ]]; then
    local u
    u=$(grep -rlE 'RabbitTemplate|basicPublish|basicConsume|ConnectionFactory|QueueBuilder' "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null || true)
    [[ -n "$u" ]] && rmq_usage=1
  fi
  if [[ "$rmq_usage" -eq 0 ]]; then
    local c0
    for c0 in "${cfgarr[@]+"${cfgarr[@]}"}"; do
      grep -qE 'spring\.rabbitmq|rabbitmq' "$c0" 2>/dev/null && { rmq_usage=1; break; }
    done
  fi
  local consumer_present=0
  [[ -n "$listener_files" ]] && consumer_present=1
  if [[ "$consumer_present" -eq 0 ]]; then
    local u2
    u2=$(grep -rlE 'basicConsume|SimpleMessageListenerContainer' "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null || true)
    [[ -n "$u2" ]] && consumer_present=1
  fi
  local producer_present=""
  producer_present=$(grep -rlE 'RabbitTemplate|convertAndSend|basicPublish' "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null || true)

  # ====================================================================
  # fw_rabbitmq_manual_ack(fail)：autoAck=true / AcknowledgeMode.NONE 即消息丢失
  # ====================================================================
  local ack_bad=""
  local c j
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    local ln
    ln=$(grep -niE 'acknowledge-mode[[:space:]]*[:=][[:space:]]*none' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && ack_bad="${ack_bad}${c}:${ln}
"
  done
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    local ln
    ln=$(_fw_strip_comments_c "$j" | grep -nE 'AcknowledgeMode\.NONE|basicConsume\([^)]*,[[:space:]]*true' || true)
    [[ -n "$ln" ]] && ack_bad="${ack_bad}${j}:${ln}
"
  done
  _fw_report fail fw_rabbitmq_manual_ack "$ack_bad" "检出 autoAck=true / AcknowledgeMode.NONE（broker 投递即视为成功，消费失败消息永久丢失；须 manual/容器确认 + basicAck 业务成功后调用）" "未检出 autoAck=true / AcknowledgeMode.NONE"

  # ====================================================================
  # fw_rabbitmq_idempotent_consumer(warn)：消费端幂等（message-id 去重）
  # ====================================================================
  local idem_bad=""
  while IFS= read -r lf; do
    [[ -z "$lf" ]] && continue
    if ! _fw_strip_comments_c "$lf" | grep -qiE '幂等|idempot|dedup|去重|setIfAbsent|setnx|ON DUPLICATE|insertIgnore|uk_[a-z]|unique[[:space:]]+key|consumeOnce|existsConsumed'; then
      idem_bad="${idem_bad}${lf}
"
    fi
  done <<< "$listener_files"
  if [[ -z "$listener_files" ]]; then
    pass "fw_rabbitmq_idempotent_consumer: 无 @RabbitListener，跳过"
  elif [[ -n "$idem_bad" ]]; then
    warn "fw_rabbitmq_idempotent_consumer: 消费端无幂等去重痕迹（at-least-once 重投必然重复，须 message-id SETNX / DB 唯一键）:
${idem_bad}"
  else
    pass "fw_rabbitmq_idempotent_consumer: 消费端均有幂等痕迹"
  fi

  # ====================================================================
  # fw_rabbitmq_dlq(warn)：队列须配死信交换机
  # ====================================================================
  if [[ "$rmq_usage" -eq 0 ]]; then
    pass "fw_rabbitmq_dlq: 无 RabbitMQ 使用迹象，跳过"
  else
    local dlq_hit=""
    dlq_hit=$(grep -rniE 'x-dead-letter|deadLetter|DeadLetter|dlx|dlq' "${srcarr[@]}" 2>/dev/null || true)
    if [[ -z "$dlq_hit" ]]; then
      warn "fw_rabbitmq_dlq: 检出 RabbitMQ 使用但无死信配置（x-dead-letter-exchange；毒丸消息无限 requeue 阻塞队列，须 DLX + 监控兜底）"
    else
      pass "fw_rabbitmq_dlq: 已配死信交换机"
    fi
  fi

  # ====================================================================
  # fw_rabbitmq_durable_persistent(warn)：durable 队列 + persistent 消息
  # ====================================================================
  local dur_bad=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    local ln
    ln=$(_fw_strip_comments_c "$j" | grep -nE 'new Queue\([[:space:]]*"[^"]*"[[:space:]]*,[[:space:]]*false|QueueBuilder\.nonDurable|queueDeclare\([^,]+,[[:space:]]*false|MessageDeliveryMode\.NON_PERSISTENT' || true)
    [[ -n "$ln" ]] && dur_bad="${dur_bad}${j}:${ln}
"
  done
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    local ln
    ln=$(grep -niE 'durable[[:space:]]*[:=][[:space:]]*false|delivery-mode[[:space:]]*[:=][[:space:]]*non[-_]?persistent' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && dur_bad="${dur_bad}${c}:${ln}
"
  done
  _fw_report warn fw_rabbitmq_durable_persistent "$dur_bad" "检出非持久化队列/消息（durable=false 或 NON_PERSISTENT；broker 重启即丢，须 durable=true + deliveryMode=2）" "未检出非持久化声明"

  # ====================================================================
  # fw_rabbitmq_connection_reuse(warn)：禁止每次新建 Connection/Channel
  # ====================================================================
  local conn_bad=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    local ln
    ln=$(_fw_strip_comments_c "$j" | grep -nE '\.newConnection\(|\.newChannel\(' || true)
    [[ -n "$ln" ]] && conn_bad="${conn_bad}${j}:${ln}
"
  done
  _fw_report warn fw_rabbitmq_connection_reuse "$conn_bad" "业务代码直接 newConnection/newChannel（连接/信道须复用：原生客户端长连接 + 每操作短 Channel；spring-amqp 用 CachingConnectionFactory 缓存，禁止绕开）" "未检出业务侧直接建连"

  # ====================================================================
  # fw_rabbitmq_prefetch(warn)：消费端 prefetch 限流
  # ====================================================================
  if [[ "$consumer_present" -eq 0 ]]; then
    pass "fw_rabbitmq_prefetch: 无消费者，跳过"
  else
    local pf_hit=0
    for j in "${javaarr[@]+"${javaarr[@]}"}"; do
      _fw_strip_comments_c "$j" | grep -qE 'basicQos|PrefetchCount|prefetch' && { pf_hit=1; break; }
    done
    if [[ "$pf_hit" -eq 0 ]]; then
      for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
        grep -qiE 'prefetch' "$c" 2>/dev/null && { pf_hit=1; break; }
      done
    fi
    if [[ "$pf_hit" -eq 0 ]]; then
      warn "fw_rabbitmq_prefetch: 消费者未显式配置 prefetch（默认 250 堆满单消费者内存 + 宕机批量重投；按单条耗时收敛如 10-50）"
    else
      pass "fw_rabbitmq_prefetch: 已配 prefetch 限流"
    fi
  fi

  # ====================================================================
  # fw_rabbitmq_publisher_confirm(warn)：发布确认 + returns
  # ====================================================================
  if [[ -z "$producer_present" ]]; then
    pass "fw_rabbitmq_publisher_confirm: 无生产者，跳过"
  else
    local pc_hit=""
    pc_hit=$(grep -rniE 'ConfirmCallback|ReturnsCallback|publisher-confirm|publisher-returns|confirmSelect|waitForConfirms' "${srcarr[@]}" 2>/dev/null || true)
    if [[ -z "$pc_hit" ]]; then
      warn "fw_rabbitmq_publisher_confirm: 生产者无发布确认（basicPublish 盲发，未落盘/不可路由静默丢失；须 publisher-confirm-type: correlated + ReturnsCallback）"
    else
      pass "fw_rabbitmq_publisher_confirm: 已配发布确认"
    fi
  fi

  # ====================================================================
  # fw_rabbitmq_delay(warn)：TTL+DLX 延迟模式 vs 插件
  # ====================================================================
  local ttl_hit="" dlx_hit2=""
  ttl_hit=$(grep -rniE 'x-message-ttl|setExpiration|message-ttl' "${srcarr[@]}" 2>/dev/null || true)
  dlx_hit2=$(grep -rniE 'x-dead-letter' "${srcarr[@]}" 2>/dev/null || true)
  local plugin_hit=""
  plugin_hit=$(grep -rniE 'x-delayed-message|x-delay' "${srcarr[@]}" 2>/dev/null || true)
  if [[ -n "$plugin_hit" ]]; then
    pass "fw_rabbitmq_delay: 使用 delayed-message-exchange 插件"
  elif [[ -n "$ttl_hit" && -n "$dlx_hit2" ]]; then
    warn "fw_rabbitmq_delay: 检出 TTL+DLX 延迟模式（队头阻塞 + 惰性过期，延迟时点不保证；建议 rabbitmq-delayed-message-exchange 插件）"
  else
    pass "fw_rabbitmq_delay: 无 TTL+DLX 延迟模式，跳过"
  fi

  # ====================================================================
  # fw_rabbitmq_quorum(warn)：新建队列须 quorum
  # ====================================================================
  local classic_bad="" quorum_hit="" queue_decl=""
  classic_bad=$(grep -rniE 'x-queue-type["'"'"'[:space:]]*[:,=][[:space:]]*["'"'"']?classic|"type"[[:space:]]*:[[:space:]]*"classic' "${srcarr[@]}" 2>/dev/null || true)
  quorum_hit=$(grep -rniE 'quorum' "${srcarr[@]}" 2>/dev/null || true)
  queue_decl=$(grep -rlE 'new Queue\(|queueDeclare\(|QueueBuilder\.' "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null || true)
  if [[ -n "$classic_bad" ]]; then
    warn "fw_rabbitmq_quorum: 显式 classic 队列（4.x 已废弃，无复制单点；须 x-queue-type=quorum）:
${classic_bad}"
  elif [[ -n "$quorum_hit" ]]; then
    pass "fw_rabbitmq_quorum: 已显式 quorum 队列"
  elif [[ -n "$queue_decl" ]]; then
    warn "fw_rabbitmq_quorum: 队列声明未显式 x-queue-type=quorum（4.x classic 已废弃语义，默认类型按版本核对）:
${queue_decl}"
  else
    pass "fw_rabbitmq_quorum: 无队列声明，跳过"
  fi

  # ====================================================================
  # fw_rabbitmq_exchange_type(warn)：headers 交换机慎用
  # ====================================================================
  local ex_bad=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    local ln
    ln=$(_fw_strip_comments_c "$j" | grep -nE 'HeadersExchange|ExchangeTypes\.HEADERS' || true)
    [[ -n "$ln" ]] && ex_bad="${ex_bad}${j}:${ln}
"
  done
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    local ln
    ln=$(grep -niE 'type[[:space:]]*[:=][[:space:]]*headers' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && ex_bad="${ex_bad}${c}:${ln}
"
  done
  _fw_report warn fw_rabbitmq_exchange_type "$ex_bad" "检出 headers 交换机（匹配开销大、运维可见性差，几乎总可用 topic 替代）" "未检出 headers 交换机"

  # ====================================================================
  # fw_rabbitmq_consumer_concurrency(warn)：消费者并发显式配置
  # ====================================================================
  if [[ -z "$listener_files" ]]; then
    pass "fw_rabbitmq_consumer_concurrency: 无 @RabbitListener，跳过"
  else
    local cc_hit=0
    for j in "${javaarr[@]+"${javaarr[@]}"}"; do
      _fw_strip_comments_c "$j" | grep -qE 'concurrency' && { cc_hit=1; break; }
    done
    if [[ "$cc_hit" -eq 0 ]]; then
      for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
        grep -qE 'concurrency' "$c" 2>/dev/null && { cc_hit=1; break; }
      done
    fi
    if [[ "$cc_hit" -eq 0 ]]; then
      warn "fw_rabbitmq_consumer_concurrency: @RabbitListener 未显式配置 concurrency（spring-amqp 默认单线程串行消费，吞吐被锁死；须 concurrency/max-concurrency）"
    else
      pass "fw_rabbitmq_consumer_concurrency: 已显式配置消费者并发"
    fi
  fi

  # ====================================================================
  # fw_rabbitmq_auto_delete(warn)：autoDelete/exclusive 队列风险
  # ====================================================================
  local ad_bad=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    local ln
    ln=$(_fw_strip_comments_c "$j" | grep -nE '\.autoDelete\(|\.exclusive\(|queueDeclare\([^,]+,[^,]+,[[:space:]]*true' || true)
    [[ -n "$ln" ]] && ad_bad="${ad_bad}${j}:${ln}
"
  done
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    local ln
    ln=$(grep -niE 'auto-delete[[:space:]]*[:=][[:space:]]*true|exclusive[[:space:]]*[:=][[:space:]]*true' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && ad_bad="${ad_bad}${c}:${ln}
"
  done
  _fw_report warn fw_rabbitmq_auto_delete "$ad_bad" "检出 autoDelete/exclusive 队列（消费者断连即删队列丢消息，仅限 RPC reply-to 等临时场景；quorum 不支持二者）" "未检出 autoDelete/exclusive 队列"

  # ====================================================================
  # fw_rabbit_endpoint_pair(warn)：队列/routingKey 名双边字符串配对
  # 生产侧 convertAndSend("Q"/原生 basicPublish("", "RK") 字面量集 ↔ 消费侧
  # @RabbitListener(queues="X") 字面量集；双向 diff；常量引用提不出字面量自然跳过；
  # 外部系统单边正常 → warn 人工核对拓扑配对表。
  # ====================================================================
  local rprod="" rcons="" rpair_bad="" _r
  rprod=$( { grep -rhoE 'convertAndSend\([[:space:]]*"[^"]+"' "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null || true; \
             grep -rhoE 'basicPublish\([^,]*,[[:space:]]*"[^"]+"' "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null || true; } \
    | sed -E 's/.*"([^"]+)"/\1/' | sort -u || true)
  rcons=$(grep -rhoE '@RabbitListener\([^)]*queues[[:space:]]*=[[:space:]]*(\{[^}]*\}|"[^"]+")' \
    "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null | grep -oE '"[^"]+"' | sed -E 's/"([^"]+)"/\1/' | sort -u || true)
  while IFS= read -r _r; do
    [[ -z "$_r" ]] && continue
    printf '%s\n' "$rcons" | grep -qxF "$_r" \
      || rpair_bad="${rpair_bad}仅生产无监听: ${_r}（本服务无 @RabbitListener(queues=...)——外部系统消费或 typo 断链，核对 §5 拓扑配对表）
"
  done <<< "$rprod"
  while IFS= read -r _r; do
    [[ -z "$_r" ]] && continue
    printf '%s\n' "$rprod" | grep -qxF "$_r" \
      || rpair_bad="${rpair_bad}仅监听无生产: ${_r}（本服务无 convertAndSend——外部系统生产或 typo 断链，核对 §5 拓扑配对表）
"
  done <<< "$rcons"
  _fw_report warn fw_rabbit_endpoint_pair "$rpair_bad" "队列名单边悬挂（生产/监听两侧字符串互不知晓，改一边即静默断链）" "队列名生产/监听字面量配对完整（或无常量外单边）"

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
