# gate: crypto
# domain: security / enforce: strict / tier: compliance
check_crypto() {
  echo "=== 密码算法合规检查（GB/T 39786-2021 密评，国密白名单 SM2/SM3/SM4）==="
  local profile="${CRYPTO_PROFILE:-}"
  if [[ -z "$profile" ]]; then
    if [[ -n "${CRYPTO_EXEMPT_REASON:-}" ]]; then
      warn "密码算法检查已豁免（${CRYPTO_EXEMPT_REASON}）——fail-closed：豁免须显式声明理由"
    else
      fail "gate_crypto_unconfigured: CRYPTO_PROFILE 未配置且无豁免理由——安全门禁须显式配置（CRYPTO_PROFILE=gm）或填写 CRYPTO_EXEMPT_REASON 豁免理由（GB/T 39786-2021 密评）"
    fi
    return
  fi
  if [[ "$profile" != "gm" ]]; then
    warn "未知 CRYPTO_PROFILE：${profile}（当前仅内置 gm=GB/T 39786-2021 密评弱算法扫描），未执行"
    return
  fi
  local found=0 d f hits files _crypto_existing=0
  if [[ ${#CRYPTO_SCAN_DIRS[@]} -eq 0 ]]; then
    # R118：profile 已启用（gm）却无扫描目录=配置错误，不得静默 pass（旧版仅 warn）。
    fail "gate_crypto_scan_dirs_missing: CRYPTO_PROFILE=${profile} 已启用但 CRYPTO_SCAN_DIRS 未配置"
    return
  fi
  for d in "${CRYPTO_SCAN_DIRS[@]}"; do
    [[ -d "$d" ]] && _crypto_existing=$((_crypto_existing+1))
  done
  if [[ "$_crypto_existing" -eq 0 ]]; then
    fail "gate_crypto_scan_dirs_missing: CRYPTO_SCAN_DIRS 配置的目录全部不存在：${CRYPTO_SCAN_DIRS[*]}"
    return
  fi
  local inc=(--include='*.java' --include='*.kt' --include='*.ts' --include='*.js' --include='*.py' --include='*.go')
  for d in ${CRYPTO_SCAN_DIRS[@]+"${CRYPTO_SCAN_DIRS[@]}"}; do
    if [[ ! -d "$d" ]]; then
      warn "CRYPTO_SCAN_DIRS 目录不存在：${d}（跳过该目录）"
      continue
    fi
    # 弱算法 ERE（\b 词界防 SHA1PRNG/DESede 误命中）；滤 example/mock 噪声与注释行
    hits=$(grep -rnE '\bMD5\b|\bSHA1\b|\bDES\b|RSA[-_]?1024|\bECDSA\b' "$d" "${inc[@]}" 2>/dev/null \
      | grep -viE 'example|mock|node_modules' \
      | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|#|\*|/\*)' || true)
    if [[ -n "$hits" ]]; then
      files=$(printf '%s\n' "$hits" | cut -d: -f1 | sort -u)
      while IFS= read -r f; do
        [[ -n "$f" ]] && fail "gate_crypto_weak_algorithm:${f}: 检出弱密码算法（MD5/SHA1/DES/RSA-1024/ECDSA；GB/T 39786 密评应用 SM2/SM3/SM4 白名单）"
      done <<< "$files"
      printf '%s\n' "$hits" | head -10 | sed 's/^/    /'
      found=1
    fi
  done
  # B 方向：国密正向使用核查（warn 级——加密场景判断难自动化，不 fail 避免误报淹没；
  # 依据 references/crypto-spec.md §3 国密选型；机构密评测评仍属线下）
  local _enc_use _gm_use _rng_hit
  for d in ${CRYPTO_SCAN_DIRS[@]+"${CRYPTO_SCAN_DIRS[@]}"}; do
    [[ -d "$d" ]] || continue
    # 国密正向核查：检测到加密操作但全目录无 SM2/SM3/SM4 引用 → warn
    _enc_use=$(grep -rlE '\bencrypt\b|\bdecrypt\b|加密|解密' "$d" "${inc[@]}" 2>/dev/null \
      | grep -viE 'example|mock|node_modules' | head -1 || true)
    _gm_use=$(grep -rlE '\bSM2\b|\bSM3\b|\bSM4\b' "$d" "${inc[@]}" 2>/dev/null \
      | grep -viE 'example|mock|node_modules' | head -1 || true)
    if [[ -n "$_enc_use" && -z "$_gm_use" ]]; then
      warn "gate_crypto_gm_positive: 检测到加密操作但未使用国密算法（GB/T 39786 密评场景须 SM2/SM3/SM4）：${_enc_use}"
    fi
    # 随机数质量：安全上下文（password/token/secret/key/加密 同行）使用弱随机数 → warn
    _rng_hit=$(grep -rnE 'Math\.random|\brand[[:space:]]*\(' "$d" --include='*.js' --include='*.ts' --include='*.py' 2>/dev/null \
      | grep -viE 'example|mock|node_modules' | grep -iE 'password|token|secret|key|加密' | head -1 || true)
    [[ -n "$_rng_hit" ]] && warn "gate_crypto_weak_rng: 安全上下文使用弱随机数（Math.random/rand），安全场景须 CSPRNG：${_rng_hit}"
  done
  if [[ $found -eq 0 ]]; then
    pass "密码算法合规检查通过（未检出弱算法；国密白名单 SM2/SM3/SM4）"
  fi
}
