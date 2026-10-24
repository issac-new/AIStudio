#!/usr/bin/env bash
# run-industry-profile.sh —— 行业 profile 覆盖断言：profile 追加到 precheck.conf 后关键变量生效
# 用法: bash tests/run-industry-profile.sh <profile-id>（finance/medical/gov/automotive/energy/telecom/industrial/payment）
set -u
BASE="$(cd "$(dirname "$0")/.." && pwd)"
P="${1:?用法: run-industry-profile.sh <profile-id>}"
CONF_SRC="${BASE}/assets/industry-profiles/${P}.conf"
[[ -f "$CONF_SRC" ]] || { echo "✗ profile 不存在：${P}"; exit 2; }
TMP="$(mktemp -d "${TMPDIR:-/tmp}/swarm-yuan-profile.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
cp "${BASE}/assets/precheck.conf" "$TMP/precheck.conf"
cat "$CONF_SRC" >> "$TMP/precheck.conf"
# source 后断言关键变量（conf 语法错误会在 source 时暴露）
# set +u 包裹 source：与 precheck.sh 生产加载语义一致（precheck.conf 头部注明
# 「conf 加载以 set +u 包裹」）——medical.conf 含未防护的 ${LOG_CODE_PATTERNS}
# 合并式扩展，非交互 bash 在 set -u 下遇未绑定变量直接终止整个子 shell。
( set +u; source "$TMP/precheck.conf" >/dev/null 2>&1 || true; set -u
  rc=0
  check() { # $1=变量名 $2=期望值（空=只查非空）
    local v
    eval "v=\"\${$1:-}\""
    if [[ -n "$2" ]]; then [[ "$v" == "$2" ]] || { echo "  ✗ $1 期望 $2 实得 '$v'"; rc=1; }
    else [[ -n "$v" ]] || { echo "  ✗ $1 为空"; rc=1; }; fi
  }
  case "$P" in
    gov)
      check DENGBAO_LEVEL 3
      check CRYPTO_PROFILE gm
      check PIA_REQUIRED 1
      check OSS_EVAL_REQUIRED 1
      check SBOM_REQUIRED 1
      check DOCS_PACK_PROFILE gbt8567
      ;;
    finance) check CRYPTO_PROFILE gm; check SBOM_REQUIRED 1 ;;
    payment)
      check CRYPTO_PROFILE gm
      check PIA_REQUIRED 1
      check SBOM_REQUIRED 1
      check RELEASE_SIGN_REQUIRED 1
      ;;
    medical) check PRIVACY_SCAN_DIRS "" ;;
    automotive)
      check SBOM_REQUIRED 1
      check OSS_EVAL_REQUIRED 1
      check RELEASE_SIGN_REQUIRED 1
      check RTM_REQUIRED 1
      ;;
    energy)
      check DENGBAO_LEVEL 3
      check CRYPTO_PROFILE gm
      check SBOM_REQUIRED 1
      ;;
    telecom)
      check DENGBAO_LEVEL 3
      check CRYPTO_PROFILE gm
      check PIA_REQUIRED 1
      check SBOM_REQUIRED 1
      ;;
    industrial)
      check DENGBAO_LEVEL 3
      check CRYPTO_PROFILE gm
      check SBOM_REQUIRED 1
      ;;
    *) echo "✗ 未登记的 profile 断言集：${P}"; exit 2 ;;
  esac
  exit $rc ) || { echo "✗ profile ${P} 断言失败"; exit 1; }
echo "✓ profile ${P} 覆盖断言通过"
