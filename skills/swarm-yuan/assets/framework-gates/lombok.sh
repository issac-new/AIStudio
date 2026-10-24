# ruleset: lombok  requires_conf: LOMBOK_SRC_GLOBS
# gates: fw_lombok_data_jpa(fail) fw_lombok_slf4j_dup(fail) fw_lombok_builder_jackson(warn) fw_lombok_requiredargs_circular(warn) fw_lombok_equals_callsuper(warn) fw_lombok_equals_lazy(warn) fw_lombok_sneaky_throws(warn) fw_lombok_cleanup(warn) fw_lombok_val_usage(warn) fw_lombok_getter_lazy(warn) fw_lombok_nonnull_validation(warn) fw_lombok_config(warn) fw_lombok_mapstruct(warn)
# harvested-from: T7 P1 范例（2026-07-17），规律源自 lombok 1.18.46 changelog 与 projectlombok.org 官方特性文档
_fw_lombok_check() {
  echo "  [lombok] Project Lombok 1.18.x 框架规律"

  # ---------- 收集 Java 源文件清单（LOMBOK_SRC_GLOBS 可能为空） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${LOMBOK_SRC_GLOBS[@]+"${LOMBOK_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  if [[ -z "$srcs" ]]; then
    warn "lombok: LOMBOK_SRC_GLOBS 未配置或无文件可检，仅运行 PROJECT_DIR 级门禁（config/mapstruct）"
  else
    while IFS= read -r ln; do
      [[ -n "$ln" ]] && srcarr+=("$ln")
    done <<< "$srcs"
  fi

  # 代码正文过滤辅助：调公共库 _fw_strip_comments_c（C 系，剔除单行注释 // 与 javadoc 块注释 * 行，防 javadoc 误命中）

  # ====================================================================
  # fw_lombok_data_jpa(fail)：@Entity + @Data 同文件 → fail（注解须在代码行，排除 javadoc 文本）
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_lombok_data_jpa: 无 Java 源文件，跳过"
  else
    local efile entity_files="" data_violations=""
    for efile in "${srcarr[@]}"; do
      # 先过滤注释，再 grep 注解（防 javadoc 中的 @Entity/@Data 误命中）
      if _fw_strip_comments_c "$efile" | grep -qE '@Entity\b'; then
        entity_files="${entity_files}${efile}
"
      fi
    done
    if [[ -z "$entity_files" ]]; then
      pass "fw_lombok_data_jpa: 无 @Entity 类（代码行），跳过"
    else
      data_violations=""
      while IFS= read -r efile; do
        [[ -z "$efile" ]] && continue
        if _fw_strip_comments_c "$efile" | grep -qE '@Data\b'; then
          data_violations="${data_violations}${efile}
"
        fi
      done <<< "$entity_files"
      _fw_report fail fw_lombok_data_jpa "$data_violations" "@Entity 上同时标 @Data（懒加载字段触发 LazyInitializationException/N+1，双向关联 StackOverflow），改用 @Getter @Setter + 字段级 @ToString.Exclude/@EqualsAndHashCode.Exclude" "@Entity 类均未用 @Data"
    fi
  fi

  # ====================================================================
  # fw_lombok_slf4j_dup(fail)：@Slf4j + LoggerFactory.getLogger 同文件 → fail（代码行，排除 javadoc）
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_lombok_slf4j_dup: 无 Java 源文件，跳过"
  else
    local sfile slf4j_files="" slf4j_dup=""
    for sfile in "${srcarr[@]}"; do
      if _fw_strip_comments_c "$sfile" | grep -qE '@Slf4j\b'; then
        slf4j_files="${slf4j_files}${sfile}
"
      fi
    done
    if [[ -z "$slf4j_files" ]]; then
      pass "fw_lombok_slf4j_dup: 无 @Slf4j 用法（代码行），跳过"
    else
      slf4j_dup=""
      while IFS= read -r sfile; do
        [[ -z "$sfile" ]] && continue
        if _fw_strip_comments_c "$sfile" | grep -qE 'LoggerFactory\.getLogger'; then
          slf4j_dup="${slf4j_dup}${sfile}
"
        fi
      done <<< "$slf4j_files"
      _fw_report fail fw_lombok_slf4j_dup "$slf4j_dup" "@Slf4j 已生成 log 字段，同文件又手写 LoggerFactory.getLogger（字段重复声明或双 Logger 实例）" "@Slf4j 类未手写 LoggerFactory.getLogger"
    fi
  fi

  # ====================================================================
  # fw_lombok_builder_jackson(warn)：@Builder 须配 @Jacksonized 或 @NoArgsConstructor+@AllArgsConstructor 或 @JsonDeserialize(builder=
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_lombok_builder_jackson: 无 Java 源文件，跳过"
  else
    local bfile builder_files="" bwarn=""
    for bfile in "${srcarr[@]}"; do
      if _fw_strip_comments_c "$bfile" | grep -qE '@Builder\b|@SuperBuilder\b'; then
        builder_files="${builder_files}${bfile}
"
      fi
    done
    if [[ -z "$builder_files" ]]; then
      pass "fw_lombok_builder_jackson: 无 @Builder/@SuperBuilder 用法（代码行），跳过"
    else
      bwarn=""
      while IFS= read -r bfile; do
        [[ -z "$bfile" ]] && continue
        local code
        code=$(_fw_strip_comments_c "$bfile")
        # 合规：@Jacksonized 出现，或同时有 @NoArgsConstructor 与 @AllArgsConstructor，或显式 @JsonDeserialize(builder=
        if printf '%s\n' "$code" | grep -qE '@Jacksonized\b'; then continue; fi
        if printf '%s\n' "$code" | grep -qE '@NoArgsConstructor\b' && printf '%s\n' "$code" | grep -qE '@AllArgsConstructor\b'; then continue; fi
        if printf '%s\n' "$code" | grep -qE '@JsonDeserialize\s*\(\s*builder\s*='; then continue; fi
        bwarn="${bwarn}${bfile}
"
      done <<< "$builder_files"
      _fw_report warn fw_lombok_builder_jackson "$bwarn" "@Builder 用于 Jackson 反序列化须配 @Jacksonized 或 @NoArgsConstructor+@AllArgsConstructor（裸 @Builder 仅生成 package-private 全参构造，Jackson 反序列化 InvalidDefinitionException）" "@Builder 均配 Jackson 协议"
    fi
  fi

  # ====================================================================
  # fw_lombok_requiredargs_circular(warn)：两类互引 final 字段 + 均带 @RequiredArgsConstructor/@AllArgsConstructor → warn
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_lombok_requiredargs_circular: 无 Java 源文件，跳过"
  else
    # 取所有带 @RequiredArgsConstructor 或 @AllArgsConstructor 的文件，扫描类间互引 final 字段
    local cfile ctor_files=""
    for cfile in "${srcarr[@]}"; do
      if _fw_strip_comments_c "$cfile" | grep -qE '@RequiredArgsConstructor\b|@AllArgsConstructor\b'; then
        ctor_files="${ctor_files}${cfile}
"
      fi
    done
    if [[ -z "$ctor_files" ]]; then
      pass "fw_lombok_requiredargs_circular: 无 @RequiredArgsConstructor/@AllArgsConstructor 用法（代码行），跳过"
    else
      local circ_warn=""
      # 简化扫描：对每个 ctor 文件，提取其引用的其他本模块 ctor 文件的类名作为 final 字段类型（粗匹配）
      local cfa=()
      while IFS= read -r ln; do [[ -n "$ln" ]] && cfa+=("$ln"); done <<< "$ctor_files"
      for cfile in "${cfa[@]}"; do
        # 本文件类名（从代码行提取，忽略 javadoc）
        local my_cls other_cls other_file
        # SIGPIPE 加固（head 截断致 grep SIGPIPE，在 $() 末尾加 || true）
        my_cls=$(_fw_strip_comments_c "$cfile" | grep -E '^\s*(public\s+)?(final\s+|abstract\s+)*class\s+\w+' | head -1 | sed -E 's/.*class[[:space:]]+([A-Za-z_][A-Za-z0-9_]*).*/\1/' || true)
        [[ -z "$my_cls" ]] && continue
        # 找本文件引用的其他 ctor 文件类作为 final 字段类型
        for other_file in "${cfa[@]}"; do
          [[ "$other_file" == "$cfile" ]] && continue
          other_cls=$(_fw_strip_comments_c "$other_file" | grep -E '^\s*(public\s+)?(final\s+|abstract\s+)*class\s+\w+' | head -1 | sed -E 's/.*class[[:space:]]+([A-Za-z_][A-Za-z0-9_]*).*/\1/' || true)
          [[ -z "$other_cls" ]] && continue
          # 本文件含 "private final <other_cls>" 且对方文件含 "private final <my_cls>" → 互引
          if _fw_strip_comments_c "$cfile" | grep -qE "private[[:space:]]+final[[:space:]]+${other_cls}\b" \
             && _fw_strip_comments_c "$other_file" | grep -qE "private[[:space:]]+final[[:space:]]+${my_cls}\b"; then
            circ_warn="${circ_warn}${cfile} <-> ${other_file}
"
          fi
        done
      done
      # 去重（A<->B 与 B<->A 算一对）
      circ_warn=$(printf '%s\n' "$circ_warn" |  grep -E '.+' | sort -u)
      _fw_report warn fw_lombok_requiredargs_circular "$circ_warn" "检出两类互引 final 字段 + 均带 @RequiredArgsConstructor/@AllArgsConstructor（Spring 6 默认禁循环依赖，启动期 BeanCurrentlyInCreationException）" "未检出明显的构造注入互引循环"
    fi
  fi

  # ====================================================================
  # fw_lombok_equals_callsuper(warn)：@EqualsAndHashCode 无 callSuper= 且 extends 非 Object → warn
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_lombok_equals_callsuper: 无 Java 源文件，跳过"
  else
    local eoh_bad="" efile
    eoh_bad=""
    for efile in "${srcarr[@]}"; do
      local code eoh_in_file
      code=$(_fw_strip_comments_c "$efile")
      eoh_in_file=$(printf '%s\n' "$code" | grep -E '@EqualsAndHashCode\b' || true)
      [[ -z "$eoh_in_file" ]] && continue
      # 已显式声明 callSuper= → 跳过
      if printf '%s\n' "$eoh_in_file" | grep -qE 'callSuper\s*='; then continue; fi
      # 所在类 extends 非 Object（粗匹配：代码行含 "class Xxx extends Yyy" 且 Yyy 非 Object）
      if printf '%s\n' "$code" | grep -E 'class[[:space:]]+[A-Za-z_][A-Za-z0-9_]*[[:space:]]+extends[[:space:]]+' \
         | grep -qvE 'extends[[:space:]]+Object\b'; then
        eoh_bad="${eoh_bad}${efile}
"
      fi
    done
    _fw_report warn fw_lombok_equals_callsuper "$eoh_bad" "@EqualsAndHashCode 未声明 callSuper= 且类继承非 Object（子类 equals 漏父类字段，须显式 callSuper=true/false 消除 warning）" "@EqualsAndHashCode 均显式声明 callSuper 或无 extends"
  fi

  # ====================================================================
  # fw_lombok_equals_lazy(warn)：@EqualsAndHashCode 无 exclude=/of= + 类含 @OneToMany/@ManyToOne/@ManyToMany/@OneToOne → warn
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_lombok_equals_lazy: 无 Java 源文件，跳过"
  else
    local lfile lazy_bad=""
    lazy_bad=""
    for lfile in "${srcarr[@]}"; do
      local code
      code=$(_fw_strip_comments_c "$lfile")
      # 含 @EqualsAndHashCode
      if ! printf '%s\n' "$code" | grep -qE '@EqualsAndHashCode\b'; then continue; fi
      # 含 JPA 关联注解
      if ! printf '%s\n' "$code" | grep -qE '@(OneToMany|ManyToOne|ManyToMany|OneToOne)\b'; then continue; fi
      # @EqualsAndHashCode 行无 exclude=/of=；且无字段级 @EqualsAndHashCode.Exclude（粗扫）
      local eoh_in_file has_excl=0
      eoh_in_file=$(printf '%s\n' "$code" | grep -E '@EqualsAndHashCode\b' || true)
      if printf '%s\n' "$eoh_in_file" | grep -qE '(exclude|of)\s*='; then has_excl=1; fi
      if printf '%s\n' "$code" | grep -qE '@EqualsAndHashCode\.Exclude\b'; then has_excl=1; fi
      if [[ "$has_excl" -eq 0 ]]; then
        lazy_bad="${lazy_bad}${lfile}
"
      fi
    done
    _fw_report warn fw_lombok_equals_lazy "$lazy_bad" "@EqualsAndHashCode 未排除 JPA 关联字段（懒加载字段进 equals/hashCode 触发 LazyInitializationException，须 exclude=/of= 或 @EqualsAndHashCode.Exclude）" "@EqualsAndHashCode 已排除关联字段或无 JPA 关联"
  fi

  # ====================================================================
  # fw_lombok_sneaky_throws(warn)：@SneakyThrows 在 Service/Controller/Facade/Api 类 → warn
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_lombok_sneaky_throws: 无 Java 源文件，跳过"
  else
    local sfile st_bad=""
    st_bad=""
    for sfile in "${srcarr[@]}"; do
      local code
      code=$(_fw_strip_comments_c "$sfile")
      # 代码行有 @SneakyThrows
      if ! printf '%s\n' "$code" | grep -qE '@SneakyThrows'; then continue; fi
      # 类名含 Service/Controller/Facade/Api（粗匹配文件路径或类名）
      if printf '%s\n' "$sfile" | grep -qE '(Service|Controller|Facade|Api)\.java$'; then
        st_bad="${st_bad}${sfile}
"
      fi
    done
    _fw_report warn fw_lombok_sneaky_throws "$st_bad" "@SneakyThrows 出现在 Service/Controller/Facade/Api 类（隐藏受检异常破坏契约，调用方无法 catch，须 throws 声明或 wrap 业务异常）" "@SneakyThrows 仅在 util/lambda 等狭窄场景"
  fi

  # ====================================================================
  # fw_lombok_cleanup(warn)：@Cleanup 命中 → warn 改 try-with-resources
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_lombok_cleanup: 无 Java 源文件，跳过"
  else
    local cfile cu_hits=""
    for cfile in "${srcarr[@]}"; do
      local code
      code=$(_fw_strip_comments_c "$cfile")
      if printf '%s\n' "$code" | grep -qE '@Cleanup'; then
        cu_hits="${cu_hits}${cfile}
"
      fi
    done
    _fw_report warn fw_lombok_cleanup "$cu_hits" "检出 @Cleanup（JDK 7+ 优先 try-with-resources：@Cleanup 清理方法抛异常会掩盖原异常，多资源嵌套关闭顺序敏感）" "无 @Cleanup 用法"
  fi

  # ====================================================================
  # fw_lombok_val_usage(warn)：val/var 声明 + import lombok.val/var → warn 改 Java 原生 var
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_lombok_val_usage: 无 Java 源文件，跳过"
  else
    local vfile val_imports="" val_hits=""
    for vfile in "${srcarr[@]}"; do
      local code
      code=$(_fw_strip_comments_c "$vfile")
      # import lombok.val/var （import 行也算代码行，未被 _fw_strip_comments_c 过滤）
      if ! printf '%s\n' "$code" | grep -qE '^import[[:space:]]+lombok\.(val|var);'; then continue; fi
      val_imports="${val_imports}${vfile}
"
      if printf '%s\n' "$code" | grep -qE '\b(val|var)[[:space:]]+[A-Za-z_]'; then
        val_hits="${val_hits}${vfile}
"
      fi
    done
    if [[ -z "$val_imports" ]]; then
      pass "fw_lombok_val_usage: 无 import lombok.val/var"
    elif [[ -n "$val_hits" ]]; then
      warn "fw_lombok_val_usage: 检出 lombok val/var（JDK 10+ 项目优先 Java 原生 var；val 复合类型推断取最接近父类而非接口易踩坑）:
${val_hits}"
    else
      pass "fw_lombok_val_usage: import 存在但无 val/var 声明"
    fi
  fi

  # ====================================================================
  # fw_lombok_getter_lazy(warn)：@Getter(... lazy=true ...) → warn 核对
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_lombok_getter_lazy: 无 Java 源文件，跳过"
  else
    local gfile gl_hits=""
    for gfile in "${srcarr[@]}"; do
      local code
      code=$(_fw_strip_comments_c "$gfile")
      if printf '%s\n' "$code" | grep -qE '@Getter\s*\([^)]*lazy\s*=\s*true'; then
        gl_hits="${gl_hits}${gfile}
"
      fi
    done
    _fw_report warn fw_lombok_getter_lazy "$gl_hits" "检出 @Getter(lazy=true)（字段类型被改写为 AtomicReference，禁止直接访问字段；几乎总被访问的场景直接初始化更省；不可变对象才用 cacheStrategy）" "无 @Getter(lazy=true) 用法"
  fi

  # ====================================================================
  # fw_lombok_nonnull_validation(warn)：@Valid DTO 字段标 lombok @NonNull 但缺 jakarta @NotNull → warn
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_lombok_nonnull_validation: 无 Java 源文件，跳过"
  else
    # 找带 @Valid 的类（DTO 边界）
    local nfile nn_bad=""
    nn_bad=""
    for nfile in "${srcarr[@]}"; do
      local code
      code=$(_fw_strip_comments_c "$nfile")
      # 含 @Valid（代码行，排除 javadoc）
      if ! printf '%s\n' "$code" | grep -qE '@Valid\b'; then continue; fi
      # 字段标 lombok @NonNull（lombok.NonNull 或裸 @NonNull）
      if ! printf '%s\n' "$code" | grep -qE '@(lombok\.)?NonNull\b'; then continue; fi
      # 缺 jakarta.validation.constraints.NotNull
      if ! printf '%s\n' "$code" | grep -qE '@(jakarta\.validation\.constraints\.)?NotNull\b'; then
        nn_bad="${nn_bad}${nfile}
"
      fi
    done
    _fw_report warn fw_lombok_nonnull_validation "$nn_bad" "@Valid DTO 标 lombok @NonNull 但缺 jakarta.validation @NotNull（@NonNull 仅方法入口 fail-fast，不接入 Bean Validation pipeline，请求体 null 字段会进 Service 抛 NPE 而非 400）" "@Valid DTO 的 @NonNull 字段均已配 jakarta @NotNull 或无 lombok @NonNull"
  fi

  # ====================================================================
  # fw_lombok_config(warn)：PROJECT_DIR 根无 lombok.config 或无 config.stopBubbling → warn
  # ====================================================================
  local pd="${PROJECT_DIR:-}"
  if [[ -z "$pd" || ! -d "$pd" ]]; then
    pass "fw_lombok_config: PROJECT_DIR 未配置，跳过"
  else
    local cfg_found cfg_stop
    cfg_found=$(find "$pd" -maxdepth 2 -type f -name 'lombok.config' 2>/dev/null | head -1 || true)
    if [[ -z "$cfg_found" ]]; then
      warn "fw_lombok_config: PROJECT_DIR 根（含子目录 2 层）无 lombok.config（多模块项目默认值漂移：copyJacksonAnnotationsToAccessors/equalsAndHashCode.callSuper/log.fieldName 等行为不一致；建议根目录放 lombok.config + config.stopBubbling=true）"
    else
      if grep -qE 'config\.stopBubbling' "$cfg_found" 2>/dev/null; then
        pass "fw_lombok_config: 检出 lombok.config 且含 config.stopBubbling ($cfg_found)"
      else
        warn "fw_lombok_config: 检出 lombok.config 但缺 config.stopBubbling（建议加 config.stopBubbling = true 防止子目录默认值漂移）:
${cfg_found}"
      fi
    fi
  fi

  # ====================================================================
  # fw_lombok_mapstruct(warn)：lombok + mapstruct 同项目须 lombok.anyConstructor.addConstructorProperties=true
  # ====================================================================
  local has_lombok_dep=0 has_mapstruct_dep=0 cfg_addctor=0
  if [[ -n "$pd" && -d "$pd" ]]; then
    if grep -rqE 'org\.projectlombok:lombok|org\.projectlombok[[:space:]]*:' "$pd" 2>/dev/null \
       --include='pom.xml' --include='build.gradle' --include='build.gradle.kts'; then
      has_lombok_dep=1
    fi
    if grep -rqE 'org\.mapstruct:mapstruct' "$pd" 2>/dev/null \
       --include='pom.xml' --include='build.gradle' --include='build.gradle.kts'; then
      has_mapstruct_dep=1
    fi
    if [[ "$has_lombok_dep" -eq 1 && "$has_mapstruct_dep" -eq 1 ]]; then
      # 检查 lombok.config 是否含 lombok.anyConstructor.addConstructorProperties = true
      local cfg_files cfg
      cfg_files=$(find "$pd" -maxdepth 3 -type f -name 'lombok.config' 2>/dev/null || true)
      while IFS= read -r cfg; do
        [[ -z "$cfg" ]] && continue
        if grep -qE 'lombok\.anyConstructor\.addConstructorProperties[[:space:]]*=[[:space:]]*true' "$cfg" 2>/dev/null; then
          cfg_addctor=1
          break
        fi
      done <<< "$cfg_files"
      if [[ "$cfg_addctor" -eq 1 ]]; then
        pass "fw_lombok_mapstruct: lombok + mapstruct 共存且 lombok.config 含 addConstructorProperties=true"
      else
        warn "fw_lombok_mapstruct: lombok + mapstruct 共存但 lombok.config 缺 lombok.anyConstructor.addConstructorProperties=true（MapStruct 据此选构造器，缺失致 mapper 生成空/编译错；另须 lombok processor 先于 mapstruct processor）"
      fi
    else
      pass "fw_lombok_mapstruct: 未同时引入 lombok 与 mapstruct，跳过"
    fi
  else
    pass "fw_lombok_mapstruct: PROJECT_DIR 未配置，跳过"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
