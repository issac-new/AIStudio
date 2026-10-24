# gate: security
# domain: security / enforce: strict / tier: core
check_security() {
  echo "=== 安全规范检查（OWASP Top 10 / 代码安全 / 网络安全）==="
  # 工具链降级：SECURITY_TOOL=auto/builtin/semgrep；auto=有 semgrep 用 semgrep，否则内置
  # 内置路径（下方原逻辑）行为一字不变；semgrep 执行失败降级内置（不静默 fail-open）
  local _security_tool="${SECURITY_TOOL:-auto}"
  if [[ "$_security_tool" == "auto" ]]; then
    if command -v semgrep >/dev/null 2>&1; then _security_tool="semgrep"; else _security_tool="builtin"; fi
  elif [[ "$_security_tool" == "semgrep" ]] && ! command -v semgrep >/dev/null 2>&1; then
    warn "SECURITY_TOOL=semgrep 但 semgrep 未安装，降级内置规则扫描"
    _security_tool="builtin"
  fi
  if [[ "$_security_tool" == "semgrep" ]]; then
    local _semgrep_rc=0
    _check_security_semgrep || _semgrep_rc=$?
    case "$_semgrep_rc" in
      3)
        # semgrep 已 fail（ERROR 级命中）→ 跳过内置，避免重复报同一问题
        return ;;
      1)
        warn "semgrep 执行失败（rc≥2），降级内置规则扫描" ;;
      2)
        : ;;  # 无可扫目录，落入内置路径的同文案披露
      0)
        # 修复（安全）：semgrep 通过**不再 return**，继续叠加内置模式族。
        # 缺陷：原逻辑"semgrep 通过就 return"把互补的两种范式做成互斥二选一——
        #   semgrep 强在语义/框架感知（依赖已知类型签名），内置强在模式化鲁棒性
        #   （SQL 关键字 + 字符串拼接特征 / eval 词法）。实测自定义对象方法
        #   （db.exec / engine.eval）semgrep --config auto 与 p/java 均 0 命中，
        #   而内置能精准抓到 → 装了 semgrep 的用户反而比不装更弱（违反"工具增强"直觉）。
        # 叠加成本仅几秒 grep，对齐"质量优先 > 兼顾效率"执行准则。
        echo "  ⓘ semgrep 通过，继续内置模式族扫描（语义层 + 词法层叠加，非二选一）" ;;
    esac
  fi
  local found=0
  # 合并 WRITABLE_DIRS + SCAN_DIRS 并去重（避免同一目录扫两遍产生重复告警）
  local targets=() seen=""
  for d in ${WRITABLE_DIRS[@]+"${WRITABLE_DIRS[@]}"} ${SCAN_DIRS[@]+"${SCAN_DIRS[@]}"}; do
    [[ -z "$d" || ! -d "$d" ]] && continue
    case " $seen " in *" $d "*) continue ;; esac
    seen="$seen $d"; targets+=("$d")
  done
  if [[ ${#targets[@]} -eq 0 ]]; then
    # R118：空配置=未执行（skip，不打印“通过”）；配了但目录全不存在=配置错误（fail）。
    # 旧版一律 warn+return 0，拼写错误/占位符会让安全门禁静默假通过（审计 P1-1）。
    if [[ ${#WRITABLE_DIRS[@]} -eq 0 && ${#SCAN_DIRS[@]} -eq 0 ]]; then
      skip_if_unconfigured "WRITABLE_DIRS/SCAN_DIRS 未配置"
    else
      fail "gate_security_scan_dirs_missing: WRITABLE_DIRS/SCAN_DIRS 配置的目录全部不存在"
    fi
    return
  fi

  local line

  # §1 SQL 注入：SQL 关键字 + 字符串拼接/插值
  # ★MyBatis 框架感知：#{} 是参数化安全写法（跳过），${} 是危险字符串拼接（仅 ORDER BY/表名白名单可用）
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    # 排除 MyBatis 安全的 #{} 参数化写法
    if echo "$line" | grep -qE '#\{'; then
      # 含 #{} 的行如果是纯 #{}（无 ${}），视为安全
      if ! echo "$line" | grep -qE '\$\{'; then
        continue
      fi
    fi
    # 检查白名单（SQL_INJECTION_WHITELIST）
    local in_whitelist=0
    if [[ ${#SQL_INJECTION_WHITELIST[@]} -gt 0 ]]; then
      local wl
      for wl in "${SQL_INJECTION_WHITELIST[@]}"; do
        echo "$line" | grep -qF "$wl" && in_whitelist=1 && break
      done
    fi
    # ★TS/JS 生态安全形态豁免（机械可判，better-sqlite3/fetch 标准写法）：
    #   列名常量插值 ${COLS}（值仍经 ? 参数化）/ URL 模板经 encodeURIComponent / IN 占位符 ${placeholders}
    if echo "$line" | grep -qE '\$\{[A-Z_][A-Z_0-9]*\}|\$\{placeholders\}|encodeURIComponent'; then
      continue
    fi
    # ★参数化绑定值豁免（R106-D13）：SQL 字面量含 ? 占位符且后随逗号——拼接只发生在
    # 绑定值实参位（GORM/参数化 query 标准写法 Where("... LIKE ?", "%"+name+"%")），
    # 且关键字字面量本身不被 + 拼接（"SELECT ... " + var 形态仍拦）。误报实证：go-forge
    # 回归轮参数化子查询（IN (SELECT ... LIKE ?) + "%"+custName+"%"）被误判注入 fail。
    if echo "$line" | grep -qE '"[^"]*(SELECT|INSERT|UPDATE|DELETE|DROP)[^"]*\?[^"]*"[[:space:]]*,' \
      && ! echo "$line" | grep -qE '"[^"]*(SELECT|INSERT|UPDATE|DELETE|DROP)[^"]*"[[:space:]]*\+'; then
      continue
    fi
    # ★HTTP 动词豁免（R108-D4）：method: 'DELETE' 是 HTTP 动词不是 SQL——与模板字面量 ${}
    # 同行时被注入启发式误伤（rust-forge 回归实证 web/src/api.js deleteTask 整行误报 fail，
    # 该文件零 SQL；前端 REST 层 DELETE/PUT/POST 端点全是此形态=大面积误报家族）。
    # 判据：关键字仅以 method 值（引号包裹）形态出现，且行内无 SQL 子句词
    # （FROM/WHERE/SET/INTO/VALUES/TABLE/JOIN）——真 SQL 拼接行仍拦（含子句词不豁免）。
    if echo "$line" | grep -qE "method[[:space:]]*:[[:space:]]*['\"\`]?[[:space:]]*(DELETE|GET|POST|PUT|PATCH|HEAD|OPTIONS)" \
      && ! echo "$line" | grep -qE '(FROM|WHERE|SET|INTO|VALUES|TABLE|JOIN)[^a-zA-Z]'; then
      continue
    fi
    if [[ $in_whitelist -eq 1 ]]; then
      warn "MyBatis \${} 白名单命中（须人工确认安全）：$line"
    # ★语义豁免（变量经 sanitize 函数，ERE 不可判）：降级 warn 人工复核，不 fail
    elif echo "$line" | grep -qE '\$\{(safe|sanitized|escaped)[A-Za-z]*\}'; then
      warn "SQL 插值变量疑似已经 sanitize（须人工确认校验覆盖）：$line"
    else
      fail "疑似 SQL 注入（字符串拼接 SQL）：$line"; found=1
    fi
  done < <(_sec_scan 'SELECT|INSERT|UPDATE|DELETE|DROP' "${targets[@]}" | grep -E '\+|\$\{' || true)

  # §2 命令注入：child_process exec/spawn + 动态拼接（排除 RegExp.exec）
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    fail "疑似命令注入（exec/system 拼接动态内容）：$line"; found=1
  done < <(_sec_scan 'exec\(|execSync\(|spawn\(|system\(|popen\(|child_process' "${targets[@]}" \
    | grep -E '\+|\$\{|%s|format\(' \
    | grep -viE '\.exec\(|RegExp|regex|pattern\.exec|match\.' || true)

  # §3 不安全动态代码执行：eval / new Function
  # 修复（误报）：原裸匹配 'eval\(|new Function\(' 无任何白名单，
  # 同文件 §1/§2/§4 都有排除（MyBatis #{}/命令注入 .exec(|RegExp/XSS 须含拼接），唯 §3 没有。
  # 实测误报：flask 的 ast.literal_eval()——Python 官方推荐的 eval 安全替代（只解析字面量、
  # 不执行代码），恰恰是正确解法，误报会训练用户改回不安全写法或加豁免（反向激励）。
  # 内置排除安全求值函数（词法层无法判定类型，按命名约定排除已知安全变体）：
  #   ast.literal_eval / literal_eval / .safe_eval（Python）｜json.loads（反序列化非代码执行）。
  # 另加 EVAL_WHITELIST 可配豁免（对齐 §1 SQL_INJECTION_WHITELIST 设计）。
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    # 排除已知安全的求值替代（literal_eval / safe_eval / json.loads）
    if echo "$line" | grep -qiE 'ast\.literal_eval|literal_eval|\.safe_eval|safe_eval|json\.loads'; then
      continue
    fi
    # 可配白名单（EVAL_WHITELIST，与 SQL_INJECTION_WHITELIST 同构）
    local in_whitelist=0
    if [[ ${#EVAL_WHITELIST[@]} -gt 0 ]]; then
      local wl
      for wl in "${EVAL_WHITELIST[@]}"; do
        if echo "$line" | grep -qF "$wl"; then
          warn "eval 白名单命中（须人工确认安全）：$line"
          in_whitelist=1; break
        fi
      done
    fi
    [[ "$in_whitelist" -eq 1 ]] && continue
    fail "不安全动态代码执行（eval / new Function）：$line"; found=1
  done < <(_sec_scan 'eval\(|new Function\(' "${targets[@]}" || true)

  # §4 XSS：v-html / dangerouslySetInnerHTML / innerHTML + 拼接
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    fail "疑似 XSS（v-html / dangerouslySetInnerHTML / innerHTML 拼接）：$line"; found=1
  done < <(_sec_scan 'v-html|dangerouslySetInnerHTML|innerHTML' "${targets[@]}" | grep -E '\+|\$\{' || true)

  # §5 路径穿越（warn）
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    warn "疑似路径穿越（../ 或 path.join 含动态片段）：$line"
  done < <(_sec_scan '\.\./|path\.join\(|path\.resolve\(' "${targets[@]}" | grep -E '\+|\$\{|req\.|input|param' || true)

  # §6 硬编码密钥：变量名含 key/secret/token/password + 赋值 16+ 位字符串字面量（排除注释/变量名/枚举）
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    fail "疑似硬编码密钥：$line"; found=1
  done < <(_sec_scan 'api[_-]?key|secret|token|password|passwd|pwd|private[_-]?key' "${targets[@]}" \
    | grep -E "[:=][[:space:]]*[\"'][A-Za-z0-9+/=_-]{16,}[\"']" \
    | grep -viE '^[^:]+:[0-9]+:.*(process\.env|getenv|os\.environ|config\.|env\.|example|placeholder|enum |type |interface |class )' \
    | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|/\*|\*)' || true)

  # §7 弱哈希用于密码（warn）
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    warn "疑似弱哈希（md5/sha1 用于密码场景）：$line"
  done < <(_sec_scan 'md5|sha1|createHash' "${targets[@]}" | grep -iE 'password|pwd|passwd|auth|token|secret' || true)

  # §8 TLS 验证关闭（R126-G3：旧过滤链 `grep -iE 'false|true' | grep -v rejectUnauthorized:true`
  # 只排除一种安全写法，insecure: false / verify: true / ssl.verify=true 等安全配置均误报 fail。
  # 改为正向匹配四类"不安全值"形态：rejectUnauthorized:false / verify:false / insecure:true / allowInsecure:true）
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    fail "不安全传输配置（TLS 验证关闭）：$line"; found=1
  done < <(_sec_scan 'rejectUnauthorized|verify\s*:\s*false|insecure|allowInsecure|ssl.*verify' "${targets[@]}" \
    | grep -iE 'rejectUnauthorized[[:space:]]*:[[:space:]]*false|verify[[:space:]]*:[[:space:]]*false|insecure[[:space:]]*[:=][[:space:]]*true|allowInsecure[[:space:]]*[:=][[:space:]]*true' || true)

  # §9 CORS 全开（warn）—— 只匹配实际 CORS 配置中的 *，不匹配注释
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    warn "疑似 CORS 全开（Allow-Origin: *）：$line"
  done < <(_sec_scan 'Access-Control-Allow-Origin|cors\(' "${targets[@]}" \
    | grep -E '\*' | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|/\*|\*)' || true)

  # §10 调试模式开启（warn）
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    warn "疑似生产调试模式开启（debug:true）：$line"
  done < <(_sec_scan 'debug\s*:\s*true|DEBUG\s*=\s*true|DEBUG\s*=\s*True' "${targets[@]}" \
    | grep -viE 'dev\.env|development|test' || true)

  echo "  提示: 安全规范——防范 OWASP Top 10（注入/XSS/CSRF/访问控制/认证/敏感数据）"
  echo "    - 硬性违规(fail)：SQL/命令注入、eval、XSS 拼接、硬编码密钥、TLS 关闭"
  echo "    - 人工复核(warn)：路径穿越、弱哈希、CORS *、调试模式"
  echo "    - 完整规范见 references/security-spec.md（应用安全/代码安全/网络安全/AI安全）"
  if [[ $found -eq 0 ]]; then
    pass "安全规范检查通过（未检测到硬性违规；warn 项请人工复核）"
  fi
}
