# ruleset: spring-data-jpa  requires_conf: SPRINGJPA_SRC_GLOBS
# gates: fw_jpa_nplus1(warn) fw_jpa_eager_to_many(warn) fw_jpa_osiv(warn) fw_jpa_readonly(warn) fw_jpa_auditing(warn) fw_jpa_pessimistic_lock(warn) fw_jpa_optimistic_lock(warn) fw_jpa_save_merge(warn) fw_jpa_lazy_exception(warn) fw_jpa_modifying(warn) fw_jpa_equals_hashcode(warn) fw_jpa_enum_ordinal(fail) fw_jpa_pagination(warn) fw_jpa_jpql_entity(warn)
# harvested-from: P2（2026-07-17），规律源自 Spring Data JPA 3.4/4.x + Hibernate ORM 6.6/7.x 官方文档
_fw_spring_data_jpa_check() {
  echo "  [spring-data-jpa] Spring Data JPA 3.4.x / 4.x + Hibernate 6.6/7.x 框架规律"

  # ---------- 收集源文件清单（Java + 配置/构建文件统一入 srcarr） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${SPRINGJPA_SRC_GLOBS[@]+"${SPRINGJPA_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "spring-data-jpa: SPRINGJPA_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # 拆分 Java 文件 vs 配置/构建文件
  local javaarr=() cfgarr=()
  local f j c
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      *.java) javaarr+=("$f") ;;
      *.yml|*.yaml|*.properties|pom.xml|build.gradle|*.gradle|*.gradle.kts) cfgarr+=("$f") ;;
    esac
  done

  # 公用信号：to-many 关联 / JPA 项目判定
  local has_tomany=0 has_jpa=0
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    grep -lqE '@(OneToMany|ManyToMany)' "${javaarr[@]}" 2>/dev/null && has_tomany=1
    grep -lqE '@Entity\b|extends (JpaRepository|CrudRepository|PagingAndSortingRepository)<' "${javaarr[@]}" 2>/dev/null && has_jpa=1
  fi

  # ====================================================================
  # fw_jpa_nplus1(warn)：to-many 须 @EntityGraph/JOIN FETCH/@BatchSize
  # ====================================================================
  if [[ "$has_tomany" -eq 0 ]]; then
    pass "fw_jpa_nplus1: 无 to-many 关联，跳过"
  else
    local n1_fix=0
    grep -lqE '@EntityGraph|join fetch|JOIN FETCH|@BatchSize' "${javaarr[@]}" 2>/dev/null && n1_fix=1
    for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
      grep -qE 'batch_size|default_batch_fetch_size' "$c" 2>/dev/null && n1_fix=1
    done
    if [[ "$n1_fix" -eq 1 ]]; then
      pass "fw_jpa_nplus1: to-many 关联已配 @EntityGraph/JOIN FETCH/batch_size"
    else
      warn "fw_jpa_nplus1: 检出 to-many 关联但无 @EntityGraph/JOIN FETCH/@BatchSize/batch_size（列表场景 N+1 查询风暴）"
    fi
  fi

  # ====================================================================
  # fw_jpa_eager_to_many(warn)：to-many 禁止 FetchType.EAGER
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local eager_hits
    eager_hits=$(grep -rnE '@(OneToMany|ManyToMany)\([^)]*FetchType\.EAGER' "${javaarr[@]}" 2>/dev/null || true)
    _fw_report warn fw_jpa_eager_to_many "${eager_hits}" "检出 to-many FetchType.EAGER（笛卡尔积爆炸/MultipleBagFetchException，应保持默认 LAZY）" "无 to-many EAGER"
  else
    pass "fw_jpa_eager_to_many: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_jpa_osiv(warn)：open-in-view 反模式
  # ====================================================================
  local osiv_state="absent"
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if grep -qE 'open-in-view[[:space:]]*[:=][[:space:]]*false' "$c" 2>/dev/null; then
      osiv_state="false"
      break
    fi
    if grep -qE 'open-in-view[[:space:]]*[:=][[:space:]]*true' "$c" 2>/dev/null; then
      osiv_state="true"
    fi
  done
  if [[ "$osiv_state" == "false" ]]; then
    pass "fw_jpa_osiv: open-in-view 已显式 false"
  elif [[ "$osiv_state" == "true" ]]; then
    warn "fw_jpa_osiv: open-in-view=true（OSIV 反模式：序列化期隐式 SQL + 连接占用整个请求，生产须 false）"
  elif [[ "$has_jpa" -eq 1 ]]; then
    warn "fw_jpa_osiv: JPA 项目未显式配置 open-in-view（Boot 默认 true，生产须显式 false）"
  else
    pass "fw_jpa_osiv: 无 JPA 信号，跳过"
  fi

  # ====================================================================
  # fw_jpa_readonly(warn)：查询方法须 readOnly=true
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local ro_bad=""
    for j in "${javaarr[@]}"; do
      grep -qE '@Transactional\b' "$j" 2>/dev/null || continue
      grep -qE 'readOnly' "$j" 2>/dev/null && continue
      if grep -qE '(find|get|list|query|search|count)[A-Z][A-Za-z0-9_]*\(' "$j" 2>/dev/null; then
        ro_bad="${ro_bad}${j}
"
      fi
    done
    _fw_report warn fw_jpa_readonly "${ro_bad}" "@Transactional 查询方法未 readOnly=true（脏检查快照浪费内存，读写分离误路由）" "查询方法 readOnly 配置合理或无 @Transactional"
  else
    pass "fw_jpa_readonly: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_jpa_auditing(warn)：审计字段须 @EnableJpaAuditing
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local has_audit=0 has_enable_audit=0
    grep -lqE '@(CreatedDate|LastModifiedDate|CreatedBy|LastModifiedBy)' "${javaarr[@]}" 2>/dev/null && has_audit=1
    grep -lqE '@EnableJpaAuditing' "${javaarr[@]}" 2>/dev/null && has_enable_audit=1
    if [[ "$has_audit" -eq 1 && "$has_enable_audit" -eq 0 ]]; then
      warn "fw_jpa_auditing: 检出审计注解（@CreatedDate 等）但无 @EnableJpaAuditing（审计字段永远 null，静默失效）"
    else
      pass "fw_jpa_auditing: 审计配置完整或无审计字段"
    fi
  else
    pass "fw_jpa_auditing: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_jpa_pessimistic_lock(warn)：PESSIMISTIC_WRITE 须锁超时
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local pl_bad=""
    for j in "${javaarr[@]}"; do
      if grep -qE '@Lock\([^)]*PESSIMISTIC' "$j" 2>/dev/null; then
        if ! grep -qE 'lock\.timeout|@QueryHints' "$j" 2>/dev/null; then
          pl_bad="${pl_bad}${j}
"
        fi
      fi
    done
    _fw_report warn fw_jpa_pessimistic_lock "${pl_bad}" "@Lock(PESSIMISTIC_WRITE) 无 lock.timeout/@QueryHints（并发下死锁/锁堆积；且须在 @Transactional 内）" "悲观锁配置合理或无悲观锁"
  else
    pass "fw_jpa_pessimistic_lock: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_jpa_optimistic_lock(warn)：@Version 须冲突异常处理
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local has_version=0 has_ol_handle=0
    grep -lqE '@Version\b' "${javaarr[@]}" 2>/dev/null && has_version=1
    grep -lqE 'OptimisticLock' "${javaarr[@]}" 2>/dev/null && has_ol_handle=1
    if [[ "$has_version" -eq 1 && "$has_ol_handle" -eq 0 ]]; then
      warn "fw_jpa_optimistic_lock: 检出 @Version 但无 ObjectOptimisticLockingFailureException/OptimisticLockException 处理（并发冲突 500 直达用户）"
    else
      pass "fw_jpa_optimistic_lock: 乐观锁冲突处理齐备或无 @Version"
    fi
  else
    pass "fw_jpa_optimistic_lock: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_jpa_save_merge(warn)：.setId( 与 .save( 并存 → detached merge 误用
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local sm_bad=""
    for j in "${javaarr[@]}"; do
      if grep -qE '\.setId\(' "$j" 2>/dev/null && grep -qE '\.save\(' "$j" 2>/dev/null; then
        sm_bad="${sm_bad}${j}
"
      fi
    done
    _fw_report warn fw_jpa_save_merge "${sm_bad}" "同文件 .setId( 与 .save( 并存（detached 实体 save=merge 全字段覆盖，部分更新须先 findById 改托管实体）" "未检出 setId+save 并存"
  else
    pass "fw_jpa_save_merge: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_jpa_lazy_exception(warn)：OSIV 关闭 + 无事务边界 → LazyInitializationException
  # ====================================================================
  if [[ "$has_tomany" -eq 1 && "$osiv_state" == "false" ]]; then
    local has_tx=0
    grep -lqE '@Transactional\b' "${javaarr[@]}" 2>/dev/null && has_tx=1
    if [[ "$has_tx" -eq 0 ]]; then
      warn "fw_jpa_lazy_exception: to-many LAZY + open-in-view=false + 全项目无 @Transactional（事务外访问懒加载关联将抛 LazyInitializationException）"
    else
      pass "fw_jpa_lazy_exception: 懒加载访问有事务边界"
    fi
  else
    pass "fw_jpa_lazy_exception: 无 to-many/OSIV 关闭组合，跳过"
  fi

  # ====================================================================
  # fw_jpa_modifying(warn)：@Modifying 须 clearAutomatically/flushAutomatically
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local mod_bad=""
    for j in "${javaarr[@]}"; do
      if grep -qE '@Modifying' "$j" 2>/dev/null; then
        if ! grep -qE 'clearAutomatically|flushAutomatically' "$j" 2>/dev/null; then
          mod_bad="${mod_bad}${j}
"
        fi
      fi
    done
    _fw_report warn fw_jpa_modifying "${mod_bad}" "@Modifying 无 clearAutomatically/flushAutomatically（批量更新绕过持久化上下文，一级缓存读到旧值）" "@Modifying 配置合理或无批量更新"
  else
    pass "fw_jpa_modifying: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_jpa_equals_hashcode(warn)：@Entity + lombok @Data/@EqualsAndHashCode 全字段
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local eh_bad=""
    for j in "${javaarr[@]}"; do
      grep -qE '@Entity\b' "$j" 2>/dev/null || continue
      if grep -qE '@Data\b|@EqualsAndHashCode\b' "$j" 2>/dev/null; then
        if ! grep -qE 'exclude|onlyExplicitlyIncluded' "$j" 2>/dev/null; then
          eh_bad="${eh_bad}${j}
"
        fi
      fi
    done
    _fw_report warn fw_jpa_equals_hashcode "${eh_bad}" "@Entity 用 @Data/@EqualsAndHashCode 全字段（懒加载关联进 equals/toString → N+1/栈溢出/hashCode 不稳定，须业务键）" "实体 equals/hashCode 策略合理"
  else
    pass "fw_jpa_equals_hashcode: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_jpa_enum_ordinal(fail)：@Enumerated 必须 EnumType.STRING
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local enum_hits
    enum_hits=$(grep -rnE '@Enumerated' "${javaarr[@]}" 2>/dev/null | grep -v 'EnumType\.STRING' || true)
    _fw_report fail fw_jpa_enum_ordinal "${enum_hits}" "@Enumerated 未显式 EnumType.STRING（默认 ORDINAL 存序号，枚举重排即全表数据错位）" "@Enumerated 均 EnumType.STRING 或无枚举映射"
  else
    pass "fw_jpa_enum_ordinal: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_jpa_pagination(warn)：List 返回的派生查询须 Pageable
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local pg_hits=""
    for j in "${javaarr[@]}"; do
      grep -qE 'Repository' "$j" 2>/dev/null || continue
      local ln
      ln=$(grep -nE 'List<[A-Za-z0-9_., <>]+>[[:space:]]+(find|get|query|list|search)[A-Za-z0-9_]*\(' "$j" 2>/dev/null | grep -v 'Pageable' || true)
      [[ -n "$ln" ]] && pg_hits="${pg_hits}${j}:${ln}
"
    done
    _fw_report warn fw_jpa_pagination "${pg_hits}" "Repository 派生查询返回 List 且无 Pageable（数据量增长即全量加载 OOM，须 Page/Slice + Pageable）" "派生查询均分页或无 List 返回"
  else
    pass "fw_jpa_pagination: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_jpa_jpql_entity(warn)：@Query JPQL 实体名字符串校验
  # JPQL "from X"/"join X" 的实体名是对 @Entity 类名的字符串引用——编译不查（容器启动才解析），
  # 实体重命名后 @Query 内旧名静默漂移。X.java 在源码集不存在 → warn。
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local jq_bad="" _ent
    while IFS= read -r jq_line; do
      [[ -z "$jq_line" ]] && continue
      _f=$(printf '%s' "$jq_line" | cut -d: -f1)
      _l=$(printf '%s' "$jq_line" | cut -d: -f2)
      while IFS= read -r _ent; do
        [[ -z "$_ent" ]] && continue
        if ! printf '%s\n' "${javaarr[@]}" | grep -qE "/${_ent}\.java$"; then
          jq_bad="${jq_bad}${_f}:${_l} JPQL 实体 ${_ent} 无对应 ${_ent}.java（改实体名未同步 @Query 字符串？）
"
        fi
      done < <(printf '%s\n' "${jq_line#*:*:}" \
        | grep -oE '(from|FROM|join|JOIN)[[:space:]]+[A-Z][A-Za-z0-9_]*' | awk '{print $2}' | sort -u)
    done < <(grep -rnE '@Query\(' "${javaarr[@]}" 2>/dev/null | grep -E '"[^"]*(from|FROM)[[:space:]]' || true)
    _fw_report warn fw_jpa_jpql_entity "$jq_bad" "JPQL 实体名与源码实体类失配（字符串引用编译不校验，启动期才炸——改实体名必同步 @Query）" "JPQL 实体名均可定位（或无 @Query）"
  else
    pass "fw_jpa_jpql_entity: 无 Java 源文件，跳过"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
