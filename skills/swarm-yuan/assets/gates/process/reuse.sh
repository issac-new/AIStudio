# gate: reuse
# domain: process / enforce: strict / tier: core
check_reuse() {
  echo "=== 复用合规检查（拼装式开发：禁止重复造轮子）==="
  local found=0

  # ---- 0. 重复代码维度（决策 58）：默认关闭（DUPLICATION_MIN_BLOCK=0 且 DUPLICATION_CMD 空）----
  # 放在 §5.5 spec 门禁之前：复制粘贴与 spec 是否存在无关，无 spec 的纯工具仓库同样该查。
  # §1 的重名检测查「该复用却另起单元」，查不出「同一段逻辑被复制粘贴到第二个文件」——
  # 后者同样是复用合规的破坏形态，也是 ub-mode 用 dryer 专门拦的形态。
  local _dup_min="${DUPLICATION_MIN_BLOCK:-0}"
  case "$_dup_min" in ''|*[!0-9]*) _dup_min=0 ;; esac
  if [[ "$_dup_min" -ge 2 ]]; then
    local _dup_hits _dup_n
    _dup_hits=$(_duplication_scan "$_dup_min")
    _dup_n=$(printf '%s\n' "$_dup_hits" | grep -c . || true)
    if [[ "${_dup_n:-0}" -gt 0 ]]; then
      printf '%s\n' "$_dup_hits" | head -5 | while IFS= read -r _l; do warn "$_l"; done
      warn "检出 ${_dup_n} 处重复窗口（连续 ${_dup_min} 行以上 Type-1 精确重复，同一段重复可能命中多个窗口）——抽公共逻辑或删掉复制块；改名式近似重复用 DUPLICATION_CMD"
    else
      pass "未检出连续 ${_dup_min} 行以上的精确重复块"
    fi
  else
    echo "  (跳过：DUPLICATION_MIN_BLOCK=0，内置重复检测未启用；建议 8)"
  fi
  _duplication_cmd_check

  # ---- 1. 硬门禁：spec-template.md §5.5 复用约束段必须已填写 ----
  # 找到最近一份 spec（项目内 specs/ 或当前目录）。
  # 注意：排除 *-template.md 模板文件——模板的 §5.5 checkbox 本就该是 [ ] 待用户复制后勾选，
  # 把模板当具体 spec 检会误判 fail（范式自举检查发现的缺陷）。
  # 发现逻辑统一走 _find_spec_file（SPEC_GLOB 优先，旧硬编码路径兜底）。
  local spec_file
  spec_file=$(_find_spec_file '拼装合规声明')

  if [[ -z "$spec_file" ]]; then
    # 无 spec 文档（项目本身无具体变更 spec，如范式仓库自身/纯工具仓库）：跳过而非 fail。
    # --all-full 静默跳过；显式 --reuse 时 warn 提示（拼装式开发项目应配 spec）。
    skip_if_unconfigured "未找到含 §5.5 复用约束段的 spec 文档（拼装式开发项目应在 specs/ 下配 spec；纯工具/范式仓库可跳过）"
    # skip 后必须 return——
    # skip_if_unconfigured 不终止函数，原实现继续走下方 AI 自查指引并打印「✓ 复用合规检查通过」，
    # skip 态叠加假 pass 信号（trace 记 done），三处呈现分裂（汇总=skip 对、输出与 trace=done 错）。
    return 0
  else
    # 校验 §5.5 拼装合规声明 4 个 checkbox 已勾选
    # 原区间 '/复用约束|拼装合规声明/,/^## [0-9]/'
    # 的终止模式与 spec-template.md 自身标题形态冲突——模板 §5.5 标题是 "## 5.5 ★复用约束"（数字紧跟 ## ），
    # 同一行同时命中起止模式 → awk 区间自塌为单标题行 → 规范填齐 4 勾仍恒报 "0/4" 假 fail（"## §5.5"
    # 形态碰巧绕过）。且原终止只认数字标题，非数字标题（## 回滚）不终止 → 区间吞到文件尾，后续段落的
    # checkbox 被误计入本段（假放行面）。改为：标题含关键词进区间、任意其它 ## 标题出区间——两种标题
    # 形态（## 5.5 / ## §5.5）均正确解析，计数面收紧到本段。
    local decl; decl=$(awk '/复用约束|拼装合规声明/{inr=1} inr && /^## / && !/复用约束|拼装合规声明/{inr=0} inr{print}' "$spec_file" 2>/dev/null)
    if [[ -z "$decl" ]]; then
      fail "$spec_file 缺少 §5.5 复用约束段"
      found=1
    else
      local unchecked; unchecked=$(echo "$decl" | grep -cE '^\s*-\s*\[\s\]' || true)
      local checked;   checked=$(echo "$decl" | grep -cE '^\s*-\s*\[x\]' || true)
      if [[ $unchecked -gt 0 || $checked -lt 4 ]]; then
        fail "$spec_file §5.5 拼装合规声明未全部勾选（$checked/4 已勾，$unchecked 未勾）"
        found=1
      fi
    fi
  fi

  # ---- 1.5 --task-type 校验 spec 节必填/豁免落实（可选，向后兼容）----
  # 任务类型（feature/fix/refactor/chore/docs/test/exp）→ 必填节/可豁免节映射，
  # 数据来自 assets/task-type-gates.conf 的 TASK_EXEMPT_<type>（spec-template.md 头部表层化同源）。
  # 未传 --task-type 则跳过本段（维持现状：只校验 §5.5，向后兼容）。
  if [[ -n "${TASK_TYPE:-}" && -n "$spec_file" ]]; then
    # 任务类型 → 必填节清单（与 spec-template.md 头部矩阵 + task-type-gates.conf 对齐）
    case "$TASK_TYPE" in
      feature)        _required_sec="§1 §2 §3 §4 §5.5 §5.6 §5.7 §6 §7 §8 §9 §10 §11 §12 §13" ;;
      fix)            _required_sec="§1 §2 §3 §4 §5.5 §12" ;;
      refactor)       _required_sec="§1 §2 §3 §4 §5.5 §6 §7 §8 §9 §10 §11 §12 §13" ;;
      chore)          _required_sec="" ;;   # spec 全段可免
      docs)           _required_sec="" ;;   # 其他门禁全免
      test)           _required_sec="§19" ;;
      exp)            _required_sec="§1" ;;
      *) fail "未知任务类型 '$TASK_TYPE'（合法值：feature|fix|refactor|chore|docs|test|exp）"; found=1; _required_sec="" ;;
    esac
    # 校验必填节非空（§N 段在 spec 里存在且非「不适用」占位）
    local sec
    for sec in $_required_sec; do
      local sec_num="${sec#§}"
      local sec_body
      sec_body=$(awk -v sn="$sec_num" '
        $0 ~ "^## " sn "[. ]" {in_sec=1; next}
        /^## [0-9]/ && in_sec {in_sec=0}
        in_sec {print}
      ' "$spec_file" 2>/dev/null)
      # 段不存在 or 仅含「不适用」→ fail
      if [[ -z "$sec_body" ]] || echo "$sec_body" | grep -qE '^\s*(不适用|N/A)\s*$'; then
        fail "$spec_file §${sec_num} 为 $TASK_TYPE 任务必填节，但缺失或标「不适用」"
        found=1
      fi
    done
  fi

  # ---- 2. 硬门禁：新增胶水代码单元名 vs reference-manual.md §4/5/6 稳定单元名重名检测 ----
  # 兜底候选含 glob：.claude/skills/<*>/references/reference-manual.md
  local ref_file
  ref_file=$(_first_existing_file "references/reference-manual.md" "reference-manual.md" ".claude/skills/*/references/reference-manual.md")

  if [[ -n "$spec_file" && -n "$ref_file" ]]; then
    # 从 spec §5.5 "新增胶水代码" 表提取首列单元名（跳过表头/分隔行/空行）
    # 原提取用默认空白分字段取 $2——
    # 既不是表格列语义，又把"胶水落在既有文件内"（首列=文件路径，模板口径）与
    # §4/5/6 首列路径对比，重名必判——而"在既有单元内加最小胶水"正是拼装式开发
    # 的推荐形态，检测语义拧反，任何正常 spec 必被拦。修复：
    #   ① -F'|' 按表格列取首列单元格；
    #   ② 路径形态（含 /）的单元格 = 在既有文件内加胶水，不参与重名对比
    #     （路径已在稳定清单=合法拼装；不在=新文件，新文件无从与既有路径重名）；
    #   ③ 仅非路径单元格（单元名形态）参与重名检测（保留原拦截意图）。
    local new_names; new_names=$(awk -F'|' '
      /^### .*新增胶水代码/ {in_tbl=1; next}
      /^### / && in_tbl {in_tbl=0}
      in_tbl && /^[[:space:]]*\|/ && !/^[[:space:]]*\|[-: ]+\|/ && !/文件|单元名/ {
        cell=$2; gsub(/[ `]/,"",cell); if(cell!="") print cell
      }
    ' "$spec_file" 2>/dev/null | awk '
      !/\// {print}   # 路径形态跳过；单元名形态参与重名对比
    ' | sort -u)
    # 从 reference-manual.md §4/§5/§6 表格首列提取稳定单元名（-F'|' 表格列语义，同上）
    local stable_names; stable_names=$(awk -F'|' '
      /^#+ .*[§4-6].*(组件|依赖链路|接口)/ {in_sec=1}
      /^#+ / && !/[§4-6].*(组件|依赖链路|接口)/ {if(in_sec) in_sec=0}
      in_sec && /^[[:space:]]*\|/ && !/^[[:space:]]*\|[-: ]+\|/ {
        cell=$2; gsub(/[ `]/,"",cell); if(cell!="" && cell !~ /^</) print cell
      }
    ' "$ref_file" 2>/dev/null | sort -u)

    if [[ -n "$new_names" && -n "$stable_names" ]]; then
      local dups; dups=$(comm -12 <(echo "$new_names") <(echo "$stable_names"))
      if [[ -n "$dups" ]]; then
        fail "疑似重复造轮子：以下新增单元名与 reference-manual.md §4/5/6 既有稳定单元重名（应直接复用）："
        echo "$dups" | sed 's/^/    - /'
        found=1
      fi
    fi
  fi

  # ---- 3. 启发式 warn：本次 diff 新增导出单元数量异常（非全量统计）----
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    local base; base=$(_git_base)
    local diff_add; diff_add=$(git diff "$base"...HEAD --diff-filter=A --name-only 2>/dev/null || true)
    [[ -z "$diff_add" ]] && diff_add=$(git diff HEAD --diff-filter=A --name-only 2>/dev/null || true)
    if [[ -n "$diff_add" ]]; then
      local new_count=0
      while IFS= read -r nf; do
        [[ -z "$nf" ]] && continue
        case "$nf" in
          *.ts|*.js|*.vue|*.py)
            local exports; exports=$(grep -cE '^\s*(export\s+)?(function|const|class|def)\s+[A-Za-z_]' "$nf" 2>/dev/null | head -1 || true); exports=${exports:-0}
            new_count=$((new_count + exports))
            ;;
        esac
      done <<< "$diff_add"
      if [[ $new_count -gt 30 ]]; then
        warn "本次变更新增 $new_count 个导出单元——请核对 reference-manual.md §4/5/6 可复用稳定单元清单，确认无重复造轮子"
      fi
    fi
  fi

  echo "  提示: 拼装式开发原则——新功能应优先复用既有稳定单元（见 reference-manual.md §4/5/6）"
  echo "    - 禁止重复造轮子：新增前先查可复用稳定单元清单"
  echo "    - 禁止侵入式重构：不改既有稳定单元签名/行为"
  echo "    - 禁止破坏性改造：不改 upstream 骨架/第三方依赖"
  echo "    - 每个新增文件应标注复用了哪些既有单元（见 spec-template.md §5.5 复用约束段）"
  # 实证反馈（强行复用不贴合场景）——反方向检查：
  # 机械层只能抓"该复用没复用"（重名/新增导出过多），"复用错了"（跨场景硬套、
  # 为复用扭曲新代码）是语义判断，机械抓不住。此处给 AI 判断引导（_ai_hint 同款模式）：
  # 本次复用的每个稳定单元须有一句"场景贴合性"留痕，供审查回放。
  echo "  → AI 自查（语义层，机械不判）：本次改动复用的每个稳定单元，逐一回答——"
  echo "    ① 该单元的设计场景与本次需求场景是否同类（输入域/输出域/副作用面一致）？"
  echo "    ② 复用是否让新代码为它做了本不该做的适配（参数塞哑值/包一层壳改语义/引入无关依赖）？"
  echo "    ③ 若以上任一答'不贴合'，停止复用、新写单元，并在 spec §5.5 说明不复用理由。"
  echo "    留痕：echo '<结论>' >> .swarm-yuan/notes/check_reuse.md（审查与复盘的数据源）"
  if [[ $found -eq 0 ]]; then
    pass "复用合规检查通过"
  fi
}
