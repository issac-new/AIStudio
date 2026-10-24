# ruleset: jackson  requires_conf: JACKSON_SRC_GLOBS
# gates: fw_jackson_jsr310(warn) fw_jackson_password(fail) fw_jackson_polymorphic(fail) fw_jackson_unknown_props(warn) fw_jackson_dates_as_timestamps(warn) fw_jackson_jsonformat_tz(warn) fw_jackson_include_nonnull(warn) fw_jackson_property_naming(warn) fw_jackson_creator(warn) fw_jackson_bigdecimal(warn) fw_jackson_mapper_singleton(warn) fw_jackson_jsonview(warn)
# harvested-from: T6 P2（2026-07-17），规律源自 Jackson 2.x/3.0 官方文档与 wiki Jackson-Release-3.0、CVE-2017-7525
_fw_jackson_check() {
  echo "  [jackson] Jackson 2.x / 3.x 框架规律"

  # ---------- 收集 Java 源文件清单 ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${JACKSON_SRC_GLOBS[@]+"${JACKSON_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "jackson: 无 Java 源文件可检（JACKSON_SRC_GLOBS）"
    return
  fi

  local f

  # ---------- fw_jackson_jsr310(warn)：java.time 字段须 JavaTimeModule（2.x） ----------
  local time_files reg_files
  time_files=$(grep -lE '\b(LocalDateTime|LocalDate|LocalTime|Instant|ZonedDateTime|OffsetDateTime)\s+[a-zA-Z_]' "${srcarr[@]}" 2>/dev/null || true)
  if [[ -z "$time_files" ]]; then
    pass "fw_jackson_jsr310: 无 java.time 字段，跳过"
  else
    reg_files=$(grep -lE 'JavaTimeModule|registerModule|jackson-datatype-jsr310' "${srcarr[@]}" 2>/dev/null || true)
    if [[ -z "$reg_files" ]]; then
      warn "fw_jackson_jsr310: 存在 java.time 字段但未检出 JavaTimeModule 注册（Jackson 2.x 须 registerModule；3.0 内建/Spring Boot 自动注册须人工确认）:
$(printf '%s\n' "$time_files" | head -5)"
    else
      pass "fw_jackson_jsr310: 检出 JavaTimeModule 注册痕迹"
    fi
  fi

  # ---------- fw_jackson_password(fail)：敏感字段须 @JsonIgnore/WRITE_ONLY ----------
  local pw_bad=""
  for f in "${srcarr[@]}"; do
    pw_bad="${pw_bad}$(awk '
      /@JsonIgnore|WRITE_ONLY/ { v=NR }
      /^[[:space:]]*(private|protected)[[:space:]]+[A-Za-z]+[[:space:]]+[A-Za-z_]*[[:space:]]*(=|;)/ {
        low=tolower($0)
        if (low ~ /(password|passwd|secret|secretkey|apikey|accesstoken|credential)[[:space:]]*(=|;)/ || low ~ /[[:space:]]token[[:space:]]*(=|;)/) {
          if ($0 !~ /@JsonIgnore|WRITE_ONLY/ && (v==0 || NR-v>3)) print FILENAME":"NR": "$0
        }
      }' "$f" 2>/dev/null)
"
  done
  pw_bad=$(printf '%s\n' "$pw_bad" | grep -E '^.+:[0-9]+:' || true)
  if [[ -n "$pw_bad" ]]; then
    fail "fw_jackson_password: 敏感字段（password/secret/apiKey/token）未检出 @JsonIgnore 或 WRITE_ONLY（序列化外泄，CWE-200/CWE-359）:
$(printf '%s\n' "$pw_bad" | head -5)"
  else
    pass "fw_jackson_password: 敏感字段均已屏蔽或无敏感字段"
  fi

  # ---------- fw_jackson_polymorphic(fail)：@JsonTypeInfo 攻击面 ----------
  local ti_files ti_bad="" blk
  ti_files=$(grep -lE '@JsonTypeInfo' "${srcarr[@]}" 2>/dev/null || true)
  if [[ -z "$ti_files" ]]; then
    pass "fw_jackson_polymorphic: 无 @JsonTypeInfo 多态反序列化，跳过"
  else
    while IFS= read -r f; do
      [[ -n "$f" ]] || continue
      blk=$(grep -A8 '@JsonTypeInfo' "$f" 2>/dev/null || true)
      if printf '%s\n' "$blk" | grep -qE 'Id\.(CLASS|MINIMAL_CLASS)'; then
        ti_bad="${ti_bad}${f}: 使用 Id.CLASS/Id.MINIMAL_CLASS（类名入 JSON，CVE-2017-7525 类反序列化 RCE，CWE-502）
"
      elif ! printf '%s\n' "$blk" | grep -q 'defaultImpl'; then
        ti_bad="${ti_bad}${f}: @JsonTypeInfo 缺 defaultImpl（须配 @JsonSubTypes 白名单 + defaultImpl 兜底未知 type id）
"
      fi
    done <<< "$ti_files"
    _fw_report fail fw_jackson_polymorphic "$ti_bad" "@JsonTypeInfo 多态反序列化攻击面" "@JsonTypeInfo 均含 defaultImpl 且未用 Id.CLASS"
  fi

  # ---------- fw_jackson_unknown_props(warn)：FAIL_ON_UNKNOWN_PROPERTIES 显式选型 ----------
  local has_json has_fup has_jip
  has_json=$(grep -lE '@Json(Property|Ignore|Format|TypeInfo|Include)' "${srcarr[@]}" 2>/dev/null | head -1 || true)
  if [[ -z "$has_json" ]]; then
    pass "fw_jackson_unknown_props: 无 Jackson 注解 DTO，跳过"
  else
    has_fup=$(grep -lE 'FAIL_ON_UNKNOWN_PROPERTIES' "${srcarr[@]}" 2>/dev/null | head -1 || true)
    has_jip=$(grep -lE '@JsonIgnoreProperties' "${srcarr[@]}" 2>/dev/null | head -1 || true)
    if [[ -z "$has_fup" && -z "$has_jip" ]]; then
      warn "fw_jackson_unknown_props: 未检出 FAIL_ON_UNKNOWN_PROPERTIES 配置或 @JsonIgnoreProperties（2.x 默认 true / 3.x 默认 false，升级即行为翻转，须显式选型）"
    else
      pass "fw_jackson_unknown_props: 未知属性策略已显式声明"
    fi
  fi

  # ---------- fw_jackson_dates_as_timestamps(warn)：时间序列化格式 ----------
  if [[ -z "$time_files" ]]; then
    pass "fw_jackson_dates_as_timestamps: 无 java.time 字段，跳过"
  else
    local has_ts_cfg
    has_ts_cfg=$(grep -lE 'WRITE_DATES_AS_TIMESTAMPS|write-dates-as-timestamps|@JsonFormat' "${srcarr[@]}" 2>/dev/null | head -1 || true)
    if [[ -z "$has_ts_cfg" ]]; then
      warn "fw_jackson_dates_as_timestamps: java.time 字段未检出 timestamps 关闭或 @JsonFormat（默认输出数组/epoch，对外 API 契约漂移）"
    else
      pass "fw_jackson_dates_as_timestamps: 时间序列化格式已显式配置"
    fi
  fi

  # ---------- fw_jackson_jsonformat_tz(warn)：@JsonFormat pattern 须带 timezone ----------
  local jf_hits
  jf_hits=$(grep -HnE '@JsonFormat\([^)]*pattern' "${srcarr[@]}" 2>/dev/null | grep -v 'timezone' || true)
  if [[ -n "$jf_hits" ]]; then
    warn "fw_jackson_jsonformat_tz: @JsonFormat(pattern) 未声明 timezone（按 JVM 默认时区解析，容器 UTC 漂移 8 小时）:
$(printf '%s\n' "$jf_hits" | head -5)"
  else
    pass "fw_jackson_jsonformat_tz: 无带 pattern 的 @JsonFormat 或均已声明 timezone"
  fi

  # ---------- fw_jackson_include_nonnull(warn)：null 字段输出口径统一 ----------
  if [[ -z "$has_json" ]]; then
    pass "fw_jackson_include_nonnull: 无 Jackson 注解 DTO，跳过"
  else
    local has_inc
    has_inc=$(grep -lE '@JsonInclude|default-property-inclusion|setSerializationInclusion' "${srcarr[@]}" 2>/dev/null | head -1 || true)
    if [[ -z "$has_inc" ]]; then
      warn "fw_jackson_include_nonnull: 未检出 @JsonInclude/default-property-inclusion（null 字段输出 \"field\": null，口径须全局统一）"
    else
      pass "fw_jackson_include_nonnull: null 字段输出策略已声明"
    fi
  fi

  # ---------- fw_jackson_property_naming(warn)：同类命名风格一致 ----------
  local pn_bad="" snake camel
  for f in "${srcarr[@]}"; do
    snake=$(grep -cE '@JsonProperty\("[a-z0-9]+_[a-z0-9_]+"' "$f" 2>/dev/null || true)
    camel=$(grep -cE '@JsonProperty\("[a-z]+[A-Z][A-Za-z]*"' "$f" 2>/dev/null || true)
    if [[ "$snake" -gt 0 && "$camel" -gt 0 ]]; then
      pn_bad="${pn_bad}${f}
"
    fi
  done
  _fw_report warn fw_jackson_property_naming "$pn_bad" "同类内 snake_case 与 camelCase @JsonProperty 混用（API 契约分裂，建议 PropertyNamingStrategies 集中统一）" "@JsonProperty 命名风格一致或无显式命名"

  # ---------- fw_jackson_creator(warn)：@JsonCreator 参数须 @JsonProperty ----------
  local jc_files jc_bad=""
  jc_files=$(grep -lE '@JsonCreator' "${srcarr[@]}" 2>/dev/null || true)
  if [[ -z "$jc_files" ]]; then
    pass "fw_jackson_creator: 无 @JsonCreator，跳过"
  else
    while IFS= read -r f; do
      [[ -n "$f" ]] || continue
      if ! grep -A5 '@JsonCreator' "$f" 2>/dev/null | grep -q '@JsonProperty'; then
        jc_bad="${jc_bad}${f}
"
      fi
    done <<< "$jc_files"
    _fw_report warn fw_jackson_creator "$jc_bad" "@JsonCreator 参数列表未检出 @JsonProperty（参数名默认编译被擦除为 arg0/arg1，反序列化全 null）" "@JsonCreator 参数均已 @JsonProperty"
  fi

  # ---------- fw_jackson_bigdecimal(warn)：金额字段禁止浮点 ----------
  local bd_hits
  bd_hits=$(grep -HinE '^[[:space:]]*(private|protected)[[:space:]]+(double|float|Double|Float)[[:space:]]+[a-zA-Z]*(price|amount|money|fee|cost|total)[a-zA-Z]*' "${srcarr[@]}" 2>/dev/null || true)
  if [[ -n "$bd_hits" ]]; then
    warn "fw_jackson_bigdecimal: 金额/价格字段使用浮点类型（二进制浮点精度失真，CWE-681；须 BigDecimal，必要时 @JsonFormat(shape=STRING)）:
$(printf '%s\n' "$bd_hits" | head -5)"
  else
    pass "fw_jackson_bigdecimal: 金额字段未检出浮点类型"
  fi

  # ---------- fw_jackson_mapper_singleton(warn)：ObjectMapper 单例复用 ----------
  local om_cnt
  om_cnt=$(grep -lE 'new ObjectMapper\(' "${srcarr[@]}" 2>/dev/null | wc -l | xargs)
  if [[ "$om_cnt" -ge 2 ]]; then
    warn "fw_jackson_mapper_singleton: new ObjectMapper() 出现在 $om_cnt 个文件（构造成本高且易漏注册模块，须单例/Spring Bean 复用）"
  else
    pass "fw_jackson_mapper_singleton: ObjectMapper 实例化点 ≤1 个文件"
  fi

  # ---------- fw_jackson_jsonview(warn)：@JsonView 泄漏面复核 ----------
  local jv_hits
  jv_hits=$(grep -HnE '@JsonView' "${srcarr[@]}" 2>/dev/null || true)
  if [[ -n "$jv_hits" ]]; then
    warn "fw_jackson_jsonview: 检出 @JsonView（2.x DEFAULT_VIEW_INCLUSION 默认 ON，未标视图字段任何视图都输出；复核继承方向，CWE-200）:
$(printf '%s\n' "$jv_hits" | head -5)"
  else
    pass "fw_jackson_jsonview: 无 @JsonView 用法"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
