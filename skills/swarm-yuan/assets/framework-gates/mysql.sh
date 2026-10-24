# ruleset: mysql  requires_conf: MYSQL_SQL_GLOBS MYSQL_SCHEMA_GLOBS
# gates: fw_mysql_charset(fail) fw_mysql_deep_paging(fail) fw_mysql_isolation(warn) fw_mysql_deadlock_detect(warn) fw_mysql_slow_log(warn) fw_mysql_online_ddl(warn) fw_mysql_too_many_indexes(warn) fw_mysql_select_star(warn) fw_mysql_like_wildcard(warn) fw_mysql_implicit_join(warn) fw_mysql_order_rand(warn) fw_mysql_long_tx(warn)
# harvested-from: P4（2026-07-17），规律源自 MySQL 8.4 LTS / 9.x 官方文档（dev.mysql.com/doc/refman/9.7/）
_fw_mysql_check() {
  echo "  [mysql] MySQL 8.4 LTS / 9.x 框架规律"

  # ---------- 收集文件清单（查询 SQL + 配置 入 sqlarr；DDL 入 scharr） ----------
  local srcs sqlarr=() scharr=()
  srcs=$(_fw_resolve_globs ${MYSQL_SQL_GLOBS[@]+"${MYSQL_SQL_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && sqlarr+=("$ln")
  done <<< "$srcs"
  srcs=$(_fw_resolve_globs ${MYSQL_SCHEMA_GLOBS[@]+"${MYSQL_SCHEMA_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && scharr+=("$ln")
  done <<< "$srcs"

  if [[ ${#sqlarr[@]} -eq 0 && ${#scharr[@]} -eq 0 ]]; then
    warn "mysql: MYSQL_SQL_GLOBS/MYSQL_SCHEMA_GLOBS 未配置或无文件可检"
    return
  fi

  # 配置文件子集（my.cnf/my.ini/ini/conf/yml/yaml/properties）
  local cfgarr=() f
  for f in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    case "$(basename "$f")" in
      *.cnf|*.ini|*.conf|*.cfg|*.yml|*.yaml|*.properties) cfgarr+=("$f") ;;
    esac
  done

  # SQL 正文过滤：调公共库 _fw_strip_comments_mysql（去 -- 与 # 行注释，防注释里的关键字造成误判）

  local c s ln

  # ====================================================================
  # fw_mysql_charset(fail)：字符集必须 utf8mb4，禁 utf8/utf8mb3
  # ====================================================================
  local cs_bad=""
  for s in "${scharr[@]+"${scharr[@]}"}"; do
    ln=$(_fw_strip_comments_mysql "$s" | grep -inE 'CHARSET[[:space:]]*=[[:space:]]*utf8(mb3)?([^[:alnum:]_]|$)|CHARACTER[[:space:]]+SET[[:space:]]+utf8(mb3)?([^[:alnum:]_]|$)' || true)
    [[ -n "$ln" ]] && cs_bad="${cs_bad}${s}:${ln}
"
  done
  _fw_report fail fw_mysql_charset "$cs_bad" "检出 utf8/utf8mb3（3 字节残缺字符集，无法存 emoji/罕用字，utf8mb3 已废弃）——必须 CHARSET=utf8mb4" "字符集均为 utf8mb4 或无显式声明"

  # ====================================================================
  # fw_mysql_deep_paging(fail)：大 OFFSET 深分页禁上线（>10 万）
  # ====================================================================
  local dp_bad=""
  for s in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    ln=$(_fw_strip_comments_mysql "$s" | grep -inE 'LIMIT[[:space:]]+[0-9]{6,}[[:space:]]*,|OFFSET[[:space:]]+[0-9]{6,}' || true)
    [[ -n "$ln" ]] && dp_bad="${dp_bad}${s}:${ln}
"
  done
  _fw_report fail fw_mysql_deep_paging "$dp_bad" "深分页 OFFSET ≥ 10 万（O(offset) 扫描丢弃前 N 行）——改游标 WHERE id > ? 或延迟关联子查询" "无 ≥10 万 offset 深分页"

  # ====================================================================
  # fw_mysql_isolation(warn)：事务隔离级别须显式配置
  # ====================================================================
  local ds_hit=0 iso_hit=0
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if grep -qiE 'jdbc:mysql|\[mysqld\]|mysql://' "$c" 2>/dev/null; then
      ds_hit=1
      if grep -qiE 'transaction-isolation|transaction_isolation|transactionIsolation' "$c" 2>/dev/null; then
        iso_hit=1
      fi
    fi
  done
  if [[ "$ds_hit" -eq 0 ]]; then
    pass "fw_mysql_isolation: 无 mysql 数据源配置，跳过"
  elif [[ "$iso_hit" -eq 1 ]]; then
    pass "fw_mysql_isolation: 已显式配置事务隔离级别"
  else
    warn "fw_mysql_isolation: 检出 mysql 数据源但未显式配置 transaction-isolation（RC/RR 须二选一并记录理由；RR 防幻读靠 next-key lock，RC 无 gap lock）"
  fi

  # ====================================================================
  # fw_mysql_deadlock_detect(warn)：innodb_deadlock_detect 不可关
  # ====================================================================
  local dd_bad=""
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    ln=$(grep -inE 'innodb_deadlock_detect[[:space:]]*=[[:space:]]*(OFF|0)\b' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && dd_bad="${dd_bad}${c}:${ln}
"
  done
  _fw_report warn fw_mysql_deadlock_detect "$dd_bad" "innodb_deadlock_detect=OFF（死锁只能等 innodb_lock_wait_timeout 默认 50s 超时，雪崩风险）——须压测依据 + 加锁顺序一致" "死锁检测未关闭（默认 ON）"

  # ====================================================================
  # fw_mysql_slow_log(warn)：[mysqld] 须有 slow_query_log + long_query_time
  # ====================================================================
  local mysqld_hit=0 slow_ok=0
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if grep -qE '^[[:space:]]*\[mysqld\]' "$c" 2>/dev/null; then
      mysqld_hit=1
      if grep -qiE 'slow_query_log' "$c" 2>/dev/null && grep -qiE 'long_query_time' "$c" 2>/dev/null; then
        slow_ok=1
      fi
    fi
  done
  if [[ "$mysqld_hit" -eq 0 ]]; then
    pass "fw_mysql_slow_log: 无 [mysqld] 配置文件，跳过"
  elif [[ "$slow_ok" -eq 1 ]]; then
    pass "fw_mysql_slow_log: 慢查询日志已配置"
  else
    warn "fw_mysql_slow_log: [mysqld] 缺 slow_query_log 或 long_query_time（无慢日志 = 无性能可观测性，建议阈值 0.5~1s）"
  fi

  # ====================================================================
  # fw_mysql_online_ddl(warn)：禁 ALGORITHM=COPY / LOCK=EXCLUSIVE
  # ====================================================================
  local ddl_bad=""
  for s in "${scharr[@]+"${scharr[@]}"}"; do
    ln=$(_fw_strip_comments_mysql "$s" | grep -inE 'ALGORITHM[[:space:]]*=[[:space:]]*COPY|LOCK[[:space:]]*=[[:space:]]*EXCLUSIVE' || true)
    [[ -n "$ln" ]] && ddl_bad="${ddl_bad}${s}:${ln}
"
  done
  _fw_report warn fw_mysql_online_ddl "$ddl_bad" "检出 ALGORITHM=COPY/LOCK=EXCLUSIVE（整表拷贝+锁写，大表灾难）——须 ALGORITHM=INSTANT/INPLACE, LOCK=NONE 或 pt-osc/gh-ost" "无 COPY/EXCLUSIVE DDL"

  # ====================================================================
  # fw_mysql_too_many_indexes(warn)：单表二级索引 >5 → 写放大
  # ====================================================================
  local idx_bad=""
  for s in "${scharr[@]+"${scharr[@]}"}"; do
    ln=$(_fw_strip_comments_mysql "$s" | awk '
      /CREATE[[:space:]]+TABLE/ { intable=1; cnt=0; tbl=$0; next }
      intable && /(KEY|INDEX)[[:space:]]/ && !/PRIMARY[[:space:]]+KEY/ { cnt++ }
      intable && /^[[:space:]]*\)/ { if (cnt>5) print "二级索引数="cnt" : "tbl; intable=0 }
      intable && /\)[[:space:]]*(ENGINE|DEFAULT|;)/ { if (cnt>5) print "二级索引数="cnt" : "tbl; intable=0 }
    ' 2>/dev/null || true)
    [[ -n "$ln" ]] && idx_bad="${idx_bad}${s}:${ln}
"
  done
  _fw_report warn fw_mysql_too_many_indexes "$idx_bad" "单表二级索引 >5（写放大 + 优化器误选概率升）——合并联合索引，低频查询走从库" "索引数量合理或无 DDL 可检"

  # ====================================================================
  # fw_mysql_select_star(warn)：SELECT * 破坏覆盖索引
  # ====================================================================
  local ss_bad=""
  for s in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    ln=$(_fw_strip_comments_mysql "$s" | grep -inE 'SELECT[[:space:]]*\*[[:space:]]+FROM' || true)
    [[ -n "$ln" ]] && ss_bad="${ss_bad}${s}:${ln}
"
  done
  _fw_report warn fw_mysql_select_star "$ss_bad" "SELECT * 破坏覆盖索引（必回表）且放大网络/内存——列名枚举，高频查询让 SELECT 列 ⊆ 索引列" "无 SELECT *"

  # ====================================================================
  # fw_mysql_like_wildcard(warn)：LIKE '% 前置通配索引失效
  # ====================================================================
  local lk_bad=""
  for s in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    ln=$(_fw_strip_comments_mysql "$s" | grep -inE "LIKE[[:space:]]+'%" || true)
    [[ -n "$ln" ]] && lk_bad="${lk_bad}${s}:${ln}
"
  done
  _fw_report warn fw_mysql_like_wildcard "$lk_bad" "LIKE 前置通配符使 B-Tree 索引失效（全表扫描）——改 FULLTEXT(ngram)/ES，高频字段须 EXPLAIN 确认走索引" "无前置通配 LIKE"

  # ====================================================================
  # fw_mysql_implicit_join(warn)：FROM a, b 隐式逗号连接
  # ====================================================================
  local ij_bad=""
  for s in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    ln=$(_fw_strip_comments_mysql "$s" | grep -inE 'FROM[[:space:]]+[a-zA-Z_][a-zA-Z0-9_]*[[:space:]]*,[[:space:]]*[a-zA-Z_]' || true)
    [[ -n "$ln" ]] && ij_bad="${ij_bad}${s}:${ln}
"
  done
  _fw_report warn fw_mysql_implicit_join "$ij_bad" "隐式逗号 JOIN（易漏连接条件变笛卡尔积，无法表达驱动顺序）——改显式 INNER JOIN ... ON，小表驱动大表、内表连接列建索引" "无隐式逗号 JOIN"

  # ====================================================================
  # fw_mysql_order_rand(warn)：ORDER BY RAND() 必现 filesort+全扫
  # ====================================================================
  local or_bad=""
  for s in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    ln=$(_fw_strip_comments_mysql "$s" | grep -inE 'ORDER[[:space:]]+BY[[:space:]]+RAND[[:space:]]*\(' || true)
    [[ -n "$ln" ]] && or_bad="${or_bad}${s}:${ln}
"
  done
  _fw_report warn fw_mysql_order_rand "$or_bad" "ORDER BY RAND() 对全表 filesort（EXPLAIN 必现 ALL+filesort）——改主键区间随机/预计算随机列/应用层随机" "无 ORDER BY RAND()"

  # ====================================================================
  # fw_mysql_long_tx(warn)：autocommit=0 或事务内 SLEEP → 长事务
  # ====================================================================
  local tx_bad=""
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    ln=$(grep -inE 'autocommit[[:space:]]*=[[:space:]]*0\b' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && tx_bad="${tx_bad}${c}:${ln}
"
  done
  for s in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    ln=$(_fw_strip_comments_mysql "$s" | grep -inE 'SLEEP[[:space:]]*\(' || true)
    [[ -n "$ln" ]] && tx_bad="${tx_bad}${s}:${ln}
"
  done
  _fw_report warn fw_mysql_long_tx "$tx_bad" "检出 autocommit=0 或 SQL 内 SLEEP(（长事务持锁 + RR 一致性读阻 undo purge → MVCC 膨胀）——事务短平快、禁 RPC/sleep、批量分批提交" "无长事务信号"

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
