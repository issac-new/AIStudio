#!/usr/bin/env bash
# split-gates.sh —— 把 precheck.sh 的 check_* 门禁 + 专属辅助函数抽到
# gates-strict.sh / gates-warn.sh / gates-advisory.sh 三文件（按 gate-enforce-level.conf）。
#
# 状态：此脚本已不活跃（守卫 :20-22 在 gates-strict.sh 已存在时直接跳过，非幂等）。
#   gates-*.sh 现手工维护，FN 列表/计数可能滞后——以 assets/gates-*.sh 实际 check_* 函数为准。
#   真值（2026-07-27 核实）：gates-strict.sh=17 / gates-warn.sh=21 / gates-advisory.sh=16（含 check_cognition 因历史）。
#   enforce-level 真值（gate-enforce-level.conf）：strict=20 / warn=19 / advisory=15。
#   若需重新拆分：先删 gates-*.sh 三文件再跑本脚本（会重写 precheck.sh 行号表，需手工核对）。
#
# 行号范围表手工核对（基于 4143 行版本的 precheck.sh）。若 precheck.sh 行数变化需重核对。
# 安全算法：用"行首 ^} 作为函数结束"规则（bash 函数体用缩进，} 在行首），
#           内嵌 awk/sed 的 } 在字符串内不在行首，不误判。
#           两个例外手工修正：_norm_ver（单行函数，end=start）、check_framework（end=3910）。
set -u

BASE="$(cd "$(dirname "${0}")/.." && pwd)"
PRECHECK="${BASE}/assets/precheck.sh"
CONF="${BASE}/assets/gate-enforce-level.conf"

if [[ ! -f "${PRECHECK}" ]] || [[ ! -f "${CONF}" ]]; then
  echo "✗ precheck.sh 或 gate-enforce-level.conf 不存在" >&2; exit 1
fi

# 守卫：gates-strict.sh 仅在拆分后存在，已拆分态直接跳过（避免重写非幂等毁文件）
if [[ -f "${BASE}/assets/gates-strict.sh" ]]; then
  echo "✓ 已拆分（gates-strict.sh 已存在），跳过"; exit 0
fi

# 行号范围表（49 个函数：48 门禁 + 5 辅助）。格式：函数名 起始行 结束行
# 注：首 41 行的行号为 precheck.sh 原始行号；末 4 行为拆分后 gates-*.sh 实测行号
# （check_dengbao/check_pia 在 gates-strict.sh；check_sast_deep/check_oss_eval 在 gates-warn.sh）。
RANGES_FILE="$(mktemp /tmp/split-ranges.XXXXXX)"
cat > "$RANGES_FILE" <<'EOF'
check_branch 908 933
check_scope 935 961
check_build 963 974
check_test 976 987
_check_sensitive_gitleaks 991 1023
check_sensitive 1025 1081
check_consistency 1083 1106
check_review 1108 1173
check_layer 1178 1378
check_stable_diff 1380 1462
check_link_depth 1464 1537
check_reuse 1539 1649
_extract_deps 1652 1705
_norm_ver 1708 1708
check_deps 1710 1792
_sec_scan 1795 1809
_check_security_semgrep 1813 1846
check_security 1848 1984
check_adr 1989 2069
check_contract 2071 2140
check_consistency_cross 2142 2202
check_impact 2204 2280
check_service 2285 2387
check_api 2389 2463
check_state 2468 2515
check_frontend 2517 2631
check_cognition 2639 2916
check_domain 2918 3006
check_knowledge 3008 3075
check_diagram 3077 3109
check_shift_left 3112 3271
check_compliance 3277 3333
check_docs_pack 3336 3382
check_sbom 3385 3479
check_privacy 3482 3542
check_authz 3551 3613
check_requirements 3617 3687
check_crypto 3692 3730
check_rtm 3739 3795
check_release_sign 3803 3871
check_framework 3874 3910
check_dengbao 1137 1248
check_pia 1250 1290
check_sast_deep 1238 1287
check_oss_eval 1293 1334
check_quality_model 1499 1538
check_test_evidence 1324 1374
check_review_record 1376 1423
check_metrics 1379 1427
EOF

# 按 enforce_level 分组（含辅助函数跟随主门禁）
STRICT_FNS="check_branch check_layer check_reuse _sec_scan _check_security_semgrep check_security check_shift_left check_compliance check_sbom check_privacy check_authz check_requirements check_rtm check_release_sign check_dengbao check_pia check_quality_model check_test_evidence check_review_record"
WARN_FNS="check_scope check_build check_test _check_sensitive_gitleaks check_sensitive check_review check_stable_diff _extract_deps _norm_ver check_deps check_adr check_contract check_impact check_service check_api check_frontend check_domain check_knowledge check_docs_pack check_crypto check_framework check_sast_deep check_oss_eval check_metrics"
ADVISORY_FNS="check_consistency check_link_depth check_consistency_cross check_state check_cognition check_diagram"

# 抽取一组函数到目标文件
extract_to() {
  local out="$1" level="$2" fns="$3"
  {
    echo "#!/usr/bin/env bash"
    echo "# ${level} 门禁（由 scripts/split-gates.sh 从 precheck.sh 抽取，决策 19）"
    echo "# 被 precheck.sh source（开发态）或 install.sh 内联（打包态）。"
    echo "# 不要单独执行——依赖 precheck.sh 主文件的 fail()/warn()/pass() 与全局变量。"
    echo ""
    local fn line s e
    for fn in $fns; do
      line=$(awk -v fn="$fn" '$1==fn{print $2, $3; exit}' "$RANGES_FILE")
      [[ -z "$line" ]] && continue
      read -r s e <<< "$line"
      sed -n "${s},${e}p" "${PRECHECK}"
      echo ""
    done
  } > "${out}"
  echo "✓ 生成 ${out}（$(wc -l < "${out}" | tr -d ' ') 行，$(grep -cE '^(check_|_)[a-z_]+\(\)' "${out}") 个函数）"
}

extract_to "${BASE}/assets/gates-strict.sh"   "strict (17)"   "$STRICT_FNS"
extract_to "${BASE}/assets/gates-warn.sh"     "warn (21)"     "$WARN_FNS"
extract_to "${BASE}/assets/gates-advisory.sh" "advisory (16)"  "$ADVISORY_FNS"

# 删除已抽出的行（41 个函数的行号区间）
awk -v rf="$RANGES_FILE" '
  BEGIN {
    while ((getline line < rf) > 0) {
      n = split(line, p, " ")
      if (n >= 3 && p[2] && p[3]) {
        for (j = p[2]; j <= p[3]; j++) del[j] = 1
      }
    }
    close(rf)
  }
  !del[NR]
' "${PRECHECK}" > "${PRECHECK}.tmp"

_tmp_lines=$(wc -l < "${PRECHECK}.tmp" | tr -d ' ')
# 预期：4143 - 2904 ≈ 1239，加保留的空行/注释，区间 1000-1800
if [[ "$_tmp_lines" -lt 800 || "$_tmp_lines" -gt 2200 ]]; then
  echo "✗ 拆分后主文件行数异常: $_tmp_lines 行（预期 800-2200）——不覆盖原文件" >&2
  echo "  临时文件保留: ${PRECHECK}.tmp" >&2
  rm -f "$RANGES_FILE"
  exit 1
fi
mv "${PRECHECK}.tmp" "${PRECHECK}"

# 插入 source 守卫（在 _load_enforce_levels 调用行之后）
GUARD_FILE="$(mktemp /tmp/split-guard.XXXXXX)"
cat > "$GUARD_FILE" <<'GUARDEOF'

# ===== 门禁函数 source 守卫（决策 19：三档拆分）=====
# 开发态：source gates-strict/warn/advisory.sh 三文件（与 precheck.sh 同目录）
# install.sh 整目录拷贝（含三文件）；SWARM_YUAN_BUNDLED=1 为预留扩展点（当前无生产者）
if [[ -z "${SWARM_YUAN_BUNDLED:-}" ]]; then
  for _gf in gates-strict.sh gates-warn.sh gates-advisory.sh; do
    _gp="$(dirname "$0")/$_gf"
    [[ -f "$_gp" ]] && source "$_gp"
  done
fi
GUARDEOF

awk -v gf="$GUARD_FILE" '
  /^_load_enforce_levels$/ {
    print
    while ((getline line < gf) > 0) print line
    close(gf)
    next
  }
  { print }
' "${PRECHECK}" > "${PRECHECK}.tmp"

_tmp_lines=$(wc -l < "${PRECHECK}.tmp" | tr -d ' ')
if [[ "$_tmp_lines" -lt 1000 ]]; then
  echo "✗ 插入守卫后主文件行数异常: $_tmp_lines 行——不覆盖" >&2
  rm -f "$GUARD_FILE" "$RANGES_FILE"
  exit 1
fi
mv "${PRECHECK}.tmp" "${PRECHECK}"
rm -f "$GUARD_FILE" "$RANGES_FILE"

echo "✓ precheck.sh 已删除门禁函数 + 插入 source 守卫（$(wc -l < "${PRECHECK}" | tr -d ' ') 行）"
echo ""
echo "下一步："
echo "  1. bash -n assets/precheck.sh（语法校验）"
echo "  2. bash assets/precheck.sh --list-gates（验证 source 守卫工作）"
echo "  3. bash tests/run-gate-fixture.sh（全量 fixture 验证）"
