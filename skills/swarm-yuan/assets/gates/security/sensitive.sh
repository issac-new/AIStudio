# gate: sensitive
# domain: security / enforce: warn / tier: core
check_sensitive() {
  echo "=== 敏感信息脱敏扫描（check §4 UI脱敏/日志）==="
  # 工具链降级：SENSITIVE_TOOL=auto/builtin/gitleaks；auto=有 gitleaks 用 gitleaks，否则内置
  # 内置路径（下方原逻辑）行为一字不变；gitleaks 执行失败降级内置（不静默 fail-open）
  local _sensitive_tool="${SENSITIVE_TOOL:-auto}"
  if [[ "$_sensitive_tool" == "auto" ]]; then
    if command -v gitleaks >/dev/null 2>&1; then _sensitive_tool="gitleaks"; else _sensitive_tool="builtin"; fi
  elif [[ "$_sensitive_tool" == "gitleaks" ]] && ! command -v gitleaks >/dev/null 2>&1; then
    warn "SENSITIVE_TOOL=gitleaks 但 gitleaks 未安装，降级内置正则扫描"
    _sensitive_tool="builtin"
  fi
  if [[ "$_sensitive_tool" == "gitleaks" ]]; then
    local _gitleaks_rc=0
    _check_sensitive_gitleaks || _gitleaks_rc=$?
    case "$_gitleaks_rc" in
      3)
        # gitleaks 已 fail → 跳过内置正则，避免重复报同一文件
        return ;;
      1)
        warn "gitleaks 执行失败，降级内置正则扫描" ;;
      2)
        : ;;  # SCAN_DIRS 空，落入内置路径的同文案披露
      0)
        # 修复（安全）：gitleaks 通过**不再 return**，继续叠加内置正则族。
        # 两者互补：gitleaks 强在熵检测/已知密钥格式（sk-/AKIA/JWT 等），
        # 内置正则强在自定义模式（yml 的 password: 键、mongodb:// 内联凭证等）。
        # 与 check_security 同款修复（原"工具通过就 return"把互补做成互斥二选一）。
        echo "  ⓘ gitleaks 通过，继续内置正则族扫描（熵检测 + 自定义模式叠加，非二选一）" ;;
    esac
  fi
  local patterns=(
    'sk-[a-zA-Z0-9]{20,}'
    'AKIA[0-9A-Z]{16}'
    'password\s*[:=]\s*['\''"][^'\'']{4,}'
    'api[_-]?key\s*[:=]\s*['\''"][^'\'']{8,}'
    'secret\s*[:=]\s*['\''"][^'\'']{8,}'
    'token\s*[:=]\s*['\''"][^'\'']{16,}'
    'mongodb(\+srv)?://[^/\s]+:[^/@\s]+@'
    'redis://[^:\s]+:[^@\s]+@'
    'postgres(ql)?://[^/\s]+:[^/@\s]+@'
    # R118：无引号的 .env/YAML 赋值（旧版只认引号值，API_KEY=... 整类漏报）
    '[A-Za-z0-9_]*(api[_-]?key|secret|token|password|passwd|pwd)[A-Za-z0-9_]*[[:space:]]*[:=][[:space:]]*[A-Za-z0-9+/=_-]{12,}'
    # R118：补齐主流云/JWT/私钥格式（gitleaks 不可用时的内置面）
    'AIza[0-9A-Za-z_-]{35}'
    '(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}'
    'xox[baprs]-[A-Za-z0-9-]{10,}'
    'AccountKey=[A-Za-z0-9+/=]{40,}'
    'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
    '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  )
  local found=0 _existing=0 dir
  for dir in ${SCAN_DIRS[@]+"${SCAN_DIRS[@]}"}; do
    [[ -d "$dir" ]] && _existing=$((_existing+1))
  done
  # R118：空配置=未执行（skip，不打印“未发现”）；配了但目录全不存在=配置错误（fail）。
  if [[ ${#SCAN_DIRS[@]} -eq 0 ]]; then
    skip_if_unconfigured "SCAN_DIRS 未配置，敏感信息扫描未执行"
    return
  fi
  if [[ "$_existing" -eq 0 ]]; then
    fail "gate_sensitive_dirs_missing: SCAN_DIRS 配置的目录全部不存在：${SCAN_DIRS[*]}"
    return
  fi
  for dir in "${SCAN_DIRS[@]}"; do
    [[ -d "$dir" ]] || continue
    for pattern in "${patterns[@]}"; do
      local matches _hits _hi_conf
      # R138 高置信分流：结构化密钥格式（AKIA/sk-/ghp_/AIza/xox/AccountKey/JWT/PEM）命中即
      # 高置信，不再走「表达式赋值排除」——`secret: env.X ?? 'AKIA…'` 这类 env 兜底字面量
      # （TS 生态标准写法）曾被排除管道整行吞掉（行内有 process. 形态即排除整行），密钥漏报。
      # 高置信行仅保留测试路径排除与用户豁免；低置信行（password:/api_key: 键值族）维持原四层排除。
      _hi_conf='AKIA[0-9A-Z]{16}|sk-[a-zA-Z0-9]{20,}|AIza[0-9A-Za-z_-]{35}|(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}|xox[baprs]-[A-Za-z0-9-]{10,}|AccountKey=[A-Za-z0-9+/=]{40,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|BEGIN [A-Z ]*PRIVATE KEY'
      _hits=$(grep -rniE "$pattern" "$dir" \
        --include='*.ts' --include='*.vue' --include='*.svelte' --include='*.js' --include='*.mjs' \
        --include='*.patch' --include='*.py' --include='*.go' --include='*.rs' \
        --include='*.scss' --include='*.java' --include='*.json' --include='*.yml' --include='*.yaml' \
        --include='*.properties' --include='*.toml' --include='*.ini' --include='*.conf' --include='*.cfg' \
        --include='*.pem' --include='*.key' --include='*.sh' --include='*.xml' \
        --include='*.env' --include='.env' --include='.env.*' \
        --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.venv --exclude-dir=venv --exclude-dir=site-packages --exclude-dir=__pycache__ --exclude-dir=.tox --exclude-dir=dist --exclude-dir=build --exclude-dir=target --exclude-dir=vendor 2>/dev/null || true)
      matches=$(
        {
          printf '%s\n' "$_hits" | grep -E "$_hi_conf" \
            | grep -viE '(^|/)(tests?|testdata|__tests__|__mocks__|fixtures?|mocks?|examples?)(/|:)|(^|/)(test|spec)\.[a-z]+:|\.(test|spec)\.[a-z]+:|_test\.[a-z]+:'
          printf '%s\n' "$_hits" | grep -vE "$_hi_conf" \
            | grep -viE '(^|/)(tests?|testdata|__tests__|__mocks__|fixtures?|mocks?|examples?)(/|:)|(^|/)(test|spec)\.[a-z]+:|\.(test|spec)\.[a-z]+:|_test\.[a-z]+:' \
            | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|#|/\*|\*)' \
            | grep -viE 'example|placeholder|dummy|<[^>]*>' \
            | grep -vE '[:=][[:space:]]*[A-Za-z_][A-Za-z0-9_]*[[:space:]]*[.(]'
        } 2>/dev/null | grep -v '^$' || true)
      # R118-D3（nest-forge 实证）：SENSITIVE_EXCLUDE_GLOBS 项目级豁免此前只对 gitleaks
      # 子路径生效，内置正则族路径零消费——测试夹具密码（*.spec.ts 内 password: 'xxx'）
      # 无法经 conf 豁免，内置路径必然 fail。上方已按 path:line: 的路径段过滤测试固件；
      # 此处再消费 SENSITIVE_EXCLUDE_GLOBS 精确豁免（grep -vF 同款）。
      if [[ -n "$matches" ]]; then
        if [[ ${#SENSITIVE_EXCLUDE_GLOBS[@]} -gt 0 ]]; then
          local _xgl2
          for _xgl2 in "${SENSITIVE_EXCLUDE_GLOBS[@]}"; do
            matches=$(printf '%s\n' "$matches" | grep -vF "$_xgl2" || true)
          done
          unset _xgl2
        fi
      fi
      if [[ -n "$matches" ]]; then
        fail "疑似敏感信息 ($dir):"
        echo "$matches" | head -10
        found=1
      fi
    done
  done
  [[ $found -eq 0 ]] && { pass "未发现明显敏感信息"; return 0; }
}
