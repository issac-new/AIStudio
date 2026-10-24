# ruleset: opengauss  requires_conf: OPENGAUSS_GLOBS
# gates: fw_opengauss_hardcoded_password(fail) fw_opengauss_sql_concat(fail) fw_opengauss_ssl_disabled(fail) fw_opengauss_pg_hba_trust(fail) fw_opengauss_conn_pool(warn) fw_opengauss_audit_log(warn) fw_opengauss_rls(warn) fw_opengauss_slow_log(warn) fw_opengauss_statement(warn) fw_opengauss_autovacuum(warn)
# harvested-from: （2026-07-23），规律源自 openGauss 官方文档（docs.opengauss.org）与信创数据库接入安全实践（CWE-798/89/319/306/778/639）
_fw_opengauss_check() {
  echo "  [opengauss] openGauss（信创数据库）框架规律"

  # ---------- 收集文件清单（OPENGAUSS_GLOBS 单变量，按扩展名/文件名分桶） ----------
  local srcs f ln
  local codearr=() sqlarr=() hbaarr=() pgconfarr=() cfgarr=()
  srcs=$(_fw_resolve_globs ${OPENGAUSS_GLOBS[@]+"${OPENGAUSS_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] || continue
    case "$(basename "$ln")" in
      *.java|*.py|*.go) codearr+=("$ln") ;;
      *.sql) sqlarr+=("$ln") ;;
      pg_hba.conf) hbaarr+=("$ln") ;;
      postgresql.conf|postgresql.auto.conf) pgconfarr+=("$ln") ;;
      *.yml|*.yaml|*.properties|*.xml|*.conf|*.ini) cfgarr+=("$ln") ;;
    esac
  done <<< "$srcs"

  if [[ ${#codearr[@]} -eq 0 && ${#sqlarr[@]} -eq 0 && ${#hbaarr[@]} -eq 0 && ${#pgconfarr[@]} -eq 0 && ${#cfgarr[@]} -eq 0 ]]; then
    warn "opengauss: OPENGAUSS_GLOBS 未配置或无文件可检"
    return
  fi

  # 注释剥离器：按文件类型调公共库（Python 用 #、SQL 用 --、配置剔注释行、Java/Go 用 C 系）
  _fw_og_strip() {
    case "$(basename "$1")" in
      *.py) _fw_strip_comments_hash "$1" ;;
      *.sql) _fw_strip_comments_sql "$1" ;;
      *.yml|*.yaml|*.properties|*.conf|*.ini) _fw_strip_comments_cfg "$1" ;;
      *) _fw_strip_comments_c "$1" ;;
    esac
  }

  # ====================================================================
  # fw_opengauss_hardcoded_password(fail)：连接串/代码密码硬编码（CWE-798）
  # 注：用 raw grep 不过注释剥离器——C 系剥离器会把 Java 字符串内 jdbc:opengauss://
  # 从 // 处截断（dameng 驱动门雷同：配置类模式一律 raw grep，注释误报可接受）
  # ====================================================================
  local pw_bad=""
  for f in "${codearr[@]+"${codearr[@]}"}" "${cfgarr[@]+"${cfgarr[@]}"}"; do
    [[ -n "$f" ]] || continue
    ln=$(grep -inE "(password|passwd|pwd)[[:space:]]*=[[:space:]]*[\"'][^\"']{4,}[\"']" "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && pw_bad="${pw_bad}${f}:${ln}
"
    ln=$(grep -inE "jdbc:opengauss://[^[:space:]\"']+:[^[:space:]\"'@]+@" "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && pw_bad="${pw_bad}${f}:${ln}
"
    ln=$(grep -inE "[?&]password=[^&\"'[:space:]]{4,}" "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && pw_bad="${pw_bad}${f}:${ln}
"
  done
  _fw_report fail fw_opengauss_hardcoded_password "$pw_bad" "数据库密码硬编码（CWE-798；凭证随仓库泄露即被拖库，须 System.getenv/os.environ.get 或密钥管理服务注入）" "密码均经环境变量/密钥管理注入"

  # ====================================================================
  # fw_opengauss_sql_concat(fail)：SQL 字符串拼接 / f-string 内嵌 SQL（CWE-89）
  # ====================================================================
  local sc_bad=""
  for f in "${codearr[@]+"${codearr[@]}"}"; do
    ln=$(_fw_og_strip "$f" | grep -inE "(select|insert|update|delete)[^\"]*\"[[:space:]]*\+" || true)
    [[ -n "$ln" ]] && sc_bad="${sc_bad}${f}:${ln}
"
    ln=$(_fw_og_strip "$f" | grep -inE "f[\"'][^\"']*(select|insert|update|delete)" || true)
    [[ -n "$ln" ]] && sc_bad="${sc_bad}${f}:${ln}
"
  done
  _fw_report fail fw_opengauss_sql_concat "$sc_bad" "SQL 字符串拼接（CWE-89 注入；Java 须 PreparedStatement + ? 绑定，Python 须 execute(sql, params) 占位，排序/表名用白名单映射）" "SQL 均参数化无拼接"

  # ====================================================================
  # fw_opengauss_ssl_disabled(fail)：sslmode=disable / ssl=false 明文传输（CWE-319）
  # 注：raw grep（URL 内模式会被 C 系注释剥离器截断，同 hardcoded_password 注）
  # ====================================================================
  local ssl_bad=""
  for f in "${codearr[@]+"${codearr[@]}"}" "${cfgarr[@]+"${cfgarr[@]}"}"; do
    [[ -n "$f" ]] || continue
    ln=$(grep -inE "sslmode[[:space:]]*=[[:space:]]*disable|ssl[[:space:]]*=[[:space:]]*false" "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && ssl_bad="${ssl_bad}${f}:${ln}
"
  done
  _fw_report fail fw_opengauss_ssl_disabled "$ssl_bad" "显式关闭 SSL（CWE-319 明文传输；生产须 sslmode=verify-full + sslrootcert，服务端 ssl=on + hostssl 强制加密）" "无 sslmode=disable/ssl=false 明文配置"

  # ====================================================================
  # fw_opengauss_pg_hba_trust(fail)：pg_hba.conf host 行 trust 免密（CWE-306）
  # ====================================================================
  local hba_bad=""
  for f in "${hbaarr[@]+"${hbaarr[@]}"}"; do
    ln=$(_fw_strip_comments_cfg "$f" | grep -inE "^[[:space:]]*host[[:space:]][^#]*[[:space:]]trust([[:space:]]|$)" || true)
    [[ -n "$ln" ]] && hba_bad="${hba_bad}${f}:${ln}
"
  done
  _fw_report fail fw_opengauss_pg_hba_trust "$hba_bad" "pg_hba host 行 trust 免密直连（CWE-306 未授权访问；须 scram-sha-256/sha256 认证 + CIDR 收敛 + hostssl 强制 SSL，禁 0.0.0.0/0 全开放）" "pg_hba 无 trust 免密规则"

  # ====================================================================
  # fw_opengauss_conn_pool(warn)：有 openGauss 数据源但无连接池信号
  # ====================================================================
  local og_hit=0 pool_hit=0
  for f in "${codearr[@]+"${codearr[@]}"}" "${cfgarr[@]+"${cfgarr[@]}"}"; do
    [[ -n "$f" ]] || continue
    # raw grep（jdbc:opengauss:// 会被 C 系注释剥离器截断，同 hardcoded_password 注）
    if grep -qiE "jdbc:opengauss://|org\.opengauss\.Driver|psycopg2\.connect\(" "$f" 2>/dev/null; then
      og_hit=1
    fi
    if grep -qiE "DruidDataSource|HikariDataSource|HikariCP|pgbouncer|ConnectionPool|connection_pool|SetMaxOpenConns|maxPoolSize|maximumPoolSize|setMaxActive" "$f" 2>/dev/null; then
      pool_hit=1
    fi
  done
  if [[ "$og_hit" -eq 0 ]]; then
    pass "fw_opengauss_conn_pool: 无 openGauss 数据源信号，跳过"
  elif [[ "$pool_hit" -eq 1 ]]; then
    pass "fw_opengauss_conn_pool: 已使用连接池"
  else
    warn "fw_opengauss_conn_pool: 检出 openGauss 数据源但无连接池信号（裸连高并发打满 max_connections；Java 须 Druid/HikariCP，Python 须 psycopg2-pool/SQLAlchemy pool，或服务端 pgbouncer）"
  fi

  # ====================================================================
  # fw_opengauss_audit_log(warn)：postgresql.conf 须开 audit_trail 审计（CWE-778）
  # ====================================================================
  local audit_hit=0
  for f in "${pgconfarr[@]+"${pgconfarr[@]}"}"; do
    if _fw_strip_comments_cfg "$f" | grep -qiE "audit_trail[[:space:]]*=[[:space:]]*(os|xml|csvlog)|pgaudit|audit_enabled[[:space:]]*=[[:space:]]*(on|true|1)"; then
      audit_hit=1
    fi
  done
  if [[ ${#pgconfarr[@]} -eq 0 ]]; then
    pass "fw_opengauss_audit_log: 无 postgresql.conf 可检，跳过"
  elif [[ "$audit_hit" -eq 1 ]]; then
    pass "fw_opengauss_audit_log: 已配置审计日志"
  else
    warn "fw_opengauss_audit_log: postgresql.conf 无 audit_trail 审计配置（CWE-778 事件无法溯源；等保 2.0 三级要求审计留存，生产须 audit_trail=os/xml/csvlog + 细粒度 audit_* 项）"
  fi

  # ====================================================================
  # fw_opengauss_rls(warn)：tenant_id 多租户表须 row-level security（CWE-639）
  # ====================================================================
  local tenant_hit=0 rls_hit=0
  for f in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    _fw_strip_comments_sql "$f" | grep -qiE "tenant_id" && tenant_hit=1
    _fw_strip_comments_sql "$f" | grep -qiE "CREATE[[:space:]]+POLICY|ROW LEVEL SECURITY" && rls_hit=1
  done
  if [[ "$tenant_hit" -eq 0 ]]; then
    pass "fw_opengauss_rls: 无 tenant_id 多租户表信号，跳过"
  elif [[ "$rls_hit" -eq 1 ]]; then
    pass "fw_opengauss_rls: 多租户表已启用 RLS 策略"
  else
    warn "fw_opengauss_rls: 检出 tenant_id 多租户列但无 CREATE POLICY/ROW LEVEL SECURITY（CWE-639 跨租户泄露；隔离须收敛到数据库层，禁靠应用层 WHERE 自觉）"
  fi

  # ====================================================================
  # fw_opengauss_slow_log(warn)：postgresql.conf 须配 log_min_duration_statement
  # ====================================================================
  local slow_hit=0
  for f in "${pgconfarr[@]+"${pgconfarr[@]}"}"; do
    if _fw_strip_comments_cfg "$f" | grep -qiE "log_min_duration_statement"; then
      slow_hit=1
    fi
  done
  if [[ ${#pgconfarr[@]} -eq 0 ]]; then
    pass "fw_opengauss_slow_log: 无 postgresql.conf 可检，跳过"
  elif [[ "$slow_hit" -eq 1 ]]; then
    pass "fw_opengauss_slow_log: 已配置慢查询日志"
  else
    warn "fw_opengauss_slow_log: postgresql.conf 无 log_min_duration_statement（慢 SQL 无落点，建议 1000ms 起并接采集做 TOP-N 治理）"
  fi

  # ====================================================================
  # fw_opengauss_statement(warn)：Java createStatement() 裸语句须 PreparedStatement
  # ====================================================================
  local st_bad=""
  for f in "${codearr[@]+"${codearr[@]}"}"; do
    case "$(basename "$f")" in
      *.java) ;;
      *) continue ;;
    esac
    ln=$(_fw_og_strip "$f" | grep -nE "createStatement\(\)" || true)
    [[ -n "$ln" ]] && st_bad="${st_bad}${f}:${ln}
"
  done
  _fw_report warn fw_opengauss_statement "$st_bad" "createStatement 裸语句（转义遗漏即注入且无法复用执行计划；须 prepareStatement + setXxx 绑定，opengauss-jdbc 支持 prepared 计划缓存）" "无 createStatement 裸语句"

  # ====================================================================
  # fw_opengauss_autovacuum(warn)：禁 autovacuum=off 全局关自动清理
  # ====================================================================
  local av_bad=""
  for f in "${pgconfarr[@]+"${pgconfarr[@]}"}"; do
    ln=$(_fw_strip_comments_cfg "$f" | grep -inE "autovacuum[[:space:]]*=[[:space:]]*off([^A-Za-z]|$)" || true)
    [[ -n "$ln" ]] && av_bad="${av_bad}${f}:${ln}
"
  done
  _fw_report warn fw_opengauss_autovacuum "$av_bad" "全局关闭 autovacuum（死元组堆积表膨胀+统计信息腐化计划失真；批量导入临时关闭后必须恢复并手工 VACUUM ANALYZE）" "autovacuum 未全局关闭"

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
