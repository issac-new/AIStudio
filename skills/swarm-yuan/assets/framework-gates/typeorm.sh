# ruleset: typeorm  requires_conf: TYPEORM_SRC_GLOBS
# gates: fw_typeorm_synchronize_prod(fail) fw_typeorm_eager_n1(warn) fw_typeorm_transaction_runner(warn) fw_typeorm_transaction_decorator(warn) fw_typeorm_lazy_relation(warn) fw_typeorm_fk_index(warn) fw_typeorm_pagination_offset(warn) fw_typeorm_soft_delete(warn) fw_typeorm_audit_columns(warn) fw_typeorm_pool(warn) fw_typeorm_qb_injection(fail)
# harvested-from: P4 调研（2026-07-17），规律源自 TypeORM 0.3.x 官方文档与 releases（https://github.com/typeorm/typeorm/releases）
_fw_typeorm_check() {
  echo "  [typeorm] TypeORM 0.3.x / 1.x 框架规律"

  # ---------- 收集源文件清单（ts/js 统一入 srcarr） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${TYPEORM_SRC_GLOBS[@]+"${TYPEORM_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "typeorm: TYPEORM_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # 仅保留 ts/js 源码
  local tsarr=()
  local f
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      *.ts|*.js) tsarr+=("$f") ;;
    esac
  done

  if [[ ${#tsarr[@]} -eq 0 ]]; then
    warn "typeorm: 无 ts/js 源码可检"
    return
  fi

  # ====================================================================
  # fw_typeorm_synchronize_prod(fail)：synchronize 生产禁用
  # ====================================================================
  local sync_bad=""
  for f in "${tsarr[@]}"; do
    local ln
    ln=$(grep -nE 'synchronize[[:space:]]*:[[:space:]]*true' "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && sync_bad="${sync_bad}${f}:${ln}
"
  done
  _fw_report fail fw_typeorm_synchronize_prod "${sync_bad}" "synchronize: true（启动按实体自动改表，生产删列丢数据 CWE-672；须 false + 迁移驱动）" "synchronize 未开启字面量 true"

  # ====================================================================
  # fw_typeorm_eager_n1(warn)：关联 eager: true
  # ====================================================================
  local eager_bad=""
  for f in "${tsarr[@]}"; do
    local ln
    ln=$(grep -nE 'eager[[:space:]]*:[[:space:]]*true' "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && eager_bad="${eager_bad}${f}:${ln}
"
  done
  _fw_report warn fw_typeorm_eager_n1 "${eager_bad}" "关联 eager: true（每次 find 隐式 JOIN，多层 eager 笛卡尔放大/N+1；须改显式 relations/leftJoinAndSelect）" "无 eager 关联"

  # ====================================================================
  # fw_typeorm_transaction_runner(warn)：事务内禁混用全局 manager/getRepository
  # ====================================================================
  local tx_bad=""
  for f in "${tsarr[@]}"; do
    if ! grep -qE '\.transaction\(|startTransaction' "$f" 2>/dev/null; then
      continue
    fi
    local ln
    ln=$(grep -nE 'getRepository\(|dataSource\.manager\.' "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && tx_bad="${tx_bad}${f}:${ln}
"
  done
  _fw_report warn fw_typeorm_transaction_runner "${tx_bad}" "事务文件内检出 getRepository/dataSource.manager（混用全局连接绕过事务，写入不参与回滚；须用回调注入的 manager/queryRunner.manager）" "事务内未混用全局连接或无事务"

  # ====================================================================
  # fw_typeorm_transaction_decorator(warn)：@Transaction 装饰器已废弃
  # ====================================================================
  local td_bad=""
  for f in "${tsarr[@]}"; do
    local ln
    ln=$(grep -nE '@Transaction\(|@TransactionManager|@TransactionRepository' "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && td_bad="${td_bad}${f}:${ln}
"
  done
  _fw_report warn fw_typeorm_transaction_decorator "${td_bad}" "@Transaction 系列装饰器 0.3.x 已废弃（v1 预期移除，待验证；须改 dataSource.transaction() 显式回调）" "无废弃事务装饰器"

  # ====================================================================
  # fw_typeorm_lazy_relation(warn)：懒加载关联 Promise<T>
  # ====================================================================
  local lazy_bad=""
  for f in "${tsarr[@]}"; do
    if ! grep -qE '@(ManyToOne|OneToMany|OneToOne|ManyToMany)\(' "$f" 2>/dev/null; then
      continue
    fi
    local ln
    ln=$(grep -nE ':[[:space:]]*Promise<' "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && lazy_bad="${lazy_bad}${f}:${ln}
"
  done
  _fw_report warn fw_typeorm_lazy_relation "${lazy_bad}" "懒加载关联（Promise<T>）序列化为 {} 静默丢字段，且访问须 await（HTTP 层直接返回实体须改 eager 显式 relations）" "无懒加载关联"

  # ====================================================================
  # fw_typeorm_fk_index(warn)：@ManyToOne 外键须 @Index
  # ====================================================================
  local idx_bad=""
  for f in "${tsarr[@]}"; do
    if ! grep -qE '@ManyToOne\(' "$f" 2>/dev/null; then
      continue
    fi
    if ! grep -qE '@Index' "$f" 2>/dev/null; then
      idx_bad="${idx_bad}${f}
"
    fi
  done
  _fw_report warn fw_typeorm_fk_index "${idx_bad}" "实体含 @ManyToOne 但无 @Index（外键反查全表扫描；高频反查列须显式索引）" "关联实体均含索引或无 @ManyToOne"

  # ====================================================================
  # fw_typeorm_pagination_offset(warn)：offset/limit 禁配 JOIN 分页
  # ====================================================================
  local pg_bad=""
  for f in "${tsarr[@]}"; do
    if ! grep -qE '\.offset\(|\.limit\(' "$f" 2>/dev/null; then
      continue
    fi
    if grep -qE 'leftJoin|innerJoin' "$f" 2>/dev/null; then
      pg_bad="${pg_bad}${f}
"
    fi
  done
  _fw_report warn fw_typeorm_pagination_offset "${pg_bad}" ".offset/.limit 配 JOIN 分页（行级截断切碎一对多实体，数据缺漏重复；须 take/skip 或 findAndCount）" "无 JOIN+offset/limit 混用"

  # ====================================================================
  # fw_typeorm_soft_delete(warn)：@DeleteDateColumn 后禁物理 .delete()
  # ====================================================================
  local has_sdc=0
  for f in "${tsarr[@]}"; do
    if grep -qE '@DeleteDateColumn' "$f" 2>/dev/null; then
      has_sdc=1
      break
    fi
  done
  if [[ "$has_sdc" -eq 0 ]]; then
    pass "fw_typeorm_soft_delete: 无软删除实体，跳过"
  else
    local sd_bad=""
    for f in "${tsarr[@]}"; do
      local ln
      ln=$(grep -nE '\.delete\(' "$f" 2>/dev/null || true)
      [[ -n "$ln" ]] && sd_bad="${sd_bad}${f}:${ln}
"
    done
    _fw_report warn fw_typeorm_soft_delete "${sd_bad}" "存在 @DeleteDateColumn 软删除实体但检出 .delete( 物理删除（审计/恢复失效；须 softDelete/recover）" "软删除实体未混用物理删除"
  fi

  # ====================================================================
  # fw_typeorm_audit_columns(warn)：实体审计字段
  # ====================================================================
  local ac_bad=""
  for f in "${tsarr[@]}"; do
    if ! grep -qE '@Entity\(' "$f" 2>/dev/null; then
      continue
    fi
    if ! grep -qE '@CreateDateColumn|@UpdateDateColumn' "$f" 2>/dev/null; then
      ac_bad="${ac_bad}${f}
"
    fi
  done
  _fw_report warn fw_typeorm_audit_columns "${ac_bad}" "实体无 @CreateDateColumn/@UpdateDateColumn 审计字段（追溯无据；勿应用层手填 new Date()）" "实体均含审计字段或无实体"

  # ====================================================================
  # fw_typeorm_pool(warn)：连接池显式配置
  # ====================================================================
  local ds_hit=0 pool_ok=0
  for f in "${tsarr[@]}"; do
    if grep -qE 'new DataSource\(|createConnection\(' "$f" 2>/dev/null; then
      ds_hit=1
      if grep -qE 'poolSize|extra[[:space:]]*:' "$f" 2>/dev/null; then
        pool_ok=1
      fi
    fi
  done
  if [[ "$ds_hit" -eq 0 ]]; then
    pass "fw_typeorm_pool: 未定位 DataSource 配置，跳过"
  elif [[ "$pool_ok" -eq 1 ]]; then
    pass "fw_typeorm_pool: 连接池已显式配置"
  else
    warn "fw_typeorm_pool: DataSource 未配 poolSize/extra（默认池不适配生产并发；实例数×poolSize 须 ≤ 库 max_connections）"
  fi

  # ====================================================================
  # fw_typeorm_qb_injection(fail)：where 模板插值/拼接 → SQL 注入
  # ====================================================================
  local inj_bad=""
  for f in "${tsarr[@]}"; do
    local ln
    # R119：JS/TS 的 ${} 插值只发生在模板字面量（反引号）里；双引号/单引号里的 ${}
    # 是普通文本。只认紧跟在 where( 后的反引号首参，避免把第二参参数对象里的模板值
    # （如 .andWhere('x LIKE :kw', { kw: `%${q}%` })）误报为注入（nest-forge 实证）。
    ln=$(grep -nE '\.(where|orWhere|andWhere)\([[:space:]]*`[^`]*\$\{' "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && inj_bad="${inj_bad}${f}:${ln}
"
  done
  _fw_report fail fw_typeorm_qb_injection "${inj_bad}" "QueryBuilder where 首参模板插值 \${}（SQL 注入 CWE-89；须参数绑定 .where('x = :v', { v })）" "where 条件无模板插值"

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
