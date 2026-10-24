# gate: stable-diff
# domain: architecture / enforce: advisory / tier: arch
check_stable_diff() {
  echo "=== 稳定单元篡改检查（DDD：稳定层/聚合根/Repository 不得被随意改）==="
  local found=0

  if [[ ${#STABLE_GLOBS[@]} -eq 0 ]]; then
    # 模板把 STABLE_GLOBS 标 deprecated、流程无填写指引——README 3.5 管束链
    # 承诺的"稳定单元被改而未声明（失败）"出厂即休眠。reference-manual §4/§6/§9 是
    # 稳定性标注的三节载体（组件/接口/数据勾稽——模板 §9 示例自带「禁止改——勾稽恒等式」
    # 引导），说明列稳定性标注词（与 --stability-audit 同一词库）可机械反推
    # 稳定单元路径作兜底源；显式配置 STABLE_GLOBS 仍优先。
    # R138：节锚由 §4 扩到 §4/§6/§9——旧锚只认 §4，§9 标「禁止改」的实体被改时
    # 反推不到（nest-forge 实证：改 task.entity.ts 触发 §9 标注却报「未改动稳定层」），
    # 与 inventory-verify/inventory-update 的三节口径对齐。
    local _rm_file
    _rm_file=$(_first_existing_file "${PROJECT_DIR:-.}/.claude/skills/*/references/reference-manual.md" "${PROJECT_DIR:-.}/.codex/skills/*/references/reference-manual.md")
    if [[ -n "$_rm_file" ]]; then
      local _p
      STABLE_GLOBS=()
      while IFS= read -r _p; do
        [[ -z "$_p" ]] && continue
        STABLE_GLOBS+=("$_p")
      done < <(awk '
        /^## .*§(4|6|9)/ {insec=1; next}
        insec && /^## / {insec=0}
        insec && /^\|/ {
          line=$0
          if (match(line, /`[^`]+`/)) {
            p=substr(line, RSTART+1, RLENGTH-2)
            rest=substr(line, RSTART+RLENGTH)
            if (index(rest,"禁止改")>0 || index(rest,"稳定")>0) print p
          }
        }
      ' "$_rm_file")
      if [[ ${#STABLE_GLOBS[@]} -gt 0 ]]; then
        echo "  ⓘ STABLE_GLOBS 未配置——从 reference-manual §4/§6/§9 稳定性标注反推 ${#STABLE_GLOBS[@]} 个稳定单元（显式配置可覆盖）"
      fi
    fi
  fi
  if [[ ${#STABLE_GLOBS[@]} -eq 0 ]]; then
    warn "未配置 STABLE_GLOBS 且 reference-manual §4 无稳定性标注，跳过稳定单元篡改检查"
    return
  fi
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    warn "非 git 仓库，稳定单元篡改检查跳过"
    return
  fi

  # ---- 1. 收集本次变更（vs main）触及的稳定层文件 ----
  local changed; changed=$(_git_changed_files)
  [[ -z "$changed" ]] && { pass "无变更，稳定单元篡改检查通过"; return; }

  # 匹配 stable globs
  # R126-G4：旧实现在循环内 shopt -s globstar extglob nullglob 且从不恢复——三个 shell
  # 选项泄漏为全局态影响后续所有门禁（nullglob 泄漏后 gates-advisory 的 `"$d"/*.md "$d"/*.sh`
  # 双 glob 齐空时展开为零操作数，grep -rhoE 退化为扫 CWD）。改子 shell 内设置，
  # 选项随子 shell 退出自动还原，零全局态污染。
  declare -a stable_changed=()
  local c sg _sc_hits
  _sc_hits=$(
    shopt -s globstar extglob nullglob 2>/dev/null || true
    while IFS= read -r c; do
      [[ -z "$c" ]] && continue
      for sg in "${STABLE_GLOBS[@]}"; do
        # 简单前缀匹配：把 glob 的 ** 之前部分作为前缀（% 最短匹配——与 check_layer §516 同款修复；
        # %% 会把 'overlay/custom/client/*/components/**' 误截成 'overlay/custom/client'，导致整目录被误判为稳定层改动）
        local prefix="${sg%/\**}"
        if [[ "$c" == "$prefix"* ]]; then
          printf '%s\n' "$c"
          break
        fi
      done
    done <<< "$changed"
  )
  while IFS= read -r c; do
    [[ -n "$c" ]] && stable_changed+=("$c")
  done <<< "$_sc_hits"

  if [[ ${#stable_changed[@]} -eq 0 ]]; then
    pass "本次未改动稳定层文件"
    return
  fi

  # ---- 2. 对每个被改的稳定文件，检查是否有 spec 声明 MODIFIED ----
  # 找 spec 文档（含 §5.5 复用约束的 spec）——统一走 _find_spec_file
  local spec_file
  spec_file=$(_find_spec_file '复用约束|拼装合规声明|MODIFIED')

  # 从 spec 提取声明为 MODIFIED 的文件路径
  local declared_modified=""
  if [[ -n "$spec_file" ]]; then
    declared_modified=$(awk '
      /MODIFIED|修改文件|侵入点/ {in_sec=1}
      /^## [0-9]/ && in_sec {in_sec=0}
      in_sec && /`[^`]+`/ {
        line=$0; while (match(line, /`[^`]+`/)) {
          print substr(line, RSTART+1, RLENGTH-2); line=substr(line, RSTART+RLENGTH)
        }
      }
    ' "$spec_file" 2>/dev/null | grep -E '/|\.' | sort -u || true)
  fi

  local sc si
  for ((si=0; si<${#stable_changed[@]}; si++)); do
    sc="${stable_changed[$si]}"
    # 检查该稳定文件是否在 spec 的 MODIFIED 清单中
    if echo "$declared_modified" | grep -qF -- "$sc"; then
      : # 已声明修改，允许
    else
      fail "稳定单元被篡改但未在 spec MODIFIED 段声明：${sc}（稳定层改动必须先立 spec，标注 MODIFIED + 理由 + 迁移）"
      found=1
    fi
  done

  # ---- 3. ★标记沿调用链传播（决策 28，Palantir markings-propagate 映射）----
  # 直接改稳定单元已由上面 §2 的 fail() 执法；本节补"下游传播 warn"：
  # 若本次变更触及"调用 STABLE_GLOBS 文件的下游文件"（1 跳邻域），不阻断，只 warn
  # "该文件依赖禁止改单元 X，改动可能破坏其契约，须在 spec §MODIFIED 声明"。
  # 下游影响域来源：reference-manual.md §5 调用链路图的"下游影响域"标注（特征卡
  # 第 11 项 §11g 的 STABLE_PROPAGATE 记录）；未记录则降级 grep import 反查（best-effort）。
  # 设计：warn 不增 fail() 计数 → 不改变 --stable-diff 的 enforce_level 归类（保持原档）。
  # 关闭：STABLE_PROPAGATE_HOPS=0 时跳过（默认 1）。
  local hops="${STABLE_PROPAGATE_HOPS:-1}"
  if [[ "${STABLE_PROPAGATE:-1}" == "1" && "$hops" -ge 1 && ${#stable_changed[@]} -gt 0 ]]; then
    local downstream_set=""
    # 3a. 优先从 reference-manual §5 提取已记录的下游影响域（机器可读标记：
    #     `<!-- stable-propagate: <stable_file> → <downstream_file> -->`）
    local refmanual
    refmanual=$(_first_existing_file "references/reference-manual.md" "docs/reference-manual.md")
    if [[ -n "$refmanual" && -f "$refmanual" ]]; then
      # 提取所有 stable-propagate 标记的下游文件（去重）
      downstream_set=$(grep -oE '<!-- stable-propagate: [^→]*→[^-]*-->' "$refmanual" 2>/dev/null \
        | sed -E 's/<!-- stable-propagate:[^→]*→//; s/ *-->.*//' \
        | tr ',' '\n' | sed 's/^ *//;s/ *$//' | grep -v '^$' | sort -u || true)
    fi
    # 3a'. 机器可读关系边集（references/relations.jsonl，relations-extract.sh 产物）补充——
    #      边 to=稳定文件 的 from 即 1 跳下游（import 边精确，优于 3b 的 basename grep 启发式）。
    #      与标记集取并集（warn-only 语义：多召回只多提示不误拦）；无边集时行为不变。
    local reledge
    reledge=$(_first_existing_file "references/relations.jsonl" "docs/relations.jsonl")
    if [[ -n "$reledge" && -f "$reledge" ]]; then
      local sc3 e_hits
      for sc3 in "${stable_changed[@]}"; do
        e_hits=$(grep -F "\"to\":\"${sc3}\"" "$reledge" 2>/dev/null \
          | sed -n 's/.*"from":"\([^"]*\)".*/\1/p' || true)
        [[ -n "$e_hits" ]] && downstream_set="${downstream_set}${downstream_set:+$'\n'}${e_hits}"
      done
      downstream_set=$(printf '%s\n' "$downstream_set" | sort -u | grep -v '^$' || true)
    fi
    # 3b. 降级：未记录时用 grep import 反查（best-effort，仅支持常见语言）
    if [[ -z "$downstream_set" ]]; then
      local sc2
      for sc2 in "${stable_changed[@]}"; do
        # 提取稳定文件 basename（去扩展名）作为 import 关键词
        local bname; bname=$(basename "$sc2" 2>/dev/null | sed -E 's/\.(ts|tsx|js|jsx|py|java|go|rs|kt|rb|php)$//')
        [[ -z "$bname" ]] && continue
        # 在可改源码目录 grep import/from/use 该 basename 的文件（排除稳定文件自身）
        local hits=""
        for dir in ${WRITABLE_DIRS[@]+"${WRITABLE_DIRS[@]}"} ${SCAN_DIRS[@]+"${SCAN_DIRS[@]}"}; do
          [[ -d "$dir" ]] || continue
          hits=$(grep -rlE "(import|from|use|require)[[:space:]].*${bname}" "$dir" \
            --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
            --include='*.py' --include='*.java' --include='*.go' --include='*.rs' \
            --include='*.kt' --include='*.rb' --include='*.php' 2>/dev/null || true)
          [[ -n "$hits" ]] && { downstream_set="${downstream_set}${downstream_set:+$'\n'}${hits}"; }
        done
      done
      downstream_set=$(printf '%s\n' "$downstream_set" | sort -u | grep -v '^$' || true)
    fi
    # 3c. 对每个下游文件，若本次变更触及它且未在 spec 声明 → warn（不阻断，不调 fail()）
    local ds
    while IFS= read -r ds; do
      [[ -z "$ds" ]] && continue
      # 排除稳定文件自身（已在 §2 处理）
      local is_stable=0
      for sg in "${STABLE_GLOBS[@]}"; do
        local prefix="${sg%/\**}"
        if [[ "$ds" == "$prefix"* ]]; then is_stable=1; break; fi
      done
      [[ $is_stable -eq 1 ]] && continue
      # 本次变更是否触及该下游文件
      if echo "$changed" | grep -qF -- "$ds"; then
        if ! echo "$declared_modified" | grep -qF -- "$ds"; then
          warn "下游文件依赖禁止改稳定单元但未在 spec 声明：${ds}（依赖稳定层，改动可能破坏其契约，须在 spec §MODIFIED 声明+理由）"
        fi
      fi
    done <<< "$downstream_set"
  fi

  if [[ $found -eq 0 ]]; then
    pass "稳定单元篡改检查通过（${#stable_changed[@]} 个稳定文件改动均已在 spec 声明）"
  fi
}
