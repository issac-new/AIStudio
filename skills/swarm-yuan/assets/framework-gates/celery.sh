# ruleset: celery  requires_conf: CELERY_SRC_GLOBS
# gates: fw_celery_acks_late_idempotent(fail) fw_celery_serializer_pickle(fail) fw_celery_retry_backoff(warn) fw_celery_result_backend(warn) fw_celery_timezone(warn) fw_celery_concurrency_model(warn) fw_celery_task_routes(warn) fw_celery_time_limit(warn) fw_celery_monitoring(warn) fw_celery_beat_idempotent(warn) fw_celery_canvas_error(warn)
# harvested-from: Python 异步任务队列补强（2026-07-22），规律源自 Celery 5.3+ 官方文档与 celery-exporter 实践
_fw_celery_check() {
  echo "  [celery] Celery 5.x 框架规律"
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${CELERY_SRC_GLOBS[@]+"${CELERY_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  if [[ -z "$srcs" ]]; then
    warn "celery: CELERY_SRC_GLOBS 未配置或无文件可检"
    return
  fi
  while IFS= read -r ln; do [[ -n "$ln" ]] && srcarr+=("$ln"); done <<< "$srcs"

  # fw_celery_acks_late_idempotent(fail)：acks_late=True 须有幂等信号
  local acks_hits idem_hits bad=""
  acks_hits=$(grep -rlE 'acks_late\s*=\s*True' "${srcarr[@]+"${srcarr[@]}"}" 2>/dev/null || true)
  if [[ -n "$acks_hits" ]]; then
    idem_hits=$(grep -rlE 'idempoten|dedup|去重|SETNX|setnx|state.*=.*DONE|state.*=.*COMPLETED' "${srcarr[@]+"${srcarr[@]}"}" 2>/dev/null || true)
    if [[ -z "$idem_hits" ]]; then
      fail "fw_celery_acks_late_idempotent: acks_late=True 但无幂等信号（去重表/SETNX/状态字段），worker 崩溃重投递会重复执行"
    else
      pass "fw_celery_acks_late_idempotent: acks_late=True 且检出幂等信号"
    fi
  else
    pass "fw_celery_acks_late_idempotent: 无 acks_late=True 用法（默认 acks 即时）"
  fi

  # fw_celery_serializer_pickle(fail)：task_serializer=pickle → fail
  local pickle_hits
  pickle_hits=$(grep -rnE 'task_serializer\s*=\s*.(pickle|application/x-python-serialize).' "${srcarr[@]+"${srcarr[@]}"}" 2>/dev/null || true)
  _fw_report fail fw_celery_serializer_pickle "$pickle_hits" "task_serializer=pickle 有 RCE 风险（CWE-502），须改 json" "未用 pickle 序列化"

  # fw_celery_retry_backoff(warn)：@task 无 retry_backoff=True
  local task_files backoff_hits
  task_files=$(grep -rlE '@shared_task|@app\.task|@task' "${srcarr[@]+"${srcarr[@]}"}" 2>/dev/null || true)
  if [[ -n "$task_files" ]]; then
    backoff_hits=$(grep -rlE 'retry_backoff\s*=\s*True' "${srcarr[@]+"${srcarr[@]}"}" 2>/dev/null || true)
    if [[ -z "$backoff_hits" ]]; then
      warn "fw_celery_retry_backoff: 检出 @task 但无 retry_backoff=True（失败立即重试压垮下游）"
    else
      pass "fw_celery_retry_backoff: 已配 retry_backoff=True"
    fi
  else
    pass "fw_celery_retry_backoff: 无 @task 定义，跳过"
  fi

  # fw_celery_result_backend(warn)
  local rb_hits
  rb_hits=$(grep -rlE 'result_backend\s*=' "${srcarr[@]+"${srcarr[@]}"}" 2>/dev/null || true)
  if [[ -z "$rb_hits" ]]; then
    warn "fw_celery_result_backend: 未配 result_backend（默认禁用结果，须确认无结果需求）"
  else
    pass "fw_celery_result_backend: 已配 result_backend"
  fi

  # fw_celery_timezone(warn)
  local tz_hits
  tz_hits=$(grep -rlE 'enable_utc\s*=\s*True|timezone\s*=' "${srcarr[@]+"${srcarr[@]}"}" 2>/dev/null || true)
  if [[ -z "$tz_hits" ]]; then
    warn "fw_celery_timezone: 未配 enable_utc/timezone（beat 定时任务可能时区错乱）"
  else
    pass "fw_celery_timezone: 已配时区"
  fi

  # fw_celery_concurrency_model(warn)
  local cm_hits
  cm_hits=$(grep -rlE 'worker_concurrency|pool\s*=' "${srcarr[@]+"${srcarr[@]}"}" 2>/dev/null || true)
  if [[ -z "$cm_hits" ]]; then
    warn "fw_celery_concurrency_model: 未配 worker_concurrency/pool（默认 prefork，须确认匹配任务类型）"
  else
    pass "fw_celery_concurrency_model: 已显式配并发模型"
  fi

  # fw_celery_task_routes(warn)
  local tr_hits
  tr_hits=$(grep -rlE 'task_routes\s*=' "${srcarr[@]+"${srcarr[@]}"}" 2>/dev/null || true)
  if [[ -z "$tr_hits" ]]; then
    warn "fw_celery_task_routes: 未配 task_routes（慢任务可能阻塞关键任务）"
  else
    pass "fw_celery_task_routes: 已配任务路由"
  fi

  # fw_celery_time_limit(warn)
  if [[ -n "$task_files" ]]; then
    local tl_hits
    tl_hits=$(grep -rlE 'time_limit|soft_time_limit|expires' "${srcarr[@]+"${srcarr[@]}"}" 2>/dev/null || true)
    if [[ -z "$tl_hits" ]]; then
      warn "fw_celery_time_limit: @task 无 time_limit/soft_time_limit（僵尸任务占满 worker）"
    else
      pass "fw_celery_time_limit: 已配超时"
    fi
  else
    pass "fw_celery_time_limit: 无 @task 定义，跳过"
  fi

  # fw_celery_monitoring(warn)
  local mon_hits
  mon_hits=$(grep -rlE 'on_failure|Flower|prometheus|flower' "${srcarr[@]+"${srcarr[@]}"}" 2>/dev/null || true)
  if [[ -z "$mon_hits" ]]; then
    warn "fw_celery_monitoring: 无 Flower/on_failure/prometheus 监控（任务静默失败无人知）"
  else
    pass "fw_celery_monitoring: 已配监控告警"
  fi

  # fw_celery_beat_idempotent(warn)
  local beat_hits
  beat_hits=$(grep -rlE 'beat_schedule\s*=' "${srcarr[@]+"${srcarr[@]}"}" 2>/dev/null || true)
  if [[ -n "$beat_hits" ]]; then
    local bidem_hits
    bidem_hits=$(grep -rlE 'idempoten|dedup|去重|SETNX|setnx' "${srcarr[@]+"${srcarr[@]}"}" 2>/dev/null || true)
    if [[ -z "$bidem_hits" ]]; then
      warn "fw_celery_beat_idempotent: beat_schedule 存在但任务无幂等信号（beat 可能重复触发）"
    else
      pass "fw_celery_beat_idempotent: beat 任务有幂等信号"
    fi
  else
    pass "fw_celery_beat_idempotent: 无 beat_schedule，跳过"
  fi

  # fw_celery_canvas_error(warn)
  local canvas_hits
  canvas_hits=$(grep -rlE 'chain\(|group\(|chord\(' "${srcarr[@]+"${srcarr[@]}"}" 2>/dev/null || true)
  if [[ -n "$canvas_hits" ]]; then
    local cerr_hits
    cerr_hits=$(grep -rlE 'on_failure|on_chord_part_return|link_error|reject' "${srcarr[@]+"${srcarr[@]}"}" 2>/dev/null || true)
    if [[ -z "$cerr_hits" ]]; then
      warn "fw_celery_canvas_error: chain/group/chord 存在但无错误处理（任务链静默中断）"
    else
      pass "fw_celery_canvas_error: canvas 已配错误处理"
    fi
  else
    pass "fw_celery_canvas_error: 无 canvas 用法，跳过"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
