# ruleset: postgresql  requires_conf: PGSQL_SQL_GLOBS PGSQL_SCHEMA_GLOBS
# gates: fw_pgsql_pk_identity(fail) fw_pgsql_json_vs_jsonb(warn) fw_pgsql_jsonb_index(warn) fw_pgsql_autovacuum(warn) fw_pgsql_conn_pool(warn) fw_pgsql_isolation(warn) fw_pgsql_index_type(warn) fw_pgsql_partition(warn) fw_pgsql_dml_where(fail) fw_pgsql_copy_vs_insert(warn) fw_pgsql_seq_cache(warn) fw_pgsql_constraint_naming(warn)
# harvested-from: P4（2026-07-17），规律源自 PostgreSQL 17/18 官方文档（postgresql.org/docs/18/）
_fw_postgresql_check() {
  echo "  [postgresql] PostgreSQL 17 / 18 框架规律"

  # ---------- 收集文件清单（查询 SQL + 配置 入 sqlarr；DDL 入 scharr） ----------
  local srcs sqlarr=() scharr=()
  srcs=$(_fw_resolve_globs ${PGSQL_SQL_GLOBS[@]+"${PGSQL_SQL_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && sqlarr+=("$ln")
  done <<< "$srcs"
  srcs=$(_fw_resolve_globs ${PGSQL_SCHEMA_GLOBS[@]+"${PGSQL_SCHEMA_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && scharr+=("$ln")
  done <<< "$srcs"

  if [[ ${#sqlarr[@]} -eq 0 && ${#scharr[@]} -eq 0 ]]; then
    warn "postgresql: PGSQL_SQL_GLOBS/PGSQL_SCHEMA_GLOBS 未配置或无文件可检"
    return
  fi

  # 配置文件子集
  local cfgarr=() f
  for f in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    case "$(basename "$f")" in
      *.cnf|*.ini|*.conf|*.cfg|*.yml|*.yaml|*.properties) cfgarr+=("$f") ;;
    esac
  done

  # SQL 正文过滤：调公共库 _fw_strip_comments_sql（去 -- 行注释）

  local c s ln

  # ====================================================================
  # fw_pgsql_pk_identity(fail)：禁 max(id)+1 应用层取号
  # ====================================================================
  local pk_bad=""
  for s in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    ln=$(_fw_strip_comments_sql "$s" | grep -inE 'max[[:space:]]*\([[:space:]]*(id|[a-z_]+_id)[[:space:]]*\)[[:space:]]*\+' || true)
    [[ -n "$ln" ]] && pk_bad="${pk_bad}${s}:${ln}
"
  done
  _fw_report fail fw_pgsql_pk_identity "$pk_bad" "max(id)+1 应用层取号（并发必重复主键 + 大表全扫）——必须 GENERATED ALWAYS/BY DEFAULT AS IDENTITY 或序列" "无 max(id)+1 取号"

  # ====================================================================
  # fw_pgsql_json_vs_jsonb(warn)：列类型 json（非 jsonb）→ 应改 jsonb
  # ====================================================================
  local js_bad=""
  for s in "${scharr[@]+"${scharr[@]}"}"; do
    ln=$(_fw_strip_comments_sql "$s" | grep -inE '[[:space:]]json([[:space:],)])' || true)
    [[ -n "$ln" ]] && js_bad="${js_bad}${s}:${ln}
"
  done
  _fw_report warn fw_pgsql_json_vs_jsonb "$js_bad" "json 类型存文本、不可索引、每次查询重新解析——除保留原文场景外一律改 jsonb" "无 json 类型列"

  # ====================================================================
  # fw_pgsql_jsonb_index(warn)：jsonb 列须核对 GIN 索引
  # ====================================================================
  local gi_bad=""
  for s in "${scharr[@]+"${scharr[@]}"}"; do
    if _fw_strip_comments_sql "$s" | grep -qiE 'jsonb' && ! _fw_strip_comments_sql "$s" | grep -qiE 'USING[[:space:]]+gin'; then
      gi_bad="${gi_bad}${s}
"
    fi
  done
  _fw_report warn fw_pgsql_jsonb_index "$gi_bad" "检出 jsonb 列但同文件无 GIN 索引（@>/包含查询全表扫）——检索列须 CREATE INDEX ... USING gin" "jsonb 均配 GIN 或无 jsonb"

  # ====================================================================
  # fw_pgsql_autovacuum(warn)：autovacuum=off → 膨胀/xid 回卷
  # ====================================================================
  local av_bad=""
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    ln=$(grep -inE 'autovacuum[[:space:]]*=[[:space:]]*off' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && av_bad="${av_bad}${c}:${ln}
"
  done
  _fw_report warn fw_pgsql_autovacuum "$av_bad" "autovacuum=off（死元组膨胀 + 统计失真 + xid 回卷只读风险）——高更新表调低 scale_factor 而非关闭" "autovacuum 未关闭"

  # ====================================================================
  # fw_pgsql_conn_pool(warn)：PG 数据源须配连接池
  # ====================================================================
  local ds_hit=0 pool_hit=0
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if grep -qiE 'jdbc:postgresql://|postgresql://|postgres://' "$c" 2>/dev/null; then
      ds_hit=1
      if grep -qiE 'hikari|maximumPoolSize|pgbouncer|pool_size|pooling' "$c" 2>/dev/null; then
        pool_hit=1
      fi
    fi
  done
  if [[ "$ds_hit" -eq 0 ]]; then
    pass "fw_pgsql_conn_pool: 无 PG 数据源配置，跳过"
  elif [[ "$pool_hit" -eq 1 ]]; then
    pass "fw_pgsql_conn_pool: 已配连接池"
  else
    warn "fw_pgsql_conn_pool: 检出 PG 数据源但无连接池配置（HikariCP/PgBouncer）——每请求新建连接 = fork 后端进程，FATAL: too many clients 风险"
  fi

  # ====================================================================
  # fw_pgsql_isolation(warn)：SERIALIZABLE 须核对重试逻辑
  # ====================================================================
  local iso_bad=""
  for s in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    ln=$(_fw_strip_comments_sql "$s" | grep -inE 'ISOLATION[[:space:]]+LEVEL[[:space:]]+SERIALIZABLE' || true)
    [[ -n "$ln" ]] && iso_bad="${iso_bad}${s}:${ln}
"
  done
  _fw_report warn fw_pgsql_isolation "$iso_bad" "显式 SERIALIZABLE（SSI 谓词锁开销 + SQLSTATE 40001 序列化失败必须重试）——默认 RC 起步，RR 为快照隔离（与 MySQL 语义不同）" "无 SERIALIZABLE 显式声明"

  # ====================================================================
  # fw_pgsql_index_type(warn)：双侧通配 LIKE 须 pg_trgm
  # ====================================================================
  local like_hit="" trgm_hit=0
  for s in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    ln=$(_fw_strip_comments_sql "$s" | grep -inE "LIKE[[:space:]]+'%[^']*%'" || true)
    [[ -n "$ln" ]] && like_hit="${like_hit}${s}:${ln}
"
    _fw_strip_comments_sql "$s" | grep -qiE 'pg_trgm' && trgm_hit=1
  done
  for s in "${scharr[@]+"${scharr[@]}"}"; do
    _fw_strip_comments_sql "$s" | grep -qiE 'pg_trgm' && trgm_hit=1
  done
  if [[ -z "$like_hit" ]]; then
    pass "fw_pgsql_index_type: 无双侧通配 LIKE"
  elif [[ "$trgm_hit" -eq 1 ]]; then
    pass "fw_pgsql_index_type: 双侧通配 LIKE 已配 pg_trgm"
  else
    warn "fw_pgsql_index_type: 双侧通配 LIKE '%...%' 但无 pg_trgm 扩展（全表扫）——CREATE EXTENSION pg_trgm + GIN/GiST 索引:
${like_hit}"
  fi

  # ====================================================================
  # fw_pgsql_partition(warn)：log/history/event 大表须分区
  # ====================================================================
  local pt_bad=""
  for s in "${scharr[@]+"${scharr[@]}"}"; do
    if _fw_strip_comments_sql "$s" | grep -qiE 'CREATE[[:space:]]+TABLE[[:space:]]+(IF[[:space:]]+NOT[[:space:]]+EXISTS[[:space:]]+)?[a-zA-Z_0-9]*(log|history|event)[a-zA-Z_0-9]*' \
       && ! _fw_strip_comments_sql "$s" | grep -qiE 'PARTITION[[:space:]]+BY'; then
      pt_bad="${pt_bad}${s}
"
    fi
  done
  _fw_report warn fw_pgsql_partition "$pt_bad" "log/history/event 类追加写大表无 PARTITION BY（清理只能 DELETE → 死元组恶性循环）——RANGE 分区后可 DROP PARTITION 秒级归档" "日志类表已分区或无此类表"

  # ====================================================================
  # fw_pgsql_dml_where(fail)：单行 UPDATE/DELETE 无 WHERE
  # ====================================================================
  local dml_bad=""
  for s in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    ln=$(_fw_strip_comments_sql "$s" | grep -inE '^[[:space:]]*(DELETE[[:space:]]+FROM|UPDATE[[:space:]]+)[^;]*;' | grep -ivE 'WHERE' || true)
    [[ -n "$ln" ]] && dml_bad="${dml_bad}${s}:${ln}
"
  done
  _fw_report fail fw_pgsql_dml_where "$dml_bad" "无 WHERE 的 UPDATE/DELETE（全表改写/清空 + 全程行锁 + 死元组洪峰）——批量变更分批，清表用 TRUNCATE" "DML 均带 WHERE"

  # ====================================================================
  # fw_pgsql_copy_vs_insert(warn)：单文件 INSERT ≥50 行建议 COPY
  # ====================================================================
  local cp_bad=""
  local cnt
  for s in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    case "$(basename "$s")" in
      *.sql) ;;
      *) continue ;;
    esac
    cnt=$(_fw_strip_comments_sql "$s" | grep -icE 'INSERT[[:space:]]+INTO' || true)
    if [[ "$cnt" -ge 50 ]]; then
      cp_bad="${cp_bad}${s}: INSERT 行数=${cnt}
"
    fi
  done
  _fw_report warn fw_pgsql_copy_vs_insert "$cp_bad" "单文件 INSERT ≥50 行（逐条解析/规划/WAL 慢 10~100 倍）——改 COPY FROM STDIN 或多行 VALUES 分批" "无大批量 INSERT 脚本"

  # ====================================================================
  # fw_pgsql_seq_cache(warn)：CREATE SEQUENCE 显式 CACHE 1
  # ====================================================================
  local sq_bad=""
  for s in "${scharr[@]+"${scharr[@]}"}"; do
    ln=$(_fw_strip_comments_sql "$s" | grep -inE 'CREATE[[:space:]]+SEQUENCE[^;]*CACHE[[:space:]]+1([^0-9]|$)' || true)
    [[ -n "$ln" ]] && sq_bad="${sq_bad}${s}:${ln}
"
  done
  _fw_report warn fw_pgsql_seq_cache "$sq_bad" "序列 CACHE 1（高并发 nextval 写 WAL 成热点）——CACHE 50~1000，业务须容忍取号间隙" "无显式 CACHE 1 序列"

  # ====================================================================
  # fw_pgsql_constraint_naming(warn)：REFERENCES 无 CONSTRAINT 命名
  # ====================================================================
  local cn_bad=""
  for s in "${scharr[@]+"${scharr[@]}"}"; do
    if _fw_strip_comments_sql "$s" | grep -qiE 'REFERENCES[[:space:]]' && ! _fw_strip_comments_sql "$s" | grep -qiE 'CONSTRAINT[[:space:]]'; then
      cn_bad="${cn_bad}${s}
"
    fi
  done
  _fw_report warn fw_pgsql_constraint_naming "$cn_bad" "REFERENCES 外键无显式 CONSTRAINT 命名（系统名跨环境漂移，迁移脚本按名 DROP/ALTER 失败）——CONSTRAINT fk_xxx FOREIGN KEY ..." "约束均显式命名或无外键"

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
