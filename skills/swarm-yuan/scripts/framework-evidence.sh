#!/usr/bin/env bash
# framework-evidence.sh — 框架规律证据台账（最大 token 池脚本化）
# 输入: 目标仓库 + ACTIVE_FRAMEWORKS → 逐框架提取 references/frameworks/<fw>.md §3 verify 块
#       → 批量执行 cmd（${PROJECT_DIR} 替换为实参）→ 输出证据台账 TSV
# 输出: stdout TSV「framework | rule_id | rule_title | hits | evidence(top-N file:line) | SUGGEST」
#   SUGGEST 启发式（非判决）: hits>0 → applicable; hits=0 且 expect≠always → likely-na; expect=always → manual
# 红线（template-spec.md:346）: 本脚本只产证据台账 + 启发式 SUGGEST，不替模型做适用/不适用判断。
# 用法:
#   bash framework-evidence.sh <PROJECT_DIR> [--frameworks <fw1,fw2>] [--frameworks-dir <dir>] [--top <N>]
#     --frameworks       逗号分隔框架 id 列表（不给则调 detect-frameworks.sh 自动探测）
#     --frameworks-dir   框架文件目录（默认 references/frameworks，测试用）
#     --top              evidence 截断条数（默认 3）
# 退出码: 0 正常（fail-open，框架文件缺失跳过）；1 arg 错误。
set -uo pipefail
BASE="$(cd "$(dirname "${0}")/.." && pwd)"

PROJ=""; FWS=""; FWDIR="$BASE/references/frameworks"; TOP=3
while [[ $# -gt 0 ]]; do
  case "$1" in
    --frameworks) FWS="${2:?--frameworks 需要列表}"; shift 2 ;;
    --frameworks-dir) FWDIR="${2:?--frameworks-dir 需要路径}"; shift 2 ;;
    --top) TOP="${2:?--top 需要 N}"; shift 2 ;;
    -h|--help) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) [[ -z "$PROJ" ]] && PROJ="$1" || { echo "未知参数: $1" >&2; exit 1; }; shift ;;
  esac
done
[[ -n "$PROJ" && -d "$PROJ" ]] || { echo "✗ PROJECT_DIR 缺失或不存在: ${PROJ:-（空）}" >&2; exit 1; }
PROJ="$(cd "$PROJ" && pwd)"

# 框架列表：--frameworks > detect-frameworks.sh
if [[ -z "$FWS" ]]; then
  if [[ -x "$BASE/scripts/detect-frameworks.sh" ]]; then
    # R118-D2（nest-forge 实证，8 框架只出 1）：旧 sed 's/.*"\([^"]*\)".*/\1/p' 贪婪匹配
    # 在多框架 ACTIVE_FRAMEWORKS 行上只捕获最后一个引号 token——多框架项目证据台账
    # 静默缩水为单框架。改为逐 token 提取：剥前缀/括号/引号 → 空格切列 → 逗号重组。
    FWS=$("$BASE/scripts/detect-frameworks.sh" "$PROJ" 2>/dev/null \
      | sed -n 's/^ACTIVE_FRAMEWORKS=//p' | tr -d '()"' | tr -s ' ' '\n' \
      | grep -v '^$' | tr '\n' ',' | sed 's/,$//')
  fi
  [[ -z "$FWS" ]] && { echo "（无 ACTIVE_FRAMEWORKS，台账为空）"; exit 0; }
fi

printf 'framework\trule_id\trule_title\thits\tevidence\tSUGGEST\n'

# bash 3.2 兼容的多框架迭代：用 set -- 切分逗号列表（处理单/多框架）
oifs=$IFS; IFS=','; set -- $FWS; IFS=$oifs
for fw in "$@"; do
  [[ -n "$fw" ]] || continue
  rule="$FWDIR/$fw.md"
  [[ -f "$rule" ]] || { printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$fw" "-" "-" "-" "-" "NO_RULE_FILE"; continue; }
  # 状态机式扫 verify 块：进入 ```verify 段，收 id/cmd/expect；退出时输出 VBLK 行
  # 红线：awk 只解析块字段，不执行 cmd（执行在 shell 层 fail-open）。
  # 用 US(\x1f, 非空白) 作分隔符：read 对 IFS 空白会合并空字段（空 cmd 会塌陷），
  # 非空白分隔符保留空字段，保证 id/cmd/expect/title 对齐（bash 3.2 兼容）。
  US="$(printf '\x1f')"
  awk -v fw="$fw" -v us="$US" '
    /^```verify/ { inblk=1; id=""; cmd=""; expect="always"; next }
    inblk && /^```/ { inblk=0; printf "%s%s%s%s%s%s%s%s%s\n", id, us, cmd, us, expect, us, title, us, fw; next }
    inblk && /^id:/ { id=$2 }
    inblk && /^cmd:/ { sub(/^cmd:[[:space:]]*/,""); cmd=$0 }
    inblk && /^expect:/ { expect=$2 }
    /^### 规律/ { title=$0; sub(/^### 规律[：:]?[[:space:]]*/,"",title) }
  ' "$rule" | while IFS="$US" read -r vid vcmd vexp vtitle vfw; do
    [[ -n "$vid" ]] || continue
    if [[ "$vexp" == "always" || -z "$vcmd" ]]; then
      printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$fw" "$vid" "$vtitle" "-" "-" "manual"
      continue
    fi
    # R118：项目路径先 %q 再替换——旧版 sed 直插后 eval，路径含 $(...)/反引号即命令执行。
    _proj_q=$(printf '%q' "$PROJ")
    _cmd="${vcmd//'${PROJECT_DIR}'/$_proj_q}"
    # 单次 eval 捕获输出，再派生 hits + evidence（避免双重执行/词法分裂）。
    # 无操作数 grep 运行时防护：verify cmd 常含 conf 数组变量（如 ${VUE_PINIA_FILE_GLOBS[@]+...}），
    # 本脚本运行在 conf 渲染前（Step 4），变量未定义 → 展开零参数 → grep 无文件操作数时
    # GNU grep -r 递归扫 cwd（含 node_modules/dist，依赖库代码冒充项目证据）。
    # 子 shell 内定义 grep 包装函数计数实际展开后的非旗标实参（pattern 占 1），零文件操作数
    # 即拒执行并标 NO_SCOPE（manual），宁可无证据也不出伪证据。同时 cd "$PROJ" 钉死相对递归范围。
    _ev_marker="${TMPDIR:-/tmp}/swarm-yuan-ev-noscope.$$"
    rm -f "$_ev_marker"
    _out=$(
      cd "$PROJ" || exit 0
      grep() {
        # bash 3.2 的 $() 解析器不支持函数内 case（实证 /tmp 最小复现），此处只能 if 链
        local _n=0 _a _r=0
        for _a in "$@"; do
          if [[ "$_a" == -* ]]; then
            if [[ "$_a" == -*r* || "$_a" == --recursive* ]]; then _r=1; fi
          else
            _n=$((_n + 1))
          fi
        done
        # 只拦危险形态：-r 递归 + 零文件操作数（无操作数时 GNU grep -r 递归 cwd，
        # node_modules/依赖库冒充项目证据）；stdin 管道型 grep（无 -r）不拦。
        if [[ "$_r" -eq 1 && "$_n" -le 1 ]]; then
          : > "${TMPDIR:-/tmp}/swarm-yuan-ev-noscope.$$" 2>/dev/null
          return 1
        fi
        command grep "$@"
      }
      eval "$_cmd" 2>/dev/null || true
    )
    if [[ -f "$_ev_marker" ]]; then
      rm -f "$_ev_marker"
      printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$fw" "$vid" "$vtitle" "-" "-" "NO_SCOPE"
      continue
    fi
    rm -f "$_ev_marker" 2>/dev/null || true
    # 证据面净化：剔除依赖库/生成物/版本库路径（node_modules、.claude/skills、.swarm-yuan、
    # .git、dist、target、coverage、research/offline-cache——R140 补 target/coverage：trade-forge 实证 mybatis 证据落 target/classes 副本）——这些命中是文档/依赖代码冒充项目源码证据，
    # 会虚增 hits 与 SUGGEST=applicable 的信号强度（实证：element-r1 证据曾被生成技能
    # 自身的 framework-knowledge.md 霸榜）。全被剔净 = 该规则无项目源码证据（hits=0）。
    if [[ -n "$_out" ]]; then
      _out=$(printf '%s\n' "$_out" | LC_ALL=C grep -vE '(^|/)(node_modules|\.git|dist|build|target|coverage|\.claude/skills|\.swarm-yuan|\.codex|research|offline-cache)(/|$)' || true)
    fi
    if [[ -z "$_out" ]]; then
      _hits=0
      _evid=""
    else
      _hits=$(printf '%s\n' "$_out" | grep -c . || true)
      _evid=$(printf '%s\n' "$_out" | LC_ALL=C sed -E 's|^'"$PROJ"'/||' | LC_ALL=C sort | head -"$TOP" | tr '\n' ';' | sed 's/;$//')
    fi
    if [[ "$_hits" -gt 0 ]]; then _sug="applicable"; else _sug="likely-na"; fi
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$fw" "$vid" "$vtitle" "$_hits" "$_evid" "$_sug"
  done
done
exit 0
