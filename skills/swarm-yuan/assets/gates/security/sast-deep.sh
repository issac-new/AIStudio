# gate: sast-deep
# domain: security / enforce: strict / tier: compliance
check_sast_deep() {
  echo "=== 深度 SAST 检查（AST/数据流层；GB/T 34943/34944/34946-2017 源代码漏洞测试规范）==="
  if [[ ${#SECURITY_SCAN_DIRS[@]} -eq 0 ]]; then
    if [[ -n "${SAST_DEEP_EXEMPT_REASON:-}" ]]; then
      warn "深度 SAST 检查已豁免（${SAST_DEEP_EXEMPT_REASON}）——fail-closed：豁免须显式声明理由"
    else
      fail "gate_sast_deep_unconfigured: SECURITY_SCAN_DIRS 未配置且无豁免理由——安全门禁须显式配置或填写 SAST_DEEP_EXEMPT_REASON 豁免理由（GB/T 34943/34944/34946-2017 源代码漏洞测试规范）"
    fi
    return
  fi
  local tool="${SAST_DEEP_TOOL:-auto}" sev="${SAST_DEEP_SEVERITY:-error}" found=0
  # SAST 豁免登记（5 字段：对象|规则|理由|审批人|日期；空理由视为无效豁免 → fail）
  local _sast_exempt=""
  if [[ ${#SAST_DEEP_EXEMPTIONS[@]} -gt 0 ]]; then
    local _sex _sex_id _sex_reason
    for _sex in "${SAST_DEEP_EXEMPTIONS[@]}"; do
      _sex_reason=$(printf '%s\n' "$_sex" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/,"",$3); print $3}')
      if [[ -z "$_sex_reason" ]]; then
        fail "gate_sast_deep_exemption_invalid: SAST 豁免须为 5 字段（对象|规则|理由|审批人|日期）：${_sex}"
        return
      fi
      _sex_id=$(printf '%s\n' "$_sex" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/,"",$1); print $1}')
      _sast_exempt="${_sast_exempt}${_sex_id} "
    done
  fi
  _sast_exempted() { printf '%s\n' "$_sast_exempt" | grep -qF "$1"; }
  local bin=""
  # 载体解析：builtin=强制内置；codex-security=AI 约束推理扫描（非 SAST，需 Node22+/Python3.10+/OPENAI_API_KEY）；
  #   可执行路径=直接调用（fixture mock 亦走此分支）；空/auto=SAST 降级链探测（semgrep→opengrep→builtin）
  # 注：codex-security 非 SAST，不进 auto 降级链——OpenAI 官方明确「不包含 SAST 报告」，
  #   采用约束推理 + 攻击路径验证而非模式匹配。显式配置时启用，与 SAST 正交可并行。
  if [[ "$tool" == "builtin" ]]; then
    bin="builtin"
  elif [[ "$tool" == "codex-security" ]]; then
    # codex-security AI 约束推理（source→sink 数据流 + 攻击路径推演，非 SAST 模式匹配）
    # 需求：Node.js 22.13+ / 24.x / 26.x + Python 3.10+ + OPENAI_API_KEY 或 CODEX_API_KEY
    # 开源 Apache-2.0，API 按 token 计费（--max-cost 可设上限），Trusted Access 非付费门槛
    # 详见 references/codex-security-methodology.md §二 CLI 整合方式
    if command -v npx >/dev/null 2>&1 && [[ -n "${OPENAI_API_KEY:-${CODEX_API_KEY:-}}" ]]; then
      bin="codex-security"
    else
      warn "SAST_DEEP_TOOL=codex-security 但 npx 不可用或未设 OPENAI_API_KEY/CODEX_API_KEY——降级回 SAST 链（semgrep→opengrep→builtin）"
    fi
  elif [[ "$tool" != "auto" && -n "$tool" ]]; then
    if [[ -x "$tool" ]]; then bin="$tool"; else warn "SAST_DEEP_TOOL=${tool} 不可执行，降级自动探测"; fi
  fi
  if [[ -z "$bin" ]]; then
    if command -v semgrep >/dev/null 2>&1; then bin="semgrep"
    elif command -v opengrep >/dev/null 2>&1; then bin="opengrep"
    else bin="builtin"; fi
  fi
  if [[ "$bin" == "builtin" ]]; then
    # 自带降级载体（词法模式族，明示降级；AST/数据流/AI 约束推理层未执行）
    echo "  ⓘ 降级为内置词法模式族（semgrep/opengrep/codex-security 不可用；AST/数据流/语义层未执行）"
    trace_tool "sast-deep" "builtin-lexical"
    if _sast_deep_lexical_scan "gate_sast_deep_builtin: 内置模式族检出高危代码执行 sink（eval/exec/Runtime.exec/child_process.exec；GB/T 34943/34944/34946 漏洞类别，降级词法检出）："; then
      found=1
    fi
  elif [[ "$bin" == "codex-security" ]]; then
    # codex-security 语义层（source→sink 数据流 + 攻击路径推演 + 威胁模型 + scan contract 等能力）
    # 详见 references/codex-security-methodology.md §二 CLI 整合方式
    echo "  ⓘ SAST 载体：codex-security（语义层：source→sink 数据流 + 攻击路径推演）"
    trace_tool "sast-deep" "codex-security"
    local _cs_scan_root; _cs_scan_root="$(mktemp -d "${TMPDIR:-/tmp}/codex-security.XXXXXX")"
    local _cs_sev="high"
    [[ "$sev" == "warning" ]] && _cs_sev="medium"
    local _cs_rc=0
    # 扫描日志落在 _cs_scan_root 内（原写死 /tmp/codex-security-sast-deep.log，多实例并行会互相覆盖）
    local _cs_log="$_cs_scan_root/sast-deep.log"
    # 原 `--json` 不在 codex-security scan 的
    # 真实 flag 面（0.1.21：--format <toon|json|yaml|md|jsonl>，真源 CLI --help 核验）——未知
    # flag → rc=2 走降级链，codex-security 载体从不真执行（恒降 semgrep 的假 opt-in）。改 --format json。
    npx @openai/codex-security scan "${SECURITY_SCAN_DIRS[@]}" \
      --output-dir "$_cs_scan_root/results" \
      --format json \
      --fail-on-severity "$_cs_sev" \
      >"$_cs_log" 2>&1 || _cs_rc=$?
    if [[ $_cs_rc -eq 1 ]]; then
      # rc=1 = 策略违规（检出达标严重级别 finding）
      if _sast_exempted gate_sast_deep_findings; then
        warn "gate_sast_deep_findings: codex-security 检出达标严重级别（${_cs_sev}）发现（已豁免留痕）——详见 ${_cs_log} + $_cs_scan_root/results/findings.json"
      else
        fail "gate_sast_deep_findings: codex-security 检出达标严重级别（${_cs_sev}）以上发现（语义层 source→sink 数据流 + 攻击路径推演；GB/T 34943/34944/34946 漏洞类别）——详见 ${_cs_log} + $_cs_scan_root/results/findings.json"
        found=1
      fi
    elif [[ $_cs_rc -eq 2 ]]; then
      # rc=2 = 输入无效/覆盖不全/运行时错误 → 降级 semgrep→builtin
      warn "codex-security 执行失败或覆盖不全（rc=2）——降级自动探测（semgrep→opengrep→builtin）"
      if command -v semgrep >/dev/null 2>&1; then
        bin="semgrep"
      elif command -v opengrep >/dev/null 2>&1; then
        bin="opengrep"
      else
        bin="builtin"
      fi
      # 重新走 semgrep/opengrep/builtin 分支（下方统一处理）
      if [[ "$bin" == "builtin" ]]; then
        trace_tool "sast-deep" "builtin-lexical"
        if _sast_deep_lexical_scan "gate_sast_deep_builtin: 内置模式族检出高危代码执行 sink（codex-security 失败后降级检出；GB/T 34943/34944/34946 漏洞类别）："; then
          found=1
        fi
      else
        trace_tool "sast-deep" "$bin"
        local json _rc=0 _e _w
        json=$("$bin" scan --config p/default --json --quiet "${SECURITY_SCAN_DIRS[@]}" 2>/dev/null) || _rc=$?
        # R126：rc/空输出检查（镜像末尾 else 分支既有判据）——旧版本分支吞掉
        # semgrep/opengrep 失败：json 空 → ERROR=0 → 直通「深度 SAST 检查通过」；
        # R118 在 else 分支修过的「异常退出码不得判通过」同族洞在本分支残留。
        # 同时补 local 声明：_rc/_e/_w 旧版泄漏为全局变量。
        if [[ $_rc -ne 0 || -z "$json" ]]; then
          warn "${bin} 执行失败或无输出（rc=${_rc}）——降级内置词法模式族"
          trace_tool "sast-deep" "builtin-lexical"
          if _sast_deep_lexical_scan "gate_sast_deep_builtin: 内置模式族检出高危代码执行 sink（${bin} 执行失败后降级检出；GB/T 34943/34944/34946 漏洞类别）："; then
            found=1
          fi
        else
          _e=$(printf '%s\n' "$json" | grep -cE '"severity"[^,]*ERROR' || true)
          _w=$(printf '%s\n' "$json" | grep -cE '"severity"[^,]*WARNING' || true)
          echo "  ⓘ ${bin} 结果：ERROR=${_e} WARNING=${_w}"
          if [[ "$sev" == "warning" && $((_e+_w)) -gt 0 ]] || [[ "$sev" == "error" && "$_e" -gt 0 ]]; then
            if _sast_exempted gate_sast_deep_findings; then
              warn "gate_sast_deep_findings: ${bin} 检出达标严重级别发现（已豁免留痕）"
            else
              fail "gate_sast_deep_findings: ${bin} 检出达标严重级别（${sev}）以上发现 ERROR=${_e} WARNING=${_w}（GB/T 34943/34944/34946 漏洞类别）——详见 ${bin} JSON 输出"
              found=1
            fi
          fi
        fi
      fi
    elif [[ $_cs_rc -eq 0 ]]; then
      # rc=0 = 完成报告扫描，无策略违规
      echo "  ⓘ codex-security 结果：无达标严重级别（${_cs_sev}）以上发现（语义层扫描通过）"
      # 可选 SARIF 导出（不阻塞）
      npx @openai/codex-security export "$_cs_scan_root/results" --export-format sarif --output "$_cs_scan_root/results.sarif" 2>/dev/null || true
    else
      # R118：3/124/127 等异常退出码旧版落入 rc=0 分支并打印“扫描通过”（审计 P1-6）。
      fail "gate_sast_deep_tool_error: codex-security 异常退出（rc=${_cs_rc}）——扫描未完成，不得判定通过"
      found=1
    fi
    rm -rf "$_cs_scan_root"
  else
    echo "  ⓘ SAST 载体：${bin}（AST/规则层）"
    trace_tool "sast-deep" "$bin"
    local json _rc=0
    json=$("$bin" scan --config p/default --json --quiet "${SECURITY_SCAN_DIRS[@]}" 2>/dev/null) || _rc=$?
    if [[ $_rc -ne 0 || -z "$json" ]]; then
      # 网络/规则包不可达（离线环境 p/default 拉取失败）→ 降级内置，明示
      warn "${bin} 执行失败或无输出（rc=${_rc}；离线环境规则包不可达）——降级内置词法模式族"
      if _sast_deep_lexical_scan "gate_sast_deep_builtin: 内置模式族检出高危代码执行 sink（${bin} 执行失败后降级检出；GB/T 34943/34944/34946 漏洞类别）："; then
        found=1
      fi
    else
      local _e _w
      _e=$(printf '%s\n' "$json" | grep -cE '"severity"[^,]*ERROR' || true)
      _w=$(printf '%s\n' "$json" | grep -cE '"severity"[^,]*WARNING' || true)
      echo "  ⓘ ${bin} 结果：ERROR=${_e} WARNING=${_w}"
      if [[ "$sev" == "warning" && $((_e+_w)) -gt 0 ]] || [[ "$sev" == "error" && "$_e" -gt 0 ]]; then
        if _sast_exempted gate_sast_deep_findings; then
          warn "gate_sast_deep_findings: ${bin} 检出达标严重级别发现（已豁免留痕）"
        else
          fail "gate_sast_deep_findings: ${bin} 检出达标严重级别（${sev}）以上发现 ERROR=${_e} WARNING=${_w}（GB/T 34943/34944/34946 漏洞类别）——详见 ${bin} JSON 输出"
          found=1
        fi
      fi
    fi
  fi
  if [[ $found -eq 0 ]]; then
    pass "深度 SAST 检查通过（载体：${bin}）"
    # 诚实化：本门禁是 if/elif 互斥载体选择（工具 **或** builtin，不叠加）——
    # 与 check_security/check_sensitive 已改为叠加不同。此处显式披露"未叠加"，
    # 避免"通过"被误读为"语义层+词法层都查过了"。
    # 不改控制流的理由：sast-deep 是 advisory-only + 重型路径（需 API key / 大扫描量），
    # 叠加收益低于 security/sensitive，且改动风险高（多重降级分支）。
    case "$bin" in
      builtin) : ;;  # 已在上游打印"降级为内置词法模式族"披露，不重复
      *) echo "  ⓘ 载体 ${bin} 单层执行（内置词法模式族未叠加；如需词法层兜底：SAST_DEEP_TOOL=builtin 单独跑一次）" ;;
    esac
  fi
}
