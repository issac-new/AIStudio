#!/usr/bin/env bash
# spec-first-lib.sh — spec-first 判定单一事实源（R101 四层拦截模型的判定内核）
#
# 消费方（判据同源，四层各取所需）：
#   L1 写时   hooks/fail-gate-hook.sh（Write/Edit PreToolUse deny）
#   L2 提交时 hooks/spec-first-pre-commit.sh（git pre-commit exit 1）
#   L3 门禁时 gates-warn.sh check_spec_first（precheck --all 序列 fail）
#   L4 准入   state-machine.sh guard build（SPEC_REQUIRED=1 硬拦）
# 此前判据三处复制（fail-gate-hook 内联 ×2 + state-machine 审批环）——R36-D10/R75-D3
# 两轮都在同一判据上修过缺陷，复制面即回归面；本库收敛后再接新层。
#
# 契约：纯函数、无副作用、不读环境变量（解析优先级由调用方决定后传参）；
#       恒 rc=0（输出空=未命中/未配置），调用方按输出判定——hook 上下文非零退出会干扰宿主协议。
# bash 3.2 兼容：无关联数组、无 ${var,,}、local 声明与赋值拆行（同行引用前变量 unbound 坑）。

# 引号感知的行内注释剥离（R128：cut -d'#' 不看上下文——BASE_BRANCH="release/#hotfix" 这类
# 合法值被腰斩，WRITABLE_DIRS 同病）。语义对齐 shell 字面量：单引号内一切字面（含 #）；
# 双引号内 \ 转义下一字符（\" 不闭合、\# 不是注释）；引号外 \# 转义不算注释，裸 # 才是注释起点。
# 本函数只判注释边界、不做反转义——值里的反斜杠原样保留（消费方语义不变）。
spf_strip_comment() {  # stdin=conf 行 → stdout 去注释后的行（无注释=原样；恒 rc=0）
  LC_ALL=C awk '
  {
    out = ""; state = 0; n = length($0)
    for (i = 1; i <= n; i++) {
      c = substr($0, i, 1)
      if (state == 1) {              # 单引号：字面直到闭合
        if (c == "\047") state = 0
        out = out c; continue
      }
      if (state == 2) {              # 双引号：\ 转义下一字符，" 闭合
        if (c == "\\" && i < n) { out = out c substr($0, i+1, 1); i++; continue }
        if (c == "\"") state = 0
        out = out c; continue
      }
      if (c == "#") break            # 引号外裸 # = 注释起点
      if (c == "\\" && i < n) { out = out c substr($0, i+1, 1); i++; continue }  # \# 转义不算注释
      if (c == "\047") state = 1
      else if (c == "\"") state = 2
      out = out c
    }
    print out
  }'
  return 0
}

# <占位符> 剥离（R128 收敛：precheck _find_spec_file 与 gates-warn check_spec_first 三处
# 手写习语的单一事实源）。骨架 conf 的 KEY=${KEY:-默认} 形态不得当真实值消费——剥壳取默认。
# 旧三处习语按 KEY 逐字前缀匹配，本函数放宽为任意 ${标识符:-…} 形态（同一意图：跨变量
# 复制的占位符不再漏剥）；非占位形态（含 state-machine 侧「<占位符>」尖括号语义）原样透传。
spf_strip_placeholder() {  # $1=原始 conf 值 → stdout（占位形态剥壳取默认；其余原样；恒 rc=0）
  local _v="${1:-}"
  case "$_v" in
    '${'[A-Za-z_]*':-'*'}') _v="${_v#*':-'}"; _v="${_v%'}'}" ;;
  esac
  printf '%s' "${_v}"
  return 0
}

# conf 末行赋值解析（剥行内注释/空白/引号；解析 ${VAR:-def} 自引用默认）。
# R128 起注释剥离为引号感知（spf_strip_comment，见上）——与 state-machine _sm_conf_val 的
# 逐字节对齐就此打破（那边仍是 cut 版；state-machine 自有 conf 值不含 #，行为不变，
# 对齐债务记录于 R128 报告）。其余链（首尾空白/引号/自引用默认）保持原样。
# 注意：<占位符> 剥离是 state-machine 侧语义（骨架 conf 占位符不得当真实值消费），
# 由 _sm_conf_val 包装层追加——本函数不含，保证 fail-gate-hook 行为零变化。
spf_conf_val() {  # $1=conf 文件路径 $2=变量名 → stdout 值（文件缺失/未配置=空）
  local _f="$1" _k="$2"
  local _v=""
  if [[ -f "$_f" ]]; then
    # R118：只剥首尾空白，保留内部空格（含空格路径不得被压扁）。
    _v=$(grep "^${_k}=" "$_f" 2>/dev/null | tail -1 | spf_strip_comment | sed "s/^${_k}=//" || true)
    _v="${_v#"${_v%%[![:space:]]*}"}"
    _v="${_v%"${_v##*[![:space:]]}"}"
    _v="${_v%\"}"; _v="${_v#\"}"
    # R129：单引号值同样剥壳——bash source 语义下 VAR='x' 与 VAR="x" 等价，旧版只剥双引号，
    # 单引号值原样带引号读出，消费方拿裸值比较即 mismatch（R128 范围外登记项）
    _v="${_v%\'}"; _v="${_v#\'}"
    case "$_v" in
      "\${${_k}:-"*'}') _v="${_v#\$\{${_k}:-}"; _v="${_v%\}}" ;;
    esac
  fi
  printf '%s' "$_v"
  return 0
}

# WRITABLE_DIRS 解析（fail-gate-hook 原内联链对齐：括号剥离须容忍行尾注释——
# 行尾锚定的 s/)$// 在 conf 模板惯例「WRITABLE_DIRS=()  # TODO:model」下剥不掉括号，
# 历史缺陷见 fail-gate-hook 注记，勿回退为行尾锚定写法；R128 起注释剥离引号感知，
# 目录名含 # 不再被腰斩，引号由 s/"//g 统一去）。
spf_writable_dirs() {  # $1=conf 文件路径 → stdout 空格分隔目录表（未配置=空）
  local _v=""
  if [[ -f "$1" ]]; then
    _v=$(grep '^WRITABLE_DIRS=' "$1" 2>/dev/null | tail -1 | spf_strip_comment | sed -e 's/^WRITABLE_DIRS=(//' -e 's/[[:space:]]*)[[:space:]]*$//' -e 's/"//g' || true)
  fi
  printf '%s' "$_v"
  return 0
}

# 已批准 spec 检测（判据：含「## 决策记录」段且非占位——与 workflow.md ③ 节点产物定义一致）。
spf_find_approved_spec() {  # $1=项目根 $2=spec glob $3=正文视图（默认 worktree）→ stdout 命中路径（空=无）
  local _root="$1" _glob="$2" _view="${3:-worktree}"
  local _sf
  if [[ "$_view" == "index" ]]; then
    # 主干仍按存在性判定，但批准证据同样必须随本次提交落盘。
    while IFS= read -r -d '' _sf; do
      case "$_sf" in
        ${_glob})
          if git -C "$_root" show ":${_sf}" 2>/dev/null | spf_approved_stream; then
            printf '%s' "${_root}/${_sf}"
            return 0
          fi ;;
      esac
    done < <(git -C "$_root" ls-files -z 2>/dev/null)
    return 0
  fi
  for _sf in "${_root}"/${_glob}; do
    [[ -f "$_sf" ]] || continue
    if spf_is_approved_spec "$_sf"; then
      printf '%s' "$_sf"
      return 0
    fi
  done
  return 0
}

# 单文件「已批准」判据（自 spf_find_approved_spec 抽出——R109-D8 关联判定复用同一批准语义，
# 候选集收紧但批准标准不变）。
spf_approved_stream() {  # stdin=完整 spec 正文；读完流，避免 grep -q 使上游 SIGPIPE 误判。
  LC_ALL=C awk '
    /^## .*决策记录/ { approved=1 }
    /待填充|<占位符>/ { placeholder=1 }
    END { exit (!approved || placeholder) }
  '
}

spf_is_approved_spec() {  # $1=spec 文件绝对路径 → rc 0=已批准 1=否
  [[ -f "$1" ]] || return 1
  spf_approved_stream < "$1"
}

# R109-D8 spec-变更关联模型（根治 R108-D8：L2/L3 原判据=「工作区存在任一已批准 spec」，
# 首 spec 合入 main 后，从 main 切出的分支天然携带历史 spec——无 spec 提交也放行，
# 护栏退化为存在性检查（rust-forge probe 实证）。修复：特性分支上，治理本次变更的 spec
# 须出现在变更集里，历史 spec 不再天然放行）。
#
# 分层语义（四层各取所需，判据同源本库）：
#   L1 写时 / L4 准入：保持存在性（写时无提交可言；build 准入问「项目有无已批准 spec」）。
#   L2 提交时：关联面 = staged ∪ branch（本次提交含 spec，或本分支写过 spec）。
#   L3 门禁时：关联面 = staged ∪ branch ∪ untracked（开发中态：spec 已写未提交也认）。
#   基分支（main/master/BASE_BRANCH）上：保留存在性——主干直提交归分支门（check_branch）
#   管，合并后全量复查依赖存在性通过（三点 diff 虽含 spec，但主干语义按宽口径放行）。
#
# base 解析与 precheck _git_base 同口径：BASE_BRANCH(conf) > main > master > HEAD~1。
# fail-open：非 git 仓库 / 无提交 / 当前在基分支 → 调用方回退存在性（见 spf_on_base_branch）。
spf_on_base_branch() {  # $1=项目根 $2=conf 路径（可空——读 BASE_BRANCH） → rc 0=在基分支/不可判 1=特性分支
  local _root="$1" _conf="${2:-}"
  local _cur _base=""
  _cur=$(cd "$_root" 2>/dev/null && git branch --show-current 2>/dev/null || true)
  [[ -z "$_cur" ]] && return 0                    # detached/非 git——不可判按基分支宽口径
  if [[ -n "$_conf" && -f "$_conf" ]]; then
    _base="$(spf_conf_val "$_conf" BASE_BRANCH)"
  fi
  [[ -z "$_base" ]] && _base="main"
  case "$_cur" in
    main|master|"$_base") return 0 ;;
  esac
  return 1
}

# 变更集内已批准 spec（关联判定主体）。
# $1=项目根 $2=spec glob（相对根） $3=关联面（空格分隔：staged branch untracked）
# $4=conf 路径（可空——branch 面的 BASE_BRANCH 优先级来源，与 precheck _git_base 同口径）
# $5=正文视图（默认 worktree；L2 传 index，校验实际将提交的 index blob）
# $6=排除表（可空，空格分隔仓库相对路径——命中 glob 但属排除对象的候选跳过。
#    消费方：design-sync 传 DESIGN_DOCS（设计正本自身常含「## 决策记录」章且落 SPEC_GLOB，
#    不排除会抢注 governing 选择——正本是被同步对象，不是治理 spec；2026-10-26 立法轮实证）
# → stdout 命中路径（空=变更集内无已批准 spec）。变更集决定候选，正文视图决定证据快照；
# L2 的 index 已含未改动的 HEAD 文件，既认本分支已提交 spec，也尊重 staged 删除/撤回批准。
spf_find_governing_spec() {
  local _root="$1" _glob="$2" _faces="$3" _conf="${4:-}" _view="${5:-worktree}" _exclude="${6:-}"
  local _cand _p _base _content _changed=""
  [[ -d "$_root" ]] || return 0
  case " ${_faces} " in
    *" branch "*)
      _base=""
      [[ -n "$_conf" && -f "$_conf" ]] && _base="$(spf_conf_val "$_conf" BASE_BRANCH)"
      if [[ -z "$_base" ]] || ! git -C "$_root" rev-parse --verify -q "$_base" >/dev/null 2>&1; then
        _base=""
      fi
      if [[ -z "$_base" ]] && git -C "$_root" rev-parse --verify -q main >/dev/null 2>&1; then
        _base="main"
      elif [[ -z "$_base" ]] && git -C "$_root" rev-parse --verify -q master >/dev/null 2>&1; then
        _base="master"
      elif [[ -z "$_base" ]]; then
        git -C "$_root" rev-parse --verify -q HEAD~1 >/dev/null 2>&1 && _base="HEAD~1"
      fi
      # 命令替换吞尾换行——face 间拼接须显式补分隔（实测两 face 首尾粘连成废行）
      [[ -n "$_base" ]] && _changed="${_changed}${_changed:+$'\n'}$(git -C "$_root" diff --name-only "${_base}...HEAD" 2>/dev/null || true)"
      ;;
  esac
  case " ${_faces} " in
    *" staged "*) _changed="${_changed}${_changed:+$'\n'}$(git -C "$_root" diff --cached --name-only 2>/dev/null || true)" ;;
  esac
  case " ${_faces} " in
    *" untracked "*) _changed="${_changed}${_changed:+$'\n'}$(git -C "$_root" ls-files --others --exclude-standard 2>/dev/null || true)" ;;
  esac
  [[ -z "$_changed" ]] && return 0
  while IFS= read -r _cand; do
    [[ -z "${_cand:-}" ]] && continue
    # 排除表命中即跳过（design-sync 消费：正本不是治理 spec）
    if [[ -n "$_exclude" ]]; then
      local _ex_hit=0 _ex
      for _ex in $_exclude; do
        [[ "$_cand" == "$_ex" ]] && { _ex_hit=1; break; }
      done
      [[ "$_ex_hit" -eq 1 ]] && continue
    fi
    # glob 匹配（bash 3.2 兼容：case 模式内变量展开即 glob；spec glob 形如 docs/specs/*.md）
    case "$_cand" in
      ${_glob})
        _p="${_root}/${_cand}"
        if [[ "$_view" == "index" ]]; then
          # 不读工作区：未暂存的批准/占位正文不能改变此次 commit 的裁决。
          _content=$(git -C "$_root" show ":${_cand}" 2>/dev/null) || continue
          if spf_approved_stream <<< "$_content"; then
            printf '%s' "$_p"
            return 0
          fi
        elif spf_is_approved_spec "$_p"; then
          printf '%s' "$_p"
          return 0
        fi
        ;;
    esac
  done <<< "$_changed"
  return 0
}

# 路径是否落入可写区（fail-gate-hook 原匹配语义：相对段命中 */<dir>/* 或项目根前缀 <root>/<dir>/）。
# $2=项目根（可空——空时前缀模式退化为 /<dir>/，与原 "${PROJECT_DIR:-}/${_d}/" 展开等价）。
# R106-D14 修复①（传参两态兼容）：L3 门禁传 "${WRITABLE_DIRS[*]}"（空格拼接单串），L1/L2 传裸数组
# （多个参数）——原实现只按独立参数迭代，拼接串被当成一个超长"目录名"整体匹配，多目录
# 可写区永远不命中（go-forge 回归实证：internal 改动 L3 判"未触及"）。单参内再按空白拆分，两态通吃。
# R106-D14 修复②（文件型条目）：WRITABLE_DIRS 可含文件条目（如 main.go）——原模式强制尾斜杠
# （*/<dir>/），文件路径永不能命中（死条目）。补 "${_proj}/${_part}" 精确匹配分支。
spf_path_in_dirs() {  # $1=规范化路径 $2=项目根(可空) $3..=目录/文件表（多参数或空格拼接单串均可） → rc 0=命中 1=未命中
  local _p="$1" _proj="$2"
  shift 2
  local _d _part
  for _d in "$@"; do
    # shellcheck disable=SC2086  # 有意按空白拆分（拼接串形态）；路径含空格的条目不在本表语义内
    for _part in $_d; do
      [[ -z "${_part}" ]] && continue
      case "$_p" in
        *"/${_part}/"*|"${_proj}/${_part}/"*|"${_proj}/${_part}") return 0 ;;
      esac
    done
  done
  return 1
}

# draft 骨架判定（骨架期无 spec 是常态，四层拦截全部放行——与 fail-gate-hook draft 分支同口径）。
spf_is_draft() {  # $1=SKILL.md 路径（可空） → rc 0=draft 1=非 draft/缺文件
  [[ -n "${1:-}" && -f "$1" ]] && grep -q '^status: draft' "$1" 2>/dev/null
}

# ===== 设计文档同步（DESIGN_SYNC——声明式+机械核验，2026-10-26 立法）=====
# 判据：DESIGN_SYNC_REQUIRED=1 时 spec 须含「设计文档影响」段（DESIGN_SYNC: touched/none）；
# touched 所列 DESIGN_DOCS 路径必须出现在变更集（声明与兑现同一批——与 R109-D8 spec
# 变更关联模型同构）；none 放行（合理性归节点⑦独立审查背书，机械层不猜）。
# fail-open 面（与主判据同哲学）：开关未启用 / DESIGN_DOCS 未配（opt-in 两半齐才生效）/
# 无 governing spec（缺失归主判据管）/ spec 正文不可读。

# DESIGN_DOCS 解析（与 spf_writable_dirs 同链：剥行尾注释/括号/引号，空格分隔输出）。
spf_design_docs() {  # $1=conf 文件路径 → stdout 空格分隔文档路径表（未配置=空）
  local _v=""
  if [[ -f "$1" ]]; then
    _v=$(grep '^DESIGN_DOCS=' "$1" 2>/dev/null | tail -1 | spf_strip_comment | sed -e 's/^DESIGN_DOCS=(//' -e 's/[[:space:]]*)[[:space:]]*$//' -e 's/"//g' || true)
  fi
  printf '%s' "${_v}"
  return 0
}

# 变更集文件清单（faces 语义与 spf_find_governing_spec 对齐：staged/branch/untracked）。
spf_changed_files() {  # $1=项目根 $2=关联面 $3=conf 路径（可空）→ stdout 变更文件（仓库相对路径，每行一条）
  local _root="$1" _faces="$2" _conf="${3:-}"
  local _base _changed=""
  [[ -d "$_root" ]] || return 0
  case " ${_faces} " in
    *" branch "*)
      _base=""
      [[ -n "$_conf" && -f "$_conf" ]] && _base="$(spf_conf_val "$_conf" BASE_BRANCH)"
      if [[ -z "$_base" ]] || ! git -C "$_root" rev-parse --verify -q "$_base" >/dev/null 2>&1; then
        _base=""
      fi
      if [[ -z "$_base" ]] && git -C "$_root" rev-parse --verify -q main >/dev/null 2>&1; then
        _base="main"
      elif [[ -z "$_base" ]] && git -C "$_root" rev-parse --verify -q master >/dev/null 2>&1; then
        _base="master"
      elif [[ -z "$_base" ]]; then
        git -C "$_root" rev-parse --verify -q HEAD~1 >/dev/null 2>&1 && _base="HEAD~1"
      fi
      [[ -n "$_base" ]] && _changed="${_changed}${_changed:+$'\n'}$(git -C "$_root" diff --name-only "${_base}...HEAD" 2>/dev/null || true)"
      ;;
  esac
  case " ${_faces} " in
    *" staged "*) _changed="${_changed}${_changed:+$'\n'}$(git -C "$_root" diff --cached --name-only 2>/dev/null || true)" ;;
  esac
  case " ${_faces} " in
    *" untracked "*) _changed="${_changed}${_changed:+$'\n'}$(git -C "$_root" ls-files --others --exclude-standard 2>/dev/null || true)" ;;
  esac
  [[ -n "$_changed" ]] && printf '%s\n' "$_changed"
  return 0
}

# 设计文档影响声明核验主体。
# $1=项目根 $2=conf 路径 $3=spec 路径（绝对或相对均可，index 视图须可规范化为仓库相对）
# $4=关联面（staged/branch/untracked 组合）$5=正文视图（worktree/index，L2 传 index）
# → stdout 违规描述（空=通过/fail-open）；恒 rc=0。
spf_design_sync_check() {
  local _root="$1" _conf="$2" _spec="$3" _faces="$4" _view="${5:-worktree}"
  local _req _docs _content _decl _mode _d _changed _specrel _missing
  _req="$(spf_conf_val "$_conf" DESIGN_SYNC_REQUIRED)"
  [[ "$_req" != "1" ]] && return 0
  _docs="$(spf_design_docs "$_conf")"
  [[ -z "$_docs" ]] && return 0
  [[ -z "$_spec" ]] && return 0
  _specrel="$_spec"
  case "$_specrel" in
    "${_root}/"*) _specrel="${_specrel#"${_root}/"}" ;;
  esac
  [[ -z "$_specrel" ]] && return 0
  if [[ "$_view" == "index" ]]; then
    _content="$(git -C "$_root" show ":${_specrel}" 2>/dev/null || true)"
  elif [[ -f "${_root}/${_specrel}" ]]; then
    _content="$(cat "${_root}/${_specrel}" 2>/dev/null || true)"
  else
    return 0
  fi
  [[ -z "$_content" ]] && return 0
  # 「设计文档影响」段抽取：标题行（# 系列含关键字）到下一个标题行之间
  _decl="$(printf '%s\n' "$_content" | LC_ALL=C awk '
    /^#+[[:space:]].*设计文档影响/ { inseg=1; next }
    inseg && /^#/ { inseg=0 }
    inseg { print }
  ')"
  _mode="$(printf '%s\n' "$_decl" | grep -oE 'DESIGN_SYNC:[[:space:]]*(touched|none)' | head -1 | sed 's/.*:[[:space:]]*//' || true)"
  if [[ -z "$_mode" ]]; then
    printf '%s' "missing-declaration: spec(${_specrel}) 缺「设计文档影响」声明——须含 DESIGN_SYNC: touched（逐行列出 DESIGN_DOCS 路径与修订点）或 none（无需更新+理由）"
    return 0
  fi
  [[ "$_mode" == "none" ]] && return 0
  # touched：声明段内提及的 DESIGN_DOCS 路径逐个核验变更集（未提及的路径不在本批声明面内）
  _changed="$(spf_changed_files "$_root" "$_faces" "$_conf")"
  _missing=""
  for _d in $_docs; do
    if printf '%s\n' "$_decl" | grep -qF -- "$_d"; then
      if [[ -z "$_changed" ]] || ! printf '%s\n' "$_changed" | grep -qxF -- "$_d"; then
        _missing="${_missing}${_missing:+、}${_d}"
      fi
    fi
  done
  if [[ -n "$_missing" ]]; then
    printf '%s' "unfulfilled: ${_missing} 声明 touched 但变更集未含其修订（声明与兑现须同一批——把设计文档修订并入本批或改声明 none 附理由）"
  fi
  return 0
}
