#!/usr/bin/env bash
# generate-skill.sh — swarm-yuan 目标技能脚手架生成器 / 升级器
# 用法:
#   bash generate-skill.sh <skill-name> <project-dir> [target-dir]       # 创建新技能骨架
#   bash generate-skill.sh --upgrade <skill-name> <project-dir> [target-dir]  # 升级已存在技能
#   bash generate-skill.sh --upgrade --dry-run <skill-name> <project-dir> [target-dir]  # 升级预演（只报告将变更/新增/删除的文件，不写入）
#   bash generate-skill.sh --verify-completeness <skill-dir> [--strict]  # 无占位符机器执法（骨架填充完成度校验）
#   bash generate-skill.sh --render-tools <skill-dir> [project-root] [tool]   # 派生各 AI 工具原生规则文件（幂等）
#   bash generate-skill.sh --inject-frameworks <skill-dir>              # 按 ACTIVE_FRAMEWORKS 把框架门禁片段注入 precheck.sh 标记区块
#   bash generate-skill.sh --rollback-frameworks <skill-dir>            # 按 .swarm-yuan/effects 快照回滚框架注入
#   bash generate-skill.sh --mark-active <skill-dir>                    # 三道关（占位符清零/路径零幻觉/计数达标）后把 draft 激活为 active
#   bash generate-skill.sh --refresh <skill-dir> [--commit-fp]          # 指纹 diff 报告（可选落新基线）
#   bash generate-skill.sh --check-framework-globs <skill-dir>          # 单跑框架空转防线
#   bash generate-skill.sh --help                                       # 本帮助；--version 列版本
# 通用旗标（置位置参数之前，任意顺序；--profile 可与 --upgrade 组合）:
#   --upgrade            升级模式（保留 PROJECT_SPECIFIC_FILES 与用户配置）
#   --dry-run            升级预演（须与 --upgrade 组合）：在暂存副本走完整升级流程后
#                        对比原目录，报告将 add/change/delete 的文件清单即退出——
#                        技能目录与项目零写入（openspec 1.15.0 update --dry-run 理念）
#   --profile <档>       auto|lite|standard|compliance（缺省 auto：合规信号→compliance，<80 文件→lite，其余 standard）
#   --industry <名>      finance|gov|medical|telecom|automotive|energy|industrial|payment|none（真实加载行业层；compliance 建议显式声明）
# 可选环境变量:
#   SKILLS_PATH_REWRITE — sed 表达式，复制通用文件后逐文件应用（create/upgrade 均生效；
#     缺省为空 = 不重写，行为不变）。用于目标运行时的 skills 目录不是 .claude/skills 的实例。
#     例: SKILLS_PATH_REWRITE='s|\.claude/skills|.agents/skills|g' \
#           bash generate-skill.sh --upgrade <skill-name> <project-dir> <target-dir>
# 作用:
#   创建模式: 自动检测运行环境，在对应 skill 默认目录下创建六段式骨架
#   升级模式: 用 swarm-yuan 最新模板覆盖通用文件，保留项目特定文件

set -euo pipefail

# ============================================================
# --inject-frameworks 子命令（独立于 create/upgrade，单独拦截）
# 用法: bash generate-skill.sh --inject-frameworks <skill-dir>
# 读取目标 skill 的 precheck.conf 中 ACTIVE_FRAMEWORKS，把对应门禁片段
# 幂等注入其 precheck.sh 的标记区块；核对/补齐 conf 变量；记录区块哈希。
# ============================================================
# ============================================================
# 已合并框架迁移映射（缺口 B 合并产物）
# key=旧独立 ruleset_id，value=母框架 ruleset_id
# 维护约定：后续若有新合并，在此追加映射 + 注释说明
# ============================================================
# R126：ASSETS_DIR/SRC_REF/SRC_SCRIPTS 前置到全部子命令分发点之前——旧版在
# :1700 附近（create 流中段）才赋值，而 --inject-frameworks/--verify-completeness/
# --mark-active 在中段拦截即 exit，_tpl_line_for_var 读 ${ASSETS_DIR:-}/precheck.conf
# 落到 /precheck.conf（不存在）→「与模板逐字相同=原生未确认」防线静默失效（fail-open）。
MERGED_FRAMEWORK_MAP=(
  "pinia:vue"        # B1: pinia 合并入 vue
  "socketio:koa"     # B3: socketio 合并入 koa
  "vitest:jest-vitest" # B2: vitest 合并入 jest-vitest
)
ASSETS_DIR="$(cd "$(dirname "$0")/.." && pwd)/assets"
SRC_REF="$(cd "$(dirname "$0")/.." && pwd)/references"
SRC_SCRIPTS="$(cd "$(dirname "$0")" && pwd)"

# ============================================================
# 通用文件清单（唯一数据源，create 复制 / upgrade 备份+覆盖 共用）
# 格式：目标相对路径|源类别（源文件统一按 basename 取自源目录）
#   assets = $ASSETS_DIR  ref = $SRC_REF  gen = $SRC_SCRIPTS（scripts/ 自身）
# 注：scripts/precheck.conf 仅 create 覆盖；upgrade 保留用户配置（merge_precheck_conf 增量补）
# ============================================================
# 通用文件清单：<目标路径>|<源类别>[|<最低 profile 档>]
# 档序 lite(1)<standard(2)<compliance(3)：骨架只拷「最低档 ≤ 当前档」的文件；
# 无第三段 = standard（向后兼容既有清单语义）。
# >>> swarm-yuan:dist-manifest >>> (generated from assets/registry/dist.tsv; do not edit)
UNIVERSAL_FILES=(
  "assets/spec-template.md|assets|lite"
  "assets/plan-template.md|assets|lite"
  "assets/review-record-template.md|assets|lite"
  "assets/branch-setup.sh|assets|standard"
  "assets/env-setup.sh|assets|standard"
  "assets/data-sample-template.md|assets|standard"
  "assets/task-type-gates.conf|assets|lite"
  "assets/profile-thresholds.conf|assets|lite"
  "assets/inventory-dimensions.conf|assets|lite"
  "assets/lib/files.sh|assets|lite"
  "scripts/mine-habits.sh|gen|lite"
  "scripts/precheck.sh|assets|lite"
  "scripts/gates-strict.sh|assets|lite"
  "scripts/gates-warn.sh|assets|lite"
  "scripts/gates-advisory.sh|assets|lite"
  "scripts/gate-enforce-level.conf|assets|lite"
  "scripts/precheck.conf|assets|lite"
  "scripts/precheck.arch.conf|assets|standard"
  "scripts/precheck.compliance.conf|assets|compliance"
  "assets/standards-map.conf|assets|compliance"
  "scripts/snippets.md|assets|standard"
  "scripts/mcp-tools.md|assets|standard"
  "scripts/state-machine.sh|assets|lite"
  "scripts/trace-log.sh|assets|lite"
  "scripts/memory-backends.sh|assets|lite"
  "scripts/memory-writeback.sh|assets|lite"
  "scripts/spec-first-lib.sh|assets|lite"
  "scripts/spec-first-pre-commit.sh|hook|standard"
  "scripts/spec-first-bridge.sh|hook|standard"
  "scripts/failure-detector.sh|hook|lite"
  "scripts/integrity-guard.sh|hook|lite"
  "scripts/fail-gate-hook.sh|hook|lite"
  "scripts/install.sh|assets|lite"
  "scripts/generate-skill.sh|assets|lite"
  "scripts/codex-gate-wrapper.sh|hook|standard"
  "scripts/setup-loop.sh|hook|standard"
  "scripts/loop-hook.sh|hook|standard"
  "scripts/project-fingerprint.sh|gen|lite"
  "scripts/inventory-update.sh|gen|lite"
  "scripts/relations-extract.sh|gen|lite"
  "scripts/inventory-verify.sh|gen|lite"
  "scripts/relations-query.sh|gen|lite"
  "scripts/diagram-check.sh|gen|lite"
  "scripts/gate-rules.sh|gen|lite"
  "scripts/gate-plan.sh|gen|lite"
  "scripts/audit-closure.sh|gen|lite"
  "scripts/ontology-verify.sh|gen|lite"
  "references/ontology/objects.md|onto|lite"
  "references/ontology/links.md|onto|lite"
  "references/ontology/actions.md|onto|lite"
  "rules.d/bash-advance.rules|rules|lite"
  "rules.d/readonly-safe.rules|rules|lite"
  "rules.d/framework-globs.rules|rules|standard"
  "scripts/self-check.sh|gen|lite"
  "scripts/detect-frameworks.sh|gen|lite"
  "scripts/cost-report.sh|gen|lite"
  "scripts/detect-profile-drift.sh|gen|lite"
  "scripts/detect-spec-scale.sh|gen|lite"
  "scripts/task-scale.sh|gen|lite"
  "scripts/ops-readonly-guard.sh|gen|standard"
  "scripts/tunnel.sh|gen|standard"
  "scripts/tunnel.conf|assets|standard"
  "references/subagent-orchestration.md|refd|standard"
  "references/governance-agents.md|ref|compliance"
  "references/task-methodology-router.md|ref|standard"
  "references/canary-monitoring.md|ref|standard"
  "references/review-methodology.md|refd|standard"
  "references/code-graph-tools.md|refd|standard"
  "references/gsd-patterns.md|ref|standard"
  "references/memory-persistence.md|refd|standard"
  "references/security-spec.md|ref|lite"
  "references/cognition-framework.md|ref|standard"
  "references/logic-razor.md|ref|standard"
  "references/cognitive-bias.md|ref|standard"
  "references/domain-knowledge.md|ref|standard"
  "references/business-ontology-methodology.md|ref|standard"
  "references/fibo-financial-ontology.md|ref|standard"
  "references/cost-estimation-methodology.md|ref|standard"
  "references/lazy-generation-methodology.md|ref|standard"
  "references/claude-code-capabilities.md|refd|standard"
  "references/standards-compliance.md|ref|compliance"
  "references/cwe-database.md|ref|compliance"
  "references/security-certification-profiles.md|ref|compliance"
  "references/knowledge-lifecycle-methodology.md|ref|standard"
  "references/mattpocock-skills-methodology.md|ref|standard"
  "references/decision-governance.md|ref|standard"
  "references/ai-process-records.md|ref|standard"
  "references/agent-skills-methodology.md|ref|standard"
  "references/codex-methodology.md|refd|standard"
  "references/mea-loop-methodology.md|ref|standard"
  "references/rsi-evidence-methodology.md|ref|standard"
  "references/togaf-metamodel-methodology.md|ref|standard"
  "references/cordis-composability-methodology.md|ref|standard"
  "references/frontend-design-methodology.md|ref|standard"
  "references/codex-security-methodology.md|refd|standard"
  "references/mcp-governance.md|ref|standard"
  "references/controlled-language-methodology.md|ref|lite"
  "references/crypto-spec.md|ref|compliance"
  "references/bugfix-runbook.md|ref|standard"
  "references/remote-debug-jvm.md|ref|standard"
  "scripts/inspection-ledger.sh|gen|compliance"
  "references/compliance-checkpoints.md|ref|compliance"
  "references/regulatory-checkpoint-table.md|ref|compliance"
)
# <<< swarm-yuan:dist-manifest <<<


# 项目特定文件（upgrade 保留不覆盖、不备份）
# R21-A：+references/recipes.md（任务配方：§A 业务功能清单 + §B 五要素配方，生成器出骨架、AI 填充、成长链单条更新）
# R21-D：+references/relations.jsonl（机器可读关系边集：relations-extract.sh 自动 import 边 + AI 语义边）
PROJECT_SPECIFIC_FILES=("SKILL.md" "references/workflow.md" "references/codebase.md" "references/dev-guide.md" "references/release.md" "references/reference-manual.md" "references/recipes.md" "references/relations.jsonl")

# 用户可填充模板（随 UNIVERSAL_FILES 分发但 AI 会填入项目内容——Step 7 填充对象）
# R21-A 缺陷修复：此类文件 upgrade 时若已非占位骨架（不含「（填入」标记）则跳过覆盖，
# 防止 AI 填好的项目内容被模板覆盖丢失；仍是占位骨架则照常刷新（拿到模板改进）。
USER_FILLABLE_FILES=("scripts/snippets.md" "scripts/mcp-tools.md" "scripts/tunnel.conf")

# 迁移 ACTIVE_FRAMEWORKS 里的旧 id 到母框架（原地修改全局 ACTIVE_FRAMEWORKS 数组）
# 迁移后 warn 提示用户更新 conf 的 ACTIVE_FRAMEWORKS 行
# 置全局 MIGRATION_HAPPENED=1 表示发生了迁移（供调用方判断是否写回 conf）
MIGRATION_HAPPENED=0
migrate_merged_frameworks() {
  MIGRATION_HAPPENED=0
  local fw new migrated=0 newlist=()
  for fw in "${ACTIVE_FRAMEWORKS[@]+"${ACTIVE_FRAMEWORKS[@]}"}"; do
    new="$fw"
    for m in "${MERGED_FRAMEWORK_MAP[@]+"${MERGED_FRAMEWORK_MAP[@]}"}"; do
      if [[ "$fw" == "${m%%:*}" ]]; then
        new="${m##*:}"
        echo "⚠ 框架 '$fw' 已合并入母框架 '$new'（conf 的 ACTIVE_FRAMEWORKS 将自动更新）"
        migrated=$((migrated+1))
        break
      fi
    done
    # 去重（母框架可能已在列表里）
    local dup=0
    for ex in "${newlist[@]+"${newlist[@]}"}"; do [[ "$ex" == "$new" ]] && { dup=1; break; }; done
    [[ "$dup" -eq 0 ]] && newlist+=("$new")
  done
  ACTIVE_FRAMEWORKS=("${newlist[@]+"${newlist[@]}"}")
  if [[ "$migrated" -gt 0 ]]; then
    MIGRATION_HAPPENED=1
    echo "  已迁移 $migrated 个旧框架 id 到母框架"
  fi
}

# upgrade 模式增量合并 precheck.conf：保留用户配置，只对【激活框架】缺失的 requires_conf 变量补占位
# 不触碰用户已填的任何行；只追加用户 ACTIVE_FRAMEWORKS 里框架声明但 conf 没有的变量
# R141 项目根重定位（迁移/克隆后 --upgrade）：PROJECT_DIR 是 AUTO:detected 项。
# 旧路径失效时不刷新会让门禁读旧项目的 coverage/target 产物并给出错判（R141 实栈实抓）。
# 仅在技能目录位于新项目根内时自动执行；外部 target-dir 只告警不动。
_literal_path_replace() {  # $1=file $2=old $3=new（字面替换，路径含 sed 元字符也安全）
  local _f="$1"
  [[ -f "$_f" ]] || return 0
  OLD="$2" NEW="$3" awk '
    BEGIN{o=ENVIRON["OLD"]; n=ENVIRON["NEW"]}
    { s=$0; out=""; while ((i=index(s,o))>0) { out=out substr(s,1,i-1) n; s=substr(s,i+length(o)) } print out s }
  ' "$_f" > "$_f.relocate" && mv "$_f.relocate" "$_f"
}

_relocate_project_root() {  # $1=skill_dir
  local sd="$1" conf="$1/scripts/precheck.conf" old="" new="$PROJECT_DIR" f n=0
  [[ -f "$conf" ]] || return 0
  old=$(grep -m1 '^PROJECT_DIR=' "$conf" 2>/dev/null | cut -d'#' -f1 \
    | sed 's/^PROJECT_DIR=//;s/[[:space:]]*$//;s/^"//;s/"$//' || true)
  [[ -n "$old" && "$old" != "$new" ]] || return 0
  case "$sd/" in "$new"/*) ;; *)
    echo "⚠ 技能目录不在新项目根内，保留旧 PROJECT_DIR（迁移项目请把技能放进项目或用 SKILLS_PATH_REWRITE）: ${old}"
    return 0 ;;
  esac
  for f in "scripts/precheck.conf" "scripts/precheck.patch.conf" "SKILL.md" \
           "references/recipes.md" "references/codebase.md" "references/dev-guide.md" \
           "references/reference-manual.md"; do
    if grep -qF -- "$old" "$sd/$f" 2>/dev/null; then
      _literal_path_replace "$sd/$f" "$old" "$new"
      n=$((n+1))
    fi
  done
  echo "⚠ 项目根已迁移: ${old} → ${new}（已刷新 ${n} 个操作档；历史 specs/reviews 保留原路径作为证据）"
}

merge_precheck_conf() {
  local skill_dir="$1"
  local paradigm_dir; paradigm_dir="$(cd "$(dirname "$0")/.." && pwd)"
  local conf="$skill_dir/scripts/precheck.conf"
  [[ -f "$conf" ]] || { echo "⚠ precheck.conf 不存在，跳过合并"; return 0; }
  # 框架变量属 arch 组——补占位落 precheck.arch.conf（旧版 skill 无此文件则回落主 conf）
  local merge_target="$skill_dir/scripts/precheck.arch.conf"
  [[ -f "$merge_target" ]] || merge_target="$conf"
  # 读取用户 ACTIVE_FRAMEWORKS（含旧 id，迁移后补对应母框架变量）。
  # 子 shell 内 set +u source（conf 可能含字面 ${}），把数组逐行打印出来供当前 shell 读；
  # 子 shell 的变量带不出来，故只取打印输出。
  local _af
  _af=$( (
    set +u
    # shellcheck disable=SC1090
    . "$conf" 2>/dev/null
    printf '%s\n' "${ACTIVE_FRAMEWORKS[@]+"${ACTIVE_FRAMEWORKS[@]}"}"
  ) )
  # 迁移旧 id 到母框架，确定要补占位的框架清单
  local fws=() seen="" fw m new
  while IFS= read -r fw; do
    [[ -z "$fw" ]] && continue
    new="$fw"
    for m in "${MERGED_FRAMEWORK_MAP[@]+"${MERGED_FRAMEWORK_MAP[@]}"}"; do
      [[ "$fw" == "${m%%:*}" ]] && { new="${m##*:}"; break; }
    done
    case " $seen " in *" $new "*) continue;; esac
    seen="$seen $new"; fws+=("$new")
  done <<< "$_af"
  [[ ${#fws[@]} -eq 0 ]] && { echo "  （ACTIVE_FRAMEWORKS 为空，跳过变量补占位）"; return 0; }
  local frag var missing=() _mu_line _mu_file
  for fw in "${fws[@]}"; do
    frag="$paradigm_dir/assets/framework-gates/$fw.sh"
    [[ -f "$frag" ]] || continue
    local req
    req=$(sed -n 's/^# ruleset:.*requires_conf: *//p' "$frag" | tr -s ' ')
    for var in $req; do
      # 变量可能定义在主 conf 或 arch conf（物理三分），两处都查
      # R106-D12 同款修复：行存在但值为空不算"已声明"（与 mark-active 语义对齐），
      # 空行就地打 TODO(upgrade) 标记，行缺失才追加占位。
      _mu_line=$( { grep -h "^${var}=" "$conf" 2>/dev/null; [[ -f "$merge_target" ]] && grep -h "^${var}=" "$merge_target" 2>/dev/null; } | head -1 || true)
      if [[ -n "${_mu_line}" && "${_mu_line}" != *"()"* && "${_mu_line}" != *'=""'* && "${_mu_line}" != *"=() "* && "${_mu_line}" != *='""'* ]]; then
        continue  # 行存在且非空——用户已配置
      fi
      if [[ -n "${_mu_line}" ]] && _user_acknowledged_empty "${_mu_line}"; then
        continue  # R109-D9：空值但带用户 N/A 说明注释——已审配置，不打 TODO 标记
      fi
      missing+=("$var")
    done
  done
  # 去重
  local uniq_missing=() useen=""
  for var in "${missing[@]+"${missing[@]}"}"; do
    case " $useen " in *" $var "*) continue;; esac
    useen="$useen $var"; uniq_missing+=("$var")
  done
  if [[ ${#uniq_missing[@]} -gt 0 ]]; then
    local _mu_hdr=0
    for var in "${uniq_missing[@]}"; do
      # R106-D12：行存在但为空 → 就地打 TODO(upgrade) 标记（幂等）；行缺失才追加。
      _mu_file=""
      if [[ -f "$merge_target" ]] && grep -q "^${var}=" "$merge_target" 2>/dev/null; then
        _mu_file="$merge_target"
      elif grep -q "^${var}=" "$conf" 2>/dev/null; then
        _mu_file="$conf"
      fi
      # R109-D9：跨类 TODO 感知（TODO(framework-gates) 已在也跳过，防双标记堆积）+ 已确认空值跳过
      if grep -q "^${var}=.*TODO(" "$conf" 2>/dev/null || \
         { [[ -f "$merge_target" ]] && grep -q "^${var}=.*TODO(" "$merge_target" 2>/dev/null; }; then
        continue
      fi
      if [[ -n "${_mu_file}" ]] && _user_acknowledged_empty "$(grep "^${var}=" "${_mu_file}" 2>/dev/null | head -1 || true)"; then
        continue
      fi
      if [[ -n "${_mu_file}" ]]; then
        sed -i.bak -E "s|^(${var}=.*)$|\1  # TODO(upgrade): 激活框架变量空值就地标记，由用户按项目实际填充|" "${_mu_file}" && rm -f "${_mu_file}.bak"
        echo "⚠ conf 变量 ${var} 存在但为空，已就地打 TODO(upgrade) 标记（须填充）"
      else
        if [[ "${_mu_hdr}" -eq 0 ]]; then
          echo "" >> "$merge_target"
          echo "# ===== 由 upgrade 增量补充（激活框架需要的变量，用户未声明）=====" >> "$merge_target"
          _mu_hdr=1
        fi
        printf '%s=()  # TODO(upgrade): 由用户按项目实际填充\n' "$var" >> "$merge_target"
        echo "⚠ conf 缺失变量 ${var}，已注入占位（须填充）"
      fi
    done
  fi
}

# R109-D9 用户确认空值判定：行为空值且带用户自写的 N/A 说明注释——视为已审配置，不再打
# TODO 标记。坑源：rust-forge 反馈回路 --upgrade 对 VITE_INJECT_SCRIPT=""（注释「本项目无
# 注入脚本，保持空跳过」）等故意留空的 N/A 变量反复重打 TODO(upgrade)/TODO(framework-gates)
# 标记且两类标记互不感知逐次堆积。
# 「用户自写」判别锚=与生成器模板同名行逐字比对：create/conf-render 拷贝的模板原生行
# （描述注释）不算确认；用户改写过注释（哪怕只加一句 N/A 声明）即算确认。含 TODO(/AUTO:
# 溯源的行一律不算（那是机器标记不是用户决策）。
_tpl_line_for_var() {  # $1=变量名 → stdout 生成器模板同名行（未找到=空）
  local _v="$1" _f _t
  for _f in "${ASSETS_DIR:-}/precheck.conf" "${ASSETS_DIR:-}/precheck.arch.conf"; do
    [[ -f "$_f" ]] || continue
    _t=$(grep -h "^${_v}=" "$_f" 2>/dev/null | head -1 || true)
    [[ -n "$_t" ]] && { printf '%s' "$_t"; return 0; }
  done
  return 0
}
_user_acknowledged_empty() {  # $1=目标 conf 行 → rc 0=用户已确认的空值 1=未确认/非空
  local _ln="$1" _tpl _val
  [[ "$_ln" == *"#"* ]] || return 1                 # 无注释=无确认陈述
  case "$_ln" in *"TODO("*|*"# AUTO:"*) return 1 ;; esac
  _tpl="$(_tpl_line_for_var "${_ln%%=*}")"
  [[ -n "$_tpl" && "$_tpl" == "$_ln" ]] && return 1  # 與模板逐字相同=原生未确认
  # R126：数组空值形态修复——旧版 "=() 精确匹配整行（真实 conf 行永不命中）与
  # *"=()" 要求行尾恰为 =()（与上方「必须含 # 注释」前置互斥），`FOO=()  # 本项目无此概念`
  # 被判未确认 → TODO 标记反复重打（正是本函数注释要修的 R109-D9 场景）。
  # 统一先剥注释与尾部空白再判值形态。
  _val="${_ln%%#*}"
  _val="${_val%"${_val##*[![:space:]]}"}"
  case "$_val" in
    *'=""'|*='""'|*"=()") return 0 ;;
  esac
  return 1
}

# R126：conf 链单一事实源——运行时 conf 是 core→arch→patch 链式 source
# （assets/precheck.conf 尾部 source precheck.patch.conf），生成器侧核验此前只读
# core+arch 两层，用户按文档把 ACTIVE_FRAMEWORKS/WRITABLE_DIRS 挪进 patch 覆盖层
# 即被 --mark-active 判空转/空值。两处核验统一走本清单。
_skill_conf_files() {  # $1=skill_dir → stdout 存在的 conf 文件（core→arch→patch 序）
  local _d="$1" _c
  for _c in "$_d/scripts/precheck.conf" "$_d/scripts/precheck.arch.conf" "$_d/scripts/precheck.patch.conf"; do
    [[ -f "$_c" ]] && printf '%s\n' "$_c"
  done
}

# R126：conf「已填」判据单一实现——认双引号/单引号/数组/裸值四种已填形态，
# 排除 =/=""/=''/=()/=("") 空形态。旧判据 `=("|\(")[^"]` 只认双引号起：单引号形态
# VAR='src'/VAR=('src') 在 bash source 语义下完全合法却被计为空 → 误报「框架 glob 全空」。
_conf_var_filled() {  # $1=conf 行（VAR=... 形态）→ rc 0=已填非空
  local _l="$1" _v
  case "$_l" in *=*) ;; *) return 1 ;; esac
  _v="${_l#*=}"
  _v="${_v%%#*}"                       # 剥行尾注释
  _v="${_v#"${_v%%[![:space:]]*}"}"    # 左剥空白
  _v="${_v%"${_v##*[![:space:]]}"}"    # 右剥空白
  case "$_v" in \(*\)) _v="${_v#\(}"; _v="${_v%\)}" ;; esac   # 数组括号一层
  _v="${_v#\"}"; _v="${_v%\"}"         # 双引号一层
  _v="${_v#\'}"; _v="${_v%\'}"         # 单引号一层
  [[ -n "$_v" ]]
}

# F1（dsh/cordis 吸收·协效应定向失效）：框架移出 ACTIVE_FRAMEWORKS 后的 conf 死变量注释。
# 补齐 merge_precheck_conf 只有"缺失补占位"没有"多余回收"的半边——对齐 cordis 的
# 服务表收缩（论文 Def 23：set 之逆即 unset）：依赖集合变化 → conf 定向失效。
# 死变量判定（自动、保守，三者同时满足）：
#   ① v 不在已注入区块 requires_conf 并集（活跃框架都不需要）
#   ② v 出现在某个【未注入】框架源文件的 requires_conf 中（证明它是框架专属变量）
#   ③ v 不被 skill 四脚本正文直接引用（排通用白名单如 SQL_INJECTION_WHITELIST/
#     EVAL_WHITELIST——它们在 gates 正文有引用，永不被判定死）
# 处置：不删除——原位注释（# deprecated VAR=原值），用户可整体恢复。
sync_framework_vars() {
  local skill_dir="$1"
  local sh="$skill_dir/scripts/precheck.sh"
  local conf="$skill_dir/scripts/precheck.conf"
  local arch_conf="$skill_dir/scripts/precheck.arch.conf"
  [[ -f "$sh" && -f "$conf" ]] || return 0
  [[ -f "$arch_conf" ]] || arch_conf="$conf"
  local paradigm_dir; paradigm_dir="$(cd "$(dirname "$0")/.." && pwd)"
  # 1. 活跃集：注入区块内 ruleset 行的 requires_conf 并集 + 已注入框架 id 集
  local active="" ln fw_id injected_ids=""
  while IFS= read -r ln; do
    fw_id="${ln#\# ruleset: }"; fw_id="${fw_id%%  *}"
    injected_ids="$injected_ids $fw_id "
    active="$active ${ln##*requires_conf: }"
  done < <(sed -n '/^# >>> swarm-yuan:framework-gates >>>/,/^# <<< swarm-yuan:framework-gates <<</p' "$sh" 2>/dev/null | grep '^# ruleset:')
  # 2. 未注入框架源文件的 requires_conf 并集（死变量声明证据）
  local dead_decl="" frag
  for frag in "$paradigm_dir"/assets/framework-gates/*.sh; do
    [[ -f "$frag" ]] || continue
    fw_id="$(basename "$frag" .sh)"
    case "$injected_ids" in *" $fw_id "*) continue;; esac
    dead_decl="$dead_decl $(sed -n 's/^# ruleset:.*requires_conf: *//p' "$frag" | tr -s ' ')"
  done
  [[ -z "$dead_decl" ]] && return 0
  # 3. 逐 conf 变量判定死变量（①②③）
  local v dead_vars="" referenced script
  while IFS= read -r v; do
    [[ -z "$v" ]] && continue
    case " $active " in *" $v "*) continue;; esac
    case " $dead_decl " in *" $v "*) ;; *) continue;; esac
    referenced=0
    for script in "$sh" "$skill_dir/scripts/gates-strict.sh" "$skill_dir/scripts/gates-warn.sh" "$skill_dir/scripts/gates-advisory.sh"; do
      [[ -f "$script" ]] || continue
      # 词边界匹配（保守）：${VAR} / ${#VAR[@]} / ${VAR[@]} / 裸 $VAR / 注释提及全算被引用。
      # 回归测试教训：精确匹配 "${VAR}" 会漏 ${VAR[@]}/$ {#VAR[@]} 形式，误把
      # SQL_INJECTION_WHITELIST 等通用白名单判死（注释提及也是"被需要"证据，宁保勿杀）。
      if grep -qE "(^|[^A-Za-z0-9_])${v}([^A-Za-z0-9_]|$)" "$script" 2>/dev/null; then
        referenced=1; break
      fi
    done
    [[ "$referenced" -eq 1 ]] && continue
    dead_vars="$dead_vars $v"
  done < <(grep -hoE '^[A-Z_][A-Z0-9_]+=' "$conf" "$arch_conf" 2>/dev/null | tr -d '=' | sort -u)
  [[ -z "${dead_vars// /}" ]] && return 0
  # 4. 原位注释（awk 幂等编辑，mktemp+cat 仓库既有范式）
  local target cf_tmp
  for target in "$arch_conf" "$conf"; do
    [[ -f "$target" ]] || continue
    cf_tmp="$(mktemp "${TMPDIR:-/tmp}/swarm-yuan.XXXXXX")"
    awk -v vars="$dead_vars" '
      BEGIN { n = split(vars, arr, " "); for (i = 1; i <= n; i++) if (arr[i] != "") dead[arr[i]] = 1 }
      { name = $0; sub(/=.*/, "", name); if (dead[name] == 1 && /^[A-Z_][A-Z0-9_]*=/) print "# deprecated（框架已移出 ACTIVE_FRAMEWORKS，可恢复）" $0; else print }
    ' "$target" > "$cf_tmp"
    cat "$cf_tmp" > "$target" && rm -f "$cf_tmp"
  done
  echo "⚠ sync_framework_vars：注释死变量（${dead_vars} ）——只被未注入框架需要；恢复请解开对应行的 # deprecated 注释"
}

# trace_tool 辅助函数（全链路追踪——设计理念 2，generate-skill 侧）
# 定义在 inject_frameworks 之前，确保 --inject-frameworks 独立拦截分支也能调用。
# trace-log.sh 路径：脚本所在目录的 ../assets/trace-log.sh
_TRACE_LOG_SH="$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)/assets/trace-log.sh"
trace_tool() {  # $1=操作(create/inject/verify/upgrade) $2=说明
  [[ -f "$_TRACE_LOG_SH" ]] || return 0
  bash "$_TRACE_LOG_SH" --node "生成" --actor "generate-skill" --tool "$1" --status started --note "$2" >&2 2>/dev/null || true
}

# ============================================================
# R128：inject_frameworks 行为保持式拆分——冲突检测/快照/conf 读取迁移写回/区块构建/
# awk 替换/conf 补占位/知识骨架/哈希记账各自成子函数，编排器只做流程串联与失败裁决。
# 文案/退出码/全局副作用（ACTIVE_FRAMEWORKS、MIGRATION_HAPPENED）与拆分前逐字一致。
# 子函数前置定义：--inject-frameworks 在文件中段拦截即 exit（R126 同型教训）。
# ============================================================
# 冲突检测：若 .swarm-yuan-version 已记 framework_gates_sha，且现有区块哈希不符 → 裁决
_inj_conflict_check() {  # $1=precheck.sh $2=.swarm-yuan-version → rc 0=继续 2=手改嫌疑中止
  local sh="$1" ver="$2"
  [[ -f "$ver" ]] || return 0
  local old_sha; old_sha=$(grep '^framework_gates_sha=' "$ver" 2>/dev/null | cut -d= -f2- || true)
  [[ -n "$old_sha" ]] || return 0
  local cur_sha; cur_sha=$(sed -n '/^# >>> swarm-yuan:framework-gates >>>/,/^# <<< swarm-yuan:framework-gates <<</p' "$sh" 2>/dev/null | cksum | awk '{print $1}')
  # 空区块（只有标记行）的 cksum 作为"未注入"基准；与 old_sha 不符即手改嫌疑
  if [[ "$cur_sha" != "$old_sha" && -n "$cur_sha" ]]; then
    echo "⚠ precheck.sh 框架门禁区块被手改（记录 sha=${old_sha}，当前 sha=${cur_sha}）"
    echo "  须用户裁决：覆盖（继续注入会丢失手改）或保留（中止）。中止。"
    return 2
  fi
  return 0
}

# F4（dsh 吸收·注入前快照，配对逆的根基）：任何落盘修改之前备份 $sh + conf 生成期必读文件到
# .swarm-yuan/effects/<UTC时间戳>/，保留最近 1 份（更旧的清理）——--rollback-frameworks
# 据此整体撤销本次注入效果（对齐 cordis "注册即效果、卸载可 unwind"；此前此路径无备份
# 注释自认不可恢复）。
_inj_snapshot() {  # $1=skill_dir $2=precheck.sh $3=主 conf
  local skill_dir="$1" sh="$2" conf="$3"
  local _fx_ts _fx_dir _fx_old
  _fx_ts="$(date -u +%Y%m%dT%H%M%SZ 2>/dev/null || date +%Y%m%dT%H%M%SZ)"
  _fx_dir="$skill_dir/.swarm-yuan/effects/$_fx_ts"
  mkdir -p "$_fx_dir"
  cp "$sh" "$_fx_dir/precheck.sh"
  cp "$conf" "$_fx_dir/precheck.conf"
  [[ -f "$skill_dir/scripts/precheck.arch.conf" ]] && cp "$skill_dir/scripts/precheck.arch.conf" "$_fx_dir/"
  [[ -f "$skill_dir/scripts/precheck.compliance.conf" ]] && cp "$skill_dir/scripts/precheck.compliance.conf" "$_fx_dir/"
  for _fx_old in "$skill_dir"/.swarm-yuan/effects/*/; do
    [[ -d "$_fx_old" ]] || continue
    [[ "$_fx_old" == "$_fx_dir/" ]] && continue
    rm -rf "$_fx_old"
  done
}

# 读取 ACTIVE_FRAMEWORKS（conf 可能含字面 ${} 如 SQL_INJECTION_WHITELIST，set -u 下会 unbound；
# 在函数内临时关闭 set -u 做 source，读完立即恢复）。写全局 ACTIVE_FRAMEWORKS。
_inj_load_active_frameworks() {  # $1=conf 路径（副作用：全局 ACTIVE_FRAMEWORKS）
  local conf="$1"
  ACTIVE_FRAMEWORKS=()
  set +u
  # shellcheck disable=SC1090
  # WP-R Bug#2: . "$conf" 末条语句可能返回非零（[[ -f ]] && source 兄弟 conf 不存在时返回 1），
  # set -e 下会使 inject_frameworks 退出。|| true 兜底（对齐 L827 既有范式）。
  . "$conf" || true
  set -u
}

# 迁移已发生后把迁移后的 ACTIVE_FRAMEWORKS 写回 conf（运行时 check_framework 遍历 conf 的
# ACTIVE_FRAMEWORKS，不写回会导致旧 id 仍触发"无门禁实现"fail）。用 sed 替换 ACTIVE_FRAMEWORKS=
# 行，三平台兼容（mktemp+mv）。
_inj_writeback_migrated_af() {  # $1=主 conf $2=arch conf（读全局 ACTIVE_FRAMEWORKS）
  local conf="$1" arch_conf="$2"
  local new_af_line="ACTIVE_FRAMEWORKS=("
  local first=1 fw
  for fw in "${ACTIVE_FRAMEWORKS[@]+"${ACTIVE_FRAMEWORKS[@]}"}"; do
    [[ "$first" -eq 1 ]] && first=0 || new_af_line="$new_af_line "
    new_af_line="${new_af_line}\"$fw\""
  done
  new_af_line="${new_af_line})"
  local conf_tmp; conf_tmp="$(mktemp /tmp/fwconf.XXXXXX)"
  # R126-HIGH2：写回目标 = ACTIVE_FRAMEWORKS= 行实际所在文件。旧实现恒写主 conf（$conf），
  # 而 standard/compliance 物理三分后该行只在 precheck.arch.conf（主 conf 模板无此行）
  # → awk 无行可替换、迁移结果静默丢失，却打印"已更新"成功（lite 档 arch.conf 缺失回落
  # 主 conf，恰好不受影响）。目标选择：主 conf 有行→主 conf；否则 arch.conf 有行→arch.conf；
  # 都无行（异常形态）→追加到框架变量归置文件 arch.conf。
  local write_target
  if grep -q '^ACTIVE_FRAMEWORKS=' "$conf" 2>/dev/null; then
    write_target="$conf"
  else
    write_target="$arch_conf"
  fi
  if grep -q '^ACTIVE_FRAMEWORKS=' "$write_target" 2>/dev/null; then
    # 替换首个 ACTIVE_FRAMEWORKS= 开头的行（用户可能在该行有注释，迁移后注释丢弃——可接受，因迁移是范式主动行为）
    awk -v line="$new_af_line" '/^ACTIVE_FRAMEWORKS=/{print line; next} {print}' "$write_target" > "$conf_tmp"
    cat "$conf_tmp" > "$write_target"
  else
    printf '\n%s\n' "$new_af_line" >> "$write_target"
  fi
  rm -f "$conf_tmp"
  echo "  ✓ ${write_target##*/} 的 ACTIVE_FRAMEWORKS 已更新为迁移后列表：${new_af_line#ACTIVE_FRAMEWORKS=}"
}

# 构建新区块 + 校验 requires_conf：逐激活框架拼接门禁片段到 $2 区块文件，
# stdout 输出缺失（且非已填非空）的 conf 变量名清单——供占位注入段与效果记账消费。
_inj_build_block() {  # $1=paradigm_dir $2=区块临时文件 $3=主 conf $4=arch conf（读全局 ACTIVE_FRAMEWORKS）
  local paradigm_dir="$1" block="$2" conf="$3" arch_conf="$4"
  local missing_conf=()
  echo '# >>> swarm-yuan:framework-gates >>> （由 generate-skill.sh --inject-frameworks 维护，勿手改）' > "$block"
  local fw frag req var _vc_line
  for fw in "${ACTIVE_FRAMEWORKS[@]}"; do
    frag="$paradigm_dir/assets/framework-gates/$fw.sh"
    if [[ -f "$frag" ]]; then
      cat "$frag" >> "$block"
      # 解析 requires_conf（兼容行内多空格/无声明）
      req=$(sed -n 's/^# ruleset:.*requires_conf: *//p' "$frag" | tr -s ' ')
      for var in $req; do
        # 变量可能定义在主 conf 或 arch conf（物理三分），两处都查
        # R106-D12：行存在但值为空（()/""）不再视为"已配置"——与 mark-active"空=未填"
        # 语义对齐。原实现只查行存在：静态模板自带空行的框架（react/vite/vitest 等）永远
        # 等不到 TODO 占位行，交接清单"按 TODO(framework-gates) 标记行填"照办必漏、
        # mark-active 必拦。空行进 missing_conf，由下方写入段就地打标记。
        _vc_line=$( { grep -h "^${var}=" "$conf" 2>/dev/null; [[ "$arch_conf" != "$conf" ]] && grep -h "^${var}=" "$arch_conf" 2>/dev/null; } | head -1 || true)
        if [[ -n "${_vc_line}" && "${_vc_line}" != *"()"* && "${_vc_line}" != *'=""'* && "${_vc_line}" != *"=() "* && "${_vc_line}" != *='""'* ]]; then
          continue  # 行存在且非空——真已配置
        fi
        missing_conf+=("$var")
      done
    fi
  done
  # 回归发现#9（2026-08-27 四栈回归）：注入只负责"缺失补占位"，但骨架期框架变量行零存在
  # （懒生成移除空占位）→ AI/用户想预填无处落笔（sed 锚定不存在行=无操作，注入又懒补 ()）。
  # 此处补"已填非空值保留"——若变量行存在但值非空（非 ()），视为已配置，从 missing_conf 移除；
  # 仅当行不存在或值为空 () 时才懒补占位。这样 inject 幂等可重跑，不覆盖 AI 填充结果。
  if [[ ${#missing_conf[@]} -gt 0 ]]; then
    local _kept=() _mv _mline
    for _mv in "${missing_conf[@]}"; do
      # 查两 conf 里该变量的当前值；非空（非 () 非 ""）则保留
      _mline=$( { grep -h "^${_mv}=" "$arch_conf" 2>/dev/null; [[ "$arch_conf" != "$conf" ]] && grep -h "^${_mv}=" "$conf" 2>/dev/null; } | head -1 || true)
      if [[ -n "$_mline" && "$_mline" != *"()"* && "$_mline" != *'=""'* && "$_mline" != *"=() "* ]]; then
        continue  # 已填非空值——保留，不补占位
      fi
      _kept+=("$_mv")
    done
    missing_conf=("${_kept[@]+"${_kept[@]}"}")
  fi
  echo '# <<< swarm-yuan:framework-gates <<<' >> "$block"
  [[ ${#missing_conf[@]} -eq 0 ]] && return 0
  for var in "${missing_conf[@]}"; do printf '%s\n' "$var"; done
}

# 未覆盖框架清单（无对应门禁片段文件的激活框架 id）
_inj_uncovered() {  # $1=paradigm_dir（读全局 ACTIVE_FRAMEWORKS）→ stdout 逐行未覆盖 id
  local paradigm_dir="$1" fw
  for fw in "${ACTIVE_FRAMEWORKS[@]}"; do
    [[ -f "$paradigm_dir/assets/framework-gates/$fw.sh" ]] || printf '%s\n' "$fw"
  done
}

# 幂等替换标记区块（awk 三平台兼容）。失败关闭（fail-closed）：开标记存在但闭标记缺失时，
# awk 的 skip 会一直为 1 直到 EOF，把区块之后的全部内容（公共库 _fw_resolve_globs/_fw_report、
# main case 分发，约 150 行）静默删除，且 --inject-frameworks 路径不备份（仅 --upgrade 备份）
# → 不可恢复。故必须先校验闭标记存在。
_inj_replace_region() {  # $1=precheck.sh $2=区块文件 → rc 0=已替换/插入 1=无法安全注入（已报错）
  local sh="$1" block="$2"
  local tmp; tmp="$(mktemp /tmp/fwprecheck.XXXXXX)"
  if grep -q '^# >>> swarm-yuan:framework-gates >>>' "$sh"; then
    if ! grep -q '^# <<< swarm-yuan:framework-gates <<<' "$sh"; then
      rm -f "$tmp" "$block"
      echo "✗ $sh 含开标记 '# >>> swarm-yuan:framework-gates >>>' 但缺闭标记 '# <<< ... <<<'。" >&2
      echo "  为避免静默删除区块之后的公共库/main 分发，已中止注入（未改动 ${sh}）。" >&2
      echo "  请补全闭标记 '# <<< swarm-yuan:framework-gates <<<' 后重跑。" >&2
      return 1
    fi
    awk -v blockfile="$block" '
      /^# >>> swarm-yuan:framework-gates >>>/ { while ((getline l < blockfile) > 0) print l; skip=1; next }
      /^# <<< swarm-yuan:framework-gates <<</ { skip=0; next }
      !skip { print }
    ' "$sh" > "$tmp"
  elif grep -q '^case "\$MODE" in' "$sh"; then  # shellcheck disable=SC2016
    # 无标记区块：追加到文件末尾会落在 main case/exit 之后，注入的函数永不被定义。
    # 改为插入 main case（case "$MODE" in）之前，保证函数先定义后被调用。
    awk -v blockfile="$block" '
      /^case "\$MODE" in/ && !inserted {
        print ""
        while ((getline l < blockfile) > 0) print l
        print ""
        inserted=1
      }
      { print }
    ' "$sh" > "$tmp"
    echo "⚠ $sh 中无标记区块，已插入 main case 之前（建议人工在 check_framework 之后补标记区块）"
  else
    rm -f "$tmp" "$block"
    echo "✗ $sh 既无标记区块也无 main case（case \"\$MODE\" in），无法安全注入" >&2
    echo "  须人工在 check_framework 函数之后加入标记区块：" >&2
    echo "    # >>> swarm-yuan:framework-gates >>>" >&2
    echo "    # <<< swarm-yuan:framework-gates <<<" >&2
    return 1
  fi
  cat "$tmp" > "$sh"
  rm -f "$tmp" "$block"
  return 0
}

# 缺失 conf 变量：注入占位 + warn（不静默）——落 arch conf（框架变量组）
# R106-D12：行已存在但为空时不再追加重复行——就地给该行追加 TODO(framework-gates)
# 标记（幂等：已带标记不再打），交接清单"按标记行填"即可覆盖全部激活框架；
# 行不存在才追加新占位行（原行为）。
_inj_mark_conf_todos() {  # $1=arch conf $2=主 conf；$3..=缺失变量名清单
  local arch_conf="$1" conf="$2"
  shift 2
  local var _mt_file _ack_line
  for var in "$@"; do
    if grep -q "^${var}=.*TODO(" "$arch_conf" 2>/dev/null || \
       { [[ -f "$conf" ]] && grep -q "^${var}=.*TODO(" "$conf" 2>/dev/null; }; then
      continue  # 已带（任一类）标记——幂等跳过（R109-D9 跨类感知）
    fi
    _ack_line="$( { grep -h "^${var}=" "$arch_conf" 2>/dev/null; [[ -f "$conf" ]] && grep -h "^${var}=" "$conf" 2>/dev/null; } | head -1 || true)"
    if [[ -n "${_ack_line}" ]] && _user_acknowledged_empty "${_ack_line}"; then
      continue  # R109-D9：空值但带用户 N/A 说明注释——已审配置，不打标记
    fi
    _mt_file=""
    if grep -q "^${var}=" "$arch_conf" 2>/dev/null; then
      _mt_file="$arch_conf"
    elif [[ -f "$conf" ]] && grep -q "^${var}=" "$conf" 2>/dev/null; then
      _mt_file="$conf"
    fi
    if [[ -n "${_mt_file}" ]]; then
      sed -i.bak -E "s|^(${var}=.*)$|\1  # TODO(framework-gates): 激活框架变量（R106-D12 空值行就地标记），由生成流程 Step 4 框架深化门禁注入填充|" "${_mt_file}" && rm -f "${_mt_file}.bak"
      echo "⚠ conf 变量 ${var} 存在但为空，已就地打 TODO(framework-gates) 标记（须填充）"
    else
      printf '%s=()  # TODO(framework-gates): 由生成流程 Step 4 框架深化门禁注入填充\n' "${var}" >> "$arch_conf"
      echo "⚠ conf 缺失变量 ${var}，已注入占位（须填充）"
    fi
  done
}

# framework-knowledge.md 骨架（DESIGN §4.1 声称的自动产出；audit-2026-08-25 落地——
# 此前该文件完全依赖 AI 从零手写）。已存在不覆盖（AI 可能已实例化）；按 ACTIVE_FRAMEWORKS
# 逐框架生成节，规律行数=该框架规则文件声明的"深度门槛"（自动节点只出骨架，实例化是 AI 审的活）。
_inj_write_knowledge() {  # $1=skill_dir $2=paradigm_dir（读全局 ACTIVE_FRAMEWORKS）
  local skill_dir="$1" paradigm_dir="$2"
  local fk="$skill_dir/references/framework-knowledge.md"
  if [[ ! -f "$fk" && ${#ACTIVE_FRAMEWORKS[@]} -gt 0 ]]; then
    mkdir -p "$(dirname "$fk")" 2>/dev/null || true
    {
      echo "# 框架知识库（--inject-frameworks 生成骨架；AI 按 references/frameworks/<fw>.md §3 实例化）"
      echo ""
      echo "> 每框架一节：规律数 ≥ 该框架「深度门槛」，每条必须含「证据：」字段（本项目源码证据，非通用常识）。"
      local fw _th _i
      for fw in ${ACTIVE_FRAMEWORKS[@]+"${ACTIVE_FRAMEWORKS[@]}"}; do
        _th=$(grep -m1 '^深度门槛:' "$paradigm_dir/references/frameworks/${fw}.md" 2>/dev/null | sed 's/^深度门槛:[[:space:]]*//; s/[^0-9].*$//')
        _th="${_th:-5}"
        echo ""
        echo "## ${fw}（规律 ≥ ${_th} 条，每条含「证据：」）"
        for ((_i=1; _i<=_th; _i++)); do
          echo "- 规律 ${_i}：待填充（证据：待填充）"
        done
      done
    } > "$fk"       && echo "✓ framework-knowledge.md 骨架已生成（${#ACTIVE_FRAMEWORKS[@]} 框架；待 AI 实例化）"       || echo "⚠ framework-knowledge.md 骨架写入失败（references/ 不可写；不阻塞注入）" >&2
  fi
}

# 记录区块哈希 + 效果 ledger（更新而非追加；首次注入则新建 ver）
# F4（dsh 吸收·效果记账）：framework_gates_effects 显式记录本次注入动了什么
# （conf_add=追加的占位变量清单）——--rollback-frameworks 据此+快照整体撤销。
_inj_record_ledger() {  # $1=.swarm-yuan-version $2=precheck.sh；$3..=本次补占位变量清单
  local ver="$1" sh="$2"
  shift 2
  local sha _fx_ledger=""
  sha=$(sed -n '/^# >>> swarm-yuan:framework-gates >>>/,/^# <<< swarm-yuan:framework-gates <<</p' "$sh" | cksum | awk '{print $1}')
  if [[ $# -gt 0 ]]; then
    local _fx_u="" _fx_v
    for _fx_v in "$@"; do
      case " $_fx_u " in *" $_fx_v "*) continue;; esac
      _fx_u="$_fx_u $_fx_v"
    done
    _fx_ledger="conf_add:${_fx_u# }"
  fi
  touch "$ver"
  # 移除旧字段，再追加新值（幂等更新；分组确保 .tmp 始终被清理）
  grep -Ev '^framework_gates_(injected_at|sha|effects)=' "$ver" > "${ver}.tmp" 2>/dev/null || true
  { mv "${ver}.tmp" "$ver" 2>/dev/null || cp "${ver}.tmp" "$ver"; }
  rm -f "${ver}.tmp"
  {
    echo "framework_gates_injected_at=$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date +%Y-%m-%dT%H:%M:%SZ)"
    echo "framework_gates_sha=${sha}"
    [[ -n "$_fx_ledger" ]] && echo "framework_gates_effects=${_fx_ledger}"
  } >> "$ver"
}

inject_frameworks() {

  # 职责分解（R128 拆分后各段单一实现，编排器只串联）：
  #   ① 冲突检测（_inj_conflict_check）+ 注入前快照（_inj_snapshot）
  #   ② 读 conf 提取 ACTIVE_FRAMEWORKS（_inj_load_active_frameworks）+ 旧 id 迁移写回
  #     （migrate_merged_frameworks / _inj_writeback_migrated_af）
  #   ③ 构建新区块并校验 requires_conf（_inj_build_block / _inj_uncovered）+ 幂等替换
  #     标记区块（_inj_replace_region）+ 缺失 conf 变量补占位（_inj_mark_conf_todos）
  #   ④ framework-knowledge.md 骨架（_inj_write_knowledge）+ 哈希/效果记账
  #     （_inj_record_ledger）+ 死变量回收（sync_framework_vars）
  local skill_dir="$1"
  trace_tool "inject-frameworks" "$skill_dir"
  local paradigm_dir; paradigm_dir="$(cd "$(dirname "$0")/.." && pwd)"
  local sh="$skill_dir/scripts/precheck.sh"
  local conf="$skill_dir/scripts/precheck.conf"
  local ver="$skill_dir/.swarm-yuan-version"
  [[ -f "$sh" ]]  || { echo "✗ 未找到 $sh"; return 1; }
  [[ -f "$conf" ]] || { echo "✗ 未找到 $conf"; return 1; }
  # 框架变量属 arch 组——缺失判定与补占位落 precheck.arch.conf（旧版 skill 无此文件则回落主 conf）
  local arch_conf="$skill_dir/scripts/precheck.arch.conf"
  [[ -f "$arch_conf" ]] || arch_conf="$conf"

  if ! _inj_conflict_check "$sh" "$ver"; then
    return 2   # 区块被手改——须用户裁决，中止
  fi
  _inj_snapshot "$skill_dir" "$sh" "$conf"

  _inj_load_active_frameworks "$conf"
  if [[ ${#ACTIVE_FRAMEWORKS[@]} -eq 0 ]]; then
    echo "⚠ ACTIVE_FRAMEWORKS 未配置，跳过门禁注入"
    return 0
  fi

  # 迁移已合并的旧框架 id 到母框架（缺口 B 合并产物：pinia→vue / socketio→koa / vitest→jest-vitest）
  migrate_merged_frameworks
  if [[ "$MIGRATION_HAPPENED" == "1" ]]; then
    _inj_writeback_migrated_af "$conf" "$arch_conf"
  fi

  # 1) 构建新区块（missing 变量清单走 stdout；变量名无空白，命令替换分词安全）
  local block; block="$(mktemp /tmp/fwblock.XXXXXX)"
  local missing_conf=() fw
  missing_conf=( $(_inj_build_block "$paradigm_dir" "$block" "$conf" "$arch_conf") )
  # 2) 幂等替换标记区块（awk 三平台兼容）
  if ! _inj_replace_region "$sh" "$block"; then
    return 1   # 无闭标记/无锚点——已中止并报错
  fi
  # 3) 缺失 conf 变量：注入占位 + warn（不静默）
  _inj_mark_conf_todos "$arch_conf" "$conf" ${missing_conf[@]+"${missing_conf[@]}"}
  # 4) 未覆盖框架：warn 列出（不静默跳过；框架 id 无空白，命令替换分词安全）
  for fw in $(_inj_uncovered "$paradigm_dir"); do
    echo "⚠ 框架 '${fw}' 无对应门禁片段（assets/framework-gates/${fw}.sh 缺失）——列入未覆盖清单"
  done
  # 4.5) framework-knowledge.md 骨架
  _inj_write_knowledge "$skill_dir" "$paradigm_dir"
  # 5) 记录区块哈希 + 效果 ledger（更新而非追加；首次注入则新建 ver）
  _inj_record_ledger "$ver" "$sh" ${missing_conf[@]+"${missing_conf[@]}"}
  # F1（dsh 吸收）：注入重建后同步 conf——回收移出 ACTIVE_FRAMEWORKS 的死变量
  sync_framework_vars "$skill_dir"
  # 区块 sha 由 _inj_record_ledger 落账，此处复算一次仅用于完成提示（与拆分前口径一致）
  local sha
  sha=$(sed -n '/^# >>> swarm-yuan:framework-gates >>>/,/^# <<< swarm-yuan:framework-gates <<</p' "$sh" | cksum | awk '{print $1}')
  echo "✓ 门禁片段注入完成（${#ACTIVE_FRAMEWORKS[@]} 个框架，区块 sha=${sha}）"
}

# F4（dsh 吸收·可逆效应补全）：整体撤销最近一次 --inject-frameworks 的效果。
# 依据：.swarm-yuan/effects/<ts>/ 快照（注入前原态）恢复 precheck.sh + conf 生成期必读文件，
# 并清 .swarm-yuan-version 的 framework_gates_* 记账。对齐 cordis "卸载即 unwind"
# （论文 Def 23：set 之逆 unset）——此前注入路径无备份、不可恢复。
rollback_frameworks() {
  local skill_dir="$1"
  local fx_root="$skill_dir/.swarm-yuan/effects"
  local ver="$skill_dir/.swarm-yuan-version"
  # 取最新一份快照（目录名=UTC 时间戳，字典序即时间序）
  local latest="" d
  for d in "$fx_root"/*/; do
    [[ -d "$d" ]] || continue
    latest="$d"
  done
  if [[ -z "$latest" || ! -f "$latest/precheck.sh" ]]; then
    echo "✗ 未找到注入前快照（$fx_root/*/precheck.sh）——无法回滚" >&2
    echo "  快照由 --inject-frameworks 自动创建（保留最近 1 份）" >&2
    return 1
  fi
  echo "=== 回滚注入效果（快照: ${latest} ）==="
  local f name
  for f in precheck.sh precheck.conf precheck.arch.conf precheck.compliance.conf; do
    [[ -f "$latest/$f" ]] || continue
    cp "$latest/$f" "$skill_dir/scripts/$f"
    echo "  ✓ 已恢复 scripts/$f"
  done
  # R126：注入顺带生成的 framework-knowledge.md 骨架随回滚撤销（与「整体撤销本次注入
  # 效果」承诺对齐，旧版残留）。仅当仍是未实例化骨架（头注记在 + 全部规律行仍是
  # 「待填充」形态）才删；AI 已实例化的内容保留并显式提示（防误删劳动成果）。
  local fk="$skill_dir/references/framework-knowledge.md"
  if [[ -f "$fk" ]] && grep -q '^# 框架知识库（--inject-frameworks 生成骨架' "$fk" 2>/dev/null; then
    if ! grep -Ev '^#|^>|^$|^- 规律 [0-9]+：待填充（证据：待填充）|^## ' "$fk" 2>/dev/null | grep -q .; then
      rm -f "$fk" && echo "  ✓ 已撤销 framework-knowledge.md 骨架（未实例化）"
    else
      echo "  ⓘ framework-knowledge.md 已有实例化内容，保留（如需删除请人工确认）"
    fi
  fi
  # 清记账（framework_gates_* 全部字段）
  if [[ -f "$ver" ]]; then
    grep -Ev '^framework_gates_' "$ver" > "${ver}.tmp" 2>/dev/null || true
    { mv "${ver}.tmp" "$ver" 2>/dev/null || cp "${ver}.tmp" "$ver"; }
    rm -f "${ver}.tmp"
    echo "  ✓ 已清除 .swarm-yuan-version 的 framework_gates_* 记账"
  fi
  rm -rf "$latest"
  echo "=== 回滚完成（快照已消费；重注入请跑 --inject-frameworks）==="
}

if [[ "${1:-}" == "--rollback-frameworks" ]]; then
  [[ $# -ge 2 ]] || { echo "Usage: bash generate-skill.sh --rollback-frameworks <skill-dir>"; exit 1; }
  rollback_frameworks "$2"
  exit $?
fi

if [[ "${1:-}" == "--inject-frameworks" ]]; then
  [[ $# -ge 2 ]] || { echo "Usage: bash generate-skill.sh --inject-frameworks <skill-dir> [--remove <fw>]"; exit 1; }
  # F4（dsh 吸收·定向移除）：--remove <fw> 先从 conf 的 ACTIVE_FRAMEWORKS 移除该框架，
  # 再走常规注入（区块重建 + F1 sync 自动回收其死变量）——此前移除框架无路径，只能手改。
  if [[ "${3:-}" == "--remove" && -n "${4:-}" ]]; then
    sd="$2"; rfw="$4"; acf="$sd/scripts/precheck.arch.conf"
    [[ -f "$acf" ]] || acf="$sd/scripts/precheck.conf"
    if grep -q '^ACTIVE_FRAMEWORKS=' "$acf" 2>/dev/null; then
      # 词级重建（兼容带引号/裸词两种风格，输出统一带引号）：剥引号后逐词比较，
      # 命中 fw 的词跳过；空列表/单元素/多元素均正确重组。
      awk -v fw="$rfw" '
        /^ACTIVE_FRAMEWORKS=/ {
          head=$0; sub(/\(.*/, "", head)
          body=$0; sub(/^[^(]*\(/, "", body)
          # R118：先剥行尾注释再剥右括号——旧版把 `)# AUTO:detected` 的 #/AUTO:detected
          # 当成数组成员（--remove 在正常生成物上必坏）。
          sub(/#.*/, "", body); sub(/\)[[:space:]]*$/, "", body)
          n=split(body, w, /[[:space:]]+/); out=""
          for (i=1; i<=n; i++) {
            if (w[i] == "") continue
            t=w[i]; gsub(/"/, "", t)
            if (t == fw) continue
            out = out " \"" t "\""
          }
          print head "(" out ")"; next
        }
        { print }
      ' "$acf" > "$acf.tmp"
      cat "$acf.tmp" > "$acf" && rm -f "$acf.tmp"
      echo "✓ 已从 ACTIVE_FRAMEWORKS 移除 '$rfw'（若原本不在列表则为空操作）"
    else
      echo "⚠ 未找到 ACTIVE_FRAMEWORKS= 行（${acf}），跳过移除"
    fi
  fi
  inject_frameworks "$2"
  exit $?
fi

# ============================================================
# --verify-completeness 子命令（独立于 create/upgrade，单独拦截）
# 用法: bash generate-skill.sh --verify-completeness <skill-dir>
# 无占位符机器执法：扫描目标 skill 的 SKILL.md / references/*.md /
# scripts/precheck.conf / hooks/hooks.json（存在才查），命中占位符模式
# 或未勾 checkbox（- [ ]）则打印 file:line 清单并 exit 1；零命中 exit 0。
# 调用追踪机器执法（设计理念 2）：references/workflow.md 每个节点段
# （## 节点… 标题起）须含「调用追踪」要素，缺则列 file:line 并 exit 1。
# ============================================================
# R126：_vc_proj_root 与 _detect_delivery_shapes 前置到子命令分发点之前定义——
# 旧版 _detect_delivery_shapes 定义在文件后段（create 流），--verify-completeness/
# --mark-active 在中段拦截即 exit，函数与 _DELIVERY_SHAPES 变量对该路径不可见，
# 「交付形态 DoD 在位性」执法自 2026-10-11 落地起从未触发（死代码）。前置后
# verify_completeness 就地懒计算（按技能 conf 推导项目根），create 流调用点不变。
_vc_proj_root() {  # $1=skill_dir → stdout 项目根（①环境 PROJECT_DIR ②技能 conf ③旧布局推导；空=未知）
  local _sd="$1" _pr
  _pr="${PROJECT_DIR:-}"
  if [[ -z "$_pr" && -f "$_sd/scripts/precheck.conf" ]]; then
    # 剥法（cut 去 # 尾注 + 去尾空格 + 去引号）——conf 行带 `# AUTO:detected`
    # 溯源注释是 conf-render 固定形态，不剥则路径拼接失明。
    # 顺序铁律：尾空格先于闭引号剥（值与注释之间的对齐空格会使 s/"$// 失配、
    # 引号残留在路径尾 → 回退失明）。
    _pr=$(grep -m1 '^PROJECT_DIR=' "$_sd/scripts/precheck.conf" 2>/dev/null \
      | cut -d'#' -f1 | sed 's/^PROJECT_DIR=//;s/[[:space:]]*$//;s/^"//;s/"$//' || true)
    # 占位符形态（draft 未回填 <项目根绝对路径>）不当真值消费（同判据）
    case "$_pr" in "<"*">") _pr="" ;; esac
  fi
  if [[ -z "$_pr" ]]; then
    _pr="$(cd "$_sd/../../.." 2>/dev/null && pwd)"
  fi
  printf '%s' "$_pr"
}

# ── 交付形态嗅探（2026-10-11 平台根治：交付六型 DoD 盖章，run14 教训——单测全绿≠可运行）──
# 形态标记与每型运行证据的正本=Swarm Studio custom/server/delivery-contract；此处仅嗅探呈现，AI 核正后写入 DoD。
_detect_delivery_shapes() {
  local d="$1" out=""
  # R126：mini-program 嗅探补 maxdepth 3 与排除链（旧版全树 find 不排 node_modules/.git，
  # 大仓 create/verify 时此嗅探成主要耗时点；对齐下方各判据既有限深约定）
  if find "$d" -maxdepth 3 \( -name '*.wxml' -o -name '*.axml' -o -name 'project.config.json' -o -name 'mini.project.json' \) \
      -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | grep -q .; then
    out="mini-program（运行证据=真开发者工具 runtime-proof：编译+启动+首帧，launchOk/screenshot/checkedAt）"
  fi
  if find "$d" -maxdepth 3 \( -name 'vite.config.*' -o -name 'next.config.*' -o -name 'index.html' \) -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | grep -q .; then
    out="${out:+${out}；}web-frontend（运行证据=真实浏览器走查帧）"
  fi
  # backend-service 判据（R106-D9 扩容：原 Dockerfile/src/server* 偏 JS——Go/Django/JVM 后端全漏，
  # go-forge 回归实证 13 条 REST 路由只因 internal/ 布局嗅不出形态）。任一命中即计一次（去重防拼接）。
  local _be_svc=0
  if find "$d" -maxdepth 3 \( -name 'Dockerfile' -o -path '*/src/server*' \) -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | grep -q .; then
    _be_svc=1
  fi
  if [[ "$_be_svc" -eq 0 ]] && find "$d" -maxdepth 3 -name 'go.mod' -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | grep -q . && \
     { find "$d" -maxdepth 3 \( -name 'main.go' -o -name 'cmd' \) -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | grep -q .; }; then
    _be_svc=1
  fi
  if [[ "$_be_svc" -eq 0 ]] && find "$d" -maxdepth 3 -name 'manage.py' -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | grep -q .; then
    _be_svc=1
  fi
  if [[ "$_be_svc" -eq 0 ]] && find "$d" -maxdepth 2 \( -name 'pom.xml' -o -name 'build.gradle' -o -name 'build.gradle.kts' \) -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | grep -q .; then
    _be_svc=1
  fi
  # R108-D1：Cargo.toml 是 Rust 服务的工程清单（同 go.mod/manage.py 家族）——原判据缺位，
  # rust-forge 回归实证 axum 后端 5 条 REST 路由只嗅出 web-frontend、backend-service 全漏
  # （⑥/⑨ 节点缺启动冒烟 DoD 要求）。maxdepth 3 对齐 go.mod（含 workspace 子 crate 布局）。
  if [[ "$_be_svc" -eq 0 ]] && find "$d" -maxdepth 3 -name 'Cargo.toml' -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | grep -q .; then
    _be_svc=1
  fi
  if [[ "$_be_svc" -eq 1 ]]; then
    out="${out:+${out}；}backend-service（运行证据=启动冒烟日志+跨模块契约测试）"
  fi
  if find "$d" -maxdepth 3 \( -path '*android/app/build.gradle*' -o -name 'project.pbxproj' \) -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | grep -q .; then
    out="${out:+${out}；}mobile-app（运行证据=模拟器/真机安装启动）"
  fi
  echo "${out:-未嗅探到运行面形态（governance-doc/library-sdk 类由 AI 按任务判定并在 DoD 声明证据面）}"
}

# ============================================================
# R128：verify_completeness 行为保持式拆分——六件检查各自成子函数，stdout 返回
# 检查结果（段间不共享局部状态），编排器只做拼装与终局裁决。文案/扫描顺序/退出码
# 与拆分前逐字一致（前后产物 diff 基线见 tests/test-r128-function-size.sh 头注）。
# 子函数必须前置定义：--verify-completeness/--mark-active 在文件中段拦截即 exit，
# 定义在后段对这两个调用面不可见（R126 同型教训）。
# ============================================================
# 收集检查目标（存在才查；空数组在 bash 3.2 + set -u 下须用 ${arr[@]+...} 防空崩）。
# 追加顺序 = grep 扫描顺序（grep 按参数序输出 file:line），不可调换。
_vc_collect_targets() {  # $1=skill_dir → stdout 逐行检查目标（无目标=无输出）
  local skill_dir="$1"
  local targets=() f _uff
  [[ -f "$skill_dir/SKILL.md" ]] && targets+=("$skill_dir/SKILL.md")
  for f in "$skill_dir"/references/*.md; do
    [[ -f "$f" ]] && targets+=("$f")
  done
  [[ -f "$skill_dir/scripts/precheck.conf" ]] && targets+=("$skill_dir/scripts/precheck.conf")
  # WP-R P3-3: precheck.arch.conf 也含 --inject-frameworks 注入的 TODO 占位符,须纳入扫描
  [[ -f "$skill_dir/scripts/precheck.arch.conf" ]] && targets+=("$skill_dir/scripts/precheck.arch.conf")
  # R126-MED9：USER_FILLABLE_FILES 两件（snippets/mcp-tools，模板用「（填入…）」占位风格）
  # 与 compliance conf 此前不在扫描面——完全没填也能过 --mark-active --strict 占位符清零关。
  [[ -f "$skill_dir/scripts/precheck.compliance.conf" ]] && targets+=("$skill_dir/scripts/precheck.compliance.conf")
  for _uff in ${USER_FILLABLE_FILES[@]+"${USER_FILLABLE_FILES[@]}"}; do
    [[ -f "$skill_dir/$_uff" ]] && targets+=("$skill_dir/$_uff")
  done
  [[ -f "$skill_dir/hooks/hooks.json" ]] && targets+=("$skill_dir/hooks/hooks.json")
  # commands/*.md 骨架模板内嵌数字可能漂移（G6），纳入无占位符扫描
  for f in "$skill_dir"/commands/*.md; do
    [[ -f "$f" ]] && targets+=("$f")
  done
  [[ ${#targets[@]} -eq 0 ]] && return 0
  for f in "${targets[@]}"; do printf '%s\n' "$f"; done
}

# P0 占位符扫描：grep -F 固定串多模式（-e 叠加），三平台兼容；输出 file:line:内容 清单。
# 占位符四模式（骨架未填充痕迹）：待填充/（待填充）/<占位符>/填充指引
# WP-Q4 P0/P1 分级机器化：占位符所在行含「P1 待补」或「P1待补」→ 归 P1；否则归 P0。
_vc_scan_placeholders() {  # $@=目标文件 → stdout P0 占位符命中清单
  local p0_hits
  # R126-MED9：占位符四模式补「（填入」——USER_FILLABLE_FILES 模板（snippets/mcp-tools）
  # 的占位风格是「# （填入项目实际的…）」，四词族此前全不命中。
  p0_hits=$(grep -Fn -e '待填充' -e '（待填充）' -e '<占位符>' -e '填充指引' -e '（填入' \
    "$@" 2>/dev/null | grep -vE 'P1[[:space:]]*待补' || true)
  printf '%s' "$p0_hits"
}

# P1 占位符扫描：四词族命中且行含 P1 标记 + 「（P1 待补）」独立标记兜底合并
# （R66-A1 kb66 演练实证：骨架 emit 的 P1 行不含四词则 p0/p1 双不命中，
#  template-spec「--mark-active 前清零」成空承诺。修：P1 标记独立 grep 兜底合并）。
_vc_scan_p1() {  # $@=目标文件 → stdout P1 占位符命中清单
  local p1_hits
  p1_hits=$(grep -Fn -e '待填充' -e '（待填充）' -e '<占位符>' -e '填充指引' -e '（填入' \
    "$@" 2>/dev/null | grep -E 'P1[[:space:]]*待补' || true)
  if [[ $# -gt 0 ]]; then
    p1_hits=$(printf '%s
%s
' "$p1_hits" "$(grep -Fn -e 'P1 待补' -e '（P1 待补）' "$@" 2>/dev/null || true)" | grep -v '^$' || true)
  fi
  printf '%s' "$p1_hits"
}

# 未勾 checkbox（- [ ]）扫描：仅骨架"填充指引"清单算占位；
# 目标 skill 的"完成检查表/流程完成检查表"段是给使用者运行中勾选的，剔除该段防误伤。
# 实现：对每个目标文件用 awk 标记"检查表段"区间，仅输出段外的 - [ ] 行。
_vc_scan_checkboxes() {  # $@=目标文件 → stdout 未勾 checkbox 命中清单
  local cb_hits="" tf out
  for tf in "$@"; do
    [[ -f "$tf" ]] || continue
    out=$(awk '
      /^#+ .*(检查表|检查清单|自检|审查清单|裁决条款|清单（)/ { intable=1; next }
      /^#+ / { intable=0 }
      # 九轮复盘：排除 ``` 代码块——gsd-patterns.md/cognitive-bias.md 等 UNIVERSAL_FILES
      # 模板里的 ```markdown 示例（破窗清单格式演示）含 - [ ]，是正确的方法论示例，
      # 非待清无占位符。原未排除代码块，导致 --mark-active 永远拒绝（E2E Step ⑧ 死锁）。
      # /^```/ 行首匹配 fence 边界，toggle 翻转；完整配对 fence 正确，
      # 未闭合 fence 把块内全判为 incode（保守不误报，可接受）。
      /^```/ { incode=!incode; next }
      # 真 checkbox 判定：行首（可有缩进）的 "- [ ]"。
      # 反引号引用（`- [ ]`）是方法论说明文字（如 gsd-patterns.md L181/185/187 讲解语法），
      # 非行首 checkbox，不匹配；与上方代码块排除同批修复 E2E Step ⑧ 死锁。
      /^[[:space:]]*- \[ \]/ && !intable && !incode { print FILENAME":"FNR":"$0 }
    ' "$tf" 2>/dev/null || true)
    [[ -n "$out" ]] && cb_hits="${cb_hits}${cb_hits:+
}${out}"
  done
  printf '%s' "$cb_hits"
}

# 调用追踪要素机器执法（理念 2：全链路追踪落实到 workflow 模板）：
# workflow.md 每个「## 节点…」段须含「调用追踪」字样（第 ⑨ 要素）。
# R52 补强：每节点段另须含「方法论引用」字样（第 ⑩ 要素——引用本节点消费的 references 档，
# 与 task-methodology-router §文档路由表消费节点序互为正反；节点级实载分派由本断言守）。
# 骨架阶段（待填充）已被占位符检查拦截；此处针对已填充内容。
# 无节点段（项目裁剪后无 workflow 节点）不查，放行。无 workflow.md 文件亦放行（空输出）。
_vc_check_workflow() {  # $1=skill_dir → stdout 节点要素/交付形态 DoD 缺失清单
  local skill_dir="$1"
  local wf="$skill_dir/references/workflow.md" trace_miss=""
  if [[ -f "$wf" ]]; then
    # 节点段标题判定：标题行含「节点」且含冒号（如「## 节点①：需求理解」）。
    # 不用正则字符类匹配①-⑩/CJK数字——BSD awk 20200816 把多字节字符类按字节解析
    # 导致 [一] 匹配任意 ASCII 字符（已实测）。index() 固定子串匹配对 UTF-8 安全。
    # 交付形态 DoD 在位性（2026-10-11 根治）：嗅探到运行面形态而 workflow 无「交付形态」段=留痕
    # R126 接线：旧版依赖 create 流才赋值的 _DELIVERY_SHAPES——verify/mark-active 路径
    # 该变量恒空，本检查自落地起从未触发；且 trace_miss 紧接着被下方 awk 赋值整体覆盖
    # （双保险双失效）。改为就地懒计算（按技能 conf 推导项目根，_vc_proj_root 单一解析），
    # 结果用追加不用覆盖。
    local _vc_shapes _vc_proj
    _vc_shapes="${_DELIVERY_SHAPES:-}"
    if [[ -z "$_vc_shapes" ]]; then
      _vc_proj=$(_vc_proj_root "$skill_dir")
      [[ -n "$_vc_proj" && -d "$_vc_proj" ]] && _vc_shapes=$(_detect_delivery_shapes "$_vc_proj")
    fi
    if [[ -n "$_vc_shapes" && "$_vc_shapes" != 未嗅探到* ]] && ! grep -q '交付形态' "$wf"; then
      trace_miss="${trace_miss}${trace_miss:+$'\n'}references/workflow.md: 缺交付形态 DoD 段（嗅探到 ${_vc_shapes}——⑤/⑥/⑨ 节点须按形态写运行证据与 RUNTIME-结论行，单测全绿≠可运行）"
    fi
    local _wf_miss
    _wf_miss=$(awk '

      /^## / && index($0, "节点") > 0 && (index($0, "：") > 0 || index($0, ":") > 0) {
        if (node != "" && !has) print FILENAME":"line": 节点段缺追踪要素（R13 4 要素模型：⑥ 产出物与追踪段须含 trace-log.sh 调用）: " node
        if (node != "" && !meth) print FILENAME":"line": 节点段缺方法论引用要素（R52 补强：⑩ 方法论引用须含 references 档，互为正反 task-methodology-router 路由表）: " node
        node=$0; line=FNR; has=0; meth=0; next
      }
      /调用追踪|trace-log\.sh/ { has=1 }
      /方法论引用/ { meth=1 }
      END {
        if (node != "" && !has) print FILENAME":"line": 节点段缺追踪要素（R13 4 要素模型：⑥ 产出物与追踪段须含 trace-log.sh 调用）: " node
        if (node != "" && !meth) print FILENAME":"line": 节点段缺方法论引用要素（R52 补强：⑩ 方法论引用须含 references 档，互为正反 task-methodology-router 路由表）: " node
      }
    ' "$wf" 2>/dev/null || true)
    [[ -n "$_wf_miss" ]] && trace_miss="${trace_miss}${trace_miss:+$'\n'}${_wf_miss}"
  fi
  printf '%s' "$trace_miss"
}

# R21-A：任务配方结构执法——recipes.md 存在（standard/compliance 档骨架）时：
#   ① §A 业务功能清单 / §B 任务配方 两节标题须存在；② 每个「### 配方」段须含五要素
#   （触发场景/前置查询/复用件/胶水/门禁与验证）——填完后丢要素在此被抓，不靠 AI 自觉。
# BSD awk 多字节安全：index() 固定子串匹配（同上 trace_miss 先例，不用字符类正则）。
_vc_check_recipes() {  # $1=skill_dir → stdout recipes 节/五要素缺失清单
  local rcp="$1/references/recipes.md" recipes_miss=""
  if [[ -f "$rcp" ]]; then
    LC_ALL=C grep -q '业务功能清单' "$rcp" 2>/dev/null || recipes_miss="$rcp: 缺 §A 业务功能清单节（既有业务功能实现编目，R21 配方层）"
    LC_ALL=C grep -q '任务配方' "$rcp" 2>/dev/null || recipes_miss="${recipes_miss}${recipes_miss:+
}$rcp: 缺 §B 任务配方节（五要素配方，R21 配方层）"
    local _rcp_out
    _rcp_out=$(LC_ALL=C awk '
      function chk() {
        if (node == "") return
        miss = ""
        if (index(blk, "触发场景") == 0) miss = miss " 触发场景"
        if (index(blk, "前置查询") == 0) miss = miss " 前置查询"
        if (index(blk, "复用件") == 0) miss = miss " 复用件"
        if (index(blk, "胶水") == 0) miss = miss " 胶水"
        if (index(blk, "门禁与验证") == 0) miss = miss " 门禁与验证"
        if (miss != "") print FILENAME":"line": 配方段缺五要素（"miss" ）: " node
      }
      /^## / { chk(); node=""; next }
      /^### / && index($0, "配方") > 0 { chk(); node=$0; line=FNR; blk=""; next }
      /^### / { chk(); node=""; next }
      { if (node != "") blk = blk $0 "\n" }
      END { chk() }
    ' "$rcp" 2>/dev/null || true)
    [[ -n "$_rcp_out" ]] && recipes_miss="${recipes_miss}${recipes_miss:+
}$_rcp_out"
  fi
  printf '%s' "$recipes_miss"
}

# R21-B：dev-guide「开发偏好」固定节存在性核验（整节被删即命中；
# 内容允许"暂无已记录偏好"诚实降级——占位符扫描管填充，此处只管节不丢）。
_vc_check_dev_guide() {  # $1=skill_dir → stdout 固定节缺失行（无缺失=空输出）
  local dg="$1/references/dev-guide.md"
  if [[ -f "$dg" ]] && ! LC_ALL=C grep -q '开发偏好' "$dg" 2>/dev/null; then
    printf '%s' "$dg: 缺「开发偏好」节（R21-B 固定节——开发者实际习惯承接位，无来源写「暂无已记录偏好」）"
  fi
}

# G1：decisions.jsonl 校验 ① 每行 JSON 合法性 ② UserChallenge 行五要素非空（文件不存在不告警——draft 期允许空）
# 决策账本有双账——trace-log --decision 与 SKILL.md
# 填充指引都写项目侧 .swarm-yuan/decisions.jsonl，本核验此前只认技能侧账本，按文档执行即死锁
# （audit-closure 已合并一侧，此处是另一半）。技能侧缺账时回退项目侧/codex 技能侧。
# 自定义 target-dir 形态的决策账本回退：
# 项目根原从 skill_dir 上三级派生（.claude/skills/<name> 布局假设）——自定义 target-dir
# 生成的技能（同级目录布局）上三级不是项目根，回退失明 → --strict 误报
# 「缺少决策记录」死锁。修法对齐 detect-profile-drift.sh:39 同族三级解析：
# ① 环境 PROJECT_DIR ② 技能自身 precheck.conf 的 PROJECT_DIR= ③ 旧布局推导兜底。
# C2: --strict 模式下强制 decisions.jsonl 至少 1 条记录（spec-template §2 决策记录契约：
# --mark-active 前须≥1 决策；UserChallenge 类决策须带 missing_context/cost_if_wrong）
# draft 期（非 strict）允许空；strict 时文件缺失或零记录均记为 hit。
_vc_check_decisions() {  # $1=skill_dir $2=strict（--strict 或空）→ stdout 决策校验缺失清单
  local skill_dir="$1" strict="${2:-}"
  local dec_file="$skill_dir/.swarm-yuan/decisions.jsonl" decisions_miss=""
  if [[ ! -s "$dec_file" ]]; then
    # R126：三级解析收敛为 _vc_proj_root 单一实现（verify_completeness 前置定义处），
    # 与交付形态 DoD 懒计算共用同一项目根推导——两份手抄解析是漂移源。
    local _dc _proj_root
    _proj_root=$(_vc_proj_root "$skill_dir")
    for _dc in "${_proj_root:-X}/.swarm-yuan/decisions.jsonl" \
               "${_proj_root:-X}"/.codex/skills/*/.swarm-yuan/decisions.jsonl; do
      [[ -s "$_dc" ]] && { dec_file="$_dc"; break; }
    done
  fi
  if [[ -f "$dec_file" ]]; then
    if command -v python3 >/dev/null 2>&1; then
      local py_out
      py_out=$(python3 -c '
import sys, json
for i, line in enumerate(sys.stdin, 1):
    line = line.strip()
    if not line: continue
    try:
        obj = json.loads(line)
    except Exception as e:
        print(f"%d: 非法JSON (%s)" % (i, e))
        continue
    if obj.get("type") == "UserChallenge":
        for k in ("alternatives", "missing_context", "cost_if_wrong"):
            if not obj.get(k):
                print("%d: UserChallenge 缺 %s" % (i, k))
' < "$dec_file" 2>/dev/null || true)
      [[ -n "$py_out" ]] && decisions_miss=$(printf '%s\n' "$py_out" | sed "s|^|$dec_file:|")
    else
      # 降级：grep 字段存在性（bash 3.2 兼容，不阻塞）
      local ln=0 dline
      while IFS= read -r dline; do
        ln=$((ln + 1))
        echo "$dline" | grep -q '"type"' || { decisions_miss="${decisions_miss}${decisions_miss:+$'\n'}$dec_file:$ln: 非法JSON（缺 type 字段）"; continue; }
        echo "$dline" | grep -q '"type":"UserChallenge"' || continue
        echo "$dline" | grep -q '"alternatives"' || decisions_miss="${decisions_miss}${decisions_miss:+$'\n'}$dec_file:$ln: UserChallenge 缺 alternatives"
        echo "$dline" | grep -q '"missing_context"' || decisions_miss="${decisions_miss}${decisions_miss:+$'\n'}$dec_file:$ln: UserChallenge 缺 missing_context"
        echo "$dline" | grep -q '"cost_if_wrong"' || decisions_miss="${decisions_miss}${decisions_miss:+$'\n'}$dec_file:$ln: UserChallenge 缺 cost_if_wrong"
      done < "$dec_file"
    fi
  fi
  if [[ "$strict" == "--strict" ]]; then
    local _dec_cnt=0
    if [[ -f "$dec_file" ]]; then
      # R126：grep -c 零命中时打印 0 且 exit 1——pipefail 下无 || true 兜底会被 set -e
      # 静默中止（decisions.jsonl 存在但零有效行正是本分支要抓的「零记录」情形）。
      _dec_cnt=$(grep -c '.' "$dec_file" 2>/dev/null | xargs || true)
    fi
    if [[ "$_dec_cnt" -eq 0 ]]; then
      decisions_miss="${decisions_miss}${decisions_miss:+$'\n'}$dec_file: 缺少决策记录（--mark-active 须≥1 条，spec-template §2 契约；UserChallenge 须带 missing_context/cost_if_wrong）"
    fi
  fi
  printf '%s' "$decisions_miss"
}

# 终局裁决：hits 非空 → 按 draft/strict 分级放行或拦截；空 → P1 单独 warn + 通过。
_vc_report() {  # $1=hits $2=p1_hits $3=p1_cnt $4=status $5=strict → rc 0/1
  local hits="$1"
  local p1_hits="$2"
  local p1_cnt="$3"
  local _vc_status="$4"
  local strict="${5:-}"
  if [[ -n "$hits" ]]; then
    echo "✗ 占位符/未勾项/缺失要素未清零（$(printf '%s\n' "$hits" | wc -l | tr -d ' ') 处）:"
    printf '%s\n' "$hits"
    if [[ "$_vc_status" == "draft" && "$strict" != "--strict" ]]; then
      echo "ℹ draft 状态：允许残留（填充中段，断点续传安全）；--mark-active 前须清零"
      [[ "$p1_cnt" -gt 0 ]] && echo "  （含 ${p1_cnt} 处 P1 占位符：P1 分级，draft 期允许，--mark-active 前 exit 1）"
      return 0
    fi
    return 1
  fi
  # P1 占位符在非 --strict 模式下单独 warn（不 exit 1）
  if [[ "$p1_cnt" -gt 0 && "$strict" != "--strict" ]]; then
    echo "⚠ 发现 ${p1_cnt} 处 P1 占位符（P1 分级，draft 期允许，--mark-active 前须清零）:"
    printf '%s\n' "$p1_hits"
  fi
  echo "✓ 无占位符确认"
  return 0
}

verify_completeness() {
  local skill_dir="$1" strict="${2:-}"
  trace_tool "verify-completeness" "$skill_dir"
  [[ -d "$skill_dir" ]] || { echo "✗ 目录不存在: $skill_dir" >&2; return 1; }
  # WP-H 状态门：draft 骨架允许占位符残留（报告模式 exit 0）；--strict（--mark-active 路径）保持 exit 1
  local _vc_status=""
  if [[ -f "$skill_dir/SKILL.md" ]]; then
    _vc_status=$(grep -m1 '^status: ' "$skill_dir/SKILL.md" 2>/dev/null | sed 's/^status: *//' | tr -d '[:space:]')
  fi
  # 收集检查目标（存在才查；R128 起收敛为 _vc_collect_targets 单一实现，追加顺序 = 扫描顺序）
  local targets=() f
  while IFS= read -r f; do targets+=("$f"); done < <(_vc_collect_targets "$skill_dir")
  if [[ ${#targets[@]} -eq 0 ]]; then
    echo "⚠ 未找到可检查文件（SKILL.md / references/*.md / precheck.conf / hooks.json 均不存在）"
    # R126：strict 路径零文件改 fail-closed——「无对象可查」不是「查过合格」，旧版
    # 独立 --verify-completeness --strict <空目录> 打印 ✓ 放行（fail-open）。
    # --mark-active 因有 SKILL.md 预查本不受此影响，此处守的是独立调用面。
    if [[ "$strict" == "--strict" ]]; then
      echo "✗ strict 模式无可检查文件——目录不是有效技能骨架，拒绝放行: $skill_dir" >&2
      return 1
    fi
    echo "✓ 无占位符确认"
    return 0
  fi
  # grep -F 固定串多模式（-e 叠加），三平台兼容；输出 file:line:内容 清单。
  # WP-Q4 P0/P1 分级机器化（P0/P1 判据见 _vc_scan_placeholders/_vc_scan_p1 头注）：
  #   - P1 占位符（含「（P1 待补）」标记）：draft 期允许，--strict（--mark-active）前须清零
  #   - P0 占位符（不含 P1 标记的常规占位符）：draft 期也仅 warn（draft 允许残留），--strict 时 exit 1
  local hits="" p1_hits="" p0_hits="" cb_hits
  p0_hits=$(_vc_scan_placeholders ${targets[@]+"${targets[@]}"})
  p1_hits=$(_vc_scan_p1 ${targets[@]+"${targets[@]}"})
  hits="$p0_hits"
  # 未勾 checkbox（- [ ]）：检查表段/代码块外的行首 checkbox（_vc_scan_checkboxes 单一实现）
  cb_hits=$(_vc_scan_checkboxes ${targets[@]+"${targets[@]}"})
  hits=$(printf '%s\n%s\n' "$hits" "$cb_hits" | grep -v '^$' || true)
  # P1 占位符追加到 hits（--strict 模式下也算，draft 模式下仅 warn 不计入 hits）
  if [[ "$strict" == "--strict" && -n "$p1_hits" ]]; then
    hits=$(printf '%s\n%s\n' "$hits" "$p1_hits" | grep -v '^$' || true)
  fi
  local p1_cnt=0
  [[ -n "$p1_hits" ]] && p1_cnt=$(printf '%s\n' "$p1_hits" | grep -c . | tr -d ' \n' || true)
  # 调用追踪要素机器执法 + 交付形态 DoD 在位性（_vc_check_workflow 单一实现；
  # 无 workflow.md 或无节点段放行，空输出不并入 hits）
  local trace_miss=""
  trace_miss=$(_vc_check_workflow "$skill_dir")
  hits=$(printf '%s\n%s\n' "$hits" "$trace_miss" | grep -v '^$' || true)
  # R21-A 任务配方结构执法（_vc_check_recipes）+ R21-B dev-guide「开发偏好」固定节核验
  # （_vc_check_dev_guide；两段按原序并入——recipes 缺失在前，固定节缺失在后）
  local recipes_miss="" dg_miss=""
  recipes_miss=$(_vc_check_recipes "$skill_dir")
  dg_miss=$(_vc_check_dev_guide "$skill_dir")
  recipes_miss=$(printf '%s\n%s\n' "$recipes_miss" "$dg_miss" | grep -v '^$' || true)
  hits=$(printf '%s\n%s\n' "$hits" "$recipes_miss" | grep -v '^$' || true)
  # G1/C2：decisions.jsonl 校验（JSON 合法性 + UserChallenge 五要素 + strict 零记录拦截，
  # 双账回退与 C2 判据见 _vc_check_decisions 头注；decisions_miss 并入 hits 统一裁决）
  local decisions_miss=""
  decisions_miss=$(_vc_check_decisions "$skill_dir" "$strict")
  hits=$(printf '%s\n%s\n' "$hits" "$decisions_miss" | grep -v '^$' || true)
  _vc_report "$hits" "$p1_hits" "$p1_cnt" "$_vc_status" "$strict"
}

if [[ "${1:-}" == "--verify-completeness" ]]; then
  # R39-D3（2026-09-19 执勤实证）：SKILL.md 生成流程 表记载写法为 `--verify-completeness --strict <dir>`
  # （标志前置），实现只认 `<dir> --strict`（后置）——照权威文档写法报"目录不存在: --strict"。
  # 与主解析器"标志须前置"的约定也互相矛盾。修复：--strict 双序兼容（任意位置剥离，取首个目录参数）。
  ___vc_dir="" ; ___vc_strict=0
  shift
  for ___a in "$@"; do
    case "$___a" in
      --strict) ___vc_strict=1 ;;
      *) [[ -z "$___vc_dir" ]] && ___vc_dir="$___a" ;;
    esac
  done
  [[ -n "$___vc_dir" ]] || { echo "Usage: bash generate-skill.sh --verify-completeness <skill-dir> [--strict]"; exit 1; }
  if [[ "$___vc_strict" -eq 1 ]]; then
    verify_completeness "$___vc_dir" --strict
  else
    verify_completeness "$___vc_dir"
  fi
  exit $?
fi

# ============================================================
# check_framework_globs <skill-dir> —— mark-active 的框架门禁空转防线（R48-G5 抽函数可测化）
# 返回 0=每个 ACTIVE_FRAMEWORKS 框架至少一个 glob 族变量已填；1=有框架全空（stderr 报清单）。
# R33-F1 立法（框架 glob 空转拦截）+ R47-D3 修（变量名以注入区块 requires_conf 声明为准，
# id 前缀推导为补充）。独立成函数供 --check-framework-globs 子命令与测试直调（变异回归锚点）。
# check_spec_first_wiring <skill-dir> —— mark-active 的 spec-first 联动防线（R75-D3）
# 缺陷（2026-09-29 NestJS 执勤实证）：骨架 conf 的 WRITABLE_DIRS=()  # TODO:model 若 AI 填充时漏配，
# spec-first 前置门（fail-gate-hook）在 WRITABLE_DIRS 未配时按设计"放行（不阻碍诊断）"——
# active 技能上 spec 门整链静默空转（SPEC_REQUIRED=1 的字面承诺无机器保证），mark-active 六关原不校验。
# 判据：SPEC_REQUIRED 解析为 1 且 WRITABLE_DIRS 解析为空 → fail（对齐 #20b 注释安全解析范式）。
check_spec_first_wiring() {
  local _sf_dir="$1"
  local _sf_conf="$_sf_dir/scripts/precheck.conf"
  [[ -f "$_sf_conf" ]] || return 0   # 无 conf 非生成物形态，跳过
  local _spec_req="" _wd="" _sf_c _v
  # R126：沿 conf 链（core→arch→patch）读取，后者覆盖前者（与运行时链式 source 同语义）——
  # 旧版只读主 conf，用户把 SPEC_REQUIRED/WRITABLE_DIRS 挪进 precheck.patch.conf 覆盖层
  # 即被误判「未启用/空值」（校验面与运行时各看不同真值）。
  while IFS= read -r _sf_c; do
    _v=$(grep '^SPEC_REQUIRED=' "$_sf_c" 2>/dev/null | tail -1 | cut -d'#' -f1 | tr -d '[:space:]' | sed 's/^SPEC_REQUIRED=//;s/^"//;s/"$//' || printf '')
    [[ -n "$_v" ]] && _spec_req="$_v"
    _v=$(grep '^WRITABLE_DIRS=' "$_sf_c" 2>/dev/null | tail -1 | cut -d'#' -f1 | sed -e 's/^WRITABLE_DIRS=(//' -e 's/[[:space:]]*)[[:space:]]*$//' -e 's/"//g' || printf '')
    [[ -n "$_v" ]] && _wd="$_v"
  done < <(_skill_conf_files "$_sf_dir")
  case "$_spec_req" in
    '${SPEC_REQUIRED:-'*) _spec_req="${_spec_req#\$\{SPEC_REQUIRED:-}"; _spec_req="${_spec_req%\}}" ;;
  esac
  [[ "$_spec_req" == "1" ]] || return 0   # SPEC_REQUIRED≠1 = 门未启用，无需可写区
  if [[ -z "$_wd" ]]; then
    echo "✗ spec-first 联动检查失败：SPEC_REQUIRED=1 但 WRITABLE_DIRS 为空——spec-first 前置门在运行时将静默放行（整链空转）。填充 scripts/precheck.conf 的 WRITABLE_DIRS（如 ("src")），或显式置 SPEC_REQUIRED=0 并落 decisions.jsonl 留痕后重跑 --mark-active" >&2
    return 1
  fi
  echo "  ✓ spec-first 联动检查通过（SPEC_REQUIRED=1 + WRITABLE_DIRS=($_wd) 非空）"
  return 0
}

# ============================================================
# R128：check_framework_globs 行为保持式拆分——id 收集/变量样式推导/空转核验/
# 全变量核验各自成子函数（_cfg_*）。文案/退出码/stderr 逐条位置与拆分前逐字一致。
# ============================================================
# R126：沿 conf 链（core→arch→patch）收集 ACTIVE_FRAMEWORKS 与变量取值——运行时 conf
# 链式 source 含 patch 覆盖层，核验面此前只读 core+arch，与运行时各看不同真值。
_cfg_collect_ids() {  # $1=skill_dir → stdout 去重排序后的框架 id（空白分隔）
  local _cfg_dir="$1"
  local _cfg_af="" _cfg_c _cfg_line
  while IFS= read -r _cfg_c; do
    _cfg_line=$(grep -m1 '^ACTIVE_FRAMEWORKS=' "$_cfg_c" 2>/dev/null | cut -d'#' -f1 | sed 's/^ACTIVE_FRAMEWORKS=//;s/[()"]//g' || true)
    if [[ -n "$_cfg_line" ]]; then
      _cfg_af="$_cfg_af $_cfg_line"
    fi
  done < <(_skill_conf_files "$_cfg_dir")
  printf '%s' "$(printf '%s' "${_cfg_af}" | tr '[:space:]' '\n' | LC_ALL=C sort -u | sed '/^$/d' || true)"
}

_cfg_fw_upper() {  # $1=框架 id → stdout 大写去横线形态（变量前缀）
  printf '%s' "$1" | tr -d '-' | tr '[:lower:]' '[:upper:]'
}

_cfg_declared_vars() {  # $1=skill_dir $2=框架 id → stdout 该框架 requires_conf 声明变量（空白分隔）
  if [[ -f "$1/scripts/precheck.sh" ]]; then
    grep -m1 "^# ruleset: $2  *requires_conf:" "$1/scripts/precheck.sh" 2>/dev/null | sed 's/.*requires_conf: *//' || true
  fi
}

# R48-G5b（变异回归断言负向断言逼出的 D3 残留半修）：注入区块已声明 requires_conf 时，
# 门禁实际只读声明变量——id 前缀猜测变量在此形态下是假阳性放行（填了 JESTVITEST_*
# 过执法但 jest-vitest 门禁读 VITEST_* 依旧空转）。收紧：声明在案 → 只认声明变量；
# 未注入 ruleset 的框架 → 保留 id 前缀推导兜底。
# R58-D9：声明在案 → 认**全部**声明变量、不挑名字形态（原 case 只留 glob 族名，
# vite 声明的 VITE_CONFIG_FILE/VITE_INJECT_SCRIPT 等被全滤掉 → 永远 missing 假阳性）。
# requires_conf 的语义就是"该规则集的输入变量"，非 glob 名同样是门禁的已填输入。
_cfg_pattern_for() {  # $1=skill_dir $2=框架 id → stdout 该框架已填判据 ERE（声明变量并集或 id 前缀兜底）
  local _cfg_dir="$1" _cfg_id="$2"
  local _cfg_vars _cfg_v _cfg_decl_glob=""
  _cfg_vars=$(_cfg_declared_vars "$_cfg_dir" "$_cfg_id")
  for _cfg_v in ${_cfg_vars}; do
    _cfg_decl_glob="${_cfg_decl_glob}${_cfg_decl_glob:+|}${_cfg_v}"
  done
  if [[ -n "$_cfg_decl_glob" ]]; then
    printf '%s' "${_cfg_decl_glob}"
  else
    printf '%s' "$(_cfg_fw_upper "$_cfg_id")[A-Z0-9_]*(SRC_GLOBS|MAPPER_DIRS|CONFIG_FILES|SQL_GLOBS|SCHEMA_GLOBS|JOB_DIRS|KEY_COLUMNS|SHARD_KEY|GLOBS)"
  fi
}

# 空转核验：每个激活框架按判据 ERE 数已填变量（≥1 即不空转）。全空框架的空值变量
# 逐条 file:line 位置同步打到 stderr（供编排器 ✗ 行的「位置见上方清单」指代）。
# 全空框架清单落全局 _cg_missing（" FW1 FW2" 空格前缀形态，空串=无全空框架）——
# 必须直调不走命令替换：下方 listing 管道在 grep 零命中时 pipefail rc=1，set -e 上下文
# （--check-framework-globs 顶层直调）沿用拆分前「当场静默中止」行为；命令替换会吞掉
# 该中止（bash 3.2 赋值语句不传播命令替换内的 -e 中止），属行为漂移，R128 实测拦下。
# R58-D9b：填值形态双认——数组 `VAR=("x` 与标量 `VAR="x`（vite 声明标量变量，
# 原正则只认数组形态 → 标量永远假阴性）
# R126：判据收敛到 _conf_var_filled 单一实现——旧 ERE 只认双引号起，
# 单引号/裸值已填形态被计空（误报「框架 glob 全空」阻断 --mark-active）。
_cfg_check_alive() {  # $1=skill_dir $2..=框架 id → stderr 空值位置清单；全局 _cg_missing=全空框架清单
  local _cfg_dir="$1"; shift
  local _cfg_id _cfg_fw _cfg_pat _cfg_hit _cfg_l _cfg_c
  _cg_missing=""
  for _cfg_id in "$@"; do
    _cfg_fw=$(_cfg_fw_upper "$_cfg_id")
    _cfg_pat=$(_cfg_pattern_for "$_cfg_dir" "$_cfg_id")
    _cfg_hit=0
    while IFS= read -r _cfg_l; do
      [[ -n "$_cfg_l" ]] || continue
      _conf_var_filled "$_cfg_l" && _cfg_hit=$((_cfg_hit+1))
    done < <(while IFS= read -r _cfg_c; do grep -hE "^(${_cfg_pat})=" "$_cfg_c" 2>/dev/null || true; done < <(_skill_conf_files "$_cfg_dir"))
    if [[ "${_cfg_hit:-0}" -eq 0 ]]; then
      _cg_missing="${_cg_missing} ${_cfg_fw}"
      # R114-followup：报错附空值变量精确 file:line——框架变量双 conf 分散（precheck.conf 与
      # precheck.arch.conf 各持若干），只报名字时首轮填充易改错文件（R114 研发链实录）。
      # R128：管道尾 || true——conf 链首文件对该框架变量零命中时 grep rc=1，pipefail 下整条
      # 管道 rc=1 → set -e 就地中止整个子命令（rc=1 且连下方「✗ 框架 glob 全空」都不输出，
      # 静默失败；--mark-active 的 if ! 上下文则不死）。拆分时基线对比拦下的潜伏缺陷，单独立法修复。
      while IFS= read -r _cfg_c; do
        grep -nE "^(${_cfg_pat})=" "$_cfg_c" 2>/dev/null | while IFS= read -r _cfg_ln; do
          echo "    空值变量位置（改这里）：$(basename "${_cfg_c}"):${_cfg_ln%%:*} $(printf '%s' "${_cfg_ln#*:}" | cut -d= -f1)" >&2
        done || true
      done < <(_skill_conf_files "$_cfg_dir")
    fi
  done
}

# 全变量核验（advisory）：requires_conf 声明的每个变量逐一核验已填——
# ≥1 只保"不空转"，空值变量无机器拦截，此处仅披露不阻断。
# R126：判据收敛 _conf_var_filled——旧 `^VAR=.+[^ ]` 把 VAR=()/VAR="" 判已填
# （本 advisory 实质死代码），且漏 patch 覆盖层。
_cfg_check_declared() {  # $1=skill_dir $2..=框架 id → stdout advisory ⚠ 行（全填=无输出）
  local _cfg_dir="$1"; shift
  local _cfg_id2 _cfg_fw2 _cfg_vars2 _cfg_evar
  local _cg_empty=""
  for _cfg_id2 in "$@"; do
    _cfg_fw2=$(_cfg_fw_upper "$_cfg_id2")
    _cfg_vars2=$(_cfg_declared_vars "$_cfg_dir" "$_cfg_id2")
    for _cfg_evar in ${_cfg_vars2}; do
      local _cg_ef=1 _cg_l
      while IFS= read -r _cg_l; do
        _conf_var_filled "$_cg_l" && { _cg_ef=0; break; }
      done < <(while IFS= read -r _cfg_c2; do grep -h "^${_cfg_evar}=" "$_cfg_c2" 2>/dev/null || true; done < <(_skill_conf_files "$_cfg_dir"))
      [[ "$_cg_ef" -eq 1 ]] && _cg_empty="${_cg_empty} ${_cfg_fw2}.${_cfg_evar}"
    done
  done
  if [[ -n "$_cg_empty" ]]; then
    echo "  ⚠ 框架声明变量有未填项（不阻塞激活但框架门禁可能不完全生效）：${_cg_empty}"
  fi
}

check_framework_globs() {
  local _cg_dir="$1"
  local _cg_ids
  _cg_ids=$(_cfg_collect_ids "$_cg_dir")
  # 直调（不走命令替换）——-e 上下文与拆分前逐位一致，理由见 _cfg_check_alive 头注
  _cfg_check_alive "$_cg_dir" ${_cg_ids}
  if [[ -n "${_cg_missing}" ]]; then
    echo "✗ 框架 glob 全空（TODO(framework-gates) 未填充）：${_cg_missing} 无任何已填变量——框架门禁将空转（空值变量逐条位置见上方清单；两 conf 均无该变量时按 requires_conf 声明名新增行）。填充后重跑 --mark-active" >&2
    return 1
  fi
  # 全变量核验（≥1 只保"不空转"——空值变量无机器拦截；advisory 不阻断）
  _cfg_check_declared "$_cg_dir" ${_cg_ids}
  echo "✓ 框架 glob 检查通过（ACTIVE_FRAMEWORKS 每框架至少一个声明变量已填）"
  return 0
}

# --help（R72-D1：此前无 help 分支——误传旗标时落到 ${2:?} 参数缺失报错，
# 以 bash 原生 `line N: 2:` 前缀吐 usage，不指引正确用法；R125：补齐全部子命令与 --version）
if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
fi
if [[ "${1:-}" == "--version" ]]; then
  _gv_src="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  git -C "$_gv_src" describe --tags --always 2>/dev/null || echo "unknown"
  exit 0
fi

# --check-framework-globs <skill-dir>：单跑框架空转防线（R48-G5——供 test-framework-conf-consistency
# 直调做变异回归断言：正向=requires_conf 变量可放行；负向=id 前缀伪造变量不放行）
if [[ "${1:-}" == "--check-framework-globals" || "${1:-}" == "--check-framework-globs" ]]; then
  _cgd="${2:-}"
  [[ -n "$_cgd" && -f "$_cgd/SKILL.md" ]] || { echo "Usage: bash generate-skill.sh --check-framework-globs <skill-dir>"; exit 1; }
  trace_tool "check-framework-globs" "$_cgd"
  check_framework_globs "$_cgd"
  exit $?
fi

# --mark-active 子命令（WP-H 状态门：draft → active；WP-Q1A 串联 inventory-verify --path-check）
# 用法: bash generate-skill.sh --mark-active <skill-dir>
# 三道关：
#   ① verify_completeness --strict（占位符零残留，P0/P1 分级）
#   ② inventory-verify.sh --path-check（§4/§6/§9 表格登记的路径必须在仓库真实存在）
#   ③ inventory-verify.sh 基线 FAIL 维度阻断（HALLUCINATION 列表非空阻断）
# 三关全过才把 SKILL.md frontmatter 的 status: draft 翻为 active；
# active 后目标 skill 的 precheck.sh --all-full/--compliance-suite 才解除禁用（precheck 侧状态门）。
# ============================================================
if [[ "${1:-}" == "--mark-active" ]]; then
  [[ $# -ge 2 ]] || { echo "Usage: bash generate-skill.sh --mark-active <skill-dir>"; exit 1; }
  _ma_dir="$2"
  [[ -f "$_ma_dir/SKILL.md" ]] || { echo "✗ SKILL.md 不存在: $_ma_dir" >&2; exit 1; }
  # R28-DF7（2026-09-16 执勤实证）：技能与项目分离存放（CI 产物目录）时，decisions 双账
  # 回退链（verify_completeness 内 ${PROJECT_DIR:-skill_dir 上三级}）两路皆空——PROJECT_DIR
  # 未导出、skill_dir 上三级不再是项目根。conf 里明明有真值，提前读出导出即闭环。
  # 占位符形态（draft 未回填 <项目根绝对路径>）不导出，保持原回退链。
  if [[ -z "${PROJECT_DIR:-}" && -f "$_ma_dir/scripts/precheck.conf" ]]; then
    _ma_pd=$(grep -m1 '^PROJECT_DIR=' "$_ma_dir/scripts/precheck.conf" 2>/dev/null \
      | cut -d'#' -f1 | sed 's/^PROJECT_DIR=//;s/[[:space:]]*$//;s/^"//;s/"$//' || true)
    case "$_ma_pd" in
      "<"*">") : ;;
      ?*) [[ -d "$_ma_pd" ]] && export PROJECT_DIR="$_ma_pd" ;;
    esac
  fi
  if ! grep -q '^status: draft' "$_ma_dir/SKILL.md"; then
    echo "ℹ 非 draft 状态（已是 active 或无 status 字段），无需标记"
    exit 0
  fi
  # R33-F1 框架空转防线（R48-G5 抽函数）：逻辑与可测锚点单一事实源化，见上方 check_framework_globs
  if ! check_framework_globs "$_ma_dir"; then
    exit 1
  fi
  # R75-D3 spec-first 联动防线（抽函数可测化，同 R48-G5 范式）
  if ! check_spec_first_wiring "$_ma_dir"; then
    exit 1
  fi
  # ① 无占位符核验
  if ! verify_completeness "$_ma_dir" --strict; then
    echo "✗ ①占位符未清零，保持 draft（--all-full/--compliance-suite 仍禁用）" >&2
    exit 1
  fi
  # ②③ inventory-verify 路径校验（HALLUCINATION 阻断；FAIL 维度作为告警不阻断——fail-open）
  # 补串 --stability-audit（WP-Q1A 时漏串，仅文档化）——稳定性标注与三自动信号
  # （近 90 天 git churn / fan-in / 同名测试）冲突时 STABILITY_WARN（advisory，不阻断）。
  _ma_iv="$(cd "$(dirname "$0")" && pwd)/inventory-verify.sh"
  if [[ -x "$_ma_iv" || -f "$_ma_iv" ]]; then
    # R126-MED5：旧 `_ma_proj=$(cd "$x" && pwd)` 是裸赋值——conf 的 PROJECT_DIR 指向已搬迁
    # 目录时 cd 失败 rc=1，set -e 下 --mark-active 整体静默退出（三关校验一段不执行）。
    # 改 || true 容错：拿不到规范路径走下方 -n/-d 判空的"跳过 inventory-verify"分支。
    _ma_proj=$( (set +u; . "$_ma_dir/scripts/precheck.conf" 2>/dev/null || true; printf '%s' "${PROJECT_DIR:-}") )
    _ma_proj=$(cd "$_ma_proj" 2>/dev/null && pwd || true)
    if [[ -n "$_ma_proj" && -d "$_ma_proj" && -f "$_ma_dir/references/reference-manual.md" ]]; then
      _iv_rc=0
      _iv_out=$(bash "$_ma_iv" "$_ma_proj" --skill-dir "$_ma_dir" --tsv --path-check --stability-audit 2>&1) || _iv_rc=$?
      # R118：verifier 自身崩溃/异常退出不得当作“无 HALLUCINATION”放行（旧版 || true 吞码）。
      if [[ "$_iv_rc" -ge 2 ]]; then
        echo "✗ ②③ inventory-verify 异常退出（rc=${_iv_rc}）——路径实存核验未完成，拒绝 mark-active" >&2
        printf '%s\n' "$_iv_out" | tail -20 >&2
        exit 1
      fi
      if [[ "$_iv_rc" -ne 0 && -z "$_iv_out" ]]; then
        echo "✗ ②③ inventory-verify 无输出且非零退出（rc=${_iv_rc}）——拒绝 mark-active" >&2
        exit 1
      fi
  # 维度 TSV 证据面展示（此前只回显异常——12 维度 PASS 吞掉，不可见）。
  # R70 修复两处：① $_iv_out 必须带引号（无引号展开被分词打散行结构）；
  # ② 匹配模式改行尾状态列（inventory-verify --tsv 行形态 = 标签\t枚举\t登记\t比率\t状态，
  #    状态词表 PASS/FAIL/NO_LIST——原 ^(DIM_|PASS|FAIL) 对行首永不命中，功能空转）；
  # ③ grep 无匹配 exit 1 在 set -o pipefail 下炸整条管道（同 WP-R Bug#1 SIGPIPE 族，
  #    generate-skill.sh:17 set -euo pipefail）——|| true 兜底，对齐 :1020 既有范式。
  if [[ -n "${_iv_out:-}" ]]; then
    printf '%s\n' "${_iv_out}" | grep -E '(PASS|FAIL|NO_LIST)$' | head -20 || true
  fi
      _iv_hallus=$(printf '%s\n' "$_iv_out" | grep -c '^HALLUCINATION' || true)
      if [[ "${_iv_hallus:-0}" -gt 0 ]]; then
        echo "✗ ②③ inventory-verify 检测到 ${_iv_hallus} 个 HALLUCINATION 路径（清单登记 vs 仓库实存不符）" >&2
        printf '%s\n' "$_iv_out" | grep '^HALLUCINATION' >&2
        echo "  → 回 Step 4 补齐组件/重写登记行；保持 draft（--all-full/--compliance-suite 仍禁用）" >&2
        exit 1
      fi
      # FAIL 维度作为告警（不阻断——fail-open；与 -path-check 的硬阻断区分）
      _iv_fail=$(printf '%s\n' "$_iv_out" | grep -cE '\bFAIL\b' || true)
      if [[ "${_iv_fail:-0}" -gt 0 ]]; then
        echo "⚠ inventory-verify FAIL 维度 ${_iv_fail} 个（advisory：清单覆盖度 < 0.95；不阻断 mark-active，但建议补漏）" >&2
        printf '%s\n' "$_iv_out" | grep -E '\bFAIL\b' >&2 || true
      fi
      # STABILITY_WARN 也作为告警（不阻断——advisory 级；标注与自动信号冲突须人工复核）
      _iv_stab=$(printf '%s\n' "$_iv_out" | grep -c '^STABILITY_WARN' || true)
      if [[ "${_iv_stab:-0}" -gt 0 ]]; then
        echo "⚠ inventory-verify STABILITY_WARN ${_iv_stab} 条（advisory：稳定性标注与 git churn/fan-in/测试存在性信号冲突；不阻断 mark-active，但建议复核标注）" >&2
        printf '%s\n' "$_iv_out" | grep '^STABILITY_WARN' >&2 || true
      fi
      # R21-D：关系边集抽样核验（advisory——边集是可选产物：缺失不阻断；存在且有断边时披露并提示重建）
      _ma_rx="$(cd "$(dirname "$0")" && pwd)/relations-extract.sh"
      if [[ -f "$_ma_dir/references/relations.jsonl" && -f "$_ma_rx" ]]; then
        if ! _rx_out=$(bash "$_ma_rx" "$_ma_proj" --verify --skill-dir "$_ma_dir" 2>&1); then
          echo "⚠ relations-extract --verify 执行异常（advisory，不阻断）" >&2
        else
          _rx_miss=$(printf '%s\n' "$_rx_out" | grep -c '^RELATION_MISS' || true)
          if [[ "${_rx_miss:-0}" -gt 0 ]]; then
            echo "⚠ 关系边集抽样失锚 ${_rx_miss} 处（advisory：重跑 relations-extract.sh 重建边集；不阻断 mark-active）" >&2
            printf '%s\n' "$_rx_out" | grep '^RELATION_MISS' >&2 || true
          fi
        fi
      fi
    else
      echo "⚠ inventory-verify 跳过（PROJECT_DIR 或 reference-manual.md 缺失：mark-active 不强求）" >&2
    fi
  else
    echo "⚠ inventory-verify.sh 不存在（$BASE/scripts/），跳过 ②③" >&2
  fi
  # R15（HarnessEval P7）：audit-closure --strict 闭环完备性检查（advisory 降级——
  # 无 decisions.jsonl 或全部 closed 时过；有 open goal 时 warn 不阻断，fail-open 教义：
  # 审计未完成是提示信号不是阻断条件，有下层门禁兜底）
  _ma_ac="$(cd "$(dirname "$0")" && pwd)/audit-closure.sh"
  if [[ -x "$_ma_ac" || -f "$_ma_ac" ]]; then
    _ac_proj=$( (set +u; . "$_ma_dir/scripts/precheck.conf" 2>/dev/null || true; printf '%s' "${PROJECT_DIR:-}") )
    if [[ -n "$_ac_proj" && -d "$_ac_proj" ]]; then
      if ! bash "$_ma_ac" "$_ac_proj" --strict >/dev/null 2>&1; then
        echo "⚠ audit-closure：存在 open goal（change↔validation 未闭合）——advisory 提示，不阻断 mark-active" >&2
        bash "$_ma_ac" "$_ac_proj" 2>&1 | grep '⚠' >&2 || true
      fi
    fi
  fi
  sed -i.bak 's/^status: draft/status: active/' "$_ma_dir/SKILL.md" && rm -f "$_ma_dir/SKILL.md.bak"
  echo "✓ 已标记 status: active（--all-full/--compliance-suite 已解锁）"
  exit 0
fi

# ============================================================
# --render-tools 子命令（独立于 create/upgrade，单独拦截）
# 用法: bash generate-skill.sh --render-tools <skill-dir> [project-root] [tool]
# G7 三档对齐：runnable（全部 7 工具目录复制即可运行）/ cli（6 工具派生原生规则）/
#   deep（Claude Code 已深度集成，no-op）。档位元数据：assets/tool-adapters/common.sh TA_TIER_*。
# 从目标 skill 的 SKILL.md + scripts/precheck.conf 派生各 AI 工具原生规则文件：
#   Cursor .cursor/rules/<skill>.mdc（description/globs/alwaysApply 三字段）
#   Windsurf .windsurf/rules/<skill>.md（trigger: model_decision）
#   Gemini/Codex/OpenCode/Kimi 的 GEMINI.md/AGENTS.md 段（标记区块包裹，幂等重渲染）
#   Claude Code 维持现状（hooks/commands 已深度集成，不渲染）
# project-root 缺省自动推导（用户级工具 home → 各工具全局规则位；否则取项目根）；
# tool 缺省渲染全部 7 工具，指定则只渲染其一。适配器：assets/tool-adapters/<tool>.sh
# （install.sh 共用 source）。重渲染同一项目为 no-op（内容一致跳过）。
# ============================================================
if [[ "${1:-}" == "--render-tools" ]]; then
  [[ $# -ge 2 ]] || { echo "Usage: bash generate-skill.sh --render-tools <skill-dir> [project-root] [tool]"; exit 1; }
  TA_DIR="$(cd "$(dirname "$0")/.." && pwd)/assets/tool-adapters"
  export TA_DIR
  # shellcheck disable=SC1090
  . "$TA_DIR/common.sh"
  ta_render_tools "$2" "${3:-}" "${4:-}"
  exit $?
fi

# ============================================================
# --refresh 子命令（WP-Q3-1 自成长机制最小切片：dry-run 报告 + 不实际修改）
# 用法: bash generate-skill.sh --refresh <skill-dir>
# 走 project-fingerprint.sh --diff 拿变化报告，加上：
#   ① 当前 skill 状态（draft/active）+ 上一次 refresh 时间
#   ② 建议行动（无变化 → 无需刷新；有变化 → --upgrade 详情）
#   ③ 把当前指纹落盘到 project（新基线）——可选 --commit-fp
# 红线：仅报告，不改任何文件；不写 reference-manual.md（那是 --upgrade 的活）。
# ============================================================
if [[ "${1:-}" == "--refresh" ]]; then
  [[ $# -ge 2 ]] || { echo "Usage: bash generate-skill.sh --refresh <skill-dir> [--commit-fp]"; exit 1; }
  _rf_dir="$2"; shift 2
  [[ -d "$_rf_dir" ]] || { echo "✗ skill 目录不存在: $_rf_dir" >&2; exit 1; }
  [[ -f "$_rf_dir/SKILL.md" ]] || { echo "✗ SKILL.md 不存在: $_rf_dir" >&2; exit 1; }
  # 项目根：从 precheck.conf 拿
  _rf_conf="$_rf_dir/scripts/precheck.conf"
  [[ -f "$_rf_conf" ]] || { echo "✗ scripts/precheck.conf 不存在，无法定位项目根" >&2; exit 1; }
  _rf_proj=$( (set +u; . "$_rf_conf" 2>/dev/null || true; printf '%s' "${PROJECT_DIR:-}") )
  [[ -n "$_rf_proj" && -d "$_rf_proj" ]] || { echo "✗ precheck.conf 中 PROJECT_DIR 无效: ${PROJECT_DIR:-（空）}" >&2; exit 1; }
  _rf_proj=$(cd "$_rf_proj" && pwd)
  # fingerprint 脚本路径
  _rf_fp="$(cd "$(dirname "$0")" && pwd)/project-fingerprint.sh"
  [[ -x "$_rf_fp" || -f "$_rf_fp" ]] || { echo "✗ project-fingerprint.sh 缺失: $_rf_fp" >&2; exit 1; }
  # 跑 diff
  _rf_out=$(bash "$_rf_fp" "$_rf_proj" --diff 2>&1) || true
  # 输出报告
  echo "## --refresh dry-run（skill=$(basename "$_rf_dir")，project=${_rf_proj}）"
  _rf_status=$(grep -m1 '^status:' "$_rf_dir/SKILL.md" 2>/dev/null | sed 's/^status: *//')
  echo "  当前 skill 状态: ${_rf_status:-无 status 字段}"
  if printf '%s\n' "$_rf_out" | LC_ALL=C grep -q '⚠ 项目源码已变化'; then
    # 建议从"只 --upgrade"升级为完整更新链——--upgrade 只刷工具链，
    # reference-manual.md 组件库清单需 AI 重探查更新 + inventory-verify 核验。
    echo "  → 检测到变化，更新链（详见目标技能 SKILL.md「自成长」段）："
    echo "      ① --upgrade 刷工具链（保留 reference-manual.md 内容文件）"
    echo "      ② AI 按「变化目录（scope）」局部重探查变化目录 → 更新 reference-manual.md 清单（未变 scope 条目不重写）"
    echo "      ③ inventory-verify.sh 计数核验（≥0.95 + 路径存在性）→ ④ --commit-fp 落新基线"
    printf '%s\n' "$_rf_out" | LC_ALL=C grep -v '^⚠' | LC_ALL=C grep -v '^  →' | LC_ALL=C grep -v '^$' | LC_ALL=C sed 's/^/    /'
    # --commit-fp：把当前指纹落盘为新基线
    if [[ "${1:-}" == "--commit-fp" ]]; then
      bash "$_rf_fp" "$_rf_proj" --write >/dev/null
      echo "  ✓ --commit-fp：已把当前指纹落盘为新基线（$_rf_proj/.swarm-yuan/project-fingerprint）"
    fi
    exit 0
  elif printf '%s\n' "$_rf_out" | LC_ALL=C grep -q '无既有指纹'; then
    # 无基线 ≠ 无变化——此前落入 else 报"✓ 无变化"，首次感知场景假阴性。
    echo "  → 无指纹基线（尚未做过首次感知），无法判断变化——建议落基线："
    echo "      bash scripts/generate-skill.sh --refresh <skill-dir> --commit-fp"
    if [[ "${1:-}" == "--commit-fp" ]]; then
      bash "$_rf_fp" "$_rf_proj" --write >/dev/null
      echo "  ✓ --commit-fp：已把当前指纹落盘为基线（$_rf_proj/.swarm-yuan/project-fingerprint）"
    fi
    exit 0
  else
    echo "  ✓ 无变化（文件骨架指纹未变）"
    printf '%s\n' "$_rf_out" | LC_ALL=C grep -E '^\s*✓' | head -1 || true
    exit 0
  fi
fi

# ---- 检测运行环境 ----
# 默认目标：项目内 .claude/skills/（"为目标项目生成 skill"名副其实）。
# 历史行为（2026-07-21 前）：项目内无 .claude/skills 时 fallback 到 $HOME/.claude/skills 全局目录，
# 导致 generate-skill.sh <name> <project> 把骨架生成到用户全局 skills 目录、项目目录内却什么都没有，
# 与 README/SKILL.md 宣称的"为某项目生成开发技能"不符。改为默认在项目内创建 .claude/skills/。
# 全局安装走 install.sh；用户仍可用第 3 参数 target-dir 显式指定任意目录。
detect_skill_dir() {
  local project="$1"
  # 1) 项目内已有 skills 目录（任意受支持运行时）→ 优先复用
  local rt
  for rt in .claude/skills .codex/skills .cursor/skills .codeium/windsurf/skills .config/opencode/skills .gemini/skills .kimi/skills .zcode/skills; do
    if [[ -d "$project/$rt" ]]; then echo "$project/$rt"; return; fi
  done
  # 2) 项目内无 skills 目录 → 默认在项目内创建 .claude/skills/
  echo "$project/.claude/skills"
}

detect_runtime_name() {
  local project="$1"
  # 仅按项目内已有的 skills 目录判定运行时；不再因 $HOME 下有全局 skills 目录就误报。
  if [[ -d "$project/.claude/skills" ]]; then echo "Claude Code"
  elif [[ -d "$project/.codex/skills" ]]; then echo "Codex"
  elif [[ -d "$project/.cursor/skills" ]]; then echo "Cursor"
  elif [[ -d "$project/.codeium/windsurf/skills" ]]; then echo "Windsurf"
  elif [[ -d "$project/.config/opencode/skills" ]]; then echo "OpenCode"
  elif [[ -d "$project/.gemini/skills" ]]; then echo "Gemini CLI"
  elif [[ -d "$project/.kimi/skills" ]]; then echo "Kimi"
  elif [[ -d "$project/.zcode/skills" ]]; then echo "ZCode"
  else echo "通用（将在项目内创建 .claude/skills/）"
  fi
}

# ---- 统一解析 --upgrade / --profile（R125：两旗标任意顺序、可组合）----
# 旧实现先只看 $1 是否是 --upgrade、再循环 --profile：`--profile lite --upgrade ...`
# 落入未知旗标守卫误报（真实错误用法：`--profile` 必须紧贴 --upgrade 之前）。
MODE="create"
PROFILE="auto"
PROFILE_EXPLICIT=0
INDUSTRY=""
INDUSTRY_EXPLICIT=0
DRY_RUN=0
while [[ "${1:-}" == --* ]]; do
  case "$1" in
    --upgrade) MODE="upgrade"; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --profile) PROFILE="${2:?--profile 需要 auto|lite|standard|compliance}"; PROFILE_EXPLICIT=1; shift 2 ;;
    --industry) INDUSTRY="${2:?--industry 需要 finance|gov|medical|telecom|automotive|energy|industrial|payment|none}"; INDUSTRY_EXPLICIT=1; shift 2 ;;
    *) break ;;
  esac
done
case "$PROFILE" in
  auto|lite|standard|compliance) ;;
  *) echo "ERROR: --profile 仅支持 auto|lite|standard|compliance（收到: ${PROFILE}）" >&2; exit 1 ;;
esac
case "$INDUSTRY" in
  ""|none|finance|gov|medical|telecom|automotive|energy|industrial|payment) ;;
  *) echo "ERROR: --industry 仅支持 finance|gov|medical|telecom|automotive|energy|industrial|payment|none（收到: ${INDUSTRY}）" >&2; exit 1 ;;
esac
# --dry-run 是 --upgrade 的修饰旗标（R141 物化 openspec 1.15.0 update --dry-run）：
# 单独出现=用法错误 fail-closed，防「以为预演了其实创建了新技能」的语义滑落。
if [[ "$DRY_RUN" -eq 1 && "$MODE" != "upgrade" ]]; then
  echo "ERROR: --dry-run 仅可与 --upgrade 组合（升级预演）。创建模式无预演语义。" >&2
  exit 1
fi
_profile_rank() { case "$1" in lite) echo 1;; compliance) echo 3;; *) echo 2;; esac; }

# 未识别 flag 守卫。
# 此前任何不存在的 flag（如照旧文档对 generate-skill.sh 调 --review）会静默落入
# skill-name 位置——技能名成了 "--review"、目标技能目录被当项目根，在其内部嵌套生成
# .claude/skills/--review/ 垃圾骨架（污染交付物）。已知子命令均在上方独立拦截并 exit，
# 走到这里的参数只应是 <skill-name> <project-dir> [target-dir]——首参以 -- 开头即参数
# 错误，fail-closed 列出支持的旗标。
if [[ "${1:-}" == --* ]]; then
  echo "ERROR: 未知旗标 '$1'（generate-skill.sh 主模式只接受 <skill-name> <project-dir> [target-dir]）。" >&2
  echo "       支持的子命令/旗标：--upgrade [--dry-run] / --profile <auto|lite|standard|compliance> / --industry <name|none> / --inject-frameworks <dir> / --rollback-frameworks <dir> / --verify-completeness <dir> [--strict] / --mark-active <dir> / --render-tools <dir> [project-root] [tool] / --refresh <dir> [--commit-fp] / --check-framework-globs <dir> / --help / --version。" >&2
  echo "       注意：审查入口是 precheck.sh --review（generate-skill.sh 无 --review 旗标）。" >&2
  exit 1
fi

# WP-N1 项目级自适应判定：合规信号（等保/密评/个保法/金融/医疗关键词）→ compliance；
# 规模信号（文件数 <80）→ lite；其余 standard。
# WP-Q2 偏置方向修正（决策 18 修订）：
#   原"只升不降"让 lite 档几乎不被自动选中（auto 输出压缩到 standard/compliance 二选一）。
#   改为"信号明确才升档，模糊走默认 standard"：
#     - 合规关键词命中 → compliance（明确升档，不变）
#     - 文件数 <80 且无合规且非 monorepo 且依赖数 <20 → lite（明确降档）
#     - 探测失败/信号模糊（find 报错、依赖数不可读、边界不确定）→ standard（默认，不升不降）
#   质量优先的正确做法是"该 fail 的严格 fail"（strict 门禁真 fail），不是"档位一律往重选"。
# WP-P9 技术栈复杂度信号：形态信号（≥3 种形态）→ 升 standard；框架信号（≥20 个）→ 升 standard；
#   微服务信号（services/ 目录存在）→ 升 standard。优先级：合规 > 技术栈复杂度 > 规模。
# grep -c 无匹配仍输出 0；仅吞退出码，避免 "0\n0" 进入算术表达式。
_count_profile_matches() {
  local count
  count=$(grep -cE "$1" "$2" 2>/dev/null || true)
  [[ "$count" =~ ^[0-9]+$ ]] || count=0
  printf '%s\n' "$count"
}

auto_detect_profile() {
  local proj="$1" n sig forms fws msig result reason
  # WP-CogAudit：source profile-thresholds.conf（消除死配置--conf 声称被用但从未 source）
  # 变量用 ${VAR:-default} 兜底，conf 缺失或变量未设仍走默认值（保兼容）
  local _pthr="${BASE:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}/assets/profile-thresholds.conf"
  if [[ -f "$_pthr" ]]; then
    set +u; # shellcheck disable=SC1090
    source "$_pthr"; set -u
  fi
  local _lite_max=${PROFILE_LITE_MAX_FILES:-80}
  local _forms_thr=${PROFILE_FORMS_THRESHOLD:-3}
  local _fws_thr=${PROFILE_FRAMEWORKS_THRESHOLD:-20}
  # 合规信号（最强，命中即 compliance）：docs/ 与根 README 的关键词扫描（限量提速）
  sig=$(grep -rliE '等保|密评|GB/T[[:space:]]*39786|GB/T[[:space:]]*22239|个人信息保护|个保法|金融行业|医疗行业' \
        "$proj/docs" "$proj"/README* 2>/dev/null | head -1 || true)
  if [[ -n "$sig" ]]; then
    # 输出两行：第 1 行档位结果，第 2 行完整判定依据（R106 修复：理由只在函数内拼装，
    # 调用方曾自建理由串丢失框架信号等升档缘由——判定与理由单一来源，防再漂移）
    echo "compliance"
    echo "命中合规信号（等保/密评/个保法/金融/医疗关键词：${sig}）"
    return
  fi
  # 规模信号：文件数（head 截断加速，≥阈值即 standard；统计失败按 standard--默认不降）
  # _lite_max+1 截断：文件数 < _lite_max 才 lite，截断到 _lite_max+1 足够判定
  # 排除 AI 运行时留痕与生成技能目录（复生成/升级时 .claude/skills 自身会被计入——自引用膨胀）
  # R108-D2a：排除 target/（cargo 构建产物数千文件充数——rust-forge 实测干净树 20 文件
  # 因 target/ 被计成 81，「结论碰巧对、依据失真」掩盖同类项目误判；dist/ 同理已排）
  # R126-HIGH1：find|head 截断在 pipefail 下有 SIGPIPE(141) 面（head 取满退出后 find 继写，
  # 大仓触发时赋值 rc=141——当前调用上下文恰好吞掉，但换调用点即崩，属定时隐患）。管道尾
  # 加 || true 确定化（wc -l 已输出计数值，n 捕获不受影响）；下方 n 空/非数字兜底保留。
  n=$(find "$proj" -type f -not -path '*/.git/*' -not -path '*/node_modules/*' -not -path '*/dist/*' \
      -not -path '*/target/*' \
      -not -path '*/.claude/*' -not -path '*/.codex/*' -not -path '*/.swarm-yuan/*' \
      2>/dev/null | head -$((_lite_max + 1)) | wc -l | tr -d ' ' || true)
  n="${n:-$((_lite_max + 1))}"
  [[ "$n" =~ ^[0-9]+$ ]] || n=$((_lite_max + 1))
  if [[ "$n" -lt $_lite_max ]]; then result="lite"; else result="standard"; fi
  reason="规模信号：文件数 ${n}"

  # WP-P9 技术栈复杂度信号（明确升档，不模糊）
  # 形态信号：同时含 ≥3 种形态（前端 .vue/.jsx/.tsx + 后端 .py/.java/.go/.rb + 异步 .consumer./.handler. + 微服务 services/ + 桌面 .electron. 等）
  forms=0
  # 前端形态
  # WP-R Bug#1: find -print -quit 替代 find|head -1（避免 set -euo pipefail 下 SIGPIPE 崩溃）
  find "$proj" -type f \( -name "*.vue" -o -name "*.jsx" -o -name "*.tsx" \) -not -path '*/node_modules/*' -not -path '*/.git/*' -print -quit 2>/dev/null | grep -q . && forms=$((forms+1))
  # 后端形态（.py/.java/.go/.rb/.php/.kt + .rs/.cs/.swift；WP-CogAudit 补 .rs/.cs/.swift 漏检；.scala 暂无 framework-gates 门禁，不纳入形态判定）
  find "$proj" -type f \( -name "*.py" -o -name "*.java" -o -name "*.go" -o -name "*.rb" -o -name "*.php" -o -name "*.kt" -o -name "*.rs" -o -name "*.cs" -o -name "*.swift" \) -not -path '*/node_modules/*' -not -path '*/.git/*' -print -quit 2>/dev/null | grep -q . && forms=$((forms+1))
  # JS/TS 后端形态：package.json 声明 Node 服务框架（express/koa/nestjs/fastify 均在框架门禁支持面内，
  # 此前裸 .js 无法判前后端而漏计——纯前端 SPA 的 package.json 不含服务框架，不误计）
  _pkg_jsons=$(find "$proj" -name package.json -not -path '*/node_modules/*' 2>/dev/null || true)
  if [[ -n "$_pkg_jsons" ]]; then
    # xargs 防 -l 无操作数读 stdin 挂起；列表为空时不执行 grep。
    # R126-MED7：旧 `xargs grep -l | grep -q .` 在 grep -q 首行命中即退出后，上游继续写
    # 超过管道缓冲即 SIGPIPE(141)——pipefail 下命中反被判未命中，形态信号丢失（错档风险）。
    # 改完整捕获后判空（package.json 数量有限，无早退必要）。
    local _be_hit=""
    _be_hit=$(printf '%s\n' "$_pkg_jsons" | xargs grep -lE '"(express|koa|fastify|@nestjs/[a-z-]+|hapi|egg)"' 2>/dev/null || true)
    [[ -n "$_be_hit" ]] && forms=$((forms+1))
  fi
  # 异步/MQ 形态（含 consumer/handler/listener/subscriber 文件名；WP-CogAudit 补 handler 漏检）
  # handler 命名收紧：裸 *handler* 把 web 层 error-handler/request-handler 误计为异步形态（  # task-forge 实证 3 形态里 1 个是误报）；只认消息/事件/队列语义的 handler 命名
  find "$proj" -type f \( -name "*consumer*" -o -name "*listener*" -o -name "*subscriber*" -o -name "*message*handler*" -o -name "*event*handler*" -o -name "*queue*handler*" \) -not -path '*/node_modules/*' -not -path '*/.git/*' -print -quit 2>/dev/null | grep -q . && forms=$((forms+1))
  # 微服务形态（services/ 或 apps/ 多服务目录）
  # WP-R Bug#1: find -maxdepth 1 -mindepth 1 -type d 列目录后 wc -l，find 目录数有限不会触发 SIGPIPE；
  # 但原 head -2 截断在 pipefail 下有风险。改用 find ... -print -quit 两次判定 ≥2：先确认 services/ 有子目录，
  # 再用 wc -l 计数（无 head 截断）。services/apps 可能其一不存在，find 对不存在路径 stderr 已 2>/dev/null。
  if [[ -d "$proj/services" || -d "$proj/apps" ]]; then
    local _svc_n
    _svc_n=$(find "$proj/services" "$proj/apps" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
    [[ "$_svc_n" =~ ^[0-9]+$ && "$_svc_n" -ge 2 ]] && forms=$((forms+1))
  fi
  # 桌面/移动形态（electron/tauri/android/ios 目录）
  { [[ -d "$proj/electron" || -d "$proj/src-tauri" || -d "$proj/android" || -d "$proj/ios" ]]; } && forms=$((forms+1))
  # 框架信号：依赖文件中的框架数（package.json dependencies + pom.xml + go.mod 等，粗计）
  # R126-MED6：grep -c 计数捕获的两类坑——存在文件零匹配输出 "0" 但 exit 1（`|| echo 0`
  # 追加第二个 0，$(( )) 语法错中止）；文件不可读/不存在时无输出 exit 2（`|| true` 得空串，
  # $((fws + )) 同样语法错——旧实现 `|| echo 0` 对后者恰好正确、对前者必崩）。统一改
  # 临时变量 + `${:-0}` 空默认 + 非数字钳 0，两类输入都安全；最终 =~ 兜底保留。
  fws=0
  # R126 合流：取并行支 _count_profile_matches 统一 helper（单一安全计数实现=
  # 本族缺陷的结构性修法），点状 || true 版弃用。
  [[ -f "$proj/package.json" ]] && fws=$(_count_profile_matches '"[a-z@/][^"]+":[[:space:]]*"' "$proj/package.json")
  [[ -f "$proj/pom.xml" ]] && fws=$((fws + $(_count_profile_matches "<artifactId>" "$proj/pom.xml")))
  [[ -f "$proj/go.mod" ]] && fws=$((fws + $(_count_profile_matches "^[[:space:]]*[a-z]" "$proj/go.mod")))
  # R108-D2b：Cargo.toml 计入（原三清单缺位——纯 Rust 项目依赖信号恒 0，rust-forge 同形态
  # 后端只靠 .rs 形态分凑不够阈值）。粗计口径对齐 go.mod 家族：`name = value` 行（含
  # [package] 元数据 3 行，粗计容忍）。
  [[ -f "$proj/Cargo.toml" ]] && fws=$((fws + $(_count_profile_matches '^[[:space:]]*[a-zA-Z0-9_-]+[[:space:]]*=' "$proj/Cargo.toml")))
  # R108-D2b：子目录 package.json 计入（backend+web 前后端布局——原只看根，web/ 里的
  # react/vite 依赖不计；maxdepth 2 覆盖 web/frontend/app 常规布局，深嵌套 monorepo 走
  # forms/msig/monorepo 信号兜底）。粗计口径与根 package.json 同一正则。
  while IFS= read -r _subpkg; do
    [[ "$_subpkg" == "$proj/package.json" ]] && continue
    fws=$((fws + $(_count_profile_matches '"[a-z@/][^"]+":[[:space:]]*"' "$_subpkg")))
  done < <(find "$proj" -maxdepth 2 -name package.json -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null)
  [[ "$fws" =~ ^[0-9]+$ ]] || fws=0
  # 微服务信号：services/ 目录存在且含 ≥2 子目录
  msig=0
  if [[ -d "$proj/services" ]]; then
    local svc_cnt; svc_cnt=$(find "$proj/services" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
    [[ "$svc_cnt" =~ ^[0-9]+$ && "$svc_cnt" -ge 2 ]] && msig=1
  fi
  # 技术栈复杂度升档（明确信号才升，不模糊）
  # 形态/框架/微服务任一明确 → 升 standard（覆盖 lite 判定）
  if [[ $forms -ge $_forms_thr ]]; then
    result="standard"; reason="${reason}；形态信号：${forms} 种形态（≥${_forms_thr} -> 升 standard）"
  fi
  if [[ $fws -ge $_fws_thr ]]; then
    result="standard"; reason="${reason}；框架信号：${fws} 依赖（≥${_fws_thr} -> 升 standard）"
  fi
  if [[ $msig -eq 1 ]]; then
    result="standard"; reason="${reason}；微服务信号：services/ 含多服务（→ 升 standard）"
  fi
  # monorepo 信号（明确升档，不降 lite）
  if [[ -f "$proj/lerna.json" || -f "$proj/pnpm-workspace.yaml" || -f "$proj/turbo.json" ]]; then
    result="standard"; reason="${reason}；monorepo 信号（lerna/pnpm-workspace/turbo → 升 standard）"
  fi
  echo "$result"
  echo "${reason:-信号模糊（默认 standard）}"
}

# Windows 路径转换（.bat 包装器 %* 原样透传，C:\proj 在 Git Bash 反斜杠被吞、WSL 下非法路径）。
# 匹配 ^[A-Za-z]:[\\/] 的参数，Git Bash/MSYS2 用 cygpath -u，WSL 用 wslpath -u 转 POSIX。
# 不匹配的参数原样保留（POSIX 路径不受影响，零行为变化）；两工具都不可用时 warn 提示。
_win_path_to_posix() {
  local p="$1"
  [[ "$p" =~ ^[A-Za-z]:[\\/] ]] || { printf '%s' "$p"; return 0; }
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -u "$p"
  elif command -v wslpath >/dev/null 2>&1; then
    wslpath -u "$p"
  else
    echo "  ⚠ 检测到 Windows 路径 $p 但无 cygpath/wslpath 可转换，请改用 POSIX 路径（如 /c/proj 或 /mnt/c/proj）" >&2
    printf '%s' "$p"
  fi
}

SKILL_NAME="${1:?Usage: generate-skill.sh [--upgrade] [--profile lite|standard|compliance] <skill-name> <project-dir> [target-dir]}"
# R118：skill 名直接拼成目录路径，拒绝路径分隔符/空白/控制字符/./..，防写出目标目录之外。
case "$SKILL_NAME" in
  .|..|*/*|*\\*|*' '*|*$'\t'*|*$'\n'*|*$'\r'*)
    echo "ERROR: 非法 skill 名称「${SKILL_NAME}」——不得含路径分隔符、空白或控制字符" >&2
    exit 1 ;;
esac
PROJECT_DIR="${2:?Usage: generate-skill.sh [--upgrade] [--profile lite|standard|compliance] <skill-name> <project-dir> [target-dir]}"
PROJECT_DIR="$(_win_path_to_posix "$PROJECT_DIR")"
if [[ -z "${3:-}" ]]; then
  TARGET_DIR=$(detect_skill_dir "$PROJECT_DIR")
  RUNTIME_NAME=$(detect_runtime_name "$PROJECT_DIR")
  echo "检测到运行环境: ${RUNTIME_NAME}"
  echo "目标 skill 目录: ${TARGET_DIR}"
else
  TARGET_DIR="$3"
  TARGET_DIR="$(_win_path_to_posix "$TARGET_DIR")"
fi
# 回归发现#21（2026-08-27 第九轮边缘形态回归）：第 4+ 位置参数被静默丢弃——后置
# `--profile compliance`（标志位须前置，后置沦为多余位置参数）与不存在的 `--auto`
# 均被吞掉：用户以为拿到 compliance 实际生成 lite（静默错档）。多余参数显式报错。
if [[ $# -ge 4 ]]; then
  _extra_args="$4"
  [[ $# -gt 4 ]] && _extra_args="$4 ...（共 ${#} 个参数）"
  echo "ERROR: 多余参数「${_extra_args}」——用法仅接受 3 个位置参数（skill-name project-dir [target-dir]）；标志位（--profile/--upgrade 等）须置于位置参数之前；无 --auto 标志（自动检测默认开启）" >&2
  exit 1
fi

[[ ! -d "$PROJECT_DIR" ]] && { echo "ERROR: 项目目录不存在: $PROJECT_DIR"; exit 1; }
# 先校验重写语法，防止第一份目标模板已被覆盖才发现参数非法。
if [[ -n "${SKILLS_PATH_REWRITE:-}" ]] && ! sed -e "$SKILLS_PATH_REWRITE" </dev/null >/dev/null; then
  echo "ERROR: SKILLS_PATH_REWRITE 表达式无效，未修改技能" >&2
  exit 1
fi
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"
mkdir -p "$TARGET_DIR"
TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"
SKILL_DIR="$TARGET_DIR/$SKILL_NAME"
# 续传与默认升级均继承现有档；显式 auto 才重新判定。
_existing_profile=""
if [[ -f "$SKILL_DIR/SKILL.md" ]]; then
  _existing_profile=$(awk 'NR == 1 && $0 == "---" { fm=1; next } fm && $0 == "---" { exit } fm && /^profile: / { sub(/^profile: */, ""); print; exit }' "$SKILL_DIR/SKILL.md")
  case "$_existing_profile" in
    lite|standard|compliance) [[ "$PROFILE_EXPLICIT" -eq 0 ]] && PROFILE="$_existing_profile" ;;
    *) _existing_profile="" ;;
  esac
fi

# auto 档解析为具体档（在 PROJECT_DIR 校验后、骨架创建前；输出判定依据供用户评估）
# R106 修复：原调用方在此重复实现一遍信号计算来自建理由串，且丢了函数内独有的
# 框架信号/微服务信号/monorepo 升档缘由（go.mod 26 依赖升 standard 时打印只剩
# "文件数 35（<80 → lite）"——判定依据与结论自相矛盾）。判定与理由合一到
# auto_detect_profile（两行输出），调用方只消费不再重算。
if [[ "$PROFILE" == "auto" ]]; then
  _detected=$(auto_detect_profile "$PROJECT_DIR")
  PROFILE=$(printf '%s\n' "${_detected}" | sed -n 1p)
  _auto_reason=$(printf '%s\n' "${_detected}" | sed -n 2p)
  [[ -n "${_auto_reason}" ]] || _auto_reason="信号模糊（默认 standard）"
  echo "profile auto 判定: ${PROFILE}（${_auto_reason}；信号明确才升档，模糊走默认 standard。显式 --profile 可覆盖）"
fi
if [[ "$PROFILE" == "compliance" && "$INDUSTRY_EXPLICIT" -eq 0 ]]; then
  echo "  ⚠ compliance 档未指定 --industry；按 none 处理（建议 --industry <name>|none 显式声明）"
fi

# auto 档时探测框架，写入 precheck.arch.conf 的 ACTIVE_FRAMEWORKS（standard+ 档）
# 替代 AI 手工探查 §D.0.5。lite 档不拷 precheck.arch.conf，跳过。
_wq3_script="$(cd "$(dirname "$0")" && pwd)/detect-frameworks.sh"
if [[ "$PROFILE" != "lite" && -f "$_wq3_script" ]]; then
  _dfw_out=$(bash "$_wq3_script" "$PROJECT_DIR" 2>/dev/null || true)
  if [[ -n "$_dfw_out" ]]; then
    # WP-R Bug#1: printf|grep|head -1 上游 printf 输出有限(几行)无 SIGPIPE 风险,但 pipefail 下防御性 || true
    _dfw_fws=$(printf '%s\n' "$_dfw_out" | grep '^ACTIVE_FRAMEWORKS=' | head -1 || true)
    if [[ -n "$_dfw_fws" && "$_dfw_fws" != 'ACTIVE_FRAMEWORKS=()' ]]; then
      echo "框架探测: $_dfw_fws"
    fi
  fi
fi

SKILL_DIR="$TARGET_DIR/$SKILL_NAME"
# R126：ASSETS_DIR/SRC_REF/SRC_SCRIPTS 已前置到文件头部分配（子命令分发点之前），此处不重复。
SWARM_YUAN_STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date +%Y-%m-%dT%H:%M:%SZ)"
# R118：备份目录名去掉冒号（Windows 文件系统禁止 `:`，旧版 --upgrade 在建备份时即失败）。
SWARM_YUAN_STAMP_SAFE=$(printf '%s' "$SWARM_YUAN_STAMP" | tr -d ':-')
# 版本溯源（八轮复盘 install.sh source_version 对齐）：生成器自身 git describe，
# 与 install.sh L123-124 同哲学；非 git 场景（zip 下载）降级 "unknown"，不阻塞生成。
# 不带 --dirty（跨平台：Windows Git Bash 默认 autocrlf=true 致干净 checkout 误报
# -dirty，污染版本字符串；版本演进比对只看 tag，不依赖 dirty 标记）。
SWARM_YUAN_SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SWARM_YUAN_SRC_VERSION="$(git -C "$SWARM_YUAN_SRC_DIR" describe --tags --always 2>/dev/null || echo "unknown")"

# 按 UNIVERSAL_FILES 清单复制通用文件（create 全量；upgrade 跳过 precheck.conf 保留用户配置）
# 可选环境变量 SKILLS_PATH_REWRITE：sed 表达式，复制后逐文件就地应用（缺省空=不重写）。
# 用途：目标运行时的 skills 目录不是 .claude/skills 时做路径重写，
#       如 SKILLS_PATH_REWRITE='s|\.claude/skills|.agents/skills|g'（非标准 skills 目录实例）。
# ============================================================
# R128：copy_universal_templates 行为保持式拆分——跳过判定/源解析/逐条落盘/旧位 hooks
# 清理/chmod/.bat 拷贝/.gitignore 声明各自成子函数（_cut_*）。文案/退出码/落盘字节与
# 拆分前逐字一致；_cut_install_one 在编排器中直调（不经 &&/||/命令替换包裹）——cp/sed 等
# 未兜底失败在 set -e 下的「当场中止」语义与拆分前逐位一致（包裹会关闭子函数内 -e）。
# ============================================================
# 跳过判定：resume 只补缺失；upgrade 保留三份生成期必读 conf 与用户已改写的可填充模板。
_cut_should_skip() {  # $1=dir $2=mode $3=dest → rc 0=照常拷贝 1=跳过本条（须打印的提示已打）
  local dir="$1" mode="$2" dest="$3"
  # resume：断点续传只补缺失文件，已有一律不覆盖（WP-H）
  [[ "$mode" == "resume" && -f "$dir/$dest" ]] && return 1
  # precheck.conf 生成期必读文件：create 模式覆盖模板；upgrade 模式保留用户配置（由 merge_precheck_conf 增量补缺失变量）
  [[ "$mode" == "upgrade" && -f "$dir/$dest" && ( "$dest" == "scripts/precheck.conf" || "$dest" == "scripts/precheck.arch.conf" || "$dest" == "scripts/precheck.compliance.conf" ) ]] && return 1
  # R118：用户可填充模板（snippets/mcp-tools）——upgrade 时与模板不同即保留。
  # 旧版只看“是否还有（填入 占位”，部分填充（已写 90% 但留一处占位）会被整文件覆盖。
  if [[ "$mode" == "upgrade" && -f "$dir/$dest" ]]; then
    local _uff _uff_src
    for _uff in ${USER_FILLABLE_FILES[@]+"${USER_FILLABLE_FILES[@]}"}; do
      if [[ "$dest" == "$_uff" ]]; then
        _uff_src="$ASSETS_DIR/${dest##*/}"
        if [[ -f "$_uff_src" ]] && ! cmp -s "$dir/$dest" "$_uff_src"; then
          echo "  ✓ 保留用户已修改模板: ${dest}（与模板不同，跳过覆盖；重置请删该文件再 upgrade）"
          return 1
        fi
      fi
    done
  fi
  return 0
}

# 源解析：按源类别映射实际源路径（stdout）。未知类别打 ERROR 并返回空串——编排器见空
# 即 return 1（不用非零返回码：bash 3.2 下 $( ) 赋值对子函数内 return 码的传播不稳，
# 空串哨兵在两类语义下行为一致）。
_cut_src_for() {  # $1=entry $2=dest $3=kind → stdout 源路径（空=未知类别，已报错）
  local entry="$1" dest="$2" kind="$3"
  case "$kind" in
    # assets 类源文件统一平铺在 $ASSETS_DIR/（assets/precheck.sh 等）。
    # dest 形态：scripts/precheck.sh → 源 = assets/precheck.sh（取 basename，文件平铺在 assets/）。
    # （hooks 不再走本分支——audit-claims-reality 起 dest 归一 scripts/，由 hook 分支映射 assets/hooks/ 源。）
    # 历史 bug：assets) src=$ASSETS_DIR/${dest#assets/} —— dest=scripts/precheck.sh 时
    # ${dest#assets/} 不剥前缀（不以 assets/ 开头），得 $ASSETS_DIR/scripts/precheck.sh（不存在），
    # cp 失败致 scripts/ 目录整批漏拷（precheck.sh/gates-*.sh/state-machine.sh 等）。
    # 验证器从未跑 generate-skill create（run-e2e.sh 手拼骨架绕过此路径），故长期未暴露。
    assets)
      if [[ "$dest" == assets/* ]]; then
        printf '%s' "$ASSETS_DIR/${dest#assets/}"
      else
        printf '%s' "$ASSETS_DIR/${dest##*/}"
      fi
      ;;
    ref)    printf '%s' "$SRC_REF/${dest##*/}" ;;
    refd)   printf '%s' "DISTILL:${dest##*/}" ;;   # R125：净化后分发（吸收叙述段剥离，见 distill-references.sh）
    rules)  printf '%s' "$ASSETS_DIR/$dest" ;;   # rules.d 规则数据（dest=rules.d/xxx.rules → assets/rules.d/xxx.rules）
    onto)   printf '%s' "$ASSETS_DIR/ontology/$(basename "$dest")" ;;  # R16-A：本体层（dest=references/ontology/x.md → assets/ontology/x.md）
    hook)   printf '%s' "$ASSETS_DIR/hooks/${dest##*/}" ;;  # audit-claims-reality：hooks 源在 assets/hooks/，dest 归一 scripts/
    gen)    printf '%s' "$SRC_SCRIPTS/${dest##*/}" ;;
    *) echo "ERROR: UNIVERSAL_FILES 未知源类别: $entry" >&2 ;;
  esac
}

# 逐条落盘：DISTILL 净化 / 升档 conf 保既有值补齐 / 常规 cp，随后 spec-template 档位
# 裁剪与可选 SKILLS_PATH_REWRITE 重写。
_cut_install_one() {  # $1=dir $2=dest $3=src $4=mode → rc 0/1（1=重写失败，已报错）
  local dir="$1" dest="$2" src="$3" mode="$4"
  # dest 可能含子目录（rules.d/bash-advance.rules、references/ontology/objects.md），
  # mkdir -p 父目录再 cp，否则 cp 报"No such file or directory"
  # （顶层 mkdir 只建了 references/assets/scripts/hooks/commands，子目录不在内）。
  mkdir -p "$dir/$(dirname "$dest")"
  if [[ "$src" == DISTILL:* ]]; then
    bash "$SRC_SCRIPTS/distill-references.sh" "$SRC_REF" "${src#DISTILL:}" "$dir/$dest" || cp "$SRC_REF/${src#DISTILL:}" "$dir/$dest"
  elif [[ "$mode" == "upgrade" && "$dest" == scripts/precheck*.conf ]]; then
    # 升档新增层按模板补齐，但不可用空默认值覆盖旧主配置/用户 patch 中的值。
    local declared existing_conf
    declared=""
    for existing_conf in "$dir/scripts/precheck.conf" "$dir/scripts/precheck.arch.conf" "$dir/scripts/precheck.compliance.conf" "$dir/scripts/precheck.patch.conf"; do
      [[ -f "$existing_conf" ]] || continue
      declared="$declared $(sed -nE 's/^([A-Z_][A-Z0-9_]*)=.*/\1/p' "$existing_conf" | tr '\n' ' ')"
    done
    awk -v declared="$declared" '
      BEGIN { n=split(declared, names, /[[:space:]]+/); for (i=1; i<=n; i++) present[names[i]]=1 }
      { name=$0; sub(/=.*/, "", name)
        if (/^[A-Z_][A-Z0-9_]*=/ && present[name]) print "# 升档保留既有配置: " $0
        else print
      }
    ' "$src" > "$dir/$dest"
  else
    cp "$src" "$dir/$dest"
  fi
  # spec-template §14-§18 认知扩展包按 profile 门控
  # lite/standard 裁掉 §14-§18（节不存在 → check_cognition SKIP 披露）；compliance 保留全部。
  # 裁剪范围：从门控注释 <!-- profile-gate: standard+ ... --> 起，到 ## 19. 止（不含 §19）。
  # 对 create/upgrade/resume 任意模式均生效（凡拷贝 spec-template 即按 profile 分层）。
  if [[ "$dest" == "assets/spec-template.md" && "$PROFILE" != "compliance" ]]; then
    awk '
      /^<!-- profile-gate: standard\+/{ skip=1; next }
      /^## 14\. /{ skip=1 }
      /^## 19\. /{ skip=0 }
      !skip { print }
    ' "$dir/$dest" > "$dir/$dest.tmp" && mv "$dir/$dest.tmp" "$dir/$dest"
  fi
  # 路径重写（三平台兼容：sed -i.bak + rm，与 tests/e2e/run-e2e.sh 同款写法）
  if [[ -n "${SKILLS_PATH_REWRITE:-}" ]]; then
    sed -i.bak -e "$SKILLS_PATH_REWRITE" "$dir/$dest" || { echo "ERROR: SKILLS_PATH_REWRITE 应用失败: $dir/$dest" >&2; return 1; }
    rm -f "$dir/$dest.bak"
  fi
  return 0
}

# audit-claims-reality：清理旧版生成物残留的 assets/hooks/*.sh（dest 已归一 scripts/）。
# 仅当 scripts/ 新位存在同名文件才删旧位（幂等；upgrade/create 后旧位即残留死文件，
# 留着会让 AI 误读"hooks 在 assets/hooks/"的旧布局）。
# R126：清理清单从 UNIVERSAL_FILES 的 kind=hook 条目派生，不再手抄——旧硬编码 6 个
# 而清单有 8 条（spec-first-pre-commit/spec-first-bridge 漏清，旧生成物两桥残留永不清除）；
# 与 .bat 清单同属「手工镜像 UNIVERSAL_FILES」漂移面（S15 已补过一次漂移）。
_cut_cleanup_old_hooks() {  # $1=skill_dir
  local dir="$1"
  local _hb _hb_entry
  for _hb_entry in "${UNIVERSAL_FILES[@]}"; do
    # 条目形态：<目标>|hook 或 <目标>|hook|<最低档>——case 中 \| 为字面竖线
    case "$_hb_entry" in
      *\|hook|*\|hook\|*)
        _hb="$(basename "${_hb_entry%%|*}")"; _hb="${_hb%.sh}"
        if [[ -f "$dir/scripts/${_hb}.sh" && -f "$dir/assets/hooks/${_hb}.sh" ]]; then
          rm -f "$dir/assets/hooks/${_hb}.sh"
        fi ;;
    esac
  done
  # assets/hooks/ 清空后移除空目录（rmdir 仅删空目录，非空静默跳过）
  rmdir "$dir/assets/hooks" 2>/dev/null || true
}

# chmod +x 所有 .sh（四轮复盘 P0 修复）：原写法 `chmod +x "$dir/assets/"*.sh "$dir/scripts/"*.sh`
# 在 lite 档下必然失败——lite 档 UNIVERSAL_FILES 只拷 assets/ 下的 .md/.conf（无任何 .sh），
# glob 无匹配时 chmod 报 "No such file or directory"，set -euo pipefail 直接中断生成，
# 导致 lite 档（auto 对 <80 文件小项目的默认判定）产物残缺不可用。
# 用 find -exec 替代 glob：目录不存在或无 .sh 时静默跳过，不中断。
_cut_chmod_scripts() {  # $1=skill_dir
  local dir="$1"
  local _cd
  for _cd in assets scripts; do
    [[ -d "$dir/$_cd" ]] || continue
    find "$dir/$_cd" -maxdepth 1 -name '*.sh' -exec chmod +x {} + 2>/dev/null || true
  done
}

# Windows .bat 包装器（让 Windows 用户也能直接运行，三平台兼容；缺失则跳过）
# 设 SKIP_BAT=1 可跳过 .bat 复制（macOS/Linux 用户无需 .bat，让 skill 目录更干净）
_cut_copy_bats() {  # $1=skill_dir
  local dir="$1"
  if [[ "${SKIP_BAT:-0}" != "1" ]]; then
    # scripts/ 下的 .bat（install/generate-skill/self-check/precheck/state-machine/trace-log/cost-report/detect-frameworks）
    # S15 修复：补 cost-report + detect-frameworks（原缺，违反 SKILL.md:38 三平台兼容铁律）
    local b src
    for b in install generate-skill self-check precheck state-machine trace-log cost-report detect-frameworks memory-writeback; do
      src="$SRC_SCRIPTS/$b.bat"
      [[ "$b" == "install" ]] && src="$SRC_SCRIPTS/../install.bat"
      [[ "$b" == "trace-log" || "$b" == "memory-writeback" ]] && src="$ASSETS_DIR/$b.bat"
      if [[ -f "$src" ]]; then cp "$src" "$dir/scripts/$b.bat" 2>/dev/null || true; fi
    done
    # assets/ 下的 .bat（branch-setup/env-setup）
    for b in branch-setup env-setup; do
      if [[ -f "$ASSETS_DIR/$b.bat" ]]; then cp "$ASSETS_DIR/$b.bat" "$dir/assets/$b.bat" 2>/dev/null || true; fi
    done
  fi
}

# R25-D1：升级备份目录不入库——create/upgrade/resume 三路径都在 skill 目录幂等声明
# .gitignore 忽略 .upgrade-backup-*/（真实执勤暴露：备份目录被 git add -A 整体吸入版本库，
# 单次 upgrade 制造 1.8 万行垃圾提交）。用户自有条目不受影响（只追加不覆盖）。
_cut_ensure_gitignore() {  # $1=skill_dir
  local dir="$1"
  if ! LC_ALL=C grep -qF '.upgrade-backup-' "$dir/.gitignore" 2>/dev/null; then
    {
      [[ -f "$dir/.gitignore" ]] || printf '# swarm-yuan 生成器维护区（机器覆盖安全；用户忽略规则请写项目根 .gitignore）\n'
      printf '.upgrade-backup-*/\n'
    } >> "$dir/.gitignore"
  fi
}

copy_universal_templates() {
  local dir="$1"
  local mode="${2:-create}"   # create=覆盖 precheck.conf（新建骨架）；upgrade=不覆盖（保留用户配置，由 merge_precheck_conf 增量补）；resume=断点续传（已有文件一律不覆盖）
  local entry dest kind minprof src
  for entry in "${UNIVERSAL_FILES[@]}"; do
    dest="${entry%%|*}"; kind="${entry#*|}"; minprof="${kind#*|}"; kind="${kind%%|*}"
    [[ "$minprof" == "$kind" ]] && minprof="standard"   # 无第三段 = standard
    # profile 过滤：文件最低档 > 当前档则跳过（WP-E）
    [[ $(_profile_rank "$minprof") -gt $(_profile_rank "$PROFILE") ]] && continue
    if _cut_should_skip "$dir" "$mode" "$dest"; then :; else continue; fi
    src=$(_cut_src_for "$entry" "$dest" "$kind")
    if [[ -z "$src" ]]; then return 1; fi   # 未知源类别——_cut_src_for 已打 ERROR
    # 直调不包裹：-e 语义与拆分前一致（见 _cut_* 头注）
    _cut_install_one "$dir" "$dest" "$src" "$mode"
  done
  _cut_cleanup_old_hooks "$dir"
  _cut_chmod_scripts "$dir"
  _cut_copy_bats "$dir"
  _cut_ensure_gitignore "$dir"
}

# 只检查生成器将写入的路径；用户额外的只读符号链接继续保留。
_validate_generator_writes() {
  local dir="$1" entry path part tier
  [[ ! -L "$dir" ]] || { echo "ERROR: 技能目录不可为符号链接: $dir" >&2; return 1; }
  for entry in "${UNIVERSAL_FILES[@]}" "${PROJECT_SPECIFIC_FILES[@]}" \
      .swarm-yuan-version .gitignore scripts/precheck.patch.conf references/framework-knowledge.md \
      settings.local.json .mcp.json hooks/hooks.json commands/spec.md commands/precheck.md commands/explore.md \
      .swarm-yuan/effects .universal-files-index.md assets/hooks scripts/install.bat scripts/generate-skill.bat scripts/self-check.bat \
      scripts/precheck.bat scripts/state-machine.bat scripts/trace-log.bat scripts/cost-report.bat \
      scripts/detect-frameworks.bat scripts/memory-writeback.bat assets/branch-setup.bat assets/env-setup.bat; do
    path="${entry%%|*}"
    if [[ "$entry" == *'|'* ]]; then
      tier="${entry##*|}"
      case "$tier" in lite|standard|compliance) ;; *) tier=standard ;; esac
      [[ $(_profile_rank "$tier") -gt $(_profile_rank "$PROFILE") ]] && continue
    else
      # 已有项目知识只读保留；SKILL.md 元数据、配置、注入产物会更新。
      case "$path" in
        references/workflow.md|references/codebase.md|references/dev-guide.md|references/release.md|references/reference-manual.md|references/recipes.md|references/relations.jsonl|settings.local.json|.mcp.json|hooks/hooks.json|commands/*)
          [[ -f "$dir/$path" ]] && continue ;;
      esac
    fi
    while [[ -n "$path" && "$path" != . ]]; do
      part="$dir/$path"
      [[ ! -L "$part" ]] || { echo "ERROR: 待写路径不可为符号链接: $part" >&2; return 1; }
      [[ "$path" == */* ]] || break
      path="${path%/*}"
    done
  done
}

# 整个升级在同文件系统副本中完成；发布失败时 EXIT trap 恢复原目录。
_upgrade_cleanup() {
  local rc=$?
  trap - EXIT
  if [[ -n "${_upgrade_previous:-}" && -d "$_upgrade_previous" ]]; then
    # 发布后、归档前仍未提交；信号可落在任意两条 mv 之间。
    if [[ -e "$_upgrade_live" || -L "$_upgrade_live" ]]; then
      if ! mv "$_upgrade_live" "$_upgrade_stage/uncommitted"; then
        echo "ERROR: 无法移开未提交副本；原技能完整保留在 $_upgrade_previous" >&2
        exit 1
      fi
    fi
    if ! mv "$_upgrade_previous" "$_upgrade_live"; then
      echo "ERROR: 自动恢复失败；原技能完整保留在 $_upgrade_previous" >&2
      exit 1
    fi
  fi
  if [[ -n "${_upgrade_stage:-}" && -d "$_upgrade_stage" ]]; then
    rm -rf "$_upgrade_stage"
  fi
  exit "$rc"
}

_publish_upgrade() {
  # 先把原目录移到可恢复位置，再发布已完成的副本。路径均在同一父目录。
  _upgrade_previous="$(mktemp -d "$TARGET_DIR/.swarm-yuan-previous.XXXXXX")"
  rmdir "$_upgrade_previous"
  mv "$_upgrade_live" "$_upgrade_previous"
  if ! mv "$SKILL_DIR" "$_upgrade_live"; then
    echo "ERROR: 升级发布失败，恢复原技能" >&2
    return 1
  fi
  SKILL_DIR="$_upgrade_live"
  # 完整原件归档，包含不在 UNIVERSAL_FILES 中的元数据与用户内容。
  backup_dir="$SKILL_DIR/.upgrade-backup-${SWARM_YUAN_STAMP_SAFE}-${_upgrade_previous##*.}"
  if ! mv "$_upgrade_previous" "$backup_dir"; then
    # 已发布副本先退回暂存，再让 EXIT 恢复原技能。
    mv "$SKILL_DIR" "$_upgrade_stage/skill"
    return 1
  fi
  _upgrade_previous=""
  # 既有备份已经保留在新技能根；归档原件不再嵌套这些副本。
  local old_backup
  for old_backup in "$backup_dir"/.upgrade-backup-*/; do
    [[ -d "$old_backup" ]] || continue
    rm -rf "$old_backup" || echo "  ⚠ 旧备份重复副本清理失败: $old_backup" >&2
  done
  echo "=== 升级完成 ==="
  echo "  备份: $backup_dir"
  echo "  profile: ${PROFILE}；下一步: AI 检查新增内容 + 运行门禁验证"
}

_dryrun_report() {  # $1=live（升级前原件） $2=staged（升级后暂存副本）
  # R141 物化 openspec 1.15.0 `update --dry-run` 变更预演：走完整升级流程后
  # 对比原件与升级副本，报告将 add/change/delete 的文件三态清单——不写入任何
  # 文件（暂存副本随 EXIT 清理）。与在途状态门互补：门管「现在能不能升」，
  # 预演管「升了会动什么」。
  local live="$1" staged="$2" line f rel _c
  local -a adds=() chgs=() dels=()
  while IFS= read -r line; do
    case "$line" in
      "Only in "*": "*)
        f="${line#Only in }"; rel="${f%%: *}"
        if [[ "$rel" == "$staged" ]]; then
          adds+=("${line##*: }")
        elif [[ "$rel" == "$staged"/* ]]; then
          adds+=("${rel#$staged/}/${line##*: }")
        elif [[ "$rel" == "$live" ]]; then
          dels+=("${line##*: }")
        elif [[ "$rel" == "$live"/* ]]; then
          dels+=("${rel#$live/}/${line##*: }")
        fi
        ;;
      "Files "*" and "*" differ"|"Binary files "*" and "*" differ")
        f="${line#Files }"; f="${f#Binary files }"; f="${f%% and *}"
        chgs+=("${f#$live/}")
        ;;
    esac
  done < <(diff -rq "$live" "$staged" 2>/dev/null || true)
  echo "=== DRY-RUN 预演报告（--dry-run：未写入任何文件） ==="
  echo "  对比: ${live} vs 升级后暂存副本（profile=${PROFILE}）"
  echo "  结果: change ${#chgs[@]} | add ${#adds[@]} | delete ${#dels[@]}"
  for _c in ${chgs[@]+"${chgs[@]}"}; do echo "    change  ${_c}"; done
  for _c in ${adds[@]+"${adds[@]}"};  do echo "    add     ${_c}"; done
  for _c in ${dels[@]+"${dels[@]}"};  do echo "    delete  ${_c}"; done
  echo "  实际升级: 去掉 --dry-run 重跑。本次预演未改动技能目录与项目任何文件。"
}

# 行业层：create 由 conf-render --industry 渲染；upgrade 用本函数增量加载，
# 不重渲染其他 conf（保留用户配置）。显式 none 表示不改动既有行业层。
_apply_industry_profile() {  # $1=skill_dir $2=industry
  local skill_dir="$1" industry="$2" src conf line patch
  [[ -z "$industry" || "$industry" == "none" ]] && return 0
  src="$ASSETS_DIR/industry-profiles/${industry}.conf"
  [[ -f "$src" ]] || { echo "ERROR: 未知行业 profile: ${industry}" >&2; return 1; }
  conf="$skill_dir/scripts/precheck.conf"
  [[ -f "$conf" ]] || { echo "ERROR: precheck.conf 不存在: $conf" >&2; return 1; }
  cp "$src" "$skill_dir/scripts/precheck.industry.conf"
  line='[[ -f "${_conf_self_dir}/precheck.industry.conf" ]] && source "${_conf_self_dir}/precheck.industry.conf" || true'
  if grep -qF 'precheck.industry.conf' "$conf" 2>/dev/null; then
    echo "  ✓ 行业 profile 已存在: ${industry}"
    return 0
  fi
  patch='[[ -f "$_conf_self_dir/precheck.patch.conf" ]] && source "$_conf_self_dir/precheck.patch.conf" || true'
  if grep -qF 'precheck.patch.conf' "$conf" 2>/dev/null; then
    awk -v ind="$line" -v pat="$patch" '$0 == pat { print ind } { print }' "$conf" > "$conf.tmp" && mv "$conf.tmp" "$conf"
  else
    printf '\n# industry profile（由 generate-skill --industry 生成）\n%s\n' "$line" >> "$conf"
  fi
  echo "  ✓ 行业 profile 已加载: ${industry}"
}

# ============================================================
# 升级模式
# ============================================================
if [[ "$MODE" == "upgrade" ]]; then
  [[ ! -d "$SKILL_DIR" ]] && { echo "ERROR: 目标技能不存在: $SKILL_DIR"; exit 1; }
  [[ -f "$SKILL_DIR/SKILL.md" ]] || { echo "ERROR: 目标目录缺少 SKILL.md，请用创建命令续传: $SKILL_DIR" >&2; exit 1; }
  # R140 在途状态门（吸收 comet 0.5.0 升级门：升级即破坏性变更，在途任务先收口）。
  # 状态机停在中间阶段时升级会中途换血模板与门禁脚本（任务前后版本斜切），fail-closed；
  # 无状态文件 / 仅注册（open） / 已归档（archive）放行；显式豁免走环境变量。
  # R141 --dry-run 例外：预演零写入、无斜切风险，在途态放行（方便预览升级面）。
  if [[ "$DRY_RUN" -eq 0 && -z "${SWARM_YUAN_UPGRADE_ALLOW_INFLIGHT:-}" && -f "${PROJECT_DIR}/.swarm-yuan/state.yaml" ]]; then
    _if_phase="$(grep -m1 '^phase:' "${PROJECT_DIR}/.swarm-yuan/state.yaml" 2>/dev/null | sed 's/^phase:[[:space:]]*//' | tr -d '[:space:]' || true)"
    case "$_if_phase" in
      ""|open|archive) ;;
      *)
        _if_change="$(grep -m1 '^change:' "${PROJECT_DIR}/.swarm-yuan/state.yaml" 2>/dev/null | sed 's/^change:[[:space:]]*//' | sed 's/[[:space:]]*$//' || true)"
        echo "ERROR: 项目 ${SKILL_NAME} 有在途任务（.swarm-yuan/state.yaml phase=${_if_phase} change=${_if_change:-?}）。" >&2
        echo "       升级会中途替换模板与门禁脚本（任务前后版本斜切）。请先归档在途任务（scripts/state-machine.sh transition archive），" >&2
        echo "       或确认接受斜切后设 SWARM_YUAN_UPGRADE_ALLOW_INFLIGHT=1 重试。" >&2
        exit 2
        ;;
    esac
  fi
  _validate_generator_writes "$SKILL_DIR"
  echo "=== 升级: $SKILL_DIR ==="
  echo "  profile: $PROFILE"
  # dry-run 预演不落 trace 台账（trace-log 写 PROJECT_DIR/.swarm-yuan/trace.jsonl，
  # 预演承诺项目零写入）；暂存目录也放系统 TMPDIR 而非 TARGET_DIR。
  [[ "$DRY_RUN" -eq 0 ]] && trace_tool "upgrade" "$SKILL_DIR"
  _upgrade_live="$SKILL_DIR"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    _upgrade_stage="$(mktemp -d "${TMPDIR:-/tmp}/swarm-yuan-upgrade-dryrun.XXXXXX")"
  else
    _upgrade_stage="$(mktemp -d "$TARGET_DIR/.swarm-yuan-upgrade.XXXXXX")"
  fi
  _upgrade_previous=""
  trap _upgrade_cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  cp -Rp "$SKILL_DIR" "$_upgrade_stage/skill"
  SKILL_DIR="$_upgrade_stage/skill"
  echo "=== 2. 覆盖通用模板（precheck.conf 保留用户配置，不覆盖）==="
  [[ -n "${SKILLS_PATH_REWRITE:-}" ]] && echo "  （应用 SKILLS_PATH_REWRITE: ${SKILLS_PATH_REWRITE}）"
  copy_universal_templates "$SKILL_DIR" upgrade
  echo "  ✓ 已更新（precheck.conf 保留，precheck.sh 已覆盖）"
  echo "=== 2.5 增量合并 precheck.conf（补缺失的 requires_conf 变量占位）==="
  merge_precheck_conf "$SKILL_DIR"
  _relocate_project_root "$SKILL_DIR"
  _apply_industry_profile "$SKILL_DIR" "$INDUSTRY" || exit 1
  # F3：用户覆盖层骨架——upgrade 不覆盖用户 patch（_write_if_absent），仅旧版 skill 无此文件时补建
  if [[ ! -f "$SKILL_DIR/scripts/precheck.patch.conf" ]]; then
    cat > "$SKILL_DIR/scripts/precheck.patch.conf" <<'PEOF'
# precheck.patch.conf —— 用户覆盖层（F3 分层 patch）
# 用法：在此覆盖任意生成变量（后 source 即胜出），例：
#   SENSITIVE_TOOL=builtin          # 覆盖 core 层的 auto
#   ACTIVE_FRAMEWORKS=("vue" "koa") # 覆盖 arch 层框架清单
# 请只写覆盖行，不要复制整份生成 conf——升级时本文件原样保留。
PEOF
    echo "  ✓ 已补建 precheck.patch.conf（用户覆盖层骨架）"
  fi
  echo "=== 3. 保留项目特定文件 ==="
  for f in "${PROJECT_SPECIFIC_FILES[@]}"; do [[ -f "$SKILL_DIR/$f" ]] && echo "  ✓ $f"; done
  # settings.local.json / .mcp.json 不存在则生成（存在则保留用户定制，不覆盖）
  for cfg in settings.local.json .mcp.json; do
    if [[ ! -f "$SKILL_DIR/$cfg" ]]; then
      echo "  → 补生成 ${cfg}（旧版生成器未产出）"
      case "$cfg" in
        settings.local.json)
          cat > "$SKILL_DIR/$cfg" <<'SEOF'
{
  "permissions": {
    "allow": [
      "Bash(bash scripts/precheck.sh:*)",
      "Bash(bash scripts/state-machine.sh:*)",
      "Bash(bash scripts/self-check.sh:*)",
      "Bash(bash scripts/trace-log.sh:*)",
      "Bash(bash scripts/generate-skill.sh:*)",
      "Bash(bash scripts/failure-detector.sh:*)",
      "Bash(bash scripts/integrity-guard.sh:*)"
    ],
    "deny": [
      "Bash(rm -rf /:*)",
      "Bash(rm -rf ~:*)",
      "Bash(sudo:*)",
      "Bash(curl:* | sh)",
      "Bash(curl:* | bash)",
      "Read(**/.env)",
      "Read(**/.env.*)",
      "Read(**/secrets/**)",
      "Read(**/id_rsa)",
      "Read(**/id_ed25519)",
      "Read(**/*.pem)"
    ]
  }
}
SEOF
          ;;
        .mcp.json)
          cat > "$SKILL_DIR/$cfg" <<'MEOF'
{
  "_comment": "MCP server 接入模板（由 swarm-yuan 生成）。默认无激活 server——AI 按项目已装运行时激活对应 server。常用：gitnexus（代码图谱，PolyForm 非商用）/ claude-mem（跨会话记忆；CLI 侧经 scripts/memory-backends.sh 适配层接入，可替换后端）/ graphify（MIT 代码图谱，默认推荐）。",
  "mcpServers": {
  }
}
MEOF
          ;;
      esac
      echo "  ✓ $cfg 已生成"
    else
      echo "  ✓ ${cfg}（保留用户定制）"
    fi
  done
  echo "=== 4. 版本戳 ==="
  cat > "$SKILL_DIR/.swarm-yuan-version" <<EOF
upgraded_at=$SWARM_YUAN_STAMP
generator=swarm-yuan
generator_version=$SWARM_YUAN_SRC_VERSION
source_repo=$SWARM_YUAN_SRC_DIR
source_version=$SWARM_YUAN_SRC_VERSION
mode=upgrade
EOF
  echo "  ✓ .swarm-yuan-version（已重置 framework_gates_sha，由重注入写入新值）"
  # 元数据与新文件使用同一档位；升档新增未填内容时必须重新激活。
  _profile_raised=0
  if [[ -n "$_existing_profile" && $(_profile_rank "$PROFILE") -gt $(_profile_rank "$_existing_profile") ]]; then
    _profile_raised=1
  fi
  awk -v profile="$PROFILE" -v draft="$_profile_raised" '
    NR == 1 && $0 == "---" { fm=1; print; next }
    fm && $0 == "---" { if (!has_profile) print "profile: " profile; if (draft && !has_status) print "status: draft"; fm=0; print; next }
    fm && /^profile:/ { print "profile: " profile; has_profile=1; next }
    fm && /^status:/ { has_status=1; if (draft) { print "status: draft"; next } }
    { print }
  ' "$SKILL_DIR/SKILL.md" > "$SKILL_DIR/SKILL.md.tmp"
  mv "$SKILL_DIR/SKILL.md.tmp" "$SKILL_DIR/SKILL.md"
  # 复用创建尾段的幂等写入，补齐升档新增的 workflow/hooks/commands；不复制第二份模板。

fi

# ============================================================
# 创建模式（draft 状态门 + 断点续传）
# ============================================================
# 已存在目录：draft 骨架 → 续传（幂等补齐缺失文件，不覆盖已有内容）；active/无 status → 报错走 --upgrade
# R23 回归 D2：生成流程文档顺序是 Step 4 relations-extract（先建 skill 目录写
# references/relations.jsonl）→ Step 6 create——自动草稿目录无 SKILL.md，原逻辑硬报错，
# 首次生成按文档执行必撞。无 SKILL.md = 非既有技能（无从覆盖），按断点续传幂等补齐。
RESUME=0
if [[ "$MODE" == "upgrade" ]]; then
  RESUME=1
elif [[ -d "$SKILL_DIR" ]]; then
  if grep -q '^status: draft' "$SKILL_DIR/SKILL.md" 2>/dev/null; then
    echo "→ 检测到 draft 状态骨架，断点续传（幂等补齐缺失文件，不覆盖已有内容）"
    RESUME=1
  elif [[ ! -f "$SKILL_DIR/SKILL.md" ]]; then
    echo "→ 目录已存在但无 SKILL.md（生成流程 Step 4 自动草稿先行，如 relations.jsonl）——按断点续传补齐，不覆盖已有内容"
    RESUME=1
  else
    echo "ERROR: 已存在: ${SKILL_DIR}（用 --upgrade 升级；draft 骨架自动续传）"; exit 1
  fi
fi
# 续传幂等写入：RESUME=1 且目标已存在时跳过（吃掉 stdin 不落盘）
_write_if_absent() {  # $1=目标路径；stdin=内容
  if [[ "$RESUME" -eq 1 && -f "$1" ]]; then echo "  续传跳过（已存在）: $1"; cat >/dev/null; else cat > "$1"; fi
}

_validate_generator_writes "$SKILL_DIR"
echo "=== 补齐骨架: $SKILL_DIR ==="
echo "  profile: ${PROFILE}（lite=认知档最小集 / standard=标准档 / compliance=强监管档）"
trace_tool "create" "$SKILL_DIR"
# lite 档只建三目录（无 hooks/commands/settings/.mcp.json）
if [[ "$PROFILE" == "lite" ]]; then
  mkdir -p "$SKILL_DIR"/{references,assets,scripts}
else
  mkdir -p "$SKILL_DIR"/{references,assets,scripts,hooks,commands}
fi
if [[ "$RESUME" -eq 1 ]]; then
  copy_universal_templates "$SKILL_DIR" resume
else
  copy_universal_templates "$SKILL_DIR"
fi
# create 模式 precheck.conf 生成期必读文件由 conf-render.sh 渲染初稿（嗅探+溯源注释），覆盖模板拷贝
# 仅新建（RESUME=0）时渲染；续传保留既有 conf 不覆盖。upgrade 模式在上文独立分支（merge_precheck_conf 保留用户配置）。
if [[ "$RESUME" -eq 0 ]]; then
  _ind_args=(--profile "$PROFILE")
  [[ -n "$INDUSTRY" && "$INDUSTRY" != "none" ]] && _ind_args+=(--industry "$INDUSTRY")
  if bash "$SRC_SCRIPTS/conf-render.sh" "$PROJECT_DIR" "${_ind_args[@]}" --out "$SKILL_DIR/scripts" >/dev/null 2>&1; then
    echo "  ✓ precheck.conf 初稿由 conf-render.sh 渲染（# AUTO:detected/default + # TODO:model 清单）"
  else
    echo "  ⚠ conf-render.sh 不可用，保留模板占位符（须手填）"
  fi
fi
# 框架探测结果落盘 arch.conf 的 ACTIVE_FRAMEWORKS 行。
# 此前只 echo 打印不落盘：--inject-frameworks 从 conf source 该数组 → 恒空 → 静默跳过注入，
# 且 arch.conf 的 ACTIVE_FRAMEWORKS=() 在 precheck.conf 之后 source 会覆盖 AI 按（错误）交接清单
# 填进主 conf 的同名值——两步契约（create→inject）彻底断裂。落点唯一化到 arch.conf。
# 续传态（RESUME=1）同样落盘：生成流程 Step 4 先跑 relations-extract 会预创建技能目录，
# 后续 create 必走续传路径（order-forge Java 栈实测）——只在 RESUME=0 落盘会让
# 按流程文档执行的 AI 永远拿不到落盘结果。续传保护以"当前值仍是空默认"为界，
# 已填过值（用户/AI 手工）不覆盖。
if [[ -n "${_dfw_fws:-}" && "$_dfw_fws" != 'ACTIVE_FRAMEWORKS=()' && -f "$SKILL_DIR/scripts/precheck.arch.conf" ]]; then
  _af_tmp="${SKILL_DIR}/scripts/precheck.arch.conf"
  if grep -qE '^ACTIVE_FRAMEWORKS=\(\)[[:space:]]*#' "$_af_tmp"; then
    sed -i.bak -E "s|^ACTIVE_FRAMEWORKS=\(.*\).*|${_dfw_fws}  # AUTO:detected（create 探测落盘：detect-frameworks.sh；--inject-frameworks 消费）|" "$_af_tmp" && rm -f "${_af_tmp}.bak"
    if grep -q "^${_dfw_fws}" "$_af_tmp" 2>/dev/null; then
      echo "  ✓ ACTIVE_FRAMEWORKS 已落盘 arch.conf：${_dfw_fws}"
    else
      echo "  ⚠ ACTIVE_FRAMEWORKS 落盘失败（保留空默认，AI 须手工填 arch.conf 该行）"
    fi
  fi
fi

fill_guide() {
  case "$1" in
    workflow.md) echo "九节点全流程，每节点 4 要素+⑨⑩机器校验（调用追踪/方法论引用），4-Phase SOP" ;;
    codebase.md) echo "目录结构+技术栈版本表+端口+配置（版本表记 manifest 声明值、range 原样如 ^12.0.0；lock 实装版本写说明列——check_deps 基线与 manifest 两侧同语义，R82-D1）" ;;
    dev-guide.md) echo "改造分类+拼装式开发原则+安全编码规范+开发偏好" ;;
    release.md) echo "编译规则+构建命令+产物位置" ;;
    reference-manual.md) echo "安全+组件+接口+数据+认知映射+谬误图谱+领域知识" ;;
    recipes.md) echo "§A 业务功能清单 + §B 任务配方（五要素：触发场景/前置查询/复用件/胶水/门禁与验证）" ;;
    *) echo "见 template-spec.md" ;;
  esac
}
# ============================================================
# R128：create 流骨架 emit 段拆分——每个生成文件一个 _fg_emit_* 子函数（heredoc 内容
# 逐字节不动），顶级流收敛为段尾的 _fg_emit_guides 调度调用。fill_guide（上方描述查表
# 函数）契约不动——generic 占位 heredoc 内 $(fill_guide "$f") 消费它，外部调用方零变化。
# ============================================================
# S10/S4 实装：workflow.md 不再 2 行占位，emit 9 节点骨架（每节点 4 要素），
# 节点②探查的 ⑨ 调用追踪预填 trace-log 模板（具体化 SKILL.md:86 的 AI 自由动作）。
# 节点名对齐 template-spec.md:198-207 标准 9 节点（⑥测试验证 + ⑦独立审查独立拆分，审查留痕 review-record 落盘）。
_fg_emit_workflow() {
  _write_if_absent "$SKILL_DIR/references/workflow.md" <<'WFEOF'
# workflow.md — 九节点全流程（4 要素/节点：入口/参与方/门禁/产出物与调用追踪；⑨调用追踪/⑩方法论引用逐节点机器校验）

> 填充规范：九节点全流程，每节点 4 要素（入口/参与方/门禁/产出物与调用追踪）+ ⑨调用追踪/⑩方法论引用机器校验要素（verify-completeness 逐节点断言），4-Phase SOP。
> 节点的标准结构定义在生成器仓 references/template-spec.md §2（该文件不随技能分发）；⑥测试验证与⑦独立审查是两个独立节点（审查记录落 review-record）；整个流程可按项目实际裁剪。
> **交付形态 DoD（2026-10-11 平台根治）**：本仓嗅探到运行面交付形态（见 SKILL.md 认知表）时，⑤编码/⑥测试/⑨构建发布三节点的「产出物」要素必须按形态写运行证据（mini-program=真开发者工具 runtime-proof；web-frontend=浏览器走查帧；backend-service=启动冒烟+跨模块契约测试；mobile-app=模拟器启动证据）与结论行 RUNTIME-OK/RUNTIME-FAIL——单测全绿不等于可运行（run14 教训，QGate delivery.runtime-evidence 门在 task_close 拦截）。

## 流程总览

（流程图，标注：①→②→③ 串行节点；并行节点用 └──┘ 标注）

> **编号体系消歧**：本 workflow 的 ①-⑨ 是**开发工作流节点**；生成器侧 SKILL.md 的 Step 1-13 是**生成流程步骤**——两套编号独立，不同义。
> **state-machine 六阶段 ↔ 九节点对照**（粗粒度状态桶 ↔ 细粒度执行流，`scripts/state-machine.sh` 按阶段守产出物）：
> open=①需求理解+②探查 ｜ design=③设计 spec+④实施 plan ｜ build=⑤编码实现 ｜ verify=⑥测试验证+⑦独立审查 ｜ archive=⑧合入 main ｜ operate=⑨构建发布

> **回复纪律（全节点通用）**：向用户汇报的每一段话遵守受控语言——结论先行、一词一义、术语首现定义、短句不跳跃、情态不升降级；黑话替代表与报告格式见 `references/controlled-language-methodology.md`。机器账本（trace.jsonl/decisions.jsonl）不受此约束。

---

## 节点①：需求理解

**① 流程入口（顺序/并行）：** （本节点在流程中的位置：前序节点、后续节点、可并行项）

**② 参与方：** （谁参与，谁是决策方，谁执行）

**③ 前序依赖检查（准入）：**
- （进入本节点前必须满足的条件）
- 信息不足时的处理（提问澄清，不臆测）

**④ 质量门禁：**
- （离开本节点前必须满足的条件，可被 precheck.sh 验证）



**⑥ 产出物与调用追踪：**
- 持久化：（落盘到哪个路径）
- 临时上下文：（仅对话/草稿的产物）





**⑩ 方法论引用：** `references/decision-governance.md`（用户确认五要素留痕）+ `references/agent-skills-methodology.md`（反借口/假设前置）+ `references/ai-process-records.md`（过程留痕口径）

**调用追踪：**
- 公告：进入本节点时 AI 输出一行结构化提示，格式 `→ [节点① 需求理解] 调用 <技能/子代理/工具> · <目的>`
- 落盘：节点级默认——进入/完成本节点时执行 `bash scripts/trace-log.sh --node "需求理解" --actor "<技能/子代理>" --tool "<工具/命令>"`，追加到 `.swarm-yuan/trace.jsonl`

---

## 节点②：探查（设计 spec 前的仓库探查）

**① 流程入口（顺序/并行）：** 前序=节点①；可三路并行（结构/规范/代码组织子代理），子代理按文件归属切分（探查范围不重叠）

**② 参与方：** controller + 三路子代理（结构/规范/代码组织）

**③ 前序依赖检查（准入）：**
- 节点①需求理解已完成
- 项目路径可访问

**④ 质量门禁：**
- 探查覆盖度（组件库清单全量穷举，非代表性样本）
- 改实体字段/数据模型时：影响面反查须走边集三查（v2.14.3 补）——`bash scripts/relations-query.sh <skill> <proj> --field <字段名>`/`--entity <类名>`（field-mapping/data-mapping 边反查声明式映射引用，grep 源码查不全 XML/SQL 字符串耦合）+ §8 字段级映射清单 + §5 调度任务表（改实体字段必查批处理 job）；边集缺失先跑 `scripts/relations-extract.sh` 重建



**⑥ 产出物与调用追踪：**
- 持久化：特征卡写入 SKILL.md；组件库清单写入 codebase.md
- 临时上下文：探查中间产物





**⑩ 方法论引用：** `references/knowledge-lifecycle-methodology.md`（读法六步：摘要优先/追链/分组注入）+ `references/code-graph-tools.md`（图谱优先）

**调用追踪：**
- 公告：每路子代理启动/完成时输出 `→ [节点② 探查] 调用 结构子代理 · gitnexus context（started/done）`
- 落盘：每路子代理启动前执行 `bash scripts/trace-log.sh --node "探查" --actor "结构子代理" --tool "gitnexus context" --status started`，完成后 `--status done`（规范/代码组织子代理同理）

---

## 节点③：设计 spec

**① 流程入口（顺序/并行）：** 前序=节点②

**② 参与方：** AI + 用户（spec 评审）

**③ 前序依赖检查（准入）：** 节点②探查完成（特征卡+组件库清单就绪；架构设计/演进类变更还须四层架构枚举——探查侧 §D.0.6，生成器侧 exploration-guide）

**④ 质量门禁：** ★测试左移（spec §19 测试设计）+ ★运维左移（spec §21 可观测性约束）+ SPEC_REQUIRED 前置门（fail-gate-hook 拦无 spec 写码）+ 架构类变更须填 spec §24 架构映射（TOGAF BDAT 四层+纵向链验证，非架构变更可豁免）+ 规模与工作量估算（spec §25 功能点法，feature 档推荐选填、无门禁执法——识别规则与因子表查 references/cost-estimation-methodology.md）



**⑥ 产出物与调用追踪：** 持久化：references/spec.md（feature 档推荐含 §25 估算：五类组件计数 → 调整后功能点 → 工作量人月）





**⑩ 方法论引用：** `references/cost-estimation-methodology.md`（§25 功能点估算）+ `references/cognitive-bias.md`（§16 偏差自检）+ `references/togaf-metamodel-methodology.md`（架构类 §24 BDAT）

**⑨ 调用追踪：** `bash scripts/trace-log.sh --node "设计 spec" --actor "<技能>" --tool "<工具>"`

---

## 节点④：实施 plan

**① 流程入口（顺序/并行）：** 前序=节点③

**③ 前序依赖检查（准入）：** spec 通过评审

**④ 质量门禁：** ★变更左移（plan §20 变更影响范围：消费方反查/回滚预案/灰度策略/迁移兼容窗口）

**⑥ 产出物与调用追踪：** 持久化：references/plan.md（OpenSpec tasks checkbox 格式）

**⑩ 方法论引用：** `references/mea-loop-methodology.md`（长任务拆解/审计证据）+ `references/knowledge-lifecycle-methodology.md`（回归范围分级）

**⑨ 调用追踪：** `bash scripts/trace-log.sh --node "实施 plan" --actor "<技能>" --tool "<工具>"`

---

## 节点⑤：编码实现

**① 流程入口（顺序/并行）：** 前序=节点④；互不依赖的文件可并行实施（按文件归属切分子代理，禁止两个执行者写同一文件）；复杂变更（>3 文件/跨模块）用 Dynamic Workflows 并行扇出；写码前按 `references/lazy-generation-methodology.md` 七层阶梯先查再写（层 2 查 recipes/reference-manual，层 7 才新增）

**④ 质量门禁：** ★测试左移（每个 task 先写/更新测试再实现，TDD/BDD；precheck \`--shift-left\` 核验本次变更集是否同时含 test 与 impl 文件——跨栈测试命名均识别，但“先写后写”的时序仍靠任务纪律）

**⑥ 产出物与调用追踪：** 代码提交 + 测试提交

**⑩ 方法论引用：** `references/lazy-generation-methodology.md`（七层下探先查再写）+ `references/subagent-orchestration.md`（复杂变更扇出）

**⑨ 调用追踪：** 子代理派发时 `bash scripts/trace-log.sh --node "编码实现" --actor "implementer" --tool "<task>" --status started`

---

## 节点⑥：测试验证

**① 流程入口（顺序/并行）：** 前序=节点⑤；长测试/全量回归起后台任务跑，主会话同时推进其他工作

**④ 质量门禁：** gstack/OCR 5 审查维度 + AUTO-FIX/ASK；★运维左移（验证 metrics/日志/trace 已埋点）；独立跑单元/接口/集成测试 + `check_test` 第二层（覆盖率阈值 / 零断言 / 断言密度 / 负向用例 / 聚焦测试；配置 `MUTATION_CMD` 时追加变异分数）+ `--api` 接口测试覆盖（端点 × 测试映射 + 状态码断言）。

**★质量门禁序列（参考 quality:full 十步模式，fail-fast 串行——任一步 fail 即停不跑后续；项目按形态裁剪，门禁映射到 precheck 既有 flag，不新增 check_*）**：`--build` 构建过 → `check_test`（`--test`：0 用例 / 覆盖率 / 断言质量 / 可选变异）→ `--api` 接口测试覆盖（端点 + 状态码）→ `--contract` 契约 → `--reuse` 复用合规（新增单元不与稳定单元重名）→ `--consistency` 业务/数据勾稽 → `--layer`/`--link-depth` 架构边界 → `--docs-pack` 文档齐备 → `--security` 安全 → `--deps` 版本锁定。串行顺序有讲究：构建/测试先行（跑不了代码谈什么都白搭），接口/契约次之（逻辑对但破坏契约也不行），架构/文档/安全/版本殿后。执行入口：`bash scripts/precheck.sh --all-full`（标准 29 门禁已含上述全部）或按需单跑。

**⑥ 产出物与调用追踪：** 测试报告（含覆盖率数值/报告路径、接口端点覆盖、断言密度与负向用例数；配变异命令时含 mutation score）+ 门禁序列各步 pass/fail 留痕（gate-runs.jsonl）

**⑩ 方法论引用：** `references/review-methodology.md`（5 维审查/测试有效性）+ `references/gsd-patterns.md`（goal-backward 对抗验证）

**⑨ 调用追踪：** `bash scripts/trace-log.sh --node "测试验证" --actor "tester" --tool "<测试命令>"`

---

## 节点⑦：独立审查

**① 流程入口（顺序/并行）：** 前序=节点⑥

**④ 质量门禁：** 独立 code review（第三方 reviewer 视角，非 Step 7 自检）+ `check_review` 门禁（核验 `references/review-record.md` 留痕非空：5 维审查点 + findings 表）。审查范围含质量门禁序列运行证据——确认节点⑥的序列真实跑过而非声称跑过（gate-runs.jsonl 有当次 run 记录，"配置≠使用≠有效"）。

**⑥ 产出物与调用追踪：** `references/review-record.md` 审查证据产物（从 review-record-template.md 填充）

**⑩ 方法论引用：** `references/review-methodology.md`（rubric/P0-P3）+ `references/agent-skills-methodology.md`（Prove-It 自证）

**⑨ 调用追踪：** `bash scripts/trace-log.sh --node "独立审查" --actor "reviewer" --tool "review-record"`

---

## 节点⑧：合入 main

**① 流程入口（顺序/并行）：** 前序=节点⑦

**④ 质量门禁：** ★变更左移（回滚预案存在 + 数据库变更兼容：向前兼容/双写期）

**⑥ 产出物与调用追踪：** merge commit

**⑩ 方法论引用：** `references/decision-governance.md`（合入确认决策留痕）

**⑨ 调用追踪：** `bash scripts/trace-log.sh --node "合入 main" --actor "<技能>" --tool "git merge"`

---

## 节点⑨：构建发布

**① 流程入口（顺序/并行）：** 前序=节点⑧（合入 main 后方可发布）

**④ 质量门禁：** ★运维左移（灰度/金丝雀策略 + 监控告警阈值 + 运维 runbook）

**⑥ 产出物与调用追踪：** 发布产物 + release notes——发布规则/构建命令/产物位置填入并消费 \`references/release.md\`（六段式正式成员，本节点消费方）

**⑩ 方法论引用：** `references/canary-monitoring.md`（发布后基线对比）+ `references/ai-process-records.md`（过程信息项）

**⑨ 调用追踪：** `bash scripts/trace-log.sh --node "构建发布" --actor "<技能>" --tool "<构建命令>"`

---

## 终检：流程完成检查表（⑨）

（全流程完成前的 checkbox 清单，汇总所有节点的门禁）
- [ ] 节点①需求理解：特征卡 17 项齐备
- [ ] 节点②探查：组件库清单全量 + 调用链
- [ ] 节点③设计 spec：§19 测试设计 + §21 可观测性
- [ ] 节点④实施 plan：§20 变更影响范围
- [ ] 节点⑤编码实现：测试与实现同分支提交
- [ ] 节点⑥测试验证：check_test 通过（覆盖率阈值/断言质量/负向用例）+ --api 接口测试覆盖通过（5 维度审查属节点⑦）
- [ ] 节点⑦独立审查：review-record.md 留痕 + check_review 门禁
- [ ] 节点⑧合入 main：回滚预案 + 迁移兼容
- [ ] 节点⑨构建发布：灰度 + 告警 + runbook
WFEOF
}

# reference-manual.md 两维表骨架（五维表减负——"维度/来源"列纯记账退役）。
# 原因：inventory-verify --path-check / --stability-audit 期望 §4/§6/§9 表格行内含反引号路径
# + 稳定性标注（稳定/禁止改），骨架表头让 AI 有结构起点而非从 0 造（已减负为两维）。
# 骨架仅给表头 + 一行示例（P1 待补标记——mark-active 前必须替换为真实条目）。
_fg_emit_reference_manual() {
  _write_if_absent "$SKILL_DIR/references/reference-manual.md" <<'RMEOF'
# reference-manual.md — 项目参考手册（组件库清单 / 接口约束 / 数据勾稽）

> 填充规范：按 exploration-guide §D 探查后填充。§4/§6/§9 表格行两列：`| 路径 | 说明与约束 |`；
> 路径用反引号包裹（--path-check 校验存在性）；稳定性标注词写进说明列（如"导出 add（禁止改）"）——
> --stability-audit 按行内字面词识别（与列位置无关）。说明列 = AI 读代码后的理解，不是填表。
>
> **语义/动能两区纪律**（本体层口径，见 `references/ontology/links.md` 使用纪律）：本文件的说明列是**表征区**（描述性——仓库是什么样的：组件/接口/依赖）；**规范性内容**（应当怎样——约束/禁令的执行体）只落 rules.d/*.rules 与门禁，本文件至多**引用**规范词（如稳定性标注词），不承载规范的执行逻辑。是/应当不混写。

## §4 组件库清单

| 路径 | 说明与约束 |
|------|--------------|
| `src/components/Example.tsx` | （P1 待补）导出 `Example` 函数；入参 `props: Props`（稳定） |

## §6 接口清单

| 路径 | 说明与约束 |
|------|--------------|
| `src/api/example.ts` | （P1 待补）`GET /api/example`；返回 `ExampleVO`（稳定） |

## §9 数据勾稽

| 路径 | 说明与约束 |
|------|--------------|
| `src/service/order.ts` | （P1 待补）订单金额 = Σ 明细金额；库存 = 在库 + 在途（禁止改——勾稽恒等式） |

---

（其余 §1/§2/§3/§5/§7/§8/§10/§11 节按 references/template-spec.md 维度注册表补齐—— lite 档精简到 §4/§6/§9 三节，standard/compliance 档补全）
RMEOF
}

# R21-A：任务配方骨架——§A 业务功能清单（既有实现编目）+ §B 五要素配方（拼装式编排的产物层）。
# 表格行组件路径反引号包裹：inventory-verify --path-check 扩展校验存在性（配方引用的复用件防幻觉）；
# 五要素结构由 verify-completeness 机器执法（### 配方 段缺要素即列 file:line）。
_fg_emit_recipes() {
  _write_if_absent "$SKILL_DIR/references/recipes.md" <<'RCEOF'
# recipes.md — 任务配方（组件库对应的拼装式编排路线）

> 填充规范：§A 业务功能清单 + §B 任务配方。提取方法见生成器仓 references/exploration-guide.md §D.6/§D.7（既有实现 / git 同类任务历史 / 开发者文档三源）。
> 表格行内组件路径用反引号包裹（--path-check 校验存在性，防幻觉复用件）；每配方五要素缺一不可（--verify-completeness 执法）。
> 语义/动能两区纪律：本文件写"怎么拼装"的路线；硬约束的执行体仍只落 rules.d 与门禁，此处至多引用。

## §A 业务功能清单（既有业务功能实现编目——每次成功拼装的实物记录）

| 功能 | 入口路径 | 复用组件 | 接口 | 数据 | 测试 |
|------|----------|----------|------|------|------|
| （P1 待补）示例功能 | `src/pages/example/List.vue` | `src/components/Table.vue` | GET /api/example | example 表 | `tests/example.spec.ts` |

## §B 任务配方（高频任务形态的拼装序列，每配方五要素）

### 配方：新增页面（示例形态——按项目实际高频形态改写，低频形态不建配方）

- **触发场景**：什么任务用本配方（如"新增列表页 + 查询条件"；可对齐任务类型路由 feature）。
- **前置查询**：查 reference-manual §4 组件库清单选零件 → §6 接口清单查既有端点 → 本文件 §A 找同类功能先例。
- **复用件清单**：

| 复用件路径 | 用途 |
|------------|------|
| （P1 待补）`src/components/Table.vue` | 列表骨架（稳定） |

- **胶水步骤**：最小新增（新页面文件 + 路由注册 + API 封装）；不改既有稳定单元。
- **门禁与验证序列**：任务类型门禁集（assets/task-type-gates.conf）+ TEST_CMD / check_test；完成 `bash scripts/trace-log.sh --node "编码实现"` 留痕。

（按项目实际高频形态追加配方——如"新增接口/新增消费者/新增字段迁移"；每配方五要素齐全，P1 待补标记须在 --mark-active 前替换为真实内容）
RCEOF
}

# R21-B：dev-guide 固定「开发偏好」节——开发者实际研发流程与习惯的承接位
# （来源三路：mine-habits 行为初稿 / 已写下规则 AGENTS.md/CLAUDE.md/记忆 / 用户口述）。
# 无来源时显式写「暂无已记录偏好」（诚实降级）——不允许留占位符到 active。
_fg_emit_dev_guide() {
  _write_if_absent "$SKILL_DIR/references/dev-guide.md" <<'DGEOF'
# （待填充）dev-guide.md
> 填充规范：改造分类+拼装式开发原则+安全编码规范+开发偏好

## 开发偏好（开发者实际研发流程与习惯——R21-B 固定节）

> 来源三路：① mine-habits 行为初稿（`bash scripts/mine-habits.sh <项目根>` 六维统计）② 已写下规则（AGENTS.md/CLAUDE.md/记忆 type: preference）③ 用户口述。AI 审读归纳填入，每条注明来源；无来源时本节写「暂无已记录偏好」（诚实降级，不留占位符）。

- **提交习惯**：（P1 待补——前缀/粒度，引 mine-habits 实测分布）
- **分支习惯**：（P1 待补——命名/生命周期/合并方式）
- **工作流习惯**：（P1 待补——如先跑测试再提交、不自动 push）
- **工具偏好**：（P1 待补——包管理器/lint/编辑器链）
DGEOF
}

# 其余通用占位（codebase.md/release.md）：两行头 + 填充规范（描述查表走 fill_guide，保持原契约）
_fg_emit_generic() {  # $1=文件名（references/ 下相对名）
  local f="$1"
  _write_if_absent "$SKILL_DIR/references/$f" <<EOF
# （待填充）$f
> 填充规范：$(fill_guide "$f")
EOF
}

# R102 schema 修正：hooks.json 必须嵌套形态 {"matcher": M, "hooks": [{"type": "command", "command": C}]}。
# 原扁平形态 {"matcher": M, "command": C} 被 Claude Code 2.1.295 静默丢弃（活体实证 2026-10-09：
# skills-dir 插件 hooks/hooks.json 扁平形态下 PreToolUse deny 不生效、Write 照常落盘；嵌套形态
# 真实阻断（文件未创建 + reason 透传）；嵌套 + 无害命令 = 放行对照成立）——与 Codex 回归 #23、
# ZCode 同型坑第三例。schema 形态由 test-r102 机器锁（防回退为扁平）。
_fg_emit_hooks_json() {
_write_if_absent "$SKILL_DIR/hooks/hooks.json" <<'HEOF'
{
  "hooks": {
    "SessionStart": [{"matcher": "startup|clear|compact", "hooks": [{"type": "command", "command": "echo \"→ [hook:SessionStart] 调用 state-machine.sh status（阶段状态追踪）\"; bash \"${CLAUDE_PLUGIN_ROOT:-.}/scripts/state-machine.sh\" status 2>/dev/null || true; bash \"${CLAUDE_PLUGIN_ROOT:-.}/scripts/state-machine.sh\" restore-journal 2>/dev/null || true; _fp=\"${CLAUDE_PLUGIN_ROOT:-.}/scripts/project-fingerprint.sh\"; if [[ -f \"$_fp\" ]]; then _proj=$( (set +u; . \"${CLAUDE_PLUGIN_ROOT:-.}/scripts/precheck.conf\" 2>/dev/null; printf '%s' \"${PROJECT_DIR:-}\") ); if [[ -n \"$_proj\" && -d \"$_proj\" ]]; then _fp_out=$(bash \"$_fp\" \"$_proj\" --diff --quiet 2>/dev/null || true); if printf '%s\\n' \"$_fp_out\" | LC_ALL=C grep -q '⚠'; then echo \"⚠ [hook:SessionStart] 项目源码指纹已变化——按 SKILL.md「自成长」段走更新链（感知: bash scripts/project-fingerprint.sh <项目根> --diff）\"; fi; fi; fi; bash \"${CLAUDE_PLUGIN_ROOT:-.}/scripts/precheck.sh\" --state-phase 2>/dev/null || true"}]}],
    "PreCompact": [{"matcher": "*", "hooks": [{"type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT:-.}/scripts/state-machine.sh\" dump-journal 2>/dev/null || true", "timeout": 5}]}],
    "PreToolUse": [{"matcher": "Write|Edit", "hooks": [{"type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT:-.}/scripts/precheck.sh\" --scope >/dev/null 2>&1 && echo \"→ [hook:PreToolUse] 调用 precheck --scope：✓ pass\" || echo \"→ [hook:PreToolUse] 调用 precheck --scope：✗ FAIL——运行 bash scripts/precheck.sh --scope 查看详情\""}]}, {"matcher": "Write|Edit|MultiEdit|Bash|WebSearch|WebFetch", "hooks": [{"type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT:-.}/scripts/integrity-guard.sh\" 2>/dev/null || true", "timeout": 5}]}, {"matcher": "Write|Edit|MultiEdit|Bash", "hooks": [{"type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT:-.}/scripts/fail-gate-hook.sh\" 2>/dev/null || true", "timeout": 5}]}],
    "PostToolUse": [{"matcher": "Bash", "hooks": [{"type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT:-.}/scripts/failure-detector.sh\" 2>/dev/null || true", "timeout": 5}]}, {"matcher": "Bash", "hooks": [{"type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT:-.}/scripts/fail-gate-hook.sh\" 2>/dev/null || true", "timeout": 5}]}, {"matcher": "Bash", "hooks": [{"type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT:-.}/scripts/precheck.sh\" --operate 2>/dev/null || true", "timeout": 5}]}, {"matcher": "Bash", "hooks": [{"type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT:-.}/scripts/precheck.sh\" --pr-quality 2>/dev/null || true", "timeout": 10}]}, {"matcher": "Bash", "hooks": [{"type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT:-.}/scripts/precheck.sh\" --skill-supply-chain 2>/dev/null || true", "timeout": 10}]}],
    "Stop": [{"matcher": "*", "hooks": [{"type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT:-.}/scripts/loop-hook.sh\" 2>/dev/null || true; bash \"${CLAUDE_PLUGIN_ROOT:-.}/scripts/precheck.sh\" --decision-audit 2>/dev/null || true; bash \"${CLAUDE_PLUGIN_ROOT:-.}/scripts/precheck.sh\" --learnings 2>/dev/null || true; _mw=\"${CLAUDE_PLUGIN_ROOT:-.}/scripts/memory-writeback.sh\"; [[ -f \"$_mw\" ]] && bash \"$_mw\" 2>/dev/null || true", "timeout": 310}]}]
  }
}
HEOF
}

# settings.local.json（真生成，落实 SKILL.md Step 9 宣称）
# 最小权限模板：允许本 skill 自带脚本执行；deny 危险命令 + 敏感文件读（沙箱通配符 deny——
# Claude Code v2.1.236 起 ** glob 防重命名绕过：Read(**/.env) 在 allowed read 区域内优先生效）。
# 项目特定权限由 AI 填充。
_fg_emit_settings() {
_write_if_absent "$SKILL_DIR/settings.local.json" <<'SEOF'
{
  "permissions": {
    "allow": [
      "Bash(bash scripts/precheck.sh:*)",
      "Bash(bash scripts/state-machine.sh:*)",
      "Bash(bash scripts/self-check.sh:*)",
      "Bash(bash scripts/trace-log.sh:*)",
      "Bash(bash scripts/generate-skill.sh:*)",
      "Bash(bash scripts/failure-detector.sh:*)",
      "Bash(bash scripts/integrity-guard.sh:*)"
    ],
    "deny": [
      "Bash(rm -rf /:*)",
      "Bash(rm -rf ~:*)",
      "Bash(sudo:*)",
      "Bash(curl:* | sh)",
      "Bash(curl:* | bash)",
      "Read(**/.env)",
      "Read(**/.env.*)",
      "Read(**/secrets/**)",
      "Read(**/id_rsa)",
      "Read(**/id_ed25519)",
      "Read(**/*.pem)"
    ]
  }
}
SEOF
}

# .mcp.json（真生成，落实 SKILL.md Step 9 宣称）
# 注释模板：列出可选 MCP server 接入示例，默认全 commented out，由 AI 按项目已装运行时激活。
# JSON 不支持注释，用 "_comment" 字段承载说明；激活时删除对应 server 前的注释行（改为有效 JSON）。
_fg_emit_mcp() {
_write_if_absent "$SKILL_DIR/.mcp.json" <<'MEOF'
{
  "_comment": "MCP server 接入模板（由 swarm-yuan 生成）。默认无激活 server——AI 按项目已装运行时激活对应 server。激活示例：把 mcpServers 对象内对应 server 的注释去掉（改为有效 JSON 键值）。常用 server：gitnexus（代码图谱，PolyForm 非商用）/ claude-mem（跨会话记忆；CLI 侧经 scripts/memory-backends.sh 适配层接入，可替换后端）/ graphify（MIT 代码图谱，默认推荐）。",
  "mcpServers": {
  }
}
MEOF
}

# R101 L2 提交时强拦装配：git pre-commit 垫片 + core.hooksPath（宿主无关拦截点——
# L1 未覆盖宿主（Cursor/Windsurf/OpenCode/Gemini/Kimi，hook 通道在册、本生成链未整合）此前只有 advisory 规则文件，
# git pre-commit 是它们唯一的真强制点；有 hook 宿主（Claude Code/Codex/ZCode）则
# 与 L1 写时拦截构成纵深）。垫片两条职责：①委托技能内 scripts/spec-first-pre-commit.sh
# 绝对路径（用户级安装技能目录不在仓库内，相对路径不可达——与 codex hooks.json 同款
# 取舍；缺席 fail-open 降级，全新克隆不因路径缺失打死提交，L1/L3 仍在）；
# ②vendor/** 挡护——inject 注入脏态是预期工作态不入提交，普通提交自动撤出暂存区，
# 基线替换走 VENDOR_SYNC=1 显式通道（AIStudio 仓规；2026-10-24 b7aef6874 首装、
# 2026-10-26 修复重生成丢失后回移本模板，custom/__tests__/precommit-vendor-guard.test.ts 锁同步）。
# 尊重现状：项目已有自定义 core.hooksPath 不覆盖（披露+手工接入指引）；非 git 项目跳过披露。
_fg_install_precommit() {
if [[ "$MODE" != "upgrade" && "$PROFILE" != "lite" ]] && git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  _syh_dir="$PROJECT_DIR/.swarm-yuan/hooks"
  mkdir -p "$_syh_dir"
  cat > "$_syh_dir/pre-commit" <<PCEOF
#!/usr/bin/env bash
# swarm-yuan L2 pre-commit 垫片：spec-first 强拦委托 + vendor 挡护（由 generate-skill.sh 装配，勿手改；
# 卸载: git config --unset core.hooksPath && rm -rf .swarm-yuan/hooks）
SF="${SKILL_DIR}/scripts/spec-first-pre-commit.sh"
if [ -f "\$SF" ]; then
  bash "\$SF" "\$@" || exit \$?
else
  echo "[pre-commit] spec-first 工作区脚本缺席（全新克隆形态），L2 降级跳过；L1/L3 门禁不变。"
fi
if [ "\${VENDOR_SYNC:-0}" != "1" ] && git diff --cached --name-only -- vendor/ 2>/dev/null | grep -q .; then
  git reset -q HEAD -- vendor/
  echo "[pre-commit] vendor/** 为钉版基线：inject 注入态不入提交（已自动撤出暂存区）；基线替换走 VENDOR_SYNC=1 + scripts/vendor-sync.sh。"
fi
exit 0
PCEOF
  chmod +x "$_syh_dir/pre-commit"
  _syh_hp="$(git -C "$PROJECT_DIR" config core.hooksPath 2>/dev/null || true)"
  if [[ -z "$_syh_hp" ]]; then
    git -C "$PROJECT_DIR" config core.hooksPath ".swarm-yuan/hooks"
    echo "  ✓ L2 提交时强拦: core.hooksPath=.swarm-yuan/hooks（spec-first pre-commit 垫片已装配）"
  elif [[ "$_syh_hp" == ".swarm-yuan/hooks" ]]; then
    echo "  · L2 提交时强拦: core.hooksPath 已指向 .swarm-yuan/hooks（幂等，垫片已刷新）"
  else
    echo "  ⚠ L2 提交时强拦: 项目已有 core.hooksPath=${_syh_hp}，不覆盖——手工接入方式：在既有钩子目录并入 .swarm-yuan/hooks/pre-commit 的调用（UserChallenge 类决策，建议 decisions.jsonl 落痕）"
  fi
  fi
}

# commands/*.md 三件（Claude slash 格式骨架）
_fg_emit_commands() {
_write_if_absent "$SKILL_DIR/commands/spec.md" <<'CEOF'
---
description: 开始新需求——AI 自动创建 spec + 判断任务类型 + 判断规模 + 预填复用约束
argument-hint: <需求描述>
---
AI 自动：
1.创建 spec 文件
2.判断任务类型（从分支名/用户意图）：feature/fix/refactor/chore/docs/test/exp——映射见 assets/task-type-gates.conf
3.判断规模（优先 task-scale.sh 事前判定；spec 写完后用 detect-spec-scale.sh 复核）：
  - bash scripts/task-scale.sh → simple/standard/full（基于 git diff，不需要 spec）
  - 规则：simple（≤5 文件且不触碰敏感目录）；standard（6-10 文件单一模块）；full（>10 或触碰 public/api/schema/migration/auth/model 等敏感目录 或 跨多服务）
  - 规模不确定按更大规模处理（升档不降级）；公共接口/数据模型/权限改动无"简单"档
4.预填 §5.5 复用约束（从特征卡第 11 项检索可复用稳定单元）
5.运行 --reuse 验证
6.执行门禁集（任务类型 × 规模档取并集，质量优先取更重档）：
  - 任务类型基础集（task-type-gates.conf）：feature→--all-full；fix→--all --reuse；refactor→--all-full --reuse --stable-diff；chore→--all；docs→--docs-pack；test→--all --shift-left；exp→--all
  - 规模档叠加：simple→--all；standard→--all-full；full→--all-full --shift-left
  - 两者取并集（更重档）；compliance 档项目追加 --compliance-suite；compliance 档无"简单任务"豁免
$ARGUMENTS
CEOF
_write_if_absent "$SKILL_DIR/commands/precheck.md" <<'CEOF'
---
description: 运行门禁检查
argument-hint: --all | --all-full | <gate>
---

bash scripts/precheck.sh $ARGUMENTS

**常用序列（quality:full 模式——fail-fast 串行，任一步 fail 即停；按项目形态裁剪）**：
- 日常开发收口：`--all`（核心 11：branch/scope/build/test/sensitive/consistency/review/reuse/deps/security/spec-first）
- 结构变更：`--all-full`（标准 29：核心 11 + 架构 18）
- 强监管交付：追加 `--compliance-suite`（合规 19）；迎检台账：`bash scripts/inspection-ledger.sh ledger`（机检映射台账；人工核查清单用 `checklist` 子命令，智能体安全自查用 `agent-audit`）
- 单点深挖：`--test` / `--api` / `--reuse` / `--deps` / `--layer` / `--shift-left` 等单跑
CEOF
_write_if_absent "$SKILL_DIR/commands/explore.md" <<'CEOF'
---
description: 探查项目结构
---

用代码图谱（gitnexus/graphify）与记忆后端（scripts/memory-backends.sh 注册，如 claude-mem）探查项目，更新特征卡。

探查方法论与降级链：生成器仓 `references/exploration-guide.md`（不随技能分发，回生成器仓读；§D.0 形态判定 → §D.0.5 框架激活 → §D.0.6 四层架构枚举 → §D.1 全量穷举）；随技能分发工具速查 `references/code-graph-tools.md`。
CEOF
}

# SKILL.md 主体（frontmatter + 五层导航 + 认知摘要 + 填充指引头）；
# 续传守卫（整段按存在性跳过）在 _fg_emit_guides 调度层。
_fg_emit_skill_md() {
# 五层导航档位感知指针（lite 精简档无 dev-guide/workflow/framework-knowledge——指向实存载体，防导航断环）
if [[ "$PROFILE" == "lite" ]]; then
  _nav_design="改造分类与拼装原则内嵌于 reference-manual 与本文件 meta 段（lite 精简档）；安全规范依据 security-spec"
  _nav_arch="项目认知=下方摘要表；六段式精简为 meta/reference/check/scripts（lite）"
  _nav_flow="日常开发=precheck --all（core 门禁序列）+ state-machine 阶段守卫（六阶段↔九节点对照见 scripts/state-machine.sh 头注）；lite 不含 workflow.md，九节点详解不随技能分发"
else
  _nav_design="改造分类+拼装原则+安全规范→references/dev-guide.md；左移 spec §19-21→assets/spec-template.md；决策纪律（Mechanical/Taste/UserChallenge）→decisions.jsonl"
  _nav_arch="项目认知=下方摘要表；六段式结构+框架规律→references/framework-knowledge.md（按 ACTIVE_FRAMEWORKS 生成）"
  _nav_flow="开发工作流九节点（①需求→…→⑨发布）→references/workflow.md；任务配方→references/recipes.md（②探查先查）；守卫链=spec-first hook（无 spec 写码即拦）→状态机阶段守卫→门禁序列→拦截落 gate-deny.jsonl"
fi
_DELIVERY_SHAPES=$(_detect_delivery_shapes "$PROJECT_DIR")

cat > "$SKILL_DIR/SKILL.md" <<EOF
---
name: $SKILL_NAME
description: （填充指引：触发条件 + 项目关键词）
profile: $PROFILE
status: draft
---
# $SKILL_NAME — （填充指引：项目名 + 需求交付全流程技能）
> 由 swarm-yuan 生成器创建（${SWARM_YUAN_STAMP}，profile=${PROFILE}），AI 探查填充后 \`--mark-active\` 激活。填充规范见 swarm-yuan/references/template-spec.md

**五层导航**（理念→设计→架构→工作流程→使用，循环=使用→变化→自成长）：
- **理念**：拼装式开发（清单=reference-manual §4，禁重复造轮子）；三权分立（特征卡立法/门禁执法/审查司法，载体见 workflow 与 review-record）；诚实降级——误报走 conf+decisions.jsonl 留痕；回复纪律——面向人的输出用受控语言（references/controlled-language-methodology.md）；并行优先——能并行一律并行（子代理按文件归属切分、禁同文件双写；长命令后台），子代理报告主会话复跑核验
- **设计**：${_nav_design}
- **架构**：${_nav_arch}
- **工作流程**：${_nav_flow}
- **使用**：对 AI 说"开始新需求：xxx"（九节点）/"跑门禁"（--all-full）/"项目变了，刷新技能"/"报了误报"（conf+留痕）

## 项目认知摘要（生成器检测回填——特征卡 #1/#4 承接点，AI 在此基础上深化）

| 特征项 | 生成器检测值（AUTO:detected） |
|--------|------------------------------|
| 项目根 | ${PROJECT_DIR} |
| 构建命令 | $(grep -m1 '^BUILD_CMD=' "$SKILL_DIR/scripts/precheck.conf" 2>/dev/null | sed "s/^BUILD_CMD=//;s/'//g;s| *#.*||" || echo "（AI 探查填充）") |
| 测试命令 | $(grep -m1 '^TEST_CMD=' "$SKILL_DIR/scripts/precheck.conf" 2>/dev/null | sed "s/^TEST_CMD=//;s/'//g;s| *#.*||" || echo "（AI 探查填充）") |
| 检测框架 | $(bash "$SRC_SCRIPTS/detect-frameworks.sh" "$PROJECT_DIR" 2>/dev/null | grep -E '^ACTIVE_FRAMEWORKS=' | sed 's/^ACTIVE_FRAMEWORKS=//;s/[()"]//g' || echo "（无已知框架）") |
| 交付形态嗅探 | ${_DELIVERY_SHAPES}（AI 核正；每型运行证据=完成定义一部分，单测全绿≠可运行） |

> 项目类型与改造分类由 AI 探查判定；生成器只做自动嗅探。

## 填充指引
<!-- 交接清单：本区是生成器→AI 的待办交接，逐项完成后整区删除（含本行与标题）再 --mark-active -->
- [ ] meta: 核心理念+改造分类+流程总览+命令速查+门禁+反借口表（借口/反驳两列表，从门禁步骤逐条反推，见 template-spec §1.5）+假设清单（需求/架构/范围三维度+"现在纠正我"，见 template-spec §1.5）
EOF
}

# SKILL.md 填充指引 checklist 追加（按档裁剪 + 框架探测条目 + assets/scripts/决策记录条目）
_fg_append_skill_checklist() {
# checklist 按档裁剪（lite 无 workflow/commands/hooks 条目）
if [[ "$PROFILE" != "lite" ]]; then
cat >> "$SKILL_DIR/SKILL.md" <<EOF
- [ ] workflow: 九节点+每节点 4 要素（入口/参与方/门禁/产出物与调用追踪）+4-Phase SOP
- [ ] delivery: 交付形态 DoD（按认知表嗅探结果逐型落完成定义：每型运行证据工件+结论行 RUNTIME-OK/RUNTIME-FAIL；mini-program/web-frontend/mobile-app 型禁以单测全绿声明可运行）；QGate 形态门 delivery.runtime-evidence 会在 task_close 拦截缺证
- [ ] reference: codebase/dev-guide/release/reference-manual/recipes（任务配方） + 方法论+认知 reference
EOF
else
cat >> "$SKILL_DIR/SKILL.md" <<EOF
- [ ] reference: reference-manual（特征卡 P0 六项 + 全量构件库清单）
- [ ] delivery: 交付形态 DoD（同上——每型运行证据+RUNTIME-结论行，单测全绿≠可运行）
EOF
fi
# R33-F1：检测到框架时显式交接 conf 框架 glob 填充（否则 TODO(framework-gates) 注释是唯一线索，
# 填充 AI 漏填 → 框架门禁空转；mark-active 侧 R33-F1 机器执法兜底，两侧同源）。
# 探测的 ACTIVE_FRAMEWORKS 已在 create 内联段落落盘 arch.conf（两步契约闭合）；
# checklist 锚点指向真实落点 precheck.arch.conf（标记行 `--inject-frameworks` 注入后出现）。
_fw_detected=$(bash "$SRC_SCRIPTS/detect-frameworks.sh" "$PROJECT_DIR" 2>/dev/null | grep -E '^ACTIVE_FRAMEWORKS=' | sed 's/^ACTIVE_FRAMEWORKS=//;s/[()"]//g' | tr -d '[:space:]' || true)
if [[ -n "$_fw_detected" ]]; then
cat >> "$SKILL_DIR/SKILL.md" <<EOF
- [ ] conf: 框架 glob 填 \`scripts/precheck.arch.conf\`（ACTIVE_FRAMEWORKS 已由 create 探测落盘；跑生成器 \`--inject-frameworks\` 注入门禁后，按 \`TODO(framework-gates)\` 标记行填 <FW>_SRC_GLOBS 等 glob；全空=框架门禁空转，mark-active 会拦）
EOF
fi
# checklist assets 行档位感知（lite 无 branch/env/data；§14-§18 仅 compliance 保留；state-machine 在 scripts/ 段）
case "$PROFILE" in
  lite)       _ck_assets="spec-template(§5.5-§13+§19-24) + plan + review-record + task-type-gates + profile-thresholds" ;;
  compliance) _ck_assets="spec-template(§5.5-§18 全节) + plan + review-record + branch/env/data + snippets + mcp-tools + standards-map" ;;
  *)          _ck_assets="spec-template(§5.5-§13+§19-24) + plan + branch/env/data" ;;
esac
cat >> "$SKILL_DIR/SKILL.md" <<EOF
- [ ] assets: ${_ck_assets}
- [ ] check: precheck.sh 门禁四族（计数真值见生成器仓 facts.conf；core 随 --all，arch 随 --all-full，compliance 随 --compliance-suite）
- [ ] scripts: precheck + state-machine + trace-log + cost-report
- [ ] 决策记录：spec §2 决策记录段写本技能生成/选型决策到 \`.swarm-yuan/decisions.jsonl\`（≥1 条；UserChallenge 类须带 missing_context/cost_if_wrong）——\`--mark-active\` 核验项
EOF
}

# SKILL.md 自成长指引段追加（按档两型）
_fg_append_skill_growth() {
# 自成长指引段（固定操作指引，非填充项——目标技能的 AI 按此链保持技能与项目同步）
# profile 分档——lite 档 WP-E 不装 hooks/hooks.json，SessionStart 自动感知链不存在；
# 须明示"lite 档须 AI 在会话开始时手动跑 --diff"，别让文档撒谎说"hook 已自动感知"。
if [[ "$PROFILE" == "lite" ]]; then
cat >> "$SKILL_DIR/SKILL.md" <<'EOF'

## 自成长（项目变了，本技能跟着变）

本技能的组件库清单/编排约束是生成时刻的快照。项目代码演进后按此链更新：

1. **感知**（会话开始时）：`bash scripts/project-fingerprint.sh <项目根> --diff`；无基线先 `--write`。lite 档无 SessionStart hook，AI 须每会话主动跑；升档到 standard/compliance 自动感知。
2. **判断**：「⚠ 项目源码已变化」→ 走更新链；「无变化」→ 正常开发。
3. **更新链**（检出变化后）：
   - 工具链刷新：生成器（路径见 `.swarm-yuan-version` 的 source_repo）`--refresh` 看 dry-run → `--upgrade` 更新门禁/模板（reference-manual.md 等项目内容文件保留）
   - 内容刷新：`--diff` 的「变化目录 scope」= 重探查范围——只对该 scope 按 swarm-yuan `references/exploration-guide.md` §D 重探查，更新 `references/reference-manual.md` 对应条目；未变条目原样保留
   - 核验：本地 `scripts/inventory-verify.sh` 计数核验（清单 ≥ 枚举 ×0.95 + 路径存在性防幻觉）
   - 边集重建：本地 `scripts/relations-extract.sh` 重跑出 `references/relations.jsonl`（断边/项目演进后）
4. **落新基线**：`bash scripts/project-fingerprint.sh <项目根> --write`。
5. **问题沉淀**（使用中随时，不等项目变化）：解决的新问题（新复用解法/新约束/新坑）三选一沉淀——`inventory-update` 入清单 / recipes.md 加配方 / `gate-rules.sh --persist` 入规则——并 `bash scripts/trace-log.sh --decision` 留痕。

红线：① 指纹只感知结构变化，语义变化靠 AI 编码中发现即更新清单，不等 refresh；② 清单原子替换，条目骤降 >50% 视为失败保留旧清单（last-good）。
EOF
else
cat >> "$SKILL_DIR/SKILL.md" <<'EOF'

## 自成长（项目变了，本技能跟着变）

本技能的组件库清单/编排约束是生成时刻的快照。项目代码演进后按此链更新：

1. **感知**（会话开始时）：`bash scripts/project-fingerprint.sh <项目根> --diff`；无基线先 `--write`。Claude Code 的 SessionStart hook 自动感知，其他运行时 AI 主动跑。
2. **判断**：「⚠ 项目源码已变化」→ 走更新链；「无变化」→ 正常开发。
3. **更新链**（检出变化后）：
   - 工具链刷新：生成器（路径见 `.swarm-yuan-version` 的 source_repo）`--refresh` 看 dry-run → `--upgrade` 更新门禁/模板（reference-manual.md 等项目内容文件保留）
   - 内容刷新：`--diff` 的「变化目录 scope」= 重探查范围——只对该 scope 按 swarm-yuan `references/exploration-guide.md` §D 重探查，更新 `references/reference-manual.md` 对应条目；未变条目原样保留
   - 核验：本地 `scripts/inventory-verify.sh` 计数核验（清单 ≥ 枚举 ×0.95 + 路径存在性防幻觉）
   - 边集重建：本地 `scripts/relations-extract.sh` 重跑出 `references/relations.jsonl`（断边/项目演进后）
4. **落新基线**：`bash scripts/project-fingerprint.sh <项目根> --write`。
5. **问题沉淀**（使用中随时，不等项目变化）：解决的新问题（新复用解法/新约束/新坑）三选一沉淀——`inventory-update` 入清单 / recipes.md 加配方 / `gate-rules.sh --persist` 入规则——并 `bash scripts/trace-log.sh --decision` 留痕。

红线：① 指纹只感知结构变化，语义变化靠 AI 编码中发现即更新清单，不等 refresh；② 清单原子替换，条目骤降 >50% 视为失败保留旧清单（last-good）。
EOF
fi
}

# SKILL.md「按需读取」索引表自动生成（依据实际拷入的 UNIVERSAL_FILES 分级清单）
# 仅 create 分支执行（resume 分支走调度层 else 跳过，不重复追加）；表按 UNIVERSAL_FILES 数组顺序输出。
_idx_file="$SKILL_DIR/.universal-files-index.md"
# 用途描述：列头承诺"用途"，原实现填的是内部类目码（ref/onto/gen…）=信息断环。
# 知名文件给精确描述，其余按类目给通用描述——读者不看源码也能知道每个文件干什么。
_idx_desc() {  # $1=path $2=cat → 用途短语（≤10 字，防 8KB 预算爆）
  case "$(basename "$1")" in
    precheck.sh) echo "门禁执行入口";;
    gates-strict.sh) echo "strict 门禁";;
    gates-warn.sh) echo "warn 门禁";;
    gates-advisory.sh) echo "advisory 门禁";;
    state-machine.sh) echo "六阶段守卫";;
    fail-gate-hook.sh) echo "spec-first 拦截";;
    integrity-guard.sh) echo "完整性防护";;
    failure-detector.sh) echo "失败检测";;
    memory-writeback.sh) echo "记忆写回";;
    trace-log.sh) echo "调用/决策留痕";;
    project-fingerprint.sh) echo "指纹感知入口";;
    generate-skill.sh) echo "生成器垫片";;
    cost-report.sh) echo "成本报告";;
    spec-template.md) echo "spec 模板 §1-24";;
    plan-template.md) echo "plan 模板";;
    review-record-template.md) echo "审查留痕模板";;
    reference-manual.md) echo "组件库清单（旧称地图/零件目录）";;
    cognition.md) echo "待确认事项清单（拿不准语义集中落此）";;
    task-type-gates.conf) echo "任务→门禁映射";;
    profile-thresholds.conf) echo "档位阈值";;
    ontology/objects.md|ontology/links.md|ontology/actions.md) echo "本体事实源";;
    knowledge-lifecycle-methodology.md) echo "知识四阶段协议";;
    decision-governance.md) echo "用户决策留痕制度";;
    ai-process-records.md) echo "过程留痕口径";;
    agent-skills-methodology.md) echo "反借口/Prove-It";;
    codex-methodology.md) echo "执行纪律方法论";;
    mea-loop-methodology.md) echo "长任务规划审计";;
    togaf-metamodel-methodology.md) echo "BDAT 架构建模";;
    cordis-composability-methodology.md) echo "时空可组合设计";;
    frontend-design-methodology.md) echo "前端设计方法论";;
    codex-security-methodology.md) echo "威胁建模扫描";;
    mcp-governance.md) echo "MCP 接入治理";;
    crypto-spec.md) echo "密码学应用规范";;
    ops-readonly-guard.sh) echo "外部操作只读守卫";;
    tunnel.sh) echo "堡垒机隧道编排";;
    tunnel.conf) echo "隧道配置(用户填)";;
    bugfix-runbook.md) echo "排障六步流水线";;
    remote-debug-jvm.md) echo "JDWP 远程调试";;
    compliance-checkpoints.md) echo "合规检查点库";;
    regulatory-checkpoint-table.md) echo "执法检查主表";;
    inspection-ledger.sh) echo "迎检台账工具";;
    *) case "$2" in
         ref) echo "方法论 reference";;
         onto) echo "本体事实源";;
         rules) echo "三值规则数据";;
         gen) echo "生成器工具";;
         hook) echo "宿主拦截脚本";;
         assets) echo "模板/配置资产";;
         *) echo "$2";;
       esac;;
  esac
}
_fg_write_index() {
{
  echo "## 按需读取引用索引（自动生成，勿手改——由 generate-skill.sh 依据 profile 档生成）"
  echo ""
  echo "| 文件 | 用途 |"
  echo "|------|------|"
  for entry in "${UNIVERSAL_FILES[@]}"; do
    _path=${entry%%|*}; _rest=${entry#*|}; _cat=${_rest%%|*}; _tier=${_rest#*|}
    [[ "$_tier" == "$_rest" ]] && _tier="standard"
    # 按 profile 档过滤（档序 lite<standard<compliance，已由拷贝逻辑保证存在性，这里只列已拷入的）
    [[ -f "$SKILL_DIR/$_path" ]] || continue
    printf '| %s | %s |\n' "$_path" "$(_idx_desc "$_path" "$_cat")"
  done
} > "$_idx_file"
[[ -f "$SKILL_DIR/SKILL.md" ]] && cat "$_idx_file" >> "$SKILL_DIR/SKILL.md" && rm -f "$_idx_file"
}

# ============================================================
# 调度（R128）：分支路由与拆分前的顶级流一致——
#   ① references 占位族（lite 只生成 reference-manual；路由序 workflow→reference-manual→
#      recipes→dev-guide→generic 与原 if/elif 链同序）
#   ② 非 lite 档：hooks.json / settings.local.json / .mcp.json / L2 pre-commit / commands
#   ③ SKILL.md 主体+checklist+自成长+按需读取索引（RESUME 存在性守卫，已存在整段跳过）
# ============================================================
_fg_emit_guides() {
  # lite 档只生成 reference-manual.md 占位（特征卡+参考手册承载认知；其余段随升档补）
  # R21-A：standard/compliance 增 recipes.md（任务配方——拼装式编排的产物层；lite 档不生成，差异化断言见 run-gen-e2e）
  _placeholder_refs="workflow.md codebase.md dev-guide.md release.md reference-manual.md recipes.md"
  [[ "$PROFILE" == "lite" ]] && _placeholder_refs="reference-manual.md"
  for f in $_placeholder_refs; do
    case "$f" in
      workflow.md)         _fg_emit_workflow ;;
      reference-manual.md) _fg_emit_reference_manual ;;
      recipes.md)          _fg_emit_recipes ;;
      dev-guide.md)        _fg_emit_dev_guide ;;
      *)                   _fg_emit_generic "$f" ;;
    esac
  done
  # lite 档跳过 hooks/settings/.mcp.json/commands（无 hooks 生命周期与 slash 命令负担）
  if [[ "$PROFILE" != "lite" ]]; then
    _fg_emit_hooks_json
    _fg_emit_settings
    _fg_emit_mcp
    _fg_install_precommit
    _fg_emit_commands
  fi
  # SKILL.md 含续传追加段，整段按存在性守卫（draft 骨架的 SKILL.md 已存在时整体跳过）
  if [[ "$RESUME" -eq 0 || ! -f "$SKILL_DIR/SKILL.md" ]]; then
    _fg_emit_skill_md
    _fg_append_skill_checklist
    _fg_append_skill_growth
    _fg_write_index
  else
    echo "  续传跳过（已存在）: $SKILL_DIR/SKILL.md"
  fi
}

_write_skill_manifest() {  # $1=skill_dir $2=run_id（WP7：目标技能自描述）
  local dir="$1" run_id="$2" af="" fw_json="" fw m2 m1 fwtotal fcount
  # shellcheck disable=SC1091
  . "$ASSETS_DIR/lib/json.sh"
  if [[ -f "$dir/scripts/precheck.conf" ]]; then
    af=$( ( set +u; . "$dir/scripts/precheck.conf" >/dev/null 2>&1; printf '%s ' ${ACTIVE_FRAMEWORKS[@]+"${ACTIVE_FRAMEWORKS[@]}"} ) )
  fi
  for fw in $af; do
    fw_json="${fw_json}${fw_json:+,}\"$(json_escape "$fw")\""
  done
  m2="$(awk -F '\t' '!/^#/ && $9=="M2"{n++} END{print n+0}' "$ASSETS_DIR/registry/gates.tsv" 2>/dev/null || true)"
  m1="$(awk -F '\t' '!/^#/ && $9=="M1"{n++} END{print n+0}' "$ASSETS_DIR/registry/gates.tsv" 2>/dev/null || true)"
  fwtotal="$(awk -F '\t' '!/^#/ && NF{n++} END{print n+0}' "$ASSETS_DIR/registry/frameworks.tsv" 2>/dev/null || true)"
  m2="${m2:-${FACT_GATES_M2:-53}}"; m1="${m1:-${FACT_GATES_M1:-3}}"; fwtotal="${fwtotal:-${FACT_FRAMEWORKS:-81}}"
  {
    printf '{\n'
    printf '  "schema": 1,\n'
    printf '  "name": "%s",\n' "$(json_escape "$SKILL_NAME")"
    printf '  "version": "%s",\n' "$(json_escape "$SWARM_YUAN_SRC_VERSION")"
    printf '  "generated_at": "%s",\n' "$SWARM_YUAN_STAMP"
    printf '  "run_id": "%s",\n' "$(json_escape "$run_id")"
    printf '  "profile": "%s",\n' "$PROFILE"
    printf '  "industry": "%s",\n' "${INDUSTRY:-none}"
    printf '  "active_frameworks": [%s],\n' "$fw_json"
    printf '  "gates": {"total": %s, "core": %s, "m2": %s, "m1": %s},\n' \
      "${FACT_GATES_TOTAL:-56}" "${FACT_GATES_CORE:-11}" "$m2" "$m1"
    printf '  "frameworks": {"total": %s, "m2": %s},\n' "$fwtotal" "$fwtotal"
    printf '  "files": {"count": %s}\n' "$(find "$dir" -type f | wc -l | tr -d ' ')"
    printf '}\n'
  } > "$dir/skill-manifest.json"
  echo "  ✓ skill-manifest.json（profile=${PROFILE} / industry=${INDUSTRY:-none} / frameworks=${fwtotal}）"
}

_fg_emit_guides

_write_if_absent "$SKILL_DIR/.swarm-yuan-version" <<EOF
created_at=$SWARM_YUAN_STAMP
generator=swarm-yuan
generator_version=$SWARM_YUAN_SRC_VERSION
source_repo=$SWARM_YUAN_SRC_DIR
source_version=$SWARM_YUAN_SRC_VERSION
mode=create
EOF

# R25-PR1（2026-09-12 实仓回归 flask/mybatis-3 实证）：create 探测 ACTIVE_FRAMEWORKS 写入 conf
# 却不注入门禁片段——配置与执法体脱节，激活后跑门禁即 advisory "框架已激活但无门禁实现
# （须运行 --inject-frameworks）"。create/resume 路径自动注入（与 upgrade 行为对齐）；
# 无框架清单时注入为幂等空转（空区块）。
if declare -F inject_frameworks >/dev/null && [[ -f "$SKILL_DIR/scripts/precheck.sh" && -f "$SKILL_DIR/scripts/precheck.conf" ]]; then
  echo "=== 框架门禁注入（create 自动，与 --inject-frameworks 等价）==="
  if [[ "$MODE" == "upgrade" ]]; then
    # 子 shell 的严格错误状态不能被 || 包装吞掉；失败会触发整次升级回滚。
    ( set -e; inject_frameworks "$SKILL_DIR" )
  else
    inject_frameworks "$SKILL_DIR" || echo "  ⚠ 门禁注入返回非 0（$?），请人工检查"
  fi
fi

_write_skill_manifest "$SKILL_DIR" "${SWARM_YUAN_STAMP}-$$"

if [[ "$MODE" == "upgrade" ]]; then
  if [[ "$DRY_RUN" -eq 1 ]]; then
    _dryrun_report "$_upgrade_live" "$SKILL_DIR"
    exit 0
  fi
  _publish_upgrade
  exit 0
fi

echo "✓ 骨架已创建: $SKILL_DIR"
echo ""
find "$SKILL_DIR" -type f | sort
echo ""
echo "下一步: AI 自动探查 $PROJECT_DIR 并填充全部文件 + 配置 precheck.conf + 运行门禁验证。"
echo "  用户无需手动编辑任何配置文件。"
echo "  骨架状态: draft（--all-full/--compliance-suite 禁用）——填充完成后:"
echo "    bash generate-skill.sh --mark-active $SKILL_DIR"
echo "  中断后可重跑本命令断点续传（幂等补齐，不覆盖已有内容）。"
echo "  升级已有技能: bash generate-skill.sh --upgrade $SKILL_NAME $PROJECT_DIR"
