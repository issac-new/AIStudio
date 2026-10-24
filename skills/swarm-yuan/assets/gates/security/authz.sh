# gate: authz
# domain: security / enforce: strict / tier: compliance
check_authz() {
  echo "=== 授权类弱点检查（CWE-862/863/639/284：服务端授权覆盖）==="
  [[ ${#AUTHZ_SCAN_DIRS[@]} -eq 0 ]] && { skip_if_unconfigured "AUTHZ_SCAN_DIRS 未配置"; return; }
  # R118：配置的目录全部不存在=配置错误，不得 warn 后打印“通过”。
  local found=0 d f hits files pat existing=0
  for d in "${AUTHZ_SCAN_DIRS[@]}"; do
    [[ -d "$d" ]] && existing=$((existing+1))
  done
  if [[ "$existing" -eq 0 ]]; then
    fail "gate_authz_dirs_missing: AUTHZ_SCAN_DIRS 配置的目录全部不存在：${AUTHZ_SCAN_DIRS[*]}"
    return
  fi
  # 用户自定义授权正则先校验，非法 ERE 直接 fail（不能静默当无命中）。
  for pat in "${AUTHZ_EXTRA_PATTERNS[@]+"${AUTHZ_EXTRA_PATTERNS[@]}"}"; do
    [[ -z "$pat" ]] && continue
    if ! _regex_is_valid "$pat"; then
      fail "gate_authz_invalid_pattern: AUTHZ_EXTRA_PATTERNS 含非法 ERE：${pat}"
      return
    fi
  done
  local inc=(--include='*.java' --include='*.kt' --include='*.ts' --include='*.js' --include='*.py')
  for d in "${AUTHZ_SCAN_DIRS[@]}"; do
    if [[ ! -d "$d" ]]; then
      warn "AUTHZ_SCAN_DIRS 目录不存在：${d}（跳过该目录）"
      continue
    fi
    # —— 1. 敏感操作缺鉴权注解（粗放：文件含请求映射方法但全文无鉴权注解/安全配置声明）
    # R118：Spring Security 的标准做法是集中式 SecurityFilterChain；控制器无注解不等于未授权。
    # 先探测扫描面内是否存在集中式安全配置，存在时把“同文件无注解”降为 warn（须人工确认路由覆盖）。
    local _authz_central=0
    if grep -rqE '@EnableWebSecurity|SecurityFilterChain|WebSecurityConfigurerAdapter' "$d" "${inc[@]}" 2>/dev/null; then
      _authz_central=1
    fi
    files=$(grep -rlE '@(Get|Post|Put|Delete|Patch|Request)Mapping|@(app|router)\.(get|post|put|delete|patch)\(' "$d" "${inc[@]}" 2>/dev/null \
      | grep -viE 'node_modules|(^|/)(tests?|testdata|__tests__|fixtures?|mocks?)/|\.(test|spec)\.[a-z]+:' || true)
    while IFS= read -r f; do
      [[ -z "$f" ]] && continue
      if ! grep -qE '@PreAuthorize|@Secured|@RolesAllowed|SecurityFilter|@EnableWebSecurity|@RequiresPermissions|@PreAuth|@login_required|@jwt_required|Depends\([^)]*(auth|user|permission)' "$f" 2>/dev/null; then
        if [[ "$_authz_central" -eq 1 ]]; then
          warn "gate_authz_missing_check:${f}: 控制器无方法级鉴权注解，但扫描面存在集中式安全配置——须人工确认该路由被覆盖（CWE-862）"
        else
          fail "gate_authz_missing_check:${f}: 控制器含请求映射但无鉴权注解/安全配置（CWE-862 缺失授权）"
          found=1
        fi
      fi
    done <<< "$files"
    # —— 2. IDOR 风险：findById(request.…) / findById(…getParameter(…)) 用户可控主键直取 → fail
    hits=$(grep -rnE 'findById\(\s*request\.|findById\([^)]*getParameter\(' "$d" "${inc[@]}" 2>/dev/null \
      | grep -viE 'test|mock|node_modules' || true)
    if [[ -n "$hits" ]]; then
      while IFS= read -r f; do
        [[ -n "$f" ]] && fail "gate_authz_idor:${f}: 用户可控主键直取对象（IDOR 风险，CWE-639）"
      done <<< "$(printf '%s\n' "$hits" | cut -d: -f1 | sort -u)"
      found=1
    fi
    # —— 3. CORS 全放行且带凭据（allowedOrigins("*") 与 allowCredentials(true) 同文件并存）→ fail
    files=$(grep -rlE 'allowedOrigins\(\s*"\*"\s*\)|allowedOriginPatterns\(\s*"\*"\s*\)' "$d" "${inc[@]}" 2>/dev/null \
      | grep -viE 'test|mock|node_modules' || true)
    while IFS= read -r f; do
      [[ -z "$f" ]] && continue
      if grep -qE 'allowCredentials\(\s*true\s*\)' "$f" 2>/dev/null; then
        fail "gate_authz_permissive:${f}: CORS allowedOrigins(\"*\") 且 allowCredentials(true)（CWE-284 不当访问控制）"
        found=1
      fi
    done <<< "$files"
    # —— 4. permitAll() 全放行 → warn-only（可能为有意公开端点，须人工复核，不计 fail）
    hits=$(grep -rnE 'permitAll\(\)' "$d" "${inc[@]}" 2>/dev/null \
      | grep -viE 'test|mock|node_modules' || true)
    if [[ -n "$hits" ]]; then
      warn "permitAll() 全放行 $(printf '%s\n' "$hits" | wc -l | xargs) 处（warn-only，确认均为有意公开端点）："
      printf '%s\n' "$hits" | head -5 | sed 's/^/    /'
    fi
    # —— 5. 自定义授权风险模式（AUTHZ_EXTRA_PATTERNS）→ warn-only
    if [[ ${#AUTHZ_EXTRA_PATTERNS[@]} -gt 0 ]]; then
      for pat in "${AUTHZ_EXTRA_PATTERNS[@]}"; do
        [[ -z "$pat" ]] && continue
        hits=$(grep -rnE "$pat" "$d" "${inc[@]}" 2>/dev/null | grep -viE 'test|mock|node_modules' || true)
        if [[ -n "$hits" ]]; then
          warn "授权自定义模式命中（warn-only，须人工复核）：${pat}"
          printf '%s\n' "$hits" | head -5 | sed 's/^/    /'
        fi
      done
    fi
  done
  echo "  提示: 授权铁律——服务端每个 API 默认拒绝、显式授权（OWASP ASVS V8 / CWE Top25:2025 授权类四弱点）"
  if [[ $found -eq 0 ]]; then
    pass "授权类弱点检查通过（fail 项未命中；warn 项请人工复核）"
  fi
}
