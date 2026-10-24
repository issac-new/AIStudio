# ruleset: druid  requires_conf: DRUID_CONFIG_FILES
# gates: fw_druid_statview_expose(fail) fw_druid_wall_filter(warn) fw_druid_datasource_pool(warn) fw_druid_slow_sql(warn)
# harvested-from: 新增：druid 数据库连接池规则集（references/frameworks/druid.md §4 对齐）；调研时点 2026-07-22，源码 druid 1.2.24 / druid-spring-boot-starter 1.2.24
# 新增：druid 数据库连接池规则集（references/frameworks/druid.md §4 对齐）
# 调研时点 2026-07-22，源码 druid 1.2.24 / druid-spring-boot-starter 1.2.24
# 4 规律统一改用 _fw_report 报告器（fail_id 提取对齐 precheck.sh:498 FAIL_IDS 收集）
_fw_druid_check() {
  echo "  [druid] Druid 1.2.x 连接池框架规律"

  local files
  files=$(_fw_resolve_globs ${DRUID_CONFIG_FILES[@]+"${DRUID_CONFIG_FILES[@]}"} | sort -u)
  [[ -z "$files" ]] && { warn "druid: DRUID_CONFIG_FILES 未配置或无文件可检"; return; }
  local fa=()
  while IFS= read -r ln; do fa+=("$ln"); done <<< "$files"
  if [[ ${#fa[@]} -eq 0 ]]; then
    warn "druid: DRUID_CONFIG_FILES 未配置或无文件可检"
    return
  fi

  # 合并所有配置文件文本（配置项可能跨文件，yml/properties/xml 混合）
  # 剥离注释行（# 开头），防止注释里的关键词被误判为配置存在
  local all_cfg
  all_cfg=$(grep -vE '^[[:space:]]*#' "${fa[@]}" 2>/dev/null || true)

  # 判定 druid 是否实际启用（数据源声明或 druid 配置键）
  # yml 嵌套结构下 druid 配置是独立行 `druid:`（缩进），非 `spring.datasource.druid` 连续串；
  # properties 是 `druid.xxx=` 或 `spring.datasource.druid.xxx=`。须覆盖两种格式。
  local druid_active=0
  if printf '%s\n' "$all_cfg" | grep -qE 'DruidDataSource|^[[:space:]]*druid:|druid\.|spring\.datasource\.druid' 2>/dev/null; then
    druid_active=1
  fi
  if [[ "$druid_active" -eq 0 ]]; then
    pass "fw_druid_datasource_pool: 配置文件无 Druid 数据源声明（跳过 druid 池检查）"
    return
  fi

  # ====================================================================
  # fw_druid_statview_expose(fail)：StatViewServlet 注册但缺鉴权 → 监控面板暴露
  # CWE-200：无鉴权暴露全量 SQL 与连接信息
  # ====================================================================
  local statview_registered=0 bad=""
  if printf '%s\n' "$all_cfg" | grep -qE 'StatViewServlet|druid\.stat-view-servlet|stat-view-servlet' 2>/dev/null; then
    statview_registered=1
  fi
  if [[ "$statview_registered" -eq 1 ]]; then
    # 检查是否配了 login-username/login-password（两者都非空才算鉴权）
    local has_user has_pass user_val pass_val
    has_user=$(printf '%s\n' "$all_cfg" | grep -iE 'login-username|loginUsername' 2>/dev/null | head -1 || true)
    has_pass=$(printf '%s\n' "$all_cfg" | grep -iE 'login-password|loginPassword' 2>/dev/null | head -1 || true)
    # 提取值并判空（yml: login-username: xxx；properties: druid.stat-view-servlet.login-username=xxx）
    user_val=$(printf '%s\n' "${has_user}" | sed -E 's/.*[:=][[:space:]]*//' | tr -d '[:space:]"'"'"'' || true)
    pass_val=$(printf '%s\n' "${has_pass}" | sed -E 's/.*[:=][[:space:]]*//' | tr -d '[:space:]"'"'"'' || true)
    if [[ -z "$user_val" || -z "$pass_val" ]]; then
      bad="login-username/password 至少一项为空（监控面板 /druid/* 无鉴权暴露）"
    fi
    _fw_report fail fw_druid_statview_expose "$bad" "StatViewServlet 暴露无鉴权（CWE-200）" "StatViewServlet 已配鉴权（login-username/password 非空）"
  else
    _fw_report pass fw_druid_statview_expose "" "未注册 StatViewServlet（无监控面板暴露）" ""
  fi

  # ====================================================================
  # fw_druid_wall_filter(warn)：缺 wall filter 或 noneBaseStatementAllow 误开
  # CWE-89：缺 wall 则 MyBatis ${} 注入直通 JDBC 层
  # ====================================================================
  local has_wall=0 bad=""
  # wall 可声明在 druid.filters=stat,wall 或 druid.filter.wall.* 或 WallFilter Bean
  if printf '%s\n' "$all_cfg" | grep -qE 'druid\.filters.*wall|filter\.wall|WallFilter|filters.*wall' 2>/dev/null; then
    has_wall=1
  fi
  if [[ "$has_wall" -eq 0 ]]; then
    bad="druid.filters 不含 wall（缺 SQL 防火墙，MyBatis \${} 注入无 JDBC 层拦截）"
  else
    # wall 启用，检查 noneBaseStatementAllow 误开
    if printf '%s\n' "$all_cfg" | grep -qiE 'none-base-statement-allow.*true|noneBaseStatementAllow.*true' 2>/dev/null; then
      bad="wall.none-base-statement-allow=true（DDL 直通，DROP/ALTER 等不被拦截）"
    fi
  fi
  _fw_report warn fw_druid_wall_filter "$bad" "缺 SQL 防火墙或 DDL 直通配置误开" "wall filter 已启用且 noneBaseStatementAllow 未误开"

  # ====================================================================
  # fw_druid_datasource_pool(warn)：max-active 缺失(默认8) / min-idle≠initial-size / keepAlive 未开
  # CWE-400：默认 maxActive=8 高并发连接耗尽
  # ====================================================================
  local has_maxactive=0 has_minidle=0 has_initialsize=0 has_keepalive=0
  local minidle_val initialsize_val pool_bad=""
  printf '%s\n' "$all_cfg" | grep -qiE 'max-active|maxActive' 2>/dev/null && has_maxactive=1
  if printf '%s\n' "$all_cfg" | grep -qiE 'min-idle|minIdle' 2>/dev/null; then
    has_minidle=1
    minidle_val=$(printf '%s\n' "$all_cfg" | grep -iE 'min-idle|minIdle' 2>/dev/null | head -1 | sed -E 's/.*[:=][[:space:]]*//' | tr -d '[:space:]' || true)
  fi
  if printf '%s\n' "$all_cfg" | grep -qiE 'initial-size|initialSize' 2>/dev/null; then
    has_initialsize=1
    initialsize_val=$(printf '%s\n' "$all_cfg" | grep -iE 'initial-size|initialSize' 2>/dev/null | head -1 | sed -E 's/.*[:=][[:space:]]*//' | tr -d '[:space:]' || true)
  fi
  printf '%s\n' "$all_cfg" | grep -qiE 'keep-alive|keepAlive' 2>/dev/null && has_keepalive=1

  if [[ "$has_maxactive" -eq 0 ]]; then
    pool_bad="${pool_bad}max-active 未配置（默认 8，高并发连接耗尽 CWE-400）；
"
  fi
  if [[ "$has_minidle" -eq 1 && "$has_initialsize" -eq 1 ]]; then
    if [[ -n "$minidle_val" && -n "$initialsize_val" && "$minidle_val" != "$initialsize_val" ]]; then
      pool_bad="${pool_bad}min-idle(${minidle_val})≠initial-size(${initialsize_val})（启动期连接抖动）；
"
    fi
  fi
  if [[ "$has_minidle" -eq 1 && "$has_keepalive" -eq 0 ]]; then
    pool_bad="${pool_bad}min-idle>0 但 keep-alive 未显式 true（连接被 DB wait_timeout 断开）；
"
  fi
  _fw_report warn fw_druid_datasource_pool "$pool_bad" "Druid 连接池参数不健壮（缺 max-active/min-idle 不齐/keepAlive 未开）" "连接池参数健壮（max-active/min-idle/keepAlive 配置合理）"

  # ====================================================================
  # fw_druid_slow_sql(warn)：slow-sql-millis 与 log-slow-sql 未配套
  # CWE-778：慢 SQL 不记录致性能问题不可观测
  # ====================================================================
  local has_slow_millis=0 has_log_slow=0 slow_bad=""
  printf '%s\n' "$all_cfg" | grep -qiE 'slow-sql-millis|slowSqlMillis' 2>/dev/null && has_slow_millis=1
  printf '%s\n' "$all_cfg" | grep -qiE 'log-slow-sql|logSlowSql' 2>/dev/null && has_log_slow=1
  if [[ "$has_slow_millis" -ne "$has_log_slow" ]]; then
    # 一个配了另一个没配
    if [[ "$has_slow_millis" -eq 1 && "$has_log_slow" -eq 0 ]]; then
      slow_bad="配了 slow-sql-millis 但未配 log-slow-sql（慢 SQL 不记录日志 CWE-778）"
    elif [[ "$has_log_slow" -eq 1 && "$has_slow_millis" -eq 0 ]]; then
      slow_bad="配了 log-slow-sql 但未配 slow-sql-millis（无阈值，慢 SQL 不触发记录）"
    fi
    _fw_report warn fw_druid_slow_sql "$slow_bad" "slow-sql-millis 与 log-slow-sql 未配套" ""
  elif [[ "$has_slow_millis" -eq 1 && "$has_log_slow" -eq 1 ]]; then
    _fw_report pass fw_druid_slow_sql "" "slow-sql-millis 与 log-slow-sql 已配套" ""
  else
    _fw_report pass fw_druid_slow_sql "" "未配慢 SQL 监控（可选项，跳过）" ""
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
