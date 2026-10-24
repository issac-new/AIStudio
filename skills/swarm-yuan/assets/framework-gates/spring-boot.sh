# ruleset: spring-boot  requires_conf: SPRINGBOOT_SRC_GLOBS SPRINGBOOT_CONFIG_FILES
# gates: fw_sboot_transactional_selfinvoke(fail) fw_sboot_transactional_rollback(warn) fw_sboot_constructor_inject(warn) fw_sboot_proxy_bean_methods(warn) fw_sboot_profile_isolation(warn) fw_sboot_conditional_order(warn) fw_sboot_actuator_expose(fail) fw_sboot_devtools_in_prod(warn) fw_sboot_scan_scope(warn) fw_sboot_configprops_binding(warn) fw_sboot_jakarta_migration(fail) fw_sboot_circular_refs(warn) fw_sboot_banner_mode(warn) fw_sboot_datasource_pool(warn)
# harvested-from: P2 范例（2026-07-17），规律源自 Spring Boot 3.4.x / 4.0.x 官方文档与迁移指南
_fw_spring_boot_check() {
  echo "  [spring-boot] Spring Boot 3.4.x / 4.0.x 框架规律"

  # ---------- 收集 Java 源文件清单 ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${SPRINGBOOT_SRC_GLOBS[@]+"${SPRINGBOOT_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  # ---------- 收集配置文件清单 ----------
  local cfgs cfgarr=()
  cfgs=$(_fw_resolve_globs ${SPRINGBOOT_CONFIG_FILES[@]+"${SPRINGBOOT_CONFIG_FILES[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && cfgarr+=("$ln")
  done <<< "$cfgs"

  # 代码正文过滤：调公共库 _fw_strip_comments_c（C 系，剔 // 与 javadoc 块注释行）

  # ====================================================================
  # fw_sboot_transactional_selfinvoke(fail)：@Transactional 同类自调用不走代理
  # 检测：同一类内 @Transactional 标注方法 被本类其他方法直接调用（方法名( 出现且无 self./proxy. 前缀）
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_sboot_transactional_selfinvoke: 无 Java 源文件，跳过"
  else
    local selfinvoke_bad="" sfile
    for sfile in "${srcarr[@]}"; do
      local code
      code=$(_fw_strip_comments_c "$sfile")
      # R121：剥掉 new Xxx( 构造形态——提取端正则曾把 "new" 当返回类型、构造类名当
      # 方法名收入 tx_methods（如 IllegalArgumentException），命中端又以"空格+类名("
      # 形态复现同一误报（真实项目 OrderService 抛 IllegalArgumentException 实测中招）。
      # 占位符本身也会被提取正则再当方法名，故替换为空；提取端捕获组另限小写开头
      # （Java 方法名惯例小写、类名大写），大写构造形态双保险挡在候选之外。
      local code_nc
      code_nc=$(printf '%s\n' "$code" | sed -E 's/new[[:space:]]+[A-Z][A-Za-z0-9_]*[[:space:]]*\(//g')
      # 提取 @Transactional 标注的方法名（@Transactional 后若干行内的 "方法名(" 形式）
      local tx_methods
      tx_methods=$(printf '%s\n' "$code_nc" | grep -A3 -E '^[[:space:]]*@Transactional\b' \
        | grep -oE '\b(public|protected|private)?[[:space:]]*(static[[:space:]]+)?[A-Za-z_][][A-Za-z0-9_<>,.[]*[[:space:]]+([a-z][a-zA-Z0-9_]*)\(' \
        | sed -E 's/.*[[:space:]]([a-zA-Z_][a-zA-Z0-9_]*)\(/\1/' | sort -u)
      [[ -z "$tx_methods" ]] && continue
      local m
      for m in $tx_methods; do
        # 同类内出现裸调用 this.m() 或 m()（排除定义行与 .m() 链式调用）
        local hits
        hits=$(printf '%s\n' "$code_nc" | grep -nE "(this\.$m\(|[^.A-Za-z_]$m\()" | grep -vE "@|public|protected|private" || true)
        if [[ -n "$hits" ]]; then
          selfinvoke_bad="${selfinvoke_bad}${sfile}: @Transactional 方法 ${m} 同类自调用
${hits}
"
        fi
      done
    done
    _fw_report fail fw_sboot_transactional_selfinvoke "$selfinvoke_bad" "@Transactional 同类自调用不走代理，事务失效（须自注入代理或拆 Bean）" "未检出 @Transactional 同类自调用"
  fi

  # ====================================================================
  # fw_sboot_transactional_rollback(warn)：checked 异常须显式 rollbackFor
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_sboot_transactional_rollback: 无 Java 源文件，跳过"
  else
    local rb_bad="" sfile
    for sfile in "${srcarr[@]}"; do
      local code
      code=$(_fw_strip_comments_c "$sfile")
      # @Transactional 未含 rollbackFor 且方法签名 throws checked 异常（非 RuntimeException 子类按名启发）
      local no_rb
      no_rb=$(printf '%s\n' "$code" | grep -nE '@Transactional\b' | grep -vE 'rollbackFor|rollbackForClassName' || true)
      [[ -z "$no_rb" ]] && continue
      # 该 @Transactional 后 5 行内方法签名 throws 非 RuntimeException
      local ln
      while IFS= read -r ln; do
        local lineno=${ln%%:*}
        local chunk
        chunk=$(printf '%s\n' "$code" | sed -n "$((lineno)),$((lineno+5))p")
        if printf '%s\n' "$chunk" | grep -qE 'throws[[:space:]]+.*Exception'; then
          # 排除显式 RuntimeException/RuntimeException.class
          if ! printf '%s\n' "$chunk" | grep -qE 'rollbackFor'; then
            rb_bad="${rb_bad}${sfile}:${lineno} @Transactional 未声明 rollbackFor 但 throws checked 异常
"
          fi
        fi
      done <<< "$no_rb"
    done
    _fw_report warn fw_sboot_transactional_rollback "$rb_bad" "@Transactional 默认仅回滚 RuntimeException，checked 异常须显式 rollbackFor" "未检出 checked 异常回滚风险"
  fi

  # ====================================================================
  # fw_sboot_constructor_inject(warn)：@Autowired private 字段注入
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_sboot_constructor_inject: 无 Java 源文件，跳过"
  else
    local fi_hits
    fi_hits=$(grep -rnE '^[[:space:]]*@Autowired[[:space:]]*$|^[[:space:]]*@Autowired[[:space:]]+private[[:space:]]' "${srcarr[@]}" 2>/dev/null || true)
    # 兼容 @Autowired 换行 + 下一行 private
    local fi_hits2
    fi_hits2=$(grep -rnA1 -E '^[[:space:]]*@Autowired[[:space:]]*$' "${srcarr[@]}" 2>/dev/null | grep -E 'private[[:space:]]+[A-Za-z]' || true)
    if [[ -n "$fi_hits" || -n "$fi_hits2" ]]; then
      warn "fw_sboot_constructor_inject: 检出 @Autowired 字段注入（建议构造器注入，单构造器可省 @Autowired）:
${fi_hits}
${fi_hits2}"
    else
      pass "fw_sboot_constructor_inject: 未检出字段注入"
    fi
  fi

  # ====================================================================
  # fw_sboot_proxy_bean_methods(warn)：Lite @Configuration 中 @Bean 间直接调用
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_sboot_proxy_bean_methods: 无 Java 源文件，跳过"
  else
    local pxBad="" sfile
    for sfile in "${srcarr[@]}"; do
      local code
      code=$(_fw_strip_comments_c "$sfile")
      # 类含 proxyBeanMethods = false
      if ! printf '%s\n' "$code" | grep -qE '@Configuration\b[^)]*proxyBeanMethods[[:space:]]*=[[:space:]]*false'; then
        continue
      fi
      # 提取本类 @Bean 方法名
      local bean_methods
      bean_methods=$(printf '%s\n' "$code" | grep -A2 -E '^[[:space:]]*@Bean\b' \
        | grep -oE '\b(public|protected)?[[:space:]]*[A-Za-z_][][A-Za-z0-9_<>,. ]*[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*)\(' \
        | sed -E 's/.*[[:space:]]([a-zA-Z_][a-zA-Z0-9_]*)\(/\1/' | sort -u)
      [[ -z "$bean_methods" ]] && continue
      local m
      for m in $bean_methods; do
        # @Bean 方法体内直接调用另一个 @Bean 方法（方法名( 出现且非定义行）
        local hits
        hits=$(printf '%s\n' "$code" | grep -nE "([^A-Za-z_.]$m\(|this\.$m\()" | grep -vE "@Bean|public|protected|private" || true)
        if [[ -n "$hits" ]]; then
          pxBad="${pxBad}${sfile}: Lite @Configuration 中 @Bean 方法 ${m} 间直接调用（单例失效）
${hits}
"
        fi
      done
    done
    _fw_report warn fw_sboot_proxy_bean_methods "$pxBad" "proxyBeanMethods=false 的 @Configuration 中 @Bean 方法间直接调用（单例语义失效）" "未检出 Lite @Configuration @Bean 间单例失效"
  fi

  # ====================================================================
  # fw_sboot_profile_isolation(warn)：@Profile 误标在 @ConfigurationProperties
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_sboot_profile_isolation: 无 Java 源文件，跳过"
  else
    local pi_bad="" sfile
    for sfile in "${srcarr[@]}"; do
      local code
      code=$(_fw_strip_comments_c "$sfile")
      if printf '%s\n' "$code" | grep -qE '@ConfigurationProperties' \
        && printf '%s\n' "$code" | grep -qE '@Profile\b' \
        && ! printf '%s\n' "$code" | grep -qE '@Configuration\b|@Component\b'; then
        pi_bad="${pi_bad}${sfile}
"
      fi
    done
    _fw_report warn fw_sboot_profile_isolation "$pi_bad" "@Profile 标在 @ConfigurationProperties 上（属性绑定应与 profile 解耦，用 spring.config.activate.on-profile）" "未检出 @Profile 误标"
  fi

  # ====================================================================
  # fw_sboot_conditional_order(warn)：自定义 auto-config 须声明顺序
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_sboot_conditional_order: 无 Java 源文件，跳过"
  else
    local co_hits
    co_hits=$(grep -rlE '@ConditionalOnMissingBean' "${srcarr[@]}" 2>/dev/null || true)
    local co_bad=""
    local f
    for f in $co_hits; do
      [[ -z "$f" ]] && continue
      if ! grep -qE '@AutoConfigureBefore|@AutoConfigureAfter|@AutoConfigureOrder' "$f" 2>/dev/null; then
        co_bad="${co_bad}${f}
"
      fi
    done
    _fw_report warn fw_sboot_conditional_order "$co_bad" "含 @ConditionalOnMissingBean 但无 @AutoConfigureBefore/After/Order（自定义 auto-config 须声明顺序）" "未检出顺序缺失的 @ConditionalOnMissingBean"
  fi

  # ====================================================================
  # fw_sboot_actuator_expose(fail)：Actuator 端点暴露面收敛
  # ====================================================================
  if [[ ${#cfgarr[@]} -eq 0 ]]; then
    pass "fw_sboot_actuator_expose: 无配置文件，跳过"
  else
    local expo_hits="" cfile
    for cfile in "${cfgarr[@]}"; do
      local ln
      ln=$(grep -nE 'management\.endpoints\.web\.exposure\.include' "$cfile" 2>/dev/null || true)
      # 嵌套 YAML 还原点号键（management:\n  endpoints:... 惯用分层写法），与点平铺键同口径判定
      local flat
      flat=$(awk '
        /^[[:space:]]*(#|$)/ { next }
        {
          line = $0
          match(line, /^[[:space:]]*/)
          indent = RLENGTH
          sub(/^[[:space:]]*/, "", line)
          # 块列表项：上一命中键为 include 且缩进更深 → 取值
          if (line ~ /^-[[:space:]]/ && inc_path != "" && indent > inc_indent) {
            val = line; sub(/^-[[:space:]]*/, "", val)
            printf "%s=%s\n", inc_path, val
            next
          }
          if (line !~ /^[A-Za-z0-9_.-]+[[:space:]]*:/) next
          key = line
          sub(/[[:space:]]*:.*/, "", key)
          sub(/[[:space:]]+$/, "", key)
          while (depth > 0 && ind[depth] >= indent) depth--
          depth++
          ind[depth] = indent
          name[depth] = key
          path = name[1]
          for (i = 2; i <= depth; i++) path = path "." name[i]
          if (path == "management.endpoints.web.exposure.include" || path == "management.server.port") {
            val = line
            sub(/^[^:]*:[[:space:]]*/, "", val)
            printf "%s=%s\n", path, val
            if (path == "management.endpoints.web.exposure.include" && val == "") {
              inc_path = path; inc_indent = indent
            } else {
              inc_path = ""
            }
          } else {
            inc_path = ""
          }
        }
      ' "$cfile" 2>/dev/null || true)
      # 独立 management 端口隔离：点平铺键或嵌套 YAML 任一命中即视为已隔离
      local mgmt_port=0
      grep -qE 'management\.server\.port' "$cfile" 2>/dev/null && mgmt_port=1
      printf '%s\n' "$flat" | grep -q '^management\.server\.port=' && mgmt_port=1
      # 点平铺键判定（原有口径不变）
      if [[ -n "$ln" ]]; then
        # 值含 * 或敏感端点
        if printf '%s\n' "$ln" | grep -qE 'include:[[:space:]]*\*|include[[:space:]]*=[[:space:]]*\*|env|beans|heapdump|configprops|loggers'; then
          if [[ "$mgmt_port" -eq 0 ]]; then
            expo_hits="${expo_hits}${cfile}:${ln}
"
          fi
        fi
      fi
      # 嵌套 YAML 判定（值含 * 或敏感端点）
      local nested_inc
      nested_inc=$(printf '%s\n' "$flat" | grep '^management\.endpoints\.web\.exposure\.include=' || true)
      if [[ -n "$nested_inc" ]]; then
        if printf '%s\n' "$nested_inc" | grep -qE "include=['\"([]*\*|env|beans|heapdump|configprops|loggers"; then
          if [[ "$mgmt_port" -eq 0 ]]; then
            expo_hits="${expo_hits}${cfile}:${nested_inc}（嵌套 YAML）
"
          fi
        fi
      fi
    done
    _fw_report fail fw_sboot_actuator_expose "$expo_hits" "Actuator 端点暴露面过大（含 * 或敏感端点且无独立 management 端口，信息泄露 CWE-200）" "Actuator 端点暴露面已收敛"
  fi

  # ====================================================================
  # fw_sboot_devtools_in_prod(warn)：devtools 须 optional/provided
  # ====================================================================
  if [[ ${#cfgarr[@]} -eq 0 ]]; then
    pass "fw_sboot_devtools_in_prod: 无构建文件，跳过"
  else
    local dt_bad="" cfile
    for cfile in "${cfgarr[@]}"; do
      local bn
      bn=$(basename "$cfile")
      case "$bn" in
        pom.xml|build.gradle|*.gradle|*.gradle.kts)
          # 检出 devtools 依赖行
          local dtln
          dtln=$(grep -nE 'spring-boot-devtools' "$cfile" 2>/dev/null || true)
          [[ -z "$dtln" ]] && continue
          # pom: 检查该行附近是否含 <optional>true</optional> 或 <scope>provided</scope>
          if [[ "$bn" == "pom.xml" || "$bn" == *.xml ]]; then
            local lineno firstln
            firstln=$(printf '%s\n' "$dtln" | head -1 | cut -d: -f1)
            local win
            win=$(sed -n "$((firstln)),$((firstln+8))p" "$cfile" 2>/dev/null)
            if ! printf '%s\n' "$win" | grep -qE '<optional>true</optional>|<scope>provided</scope>'; then
              dt_bad="${dt_bad}${cfile}:${dtln}
"
            fi
          else
            # gradle: 须 developmentOnly configuration
            if ! grep -qE 'developmentOnly|compileOnly|providedRuntime' "$cfile" 2>/dev/null; then
              dt_bad="${dt_bad}${cfile}:${dtln}
"
            fi
          fi
          ;;
      esac
    done
    _fw_report warn fw_sboot_devtools_in_prod "$dt_bad" "spring-boot-devtools 未标 optional/provided/developmentOnly（生产 classpath 禁含）" "未检出 devtools 配置问题"
  fi

  # ====================================================================
  # fw_sboot_scan_scope(warn)：@SpringBootApplication 扫描范围
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_sboot_scan_scope: 无 Java 源文件，跳过"
  else
    local app_file=""
    local sfile
    for sfile in "${srcarr[@]}"; do
      if grep -qE '@SpringBootApplication' "$sfile" 2>/dev/null; then
        app_file="$sfile"
        break
      fi
    done
    if [[ -z "$app_file" ]]; then
      pass "fw_sboot_scan_scope: 未检出 @SpringBootApplication，跳过"
    else
      if grep -qE '@SpringBootApplication\([^)]*scanBasePackages' "$app_file" 2>/dev/null; then
        pass "fw_sboot_scan_scope: 已显式声明 scanBasePackages"
      else
        # 检查是否有其他 @Configuration 在启动类所在包的上层包（启发：package 行与启动类包比较）
        local app_pkg
        # SIGPIPE 加固（head 截断致 grep SIGPIPE，在 $() 末尾加 || true）
        app_pkg=$(grep -E '^package[[:space:]]+' "$app_file" 2>/dev/null | head -1 | sed -E 's/^package[[:space:]]+//; s/;.*//' || true)
        local deeper=0
        for sfile in "${srcarr[@]}"; do
          local pk
          pk=$(grep -E '^package[[:space:]]+' "$sfile" 2>/dev/null | head -1 | sed -E 's/^package[[:space:]]+//; s/;.*//' || true)
          # 其他文件包是启动类包的父包（启动类包以其他包为前缀）
          if [[ -n "$pk" && -n "$app_pkg" && "$app_pkg" == "$pk".* ]]; then
            deeper=1
            break
          fi
        done
        if [[ "$deeper" -eq 1 ]]; then
          warn "fw_sboot_scan_scope: @SpringBootApplication 在非根包且未声明 scanBasePackages（上层包组件不被扫描）:
${app_file}"
        else
          pass "fw_sboot_scan_scope: 启动类包范围合理"
        fi
      fi
    fi
  fi

  # ====================================================================
  # fw_sboot_configprops_binding(warn)：@ConfigurationProperties 须注册
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_sboot_configprops_binding: 无 Java 源文件，跳过"
  else
    local cp_hits
    cp_hits=$(grep -rlE '@ConfigurationProperties' "${srcarr[@]}" 2>/dev/null || true)
    local cp_bad=""
    local f
    for f in $cp_hits; do
      [[ -z "$f" ]] && continue
      if ! grep -qE '@Component|@ConfigurationPropertiesScan|@EnableConfigurationProperties' "${srcarr[@]}" 2>/dev/null; then
        # 文件自身也未含 @Component
        if ! grep -qE '@Component\b' "$f" 2>/dev/null; then
          cp_bad="${cp_bad}${f}
"
        fi
      fi
    done
    _fw_report warn fw_sboot_configprops_binding "$cp_bad" "@ConfigurationProperties 类未注册（须 @Component / @ConfigurationPropertiesScan / @EnableConfigurationProperties）" "@ConfigurationProperties 均已注册"
  fi

  # ====================================================================
  # fw_sboot_jakarta_migration(fail)：javax.* 须替换为 jakarta.*
  # ====================================================================
  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "fw_sboot_jakarta_migration: 无 Java 源文件，跳过"
  else
    local jx_hits
    jx_hits=$(grep -rnE 'import[[:space:]]+javax\.(servlet|persistence|validation|annotation\.(PostConstruct|PreDestroy)|transaction|mail|jms|websocket)' "${srcarr[@]}" 2>/dev/null || true)
    _fw_report fail fw_sboot_jakarta_migration "$jx_hits" "残留 javax.* 导入（Boot 3.0+ 须迁移至 jakarta.*，启动期 NoClassDefFoundError）" "未检出 javax.* 残留"
  fi

  # ====================================================================
  # fw_sboot_circular_refs(warn)：allow-circular-references=true
  # ====================================================================
  if [[ ${#cfgarr[@]} -eq 0 ]]; then
    pass "fw_sboot_circular_refs: 无配置文件，跳过"
  else
    local cr_hits=""
    local cfile
    for cfile in "${cfgarr[@]}"; do
      local ln
      ln=$(grep -nE 'allow-circular-references' "$cfile" 2>/dev/null || true)
      [[ -z "$ln" ]] && continue
      if printf '%s\n' "$ln" | grep -qE 'true'; then
        cr_hits="${cr_hits}${cfile}:${ln}
"
      fi
    done
    _fw_report warn fw_sboot_circular_refs "$cr_hits" "spring.main.allow-circular-references=true（反模式逃逸阀，建议重构消除循环依赖）" "未开启 allow-circular-references"
  fi

  # ====================================================================
  # fw_sboot_banner_mode(warn)：生产 profile 缺 banner-mode
  # ====================================================================
  if [[ ${#cfgarr[@]} -eq 0 ]]; then
    pass "fw_sboot_banner_mode: 无配置文件，跳过"
  else
    local has_banner=0 has_prod=0
    local cfile
    for cfile in "${cfgarr[@]}"; do
      if grep -qE 'spring\.main\.banner-mode' "$cfile" 2>/dev/null; then
        has_banner=1
      fi
      if grep -qE 'profiles\.active[[:space:]]*[:=][[:space:]]*prod|profiles:\s*active:\s*prod' "$cfile" 2>/dev/null; then
        has_prod=1
      fi
    done
    if [[ "$has_prod" -eq 1 && "$has_banner" -eq 0 ]]; then
      warn "fw_sboot_banner_mode: 生产 profile 缺 spring.main.banner-mode（默认 console，建议 log/off）"
    else
      pass "fw_sboot_banner_mode: banner-mode 已配置或非生产"
    fi
  fi

  # ====================================================================
  # fw_sboot_datasource_pool(warn)：DataSource 须显式连接池参数
  # ====================================================================
  if [[ ${#cfgarr[@]} -eq 0 ]]; then
    pass "fw_sboot_datasource_pool: 无配置文件，跳过"
  else
    local ds_bad="" cfile
    for cfile in "${cfgarr[@]}"; do
      if grep -qE 'spring\.datasource\.(url|jdbc-url)' "$cfile" 2>/dev/null \
        && ! grep -qE 'hikari\.maximum-pool-size|hikari\.max-pool-size|maximum-pool-size' "$cfile" 2>/dev/null; then
        ds_bad="${ds_bad}${cfile}
"
      fi
    done
    _fw_report warn fw_sboot_datasource_pool "$ds_bad" "配置含 datasource.url 但未显式 hikari.maximum-pool-size（默认 10 易连接耗尽）" "连接池参数已配置或无 datasource"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
