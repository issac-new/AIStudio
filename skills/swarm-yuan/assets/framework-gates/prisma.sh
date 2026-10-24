# ruleset: prisma  requires_conf: PRISMA_SCHEMA_GLOBS PRISMA_SRC_GLOBS
# gates: fw_prisma_migrate_deploy(fail) fw_prisma_transaction_timeout(warn) fw_prisma_n1_loop(warn) fw_prisma_queryraw_injection(fail) fw_prisma_connection_limit(warn) fw_prisma_id_strategy(warn) fw_prisma_relation_cascade(warn) fw_prisma_relation_index(warn) fw_prisma_middleware_removed(warn) fw_prisma_audit_fields(warn) fw_prisma_generator_output(warn) fw_prisma_query_log(warn)
# harvested-from: P4 调研（2026-07-17），规律源自 Prisma 6.x/7.x 官方文档与 releases（https://github.com/prisma/prisma/releases）
_fw_prisma_check() {
  echo "  [prisma] Prisma 6.x / 7.x 框架规律"

  # ---------- 收集 schema 清单（.prisma 入 scarr） ----------
  local scs scarr=()
  scs=$(_fw_resolve_globs ${PRISMA_SCHEMA_GLOBS[@]+"${PRISMA_SCHEMA_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && scarr+=("$ln")
  done <<< "$scs"

  # ---------- 收集源码/部署清单（js/ts/json/Dockerfile/env 入 srcarr） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${PRISMA_SRC_GLOBS[@]+"${PRISMA_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#scarr[@]} -eq 0 && ${#srcarr[@]} -eq 0 ]]; then
    warn "prisma: PRISMA_SCHEMA_GLOBS/PRISMA_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # 拆分 js/ts 源码 vs Dockerfile/脚本
  local jsarr=() deparr=()
  local f
  for f in "${srcarr[@]+"${srcarr[@]}"}"; do
    case "$(basename "$f")" in
      *.js|*.mjs|*.cjs|*.ts) jsarr+=("$f") ;;
      Dockerfile|Dockerfile.*|*.sh) deparr+=("$f") ;;
    esac
  done

  # ====================================================================
  # fw_prisma_migrate_deploy(fail)：生产部署禁止 migrate dev
  # ====================================================================
  local md_bad=""
  for f in "${deparr[@]+"${deparr[@]}"}"; do
    local ln
    ln=$(grep -nE 'prisma migrate dev' "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && md_bad="${md_bad}${f}:${ln}
"
  done
  _fw_report fail fw_prisma_migrate_deploy "$md_bad" "部署脚本检出 prisma migrate dev（交互式/漂移 reset 风险，生产清库隐患 CWE-672；须 migrate deploy）" "部署脚本未检出 migrate dev"

  # ====================================================================
  # fw_prisma_transaction_timeout(warn)：交互式事务显式 timeout
  # ====================================================================
  local tx_bad=""
  for f in "${jsarr[@]+"${jsarr[@]}"}"; do
    if ! grep -qE '\$transaction\([[:space:]]*async' "$f" 2>/dev/null; then
      continue
    fi
    if ! grep -qE 'timeout[[:space:]]*:' "$f" 2>/dev/null; then
      tx_bad="${tx_bad}${f}
"
    fi
  done
  _fw_report warn fw_prisma_transaction_timeout "$tx_bad" "交互式 \$transaction 未显式 timeout/maxWait（默认 5s/2s，长事务高并发大面积 P2028 回滚）" "交互式事务均配 timeout 或无交互式事务"

  # ====================================================================
  # fw_prisma_n1_loop(warn)：循环内 await prisma.* → N+1
  # ====================================================================
  local n1_bad=""
  for f in "${jsarr[@]+"${jsarr[@]}"}"; do
    if grep -qE 'for[[:space:]]*\(' "$f" 2>/dev/null && grep -qE 'await[[:space:]]+(this\.)?prisma\.' "$f" 2>/dev/null; then
      n1_bad="${n1_bad}${f}
"
    fi
  done
  _fw_report warn fw_prisma_n1_loop "$n1_bad" "同文件含 for 循环与 await prisma.*（疑似循环内查询 N+1；须 include/select 单查或 in:ids 批量）" "未检出循环内 prisma 查询"

  # ====================================================================
  # fw_prisma_queryraw_injection(fail)：原始查询注入面
  # ====================================================================
  local inj_bad=""
  for f in "${jsarr[@]+"${jsarr[@]}"}"; do
    local ln
    ln=$(grep -nE '\$(queryRawUnsafe|executeRawUnsafe)' "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && inj_bad="${inj_bad}${f}:${ln}
"
    ln=$(grep -nE '\$(queryRaw|executeRaw)\(' "$f" 2>/dev/null | grep -E '\+' || true)
    [[ -n "$ln" ]] && inj_bad="${inj_bad}${f}:${ln}
"
  done
  _fw_report fail fw_prisma_queryraw_injection "$inj_bad" "原始查询非参数化（\$queryRawUnsafe/字符串拼接 → SQL 注入 CWE-89；须 tagged template \$queryRaw\`...\` 自动参数化）" "原始查询均为 tagged template 或无原始查询"

  # ====================================================================
  # fw_prisma_connection_limit(warn)：连接池 connection_limit
  # ====================================================================
  local cl_hit=0
  for f in "${scarr[@]+"${scarr[@]}"}" "${srcarr[@]+"${srcarr[@]}"}"; do
    if grep -qE 'connection_limit' "$f" 2>/dev/null; then
      cl_hit=1
      break
    fi
  done
  if [[ "$cl_hit" -eq 1 ]]; then
    pass "fw_prisma_connection_limit: connection_limit 已规划"
  else
    warn "fw_prisma_connection_limit: 未检出 connection_limit（实例数×池大小须 ≤ 库 max_connections；serverless 冷启动须 connection_limit=1 或外部池）"
  fi

  # ====================================================================
  # fw_prisma_id_strategy(warn)：对外主键避免 autoincrement
  # ====================================================================
  local id_bad=""
  for f in "${scarr[@]+"${scarr[@]}"}"; do
    local ln
    ln=$(grep -nE 'Int[[:space:]]+@id[[:space:]]+@default\(autoincrement\(\)\)' "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && id_bad="${id_bad}${f}:${ln}
"
  done
  _fw_report warn fw_prisma_id_strategy "$id_bad" "Int autoincrement 主键可枚举（URL 暴露即被遍历 CWE-639；对外资源须 uuid()/cuid()）" "无 autoincrement 主键"

  # ====================================================================
  # fw_prisma_relation_cascade(warn)：@relation 显式 onDelete
  # ====================================================================
  local rc_bad=""
  for f in "${scarr[@]+"${scarr[@]}"}"; do
    local ln
    ln=$(grep -nE '@relation\(' "$f" 2>/dev/null | grep -vE 'onDelete' || true)
    [[ -n "$ln" ]] && rc_bad="${rc_bad}${f}:${ln}
"
  done
  _fw_report warn fw_prisma_relation_cascade "$rc_bad" "@relation 未显式 onDelete（默认 NoAction/Restrict 跨库行为不一；须按业务 Cascade/SetNull/Restrict）" "关联均显式 onDelete 或无关联"

  # ====================================================================
  # fw_prisma_relation_index(warn)：关系标量外键 @@index
  # ====================================================================
  local ri_bad=""
  for f in "${scarr[@]+"${scarr[@]}"}"; do
    if ! grep -qE '@relation\(fields:' "$f" 2>/dev/null; then
      continue
    fi
    if ! grep -qE '@@index' "$f" 2>/dev/null; then
      ri_bad="${ri_bad}${f}
"
    fi
  done
  _fw_report warn fw_prisma_relation_index "$ri_bad" "schema 含关系标量（@relation(fields:)）但无 @@index（Postgres 不自动建 FK 索引，反查全表扫描）" "关系外键均有 @@index 或无关系标量"

  # ====================================================================
  # fw_prisma_middleware_removed(warn)：$use 中间件 v7 已移除
  # ====================================================================
  local mw_bad=""
  for f in "${jsarr[@]+"${jsarr[@]}"}"; do
    local ln
    ln=$(grep -nE '\.\$use\(' "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && mw_bad="${mw_bad}${f}:${ln}
"
  done
  _fw_report warn fw_prisma_middleware_removed "$mw_bad" "检出 prisma.\$use 中间件（Prisma v7 已移除，须改 Client Extensions \$extends 实现软删除/审计）" "未检出 \$use 中间件"

  # ====================================================================
  # fw_prisma_audit_fields(warn)：模型审计字段
  # ====================================================================
  local af_bad=""
  for f in "${scarr[@]+"${scarr[@]}"}"; do
    if ! grep -qE '^model[[:space:]]+[A-Z]' "$f" 2>/dev/null; then
      continue
    fi
    if ! grep -qE 'createdAt|updatedAt' "$f" 2>/dev/null; then
      af_bad="${af_bad}${f}
"
    fi
  done
  _fw_report warn fw_prisma_audit_fields "$af_bad" "模型无 createdAt/updatedAt 审计字段（追溯无据；须 @default(now())/@updatedAt 自动维护）" "模型均含审计字段或无模型"

  # ====================================================================
  # fw_prisma_generator_output(warn)：generator output 必填（v7）
  # ====================================================================
  local go_bad=""
  for f in "${scarr[@]+"${scarr[@]}"}"; do
    if ! grep -qE 'generator[[:space:]]+[a-zA-Z_]+[[:space:]]*\{' "$f" 2>/dev/null; then
      continue
    fi
    if ! grep -qE 'output[[:space:]]*=' "$f" 2>/dev/null; then
      go_bad="${go_bad}${f}
"
    fi
  done
  _fw_report warn fw_prisma_generator_output "$go_bad" "generator 块无 output（Prisma v7 必填，client 不再默认生成进 node_modules；import 路径须指向自定义输出）" "generator output 已配置"

  # ====================================================================
  # fw_prisma_query_log(warn)：生产禁 log: ['query']
  # ====================================================================
  local ql_bad=""
  for f in "${jsarr[@]+"${jsarr[@]}"}"; do
    local ln
    ln=$(grep -nE "log[[:space:]]*:[[:space:]]*\[[^]]*['\"]query['\"]" "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && ql_bad="${ql_bad}${f}:${ln}
"
  done
  _fw_report warn fw_prisma_query_log "$ql_bad" "log: ['query'] 全量查询日志（生产泄露查询敏感值 CWE-532 + 日志爆炸；须 ['warn','error'] 或事件采样）" "无 query 级日志配置"

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
