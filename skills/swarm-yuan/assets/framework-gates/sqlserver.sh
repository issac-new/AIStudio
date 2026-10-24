# ruleset: sqlserver  requires_conf: MSSQL_SQL_GLOBS MSSQL_SCHEMA_GLOBS
# gates: fw_mssql_nolock(warn) fw_mssql_sql_injection(fail) fw_mssql_batch(warn) fw_mssql_isolation(warn) fw_mssql_linked_server(warn) fw_mssql_select_star(warn) fw_mssql_deadlock_trace(warn) fw_mssql_pagination(warn) fw_mssql_sp_grant_public(fail) fw_mssql_trigger(warn) fw_mssql_dml_nowhere(fail)
# harvested-from: P4（2026-07-17），规律源自 SQL Server 2022/2025 官方文档（learn.microsoft.com/sql/）
_fw_sqlserver_check() {
  echo "  [sqlserver] SQL Server 2022 / 2025 框架规律"

  # ---------- 收集文件清单（查询 SQL + 配置 + DDL 统一入 sqlarr） ----------
  local srcs sqlarr=()
  srcs=$(_fw_resolve_globs ${MSSQL_SQL_GLOBS[@]+"${MSSQL_SQL_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && sqlarr+=("$ln")
  done <<< "$srcs"
  # SCHEMA 变量：DDL 侧扩展入口（§C+.1-FW 枚举），有则并入扫描
  srcs=$(_fw_resolve_globs ${MSSQL_SCHEMA_GLOBS[@]+"${MSSQL_SCHEMA_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && sqlarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#sqlarr[@]} -eq 0 ]]; then
    warn "sqlserver: MSSQL_SQL_GLOBS/MSSQL_SCHEMA_GLOBS 未配置或无文件可检"
    return
  fi

  # 配置文件子集
  local cfgarr=() f
  for f in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    case "$(basename "$f")" in
      *.cnf|*.ini|*.conf|*.cfg|*.config|*.yml|*.yaml|*.properties|*.json) cfgarr+=("$f") ;;
    esac
  done

  # SQL 正文过滤：调公共库 _fw_strip_comments_sql（SQL 系，去 -- 行注释）

  local c s ln

  # ====================================================================
  # fw_mssql_nolock(warn)：NOLOCK 须显式声明脏读风险（声明写在注释里，故查原文）
  # ====================================================================
  local nl_bad=""
  for s in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    if _fw_strip_comments_sql "$s" | grep -qiE 'WITH[[:space:]]*\(NOLOCK\)'; then
      if ! grep -qiE '脏读|dirty' "$s" 2>/dev/null; then
        nl_bad="${nl_bad}${s}
"
      fi
    fi
  done
  _fw_report warn fw_mssql_nolock "${nl_bad}" "WITH (NOLOCK) 未声明脏读风险（= READ UNCOMMITTED，脏读/行漂移；一致性场景禁用，替代 READ_COMMITTED_SNAPSHOT）——同文件注释须写「脏读风险已评估」" "NOLOCK 均已声明脏读风险或未使用"

  # ====================================================================
  # fw_mssql_sql_injection(fail)：字符串拼接动态 SQL
  # ====================================================================
  local inj_bad=""
  for s in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    ln=$(_fw_strip_comments_sql "$s" | grep -inE "'[[:space:]]*\+[[:space:]]*@|(EXEC|EXECUTE)[[:space:]]*\([^)]*\+" || true)
    [[ -n "$ln" ]] && inj_bad="${inj_bad}${s}:${ln}
"
  done
  _fw_report fail fw_mssql_sql_injection "${inj_bad}" "字符串拼接动态 SQL（SQL 注入 CWE-89 + 计划缓存污染）——必须 sp_executesql 参数化，动态表名用 QUOTENAME()" "动态 SQL 均参数化"

  # ====================================================================
  # fw_mssql_batch(warn)：BEGIN TRAN + 大量 DML 无 TOP/WHILE 分批 → 锁升级
  # ====================================================================
  local bt_bad="" dml_cnt
  for s in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    case "$(basename "$s")" in
      *.sql) ;;
      *) continue ;;
    esac
    if _fw_strip_comments_sql "$s" | grep -qiE 'BEGIN[[:space:]]+TRAN'; then
      dml_cnt=$(_fw_strip_comments_sql "$s" | grep -icE '(INSERT|UPDATE|DELETE)[[:space:]]' || true)
      if [[ "$dml_cnt" -ge 10 ]]; then
        if ! _fw_strip_comments_sql "$s" | grep -qiE 'TOP[[:space:]]*\(|WHILE'; then
          bt_bad="${bt_bad}${s}: 事务内 DML 行数=${dml_cnt} 且无分批
"
        fi
      fi
    fi
  done
  _fw_report warn fw_mssql_batch "${bt_bad}" "单事务大批量 DML 无 TOP/WHILE 分批（行锁升级表锁，全表阻塞）——WHILE + DELETE/UPDATE TOP (5000) 分批提交" "批量 DML 均有分批或无大批量事务"

  # ====================================================================
  # fw_mssql_isolation(warn)：BEGIN TRAN 须配显式隔离级别声明
  # ====================================================================
  local tran_hit=0 iso_hit=0
  for s in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    _fw_strip_comments_sql "$s" | grep -qiE 'BEGIN[[:space:]]+TRAN' && tran_hit=1
    _fw_strip_comments_sql "$s" | grep -qiE 'SET[[:space:]]+TRANSACTION[[:space:]]+ISOLATION[[:space:]]+LEVEL' && iso_hit=1
  done
  if [[ "$tran_hit" -eq 0 ]]; then
    pass "fw_mssql_isolation: 无显式事务，跳过"
  elif [[ "$iso_hit" -eq 1 ]]; then
    pass "fw_mssql_isolation: 已显式声明隔离级别"
  else
    warn "fw_mssql_isolation: 检出 BEGIN TRAN 但无 SET TRANSACTION ISOLATION LEVEL（隐式依赖默认 RC，运维改库级设置即行为漂移；高并发读写建议 READ_COMMITTED_SNAPSHOT）"
  fi

  # ====================================================================
  # fw_mssql_linked_server(warn)：链接服务器调用须最小权限审计
  # ====================================================================
  local ls_bad=""
  for s in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    ln=$(_fw_strip_comments_sql "$s" | grep -inE 'sp_addlinkedserver|OPENQUERY|OPENROWSET' || true)
    [[ -n "$ln" ]] && ls_bad="${ls_bad}${s}:${ln}
"
  done
  _fw_report warn fw_mssql_linked_server "${ls_bad}" "检出链接服务器调用（映射高权限账号 = 注入横向移动通道 CWE-732）——核对映射登录只读低权限、rpc out 关闭" "无链接服务器调用"

  # ====================================================================
  # fw_mssql_select_star(warn)：SELECT * → Key Lookup / 覆盖索引失效
  # ====================================================================
  local ss_bad=""
  for s in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    ln=$(_fw_strip_comments_sql "$s" | grep -inE 'SELECT[[:space:]]*\*[[:space:]]+FROM' || true)
    [[ -n "$ln" ]] && ss_bad="${ss_bad}${s}:${ln}
"
  done
  _fw_report warn fw_mssql_select_star "${ss_bad}" "SELECT * 使非聚集索引必缺列 → Key Lookup 随机 IO——列名枚举，高频索引用 INCLUDE 覆盖" "无 SELECT *"

  # ====================================================================
  # fw_mssql_deadlock_trace(warn)：mssql 配置须含死锁追踪（1222/XE）
  # ====================================================================
  local ds_hit=0 dt_hit=0
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if grep -qiE 'sqlserver|mssql|Initial[[:space:]]+Catalog|jdbc:sqlserver' "$c" 2>/dev/null; then
      ds_hit=1
      if grep -qiE '1222|deadlock|system_health' "$c" 2>/dev/null; then
        dt_hit=1
      fi
    fi
  done
  if [[ "$ds_hit" -eq 0 ]]; then
    pass "fw_mssql_deadlock_trace: 无 mssql 配置文件，跳过"
  elif [[ "$dt_hit" -eq 1 ]]; then
    pass "fw_mssql_deadlock_trace: 死锁追踪已配置"
  else
    warn "fw_mssql_deadlock_trace: mssql 配置无死锁追踪（trace flag 1222 写 ERRORLOG / 确认 system_health XE 在线）——死锁无图可查只能重试硬扛，加锁顺序全应用须一致"
  fi

  # ====================================================================
  # fw_mssql_pagination(warn)：ROW_NUMBER 分页 → OFFSET FETCH
  # ====================================================================
  local pg_bad=""
  for s in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    ln=$(_fw_strip_comments_sql "$s" | grep -inE 'ROW_NUMBER[[:space:]]*\(' || true)
    [[ -n "$ln" ]] && pg_bad="${pg_bad}${s}:${ln}
"
  done
  _fw_report warn fw_mssql_pagination "${pg_bad}" "ROW_NUMBER 双层嵌套分页（多一层 Spool/Sequence Project）——2012+ 用 ORDER BY ... OFFSET n ROWS FETCH NEXT m ROWS ONLY，深分页用 keyset 游标" "无 ROW_NUMBER 分页"

  # ====================================================================
  # fw_mssql_sp_grant_public(fail)：GRANT EXECUTE TO public
  # ====================================================================
  local gp_bad=""
  for s in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    ln=$(_fw_strip_comments_sql "$s" | grep -inE 'GRANT[[:space:]]+EXEC(UTE)?[[:space:]].*TO[[:space:]]+public' || true)
    [[ -n "$ln" ]] && gp_bad="${gp_bad}${s}:${ln}
"
  done
  _fw_report fail fw_mssql_sp_grant_public "${gp_bad}" "GRANT EXECUTE TO public（任意登录可执行，越权 CWE-862）——按角色授权 GRANT EXECUTE ON SCHEMA::dbo TO <role>" "无 public 授权"

  # ====================================================================
  # fw_mssql_trigger(warn)：触发器慎用
  # ====================================================================
  local tg_bad=""
  for s in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    ln=$(_fw_strip_comments_sql "$s" | grep -inE 'CREATE[[:space:]]+TRIGGER' || true)
    [[ -n "$ln" ]] && tg_bad="${tg_bad}${s}:${ln}
"
  done
  _fw_report warn fw_mssql_trigger "${tg_bad}" "检出触发器（在触发事务内同步执行，重活/外部调用拉长 DML 持锁）——重逻辑改 Service Broker/CDC/应用层事件" "无触发器"

  # ====================================================================
  # fw_mssql_dml_nowhere(fail)：单行 UPDATE/DELETE 无 WHERE
  # ====================================================================
  local dml_bad=""
  for s in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    ln=$(_fw_strip_comments_sql "$s" | grep -inE '^[[:space:]]*(DELETE[[:space:]]+FROM|UPDATE[[:space:]]+)[^;]*;' | grep -ivE 'WHERE|TOP' || true)
    [[ -n "$ln" ]] && dml_bad="${dml_bad}${s}:${ln}
"
  done
  _fw_report fail fw_mssql_dml_nowhere "${dml_bad}" "无 WHERE 的 UPDATE/DELETE（全表改写/清空 + 锁升级）——批量变更 WHERE 限定 + TOP 分批，清表用 TRUNCATE" "DML 均带 WHERE"

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
