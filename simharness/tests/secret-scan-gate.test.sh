#!/bin/bash
# secret-scan-gate.test.sh — 密钥泄漏扫描守门（质量 B③，2026-10-16）
# 来源：win10-mig 第四轮明文密钥泄漏事故（7 外部 API key+2 微信 token+1 matrix
# token+QQ 授权码随安装包外泄）的产品化根治——泄漏面从「打包前人工扫」升级为
# 「每次守门机械扫」。
# 范围：simharness + overlay 两仓 git 跟踪文件（未跟踪文件另有 git status 面）。
# 判据：命中密钥模式且非白名单登记的安全夹具 → FAIL。
# 白名单：tests/secret-scan-whitelist.txt 逐行登记「已知安全的假 token 字面量」
#         （测试夹具/文档示例）——新增夹具只加白名单行，不改守门逻辑。
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WL="$HERE/tests/secret-scan-whitelist.txt"

# 密钥模式族（win10 第四轮泄漏清单反推 + 通用形态）：
#   sk-*        OpenAI/兼容形态（20+ 位）
#   syt_*       微信 bot token 形态
#   m0-*        mem0 形态
#   <prov>_key  通用赋值形态（值 20+ 位，排除占位常量）
PAT='sk-[A-Za-z0-9]{20,}|syt_[A-Za-z0-9]{10,}|m0-[A-Za-z0-9]{20,}|(api[_-]?key|token|secret|授权码)["'"'"']?\s*[:=]\s*["'"'"']?[A-Za-z0-9_\-]{24,}'
# 占位/示例常量白名单字面（非真密钥——环境变量名、占位符、文档示例）
SAFE_LITERALS='PROXY_MANAGED|your[_-]|YOUR[_-]|xxx|XXX|<[a-z]|\$\{|change[_-]?me|CHANGE[_-]?ME|placeholder|示例|假|fake|dummy|test[_-]?only'

hits=0; scanned=0
for repo in "$HERE" "${MX_OVERLAY_ROOT:-$HERE/../overlay}"; do
  [ -d "$repo/.git" ] || continue
  scanned=$((scanned+1))
  # git grep 输出格式 file:lineno:content；逐行判白名单
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    # 占位/示例字面命中=安全（环境变量名/占位符不是密钥）
    if printf '%s' "$line" | grep -qE "$SAFE_LITERALS"; then continue; fi
    # 白名单登记的具体假 token 字面=安全（逐行 substring 匹配）
    if [ -f "$WL" ]; then
      _safe=0
      while IFS= read -r wl || [ -n "$wl" ]; do
        wl="${wl%%#*}"; wl="$(printf '%s' "$wl" | tr -d '[:space:]')"
        [ -n "$wl" ] || continue
        case "$line" in *"$wl"*) _safe=1; break ;; esac
      done < "$WL"
      [ "$_safe" = 1 ] && continue
    fi
    echo "HIT $line"
    hits=$((hits+1))
  done < <(git -C "$repo" grep -nE "$PAT" 2>/dev/null | head -100)
done

if [ "$hits" -gt 0 ]; then
  echo "FAIL 密钥泄漏扫描：$hits 处未登记命中（轮换泄漏 key+登记白名单或改为占位符）"
  exit 1
fi
echo "PASS 密钥泄漏扫描（$scanned 仓零未登记命中）"
# negative test
