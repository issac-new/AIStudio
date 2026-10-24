# ruleset: mybatis  requires_conf: MYBATIS_MAPPER_DIRS MYBATIS_SRC_GLOBS SQL_INJECTION_WHITELIST
# gates: fw_mybatis_dollar(fail) fw_mybatis_binding(fail) fw_mybatis_foreach(warn) fw_mybatis_plus_page(warn) fw_mybatis_plus_dbtype(warn) fw_mybatis_nplus1(warn) fw_mybatis_resultmap_id(warn) fw_mybatis_ognl_empty(warn) fw_mybatis_generatedkeys(warn) fw_mybatis_select_dup_result(fail) fw_mybatis_jdbc_type(warn) fw_mybatis_cache_dirty(warn) fw_mybatis_logic_delete(warn) fw_mybatis_wrapper_injection(warn) fw_mybatis_mapper_locations(warn) fw_mybatis_multi_ds_isolation(warn) fw_mybatis_typehandler(warn) fw_mybatis_field_sync(fail)
# harvested-from: T6 P1 范例（2026-07-17），规律源自 mybatis 3.5.19 / mybatis-plus 3.5.17 官方文档
_fw_mybatis_check() {
  echo "  [mybatis] MyBatis 3.5.x + MyBatis-Plus 3.5.x 框架规律"

  # ---------- 收集 mapper XML 文件清单 ----------
  local xmls xmlarr=()
  xmls=""
  for d in ${MYBATIS_MAPPER_DIRS[@]+"${MYBATIS_MAPPER_DIRS[@]}"}; do
    [[ -d "$d" ]] || continue
    while IFS= read -r f; do
      xmls="${xmls}${f}
"
    done < <(find "$d" -type f -name '*.xml' 2>/dev/null)
  done
  # 去空行 + 去重
  xmls=$(printf '%s\n' "$xmls" |  grep -E '.+' | sort -u)
  if [[ -z "$xmls" ]]; then
    warn "mybatis: 无 mapper XML 可检（MYBATIS_MAPPER_DIRS）"
    return
  fi
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && xmlarr+=("$ln")
  done <<< "$xmls"

  # ---------- 收集 Java 源文件清单（可能为空） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${MYBATIS_SRC_GLOBS[@]+"${MYBATIS_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  # ---------- fw_mybatis_dollar(fail)：XML 中 ${} 须命中白名单 ----------
  local dollar_hits="" bad_lines="" line safe wl
  dollar_hits=$(grep -rnE '\$\{' "${xmlarr[@]}" 2>/dev/null || true)
  if [[ -z "$dollar_hits" ]]; then
    pass "fw_mybatis_dollar: 无 \${} 用法（值参数均走 #{}）"
  else
    bad_lines=""
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      safe=0
      for wl in ${SQL_INJECTION_WHITELIST[@]+"${SQL_INJECTION_WHITELIST[@]}"}; do
        case "$line" in *"$wl"*) safe=1 ;; esac
      done
      [[ "$safe" -eq 0 ]] && bad_lines="${bad_lines}${line}
"
    done <<< "$dollar_hits"
    _fw_report fail fw_mybatis_dollar "$bad_lines" "\${} 未命中白名单（SQL 注入风险 CWE-89）" "全部 \${} 命中白名单"
  fi

  # ---------- fw_mybatis_binding(fail)：Mapper 接口数 vs XML namespace 数 ----------
  # 守卫：MYBATIS_SRC_GLOBS 为空数组时跳过（fixture 场景 SRC_GLOBS=() 时不应误判）
  if [[ ${#MYBATIS_SRC_GLOBS[@]} -eq 0 ]]; then
    pass "fw_mybatis_binding: MYBATIS_SRC_GLOBS 未配置，跳过 binding 计数核验"
  else
    local mcnt xcnt
    mcnt=$({ grep -lE '@Mapper|extends BaseMapper' "${srcarr[@]}" 2>/dev/null || true; } | wc -l | xargs)
    xcnt=$(grep -lE '<mapper namespace=' "${xmlarr[@]}" 2>/dev/null | wc -l | xargs)
    if [[ "$mcnt" -ne "$xcnt" ]]; then
      fail "fw_mybatis_binding: Mapper 接口数($mcnt) ≠ XML namespace 数($xcnt)，存在未绑定映射"
    else
      pass "fw_mybatis_binding: Mapper↔XML 绑定一致 ($mcnt)"
    fi
  fi

  # ---------- fw_mybatis_foreach(warn)：foreach 须人工确认 IN 列表 size 上限 ----------
  local fc
  fc=$({ grep -rcE '<foreach' "${xmlarr[@]}" 2>/dev/null || true; } | awk -F: '{s+=$2} END{print s+0}')
  if [[ "$fc" -gt 0 ]]; then
    warn "fw_mybatis_foreach: 存在 $fc 处 <foreach>，须人工确认 IN 列表 size 上限（防 OOM/超 max_allowed_packet，建议分批 1000/批）"
  else
    pass "fw_mybatis_foreach: 无 <foreach> 用法"
  fi

  # ---------- fw_mybatis_plus_page(warn)：MP 项目 selectList 须配 Page ----------
  local has_mp=0
  if [[ ${#srcarr[@]} -gt 0 ]] && grep -lq 'extends BaseMapper' "${srcarr[@]}" 2>/dev/null; then
    has_mp=1
  fi
  if [[ "$has_mp" -eq 1 ]]; then
    local np
    np=$(grep -rnE 'selectList\(' "${srcarr[@]}" 2>/dev/null | grep -v 'Page' | head -5 || true)
    _fw_report warn fw_mybatis_plus_page "$np" "疑似无分页 selectList（须用 Page 对象）" "未检出无分页 selectList"
  else
    pass "fw_mybatis_plus_page: 非 MP 项目（未检出 extends BaseMapper），跳过"
  fi

  # ---------- fw_mybatis_plus_dbtype(warn)：单数据源 PaginationInnerInterceptor 须显式 DbType ----------
  if [[ "$has_mp" -eq 1 ]]; then
    local pgi
    pgi=$(grep -rnE 'PaginationInnerInterceptor' "${srcarr[@]}" 2>/dev/null || true)
    if [[ -z "$pgi" ]]; then
      pass "fw_mybatis_plus_dbtype: 未检出 PaginationInnerInterceptor，跳过"
    else
      local no_dbtype
      no_dbtype=$(printf '%s\n' "$pgi" | grep -E 'new PaginationInnerInterceptor\(\)' || true)
      _fw_report warn fw_mybatis_plus_dbtype "$no_dbtype" "检出无参 PaginationInnerInterceptor()，单数据源建议显式 DbType" "PaginationInnerInterceptor 已声明 DbType"
    fi
  else
    pass "fw_mybatis_plus_dbtype: 非 MP 项目，跳过"
  fi

  # ---------- fw_mybatis_nplus1(warn)：嵌套 select 防 N+1 ----------
  local n1
  n1=$(grep -rnE '<(association|collection)[[:space:]]+[^>]*\bselect=' "${xmlarr[@]}" 2>/dev/null || true)
  _fw_report warn fw_mybatis_nplus1 "$n1" "检出嵌套 select（列表场景须改 nested result 或 fetchType=lazy）" "无嵌套 select（无 N+1 风险）"

  # ---------- fw_mybatis_resultmap_id(warn)：resultMap 须含 <id> ----------
  local rmid_bad="" rfile
  for rfile in "${xmlarr[@]}"; do
    local rmcnt
    rmcnt=$(grep -cE '<resultMap\b' "$rfile" 2>/dev/null || true)
    [[ "$rmcnt" -eq 0 ]] && continue
    local idcnt
    idcnt=$(grep -cE '<id\b' "$rfile" 2>/dev/null || true)
    if [[ "$idcnt" -eq 0 ]]; then
      rmid_bad="${rmid_bad}${rfile}
"
    fi
  done
  _fw_report warn fw_mybatis_resultmap_id "$rmid_bad" "含 <resultMap> 但无 <id> 的 XML（防去重失效）" "resultMap 均含 <id> 或无 resultMap"

  # ---------- fw_mybatis_ognl_empty(warn)：OGNL 空串陷阱 ----------
  local ognl_hits
  ognl_hits=$(grep -rnE "<if test=\"[^\"]*!= *''" "${xmlarr[@]}" 2>/dev/null || true)
  _fw_report warn fw_mybatis_ognl_empty "$ognl_hits" "检出 <if test=\"… != ''\">（数值字段须仅判 != null）" "未检出 OGNL 空串陷阱"

  # ---------- fw_mybatis_generatedkeys(warn)：useGeneratedKeys + foreach ----------
  local gk_hits
  gk_hits=$(grep -rnE 'useGeneratedKeys' "${xmlarr[@]}" 2>/dev/null || true)
  if [[ -n "$gk_hits" ]]; then
    local gk_with_foreach=""
    for rfile in "${xmlarr[@]}"; do
      if grep -qE 'useGeneratedKeys' "$rfile" 2>/dev/null && grep -qE '<foreach' "$rfile" 2>/dev/null; then
        gk_with_foreach="${gk_with_foreach}${rfile}
"
      fi
    done
    _fw_report warn fw_mybatis_generatedkeys "$gk_with_foreach" "useGeneratedKeys + <foreach> 并存（非 MySQL 驱动主键回填不保证）" "useGeneratedKeys 未与 foreach 并存"
  else
    pass "fw_mybatis_generatedkeys: 无 useGeneratedKeys 用法"
  fi

  # ---------- fw_mybatis_select_dup_result(fail)：select 同时含 resultType 与 resultMap ----------
  local dup_hits
  dup_hits=$(grep -rnE '<select[^>]*\bresultType=[^>]*\bresultMap=' "${xmlarr[@]}" 2>/dev/null || true)
  _fw_report fail fw_mybatis_select_dup_result "$dup_hits" "<select> 同时声明 resultType 与 resultMap（行为跨版本不一致）" "无 resultType/resultMap 并存"

  # ---------- fw_mybatis_jdbc_type(warn)：可空 #{param} 须带 jdbcType ----------
  local no_jdbctype_hits
  no_jdbctype_hits=$(grep -rnE '#\{[a-zA-Z_][a-zA-Z0-9_]*\}' "${xmlarr[@]}" 2>/dev/null | grep -vE 'jdbcType' || true)
  _fw_report warn fw_mybatis_jdbc_type "$(printf '%s\n' "$no_jdbctype_hits" | head -5)" "检出无 jdbcType 的 #{param}（Oracle 等 NULL 值须显式 jdbcType 防 TypeHandler 失配），请人工核实是否可空" "#{param} 均带 jdbcType 或无裸 #{}"

  # ---------- fw_mybatis_cache_dirty(warn)：二级缓存跨 namespace 关联 ----------
  local cache_files="" cfile
  for cfile in "${xmlarr[@]}"; do
    if grep -qE '<cache\b' "$cfile" 2>/dev/null; then
      cache_files="${cache_files}${cfile}
"
    fi
  done
  if [[ -z "$cache_files" ]]; then
    pass "fw_mybatis_cache_dirty: 无二级缓存，跳过"
  else
    local cache_assoc=""
    while IFS= read -r cfile; do
      [[ -n "${cfile}" ]] || continue
      if grep -qE '<(association|collection)[[:space:]]+[^>]*\bselect=' "${cfile}" 2>/dev/null; then
        cache_assoc="${cache_assoc}${cfile}
"
      fi
    done <<< "${cache_files}"
    _fw_report warn fw_mybatis_cache_dirty "$cache_assoc" "二级缓存 + 跨 namespace 嵌套 select（须 cache-ref 或禁用二级缓存）" "二级缓存无跨 namespace 关联"
  fi

  # ---------- fw_mybatis_logic_delete(warn)：MP 项目手写 deleted 条件 ----------
  if [[ "$has_mp" -eq 1 ]]; then
    local ld_hits
    ld_hits=$(grep -rnE '\bdeleted\s*=' "${xmlarr[@]}" "${srcarr[@]}" 2>/dev/null | grep -vE 'logic-delete|@TableLogic' || true)
    _fw_report warn fw_mybatis_logic_delete "$(printf '%s\n' "$ld_hits" | head -5)" "检出手写 deleted= 条件（MP 拦截器会自动追加，避免叠加/绕过）" "无手写 deleted 条件"
  else
    pass "fw_mybatis_logic_delete: 非 MP 项目，跳过"
  fi

  # ---------- fw_mybatis_wrapper_injection(warn)：Wrapper last/having/apply 字符串注入面 ----------
  # 原实现对全部 Java 源扫 \.(last|having|apply)\(，非 MP
  # 项目命中全是函数式接口 Function.apply 误报（RuoYi SensitiveJsonSerializer 实证），且与同族
  # fw_mybatis_logic_delete 的 has_mp 守卫口径不一致。改为先筛含 Wrapper 用法的文件再扫——
  # Wrapper 之外的 .last/.having/.apply 无 SQL 语义（MP 项目内同样消灭 Function.apply 误报）。
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_mybatis_wrapper_injection: 无 Java 源文件，跳过"
  else
    local w_files w_hits
    w_files=$(grep -lE 'QueryWrapper|LambdaQueryWrapper|UpdateWrapper|Wrapper<[[:space:]]' "${srcarr[@]}" 2>/dev/null || true)
    if [[ -n "$w_files" ]]; then
      w_hits=$(grep -nE '\.(last|having|apply)\(' $w_files 2>/dev/null | grep -vE 'checkSqlInjection' || true)
      _fw_report warn fw_mybatis_wrapper_injection "$(printf '%s\n' "$w_hits" | head -5)" "检出 Wrapper last()/having()/apply()（须核对参数来源，建议 checkSqlInjection(true)）" "无 Wrapper 字符串 API 调用"
    else
      pass "fw_mybatis_wrapper_injection: 未检出 Wrapper 用法（非 MP 或纯 XML 项目），跳过"
    fi
  fi

  # ---------- fw_mybatis_mapper_locations(warn)：starter 须显式 mapper-locations ----------
  # 仅在 PROJECT_DIR 存在 application*.yml 时检查（fixture 场景可能无）
  local pd="${PROJECT_DIR:-}"
  local cfg_hit=""
  if [[ -n "$pd" && -d "$pd" ]]; then
    while IFS= read -r cfg; do
      [[ -z "$cfg" ]] && continue
      if ! grep -qE 'mapper-locations|mapperLocations' "$cfg" 2>/dev/null; then
        cfg_hit="${cfg_hit}${cfg}
"
      fi
    done < <(find "$pd" -maxdepth 6 -not -path "*/target/*" -type f \( -name 'application*.yml' -o -name 'application*.yaml' -o -name 'application*.properties' \) 2>/dev/null)
  fi
  if [[ -z "$pd" || ! -d "$pd" ]]; then
    pass "fw_mybatis_mapper_locations: PROJECT_DIR 未配置，跳过"
  elif [[ -z "$cfg_hit" ]]; then
    pass "fw_mybatis_mapper_locations: 配置文件均含 mapper-locations"
  else
    # 仅当确实存在 mapper xml 且配置缺失才 warn
    if [[ ${#xmlarr[@]} -gt 0 ]]; then
      warn "fw_mybatis_mapper_locations: 配置文件缺 mybatis.mapper-locations（starter 默认无值，会导致 BindingException）:
${cfg_hit}"
    else
      pass "fw_mybatis_mapper_locations: 无 Mapper.xml，跳过"
    fi
  fi

  # ---------- fw_mybatis_multi_ds_isolation(warn)：多数据源 SqlSessionFactory 隔离 ----------
  if [[ ${#srcarr[@]} -gt 0 ]]; then
    local ds_cnt ssf_cnt
    ds_cnt=$(grep -rlE 'DataSource\b' "${srcarr[@]}" 2>/dev/null | wc -l | xargs)
    ssf_cnt=$(grep -rlE 'SqlSessionFactory' "${srcarr[@]}" 2>/dev/null | wc -l | xargs)
    if [[ "$ds_cnt" -ge 2 && "$ssf_cnt" -lt 2 ]]; then
      warn "fw_mybatis_multi_ds_isolation: 多 DataSource($ds_cnt) 共用 SqlSessionFactory($ssf_cnt)（须独立 SqlSessionFactory + MapperScannerConfigurer）"
    else
      pass "fw_mybatis_multi_ds_isolation: SqlSessionFactory 数与 DataSource 数匹配或单数据源"
    fi
  else
    pass "fw_mybatis_multi_ds_isolation: 无 Java 源文件，跳过"
  fi

  # ---------- fw_mybatis_typehandler(warn)：自定义 TypeHandler 注册核验 ----------
  if [[ ${#srcarr[@]} -gt 0 ]]; then
    local th_cls th_unreg=""
    th_cls=$(grep -rlE 'implements\s+TypeHandler<|extends\s+BaseTypeHandler<|@MappedTypes' "${srcarr[@]}" 2>/dev/null || true)
    if [[ -z "$th_cls" ]]; then
      pass "fw_mybatis_typehandler: 无自定义 TypeHandler，跳过"
    else
      local reg_found=0
      while IFS= read -r tcls; do
        [[ -z "$tcls" ]] && continue
        # 检查是否存在注册痕迹（XML <typeHandler 或 java @Bean SqlSessionFactoryBean.setTypeHandlersPackage 或 yml type-handlers-package）
        if grep -rqE '<typeHandler\b|setTypeHandlersPackage|type-handlers-package' "${srcarr[@]}" "${xmlarr[@]}" 2>/dev/null; then
          reg_found=1
          break
        fi
        th_unreg="${th_unreg}${tcls}
"
      done <<< "$th_cls"
      if [[ "$reg_found" -eq 1 ]]; then
        pass "fw_mybatis_typehandler: 检出 TypeHandler 注册痕迹"
      else
        warn "fw_mybatis_typehandler: 自定义 TypeHandler 类存在但未检出注册（<typeHandlers>/<package>/type-handlers-package/@Bean setTypeHandlersPackage）:
${th_unreg}"
      fi
    fi
  else
    pass "fw_mybatis_typehandler: 无 Java 源文件，跳过"
  fi

  # ---------- fw_mybatis_field_sync(fail)：resultMap property ↔ 实体字段一致性（漏改字段防线） ----------
  # 字符串耦合点：实体改字段名后 XML property 不同步——编译/启动均不报错，运行期该列静默丢值。
  # 判定：resultMap 每个 property= 须在 type 指向实体（含一层 extends 父类）中以词边界出现
  #（含字段声明/getter/Lombok 注解任意出现即算同步——重命名后旧词完全消失才 fail，宽松防误报）。
  # 实体文件无法唯一定位（同名类多文件/未配 SRC_GLOBS）时跳过该 resultMap（机械不猜，fail-open）。
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_mybatis_field_sync: 无 Java 源文件（MYBATIS_SRC_GLOBS），跳过字段一致性核验"
  else
    local fs_bad="" rfile
    for rfile in "${xmlarr[@]}"; do
      local fs_rows
      fs_rows=$(awk '
        function basename_cls(fq,   a, n) { n = split(fq, a, "."); return a[n] }
        /<resultMap/ {
          intag = 1
          t = ""
          if (match($0, /type="[^"]*"/)) { t = basename_cls(substr($0, RSTART+6, RLENGTH-7)) }
        }
        intag && match($0, /property="[^"]*"/) {
          print t "\t" substr($0, RSTART+10, RLENGTH-11) "\t" FNR
        }
        /<\/resultMap>/ { intag = 0 }
      ' "$rfile" 2>/dev/null || true)
      [[ -z "$fs_rows" ]] && continue
      while IFS=$'\t' read -r tcls prop fln; do
        [[ -n "$tcls" && -n "$prop" ]] || continue
        # 实体定位：srcarr 中文件名 == 类名；多命中不猜（跳过）
        local e_hits e_file=""
        e_hits=$(printf '%s\n' "${srcarr[@]}" | grep -E "/${tcls}\.java$" || true)
        local e_n; e_n=$(printf '%s\n' "$e_hits" | grep -c .)
        [[ "$e_n" -eq 1 ]] || continue
        e_file=$(printf '%s\n' "$e_hits")
        # 查域 = 实体 + 一层父类（extends 父类文件的字段声明也算同步）
        local grep_files="$e_file"
        local parent
        parent=$(grep -oE 'extends[[:space:]]+[A-Za-z_][A-Za-z0-9_]*' "$e_file" 2>/dev/null | head -1 | awk '{print $2}')
        if [[ -n "$parent" ]]; then
          local p_hits
          p_hits=$(printf '%s\n' "${srcarr[@]}" | grep -E "/${parent}\.java$" || true)
          if [[ $(printf '%s\n' "$p_hits" | grep -c .) -eq 1 ]]; then
            grep_files="$grep_files
$(printf '%s\n' "$p_hits")"
          fi
        fi
        if ! grep -qw "$prop" $grep_files 2>/dev/null; then
          fs_bad="${fs_bad}${rfile}:${fln} property=${prop} → 实体 ${tcls}（$(printf '%s' "$e_file" | xargs basename)）未含该字段（疑似漏改：改字段名未同步 resultMap）
"
        fi
      done <<< "$fs_rows"
    done
    _fw_report fail fw_mybatis_field_sync "$fs_bad" "resultMap property 与实体字段失同步（改实体字段必须同步 resultMap/SQL 列/reader 列，前置查询查 data-mapping 边集；JSON 契约面不在本门禁面——见 spec 四查）" "resultMap property 均可在实体中定位（或无 resultMap/未配实体源）"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
