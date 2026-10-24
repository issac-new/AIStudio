# ruleset: opentelemetry  requires_conf: OPENTELEMETRY_GLOBS
# gates: fw_opentelemetry_service_name(warn) fw_opentelemetry_exporter_endpoint(warn) fw_opentelemetry_sampler(warn) fw_opentelemetry_deployment_env(warn) fw_opentelemetry_deprecated_exporter(fail) fw_opentelemetry_span_attributes(warn) fw_opentelemetry_baggage_propagation(warn) fw_opentelemetry_metrics_export(warn) fw_opentelemetry_logs_api(warn) fw_opentelemetry_graceful_shutdown(warn)
# harvested-from: 新增（2026-07-23），规律源自 opentelemetry.io 官方文档 / spec v1.39 / 各 SDK README
_fw_opentelemetry_check() {
  echo "  [opentelemetry] OpenTelemetry 1.x 可观测性规律"

  # ---------- 收集源文件清单（JS/TS/Python/Go/Java + 配置统一入 srcarr） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${OPENTELEMETRY_GLOBS[@]+"${OPENTELEMETRY_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "opentelemetry: OPENTELEMETRY_GLOBS 未配置或无文件可检"
    return
  fi

  # 拆分多语言源码 vs 配置/CI 文件
  # JS/TS → c_inline 剥注释；Python → hash 剥注释；Go/Java → c 剥注释
  local jstsarr=() pyarr=() goarr=() javaarr=() cfgarr=()
  local f
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) jstsarr+=("$f") ;;
      *.py) pyarr+=("$f") ;;
      *.go) goarr+=("$f") ;;
      *.java) javaarr+=("$f") ;;
      *.yml|*.yaml|*.env|*.properties|*.json|*.toml|Dockerfile|*.dockerfile) cfgarr+=("$f") ;;
    esac
  done

  # 多语言注释剥离：JS/TS/Go/Java 用 _fw_strip_comments_c_inline（C 系变体）；
  # Python 用 _fw_strip_comments_hash；配置文件用 _fw_strip_comments_cfg。
  # 统一封装 _fw_ot_strip 按扩展名分发，避免每条门禁重复分发。
  _fw_ot_strip() {
    local b
    b="$(basename "$1")"
    case "$b" in
      *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.go|*.java) _fw_strip_comments_c_inline "$1" ;;
      *.py) _fw_strip_comments_hash "$1" ;;
      *) _fw_strip_comments_cfg "$1" ;;
    esac
  }

  local t ln

  # ====================================================================
  # fw_opentelemetry_service_name(warn)：须显式配置 service.name
  # ====================================================================
  # 口径：检出 Resource/NodeSDK/SDK 构建但全项目无 service.name / OTEL_SERVICE_NAME → warn
  local has_resource=0 has_sname=0
  for t in "${jstsarr[@]+"${jstsarr[@]}"}" "${pyarr[@]+"${pyarr[@]}"}" "${goarr[@]+"${goarr[@]}"}" "${javaarr[@]+"${javaarr[@]}"}" "${cfgarr[@]+"${cfgarr[@]}"}"; do
    [[ -n "$t" ]] || continue
    _fw_ot_strip "$t" | grep -qE 'Resource|NodeSDK|resource\.ServiceResource|Resource\.create|resourceAttributes|serviceResource' && has_resource=1
    _fw_ot_strip "$t" | grep -qE 'service\.name|ServiceName|service_name|OTEL_SERVICE_NAME' && has_sname=1
  done
  if [[ "$has_resource" -eq 1 && "$has_sname" -eq 0 ]]; then
    warn "fw_opentelemetry_service_name: 检出 OTel Resource/SDK 但无 service.name 配置（默认 unknown_service 致后端无法区分服务，须显式配置或设 OTEL_SERVICE_NAME）"
  else
    pass "fw_opentelemetry_service_name: 已配置 service.name 或无 Resource 配置"
  fi

  # ====================================================================
  # fw_opentelemetry_exporter_endpoint(warn)：OTLP exporter 须显式 endpoint
  # ====================================================================
  # 口径：检出 OTLP exporter 但无 endpoint / OTEL_EXPORTER_OTLP_ENDPOINT / url 配置 → warn
  local has_otlp=0 has_endpoint=0
  for t in "${jstsarr[@]+"${jstsarr[@]}"}" "${pyarr[@]+"${pyarr[@]}"}" "${goarr[@]+"${goarr[@]}"}" "${javaarr[@]+"${javaarr[@]}"}" "${cfgarr[@]+"${cfgarr[@]}"}"; do
    [[ -n "$t" ]] || continue
    _fw_ot_strip "$t" | grep -qE 'OTLPExporter|OTLPSpanExporter|OTLPTraceExporter|OTLPMetricExporter|OTLPLogExporter|otlpExporter|otlp.*Exporter|OTLPOCOLLECTOR' && has_otlp=1
    _fw_ot_strip "$t" | grep -qE 'endpoint|OTEL_EXPORTER_OTLP_ENDPOINT|url[[:space:]]*:' && has_endpoint=1
  done
  if [[ "$has_otlp" -eq 1 && "$has_endpoint" -eq 0 ]]; then
    warn "fw_opentelemetry_exporter_endpoint: 检出 OTLP exporter 但无 endpoint 配置（默认 localhost:4317 容器内不可达，数据静默丢失）"
  else
    pass "fw_opentelemetry_exporter_endpoint: 已配置 exporter endpoint 或无 OTLP exporter"
  fi

  # ====================================================================
  # fw_opentelemetry_sampler(warn)：采样率须显式配置
  # ====================================================================
  # 口径：检出 provider/NodeSDK 但无 Sampler 配置 → warn（默认 AlwaysOnSampler 全量采样）
  local has_provider=0 has_sampler=0
  for t in "${jstsarr[@]+"${jstsarr[@]}"}" "${pyarr[@]+"${pyarr[@]}"}" "${goarr[@]+"${goarr[@]}"}" "${javaarr[@]+"${javaarr[@]}"}"; do
    [[ -n "$t" ]] || continue
    _fw_ot_strip "$t" | grep -qE 'NodeSDK|TracerProvider|tracerProvider|TracerProviderMsg|sdk\.NewTracerProvider|SDKTracerProvider|registerTracerProvider|trace\.getTracer' && has_provider=1
    _fw_ot_strip "$t" | grep -qE 'Sampler|sampler|TraceIdRatioBased|ParentBased|AlwaysOff|AlwaysOnSampler|ParentBasedSampler' && has_sampler=1
  done
  if [[ "$has_provider" -eq 1 && "$has_sampler" -eq 0 ]]; then
    warn "fw_opentelemetry_sampler: 检出 tracer provider 但无 sampler 配置（默认 AlwaysOnSampler 全量采样，生产高 QPS 须配 TraceIdRatioBased/ParentBased）"
  else
    pass "fw_opentelemetry_sampler: 已配 sampler 或无 provider"
  fi

  # ====================================================================
  # fw_opentelemetry_deployment_env(warn)：Resource 须含 deployment.environment
  # ====================================================================
  # 口径：检出 Resource 但无 deployment.environment → warn
  if [[ "$has_resource" -eq 1 ]]; then
    local has_depenv=0
    for t in "${jstsarr[@]+"${jstsarr[@]}"}" "${pyarr[@]+"${pyarr[@]}"}" "${goarr[@]+"${goarr[@]}"}" "${javaarr[@]+"${javaarr[@]}"}" "${cfgarr[@]+"${cfgarr[@]}"}"; do
      [[ -n "$t" ]] || continue
      _fw_ot_strip "$t" | grep -qE 'deployment\.environment|deployment_environment|DEPLOYMENT_ENV|deployment_environment' && has_depenv=1
    done
    if [[ "$has_depenv" -eq 0 ]]; then
      warn "fw_opentelemetry_deployment_env: 检出 Resource 但无 deployment.environment 属性（prod/staging/dev trace 混淆，排障误读）"
    else
      pass "fw_opentelemetry_deployment_env: 已配置 deployment.environment"
    fi
  else
    pass "fw_opentelemetry_deployment_env: 无 Resource 配置（跳过）"
  fi

  # ====================================================================
  # fw_opentelemetry_deprecated_exporter(fail)：禁用 Jaeger/Zipkin exporter
  # ====================================================================
  local dep_bad=""
  for t in "${jstsarr[@]+"${jstsarr[@]}"}" "${pyarr[@]+"${pyarr[@]}"}" "${goarr[@]+"${goarr[@]}"}" "${javaarr[@]+"${javaarr[@]}"}"; do
    [[ -n "$t" ]] || continue
    ln=$(_fw_ot_strip "$t" | grep -nE 'JaegerExporter|JaegerHttpTraceExporter|JaegerTraceExporter|ZipkinExporter' || true)
    [[ -n "$ln" ]] && dep_bad="${dep_bad}${t}:${ln}
"
  done
  _fw_report fail fw_opentelemetry_deprecated_exporter "$dep_bad" "检出已废弃的 Jaeger/Zipkin exporter（spec ≥1.0 起推荐 OTLP，须迁 OTLPExporter；废弃 exporter 失去新特性且无 OTel Logs 支持）" "未检出 Jaeger/Zipkin 废弃 exporter"

  # ====================================================================
  # fw_opentelemetry_span_attributes(warn)：Span 须含 setAttribute
  # ====================================================================
  # 口径：检出 startSpan/startActiveSpan 但无 setAttribute/setAttributes → warn
  local has_span=0 has_attr=0
  for t in "${jstsarr[@]+"${jstsarr[@]}"}" "${pyarr[@]+"${pyarr[@]}"}" "${goarr[@]+"${goarr[@]}"}" "${javaarr[@]+"${javaarr[@]}"}"; do
    [[ -n "$t" ]] || continue
    _fw_ot_strip "$t" | grep -qE 'startSpan|startActiveSpan' && has_span=1
    _fw_ot_strip "$t" | grep -qE '\.setAttribute|\.setAttributes|set_attribute|set_attributes' && has_attr=1
  done
  if [[ "$has_span" -eq 1 && "$has_attr" -eq 0 ]]; then
    warn "fw_opentelemetry_span_attributes: 检出 startSpan 但无 setAttribute（span 无业务上下文，排障无法关联业务实体）"
  else
    pass "fw_opentelemetry_span_attributes: span 已配 attributes 或无 span"
  fi

  # ====================================================================
  # fw_opentelemetry_baggage_propagation(warn)：须配 baggage propagator
  # ====================================================================
  # 口径：检出 trace provider 但无 Baggage propagator → warn
  if [[ "$has_provider" -eq 1 ]]; then
    local has_baggage=0
    for t in "${jstsarr[@]+"${jstsarr[@]}"}" "${pyarr[@]+"${pyarr[@]}"}" "${goarr[@]+"${goarr[@]}"}" "${javaarr[@]+"${javaarr[@]}"}"; do
      [[ -n "$t" ]] || continue
      _fw_ot_strip "$t" | grep -qE 'Baggage|W3CBaggagePropagator|baggagePropagator|baggage_propagator|baggage' && has_baggage=1
    done
    if [[ "$has_baggage" -eq 0 ]]; then
      warn "fw_opentelemetry_baggage_propagation: 检出 trace provider 但无 Baggage propagator（跨服务业务上下文丢失，须并注册 W3CTraceContext + W3CBaggage）"
    else
      pass "fw_opentelemetry_baggage_propagation: 已配 Baggage propagator"
    fi
  else
    pass "fw_opentelemetry_baggage_propagation: 无 trace provider（跳过）"
  fi

  # ====================================================================
  # fw_opentelemetry_metrics_export(warn)：须配 metrics 仪表盘
  # ====================================================================
  # 口径：检出 trace 配置但无 MeterProvider/metrics exporter → warn
  if [[ "$has_provider" -eq 1 ]]; then
    local has_metrics=0
    for t in "${jstsarr[@]+"${jstsarr[@]}"}" "${pyarr[@]+"${pyarr[@]}"}" "${goarr[@]+"${goarr[@]}"}" "${javaarr[@]+"${javaarr[@]}"}" "${cfgarr[@]+"${cfgarr[@]}"}"; do
      [[ -n "$t" ]] || continue
      _fw_ot_strip "$t" | grep -qE 'MeterProvider|meterProvider|OTLPMetricExporter|PeriodicExportingMetricReader|metricReader|metrics' && has_metrics=1
    done
    if [[ "$has_metrics" -eq 0 ]]; then
      warn "fw_opentelemetry_metrics_export: 检出 trace 配置但无 MeterProvider/metrics exporter（缺 metrics 则无 RED 长效聚合，告警无指标基线）"
    else
      pass "fw_opentelemetry_metrics_export: 已配 metrics exporter"
    fi
  else
    pass "fw_opentelemetry_metrics_export: 无 trace provider（跳过）"
  fi

  # ====================================================================
  # fw_opentelemetry_logs_api(warn)：日志须接入 OTel Logs API
  # ====================================================================
  # 口径：检出 trace 配置但无 LoggerProvider/OTLPLogExporter/logs.getLogger → warn
  if [[ "$has_provider" -eq 1 ]]; then
    local has_logs=0
    for t in "${jstsarr[@]+"${jstsarr[@]}"}" "${pyarr[@]+"${pyarr[@]}"}" "${goarr[@]+"${goarr[@]}"}" "${javaarr[@]+"${javaarr[@]}"}"; do
      [[ -n "$t" ]] || continue
      _fw_ot_strip "$t" | grep -qE 'LoggerProvider|OTLPLogExporter|logs\.getLogger|otelLogger|logProvider|otellogrus|logback.*otel' && has_logs=1
    done
    if [[ "$has_logs" -eq 0 ]]; then
      warn "fw_opentelemetry_logs_api: 检出 trace 配置但无 OTel Logs API（日志与 trace 割裂，排障无法从 trace 跳日志）"
    else
      pass "fw_opentelemetry_logs_api: 已接入 OTel Logs API"
    fi
  else
    pass "fw_opentelemetry_logs_api: 无 trace provider（跳过）"
  fi

  # ====================================================================
  # fw_opentelemetry_graceful_shutdown(warn)：须配 shutdown/forceFlush
  # ====================================================================
  # 口径：检出 provider/SDK 但无 shutdown/forceFlush → warn
  if [[ "$has_provider" -eq 1 ]]; then
    local has_shutdown=0
    for t in "${jstsarr[@]+"${jstsarr[@]}"}" "${pyarr[@]+"${pyarr[@]}"}" "${goarr[@]+"${goarr[@]}"}" "${javaarr[@]+"${javaarr[@]}"}"; do
      [[ -n "$t" ]] || continue
      _fw_ot_strip "$t" | grep -qE '\.shutdown\(|forceFlush|gracefulShutdown|sdk\.shutdown|provider\.shutdown' && has_shutdown=1
    done
    if [[ "$has_shutdown" -eq 0 ]]; then
      warn "fw_opentelemetry_graceful_shutdown: 检出 provider 但无 shutdown/forceFlush（SIGTERM 丢失最后一批 span，故障现场数据灭失）"
    else
      pass "fw_opentelemetry_graceful_shutdown: 已配 shutdown/forceFlush"
    fi
  else
    pass "fw_opentelemetry_graceful_shutdown: 无 trace provider（跳过）"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
