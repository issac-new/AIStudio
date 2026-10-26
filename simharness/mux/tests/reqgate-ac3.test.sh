#!/bin/bash
# G1 需求上锁判据守门：方案 §5.3 要求逐条 AC ≥3（禁空话）。
# 直接抽取 reqgate_judge 函数体（库文件顶层依赖运行时环境，不整库 source）。
set -u
HERE="$(cd "$(dirname "$0")/../.." && pwd)"
LIB="$HERE/mux/mx-scenario-lib.sh"
TMP="$(mktemp -d /tmp/reqgate-test.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
_rc=0
fail() { echo "FAIL: $*"; _rc=1; }

eval "$(sed -n '/^reqgate_judge()/,/^}/p' "$LIB")"
type reqgate_judge >/dev/null 2>&1 || { echo "FAIL: 无法抽取 reqgate_judge"; exit 1; }

write_doc() { # <path> <ac_count> [vague]
  local p="$1" n="$2" vague="${3:-}"
  {
    echo '# 需求'
    echo '## 验收标准'
    local i=1
    while [ "$i" -le "$n" ]; do
      if [ -n "$vague" ] && [ "$i" -eq 1 ]; then
        echo "- **AC-$i** 页面性能良好"
      else
        echo "- **AC-$i** 点击提交后 200ms 内返回订单号"
      fi
      i=$((i + 1))
    done
    echo '## Scope-Out'
    echo '- 不含退款'
    echo '## 影响面'
    echo '- 模块：收银台'
    echo '## 涉敏'
    echo '- 涉敏：是（ISO27001 摘要见附）'
  } > "$p"
}

write_doc "$TMP/two.md" 2
if reqgate_judge "$TMP/two.md" >/dev/null 2>&1; then fail "AC=2 应判缺失"; fi
reqgate_judge "$TMP/two.md" 2>&1 | grep -q '少于 3' || fail "AC=2 未给出少于 3 的判词"

write_doc "$TMP/three.md" 3
reqgate_judge "$TMP/three.md" >/dev/null 2>&1 || fail "AC=3 四要素齐备应通过"

write_doc "$TMP/vague.md" 3 vague
if reqgate_judge "$TMP/vague.md" >/dev/null 2>&1; then fail "含模糊词应判缺失"; fi

[ "$_rc" -eq 0 ] && echo "reqgate AC≥3 守门全绿"
exit "$_rc"
