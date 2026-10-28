#!/usr/bin/env bash
# 守门：precheck.conf 的 PROJECT_DIR 只能经 source 消费
#
# 背景（2026-10-28 清偿）：本仓曾出现字面量垃圾目录
#   skills/swarm-yuan/${PROJECT_DIR:-<项目根绝对路径>}"  # MEASURE: ...
# 成因=值行带 # MEASURE 行内注释（MEASURE 覆盖检查要求注释与变量同行），
# 而旧消费者按文本切分取值，把「整行含注释」当路径 mkdir。解析器已改为
# source 取值（Task 2），本测锁两条不变量，防回归：
#   ① source 后 PROJECT_DIR 恰为占位符 <项目根绝对路径>（不含注释尾巴）
#   ② scripts/ assets/ lib/ 内不得再出现按 ^PROJECT_DIR= 文本提取的消费者
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONF="$ROOT/assets/precheck.conf"
FAIL=0
ok() { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

[[ -f "$CONF" ]] || { echo "✗ 缺 $CONF" >&2; exit 1; }

# ① source 取值：清空环境变量，走 conf 内建默认（与 precheck.sh / generate-skill.sh 同法）
val="$(env -u PROJECT_DIR bash -c 'set +u; . "$1" 2>/dev/null; printf "%s" "${PROJECT_DIR:-}"' _ "$CONF")"
if [[ "$val" == "<项目根绝对路径>" ]]; then
  ok "source 取值 = 占位符（无行内注释尾巴）"
else
  bad "source 取值异常（应恰为占位符）: [$val]"
fi
# 占位符必须被现有占位符判据识别（<...> 形态），否则下游会当真值
case "$val" in
  "<"*">") ok "占位符形态可被 <...> 判据识别" ;;
  *) bad "占位符形态不可识别: [$val]" ;;
esac

# ② 静态回归：凡从 conf 文本取 PROJECT_DIR 的实现，必须走 spf_conf_val 或自带
# 自引用 ${PROJECT_DIR:-...} 剥壳 + 占位符判据；裸 sed/cut 取整行会把注释当路径
files="$(grep -rl '\^PROJECT_DIR=' --include='*.sh' --include='*.py' --include='*.mjs' \
  "$ROOT/scripts" "$ROOT/assets" "$ROOT/lib" 2>/dev/null || true)"
unarmed=""
for f in $files; do
  if grep -qF 'spf_conf_val' "$f" || grep -qF "\${PROJECT_DIR:-" "$f"; then
    :
  else
    unarmed="$unarmed\n$f"
  fi
done
if [[ -z "$unarmed" ]]; then
  ok "conf 文本取值的实现均具备自引用剥壳/占位符判据（或走 spf_conf_val）"
else
  bad "以下实现裸取 PROJECT_DIR 整行（注释/自引用会被当路径）:$(printf "$unarmed")"
fi

if [[ "$FAIL" -eq 0 ]]; then echo "PASS: precheck.conf PROJECT_DIR 取值面守门"; else echo "FAIL"; fi
exit "$FAIL"
