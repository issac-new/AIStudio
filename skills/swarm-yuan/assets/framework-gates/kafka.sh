# ruleset: kafka  requires_conf: KAFKA_SRC_GLOBS
# gates: fw_kafka_offset_semantics(fail) fw_kafka_acks(fail) fw_kafka_idempotent_consumer(warn) fw_kafka_consumer_le_partitions(warn) fw_kafka_idempotent_producer(warn) fw_kafka_transactional_producer(warn) fw_kafka_rebalance_cooperative(warn) fw_kafka_partitioner(warn) fw_kafka_dlq(warn) fw_kafka_lag_monitor(warn) fw_kafka_order_partition(warn) fw_kafka_schema_registry(warn) fw_kafka_group_mgmt(warn) fw_kafka_topic_pair(warn)
# harvested-from: P3 深化（2026-07-17），规律源自 Apache Kafka 4.x（KRaft 终态）/ spring-kafka 3.x 官方文档
_fw_kafka_check() {
  echo "  [kafka] Apache Kafka 4.x / spring-kafka 3.x 框架规律"

  # ---------- 收集源文件清单（Java + 配置文件统一入 srcarr） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${KAFKA_SRC_GLOBS[@]+"${KAFKA_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "kafka: KAFKA_SRC_GLOBS 未配置或无文件可检"
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

  # 代码正文过滤：调公共库 _fw_strip_comments_c（C 系，剔 // 与块注释行）

  # 常用检出集合
  local listener_files
  listener_files=$(grep -rlE '@KafkaListener\b' "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null || true)
  local kafka_usage=0
  [[ -n "$listener_files" ]] && kafka_usage=1
  if [[ "$kafka_usage" -eq 0 ]]; then
    local u
    u=$(grep -rlE 'KafkaTemplate|KafkaProducer|KafkaConsumer' "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null || true)
    [[ -n "$u" ]] && kafka_usage=1
  fi

  # ====================================================================
  # fw_kafka_offset_semantics(fail)：enable.auto.commit=true 即消息丢失
  # ====================================================================
  local ac_bad=""
  local c j
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    local ln
    ln=$(grep -niE 'enable[.-]auto[.-]commit[[:space:]]*[:=][[:space:]]*true' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && ac_bad="${ac_bad}${c}:${ln}
"
  done
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    local ln
    ln=$(_fw_strip_comments_c "$j" | grep -nE 'ENABLE_AUTO_COMMIT_CONFIG[[:space:]]*,[[:space:]]*"true"' || true)
    [[ -n "$ln" ]] && ac_bad="${ac_bad}${j}:${ln}
"
  done
  _fw_report fail fw_kafka_offset_semantics "$ac_bad" "enable.auto.commit=true（offset 与业务处理脱钩，处理失败消息永久丢失；须 false + 业务成功后提交）" "未检出 auto.commit=true"

  # ====================================================================
  # fw_kafka_acks(fail/warn)：acks=0 必丢；acks=1 须确认
  # ====================================================================
  local acks0_bad="" acks1_hit=""
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    local ln
    ln=$(grep -niE 'acks[[:space:]]*[:=][[:space:]]*0([^0-9]|$)' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && acks0_bad="${acks0_bad}${c}:${ln}
"
    ln=$(grep -niE 'acks[[:space:]]*[:=][[:space:]]*1([^0-9]|$)' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && acks1_hit="${acks1_hit}${c}:${ln}
"
  done
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    local ln
    ln=$(_fw_strip_comments_c "$j" | grep -nE 'ACKS_CONFIG[[:space:]]*,[[:space:]]*"0"' || true)
    [[ -n "$ln" ]] && acks0_bad="${acks0_bad}${j}:${ln}
"
    ln=$(_fw_strip_comments_c "$j" | grep -nE 'ACKS_CONFIG[[:space:]]*,[[:space:]]*"1"' || true)
    [[ -n "$ln" ]] && acks1_hit="${acks1_hit}${j}:${ln}
"
  done
  if [[ -n "$acks0_bad" ]]; then
    fail "fw_kafka_acks: acks=0（消防水管语义，任何 broker 抖动即丢数据；业务消息须 acks=all + min.insync.replicas>=2）:
${acks0_bad}"
  elif [[ -n "$acks1_hit" ]]; then
    warn "fw_kafka_acks: acks=1（仅 leader 落盘，leader 宕机未同步即丢；业务消息建议 acks=all）:
${acks1_hit}"
  else
    pass "fw_kafka_acks: 未检出 acks=0/1（acks=all 或默认幂等约束）"
  fi

  # ====================================================================
  # fw_kafka_idempotent_consumer(warn)：消费端幂等
  # ====================================================================
  local idem_bad=""
  while IFS= read -r lf; do
    [[ -z "$lf" ]] && continue
    if ! _fw_strip_comments_c "$lf" | grep -qiE '幂等|idempot|dedup|去重|setIfAbsent|setnx|ON DUPLICATE|insertIgnore|uk_[a-z]|unique[[:space:]]+key|consumeOnce'; then
      idem_bad="${idem_bad}${lf}
"
    fi
  done <<< "$listener_files"
  if [[ -z "$listener_files" ]]; then
    pass "fw_kafka_idempotent_consumer: 无 @KafkaListener，跳过"
  elif [[ -n "$idem_bad" ]]; then
    warn "fw_kafka_idempotent_consumer: 消费端无幂等去重痕迹（rebalance/重提交必然重复投递，须业务唯一键去重）:
${idem_bad}"
  else
    pass "fw_kafka_idempotent_consumer: 消费端均有幂等痕迹"
  fi

  # ====================================================================
  # fw_kafka_consumer_le_partitions(warn)：消费者数 ≤ 分区数
  # ====================================================================
  if [[ -z "$listener_files" ]]; then
    pass "fw_kafka_consumer_le_partitions: 无 @KafkaListener，跳过"
  else
    local conc_hit=0
    for j in "${javaarr[@]+"${javaarr[@]}"}"; do
      _fw_strip_comments_c "$j" | grep -qE 'concurrency' && { conc_hit=1; break; }
    done
    if [[ "$conc_hit" -eq 0 ]]; then
      for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
        grep -qE 'concurrency' "$c" 2>/dev/null && { conc_hit=1; break; }
      done
    fi
    if [[ "$conc_hit" -eq 0 ]]; then
      warn "fw_kafka_consumer_le_partitions: @KafkaListener 未显式配置 concurrency（人工核对：实例数×concurrency ≤ 分区数，超额消费者永远不生效）"
    else
      pass "fw_kafka_consumer_le_partitions: 已显式配置 concurrency"
    fi
  fi

  # ====================================================================
  # fw_kafka_idempotent_producer(warn)：显式关闭幂等生产者须理由
  # ====================================================================
  local idp_bad=""
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    local ln
    ln=$(grep -niE 'enable[.-]idempotence[[:space:]]*[:=][[:space:]]*false' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && idp_bad="${idp_bad}${c}:${ln}
"
  done
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    local ln
    ln=$(_fw_strip_comments_c "$j" | grep -nE 'ENABLE_IDEMPOTENCE_CONFIG[[:space:]]*,[[:space:]]*"false"' || true)
    [[ -n "$ln" ]] && idp_bad="${idp_bad}${j}:${ln}
"
  done
  _fw_report warn fw_kafka_idempotent_producer "$idp_bad" "显式关闭幂等生产者（4.x 默认开启；关闭后重试即可能重复，仅限兼容古董 broker）" "未显式关闭幂等生产者"

  # ====================================================================
  # fw_kafka_transactional_producer(warn)：事务须 read_committed 配对
  # ====================================================================
  local tx_hit="" rc_hit=""
  tx_hit=$(grep -rniE 'transactional[.-]id|TRANSACTIONAL_ID_CONFIG|transactionalIdPrefix' "${srcarr[@]}" 2>/dev/null || true)
  rc_hit=$(grep -rniE 'read_committed|READ_COMMITTED|isolation[.-]level' "${srcarr[@]}" 2>/dev/null || true)
  if [[ -z "$tx_hit" ]]; then
    pass "fw_kafka_transactional_producer: 无事务生产者，跳过"
  elif [[ -z "$rc_hit" ]]; then
    warn "fw_kafka_transactional_producer: 检出 transactional.id 但消费端无 isolation.level=read_committed（会读到中止事务的幽灵消息）"
  else
    pass "fw_kafka_transactional_producer: 事务生产者与 read_committed 配对"
  fi

  # ====================================================================
  # fw_kafka_rebalance_cooperative(warn)：rebalance 协议选型
  # ====================================================================
  local range_hit="" coop_hit=""
  range_hit=$(grep -rnE 'RangeAssignor' "${srcarr[@]}" 2>/dev/null || true)
  coop_hit=$(grep -rniE 'CooperativeSticky|cooperative-sticky|group\.protocol' "${srcarr[@]}" 2>/dev/null || true)
  if [[ -n "$range_hit" ]]; then
    warn "fw_kafka_rebalance_cooperative: 显式 RangeAssignor（eager 协议 rebalance 全组停摆；建议 CooperativeSticky / 4.x 新消费者组协议）:
${range_hit}"
  elif [[ -n "$coop_hit" ]]; then
    pass "fw_kafka_rebalance_cooperative: 已选 cooperative/新协议"
  else
    pass "fw_kafka_rebalance_cooperative: 未显式配置（按 broker/client 版本默认，人工核对 4.x 新协议默认行为）"
  fi

  # ====================================================================
  # fw_kafka_partitioner(warn)：分区器保键序
  # ====================================================================
  local part_bad=""
  part_bad=$(grep -rnE 'RoundRobinPartitioner|UniformStickyPartitioner|round\.robin' "${srcarr[@]}" 2>/dev/null || true)
  _fw_report warn fw_kafka_partitioner "$part_bad" "检出 RoundRobin/UniformSticky 分区器（同 key 消息打散多分区，键序被破坏；须默认 murmur2 或自定义保序分区器）" "未检出乱序分区器"

  # ====================================================================
  # fw_kafka_dlq(warn)：消费失败须 DLT
  # ====================================================================
  if [[ -z "$listener_files" ]]; then
    pass "fw_kafka_dlq: 无 @KafkaListener，跳过"
  else
    local dlt_hit=""
    dlt_hit=$(grep -rlE 'DeadLetterPublishingRecoverer|@RetryableTopic|@DltHandler|DefaultErrorHandler' "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null || true)
    if [[ -z "$dlt_hit" ]]; then
      warn "fw_kafka_dlq: @KafkaListener 无死信配置（毒丸消息无限重试阻塞分区；须 DefaultErrorHandler+DeadLetterPublishingRecoverer 或 @RetryableTopic）"
    else
      pass "fw_kafka_dlq: 已配死信恢复器"
    fi
  fi

  # ====================================================================
  # fw_kafka_lag_monitor(warn)：consumer lag 监控
  # ====================================================================
  if [[ "$kafka_usage" -eq 0 ]]; then
    pass "fw_kafka_lag_monitor: 无 Kafka 使用迹象，跳过"
  else
    local lag_hit=""
    lag_hit=$(grep -rniE 'micrometer|MeterRegistry|kafka_exporter|burrow|AdminClient' "${srcarr[@]}" 2>/dev/null || true)
    if [[ -z "$lag_hit" ]]; then
      warn "fw_kafka_lag_monitor: 检出 Kafka 使用但无 lag 监控痕迹（micrometer/exporter/Burrow/AdminClient；积压是消费第一故障信号）"
    else
      pass "fw_kafka_lag_monitor: 已配 lag 监控"
    fi
  fi

  # ====================================================================
  # fw_kafka_order_partition(warn)：顺序敏感业务必须带 key
  # ====================================================================
  local nokey_bad=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    local ln
    ln=$(_fw_strip_comments_c "$j" | grep -nE 'ProducerRecord[^(]*\([^,)]*,[^,)]*\)' || true)
    [[ -n "$ln" ]] && nokey_bad="${nokey_bad}${j}:${ln}
"
  done
  _fw_report warn fw_kafka_order_partition "$nokey_bad" "检出 ProducerRecord 两参构造（topic, value 无 key → 轮询多分区全局乱序；顺序敏感业务须带业务键 key）" "未检出无 key 发送"

  # ====================================================================
  # fw_kafka_schema_registry(warn)：schema 演进约束
  # ====================================================================
  if [[ "$kafka_usage" -eq 0 ]]; then
    pass "fw_kafka_schema_registry: 无 Kafka 使用迹象，跳过"
  else
    local str_ser="" sr_hit=""
    str_ser=$(grep -rnE 'StringSerializer|StringDeserializer' "${srcarr[@]}" 2>/dev/null || true)
    sr_hit=$(grep -rniE 'schema[.-]registry|SchemaRegistryClient|KafkaAvroSerializer|KafkaProtobufSerializer|SpecificRecord' "${srcarr[@]}" 2>/dev/null || true)
    if [[ -n "$str_ser" && -z "$sr_hit" ]]; then
      warn "fw_kafka_schema_registry: 裸 String 序列化且无 Schema Registry（payload 演进无约束，生产者改字段即炸消费端；建议 Avro/Protobuf + 兼容策略）"
    elif [[ -n "$sr_hit" ]]; then
      pass "fw_kafka_schema_registry: 已用 Schema Registry / 结构化序列化"
    else
      pass "fw_kafka_schema_registry: 未检出裸 String 序列化"
    fi
  fi

  # ====================================================================
  # fw_kafka_group_mgmt(warn)：消费组复用规范
  # ====================================================================
  local dup_groups gm_bad=""
  dup_groups=$(grep -hoE 'groupId[[:space:]]*=[[:space:]]*"[^"]+"' "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null \
    | sed -E 's/.*"([^"]+)".*/\1/' | sort | uniq -d || true)
  while IFS= read -r grp; do
    [[ -z "$grp" ]] && continue
    local topics
    topics=$(grep -lE "groupId[[:space:]]*=[[:space:]]*\"${grp}\"" "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null \
      | xargs grep -hoE 'topics[[:space:]]*=[[:space:]]*"[^"]+"' 2>/dev/null \
      | sed -E 's/.*"([^"]+)".*/\1/' | sort -u || true)
    local tcount
    tcount=$(printf '%s\n' "$topics" | grep -cE '.' || true)
    if [[ "${tcount:-0}" -gt 1 ]]; then
      gm_bad="${gm_bad}groupId=${grp} 被 ${tcount} 个不同 topic 的 listener 复用（rebalance 联动 + 位点管理混乱）
"
    fi
  done <<< "$dup_groups"
  _fw_report warn fw_kafka_group_mgmt "$gm_bad" "不同业务 listener 复用同一 groupId（一 listener 一组，命名按业务域.用途.环境）" "无跨 topic 消费组复用"

  # ====================================================================
  # fw_kafka_topic_pair(warn)：topic 名双边字符串配对（端点名改一边即静默断链）
  # 生产侧字面量（.send("X" / new ProducerRecord("X"）与消费侧字面量（@KafkaListener topics="X"）
  # 双向 diff；常量引用（send(topicVar)）提不出字面量自然跳过；跨服务/外部系统属正常单边 → warn 人工核。
  # ====================================================================
  local prod_topics="" cons_topics="" pair_bad=""
  prod_topics=$(grep -rhoE '\.send\([[:space:]]*"[^"]+"|new[[:space:]]+ProducerRecord\([[:space:]]*"[^"]+"' \
    "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null | sed -E 's/.*"([^"]+)"/\1/' | sort -u || true)
  cons_topics=$(grep -rhoE '@KafkaListener\([^)]*topics[[:space:]]*=[[:space:]]*(\{[^}]*\}|"[^"]+")' \
    "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null | grep -oE '"[^"]+"' | sed -E 's/"([^"]+)"/\1/' | sort -u || true)
  local _t
  while IFS= read -r _t; do
    [[ -z "$_t" ]] && continue
    printf '%s\n' "$cons_topics" | grep -qxF "$_t" \
      || pair_bad="${pair_bad}仅生产无消费: ${_t}（本服务内无 @KafkaListener 监听——外部系统消费或 typo 断链，核对 §5 消息拓扑配对表）
"
  done <<< "$prod_topics"
  while IFS= read -r _t; do
    [[ -z "$_t" ]] && continue
    printf '%s\n' "$prod_topics" | grep -qxF "$_t" \
      || pair_bad="${pair_bad}仅消费无生产: ${_t}（本服务内无 send/ProducerRecord——外部系统生产或 typo 断链，核对 §5 消息拓扑配对表）
"
  done <<< "$cons_topics"
  _fw_report warn fw_kafka_topic_pair "$pair_bad" "topic 名单边悬挂（生产/消费两侧字符串互不知晓，改一边即静默断链）" "topic 生产/消费字面量配对完整（或无常量外单边）"

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
