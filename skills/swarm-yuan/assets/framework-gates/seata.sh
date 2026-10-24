# ruleset: seata  requires_conf: SEATA_SRC_GLOBS
# gates: fw_seata_local_tx_mixed(fail) fw_seata_tcc_fence(fail) fw_seata_tcc_method_explicit(warn) fw_seata_undo_log(warn) fw_seata_global_timeout(warn) fw_seata_dirty_write(warn) fw_seata_global_lock(warn) fw_seata_branch_register(warn) fw_seata_saga_compensation(warn) fw_seata_xa_proxy(warn) fw_seata_at_datasource_proxy(warn) fw_seata_tm_rm_register(warn)
# harvested-from: P3 调研（2026-07-17），规律源自 Apache Seata 2.x 官方文档
_fw_seata_check() {
  echo "  [seata] Apache Seata 2.x 框架规律"

  # ---------- 收集源文件清单（Java + 配置文件 + SQL/json 统一入 srcarr） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${SEATA_SRC_GLOBS[@]+"${SEATA_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "seata: SEATA_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # 拆分 Java / 配置 / SQL / json
  local javaarr=() cfgarr=() sqlarr=() jsonarr=()
  local f
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      *.java) javaarr+=("$f") ;;
      *.sql) sqlarr+=("$f") ;;
      *.json) jsonarr+=("$f") ;;
      *.yml|*.yaml|*.properties|*.conf|*.xml|build.gradle|*.gradle|*.gradle.kts) cfgarr+=("$f") ;;
    esac
  done

  local has_global=0 has_seata_cfg=0
  local gt_files
  gt_files=$(grep -rlE '@GlobalTransactional\b' "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null || true)
  [[ -n "$gt_files" ]] && has_global=1
  local c ln j
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if grep -qE 'seata\.|seata-spring-boot-starter|io\.seata|org\.apache\.seata' "$c" 2>/dev/null; then
      has_seata_cfg=1
      break
    fi
  done

  # ====================================================================
  # fw_seata_local_tx_mixed(fail)：全局事务与本地事务同边界混用
  # ====================================================================
  local mix_bad=""
  if [[ -n "$gt_files" ]]; then
    while IFS= read -r gf; do
      [[ -z "$gf" ]] && continue
      # 过滤注释（行注释/块注释行），避免 javadoc 中提及 @Transactional 造成假阳性
      if sed -E 's://.*$::; /^[[:space:]]*\*/d; /^[[:space:]]*\/\*/d' "$gf" 2>/dev/null | grep -qE '@Transactional\b'; then
        mix_bad="${mix_bad}${gf}
"
      fi
    done <<< "$gt_files"
  fi
  _fw_report fail fw_seata_local_tx_mixed "${mix_bad}" "同文件检出 @GlobalTransactional + @Transactional（本地先提交全局回滚覆盖不了，数据不一致，须拆边界）" "未检出全局/本地事务混用"

  # ====================================================================
  # fw_seata_tcc_fence(fail)：TCC 须开启 TCC Fence
  # ====================================================================
  local tcc_files fence_bad="" has_tcc=0
  tcc_files=$(grep -rlE '@TwoPhaseBusinessAction\b' "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null || true)
  [[ -n "$tcc_files" ]] && has_tcc=1
  if [[ -n "$tcc_files" ]]; then
    while IFS= read -r tf; do
      [[ -z "$tf" ]] && continue
      ln=$(grep -nE '@TwoPhaseBusinessAction\b' "$tf" 2>/dev/null | grep -vE 'useTCCFence[[:space:]]*=[[:space:]]*true' || true)
      [[ -n "$ln" ]] && fence_bad="${fence_bad}${tf}:${ln}
"
    done <<< "$tcc_files"
  fi
  _fw_report fail fw_seata_tcc_fence "${fence_bad}" "@TwoPhaseBusinessAction 未开启 useTCCFence=true（空回滚/幂等/悬挂三坑无防护，生产必须开启）" "TCC 均开启 fence 或无 TCC"

  # ====================================================================
  # fw_seata_tcc_method_explicit(warn)：commit/rollback 方法名显式声明
  # ====================================================================
  local tm_bad=""
  if [[ -n "$tcc_files" ]]; then
    while IFS= read -r tf; do
      [[ -z "$tf" ]] && continue
      ln=$(grep -nE '@TwoPhaseBusinessAction\b' "$tf" 2>/dev/null | grep -vE 'commitMethod|rollbackMethod' || true)
      [[ -n "$ln" ]] && tm_bad="${tm_bad}${tf}:${ln}
"
    done <<< "$tcc_files"
  fi
  _fw_report warn fw_seata_tcc_method_explicit "${tm_bad}" "@TwoPhaseBusinessAction 未显式 commitMethod/rollbackMethod（重构改名致二阶段 NoSuchMethodError）" "TCC 方法名显式声明或无 TCC"

  # ====================================================================
  # fw_seata_undo_log(warn)：AT 模式须建 undo_log 表
  # ====================================================================
  if [[ "$has_global" -eq 0 && "$has_tcc" -eq 1 ]]; then
    pass "fw_seata_undo_log: 仅 TCC 模式，无需 undo_log"
  elif [[ "$has_global" -eq 0 ]]; then
    pass "fw_seata_undo_log: 无全局事务，跳过"
  else
    local undo_hit=0
    for f in "${sqlarr[@]+"${sqlarr[@]}"}"; do
      if grep -qE 'undo_log' "$f" 2>/dev/null; then
        undo_hit=1
        break
      fi
    done
    # 兼容 undo_log 脚本散在配置/文本文件
    if [[ "$undo_hit" -eq 0 ]]; then
      for f in "${srcarr[@]}"; do
        case "$(basename "$f")" in
          *undo*) undo_hit=1; break ;;
        esac
      done
    fi
    if [[ "$undo_hit" -eq 1 ]]; then
      pass "fw_seata_undo_log: 检出 undo_log 建表脚本"
    else
      warn "fw_seata_undo_log: 有全局事务（AT）但工程无 undo_log 建表 SQL（分支提交插 undo_log 失败，须按所用版本官方 script 建表）"
    fi
  fi

  # ====================================================================
  # fw_seata_global_timeout(warn)：@GlobalTransactional 须显式 timeoutMills
  # ====================================================================
  local to_bad=""
  if [[ -n "$gt_files" ]]; then
    while IFS= read -r gf; do
      [[ -z "$gf" ]] && continue
      ln=$(grep -nE '@GlobalTransactional\b' "$gf" 2>/dev/null | grep -vE 'timeoutMills' || true)
      [[ -n "$ln" ]] && to_bad="${to_bad}${gf}:${ln}
"
    done <<< "$gt_files"
  fi
  _fw_report warn fw_seata_global_timeout "${to_bad}" "@GlobalTransactional 未显式 timeoutMills（默认 60s，长事务占全局锁阻塞，须按业务显式）" "全局事务超时显式配置或无全局事务"

  # ====================================================================
  # fw_seata_dirty_write(warn)：事务外写操作须 @GlobalLock
  # ====================================================================
  if [[ "$has_global" -eq 0 ]]; then
    pass "fw_seata_dirty_write: 无全局事务，跳过"
  else
    local dw_bad=""
    for j in "${javaarr[@]+"${javaarr[@]}"}"; do
      # 含写 SQL（注解或字符串）
      if ! grep -qE '@(Update|Delete|Insert)\b|update[[:space:]]+[a-zA-Z_]+[[:space:]]+set|delete[[:space:]]+from' "$j" 2>/dev/null; then
        continue
      fi
      if grep -qE '@GlobalTransactional\b|@GlobalLock\b' "$j" 2>/dev/null; then
        continue
      fi
      dw_bad="${dw_bad}${j}
"
    done
    _fw_report warn fw_seata_dirty_write "${dw_bad}" "全局事务外检出写 SQL 类（无 @GlobalLock 则绕过全局锁脏写，须 @GlobalLock + FOR UPDATE）" "写操作均在全局事务/全局锁内"
  fi

  # ====================================================================
  # fw_seata_global_lock(warn)：@GlobalLock 须配 FOR UPDATE
  # ====================================================================
  local gl_files gl_bad=""
  gl_files=$(grep -rlE '@GlobalLock\b' "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null || true)
  if [[ -z "$gl_files" ]]; then
    pass "fw_seata_global_lock: 无 @GlobalLock，跳过"
  else
    while IFS= read -r gf; do
      [[ -z "$gf" ]] && continue
      if ! grep -qiE 'for[[:space:]]+update' "$gf" 2>/dev/null; then
        gl_bad="${gl_bad}${gf}
"
      fi
    done <<< "$gl_files"
    _fw_report warn fw_seata_global_lock "${gl_bad}" "@GlobalLock 同文件无 FOR UPDATE 查询（注解本身不抢锁，须 SELECT ... FOR UPDATE 触发全局锁）" "@GlobalLock 均配 FOR UPDATE"
  fi

  # ====================================================================
  # fw_seata_branch_register(warn)：跨服务调用 XID 透传
  # ====================================================================
  if [[ "$has_global" -eq 0 ]]; then
    pass "fw_seata_branch_register: 无全局事务，跳过"
  else
    local br_bad=""
    for j in "${javaarr[@]+"${javaarr[@]}"}"; do
      if ! grep -qE 'RestTemplate|WebClient|@FeignClient|@DubboReference|HttpClient' "$j" 2>/dev/null; then
        continue
      fi
      if ! grep -qE '@GlobalTransactional\b' "$j" 2>/dev/null; then
        continue
      fi
      if ! grep -qE 'RootContext\.(getXID|bind)' "$j" 2>/dev/null; then
        br_bad="${br_bad}${j}
"
      fi
    done
    _fw_report warn fw_seata_branch_register "${br_bad}" "全局事务内检出远程调用且无 RootContext 绑定迹象（须确认集成模块自动透传 XID，裸调用须手工绑定）" "未见裸远程调用或已有 XID 绑定"
  fi

  # ====================================================================
  # fw_seata_saga_compensation(warn)：Saga 状态机须补偿节点
  # ====================================================================
  local saga_files saga_bad=""
  for f in "${jsonarr[@]+"${jsonarr[@]}"}"; do
    if grep -qE '"ServiceTask"|"StateName"' "$f" 2>/dev/null; then
      saga_files="${saga_files}${f}
"
      if ! grep -qE 'Compensate|compensate' "$f" 2>/dev/null; then
        saga_bad="${saga_bad}${f}
"
      fi
    fi
  done
  # java 端状态机 builder
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    if grep -qE 'StateMachineBuilder|SagaStateMachine' "$j" 2>/dev/null; then
      saga_files="${saga_files}${j}
"
      if ! grep -qE 'Compensat' "$j" 2>/dev/null; then
        saga_bad="${saga_bad}${j}
"
      fi
    fi
  done
  _fw_report warn fw_seata_saga_compensation "${saga_bad}" "Saga 状态机无补偿节点（部分步骤失败无法回退，补偿须幂等）" "无 Saga 状态机或已配补偿"

  # ====================================================================
  # fw_seata_xa_proxy(warn)：XA 模式须全量数据源代理
  # ====================================================================
  local xa_hit=""
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    ln=$(grep -nE 'data-source-proxy-mode[[:space:]]*[:=][[:space:]]*XA' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && xa_hit="${xa_hit}${c}:${ln}
"
  done
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    ln=$(grep -nE 'DataSourceProxyXA' "$j" 2>/dev/null || true)
    [[ -n "$ln" ]] && xa_hit="${xa_hit}${j}:${ln}
"
  done
  _fw_report warn fw_seata_xa_proxy "${xa_hit}" "检出 XA 模式代理（须全量数据源统一代理，混合代理破坏隔离）" "未检出 XA 模式"

  # ====================================================================
  # fw_seata_at_datasource_proxy(warn)：AT 自动代理禁止关闭
  # ====================================================================
  local adp_bad=""
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    ln=$(grep -nE 'enable-auto-data-source-proxy[[:space:]]*[:=][[:space:]]*false' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && adp_bad="${adp_bad}${c}:${ln}
"
  done
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    ln=$(grep -nE 'new[[:space:]]+DataSourceProxy\b' "$j" 2>/dev/null || true)
    [[ -n "$ln" ]] && adp_bad="${adp_bad}${j}:${ln}
"
  done
  _fw_report warn fw_seata_at_datasource_proxy "${adp_bad}" "检出关闭自动代理/手工 DataSourceProxy（AT 静默失效风险，须确认代理链路完整）" "未检出代理关闭/手工代理"

  # ====================================================================
  # fw_seata_tm_rm_register(warn)：tx-service-group 与 vgroup-mapping
  # ====================================================================
  if [[ "$has_global" -eq 0 && "$has_seata_cfg" -eq 0 && "$has_tcc" -eq 0 ]]; then
    pass "fw_seata_tm_rm_register: 无 seata 使用痕迹，跳过"
  else
    local grp_hit=0 map_hit=0
    for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
      if grep -qE 'tx-service-group|tx_service_group' "$c" 2>/dev/null; then
        grp_hit=1
      fi
      if grep -qE 'vgroup-mapping|vgroup_mapping|vgroupMapping' "$c" 2>/dev/null; then
        map_hit=1
      fi
    done
    if [[ "$grp_hit" -eq 1 && "$map_hit" -eq 1 ]]; then
      pass "fw_seata_tm_rm_register: tx-service-group 与 vgroup-mapping 均已配置"
    else
      warn "fw_seata_tm_rm_register: tx-service-group(group=${grp_hit}) 或 vgroup-mapping(map=${map_hit}) 缺失（TM/RM 注册失败 no available service）"
    fi
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
