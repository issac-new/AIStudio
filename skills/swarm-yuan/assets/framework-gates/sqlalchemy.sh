# ruleset: sqlalchemy  requires_conf: SQLALCHEMY_SRC_GLOBS
# gates: fw_sa_legacy_query(warn) fw_sa_detached(warn) fw_sa_pool_recycle(warn) fw_sa_nplusone(warn) fw_sa_engine_credentials(fail) fw_sa_bulk_insert(warn) fw_sa_transaction_boundary(warn) fw_sa_scoped_session(warn) fw_sa_fk_index(warn) fw_sa_alembic(warn) fw_sa_pool_size(warn) fw_sa_text_injection(fail) fw_sa_string_length(warn)
# harvested-from: P4（2026-07-17），规律源自 SQLAlchemy 2.0.x 官方文档（https://docs.sqlalchemy.org/en/20/）
_fw_sqlalchemy_check() {
  echo "  [sqlalchemy] SQLAlchemy 2.0.x 框架规律"

  # ---------- 收集源文件清单 ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${SQLALCHEMY_SRC_GLOBS[@]+"${SQLALCHEMY_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "sqlalchemy: SQLALCHEMY_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # 代码正文过滤：调公共库 _fw_strip_comments_hash（Python 系，去 # 注释）

  # ====================================================================
  # fw_sa_legacy_query(warn)：1.x session.query() 须迁 2.x select()
  # ====================================================================
  local lq_bad=""
  for f in "${srcarr[@]}"; do
    local ln
    ln=$(_fw_strip_comments_hash "$f" | grep -nE '\.query\(' 2>/dev/null || true)
    [[ -n "$ln" ]] && lq_bad="${lq_bad}${f}:${ln}
"
  done
  _fw_report warn fw_sa_legacy_query "${lq_bad}" "1.x 风格 session.query()（2.x 须 select() + session.scalars/execute）" "无 1.x query() 风格"

  # ====================================================================
  # fw_sa_detached(warn)：session 关闭/提交后访问关联 → DetachedInstanceError
  # ====================================================================
  local dt_bad=""
  for f in "${srcarr[@]}"; do
    # (a) 显式 session.close()：须人工确认关闭后无关联属性访问
    if _fw_strip_comments_hash "$f" | grep -qE '\.close\(\)' && grep -qE 'session|Session' "$f" 2>/dev/null; then
      if _fw_strip_comments_hash "$f" | grep -qE '(session|s)\.close\(\)'; then
        dt_bad="${dt_bad}${f}: 显式 session.close()（须确认返回对象关联已加载，否则 DetachedInstanceError）
"
        continue
      fi
    fi
    # (b) with Session() as s: 块内 return ORM 对象且无加载策略/expire_on_commit=False
    if grep -qE 'with[[:space:]].*Session.*[[:space:]]as[[:space:]]' "$f" 2>/dev/null \
       && _fw_strip_comments_hash "$f" | grep -qE '^[[:space:]]+return[[:space:]]' \
       && ! grep -qE 'joinedload|selectinload|subqueryload|expire_on_commit' "$f" 2>/dev/null; then
      dt_bad="${dt_bad}${f}: with-Session 块内 return ORM 对象且无加载策略（出块后访问关联将 DetachedInstanceError）
"
    fi
  done
  _fw_report warn fw_sa_detached "${dt_bad}" "会话边界后访问关联风险（返回前加载完关联或 expire_on_commit=False）" "会话边界与加载策略合理"

  # ====================================================================
  # fw_sa_pool_recycle(warn)：连接池须 pool_recycle/pool_pre_ping 防断连
  # ====================================================================
  local has_engine=0 pr_bad=""
  for f in "${srcarr[@]}"; do
    if grep -qE 'create_engine\(|create_async_engine\(' "$f" 2>/dev/null; then
      has_engine=1
      if ! grep -qE 'pool_recycle|pool_pre_ping' "$f" 2>/dev/null; then
        pr_bad="${pr_bad}${f}
"
      fi
    fi
  done
  if [[ "$has_engine" -eq 0 ]]; then
    pass "fw_sa_pool_recycle: 无 create_engine，跳过"
  elif [[ -n "$pr_bad" ]]; then
    warn "fw_sa_pool_recycle: create_engine 无 pool_recycle/pool_pre_ping（MySQL wait_timeout 8h 断连后首查报错）:
${pr_bad}"
  else
    pass "fw_sa_pool_recycle: 连接池回收/探活已配置"
  fi

  # ====================================================================
  # fw_sa_nplusone(warn)：relationship 须配加载策略消除 N+1
  # ====================================================================
  local np_bad=""
  for f in "${srcarr[@]}"; do
    if grep -qE 'relationship\(' "$f" 2>/dev/null \
       && ! grep -qE 'selectinload|joinedload|subqueryload|lazy[[:space:]]*=' "$f" 2>/dev/null; then
      np_bad="${np_bad}${f}: relationship 无加载策略（遍历关联将 N+1）
"
    fi
  done
  _fw_report warn fw_sa_nplusone "${np_bad}" "relationship 未配 selectinload/joinedload/lazy=（N+1 风险）" "关系加载策略已声明或无 relationship"

  # ====================================================================
  # fw_sa_engine_credentials(fail)：create_engine URL 禁明文凭据
  # ====================================================================
  local ec_bad=""
  for f in "${srcarr[@]}"; do
    local ln
    ln=$(_fw_strip_comments_hash "$f" | grep -nE '[a-zA-Z][a-zA-Z0-9+]*://[A-Za-z0-9_-]+:[^@"'"'"'[:space:]]+@' 2>/dev/null \
       | grep -vE 'os\.environ|getenv|%\(|format\(|example|user:pass|user:password' || true)
    [[ -n "$ln" ]] && ec_bad="${ec_bad}${f}:${ln}
"
  done
  _fw_report fail fw_sa_engine_credentials "${ec_bad}" "create_engine URL 明文凭据（CWE-798，须环境变量注入）" "无明文凭据连接串"

  # ====================================================================
  # fw_sa_bulk_insert(warn)：循环逐条 session.add 须 bulk_insert_mappings
  # ====================================================================
  local bi_bad=""
  for f in "${srcarr[@]}"; do
    if _fw_strip_comments_hash "$f" | grep -qE '^[[:space:]]*for[[:space:]].*:' \
       && grep -qE '\.add\(' "$f" 2>/dev/null \
       && ! grep -qE 'bulk_insert_mappings|bulk_save_objects|add_all\(' "$f" 2>/dev/null; then
      bi_bad="${bi_bad}${f}: for 循环 + session.add（逐条 INSERT，批量须 bulk_insert_mappings）
"
    fi
  done
  _fw_report warn fw_sa_bulk_insert "${bi_bad}" "逐条插入性能差（N 次往返；bulk_insert_mappings/add_all 批量）" "无逐条循环插入"

  # ====================================================================
  # fw_sa_transaction_boundary(warn)：写操作须 commit/rollback 边界
  # ====================================================================
  local tb_bad=""
  for f in "${srcarr[@]}"; do
    if grep -qE '\.add\(|\.delete\(' "$f" 2>/dev/null \
       && ! grep -qE '\.commit\(|\.rollback\(|\.begin\(' "$f" 2>/dev/null; then
      tb_bad="${tb_bad}${f}: session.add/delete 无 commit/rollback（写操作静默丢失或悬挂事务）
"
    fi
  done
  _fw_report warn fw_sa_transaction_boundary "${tb_bad}" "事务边界缺失（写后须 commit，异常须 rollback）" "事务边界完整"

  # ====================================================================
  # fw_sa_scoped_session(warn)：scoped_session 须 remove() 防线程泄漏
  # ====================================================================
  local has_scoped=0 has_remove=0
  # SIGPIPE 加固（head 截断致 grep SIGPIPE，在 $() 末尾加 || true）
  has_scoped=$(grep -rlE 'scoped_session\(' "${srcarr[@]}" 2>/dev/null | head -1 | wc -l | xargs || true)
  if [[ "$has_scoped" -eq 0 ]]; then
    pass "fw_sa_scoped_session: 无 scoped_session，跳过"
  else
    has_remove=$(grep -rlE '\.remove\(\)' "${srcarr[@]}" 2>/dev/null | head -1 | wc -l | xargs || true)
    if [[ "$has_remove" -eq 1 ]]; then
      pass "fw_sa_scoped_session: scoped_session 有 remove() 边界"
    else
      warn "fw_sa_scoped_session: scoped_session 无 .remove()（线程/请求间会话泄漏）"
    fi
  fi

  # ====================================================================
  # fw_sa_fk_index(warn)：ForeignKey 列须 index=True（PG 不自动建索引）
  # ====================================================================
  local fk_bad=""
  for f in "${srcarr[@]}"; do
    local ln
    ln=$(_fw_strip_comments_hash "$f" | grep -nE 'ForeignKey\(' 2>/dev/null | grep -vE 'index[[:space:]]*=' || true)
    [[ -n "$ln" ]] && fk_bad="${fk_bad}${f}:${ln}
"
  done
  _fw_report warn fw_sa_fk_index "${fk_bad}" "ForeignKey 无 index=True（PostgreSQL 不自动建 FK 索引，JOIN/级联删除全表扫）" "外键列均有索引或无外键"

  # ====================================================================
  # fw_sa_alembic(warn)：create_all 直连建表须 Alembic 迁移管理
  # ====================================================================
  local has_ca=0 has_alembic=0
  has_ca=$(grep -rlE 'create_all\(' "${srcarr[@]}" 2>/dev/null | head -1 | wc -l | xargs || true)
  if [[ "$has_ca" -eq 0 ]]; then
    pass "fw_sa_alembic: 无 create_all，跳过"
  else
    local f
    for f in "${srcarr[@]}"; do
      case "$(basename "$f")" in
        env.py)
          grep -qE 'alembic' "$f" 2>/dev/null && has_alembic=1
          ;;
      esac
    done
    if [[ "$has_alembic" -eq 1 ]]; then
      pass "fw_sa_alembic: create_all 与 Alembic 并存（须确认仅测试用）"
    else
      warn "fw_sa_alembic: create_all 直接建表且无 Alembic 迁移（schema 演进不可追溯）"
    fi
  fi

  # ====================================================================
  # fw_sa_pool_size(warn)：连接池大小须按并发显式配置
  # ====================================================================
  local ps_bad=""
  for f in "${srcarr[@]}"; do
    if grep -qE 'create_engine\(|create_async_engine\(' "$f" 2>/dev/null \
       && ! grep -qE 'pool_size|NullPool|StaticPool' "$f" 2>/dev/null; then
      ps_bad="${ps_bad}${f}
"
    fi
  done
  if [[ "$has_engine" -eq 0 ]]; then
    pass "fw_sa_pool_size: 无 create_engine，跳过"
  elif [[ -n "$ps_bad" ]]; then
    warn "fw_sa_pool_size: create_engine 未显式 pool_size/max_overflow（默认 5+10 须按并发核对）:
${ps_bad}"
  else
    pass "fw_sa_pool_size: 连接池大小已显式配置"
  fi

  # ====================================================================
  # fw_sa_text_injection(fail)：text() 禁 f-string/%/+ 拼接 SQL
  # ====================================================================
  local ti_bad=""
  for f in "${srcarr[@]}"; do
    local ln
    ln=$(_fw_strip_comments_hash "$f" | grep -nE 'text\(f["'"'"']|text\([^)]*%[[:space:]]|text\([^)]*\+[[:space:]]*[a-zA-Z_]' 2>/dev/null || true)
    [[ -n "$ln" ]] && ti_bad="${ti_bad}${f}:${ln}
"
  done
  _fw_report fail fw_sa_text_injection "${ti_bad}" "text() 拼接 SQL（SQL 注入，CWE-89；须 :param 绑定参数）" "无拼接式 text() SQL"

  # ====================================================================
  # fw_sa_string_length(warn)：String 列须指定长度（MySQL 强制）
  # ====================================================================
  local sl_bad=""
  for f in "${srcarr[@]}"; do
    local ln
    ln=$(_fw_strip_comments_hash "$f" | grep -nE 'Column\([^\n]*\bString\b\)|String[[:space:]]*,' 2>/dev/null || true)
    [[ -n "$ln" ]] && sl_bad="${sl_bad}${f}:${ln}
"
  done
  _fw_report warn fw_sa_string_length "${sl_bad}" "String 无长度（MySQL 建表报错；跨方言不可移植，须 String(n)）" "String 列均带长度"

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
