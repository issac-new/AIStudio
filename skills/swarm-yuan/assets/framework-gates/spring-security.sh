# ruleset: spring-security  requires_conf: SPRINGSEC_SRC_GLOBS
# gates: fw_ssec_adapter(fail) fw_ssec_password_encoder(fail) fw_ssec_plaintext_password(fail) fw_ssec_default_password_encoder(fail) fw_ssec_jwt_secret(fail) fw_ssec_csrf(warn) fw_ssec_preauthorize_concat(warn) fw_ssec_cors_wildcard_creds(warn) fw_ssec_cors_config(warn) fw_ssec_role_prefix(warn) fw_ssec_method_security(warn) fw_ssec_session_fixation(warn) fw_ssec_remember_me_key(warn) fw_ssec_oauth2_redirect(warn) fw_ssec_deprecated_api(warn)
# harvested-from: P2（2026-07-17），规律源自 Spring Security 6.4.x/7.x 官方 reference 文档
_fw_spring_security_check() {
  echo "  [spring-security] Spring Security 6.4.x / 7.x 框架规律"

  # ---------- 收集源文件清单（Java + 配置/构建文件统一入 srcarr） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${SPRINGSEC_SRC_GLOBS[@]+"${SPRINGSEC_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "spring-security: SPRINGSEC_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # 拆分 Java 文件 vs 配置/构建文件
  local javaarr=() cfgarr=()
  local f
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      *.java) javaarr+=("$f") ;;
      *.yml|*.yaml|*.properties|pom.xml|build.gradle|*.gradle|*.gradle.kts) cfgarr+=("$f") ;;
    esac
  done

  # ====================================================================
  # fw_ssec_adapter(fail)：extends WebSecurityConfigurerAdapter 已移除
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local ad_hits
    ad_hits=$(grep -rnE 'extends[[:space:]]+WebSecurityConfigurerAdapter' "${javaarr[@]}" 2>/dev/null || true)
    _fw_report fail fw_ssec_adapter "${ad_hits}" "检出 extends WebSecurityConfigurerAdapter（6.x 起移除，须改 SecurityFilterChain Bean + lambda DSL）" "无 WebSecurityConfigurerAdapter 继承"
  else
    pass "fw_ssec_adapter: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_ssec_password_encoder(fail)：禁用 NoOp/MD5/SHA1 等弱哈希 Encoder
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local pe_hits
    pe_hits=$(grep -rnE 'NoOpPasswordEncoder|Md5PasswordEncoder|MessageDigestPasswordEncoder|StandardPasswordEncoder|SHAPasswordEncoder|LdapShaPasswordEncoder' "${javaarr[@]}" 2>/dev/null || true)
    _fw_report fail fw_ssec_password_encoder "${pe_hits}" "检出弱哈希 PasswordEncoder（须 BCryptPasswordEncoder/Argon2PasswordEncoder/DelegatingPasswordEncoder，CWE-327）" "未检出弱哈希 PasswordEncoder"
  else
    pass "fw_ssec_password_encoder: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_ssec_plaintext_password(fail)：.password("字面量") 明文存储
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local pp_hits
    pp_hits=$(grep -rnE '\.password\("[^"{]' "${javaarr[@]}" 2>/dev/null | grep -vE 'passwordEncoder|\.encode\(' || true)
    _fw_report fail fw_ssec_plaintext_password "${pp_hits}" "检出 .password(\"字面量\") 明文密码（须 encoder.encode(...) 或 {id} 前缀，CWE-256）" "未检出明文 .password(...) 字面量"
  else
    pass "fw_ssec_plaintext_password: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_ssec_default_password_encoder(fail)：withDefaultPasswordEncoder 仅 demo
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local dpe_hits
    dpe_hits=$(grep -rnE 'withDefaultPasswordEncoder' "${javaarr[@]}" 2>/dev/null || true)
    _fw_report fail fw_ssec_default_password_encoder "${dpe_hits}" "检出 User.withDefaultPasswordEncoder（官方标注仅 demo，禁进生产）" "未检出 withDefaultPasswordEncoder"
  else
    pass "fw_ssec_default_password_encoder: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_ssec_jwt_secret(fail)：JWT/密钥硬编码（Java 字面量 + yml 长字面量）
  # ====================================================================
  local js_hits=""
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    js_hits=$(grep -rnE 'signWith\("[^"]+"|hmacShaKeyFor\("[^"]+"\.getBytes|MacProvider\.generateKey\(\)|secretKey\("[^"]+"' "${javaarr[@]}" 2>/dev/null || true)
    [[ -n "$js_hits" ]] && js_hits="${js_hits}
"
  fi
  local c
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    case "$(basename "$c")" in
      pom.xml|*.gradle|*.gradle.kts) continue ;;
    esac
    local ln
    ln=$(grep -nE 'secret[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9+/=_-]{16,}' "$c" 2>/dev/null | grep -vE '\$\{|ENC\(|cipher' || true)
    [[ -n "$ln" ]] && js_hits="${js_hits}${c}:${ln}
"
  done
  _fw_report fail fw_ssec_jwt_secret "${js_hits}" "检出硬编码密钥（须外部化 \${ENV}/KMS/Vault 并支持轮换，CWE-321）" "未检出硬编码密钥"

  # ====================================================================
  # fw_ssec_csrf(warn)：csrf disable 须人工确认无状态 REST
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local csrf_hits
    csrf_hits=$(grep -rnE 'csrf[[:space:]]*\(.*disable|AbstractHttpConfigurer::disable|\.csrf\(\)\.disable' "${javaarr[@]}" 2>/dev/null || true)
    _fw_report warn fw_ssec_csrf "${csrf_hits}" "检出 CSRF 关闭（仅无状态 REST + 非 Cookie 认证可关，表单/会话场景必须开 CWE-352）" "未检出 CSRF 关闭"
  else
    pass "fw_ssec_csrf: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_ssec_preauthorize_concat(warn)：@PreAuthorize 字符串拼接 SpEL 注入面
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local pa_hits
    pa_hits=$(grep -rnE '@(PreAuthorize|PostAuthorize)\(' "${javaarr[@]}" 2>/dev/null | grep -E '"' | grep -E '\+' || true)
    _fw_report warn fw_ssec_preauthorize_concat "${pa_hits}" "检出 @PreAuthorize/@PostAuthorize 字符串拼接（SpEL 注入面，须改 #param 变量引用 CWE-943）" "未检出 SpEL 字符串拼接"
  else
    pass "fw_ssec_preauthorize_concat: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_ssec_cors_wildcard_creds(warn)：通配源 + allowCredentials(true) 同现
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local cc_bad="" j
    for j in "${javaarr[@]}"; do
      if grep -qE 'allowedOrigin(s|Patterns)\([^)]*"[*]"' "$j" 2>/dev/null; then
        if grep -qE 'allowCredentials\(true\)' "$j" 2>/dev/null; then
          cc_bad="${cc_bad}${j}
"
        fi
      fi
    done
    _fw_report warn fw_ssec_cors_wildcard_creds "${cc_bad}" "检出通配 CORS 源 + allowCredentials(true) 同现（须枚举精确源 CWE-942）" "未检出通配源+凭据同现"
  else
    pass "fw_ssec_cors_wildcard_creds: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_ssec_cors_config(warn)：CorsConfigurationSource 须在链上 .cors() 启用
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local has_cors_src=0 has_cors_chain=0
    if grep -lqE 'CorsConfigurationSource|CorsFilter' "${javaarr[@]}" 2>/dev/null; then
      has_cors_src=1
    fi
    if grep -lqE '\.cors\(' "${javaarr[@]}" 2>/dev/null; then
      has_cors_chain=1
    fi
    if [[ "$has_cors_src" -eq 1 && "$has_cors_chain" -eq 0 ]]; then
      warn "fw_ssec_cors_config: 检出 CorsConfigurationSource/CorsFilter 但 SecurityFilterChain 无 .cors(...)（预检请求将被认证过滤器拦截 401）"
    else
      pass "fw_ssec_cors_config: CORS 链上配置一致或无 CORS"
    fi
  else
    pass "fw_ssec_cors_config: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_ssec_role_prefix(warn)：hasRole("ROLE_...") 双前缀
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local rp_hits
    rp_hits=$(grep -rnE 'has(Role|AnyRole)\("ROLE_' "${javaarr[@]}" 2>/dev/null || true)
    _fw_report warn fw_ssec_role_prefix "${rp_hits}" "检出 hasRole/hasAnyRole(\"ROLE_...\")（hasRole 自动补 ROLE_ 前缀，实际校验 ROLE_ROLE_X 静默失效）" "未检出 hasRole 双前缀"
  else
    pass "fw_ssec_role_prefix: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_ssec_method_security(warn)：@PreAuthorize 须 @EnableMethodSecurity 激活
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local has_pre=0 has_enable=0
    if grep -lqE '@(PreAuthorize|PostAuthorize)\b' "${javaarr[@]}" 2>/dev/null; then
      has_pre=1
    fi
    if grep -lqE '@EnableMethodSecurity|@EnableGlobalMethodSecurity' "${javaarr[@]}" 2>/dev/null; then
      has_enable=1
    fi
    if [[ "$has_pre" -eq 1 && "$has_enable" -eq 0 ]]; then
      warn "fw_ssec_method_security: 检出 @PreAuthorize 但无 @EnableMethodSecurity（注解静默失效，接口无鉴权 CWE-862）"
    else
      pass "fw_ssec_method_security: 方法级安全注解与 @EnableMethodSecurity 匹配"
    fi
  else
    pass "fw_ssec_method_security: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_ssec_session_fixation(warn)：sessionFixation none 禁
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local sf_hits
    sf_hits=$(grep -rnE 'sessionFixation' "${javaarr[@]}" 2>/dev/null | grep -iE 'none' || true)
    _fw_report warn fw_ssec_session_fixation "${sf_hits}" "检出 sessionFixation none（关闭会话固定防护，CWE-384；默认 migrateSession 应保持）" "未检出 sessionFixation none"
  else
    pass "fw_ssec_session_fixation: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_ssec_remember_me_key(warn)：rememberMe 须显式 key
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local rm_bad="" j
    for j in "${javaarr[@]}"; do
      if grep -qE '\.rememberMe\(|rememberMe\(' "$j" 2>/dev/null; then
        if ! grep -qE '\.key\(' "$j" 2>/dev/null; then
          rm_bad="${rm_bad}${j}
"
        fi
      fi
    done
    _fw_report warn fw_ssec_remember_me_key "${rm_bad}" "检出 rememberMe 未显式 .key(...)（随机 key 重启/多实例失效；key 须外部化管理）" "rememberMe 均显式 key 或无 rememberMe"
  else
    pass "fw_ssec_remember_me_key: 无 Java 源文件，跳过"
  fi

  # ====================================================================
  # fw_ssec_oauth2_redirect(warn)：redirect-uri 禁通配
  # ====================================================================
  local or_hits=""
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    case "$(basename "$c")" in
      pom.xml|*.gradle|*.gradle.kts) continue ;;
    esac
    local ln
    ln=$(grep -nE 'redirect-uri.*\*' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && or_hits="${or_hits}${c}:${ln}
"
  done
  _fw_report warn fw_ssec_oauth2_redirect "${or_hits}" "检出 redirect-uri 通配（授权码可被重定向到攻击者域名，须精确匹配 CWE-601）" "未检出 redirect-uri 通配"

  # ====================================================================
  # fw_ssec_deprecated_api(warn)：antMatchers/authorizeRequests 已移除
  # ====================================================================
  if [[ ${#javaarr[@]} -gt 0 ]]; then
    local dp_hits
    dp_hits=$(grep -rnE 'antMatchers\(|\.authorizeRequests\(' "${javaarr[@]}" 2>/dev/null || true)
    _fw_report warn fw_ssec_deprecated_api "${dp_hits}" "检出 antMatchers/authorizeRequests（7.x 已移除，迁 requestMatchers/authorizeHttpRequests lambda DSL）" "未检出 7.x 已移除 API"
  else
    pass "fw_ssec_deprecated_api: 无 Java 源文件，跳过"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
