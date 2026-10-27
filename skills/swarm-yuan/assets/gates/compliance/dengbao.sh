# gate: dengbao
# domain: compliance / enforce: strict / tier: compliance
check_dengbao() {
  echo "=== 等级保护 2.0 控制点映射检查（GB/T 22239-2019 安全计算环境/安全建设管理）==="
  local level="${DENGBAO_LEVEL:-}"
  if [[ -z "$level" ]]; then
    if [[ -n "${DENGBAO_EXEMPT_REASON:-}" ]]; then
      warn "等保检查已豁免（${DENGBAO_EXEMPT_REASON}）——fail-closed：豁免须显式声明理由"
    else
      fail "gate_dengbao_unconfigured: DENGBAO_LEVEL 未配置且无豁免理由——安全门禁须显式配置（DENGBAO_LEVEL=2/3）或填写 DENGBAO_EXEMPT_REASON 豁免理由（GB/T 22239-2019 等保 2.0 / 数安法第27条）"
    fi
    return
  fi
  if [[ "$level" != "2" && "$level" != "3" && "$level" != "4" ]]; then
    # R118：未知枚举=配置错误，不得当“未执行”静默放行（拼写错误会关闭安全门禁）。
    fail "gate_dengbao_invalid_level: 未知 DENGBAO_LEVEL：${level}（仅支持 2/3/4）"
    return
  fi
  local found=0
  # 豁免登记（四字段：规则id|理由|审批人|日期；空理由视为无效豁免不降级）
  local _exempt=""
  if [[ -n "${DENGBAO_EXEMPT_FILE:-}" && -f "${DENGBAO_EXEMPT_FILE}" ]]; then
    _exempt=$(awk -F'|' '!/^[[:space:]]*(#|$)/ { r=$2; gsub(/^[ \t]+|[ \t]+$/,"",r); if (r != "") { id=$1; gsub(/^[ \t]+|[ \t]+$/,"",id); print id } }' "$DENGBAO_EXEMPT_FILE" 2>/dev/null || true)
  fi
  _db_exempted() { printf '%s\n' "$_exempt" | grep -qF "$1"; }
  # 扫描目录就绪性（与 --crypto 同姿态：启用但留空 → warn 披露）
  # R126-G6：DENGBAO_SCAN_DIRS 不在 _default_conf 兜底面，conf 未声明时 set -u 下
  # ${#ARR[@]} 直接崩（rc=127，`|| true` 救不了）——补 +x 守卫对齐 1495 行同函数内既有写法。
  if [[ -z "${DENGBAO_SCAN_DIRS[*]+x}" || "${#DENGBAO_SCAN_DIRS[@]}" -eq 0 ]]; then
    warn "DENGBAO_SCAN_DIRS 未配置，MFA/审计代码证据扫描未执行（fail-open 风险）"
  fi
  local _scan_hits
  _scan_hits() { # $1=ERE；stdout=命中行（跨目录聚合，滤注释行与 example/mock）
    local d
    for d in ${DENGBAO_SCAN_DIRS[@]+"${DENGBAO_SCAN_DIRS[@]}"}; do
      [[ -d "$d" ]] || continue
      grep -rnE "$1" "$d" --include='*.java' --include='*.kt' --include='*.ts' --include='*.js' --include='*.py' --include='*.go' 2>/dev/null \
        | grep -viE 'example|mock|node_modules' \
        | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|#|\*|/\*)' || true
    done
  }
  # ① 双因子鉴别（三级起强制：两种及以上组合且至少一种密码技术；GB/T 22239-2019 三级安全计算环境）
  #    四级增量：三种及以上组合鉴别（9.1.4.1），全部基于密码技术
  if [[ "$level" == "3" || "$level" == "4" ]]; then
    local _mfa
    _mfa=$(_scan_hits 'TOTP|GoogleAuthenticator|twoFactor|two_factor|2FA|\bMFA\b|\bOTP\b|短信验证码|动态口令')
    if [[ -z "$_mfa" ]]; then
      if _db_exempted gate_dengbao_mfa; then
        warn "gate_dengbao_mfa: 未检出双因子鉴别证据（已豁免留痕：${DENGBAO_EXEMPT_FILE}）"
      else
        fail "gate_dengbao_mfa: 等保${level}级要求${level}种及以上组合鉴别（口令+密码技术/生物技术等）——DENGBAO_SCAN_DIRS 内未检出 TOTP/OTP/MFA/短信验证码等证据（GB/T 22239-2019）"
        found=1
      fi
    fi
  fi
  # ② 安全审计存在性（二级 warn / 三级 fail）
  local _audit
  _audit=$(_scan_hits 'audit|Audit|审计')
  if [[ -z "$_audit" ]]; then
    if [[ "$level" == "3" || "$level" == "4" ]]; then
      if _db_exempted gate_dengbao_audit_missing; then
        warn "gate_dengbao_audit_missing: 未检出安全审计日志调用（已豁免留痕）"
      else
        fail "gate_dengbao_audit_missing: 未检出安全审计日志调用（audit/审计）——等保${level}级安全审计控制点要求记录并保护审计记录（GB/T 22239-2019）"
        found=1
      fi
    else
      warn "未检出安全审计日志调用（audit/审计）——等保二级建议补审计记录（GB/T 22239-2019）"
    fi
  fi
  # ③ 审计字段四要素声明（spec §23.2：日期时间/用户/事件类型/事件是否成功）
  local _spec="${SPEC_FILE:-}"
  if [[ -z "$_spec" || ! -f "$_spec" ]]; then
    if _db_exempted gate_dengbao_audit_fields; then
      warn "gate_dengbao_audit_fields: SPEC_FILE 未配置（已豁免留痕）"
    else
      fail "gate_dengbao_audit_fields: SPEC_FILE 未配置或不存在——无法核验审计字段四要素声明（spec §23.2 须声明：日期时间/用户/事件类型/事件是否成功）"
      found=1
    fi
  else
    local _fmiss=""
    grep -qF '日期时间' "$_spec" 2>/dev/null || _fmiss="${_fmiss}日期时间 "
    grep -qF '用户' "$_spec" 2>/dev/null || _fmiss="${_fmiss}用户 "
    grep -qF '事件类型' "$_spec" 2>/dev/null || _fmiss="${_fmiss}事件类型 "
    grep -qE '事件是否成功|成功与否' "$_spec" 2>/dev/null || _fmiss="${_fmiss}事件是否成功 "
    if [[ -n "$_fmiss" ]]; then
      if _db_exempted gate_dengbao_audit_fields; then
        warn "gate_dengbao_audit_fields: spec 审计字段声明缺：${_fmiss}（已豁免留痕）"
      else
        fail "gate_dengbao_audit_fields: spec §23.2 审计字段声明缺要素：${_fmiss}（GB/T 22239-2019：审计记录应包括事件的日期和时间、用户、事件类型、事件是否成功及其他审计相关信息）"
        found=1
      fi
    fi
    # ④ 等保级别一致性（spec 声明级别 vs DENGBAO_LEVEL）
    local _spec_lv
    _spec_lv=$(grep -oE '等保[^0-9]*[234]级' "$_spec" 2>/dev/null | grep -oE '[234]' | head -1 || true)
    if [[ -z "$_spec_lv" ]]; then
      warn "spec §23.2 未声明等保级别（建议补充「等保级别：X 级」）"
    elif [[ "$_spec_lv" != "$level" ]]; then
      if _db_exempted gate_dengbao_level_mismatch; then
        warn "gate_dengbao_level_mismatch: spec 声明 ${_spec_lv} 级 vs DENGBAO_LEVEL=${level}（已豁免留痕）"
      else
        fail "gate_dengbao_level_mismatch: spec 声明等保 ${_spec_lv} 级与 DENGBAO_LEVEL=${level} 不一致——立法（spec）与执法（conf）必须同源"
        found=1
      fi
    fi
  fi
  # ⑤ 个人信息保护勾稽（二级起要求；--privacy 须在配）
  if [[ ${#PRIVACY_SCAN_DIRS[@]} -eq 0 ]]; then
    if _db_exempted gate_dengbao_privacy_unconfigured; then
      warn "gate_dengbao_privacy_unconfigured: PRIVACY_SCAN_DIRS 未配置（已豁免留痕）"
    else
      fail "gate_dengbao_privacy_unconfigured: PRIVACY_SCAN_DIRS 未配置——等保二级起要求个人信息保护，须启用 --privacy 扫描（GB/T 22239-2019 个人信息保护控制点）"
      found=1
    fi
  fi
  # ⑥ 剩余信息保护（warn-only：敏感数据清除证据）
  local _resid
  _resid=$(_scan_hits 'Arrays\.fill|shred|secureErase|SecureRandom|清除敏感|内存清零')
  [[ -z "$_resid" ]] && warn "未检出剩余信息保护证据（敏感数据存储空间清除/释放，如 Arrays.fill/shred）——建议人工核对（GB/T 22239-2019 剩余信息保护）"
  # ⑦ 四级增量检查（9.1.4.x）：国密 SM4 加密传输+存储 + 异地灾备声明 + 可信验证提示
  if [[ "$level" == "4" ]]; then
    # 数据保密性：国密 SM4（9.1.4.8）
    local _sm4
    _sm4=$(_scan_hits '\bSM4\b|国密.*加密|hutool.*Sm4|bcprov.*SM4')
    if [[ -z "$_sm4" ]]; then
      if _db_exempted gate_dengbao4_sm4; then
        warn "gate_dengbao4_sm4: 未检出 SM4 国密加密证据（已豁免留痕）"
      else
        fail "gate_dengbao4_sm4: 等保四级要求国密 SM4 加密传输+存储（9.1.4.8）——DENGBAO_SCAN_DIRS 内未检出 SM4 证据（配 CRYPTO_PROFILE=gm 启用 --crypto 联检）"
        found=1
      fi
    fi
    # 灾备恢复等级 ≥4 声明（9.1.4.9 联动 BCP5级）
    if [[ -n "$_spec" && -f "$_spec" ]]; then
      if ! grep -qE '灾备.*[4-6]级|灾难恢复.*[4-6]级|RTO.*[0-6]|RPO' "$_spec" 2>/dev/null; then
        warn "gate_dengbao4_dr: spec 未声明灾备恢复等级（等保四级 9.1.4.9 要求灾备不低于4级，spec §20 须声明 RTO/RPO/灾备等级）"
      fi
    fi
    # 可信验证（9.1.4.6）：硬件级 TPM/TCM，门禁无法静态核查
    warn "gate_dengbao4_trust: 等保四级 9.1.4.6 可信验证（TPM/TCM）是硬件级要求——人工核对可信根实现"
    # MAC 强制访问控制（9.1.4.2）：OS/DB 层
    warn "gate_dengbao4_mac: 等保四级 9.1.4.2 强制访问控制（MAC）是 OS/DB 层——人工核对 MAC 策略配置"
  fi
  [[ $found -eq 0 ]] && { pass "等保 ${level} 级控制点映射检查通过（GB/T 22239-2019）"; return 0; }
}
