# gate: sbom
# domain: security / enforce: strict / tier: compliance
check_sbom() {
  echo "=== SBOM 物料清单与许可证扫描 ==="
  if [[ "${SBOM_REQUIRED:-0}" != "1" ]]; then
    if [[ -n "${SBOM_EXEMPT_REASON:-}" ]]; then
      warn "SBOM 检查已豁免（${SBOM_EXEMPT_REASON}）——fail-closed：豁免须显式声明理由"
    else
      fail "gate_sbom_unconfigured: SBOM_REQUIRED 未启用且无豁免理由——安全门禁须显式配置（SBOM_REQUIRED=1）或填写 SBOM_EXEMPT_REASON 豁免理由（数安法第27条/SLSA供应链要求）"
    fi
    return
  fi
  local out_dir="${SBOM_OUTPUT_DIR:-.sbom}"
  local ts sbom_file lic_file
  ts=$(date -u '+%Y%m%d-%H%M%S')
  sbom_file="${out_dir}/sbom-${ts}.txt"
  lic_file="${out_dir}/licenses-${ts}.txt"
  mkdir -p "$out_dir" 2>/dev/null || true
  local generated=0 tool="${SBOM_TOOL:-}"
  # 工具降级链：$SBOM_TOOL → syft → cdxgen → 内置 lockfile 解析
  # SBOM_TOOL=none：显式屏蔽外部工具，强制走内置 lockfile 解析（无工具链环境依赖的确定性路径，
  # 修 fixture 环境依赖遗留——机器装有 syft/cdxgen 时 fixture 结果不应漂移）
  if [[ "$tool" == "none" ]]; then
    tool=""
  elif [[ -z "$tool" ]]; then
    if command -v syft >/dev/null 2>&1; then tool="syft"
    elif command -v cdxgen >/dev/null 2>&1; then tool="cdxgen"
    fi
  fi
  if [[ -n "$tool" ]] && command -v "$tool" >/dev/null 2>&1; then
    case "$tool" in
      syft) syft "dir:${PROJECT_DIR:-.}" -o text > "$sbom_file" 2>/dev/null || true ;;
      cdxgen) cdxgen -o "$sbom_file" 2>/dev/null || true ;;
      *) "$tool" > "$sbom_file" 2>/dev/null || true ;;
    esac
    [[ -s "$sbom_file" ]] && generated=1
  fi
  if [[ $generated -eq 0 ]]; then
    # 内置 lockfile 解析（无外部工具时降级）：提取依赖名+版本
    local locks="" lf
    for lf in package-lock.json yarn.lock pnpm-lock.yaml go.sum requirements.txt pom.xml; do
      [[ -f "$lf" ]] && locks="${locks} ${lf}"
    done
    if [[ -z "$locks" ]]; then
      # 无工具且无 lockfile → fail-closed
      fail "gate_sbom_toolchain_unavailable: 无 SBOM 工具（syft/cdxgen）且未找到 lockfile，无法生成 SBOM"
      return
    fi
    : > "$sbom_file"
    for lf in $locks; do
      echo "# ${lf}" >> "$sbom_file"
      case "$lf" in
        package-lock.json)
          grep -oE '"node_modules/[^"]+"' "$lf" 2>/dev/null | sed 's/"node_modules\///; s/"$//' | sort -u >> "$sbom_file" || true ;;
        yarn.lock|pnpm-lock.yaml)
          grep -E '^[^#[:space:]][^:]*:' "$lf" 2>/dev/null | sed 's/["'\'']//g; s/:$//' | sort -u >> "$sbom_file" || true ;;
        go.sum)
          awk '{print $1" "$2}' "$lf" 2>/dev/null | sort -u >> "$sbom_file" || true ;;
        requirements.txt)
          grep -vE '^[[:space:]]*(#|$)' "$lf" 2>/dev/null >> "$sbom_file" || true ;;
        pom.xml)
          grep -oE '<artifactId>[^<]+</artifactId>' "$lf" 2>/dev/null | sed 's/<[^>]*>//g' | sort -u >> "$sbom_file" || true ;;
      esac
    done
    generated=1
  fi
  # R118：空 SBOM（只有 # lockfile 头、零依赖条目）不得当“已生成”放行。
  local _sbom_entries
  _sbom_entries=$(grep -cvE '^[[:space:]]*(#|$)' "$sbom_file" 2>/dev/null || true)
  _sbom_entries=$(_norm_int "${_sbom_entries:-0}")
  if [[ "$_sbom_entries" -eq 0 ]]; then
    fail "gate_sbom_empty: SBOM 未解析出任何依赖条目（${sbom_file}）"
    return
  fi
  # license 提取：node_modules 下 package.json 的 license/licenses 字段。
  # R118：深度 2→3 覆盖 @scope/pkg；同时支持 "licenses": [{"type": ...}] 形态。
  : > "$lic_file"
  if [[ -d node_modules ]]; then
    find node_modules -maxdepth 3 -name package.json 2>/dev/null | while read -r pj; do
      local nm lic
      nm=$(grep -oE '"name"[[:space:]]*:[[:space:]]*"[^"]+"' "$pj" 2>/dev/null | head -1 | sed 's/.*: *"//; s/"$//')
      lic=$(grep -oE '"license"[[:space:]]*:[[:space:]]*"[^"]+"' "$pj" 2>/dev/null | head -1 | sed 's/.*: *"//; s/"$//')
      if [[ -z "$lic" ]]; then
        lic=$(grep -oE '"type"[[:space:]]*:[[:space:]]*"[^"]+"' "$pj" 2>/dev/null | head -1 | sed 's/.*: *"//; s/"$//')
      fi
      [[ -n "$lic" ]] && echo "${nm:-unknown} ${lic}" >> "$lic_file"
    done
  fi
  # 许可证豁免：对象|规则|理由|审批人|日期（对象=包名；规则=块名单词或 license/*）
  _sbom_exempted() {
    local ex obj rule
    for ex in "${SBOM_LICENSE_EXEMPTIONS[@]+"${SBOM_LICENSE_EXEMPTIONS[@]}"}"; do
      obj=$(printf '%s\n' "$ex" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/,"",$1); print $1}')
      rule=$(printf '%s\n' "$ex" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2}')
      [[ "$obj" == "$1" ]] || continue
      [[ "$rule" == "$2" || "$rule" == "license" || "$rule" == "*" ]] && return 0
    done
    return 1
  }
  # 许可证块名单扫描（license 清单 + SBOM 产物）
  local found=0 b hits _lic_line _lic_pkg
  if [[ ${#SBOM_LICENSE_BLOCKLIST[@]} -gt 0 ]]; then
    for b in "${SBOM_LICENSE_BLOCKLIST[@]}"; do
      hits=$(grep -iE "$b" "$lic_file" 2>/dev/null || true)
      if [[ -n "$hits" ]]; then
        while IFS= read -r _lic_line; do
          [[ -n "$_lic_line" ]] || continue
          _lic_pkg="${_lic_line%% *}"
          if _sbom_exempted "$_lic_pkg" "$b"; then
            warn "gate_sbom_license_exempted:${_lic_pkg}: 命中许可证块名单「${b}」但已登记豁免（${_lic_line}）"
          else
            fail "gate_sbom_license_blocked:${_lic_pkg}: 命中许可证块名单「${b}」（${_lic_line}）"
            found=1
          fi
        done <<< "$hits"
      fi
    done
    if [[ ! -s "$lic_file" ]]; then
      # 非 fail 的观测项不带 gate_ 前缀：gate_sbom 是 compliant fixture 的禁中前缀。
      warn "sbom_license_evidence_missing: 未提取到许可证数据（node_modules 不存在或依赖无 license 字段），块名单未实际执行"
    fi
  fi
  # 豁免登记：5 字段（对象|规则|理由|审批人|日期）校验 + 回显
  if [[ ${#SBOM_LICENSE_EXEMPTIONS[@]} -gt 0 ]]; then
    local ex nf
    for ex in "${SBOM_LICENSE_EXEMPTIONS[@]}"; do
      nf=$(awk -F'|' '{print NF}' <<< "$ex")
      if [[ "$nf" -ne 5 ]]; then
        fail "gate_sbom_exemption_invalid: 豁免须为 5 字段（对象|规则|理由|审批人|日期）：${ex}"
        found=1
      else
        echo "  ⓘ 豁免登记：${ex}"
      fi
    done
  fi
  # B 方向：CVE 漏洞阈值门禁（SCA 补全）——SBOM 生成后 grype --fail-on 扫描，超阈值 fail。
  # 姿态：skip_if_unconfigured（CVE_THRESHOLD 未配置静默跳过）→ 配置后 fail-closed。
  # 工具降级链 grype → osv-scanner（仅提示，无阈值判定能力）→ warn 跳过（fail-open 风险如实披露）。
  if [[ -n "${CVE_THRESHOLD:-}" && -s "$sbom_file" ]]; then
    if command -v grype >/dev/null 2>&1; then
      trace_tool "grype" "sbom cve scan"
      if ! grype "sbom:${sbom_file}" --fail-on "$CVE_THRESHOLD" >/dev/null 2>&1; then
        fail "gate_sbom_cve_threshold: SBOM 检出 ≥${CVE_THRESHOLD} 级 CVE（grype --fail-on ${CVE_THRESHOLD}；豁免须 5 字段留痕 CVE_EXEMPTIONS）"
        found=1
      fi
    elif command -v osv-scanner >/dev/null 2>&1; then
      trace_tool "osv-scanner" "sbom cve scan"
      osv-scanner --sbom="$sbom_file" >/dev/null 2>&1 || true
      warn "grype 不可用，降级 osv-scanner（无阈值判定能力，结果须人工复核阈值）"
    else
      warn "CVE_THRESHOLD=${CVE_THRESHOLD} 已配置但 grype/osv-scanner 均不可用，跳过漏洞扫描（fail-open 风险如实披露）"
    fi
  fi
  # CVE 豁免登记：5 字段（对象|规则|理由|审批人|日期）校验 + 回显（与许可证豁免同机制）
  # bash 3.2 + set -u：CVE_EXEMPTIONS 可能未声明（conf 默认注释），先判声明再取长度
  if [[ -n "${CVE_EXEMPTIONS+x}" && ${#CVE_EXEMPTIONS[@]} -gt 0 ]]; then
    local cex cnf
    for cex in "${CVE_EXEMPTIONS[@]}"; do
      cnf=$(awk -F'|' '{print NF}' <<< "$cex")
      if [[ "$cnf" -ne 5 ]]; then
        fail "gate_sbom_cve_exemption_invalid: CVE 豁免须为 5 字段（对象|规则|理由|审批人|日期）：${cex}"
        found=1
      else
        echo "  ⓘ CVE 豁免登记：${cex}"
      fi
    done
  fi
  if [[ $found -eq 0 ]]; then
    if [[ ${#SBOM_LICENSE_BLOCKLIST[@]} -gt 0 && ! -s "$lic_file" ]]; then
      pass "SBOM 已生成：${sbom_file}（未提取到许可证数据，块名单未执行；证据归档）"
    else
      pass "SBOM 已生成：${sbom_file}（许可证块名单未命中或已豁免，证据归档）"
    fi
  fi
}
