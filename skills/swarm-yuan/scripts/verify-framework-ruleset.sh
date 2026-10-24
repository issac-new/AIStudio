#!/usr/bin/env bash
# 用法: verify-framework-ruleset.sh <ruleset_id> [--strict-freshness]  —— 范式侧四要素机械核验
#   --strict-freshness：要素5（freshness）从 warn 升级为 fail-closed（默认 warn——时间流逝不应破坏构建）
set -u
BASE="$(cd "$(dirname "$0")/.." && pwd)"
ID="$1"
STRICT_FRESHNESS=0
[[ "${2:-}" == "--strict-freshness" ]] && STRICT_FRESHNESS=1
FN="_fw_$(echo "$ID" | tr '-' '_')_check"
RULE="$BASE/references/frameworks/$ID.md"
GATE="$BASE/assets/framework-gates/$ID.sh"
FAIL=0
err() { echo "✗ $1"; FAIL=1; }
ok()  { echo "✓ $1"; }

[[ -f "$RULE" ]] || { err "规则文件缺失: $RULE"; exit 1; }
[[ -f "$GATE" ]] || err "门禁片段缺失: $GATE"

# 要素2: §3 规律数 >= 深度门槛（frontmatter 声明，默认 10）
TH=$(sed -n 's/^深度门槛: *//p' "$RULE" | head -1); TH=${TH:-10}
CNT=$(grep -c '^### 规律' "$RULE")
[[ "$CNT" -ge "$TH" ]] && ok "规律数 $CNT >= 门槛 $TH" || err "规律数 $CNT < 门槛 $TH"

# 要素2b: 每条规律含 对应门禁 或 人工检查
# 简历：扫描每个"### 规律"小节体内是否出现 对应门禁/人工检查 关键字。
# 状态机式 awk（避免 BSD/GNU awk 的 E1,E2 range 在 E1 行即关闭区间造成漏检）：
#   - 命中 ^### 规律 → 计数 c++，进入该规律小节体内（insec=1）
#   - 命中 下一个 ^### 或 ^## → 退出小节（insec=0）
#   - 体内命中 对应门禁|人工检查 → 记 g[c]=1
NOGATE=$(awk '
  /^### 规律/ { c++; insec=1; next }
  /^###|^## / { insec=0; next }
  insec && /对应门禁|人工检查/ { g[c]=1 }
  END { n=0; for(i=1;i<=c;i++) if(!g[i]) n++; print n+0 }
' "$RULE")
[[ "$NOGATE" -eq 0 ]] && ok "全部规律挂门禁/人工检查" || err "$NOGATE 条规律未挂门禁"

# 要素3: §4 门禁 id ⊆ 片段 gates: 头注释，且函数存在
IDS=$(awk '/^## §4/,/^## §5/' "$RULE" | grep -oE 'fw_[a-z0-9_]+' | sort -u)
for gid in $IDS; do
  grep -q "$gid" "$GATE" || err "门禁 $gid 在 $GATE 中无实现痕迹"
done
[[ -f "$GATE" ]] && { grep -q "^${FN}()" "$GATE" && ok "函数 $FN 存在" || err "函数 $FN 不存在于 $GATE"; }

# 要素3b: 片段三平台兼容语法
bash -n "$GATE" 2>/dev/null && ok "片段语法 OK" || err "片段语法错误"
grep -q 'declare -A' "$GATE" && err "片段用了 declare -A（违反三平台铁律）"

# 要素3c: NOBSD 可移植性静态检查
# 背景：spring-boot 的 [A-Za-z0-9_<>,.\[\] ] 字符类在 BSD grep 2.6.0-FreeBSD 下 \] 被提前闭类，
#   正则结构改变 → 门禁恒 pass 沉睡（GNU CI 不发病，macOS 本地与 CI 判定不一致）。本节把此类模式变静态红线。
# 五类禁则（仅检可执行行；整行注释豁免——说明性文字允许出现模式字面量）：
#   CLASS-ESC  字符类内转义方括号 \[ \]（POSIX 写法：] 置类首、[ 直接作字面量写入类中）
#   GREP-PZ    grep GNU-only 短选项 -P/-z（含 -rzoP 组合，对照审计已知问题；--include 为 BSD 兼容组合，不误伤）
#   SED-I      sed -i 不带 .bak 后缀（GNU/BSD 的 -i 语义不兼容；仓库惯例 sed -i.bak + rm）
#   READLINK-F readlink -f（BSD readlink 无 -f；用 $(cd dir && pwd) 替代）
#   DECLARE-A  declare -A（bash 3.2 无关联数组；要素3b 已检，此处并入统一报告）
# 备查登记：sentinel.sh:32/75 等 grep -rlE '<pat>' "${arr[@]+...}" 内联文件列表用法已评审——
#   显式文件操作数下 -r 在 GNU/BSD 均为普通文件读取，无递归语义分歧，不列入禁则。
# 白名单（已确认存量，逐项注释理由；条目格式 <basename>:<行号>——行位移会 fail-closed 强制复核，刻意为之）：
NOBSD_WHITELIST=(
  # tailwind.sh:81 类 [^\]] 内 \]：GNU=「非 ]」，BSD 额外排除反斜杠；
  #   Tailwind 原子类内容不含字面反斜杠，计数结果实际一致。
  #   改 POSIX 写法属既有门禁行为变更，按「不贸然唤醒」原则留独立批+fixture 处置。
  "tailwind.sh:81"
)
if [[ -f "$GATE" ]]; then
  NOBSD_BAD=0
  while IFS=$'\t' read -r _nb_rule _nb_ln; do
    [[ -z "${_nb_rule:-}" || -z "${_nb_ln:-}" ]] && continue
    _nb_key="$(basename "$GATE"):${_nb_ln}"
    _nb_wl=0
    for _nb_w in ${NOBSD_WHITELIST[@]+"${NOBSD_WHITELIST[@]}"}; do
      [[ "$_nb_w" == "$_nb_key" ]] && { _nb_wl=1; break; }
    done
    if [[ "$_nb_wl" -eq 1 ]]; then
      echo "  ○ NOBSD 豁免（白名单已确认存量）: ${_nb_key} [${_nb_rule}]"
    else
      NOBSD_BAD=$((NOBSD_BAD+1))
      err "NOBSD 非可移植模式 ${_nb_key} [${_nb_rule}]（五类禁则见脚本要素3c注释）"
    fi
  done < <(awk -v SQ="'" '
    /^[[:space:]]*#/ { next }
    {
      if (index($0, "declare -A") > 0) print "DECLARE-A\t" NR
      if ($0 ~ /readlink[[:space:]]+(-[a-zA-Z]+[[:space:]]+)*-[a-zA-Z]*f/) print "READLINK-F\t" NR
      sedre = "sed[[:space:]]+(-[a-zA-Z]+[[:space:]]+)*-i([[:space:]\"" SQ "]|$)"
      if ($0 ~ sedre && $0 !~ /-i\.bak/) print "SED-I\t" NR
      if ($0 ~ /grep[[:space:]]+(-[a-zA-Z]+[[:space:]]+)*-[a-zA-Z]*[Pz][a-zA-Z]*([[:space:]]|$)/) print "GREP-PZ\t" NR
      # CLASS-ESC 字符级状态机（避免正则误伤 \[mysqld\] 等类外合法转义）
      inclass=0; cstart=0; n=length($0)
      for (i=1; i<=n; i++) {
        c=substr($0,i,1); nx=substr($0,i+1,1)
        if (!inclass) {
          if (c=="\\") { i++; continue }              # 类外转义序列整体跳过（合法）
          if (c=="[") { inclass=1; cstart=i }
        } else {
          if (c=="\\" && (nx=="[" || nx=="]")) { print "CLASS-ESC\t" NR; break }
          if (c=="\\") { i++; continue }              # 类内成对反斜杠跳过
          if (c=="]" && i>cstart+1) inclass=0         # 类首 ] 是字面量
        }
      }
    }' "$GATE")
  [[ "$NOBSD_BAD" -eq 0 ]] && ok "NOBSD 可移植性静态检查通过（五类禁则零新增命中）"
fi

# 要素4: fixture 双态（全 81 框架强制，不再仅核心 10）
# 现状：81 框架已全有 fixture（2026-07 核实），故从 warn 升 fail。
# CORE_RULESETS 保留作历史标记，但 fixture 缺失一律 fail（不再 warn 放过）。
CORE_RULESETS="spring-boot mybatis react vue gin kafka mysql django fastapi nextjs"
FX="$BASE/tests/fixtures/$ID"
if [[ -d "${FX}/violating" && -d "${FX}/compliant" ]]; then
  bash "$BASE/tests/run-framework-fixture.sh" "$ID" >/dev/null 2>&1 \
    && ok "fixture 双态通过" || err "fixture 双态失败（运行 tests/run-framework-fixture.sh $ID 查看）"
else
  err "缺 fixture 双态（${FX}）——全 81 框架强制双态覆盖（核心集 $ID 尤甚）"
fi

# 要素5: freshness——frontmatter「最后调研」日期时效（self-check.sh 有同构全量检查）
# 默认 warn（时间流逝不应破坏构建）；--strict-freshness 时 >365 天 fail-closed
_fd=$(sed -n 's/^最后调研: *\([0-9-]*\).*/\1/p' "$RULE" | head -1)
if [[ -z "$_fd" ]]; then
  echo "⚠ 规则文件缺「最后调研」日期"
else
  _fts=$(date -u -j -f "%Y-%m-%d" "$_fd" +%s 2>/dev/null || date -u -d "$_fd" +%s 2>/dev/null || echo 0)
  if [[ "$_fts" -eq 0 ]]; then
    echo "⚠ 「最后调研」日期格式异常: $_fd"
  else
    _now=$(date -u +%s)
    _age=$(( (_now - _fts) / 86400 ))
    if [[ "$_age" -gt 365 ]]; then
      if [[ "$STRICT_FRESHNESS" -eq 1 ]]; then
        err "规则集过期：调研于 ${_fd}（${_age} 天前 >365 天，--strict-freshness fail-closed）"
      else
        echo "⚠ 规则集过期：调研于 ${_fd}（${_age} 天前 >365 天），建议重新核实版本区间"
      fi
    else
      ok "freshness：调研于 ${_fd}（${_age} 天前，≤365 天）"
    fi
  fi
fi
[[ "$FAIL" -eq 0 ]] && echo "规则集 $ID 核验通过" || { echo "规则集 $ID 核验未通过"; exit 1; }
