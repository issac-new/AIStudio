# ruleset: validation  requires_conf: VALIDATION_SRC_GLOBS
# gates: fw_validation_cascade(warn) fw_validation_groupsequence(warn) fw_validation_validator_threadsafe(fail) fw_validation_validated_scope(warn) fw_validation_notnull_notblank(fail) fw_validation_size_column(warn) fw_validation_pattern_redos(warn) fw_validation_email_lax(warn) fw_validation_temporal_tz(warn) fw_validation_decimal_bigdecimal(warn) fw_validation_nested_collection(warn) fw_validation_advice(warn)
# harvested-from: T6 P2（2026-07-17），规律源自 Jakarta Validation 3.1 规范 + Hibernate Validator 9.0/9.1 官方文档
_fw_validation_check() {
  echo "  [validation] Jakarta Validation 3.1 + Hibernate Validator 9.x 框架规律"

  # ---------- 收集 Java 源文件清单 ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${VALIDATION_SRC_GLOBS[@]+"${VALIDATION_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "validation: 无 Java 源文件可检（VALIDATION_SRC_GLOBS）"
    return
  fi

  # ---------- fw_validation_cascade(warn)：嵌套自定义对象字段须 @Valid ----------
  local cascade_hits="" f
  for f in "${srcarr[@]}"; do
    cascade_hits="${cascade_hits}$(awk '
      /@Valid/ { v=NR }
      /^[[:space:]]*(private|protected)[[:space:]]+[A-Z][A-Za-z0-9_]*(DTO|Dto|Form|Request|VO|Item)[[:space:]]+[a-zA-Z_]/ {
        if ($0 !~ /@Valid/ && (v==0 || NR-v>3)) print FILENAME":"NR": "$0
      }' "$f" 2>/dev/null)
"
  done
  cascade_hits=$(printf '%s\n' "$cascade_hits" | grep -E '^.+:[0-9]+:' || true)
  _fw_report warn fw_validation_cascade "$(printf '%s\n' "$cascade_hits" | head -5)" "嵌套自定义对象字段未检出 @Valid（级联校验静默失效，CWE-20）" "嵌套对象字段均含 @Valid 或无嵌套对象"

  # ---------- fw_validation_groupsequence(warn)：分组序列顺序确认 ----------
  local gs_hits
  gs_hits=$(grep -HnE '@GroupSequence' "${srcarr[@]}" 2>/dev/null || true)
  _fw_report warn fw_validation_groupsequence "$(printf '%s\n' "$gs_hits" | head -5)" "检出 @GroupSequence（组按声明顺序短路执行；Default 组须放首位或接口重定义）" "无 @GroupSequence 用法"

  # ---------- fw_validation_validator_threadsafe(fail)：ConstraintValidator 须无可变实例字段 ----------
  local cv_files cv_bad="" mutable
  cv_files=$(grep -lE 'implements[[:space:]]+ConstraintValidator<' "${srcarr[@]}" 2>/dev/null || true)
  if [[ -z "$cv_files" ]]; then
    pass "fw_validation_validator_threadsafe: 无自定义 ConstraintValidator，跳过"
  else
    while IFS= read -r f; do
      [[ -n "$f" ]] || continue
      mutable=$(grep -nE '^[[:space:]]+(private|protected)[[:space:]]+[A-Za-z_]' "$f" 2>/dev/null | grep -vE '\bstatic\b|\bfinal\b' || true)
      if [[ -n "$mutable" ]]; then
        cv_bad="${cv_bad}${f}:
${mutable}
"
      fi
    done <<< "$cv_files"
    _fw_report fail fw_validation_validator_threadsafe "${cv_bad}" "ConstraintValidator 含可变实例字段（ValidatorFactory 单例复用，须线程安全，CWE-362）" "ConstraintValidator 无可变实例字段"
  fi

  # ---------- fw_validation_validated_scope(warn)：@Validated 带分组须确认类级/参数级 ----------
  local vscope_hits
  vscope_hits=$(grep -HnE '@Validated\(' "${srcarr[@]}" 2>/dev/null || true)
  _fw_report warn fw_validation_validated_scope "$(printf '%s\n' "$vscope_hits" | head -5)" "检出带分组的 @Validated(...)（类级=方法级校验作用于全部 public 方法；参数级=仅该参数，确认标注位置）" "无带分组的 @Validated"

  # ---------- fw_validation_notnull_notblank(fail)：String 字段 @NotNull 选型错误 ----------
  local nn_hits nn_bad="" sameline ctxline
  # (a) 同行形态：@NotNull ... String xxx
  sameline=$(grep -HnE '@NotNull[^;]*\bString\s+[a-zA-Z_]' "${srcarr[@]}" 2>/dev/null || true)
  # (b) 分行形态：@NotNull 行后 3 行内出现 String 字段声明
  ctxline=$(grep -Hn -A3 '@NotNull\b' "${srcarr[@]}" 2>/dev/null | grep -E '^[^:]*[:-][0-9]+[-:].*\b(private|protected|public)\b[^;]*\bString\s+[a-zA-Z_]' || true)
  nn_bad=$(printf '%s\n%s\n' "$sameline" "$ctxline" | grep -E '^.+[:-][0-9]+' | sort -u || true)
  _fw_report fail fw_validation_notnull_notblank "$(printf '%s\n' "$nn_bad" | head -5)" "String 字段使用 @NotNull（空串/空白串会穿透；应 @NotBlank，可叠加 @Size）" "String 字段未检出 @NotNull 误用"

  # ---------- fw_validation_size_column(warn)：@Column(length=) 与 @Size 分层一致 ----------
  local col_files sc_bad=""
  col_files=$(grep -lE '@Column\([^)]*length[[:space:]]*=' "${srcarr[@]}" 2>/dev/null || true)
  if [[ -z "$col_files" ]]; then
    pass "fw_validation_size_column: 无 @Column(length=) 实体，跳过"
  else
    while IFS= read -r f; do
      [[ -n "$f" ]] || continue
      if ! grep -qE '@Size\b' "$f" 2>/dev/null; then
        sc_bad="${sc_bad}${f}
"
      fi
    done <<< "$col_files"
    _fw_report warn fw_validation_size_column "${sc_bad}" "实体有 @Column(length=) 但无 @Size（入口层无拦截，超长直达 DB 报 500；数值须一致）" "@Column(length=) 与 @Size 分层齐备"
  fi

  # ---------- fw_validation_pattern_redos(warn)：@Pattern 嵌套量词 ReDoS ----------
  local redos_hits
  redos_hits=$(grep -HnE '@Pattern' "${srcarr[@]}" 2>/dev/null | grep -E '\+\)\+|\*\)\+|\+\)\*|\*\)\*|\]\+\)|\]\*\)' || true)
  _fw_report warn fw_validation_pattern_redos "$(printf '%s\n' "$redos_hits" | head -5)" "@Pattern 检出嵌套量词形态（回溯型引擎指数风险，ReDoS CWE-1333）" "未检出 @Pattern 嵌套量词"

  # ---------- fw_validation_email_lax(warn)：裸 @Email 宽松度 ----------
  local email_hits
  email_hits=$(grep -HnE '@Email' "${srcarr[@]}" 2>/dev/null | grep -vE '@Email\(' || true)
  _fw_report warn fw_validation_email_lax "$(printf '%s\n' "$email_hits" | head -5)" "裸 @Email 默认宽松（放行 a@b 类地址且放行空串/null；须 @NotBlank 组合或 regexp 收紧）" "无裸 @Email 用法"

  # ---------- fw_validation_temporal_tz(warn)：@Future/@Past 系时区 ----------
  local tz_hits
  tz_hits=$(grep -HnE '@(Future|FutureOrPresent|Past|PastOrPresent)\b' "${srcarr[@]}" 2>/dev/null || true)
  _fw_report warn fw_validation_temporal_tz "$(printf '%s\n' "$tz_hits" | head -5)" "检出时间边界约束（以 JVM 默认时区 Clock 判定；容器 UTC 与业务时区漂移会错判，必要时 ClockProvider）" "无 @Future/@Past 系用法"

  # ---------- fw_validation_decimal_bigdecimal(warn)：@DecimalMin/@DecimalMax 须 BigDecimal ----------
  local dm_same dm_ctx dm_bad
  dm_same=$(grep -HnE '@DecimalM(in|ax)[^;]*\b(double|float|Double|Float)\s+[a-zA-Z_]' "${srcarr[@]}" 2>/dev/null || true)
  dm_ctx=$(grep -Hn -A3 '@DecimalM(in|ax)\b' "${srcarr[@]}" 2>/dev/null | grep -E '^[^:]*[:-][0-9]+[-:].*\b(private|protected|public)\b[^;]*\b(double|float|Double|Float)\s+[a-zA-Z_]' || true)
  dm_bad=$(printf '%s\n%s\n' "$dm_same" "$dm_ctx" | grep -E '^.+[:-][0-9]+' | sort -u || true)
  _fw_report warn fw_validation_decimal_bigdecimal "$(printf '%s\n' "$dm_bad" | head -5)" "@DecimalMin/@DecimalMax 作用于浮点字段（二进制浮点边界判定不稳定，金额/比率须 BigDecimal）" "十进制边界约束未作用于浮点字段"

  # ---------- fw_validation_nested_collection(warn)：集合元素须 @Valid 容器元素约束 ----------
  local nc_hits=""
  for f in "${srcarr[@]}"; do
    nc_hits="${nc_hits}$(awk '
      /@Valid/ { v=NR }
      /^[[:space:]]*(private|protected)[[:space:]]+(List|Set|Collection|Map)</ {
        if ($0 ~ /<[[:space:]]*@Valid/) next
        if ($0 ~ /<[A-Z][A-Za-z0-9_]*(DTO|Dto|Form|Request|VO|Item)>/ && $0 !~ /@Valid/ && (v==0 || NR-v>3)) print FILENAME":"NR": "$0
      }' "$f" 2>/dev/null)
"
  done
  nc_hits=$(printf '%s\n' "$nc_hits" | grep -E '^.+:[0-9]+:' || true)
  _fw_report warn fw_validation_nested_collection "$(printf '%s\n' "$nc_hits" | head -5)" "集合元素未检出 @Valid（推荐 List<@Valid Item> 容器元素约束，元素校验静默跳过风险）" "集合元素级联齐备或无嵌套集合"

  # ---------- fw_validation_advice(warn)：统一校验异常处理 ----------
  local has_constraints has_advice
  has_constraints=$(grep -lE '@(NotNull|NotBlank|NotEmpty|Size|Pattern|Email|DecimalMin|DecimalMax)\b' "${srcarr[@]}" 2>/dev/null | head -1 || true)
  if [[ -z "$has_constraints" ]]; then
    pass "fw_validation_advice: 无约束注解使用，跳过"
  else
    has_advice=$(grep -lE '@(RestControllerAdvice|ControllerAdvice)' "${srcarr[@]}" 2>/dev/null | xargs -I{} grep -lE 'MethodArgumentNotValidException|ConstraintViolationException|HandlerMethodValidationException' {} 2>/dev/null | head -1 || true)
    if [[ -z "$has_advice" ]]; then
      warn "fw_validation_advice: 存在约束注解但未检出 @RestControllerAdvice 统一处理校验异常（MethodArgumentNotValidException/ConstraintViolationException 会冒泡成 500 或无字段明细）"
    else
      pass "fw_validation_advice: 校验异常统一处理齐备"
    fi
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
