#!/usr/bin/env bash
# test-bat-parity.sh — Windows .bat 薄壳 argv 路径转换对账测试（R128）
# 覆盖：
#   ① 全部 .bat 含 swarm-yuan:argv-posix-convert v1 标记行、A-Z 盘符循环（BASH_DIR 转换）、argv 标签
#   ② 每份 .bat 有同名 .sh 对应物（install.bat↔install.sh、precheck/state-machine 落 assets/ 等，映射表见输出）
#   ③ make-offline-bundle.sh 的 install-offline.bat 模板含 \Git\ 过滤、标记行、wslpath、!SW_ARGV! 调用行
#   ④ .bat 调用行引用的 .sh 按映射表在仓内真实存在；调用行全部走 !SW_ARGV!（无裸 %* 残留）
#   ⑤ .bat 保持 CRLF 行尾（编辑回归锁——混合行尾会让 cmd 解析漂移）
# 说明：本机为 macOS，无法执行 .bat——全部为静态断言，Windows 实机行为未验证（诚实披露）。
set -euo pipefail
cd "$(dirname "${0}")/.."
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

MARKER='swarm-yuan:argv-posix-convert v1'
DRIVE_LOOP='for %%d in (A B C D E F G H I J K L M N O P Q R S T U V W X Y Z)'
CR=$'\r'

# .bat → .sh 映射（唯一事实源；新增 .bat 时在此登记）
# 规则：install.bat↔install.sh；scripts/<n>.bat 优先 scripts/<n>.sh、无则 assets/<n>.sh
#       （precheck/state-machine 的 .sh 在 assets/，见各 .bat 自述注释）；assets/<n>.bat↔assets/<n>.sh
sh_of() {
  local n
  case "$1" in
    install.bat) echo "install.sh" ;;
    scripts/*.bat)
      n="$(basename "$1" .bat)"
      if [[ -f "scripts/$n.sh" ]]; then echo "scripts/$n.sh"; else echo "assets/$n.sh"; fi ;;
    assets/*.bat) echo "assets/$(basename "$1" .bat).sh" ;;
    *) return 1 ;;
  esac
}

# ===== 0 清单 =====
BATS=""
for f in install.bat scripts/*.bat assets/*.bat; do
  [[ -f "$f" ]] || { bad "0 $f 不存在（glob 未展开？）"; continue; }
  BATS="$BATS $f"
done
n_bats="$(printf '%s' "$BATS" | wc -w | tr -d ' ')"
if [[ "$n_bats" -eq 11 ]]; then ok "0 .bat 共 $n_bats 份"; else bad "0 .bat 份数 $n_bats ≠ 11——清单漂移，请同步本测试映射规则"; fi

# ===== ① 标记行 + 盘符循环 + argv 标签 =====
sec1=0
for f in $BATS; do
  # shellcheck disable=SC2086
  grep -qF "$MARKER" "$f"      || { bad "1a $f:0 缺标记行「${MARKER}」（argv 转换块未注入）"; sec1=1; }
  grep -qF "$DRIVE_LOOP" "$f"  || { bad "1b $f:0 缺 A-Z 盘符循环（BASH_DIR 转换块漂移）"; sec1=1; }
  grep -qF ':sw_argv_loop' "$f" || { bad "1c $f:0 缺 :sw_argv_loop 标签（argv 转换块缺失）"; sec1=1; }
done
[[ "$sec1" -eq 0 ]] && ok "① 标记行 + 盘符循环 + argv 标签（$n_bats 份全过）"

# ===== ② .bat ↔ .sh 映射表 =====
echo "② .bat ↔ .sh 对应物映射表："
sec2=0
for f in $BATS; do
  # shellcheck disable=SC2086
  shp="$(sh_of "$f" || true)"
  if [[ -z "$shp" ]]; then
    bad "2a $f:0 无映射规则（新增 .bat 请在 sh_of() 登记）"; sec2=1; continue
  fi
  if [[ -f "$shp" ]]; then
    echo "  · $f -> $shp"
  else
    bad "2b $f:0 对应 .sh 缺失: $shp"; sec2=1
  fi
done
[[ "$sec2" -eq 0 ]] && ok "② $n_bats 份 .bat 映射齐全且 .sh 全部在位"

# ===== ③ install-offline.bat 模板（make-offline-bundle.sh heredoc） =====
BD="scripts/make-offline-bundle.sh"
# 抽取 install-offline.bat 的 heredoc 段：起始行同时含 install-offline.bat 与 <<'IEOF'，止于顶格 IEOF
tpl="$(awk 't && /^IEOF$/ {exit} /install-offline\.bat.*<<.IEOF./ {t=1; next} t {print}' "$BD")"
if [[ -n "$tpl" ]]; then
  ok "3a 模板段可抽取（$(printf '%s\n' "$tpl" | wc -l | tr -d ' ') 行）"
else
  bad "3a $BD:0 install-offline.bat 模板段抽取失败（heredoc 锚点漂移）"
fi
tpl_grep() { printf '%s\n' "$tpl" | grep "$@" || true; }
[[ -n "$(tpl_grep -F "$MARKER")" ]]      && ok "3b 模板含标记行（argv 转换块）"      || bad "3b $BD 模板缺标记行"
[[ -n "$(tpl_grep -F '\Git\')" ]]        && ok "3c 模板 where bash 含 \\Git\\ 过滤"   || bad "3c $BD 模板缺 \\Git\\ 过滤（会误命中 WSL bash）"
[[ -n "$(tpl_grep -F 'wslpath')" ]]      && ok "3d 模板含 wslpath（WSL HOME 修正）"   || bad "3d $BD 模板缺 wslpath"
[[ -n "$(tpl_grep -F '!SW_ARGV!')" ]]    && ok "3e 模板调用行走 !SW_ARGV!"           || bad "3e $BD 模板调用行未用 !SW_ARGV!"
[[ -n "$(tpl_grep -F "$DRIVE_LOOP")" ]]  && ok "3f 模板含 A-Z 盘符循环"               || bad "3f $BD 模板缺盘符循环"
[[ -z "$(tpl_grep '\.sh" %\*')" ]]       && ok "3g 模板调用行无裸 %* 残留"            || bad "3g $BD 模板调用行残留裸 %*"

# ===== ④ 调用行引用的 .sh 真实存在 + 走 !SW_ARGV! =====
sec4=0
for f in $BATS; do
  # shellcheck disable=SC2086
  ref="$(grep -o '!BASH_DIR![A-Za-z0-9._/-]*\.sh' "$f" | head -1 | sed 's|.*/||' || true)"
  shp="$(sh_of "$f" || true)"
  if [[ -n "$ref" && -n "$shp" ]]; then
    if [[ "$(basename "$shp")" == "$ref" && -f "$shp" ]]; then :; else
      bad "4a $f:0 调用行引用 $ref 与映射对应物 $shp 不一致或缺失"; sec4=1
    fi
  else
    bad "4a $f:0 未抽取到调用行引用（!BASH_DIR!/xxx.sh）"; sec4=1
  fi
  raw="$(grep -n '\.sh" %\*' "$f" || true)"
  if [[ -n "$raw" ]]; then bad "4b $f 调用行残留裸 %*: $(printf '%s' "$raw" | tr '\n' ' ')"; sec4=1; fi
  n_argv="$(grep -c '\.sh" !SW_ARGV!' "$f" || true)"
  if [[ "$n_argv" -ne 2 ]]; then bad "4c $f:0 !SW_ARGV! 调用行 ${n_argv} 处（期望 2：WSL 分支 + Git Bash 分支）"; sec4=1; fi
done
[[ "$sec4" -eq 0 ]] && ok "④ 引用 .sh 全部在位；调用行全部走 !SW_ARGV!（$n_bats 份 × 2 处）"

# ===== ⑤ CRLF 行尾保持 =====
sec5=0
for f in $BATS; do
  # shellcheck disable=SC2086
  bad_lines="$(grep -nv "${CR}\$" "$f" || true)"
  if [[ -n "$bad_lines" ]]; then
    bad "5 $f 存在非 CRLF 行（file:line）: $(printf '%s' "$bad_lines" | cut -d: -f1 | tr '\n' ' ')"
    sec5=1
  fi
done
[[ "$sec5" -eq 0 ]] && ok "⑤ $n_bats 份 .bat 全部保持 CRLF 行尾"

if [[ "$FAIL" -eq 0 ]]; then echo "test-bat-parity: PASS"; else echo "test-bat-parity: FAIL" >&2; fi
exit "$FAIL"
