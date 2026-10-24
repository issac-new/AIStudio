#!/usr/bin/env bash
# inventory-verify.sh — 维度计数核验 + 维度错配 lint（WP-P2/M1）
# 把 Step 12 / exploration-guide §C+ 的手工枚举计数核验脚本化：
#   对目标仓库按维度注册表跑 find/grep 枚举 → 数 reference-manual.md 对应表行数 → 去重 → 算比率（≥0.95 PASS）
#   顺带维度错配 lint：声明纯后端却有 UI 组件文件 / 纯前端却有 controller → DIM_MISMATCH
# WP-Q1A（2026-08-19，三能力实操性复盘）新增两模式，堵"计数核验防漏不防伪"的洞：
#   --path-check       抽 §4/§6/§9 表格数据行内反引号路径，逐行 test -f——不存在即 HALLUCINATION 行
#                      （杀死"AI 幻觉组件凑数过 0.95"的最大漏洞；路径本就是五维必填字段）
#                      R21-A 扩展：recipes.md（任务配方）表格行的组件路径同样核验（§A 功能编目/§B 复用件）
#   --stability-audit  对 §4/§6/§9 标注"稳定|禁止改"的行算三机械信号：近 90 天 git churn /
#                      fan-in 被引用数 / 同名测试文件存在性；与标注冲突 → STABILITY_WARN（advisory 不 fail）。
#                      R33-D7：入口层文件（controller/消费者/定时任务，由路由引用非 import）豁免 fan-in=0 warn；
#                      forbid 标注 churn 阈值 >1（greenfield 出生提交不算变更）。
# 用法:
#   bash inventory-verify.sh <PROJECT_DIR> [--skill-dir <dir>] [--form <形态>] [--tsv] [--path-check] [--stability-audit]
#     --skill-dir  目标 skill 根（含 references/reference-manual.md）；不给则只做枚举不核验清单
#     --form       项目形态（backend/frontend/async/desktop/mobile/lib/common）；不给读 skill conf PROJECT_FORM，再不给退化为全维度
#     --tsv        只输出 TSV 明细（默认人读摘要 + TSV）
#     --path-check 幻觉路径校验（mark-active 状态门调用时开启）
#     --stability-audit 稳定性标注机械信号审计（advisory，可与 --tsv 同用）
# 输出: stdout TSV「维度	枚举计数	清单计数	比率	状态」按维度排序 + 末行 DIM_MISMATCH（如有）
#       + HALLUCINATION / STABILITY_WARN 行（对应模式开启时）
# 退出码: 0 正常（含 FAIL 维度，fail-open 核验）；1 arg 错误 / PROJECT_DIR 不存在。
# 红线：本脚本只做计数 + 错配 lint + 路径存在性 + 机械信号，不替模型判断维度是否适用（适用判断由 §C+.0 形态判定驱动）。
set -uo pipefail
BASE=$(cd "$(dirname "${0}")/.." && pwd)

PROJ=""; SKILL_DIR=""; FORM=""; TSV=0; PATH_CHECK=0; STAB_AUDIT=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skill-dir) SKILL_DIR="${2:?--skill-dir 需要路径}"; shift 2 ;;
    --form)      FORM="${2:?--form 需要形态}"; shift 2 ;;
    --tsv)       TSV=1; shift ;;
    --path-check) PATH_CHECK=1; shift ;;
    --stability-audit) STAB_AUDIT=1; shift ;;
    -h|--help)   sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) [[ -z "$PROJ" ]] && PROJ="$1" || { echo "未知参数: $1" >&2; exit 1; }; shift ;;
  esac
done
[[ -n "$PROJ" && -d "$PROJ" ]] || { echo "✗ PROJECT_DIR 缺失或不存在: ${PROJ:-（空）}" >&2; exit 1; }
PROJ=$(cd "$PROJ" && pwd)

# 形态：--form > skill conf PROJECT_FORM > 全维度（all）
if [[ -z "$FORM" && -n "$SKILL_DIR" ]]; then
  _conf="$SKILL_DIR/scripts/precheck.conf"
  [[ -f "$_conf" ]] && FORM=$( (set +u; . "$_conf" 2>/dev/null; printf '%s' "${PROJECT_FORM:-}") )
fi
FORM="${FORM:-all}"

# source 维度注册表
# shellcheck disable=SC1091
. "$BASE/assets/inventory-dimensions.conf" 2>/dev/null || { echo "✗ 维度注册表缺失: assets/inventory-dimensions.conf" >&2; exit 1; }

# 收集所有维度 ID（DIM_<ID>_TITLE 去前缀）
_dims=$(set | LC_ALL=C sed -n 's/^DIM_\([A-Z0-9_]*\)_TITLE=.*/\1/p' | sort -u)

# 形态适用判定：FORM=all 或维度 FORMS 含 $FORM 或维度 FORMS 含 common 且 $FORM != lib
_form_applicable() { # $1=维度FORMS
  local dfs="$1"
  [[ "$FORM" == "all" ]] && return 0
  case " $dfs " in
    *" all "*) return 0 ;;
    *" $FORM "*) return 0 ;;
    *" common "*) [[ "$FORM" != "lib" ]] && return 0 ;;
  esac
  return 1
}

# 跑枚举命令，计数（输出每行一匹配 → 数非空行）。
# 注意：CMD 模板含字面 ${PROJECT_DIR} 占位，必须先替换为真实路径再 eval。
# 不做 sort -u 去重——文件类 CMD（grep -rl / find）每文件只出一行，而出现次数类 CMD（grep -rhoE）
# 同一方法名可能多次出现，去重会压扁真实计数。计数与顺序无关，确定性由 grep -c 保证。
_enum_count() { # $1=CMD模板
  local cmd="$1"
  [[ -n "$cmd" ]] || { echo 0; return; }
  local _cmd
  _cmd=$(printf '%s' "$cmd" | LC_ALL=C sed "s|\${PROJECT_DIR}|$PROJ|g")
  local _n
  _n=$(eval "$_cmd" 2>/dev/null | LC_ALL=C grep -c .)
  [[ -n "$_n" ]] || _n=0
  echo "$_n"
}

# 数 reference-manual.md 对应表行数：定位 §<n> 标题到下一个同级/更高级 ## 之间，数表格数据行（| 开头非分隔/表头）
# R33-D5（2026-09-17 Java 栈执勤实证）：锚支持空格分隔多锚（'§8 §9'）——同维度在不同档位落不同节
# （ORM schema standard/compliance 在 §8 数据字典、lite 精简档自然落 §9 数据勾稽），合计行数。
_list_count() { # $1=RM文件 $2=锚（§<n>[.<sub>]，空格分隔多锚）
  local rm="$1" anchor="$2"
  [[ -f "$rm" ]] || { echo 0; return; }
  local _a sec _c _total=0
  for _a in $anchor; do
    sec=${_a%%.*}
    _c=$(awk -v sec="$sec" '
      { h = $0
        if (index(h, "## " sec " ") == 1 || index(h, "## " sec ".") == 1 || index(h, "## " sec "（") == 1 || h == "## " sec) { insec=1; next }
        if (insec && $0 ~ "^## ") { insec=0 }
        if (insec && /^\|/) {
          line=$0; gsub(/[ \t]/,"",line)
          # 表头行判定（R33-D1 重修）：关键词须为首格开头（^\|关键词）。旧式 /^\|[^|]*关键词[^|]*\|/
          # 把「关键词在任意格」都当表头（A7 前态）与「只在首格任意位置」（A7 后态）都会误判——
          # A7 后态漏排除模板自家两列表头「| 路径 | 说明与约束 |」（说明在第二格）→ 表头被计成
          # 数据行 → 清单计数虚高（每表 +1，实测 §6 双表 6 行计成 8）。
          # 数据行以反引号路径开头，不会以关键词开头——首格开头锚定是数据行/表头的可靠判别。
          if (line !~ /^\|[-:|]+\|$/ && line !~ /^\|[-]+/ && line !~ /^\|(维度|端点|构件|方法|说明|路径|业务名|单元名|文件)/) c++
        }
      }
      END { print c+0 }
    ' "$rm")
    _c="${_c:-0}"
    _total=$((_total + _c))
  done
  echo "$_total"
}

# fail-open 提示：给了 --skill-dir 但缺 reference-manual.md（只提示一次，stderr，不影响 exit 0）
_rm_missing_noticed=0
_notice_rm_missing() {
  if [[ "$_rm_missing_noticed" -eq 0 ]]; then
    echo "提示: $SKILL_DIR/references/reference-manual.md 不存在 → 清单计数全为 0（fail-open，仅枚举不核验）" >&2
    _rm_missing_noticed=1
  fi
}

rows=""; mismatches=""; enum_zero=""
# shellcheck disable=SC2154  # title/ref/dfs/cmd 经 eval 间接赋值，shellcheck 静态分析识别不到
for d in $_dims; do
  eval "title=\${DIM_${d}_TITLE:-}"
  eval "dfs=\${DIM_${d}_FORMS:-all}"
  eval "cmd=\${DIM_${d}_CMD:-}"
  eval "ref=\${DIM_${d}_RM_REF:-}"
  [[ -n "$cmd" ]] || continue
  _form_applicable "$dfs" || continue
  enum=$(_enum_count "$cmd")
  list=0
  if [[ -n "$SKILL_DIR" ]]; then
    rm="$SKILL_DIR/references/reference-manual.md"
    if [[ -f "$rm" ]]; then
      list=$(_list_count "$rm" "$ref")
    else
      _notice_rm_missing
    fi
  fi
  if [[ "$list" -gt 0 ]]; then
    # 比率定义：清单覆盖枚举的比例 = min(1, list/enum)；spec 原意「清单计数 ≥ 枚举×0.95」
    ratio=$(awk -v e="$enum" -v l="$list" 'BEGIN{ if(e==0) print "1.00"; else { r=l/e; if(r>1) r=1; printf "%.2f", r } }')
    if awk -v r="$ratio" 'BEGIN{ exit !(r+0 >= 0.95) }'; then st="PASS"; else st="FAIL"; fi
  else
    ratio="-"; st="NO_LIST"
  fi
  rows="${rows}${title}	${enum}	${list}	${ratio}	${st}
"
  # R30-D4（2026-09-16 Node/Prisma 栈执勤实证）：枚举 0 + 清单非空时比率防除零给 1.00 PASS，
  # 枚举器自身漏报（不认识该技术栈形态）完全静默假绿——Prisma schema 3 模型枚举 0 实证
  # （同 R28 缺 SQLAlchemy 的根因模式）。此处不改 PASS 判定（比率语义是清单覆盖枚举），
  # 独立披露行提示人工复核：维度真为空 or 枚举器漏报，两条路都该被看见。
  if [[ "$enum" -eq 0 && "$list" -gt 0 ]]; then
    enum_zero="${enum_zero}ENUM_ZERO_DIM	${title}	枚举 0 命中但清单 ${list} 行——枚举器可能漏报该技术栈形态（同 R28 SQLAlchemy 先例）或维度真为空，人工复核
"
  fi
done

# 维度错配 lint：声明 backend 但检出前端 UI 组件 / 声明 frontend 但检出后端 controller → DIM_MISMATCH
# 注意：错配 lint 必须枚举「对面形态」的维度，与上面适用性过滤无关（FRONTEND_UI 对 backend 不适用，但仍需检测错配）。
if [[ "$FORM" == "backend" ]]; then
  eval "fcmd=\${DIM_FRONTEND_UI_CMD:-}"
  if [[ -n "$fcmd" ]]; then
    fenum=$(_enum_count "$fcmd")
    if [[ "${fenum:-0}" -gt 0 ]]; then
      mismatches="${mismatches}DIM_MISMATCH	声明形态=backend 但检出前端 UI 组件 ${fenum} 个（回 §C+.0 重判形态）
"
    fi
  fi
elif [[ "$FORM" == "frontend" ]]; then
  eval "bcmd=\${DIM_BACKEND_CONTROLLER_CMD:-}"
  if [[ -n "$bcmd" ]]; then
    benum=$(_enum_count "$bcmd")
    if [[ "${benum:-0}" -gt 0 ]]; then
      mismatches="${mismatches}DIM_MISMATCH	声明形态=frontend 但检出后端 controller ${benum} 个（回 §C+.0 重判形态）
"
    fi
  fi
fi

# ===== WP-Q1A：§4/§5/§6/§8/§9 表格行的 路径+稳定性标注 抽取（两模式共用）=====
# 输出每行 "<stab>\t<path>"：stab ∈ forbidden（行含"禁止改"）/ stable（含"稳定"且非"不稳定"）/ -（无标注）。
# 路径 = 行内反引号 token，含 "/" 且以已知源码扩展名结尾（五维字段的路径列惯用反引号包裹）。
_extract_rows_paths() { # $1=RM文件
  local rm="$1"
  [[ -f "$rm" ]] || return 0
  awk '
    BEGIN{ insec=0 }
    {
      # 仅匹配 §4/§5/§6/§8/§9（§是 UTF-8 三字节 §-multi-byte）。§10/§11 不进——避免错纳
      # §5 自数据映射三维度起承载调度/批处理任务表（DIM_SCHEDULE_JOB 锚）；
      # §8 自横向清剿轮起承载 ORM schema/迁移资产表（DIM_ORM_SCHEMA 锚）——路径同样核验
      if ($0 ~ "^## §[45689][ \\.]") { insec=1; next }
      if (insec==1 && $0 ~ "^## ") { insec=0; next }
        if (insec==1 && /^\|/) {
          line=$0; squashed=line; gsub(/[ \t]/,"",squashed)
          if (squashed ~ /^\|[-:|]+\|$/ || squashed ~ /^\|[-]+/) next
          # R33-D1 同族修复：表头判定与 _list_count 同款（关键词首格开头锚定）——旧式「关键词在
          # 首格任意位置」漏排除「| 路径 | 说明与约束 |」两列表头（说明在第二格）；表头行无反引号
          # 路径故对本函数无实害，但两处口径必须一致（同族漂移防线）。
          if (squashed ~ /^\|(维度|端点|构件|方法|说明|路径|业务名|单元名|文件)/) next
        stab="-"
        if (index(line,"禁止改")>0) stab="forbidden"
        else if (index(line,"不稳定")>0) stab="-"
        else if (index(line,"稳定")>0) stab="stable"
        rest=line
        while (match(rest, /`[^`]+`/)) {
          tok=substr(rest, RSTART+1, RLENGTH-2)
          rest=substr(rest, RSTART+RLENGTH)
          if (tok ~ /\// && tok ~ /\.(vue|tsx?|jsx?|py|go|java|rs|sql|xml|ya?ml|json|kt|swift|cpp|cc|c|h|php|rb|sh|md)$/)
            print stab "\t" tok
        }
      }
    }
  ' "$rm" 2>/dev/null | LC_ALL=C sort -u
}

# --path-check：幻觉路径校验——表格登记的路径在仓库中必须真实存在
hallus=""
if [[ "$PATH_CHECK" -eq 1 && -n "$SKILL_DIR" && -f "$SKILL_DIR/references/reference-manual.md" ]]; then
  _paths=""
  while IFS=$'\t' read -r _stab _p; do
    [[ -n "${_p:-}" ]] || continue
    _paths="${_paths}${_p}
"
  done <<< "$(_extract_rows_paths "$SKILL_DIR/references/reference-manual.md")"
  while IFS= read -r _p; do
    [[ -n "$_p" ]] || continue
    if [[ ! -f "$PROJ/$_p" ]]; then
      hallus="${hallus}HALLUCINATION	清单登记路径不存在: ${_p}（reference-manual §4/§5/§6/§8/§9；疑似 AI 幻觉组件，回 Step 4 核实）
"
    fi
  done <<< "$_paths"
fi

# R21-A：recipes.md（任务配方）表格行内反引号路径同样核验存在性——
# 配方 §A 功能编目与 §B 复用件清单引用的组件必须是真实存在的（幻觉复用件在此被杀）。
# 只抽表格行（| 开头）：门禁序列等散文行里的 `bash scripts/...` 命令不进（防误报）。
if [[ "$PATH_CHECK" -eq 1 && -n "$SKILL_DIR" && -f "$SKILL_DIR/references/recipes.md" ]]; then
  _rcp_paths=$(LC_ALL=C awk '
    /^\|/ {
      line=$0; squashed=line; gsub(/[ \t]/,"",squashed)
      if (squashed ~ /^\|[-:|]+\|$/ || squashed ~ /^\|[-]+/) next
      rest=line
      while (match(rest, /`[^`]+`/)) {
        tok=substr(rest, RSTART+1, RLENGTH-2)
        rest=substr(rest, RSTART+RLENGTH)
        if (tok ~ /\// && tok ~ /\.(vue|tsx?|jsx?|py|go|java|rs|sql|xml|ya?ml|json|kt|swift|cpp|cc|c|h|php|rb|sh|md)$/)
          print tok
      }
    }
  ' "$SKILL_DIR/references/recipes.md" 2>/dev/null | LC_ALL=C sort -u)
  while IFS= read -r _p; do
    [[ -n "$_p" ]] || continue
    if [[ ! -f "$PROJ/$_p" ]]; then
      hallus="${hallus}HALLUCINATION	配方引用路径不存在: ${_p}（recipes.md §A/§B；疑似幻觉复用件，回 §C+.6/§C+.7 核实）
"
    fi
  done <<< "$_rcp_paths"
fi

# --stability-audit：稳定性标注机械信号审计（advisory，永不 fail）
# 三信号：近 90 天 git churn / fan-in 被引用数 / 同名测试文件存在性
stabwarns=""
if [[ "$STAB_AUDIT" -eq 1 && -n "$SKILL_DIR" && -f "$SKILL_DIR/references/reference-manual.md" ]]; then
  _in_git=0
  git -C "$PROJ" rev-parse --is-inside-work-tree >/dev/null 2>&1 && _in_git=1
  _aud_n=0
  while IFS=$'\t' read -r _stab _p; do
    [[ -n "$_p" && "$_stab" != "-" ]] || continue
    [[ -f "$PROJ/$_p" ]] || continue   # 路径不存在的由 --path-check 管，这里只审存在且被标注的
    _aud_n=$((_aud_n+1))
    [[ "$_aud_n" -gt 40 ]] && break    # 上限 40 条，advisory 模式防大仓库超时
    _base="${_p##*/}"; _base="${_base%.*}"
    _churn="-"
    if [[ "$_in_git" -eq 1 ]]; then
      _churn=$(git -C "$PROJ" log --since="90 days ago" --format=%H -- "$_p" 2>/dev/null | LC_ALL=C grep -c . || true)
      _churn="${_churn:-0}"
    fi
    _fanin=$(grep -rlF --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --include='*.py' --include='*.go' --include='*.java' --include='*.vue' "$_base" "$PROJ" 2>/dev/null | grep -vF "$_p" | LC_ALL=C grep -c . || true)
    _fanin="${_fanin:-0}"
    # R36-D7（2026-09-18 Go 栈执勤实证 r36-drill-order-api）：Go 导入的是包（目录）不是文件——
    # 引用方 import 路径串 ".../internal/repository" 不含文件基名 order_repo，基名信号恒 0 误报
    # （实测 internal/ 下全部文件 fan-in=0 warn）。对相对路径含斜杠的文件补父目录字符串信号
    # （包导入形态代理）；根目录单段路径保持原行为（目录名公共词误报面大）。
    if [[ "$_p" == */* ]]; then
      _fanin2=$(grep -rlF --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --include='*.py' --include='*.go' --include='*.java' --include='*.vue' "${_p%/*}" "$PROJ" 2>/dev/null | grep -vF "$_p" | LC_ALL=C grep -c . || true)
      _fanin2="${_fanin2:-0}"
      [[ "$_fanin2" -gt "$_fanin" ]] && _fanin="$_fanin2"
    fi
    _has_test=0
    [[ -n "$(find "$PROJ" -path '*/node_modules' -prune -o -path '*/.git' -prune -o -type f -iname "*${_base}*" \( -iname "*test*" -o -iname "*spec*" \) -print -quit 2>/dev/null)" ]] && _has_test=1
    # R33-D7（2026-09-17 Java 栈执勤实证）：入口层文件（controller/route handler/定时任务/消费者）
    # 被 import 的 fan-in 恒 0 是框架常态（由路由/容器引用，非 import 引用）——对其豁免 fan-in=0 warn。
    # 信号清单跨语言有界集（Java 注解族 + Node router/app + Python route/celery + Go http）。
    _entry=0
    grep -qE '@(Rest)?Controller|@ControllerAdvice|@(Kafka|Rabbit)Listener|@Scheduled|@MessageMapping|@(Get|Post|Put|Delete|Patch)Mapping|router\.[a-z]+|app\.(get|post|use|listen)\(|@app\.route|APIRouter|@celery\.task|http\.HandleFunc|func main\(\)' "$PROJ/$_p" 2>/dev/null && _entry=1
    # R33-D7b：greenfield 仓库 forbid 标注文件的「出生提交」即 1 次变更——churn>1（出生后又被改）才 warn。
    if [[ "$_stab" == "forbidden" && "$_churn" != "-" && "${_churn:-0}" -gt 1 ]]; then
      stabwarns="${stabwarns}STABILITY_WARN	$_p 标注禁止改但近 90 天变更 ${_churn} 次（fan-in ${_fanin}，test $([[ $_has_test -eq 1 ]] && echo 有 || echo 无)）
"
    elif [[ "$_stab" == "stable" ]]; then
      [[ "$_churn" != "-" && "${_churn:-0}" -gt 5 ]] && \
        stabwarns="${stabwarns}STABILITY_WARN	$_p 标注稳定但近 90 天变更 ${_churn} 次（>5；fan-in ${_fanin}，test $([[ $_has_test -eq 1 ]] && echo 有 || echo 无)）
"
      [[ "${_fanin:-0}" -eq 0 && "$_entry" -eq 0 ]] && \
        stabwarns="${stabwarns}STABILITY_WARN	$_p 标注稳定但 fan-in=0（无被引用；churn ${_churn}，test $([[ $_has_test -eq 1 ]] && echo 有 || echo 无)）
"
      [[ "$_has_test" -eq 0 ]] && \
        stabwarns="${stabwarns}STABILITY_WARN	$_p 标注稳定但无同名测试文件（churn ${_churn}，fan-in ${_fanin}）
"
    fi
  done <<< "$(_extract_rows_paths "$SKILL_DIR/references/reference-manual.md")"
fi

if [[ "$TSV" -eq 1 ]]; then
  printf '%s' "$rows" | LC_ALL=C sort
else
  echo "## 维度计数核验（inventory-verify.sh，形态=${FORM}）"
  echo "维度	枚举计数	清单计数	比率	状态"
  printf '%s' "$rows" | LC_ALL=C sort
fi
if [[ -n "$mismatches" ]]; then
  printf '%s' "$mismatches" | LC_ALL=C sort
fi
if [[ -n "$hallus" ]]; then
  printf '%s' "$hallus" | LC_ALL=C sort
fi
if [[ -n "$stabwarns" ]]; then
  printf '%s' "$stabwarns" | LC_ALL=C sort
fi
if [[ -n "$enum_zero" ]]; then
  printf '%s' "$enum_zero" | LC_ALL=C sort
fi
exit 0
