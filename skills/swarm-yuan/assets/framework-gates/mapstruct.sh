# ruleset: mapstruct  requires_conf: MAPSTRUCT_SRC_GLOBS
# gates: fw_mapstruct_unmapped_target(fail) fw_mapstruct_lombok_binding(fail) fw_mapstruct_processor_order(warn) fw_mapstruct_mapping_target_null(warn) fw_mapstruct_cycle(warn) fw_mapstruct_component_model(warn) fw_mapstruct_ignore_reason(warn) fw_mapstruct_named_threadsafe(warn) fw_mapstruct_expression(warn) fw_mapstruct_inherit(warn) fw_mapstruct_nested(warn) fw_mapstruct_collection_element(warn) fw_mapstruct_builder_default(warn)
# harvested-from: P2（2026-07-17），规律源自 MapStruct 1.6.x 官方 reference 文档 + Lombok binding 说明
_fw_mapstruct_check() {
  echo "  [mapstruct] MapStruct 1.6.x 框架规律"

  # ---------- 收集源文件清单（Java + 构建文件统一入 srcarr） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${MAPSTRUCT_SRC_GLOBS[@]+"${MAPSTRUCT_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "mapstruct: MAPSTRUCT_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # 拆分 Java 文件 vs 构建文件（pom/gradle）
  local javaarr=() buildarr=()
  local f j b
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      *.java) javaarr+=("$f") ;;
      pom.xml|build.gradle|*.gradle|*.gradle.kts) buildarr+=("$f") ;;
    esac
  done

  # 代码正文过滤辅助：调公共库 _fw_strip_comments_c（java 去 // 与块注释行）/ _fw_strip_comments_xml（xml 去 <!-- --> 跨行状态机）
  _fw_mapstruct_build_code_only() {  # pom 走 xml 剥离；gradle 走 java 剥离
    case "$(basename "$1")" in
      pom.xml) _fw_strip_comments_xml "$1" ;;
      *) _fw_strip_comments_c "$1" ;;
    esac
  }

  # 公用：@Mapper 文件清单（注解行须行首，排除 @MapperConfig 与 import）
  local mapper_files=""
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    if _fw_strip_comments_c "$j" | grep -qE '^[[:space:]]*@Mapper([[:space:]]*\(|[[:space:]]*$)'; then
      mapper_files="${mapper_files}${j}
"
    fi
  done

  # ====================================================================
  # fw_mapstruct_unmapped_target(fail)：@Mapper 须显式 unmappedTargetPolicy
  # ====================================================================
  local global_policy=0
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    if _fw_strip_comments_c "$j" | grep -qE '@MapperConfig' \
      && _fw_strip_comments_c "$j" | grep -qE 'unmappedTargetPolicy'; then
      global_policy=1
    fi
  done
  if [[ -z "$mapper_files" ]]; then
    pass "fw_mapstruct_unmapped_target: 无 @Mapper，跳过"
  elif [[ "$global_policy" -eq 1 ]]; then
    pass "fw_mapstruct_unmapped_target: 全局 @MapperConfig 已声明 unmappedTargetPolicy"
  else
    local ut_bad=""
    while IFS= read -r j; do
      [[ -z "$j" ]] && continue
      if ! _fw_strip_comments_c "$j" | grep -qE 'unmappedTargetPolicy'; then
        ut_bad="${ut_bad}${j}
"
      fi
    done <<< "$mapper_files"
    _fw_report fail fw_mapstruct_unmapped_target "$ut_bad" "@Mapper 未显式 unmappedTargetPolicy（默认 IGNORE 静默漏映射，须 ReportingPolicy.ERROR）" "@Mapper 均显式 unmappedTargetPolicy"
  fi

  # ====================================================================
  # fw_mapstruct_lombok_binding(fail)：lombok + mapstruct 须 lombok-mapstruct-binding
  # ====================================================================
  if [[ ${#buildarr[@]} -eq 0 ]]; then
    pass "fw_mapstruct_lombok_binding: 无构建文件，跳过"
  else
    local has_lombok=0 has_mapstruct=0 has_binding=0
    for b in "${buildarr[@]}"; do
      _fw_mapstruct_build_code_only "$b" | grep -qE 'lombok' && has_lombok=1
      _fw_mapstruct_build_code_only "$b" | grep -qE 'mapstruct' && has_mapstruct=1
      _fw_mapstruct_build_code_only "$b" | grep -qE 'lombok-mapstruct-binding' && has_binding=1
    done
    if [[ "$has_lombok" -eq 1 && "$has_mapstruct" -eq 1 && "$has_binding" -eq 0 ]]; then
      fail "fw_mapstruct_lombok_binding: lombok + mapstruct 共存但无 lombok-mapstruct-binding（Lombok 1.18.16 起强制，缺失则 processor 顺序不可控/映射缺失）"
    else
      pass "fw_mapstruct_lombok_binding: binding 齐备或未与 lombok 共存"
    fi
  fi

  # ====================================================================
  # fw_mapstruct_processor_order(warn)：annotationProcessorPaths lombok 须先序
  # ====================================================================
  if [[ ${#buildarr[@]} -eq 0 ]]; then
    pass "fw_mapstruct_processor_order: 无构建文件，跳过"
  else
    local po_bad=""
    for b in "${buildarr[@]}"; do
      case "$(basename "$b")" in
        pom.xml) ;;
        *) continue ;;
      esac
      local ord mp lb
      ord=$(awk '
        /<annotationProcessorPaths>/ { inapp=1 }
        /<\/annotationProcessorPaths>/ { inapp=0 }
        {
          if (inapp && $0 ~ /mapstruct-processor/ && mp=="") mp=NR
          if (inapp && $0 ~ /<artifactId>lombok</ && lb=="") lb=NR
        }
        END { printf "%d:%d", mp+0, lb+0 }
      ' "$b" 2>/dev/null)
      mp="${ord%%:*}"
      lb="${ord##*:}"
      if [[ "${mp:-0}" -gt 0 && "${lb:-0}" -gt 0 && "$mp" -lt "$lb" ]]; then
        po_bad="${po_bad}${b}(mapstruct-processor line ${mp} 先于 lombok line ${lb})
"
      fi
    done
    _fw_report warn fw_mapstruct_processor_order "$po_bad" "annotationProcessorPaths 中 mapstruct-processor 先于 lombok（须 lombok 先序，推荐 lombok→binding→mapstruct-processor）" "processor 顺序正确或非 Maven"
  fi

  # ====================================================================
  # fw_mapstruct_mapping_target_null(warn)：@MappingTarget 须 NullValuePropertyMappingStrategy
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local mt_bad=""
    for j in "${javaarr[@]}"; do
      if _fw_strip_comments_c "$j" | grep -qE '@MappingTarget'; then
        if ! _fw_strip_comments_c "$j" | grep -qE 'NullValuePropertyMappingStrategy'; then
          mt_bad="${mt_bad}${j}
"
        fi
      fi
    done
    _fw_report warn fw_mapstruct_mapping_target_null "$mt_bad" "@MappingTarget 更新方法无 NullValuePropertyMappingStrategy（默认源 null 覆盖目标已有值 → 数据丢失，PATCH 须 IGNORE）" "@MappingTarget 更新语义安全"
  else
    pass "fw_mapstruct_mapping_target_null: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_mapstruct_cycle(warn)：uses 互相引用 → 循环引用须 CycleAvoidingStrategy
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local cycle_pairs="" iname used u f2
    for j in "${javaarr[@]}"; do
      grep -qE 'uses[[:space:]]*=' "$j" 2>/dev/null || continue
      # SIGPIPE 加固（head 截断致 grep SIGPIPE，在 $() 末尾加 || true）
      iname=$(grep -oE 'interface[[:space:]]+[A-Za-z0-9_]+' "$j" 2>/dev/null | head -1 | awk '{print $2}' || true)
      [[ -z "$iname" ]] && continue
      used=$(grep -oE 'uses[[:space:]]*=[[:space:]]*\{?[A-Za-z0-9_.,[:space:]]+' "$j" 2>/dev/null | grep -oE '[A-Za-z0-9_]+\.class' | sed 's/\.class//' || true)
      for u in $used; do
        [[ "$u" == "CycleAvoidingStrategy" ]] && continue
        f2=$(grep -lE "interface[[:space:]]+${u}\b" "${javaarr[@]}" 2>/dev/null | head -1 || true)
        [[ -z "$f2" || "$f2" == "$j" ]] && continue
        if grep -qE 'uses[[:space:]]*=' "$f2" 2>/dev/null && grep -qE "${iname}\.class" "$f2" 2>/dev/null; then
          cycle_pairs="${cycle_pairs}${j} <-> ${f2}
"
        fi
      done
    done
    _fw_report warn fw_mapstruct_cycle "$cycle_pairs" "检出 Mapper uses 互相引用（循环引用生成无限递归代码 → StackOverflowError，须 CycleAvoidingStrategy 或打破环）" "无 uses 循环引用"
  else
    pass "fw_mapstruct_cycle: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_mapstruct_component_model(warn)：@Mapper 须 componentModel="spring"
  # ====================================================================
  if [[ -z "$mapper_files" ]]; then
    pass "fw_mapstruct_component_model: 无 @Mapper，跳过"
  else
    local cm_bad=""
    while IFS= read -r j; do
      [[ -z "$j" ]] && continue
      if ! _fw_strip_comments_c "$j" | grep -qE 'componentModel'; then
        cm_bad="${cm_bad}${j}
"
      fi
    done <<< "$mapper_files"
    _fw_report warn fw_mapstruct_component_model "$cm_bad" "@Mapper 未声明 componentModel（Spring 项目须 \"spring\" 走 DI；default 模型下自定义转换器无法注入依赖）" "@Mapper 均声明 componentModel"
  fi

  # ====================================================================
  # fw_mapstruct_ignore_reason(warn)：ignore = true 须记录原因
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local ig_hits
    ig_hits=$(grep -rnE 'ignore[[:space:]]*=[[:space:]]*true' "${javaarr[@]}" 2>/dev/null | grep -vE ':[[:space:]]*\*|:[[:space:]]*//' || true)
    _fw_report warn fw_mapstruct_ignore_reason "$(printf '%s\n' "$ig_hits" | head -5)" "检出 ignore = true（须同行注释说明忽略原因，防意图失传）" "无显式 ignore"
  else
    pass "fw_mapstruct_ignore_reason: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_mapstruct_named_threadsafe(warn)：@Named 方法禁 SimpleDateFormat 等非线程安全态
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local nt_bad=""
    for j in "${javaarr[@]}"; do
      if grep -qE '@Named\(' "$j" 2>/dev/null && grep -qE 'SimpleDateFormat' "$j" 2>/dev/null; then
        nt_bad="${nt_bad}${j}
"
      fi
    done
    _fw_report warn fw_mapstruct_named_threadsafe "$nt_bad" "@Named 方法所在文件用 SimpleDateFormat（Mapper 单例多线程并发 → CWE-362 竞态，须 DateTimeFormatter/无状态）" "@Named 方法无线程安全隐患"
  else
    pass "fw_mapstruct_named_threadsafe: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_mapstruct_expression(warn)：expression = 注入面/可测试性差
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local ex_hits
    ex_hits=$(grep -rnE 'expression[[:space:]]*=' "${javaarr[@]}" 2>/dev/null || true)
    _fw_report warn fw_mapstruct_expression "$(printf '%s\n' "$ex_hits" | head -5)" "检出 expression =（重构不可追踪/单测不可达，优先 qualifiedByName+@Named；人工核表达式内容防注入）" "无 expression 用法"
  else
    pass "fw_mapstruct_expression: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_mapstruct_inherit(warn)：@InheritConfiguration/@InheritInverseConfiguration 误用面
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local ih_hits
    ih_hits=$(grep -rnE '@Inherit(Configuration|InverseConfiguration)' "${javaarr[@]}" 2>/dev/null || true)
    _fw_report warn fw_mapstruct_inherit "$(printf '%s\n' "$ih_hits" | head -5)" "检出 @Inherit(Inverse)Configuration（ignore/嵌套/表达式不按直觉反转，人工核对正反方法字段镜像性）" "无 Inherit 配置继承"
  else
    pass "fw_mapstruct_inherit: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_mapstruct_nested(warn)：target = "a.b" 点语法中间对象生命周期
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local ns_hits
    ns_hits=$(grep -rnE 'target[[:space:]]*=[[:space:]]*"[A-Za-z0-9_]+\.[A-Za-z0-9_.]+"' "${javaarr[@]}" 2>/dev/null || true)
    _fw_report warn fw_mapstruct_nested "$(printf '%s\n' "$ns_hits" | head -5)" "检出嵌套 target 点语法（更新场景中间对象未映射字段保留旧值；中间类型须无参构造）" "无嵌套 target 点语法"
  else
    pass "fw_mapstruct_nested: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_mapstruct_collection_element(warn)：集合方法元素配置须 @IterableMapping
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local ce_bad=""
    for j in "${javaarr[@]}"; do
      if grep -qE '(List|Set)<[A-Za-z0-9_., <>]+>[[:space:]]+[A-Za-z0-9_]+\([[:space:]]*(final[[:space:]]+)?(List|Set)<' "$j" 2>/dev/null; then
        if ! grep -qE '@IterableMapping' "$j" 2>/dev/null; then
          ce_bad="${ce_bad}${j}
"
        fi
      fi
    done
    _fw_report warn fw_mapstruct_collection_element "$ce_bad" "集合映射方法无 @IterableMapping（元素级 @Mapping/qualifiedByName 配置静默不生效）" "集合映射元素配置齐备"
  else
    pass "fw_mapstruct_collection_element: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_mapstruct_builder_default(warn)：@Builder.Default 默认值在 builder 映射不生效
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local bd_hits
    bd_hits=$(grep -rlE '@Builder\.Default' "${javaarr[@]}" 2>/dev/null || true)
    _fw_report warn fw_mapstruct_builder_default "$bd_hits" "检出 @Builder.Default（MapStruct 逐字段 set 时默认值不生效，未映射字段拿 builder 零值）" "无 @Builder.Default"
  else
    pass "fw_mapstruct_builder_default: 无 Java 源文件，跳过"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
