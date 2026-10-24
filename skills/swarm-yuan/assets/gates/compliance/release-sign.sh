# gate: release-sign
# domain: compliance / enforce: strict / tier: compliance
check_release_sign() {
  echo "=== 发布签名与 provenance 检查（SLSA Build L2 / SSDF PS.2 发布完整性）==="
  if [[ "${RELEASE_SIGN_REQUIRED:-0}" != "1" ]]; then
    if [[ -n "${RELEASE_SIGN_EXEMPT_REASON:-}" ]]; then
      warn "发布签名检查已豁免（${RELEASE_SIGN_EXEMPT_REASON}）——fail-closed：豁免须显式声明理由"
    else
      fail "gate_release_sign_unconfigured: RELEASE_SIGN_REQUIRED 未启用且无豁免理由——安全门禁须显式配置（RELEASE_SIGN_REQUIRED=1）或填写 RELEASE_SIGN_EXEMPT_REASON 豁免理由（SLSA Build L2 / SSDF PS.2 发布完整性）"
    fi
    return
  fi
  local found=0
  # 工具降级：RELEASE_SIGN_TOOL（空=auto：有 cosign 用 cosign；"none"=强制存在性检查，无工具链环境依赖）
  local tool="${RELEASE_SIGN_TOOL:-}"
  if [[ "$tool" == "none" ]]; then
    tool=""
  elif [[ -z "$tool" ]] && command -v cosign >/dev/null 2>&1; then
    tool="cosign"
  fi
  if [[ -n "$tool" ]] && ! command -v "$tool" >/dev/null 2>&1; then
    warn "RELEASE_SIGN_TOOL=${tool} 不可用，降级为签名文件存在性检查"
    tool=""
  fi
  if [[ -z "$tool" ]]; then
    echo "  ⓘ 降级为签名文件存在性检查（cosign 不可用或未启用，SLSA 验签未执行）"
  fi
  # 产物枚举（glob 空格分隔；nullglob 展开防未命中模式退化为字面量；shopt 状态保存/恢复）
  local globs="${RELEASE_ARTIFACTS_GLOB:-dist/*.tar.gz dist/*.zip dist/*.jar}"
  local _ng_save
  _ng_save=$(shopt -p nullglob || true)
  shopt -s nullglob
  local artifacts=() a
  for a in $globs; do [[ -e "$a" ]] && artifacts+=("$a"); done
  eval "$_ng_save"
  if [[ ${#artifacts[@]} -eq 0 ]]; then
    # R118：REQUIRED=1 且零产物时旧版输出“0 个产物签名齐备”并 rc=0——零证据通过。
    if [[ "${RELEASE_SIGN_REQUIRED:-0}" == "1" ]]; then
      fail "gate_release_sign_no_artifacts: RELEASE_SIGN_REQUIRED=1 但未匹配到发布产物（${globs}）"
      return
    fi
    warn "未匹配到发布产物（${globs}）——签名检查无对象"
    return
  fi
  local sig ext vrc _sig_unverified=0
  for a in ${artifacts[@]+"${artifacts[@]}"}; do
    sig=""
    # R118：用 -s（非空）而非 -f——零字节 .asc/.sig 旧版被当成“签名齐备”。
    for ext in .sig .asc .att .bundle; do
      if [[ -s "${a}${ext}" ]]; then sig="${a}${ext}"; break; fi
    done
    if [[ -z "$sig" ]]; then
      fail "gate_release_sign_missing:${a}: 发布产物缺伴随签名/证明（非空 .sig/.asc/.att/.bundle 其一；SLSA Build L2 / SSDF PS.2）"
      found=1
      continue
    fi
    if [[ -n "$tool" ]]; then
      vrc=0
      case "$sig" in
        "${a}.bundle")
          "$tool" verify-blob --bundle "$sig" "$a" >/dev/null 2>&1 || vrc=$? ;;
        "${a}.sig")
          "$tool" verify-blob --signature "$sig" "$a" >/dev/null 2>&1 || vrc=$? ;;
        *)
          # .asc/.att 当前无对应验签实现：不得在汇总里宣称“cosign 验签通过”。
          _sig_unverified=1 ;;
      esac
      if [[ "$vrc" -ne 0 ]]; then
        fail "gate_release_sign_verify_failed:${a}: cosign verify-blob 验签失败（${sig}）"
        found=1
      fi
    else
      _sig_unverified=1
    fi
  done
  # SLSA provenance（RELEASE_PROVENANCE_REQUIRED=1，fail-closed）
  if [[ "${RELEASE_PROVENANCE_REQUIRED:-0}" == "1" ]]; then
    local prov="${RELEASE_PROVENANCE_FILE:-dist/provenance.json}"
    if [[ ! -f "$prov" ]]; then
      fail "gate_release_provenance_missing: SLSA provenance 文件不存在：${prov}（RELEASE_PROVENANCE_REQUIRED=1，fail-closed；可用 RELEASE_PROVENANCE_FILE 指定路径）"
      found=1
    elif ! grep -q '"predicateType"' "$prov" 2>/dev/null; then
      warn "provenance 文件未见 \"predicateType\" 字段（${prov}）——请确认为 in-toto/SLSA 格式"
    fi
  fi
  if [[ $found -eq 0 ]]; then
    if [[ -n "$tool" && "$_sig_unverified" -eq 0 ]]; then
      pass "发布签名检查通过（${#artifacts[@]} 个产物签名齐备，cosign 验签通过）"
    else
      pass "发布签名检查通过（${#artifacts[@]} 个产物签名齐备，存在性检查；未执行密码学验签）"
    fi
  fi
}
