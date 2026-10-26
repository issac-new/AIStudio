#!/usr/bin/env bash
# state-machine.sh — 通用阶段状态机脚本模板（comet 风格，由 swarm-yuan 生成器按项目定制）
# 对应方法论：comet 脚本背书状态机（非 prompt-only），survive context compaction
# 用法:
#   bash state-machine.sh init <change-name>          # 初始化状态文件
#   bash state-machine.sh get <field>                  # 读取字段
#   bash state-machine.sh set <field> <value>          # 设置字段
#   bash state-machine.sh transition <phase>           # 阶段转换（含门禁）
#   bash state-machine.sh guard <phase>                # 检查阶段准入条件
#   bash state-machine.sh next                         # 显示下一阶段
#   bash state-machine.sh status                       # 显示当前状态
#   bash state-machine.sh update                       # 原地修订 plan（openspec /opsx:update 能力）
# 生成目标技能时：替换 PHASES / GUARDS 为项目实际阶段与门禁
#
# 六阶段 ↔ workflow.md 九节点对照（粗粒度状态桶 ↔ 细粒度执行流，两套模型一体两面）：
#   open=①需求理解+②探查 ｜ design=③设计 spec+④实施 plan ｜ build=⑤编码实现
#   verify=⑥测试验证+⑦独立审查 ｜ archive=⑧合入 main ｜ operate=⑨构建发布
# 阶段转换（transition）即节点组完成：如 design→build 意味 ③④ 节点全绿进入 ⑤。

set -euo pipefail

# ===== conf 整合断裂修复 =====
# 守卫错误提示一直教用户"可在 precheck.conf 配 PROPOSAL_FILE/TASKS_FILE/SPEC_*"，但本脚本
# 从未读取该 conf——用户照提示配置不生效（断裂指引）。对齐 fail-gate-hook 的 grep 读取惯例
# （不 source、无副作用、路径含 # 与空格的边界不放宽）；调用方 export 的环境变量优先，
# 仅未设置时取 conf 注册值。conf 定位：脚本同目录 precheck.conf（生成物布局二者同在 scripts/）。
_sm_conf="$(cd "$(dirname "$0")" && pwd)/precheck.conf"
# spec-first 判定库（R101 单一事实源；与脚本同目录——目标技能布局 scripts/、生成器仓布局 assets/）。
# 消费点：_sm_conf_val 的 conf 解析 + guard build 的已批准 spec 检测。缺库不致命——
# _sm_conf_val 回退旧式解析，guard 内按可用性降级披露（见消费点）。
# R129：加载点从 PROJECT_DIR 解析之后前移到 _sm_conf_val 之前——此前 _sm_conf_val（:51 首调）
# 早于 lib 加载，只能自带一份 cut -d'#' 版剪注释，与库的引号感知版形成「逐字节对齐」口头契约
# （R128 修库时该契约已破：值含 # 的路径在库侧正确、在状态机侧腰斩）。前移后直接复用库，契约消失。
_spf_lib="$(cd "$(dirname "$0")" && pwd)/spec-first-lib.sh"
# shellcheck disable=SC1090
[[ -f "$_spf_lib" ]] && . "$_spf_lib"
_sm_conf_val() {  # $1=变量名 → conf 末行赋值（剥引号/行内注释/空白；解析 ${VAR:-def} 自引用；恒 rc=0）
  local _v=""
  if command -v spf_conf_val >/dev/null 2>&1; then
    # 库在位：引号感知剪注释 + 末行胜出 + 引号/占位自引用剥离全部由库承担（单一事实源）
    _v="$(spf_conf_val "$_sm_conf" "$1")"
  elif [[ -f "$_sm_conf" ]]; then
    # 库缺失回退（生成物成套分发，正常不会走到；保诊断面不炸）
    # R118：只剥首尾空白，保留内部空格（含空格的项目路径旧版被 tr -d '[:space:]' 压成
    # /tmp/myproj，状态写错树）；引号/前缀仍剥。
    _v=$(grep "^$1=" "$_sm_conf" 2>/dev/null | tail -1 | cut -d'#' -f1 | sed "s/^$1=//" || true)
    _v="${_v#"${_v%%[![:space:]]*}"}"
    _v="${_v%"${_v##*[![:space:]]}"}"
    _v="${_v%\"}"; _v="${_v#\"}"
    case "$_v" in
      "\${$1:-"*'}') _v="${_v#\$\{$1:-}"; _v="${_v%\}}" ;;
    esac
  fi
  # 骨架模板 conf 的 <项目根绝对路径> 占位符不得当真实值消费（状态机特有语义，库不管）——
  # 生成器仓 assets/precheck.conf 与 state-machine.sh 同目录，draft 未回填期 PROJECT_DIR=占位符
  # 会让 STATE_DIR 落进字面量「<项目根绝对路径>/.swarm-yuan」垃圾目录。占位符形态视为未配置。
  case "$_v" in
    "<"*">") _v="" ;;
  esac
  printf '%s' "$_v"
  return 0
}
if [[ -z "${PROJECT_DIR:-}" ]]; then
  _sm_pd="$(_sm_conf_val PROJECT_DIR)"
  [[ -n "$_sm_pd" ]] && PROJECT_DIR="$_sm_pd"
fi
# R126：export 给子进程——transition/auto 调 trace-log.sh 落决策时不传 --project-dir，
# 未 export 时 trace-log 退回 $(pwd)/.swarm-yuan，cwd≠项目根则阶段流转决策写错树
# （与 R118「状态写错树」同族）。conf 未配 PROJECT_DIR 时两侧一致退回 cwd；
# R141 D1：cwd 在技能目录内（<project>/.<host>/skills/<skill>/...）则上溯项目根，
# 与 trace-log.sh _tl_resolve_project_dir 同条带（两侧一致，账本正本恒在项目侧）。
if [[ -z "${PROJECT_DIR:-}" ]]; then
  PROJECT_DIR="$(printf '%s' "$(pwd)" | sed -E 's|/\.[^/]+/skills/[^/]+(/.*)?$||')"
fi
[[ -n "${PROJECT_DIR:-}" ]] && export PROJECT_DIR

# ===== 按项目定制 =====
STATE_DIR="${PROJECT_DIR:-$(pwd)}/.swarm-yuan"
STATE_FILE="$STATE_DIR/state.yaml"
# 阶段顺序（comet 5 阶段模式 + D 方向 operate 发布后运营，可按项目裁剪）
PHASES=("open" "design" "build" "verify" "archive" "operate")
# =====================

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; }

# A 方向：context-save 输入消毒（gstack 吸收，防注入）
# 用户输入白名单字符集过滤，防路径穿越/命令注入——"用户输入永不进 LLM 层拼路径"
sanitize_input() {
  printf '%s' "$1" | tr -cd 'a-zA-Z0-9._-'
}

# CLI 整合层运行时守卫（WP1.2）：comet CLI 真实整合
# comet 提供 `comet guard`（检查 Classic workflow phase guard）/ `comet state`（读写状态）。
# 项目用 comet 时（有 .comet/ 或 active change），guard_phase 调 comet guard 做状态一致性补充校验；
# 未装/项目未用 comet 时降级到本脚本自带的文件检查 guard_phase 逻辑。
has_comet() { command -v comet >/dev/null 2>&1; }

# trace_tool 辅助函数（全链路追踪——设计理念 2，state-machine 侧）
# 打印"→ [状态流转] 调用 工具 · X（started）"到 stderr + 落盘 trace.jsonl。
# 分级（减重）：第三方工具「调用级」细节默认关闭，SWARM_YUAN_TRACE=verbose 时启用；
# 节点级（阶段迁移）追踪不受影响。
TRACE_LOG_SH="${STATE_DIR:-${PROJECT_DIR:-$(pwd)}/.swarm-yuan}/../scripts/trace-log.sh"
[[ -f "$TRACE_LOG_SH" ]] || TRACE_LOG_SH="$(cd "$(dirname "$0")" 2>/dev/null && pwd)/trace-log.sh"
trace_tool() {  # $1=工具名 $2=操作
  [[ "${SWARM_YUAN_TRACE:-}" == "verbose" ]] || return 0
  [[ -f "$TRACE_LOG_SH" ]] || return 0
  bash "$TRACE_LOG_SH" --node "状态流转" --actor "工具" --tool "${1} ${2}" --status started >&2 2>/dev/null || true
}

init_state() {
  local change="${1:-}"
  [[ -z "$change" ]] && { echo "Usage: state-machine.sh init <change-name> [--force]"; exit 1; }
  # A 方向：change name 经白名单消毒（防路径穿越/命令注入）
  change=$(sanitize_input "$change")
  [[ -z "$change" ]] && { echo "ERROR: change name 全被过滤（含非法字符），请重命名"; exit 1; }
  # 覆盖确认原为交互 read——
  # AI/CI 非交互场景 stdin EOF → confirm 空 → exit 0 静默无效：rc=0 但状态未重置，
  # 调用方（自动化执勤正是主战场）误信 init 成功，后续 transition 全落在旧 change 上。
  # 非交互环境改须显式 --force（rc 语义明确）；交互终端保留确认。
  local _sm_force=0
  [[ "${2:-}" == "--force" ]] && _sm_force=1
  mkdir -p "$STATE_DIR"
  if [[ -f "$STATE_FILE" && $_sm_force -eq 0 ]]; then
    echo "WARN: 状态文件已存在: ${STATE_FILE}（当前 change=$(get_field change) @ phase=$(get_field phase)）"
    if [[ -t 0 ]]; then
      read -rp "覆盖? (y/N) " confirm
      [[ "$confirm" != "y" ]] && exit 0
    else
      echo "ERROR: 非交互环境不覆盖——确认作废旧 change 后用 init ${change} --force"; exit 1
    fi
  fi
  cat > "$STATE_FILE" <<EOF
change: $change
phase: open
workflow: full
build_mode: subagent-driven-development
isolation: branch
verify_result: pending
branch_status: pending
# MEA 铁律（LHH 吸收，2026-08-16）：verify_result=pass 须挂证据引用（gate-run#N / 验证报告路径）；
# AI 自我声明不改变持久状态——guard archive 检查此字段，空则 warn（详见 references/mea-loop-methodology.md §3.2）
verify_evidence:
created_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
  echo "✓ 状态已初始化: $STATE_FILE"
  echo "  change: $change"
  echo "  phase: open"
}

get_field() {
  local field="${1:-}"
  [[ -z "$field" ]] && { echo "Usage: state-machine.sh get <field>"; exit 1; }
  [[ ! -f "$STATE_FILE" ]] && { echo "ERROR: 状态文件不存在，先 init"; exit 1; }
  # grep|head -1|sed 在 set -euo pipefail 下,若同字段多行 grep 被 head 截断收 SIGPIPE(141)。
  # head -1 只取首行,改用 sed 取首行(无截断管道);grep 无匹配返回 1 也需 || true 兜底。
  grep "^$field:" "$STATE_FILE" 2>/dev/null | sed -n "1s/^$field: //p" || true
}

set_field() {
  local field="${1:-}" value="${2:-}"
  [[ -z "$field" ]] && { echo "Usage: state-machine.sh set <field> <value>"; exit 1; }
  [[ ! -f "$STATE_FILE" ]] && { echo "ERROR: 状态文件不存在，先 init"; exit 1; }
  if grep -q "^$field:" "$STATE_FILE"; then
    # value 含 | 会撞 sed 分隔符（报错且静默不写），含 & 会展开为匹配文本——
    # 改用 awk 按字面前缀重写该行（三平台兼容，mktemp+cat 防中途失败清空状态文件）
    local tmp
    tmp="$(mktemp /tmp/swarmstate.XXXXXX)"
    if ! awk -v f="$field" -v v="$value" \
      'index($0, f ":") == 1 && !done { print f ": " v; done=1; next } { print }' \
      "$STATE_FILE" > "$tmp"; then
      rm -f "$tmp"
      echo "ERROR: 更新字段失败: $field" >&2
      exit 1
    fi
    cat "$tmp" > "$STATE_FILE" || { rm -f "$tmp"; echo "ERROR: 写入状态文件失败" >&2; exit 1; }
    rm -f "$tmp"
  else
    echo "$field: $value" >> "$STATE_FILE"
  fi
  echo "✓ $field = $value"
}

_guard_archive() {
  local ok=1
      # 门禁：verify 通过
      local vr
      vr=$(get_field verify_result)
      [[ "$vr" != "pass" ]] && { fail "verify_result=${vr}，须先 pass"; ok=0; }
      # MEA 铁律（LHH 吸收，2026-08-16）：自我声明不改变持久状态——
      # verify_result=pass 之外还须有证据引用（gate-run#N / 验证报告路径 / verifier 报告）。
      # warn 不 fail：存量状态文件无此字段，硬 fail 破坏向后兼容（守决策 26 预算：不新增 fail 调用）。
      local ev
      ev=$(get_field verify_evidence)
      if [[ -n "$ev" ]]; then
        pass "archive 准入: verify_evidence=${ev}（收口有据）"
      else
        echo "  ⠿ archive 准入: verify_evidence 为空——自我声明不改变持久状态（MEA 铁律），建议 set verify_evidence \"<gate-run#N 或验证报告路径>\"（warn 不阻塞）"
      fi
      # 破窗台账（broken-windows ledger，gsd-core v1.8.0 #1950 吸收）：
      # 若 .swarm-yuan/WINDOWS.md 存在且含 open 条目，warn 不 fail（仅提示 ship 前清账）。
      # gsd-core 的 /gsd-ship 在有 open 条目时阻断；swarm-yuan 降为 warn 以避免新增 fail 调用（守决策 26 预算）。
      # 台账格式：frontmatter 含 open_count 字段，或正文含 "- [ ]" 未决项。
      local win_file="${PROJECT_DIR:-$(pwd)}/.swarm-yuan/WINDOWS.md"
      if [[ -f "$win_file" ]]; then
        local open_cnt=0
        # 优先读 frontmatter 的 open_count；否则降级数正文 "- [ ]" 未决项
        local fm_cnt
        fm_cnt=$(sed -n '/^---$/,/^---$/{/^open_count:/s/^open_count:[[:space:]]*//p;}' "$win_file" 2>/dev/null | tr -d '[:space:]')
        if [[ -n "$fm_cnt" ]]; then
          open_cnt="$fm_cnt"
        else
          open_cnt=$(grep -c '^\- \[ \]' "$win_file" 2>/dev/null || echo 0)
        fi
        if [[ "${open_cnt:-0}" -gt 0 ]]; then
          echo "  ⠿ archive 准入: 破窗台账 ${win_file} 有 ${open_cnt} 项 open（stubs/TODOs/skipped-tests/unrun-verifies；建议 ship 前清账或 waive，warn 不阻塞）"
        else
          pass "archive 准入: 破窗台账 open_count=0（干净）"
        fi
      fi
      [[ $ok -eq 1 ]] && pass "archive 准入: verify_result=${vr}"
  return $((1-ok))
}

guard_phase() {
  local phase="${1:-}"
  [[ -z "$phase" ]] && { echo "Usage: state-machine.sh guard <phase>"; exit 1; }
  [[ ! -f "$STATE_FILE" ]] && { echo "ERROR: 状态文件不存在"; exit 1; }
  echo "=== 阶段门禁检查: $phase ==="
  local ok=1
  case "$phase" in
    design)
      # 实装产出物检查（替换原占位 pass）。检查 open 阶段产出 proposal.md 存在。
      # 可配 PROPOSAL_FILE（默认 $PROJECT_DIR/.swarm-yuan/proposal.md 或 $SPEC_FILE）。
      local proposal="${PROPOSAL_FILE:-}"
      [[ -z "$proposal" ]] && proposal="$(_sm_conf_val PROPOSAL_FILE)"   # #20：conf 整合
      [[ -z "$proposal" ]] && proposal="${PROJECT_DIR:-$(pwd)}/.swarm-yuan/proposal.md"
      if [[ -f "$proposal" ]]; then
        pass "design 准入: open 阶段产出存在（${proposal}）"
      else
        # 降级：未配置 PROPOSAL_FILE 且默认路径无文件时，检查 SPEC_FILE（项目可能用 spec.md 替代 proposal）
        local spec_f="${SPEC_FILE:-}"
        [[ -z "$spec_f" ]] && spec_f="$(_sm_conf_val SPEC_FILE)"           # #20：conf 整合
        if [[ -n "$spec_f" && -f "$spec_f" ]]; then
          pass "design 准入: spec 存在（${spec_f}，作为 proposal 等价物）"
        else
          fail "design 准入失败: 缺 open 阶段产出（$proposal 不存在；可在 precheck.conf 配 PROPOSAL_FILE 指向实际路径）"
          ok=0
        fi
      fi
      # G1：design 准入 warn 检查 decisions.jsonl（warn 不 fail，不阻塞流转）
      local _dec_file="${STATE_DIR}/decisions.jsonl"
      if [[ ! -f "$_dec_file" ]]; then
        echo "  ⚠ decisions.jsonl 未创建（决策未留痕，G1 决策治理）"
      elif [[ ! -s "$_dec_file" ]]; then
        echo "  ℹ decisions.jsonl 存在但为空（draft 期允许）"
      else
        pass "decisions.jsonl 已有决策记录"
      fi
      ;;
    build)
      # 门禁：build_mode/isolation 状态字段 + design 阶段产出 spec。
      # 原注释声称"检查 design doc + tasks"但代码只查
      # init 即写入的 build_mode/isolation——design→build 零产物守卫（注释-代码断裂）。
      # 对齐 fail-gate-hook SPEC_REQUIRED 同名开关同判据（SPEC_GLOB 默认 docs/specs/*.md，
      # 已批准=含「## 决策记录」段且非占位）：SPEC_REQUIRED=1 时硬拦，未启用降级提示（与
      # hook 层"conf 缺失不阻碍"的口径一致——state-machine 不引入 hook 未启用的第二套强制）。
      local bm iso
      bm=$(get_field build_mode); iso=$(get_field isolation)
      [[ -z "$bm" ]] && { fail "build_mode 未设置"; ok=0; }
      [[ -z "$iso" ]] && { fail "isolation 未设置"; ok=0; }
      [[ $ok -eq 1 ]] && pass "build 准入: build_mode=$bm, isolation=$iso"
      local _sm_sr="${SPEC_REQUIRED:-}"
      [[ -z "$_sm_sr" ]] && _sm_sr="$(_sm_conf_val SPEC_REQUIRED)"        # #20：conf 整合
      if [[ "$_sm_sr" == "1" ]]; then
        local _sg="${SPEC_GLOB:-docs/specs/*.md}" _approved=""
        [[ "$_sg" == "docs/specs/*.md" ]] && { local _sgc; _sgc="$(_sm_conf_val SPEC_GLOB)"; [[ -n "$_sgc" ]] && _sg="$_sgc"; }
        # 已批准 spec 检测自 R101 收敛到 spec-first-lib.sh（spf_*，与 fail-gate-hook/
        # pre-commit/precheck check_spec_first 四层同源）；库缺失时降级披露不阻断流转。
        _approved=""
        if command -v spf_find_approved_spec >/dev/null 2>&1; then
          _approved="$(spf_find_approved_spec "${PROJECT_DIR:-$(pwd)}" "$_sg")"
        else
          echo "  (spec-first-lib.sh 缺失——build 准入 spec 判定降级跳过)"
        fi
        if [[ -n "$_approved" ]]; then
          pass "build 准入: design 阶段产出 spec 已批准（${_approved}）"
        else
          fail "build 准入失败: SPEC_REQUIRED=1 但 ${_sg} 无已批准 spec（须含「## 决策记录」段且非占位；可配 SPEC_GLOB，或 conf 置 SPEC_REQUIRED=0 显式豁免并落痕）"
          ok=0
        fi
      else
        echo "  (SPEC_REQUIRED 未启用——design 产出 spec 准入降级跳过；conf 置 1 启用，与 fail-gate-hook 同开关)"
      fi
      ;;
    verify)
      # 实装产出物检查（替换原占位 pass）。检查 tasks.md 全部 - [x]（所有任务完成）。
      # 可配 TASKS_FILE（默认 $PROJECT_DIR/.swarm-yuan/tasks.md）。未配置/不存在时降级 skip（不阻塞）。
      local tasks_f="${TASKS_FILE:-}"
      [[ -z "$tasks_f" ]] && tasks_f="$(_sm_conf_val TASKS_FILE)"         # #20：conf 整合
      [[ -z "$tasks_f" ]] && tasks_f="${PROJECT_DIR:-$(pwd)}/.swarm-yuan/tasks.md"
      if [[ -f "$tasks_f" ]]; then
        local unchecked
        # grep -c 零命中时打印 0 但 exit 1——用 || true 保留输出 "0"；
        # 误用 || echo 0 会得到 "0\n0"，-eq 判失败把全勾 tasks 误判为未完成
        unchecked=$(grep -cE '^- \[ \]' "$tasks_f" 2>/dev/null || true)
        if [[ "$unchecked" -eq 0 ]]; then
          pass "verify 准入: tasks 全部完成（${tasks_f}）"
        else
          fail "verify 准入失败: ${tasks_f} 有 ${unchecked} 项未勾选（- [ ]）"
          ok=0
        fi
      else
        # 降级：无 tasks.md 时不阻塞（项目可能用其他任务追踪方式），仅提示
        echo "  (未找到 ${tasks_f}，verify 准入降级跳过——可配 TASKS_FILE 启用检查)"
      fi
      ;;
    archive)
      _guard_archive || ok=0
      ;;
    operate)
      # D 方向：operate 发布后运营准入——verify 通过 + 运营报告（warn 不 fail，可选延伸阶段）
      local vr
      vr=$(get_field verify_result)
      [[ "$vr" != "pass" ]] && echo "  ⚠ operate 准入: verify_result=${vr}（建议先 verify pass）"
      local op_report="${PROJECT_DIR:-$(pwd)}/.swarm-yuan/operate-report.md"
      if [[ -f "$op_report" ]]; then
        pass "operate 准入: 运营报告存在（${op_report}）"
      else
        echo "  ⚠ operate 准入: 运营报告未创建（可选延伸阶段，warn 不阻塞）"
      fi
      pass "operate 阶段（发布后运营，可选延伸）"
      ;;
    *)
      fail "未知阶段: $phase"; ok=0
      ;;
  esac
  # comet CLI 整合（WP1.2）：项目用 comet 时，跑 `comet guard` 做状态一致性补充校验。
  # comet guard 无 active change 时 rc=0 不报错；有 change 时校验 phase guard 一致性，失败 → fail。
  if has_comet; then
    local comet_root="${PROJECT_DIR:-$(pwd)}"
    if [[ -d "$comet_root/.comet" ]]; then
      trace_tool "comet" "guard"
      local comet_out; comet_out=$(cd "$comet_root" && comet guard 2>&1 || true)
      if echo "$comet_out" | grep -qiE 'error|fail|invalid|不一致'; then
        fail "comet guard: 状态一致性校验失败（详见输出）"
        echo "$comet_out" | tail -5 | sed 's/^/    /'
        ok=0
      else
        pass "comet guard: 状态一致性校验通过（或无 active change）"
      fi
    fi
  fi
  [[ $ok -eq 1 ]] && echo "✓ 门禁通过" || { echo "✗ 门禁未通过"; exit 1; }
}

transition_phase() {
  local target="${1:-}"
  [[ -z "$target" ]] && { echo "Usage: state-machine.sh transition <phase>"; exit 1; }
  # 未知阶段名（如 implement，合法为 build）原先落到
  # tgt_idx=-1 走「不能回退」分支，且在「阶段转换」横幅之后才报——横幅+回退话术双重误导。
  # 阶段名合法性前置校验，未知名直接报错并列出合法阶段，不打横幅。
  local _t_ok=0 _c_ok=0 _p
  for _p in "${PHASES[@]}"; do
    [[ "$_p" == "$target" ]] && _t_ok=1
  done
  [[ $_t_ok -eq 1 ]] || { echo "ERROR: 未知阶段: ${target}（合法阶段: ${PHASES[*]}）"; exit 1; }
  local current; current=$(get_field phase)
  for _p in "${PHASES[@]}"; do
    [[ "$_p" == "$current" ]] && _c_ok=1
  done
  [[ $_c_ok -eq 1 ]] || { echo "ERROR: 状态文件 phase 字段异常: ${current}（合法阶段: ${PHASES[*]}）"; exit 1; }
  echo "=== 阶段转换: $current → $target ==="
  # 检查顺序
  local cur_idx=-1 tgt_idx=-1
  for i in "${!PHASES[@]}"; do
    [[ "${PHASES[$i]}" == "$current" ]] && cur_idx=$i
    [[ "${PHASES[$i]}" == "$target" ]] && tgt_idx=$i
  done
  if [[ $tgt_idx -le $cur_idx ]]; then
    echo "ERROR: 不能回退到 ${target}（当前 ${current}）"
    exit 1
  fi
  # 原实现只拦回退不拦跳级——
  # open 一路 transition verify 直达（verify 准入 tasks.md 缺省降级跳过），
  # design 的 proposal / build 的 spec 批准（SPEC_REQUIRED=1 spec-first 硬防线）
  # 被单次跳跃整体绕过，阶段守卫形同虚设。逐级准入即门禁：前跳限一阶，
  # 跨级报出被跳过的阶段并提示逐级推进。
  if [[ $((tgt_idx - cur_idx)) -gt 1 ]]; then
    local _skipped="${PHASES[$((cur_idx + 1))]}"
    echo "ERROR: 不能从 ${current} 跳到 ${target}（跨过 ${_skipped}）——逐级推进，每级准入即门禁（${current} → ${_skipped} → ${target}）"
    exit 1
  fi
  # 门禁
  guard_phase "$target" || exit 1
  set_field phase "$target"
  # G1：阶段流转决策留痕（Taste 类，guard 通过即 approved）
  _sm_tl="${STATE_DIR:-${PROJECT_DIR:-$(pwd)}/.swarm-yuan}/../scripts/trace-log.sh"
  [[ -f "$_sm_tl" ]] || _sm_tl="$(cd "$(dirname "$0")" 2>/dev/null && pwd)/trace-log.sh"
  if [[ -f "$_sm_tl" ]]; then
    bash "$_sm_tl" --decision --type Taste \
      --suggestion "$target" --user-action approved \
      --rationale "guard 通过，阶段从 $current 流转到 $target" \
      --phase "$target" >&2 2>/dev/null || true
  fi
  echo "✓ 已转换到: $target"
}

next_phase() {
  [[ ! -f "$STATE_FILE" ]] && { echo "ERROR: 状态文件不存在"; exit 1; }
  local current; current=$(get_field phase)
  local cur_idx=-1
  for i in "${!PHASES[@]}"; do
    [[ "${PHASES[$i]}" == "$current" ]] && cur_idx=$i
  done
  local next_idx=$((cur_idx + 1))
  if [[ $next_idx -ge ${#PHASES[@]} ]]; then
    echo "已是最后阶段: $current"
  else
    echo "下一阶段: ${PHASES[$next_idx]}"
  fi
}

# auto 子命令——自动判定下一阶段并尝试流转（免去用户记阶段名）。
# 语义：读当前 phase → 找下一个 → 跑 guard → 通过则 transition，失败则提示缺什么产出物。
# 不跳过 guard（守卫仍检查产出物），只免去显式传阶段名。设计理念 1：连贯动作。
auto_phase() {
  [[ ! -f "$STATE_FILE" ]] && { echo "ERROR: 状态文件不存在，先 init"; exit 1; }
  local current; current=$(get_field phase)
  local cur_idx=-1
  for i in "${!PHASES[@]}"; do
    [[ "${PHASES[$i]}" == "$current" ]] && cur_idx=$i
  done
  local next_idx=$((cur_idx + 1))
  if [[ $next_idx -ge ${#PHASES[@]} ]]; then
    echo "已是最后阶段: ${current}（无可流转的下一阶段）"
    return 0
  fi
  local target="${PHASES[$next_idx]}"
  echo "=== auto: 当前 $current → 尝试流转到 $target ==="
  # guard 检查（guard_phase 内部 exit 1 时会中断；这里捕获其退出码不直接 exit）
  if guard_phase "$target"; then
    set_field phase "$target"
    # G1：auto 流转决策留痕
    _sm_tl="${STATE_DIR:-${PROJECT_DIR:-$(pwd)}/.swarm-yuan}/../scripts/trace-log.sh"
    [[ -f "$_sm_tl" ]] || _sm_tl="$(cd "$(dirname "$0")" 2>/dev/null && pwd)/trace-log.sh"
    if [[ -f "$_sm_tl" ]]; then
      bash "$_sm_tl" --decision --type Taste \
        --suggestion "$target" --user-action approved \
        --rationale "auto: guard 通过，$current → $target" \
        --phase "$target" >&2 2>/dev/null || true
    fi
    echo "✓ auto 流转成功: $current → $target"
  else
    echo "✗ auto 流转失败: $target 准入未通过（上方 guard 输出说明了缺什么产出物）"
    echo "  提示: 补齐产出物后重新运行 auto，或手动 transition <phase> 指定其他阶段"
    return 1
  fi
}

show_status() {
  [[ ! -f "$STATE_FILE" ]] && { echo "ERROR: 状态文件不存在"; exit 1; }
  echo "=== 状态: $STATE_FILE ==="
  cat "$STATE_FILE"
}

# ===== compaction 状态续传（来源：tanweai/pua builder-journal + session-restore）=====
# 与决策 13 断点续传（文件级幂等补缺）正交——compaction-journal 是运行时状态快照，
# 在 context compaction 前把 current_phase/failure_count/stuck_since dump 到 builder-journal.md，
# 新会话 SessionStart 检测 builder-journal.md 存在且 <2h → 恢复状态 + 注入「你在 X 卡了 N 次失败」。
# 压力不因 compaction 重置（pua 核心洞察）。

# dump 运行时状态到 builder-journal.md（PreCompact hook 调用，或 AI 主动调）
dump_journal() {
  local current=""; current=$(get_field phase 2>/dev/null || echo "unknown")
  local change=""; change=$(get_field change 2>/dev/null || echo "unknown")
  local fcount=""
  # 读 failure_count（E2 failure-detector 的计数器，若存在）
  local fc_file="${STATE_DIR}/.failure_count"
  [[ -f "$fc_file" ]] && fcount=$(cat "$fc_file" 2>/dev/null || echo "0") || fcount="0"
  # 读 peak pressure level
  local peak_file="${STATE_DIR}/.peak_pressure_level"
  local peak="0"
  [[ -f "$peak_file" ]] && peak=$(cat "$peak_file" 2>/dev/null || echo "0")
  ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  {
    echo "---"
    echo "ts: ${ts}"
    echo "phase: ${current}"
    echo "change: ${change}"
    echo "failure_count: ${fcount}"
    echo "peak_pressure_level: ${peak}"
    echo "---"
    echo ""
    echo "## Active Task"
    echo "（AI 填：当前在做什么，1-2 句）"
    echo ""
    echo "## Tried Approaches"
    echo "（AI 填：试了什么，结果如何）"
    echo ""
    echo "## Next Candidate Action"
    echo "（AI 填：下一步试什么）"
    echo ""
    echo "## Key Context"
    echo "（AI 填：路径/命令/错误/决策）"
    echo ""
  } >> "${STATE_DIR}/builder-journal.md" 2>/dev/null || { echo "⚠ builder-journal.md 落盘失败（不阻塞）" >&2; return 0; }
  echo "→ [compaction 续传] 运行时状态已 dump 到 ${STATE_DIR}/builder-journal.md"
  echo "  phase=${current} failure_count=${fcount} peak=L${peak}"
}

# 检测 builder-journal.md 存在且 <2h → 恢复状态（SessionStart 调用）
restore_journal() {
  local journal="${STATE_DIR}/builder-journal.md"
  [[ -f "$journal" ]] || { echo "（无 builder-journal.md，首次会话）"; return 0; }
  # 检查时效（<2h = 7200s）
  local mtime now age
  # GNU 探测须在前：GNU stat -f 失败前会把 `File: "…"` 写到 stdout，BSD-first 链会把
  # 污染行与回退 epoch 拼接进 mtime，set -u 下算术展开即 unbound variable（CI Linux 实证）。
  mtime=$(stat -c %Y "$journal" 2>/dev/null || stat -f %m "$journal" 2>/dev/null || echo 0)
  now=$(date +%s)
  age=$(( now - mtime ))
  if [[ "$age" -gt 7200 ]]; then
    echo "（builder-journal.md 已过期（${age}s > 7200s），不恢复——视为新会话）"
    return 0
  fi
  # 只取最后闭合的 frontmatter；追加中的半块不能覆盖上次完整快照。
  local last_block
  last_block=$(awk '
    /^---$/ { if (inside) { last=block; inside=0 } else { inside=1; block="" }; next }
    inside { block=block $0 "\n" }
    END { printf "%s", last }
  ' "$journal")
  [[ -n "$last_block" ]] || { echo "（builder-journal.md 无完整快照，不恢复）"; return 0; }
  local j_phase j_fcount j_peak
  j_phase=$(printf '%s\n' "$last_block" | sed -n 's/^phase: *//p')
  j_fcount=$(printf '%s\n' "$last_block" | sed -n 's/^failure_count: *//p')
  j_peak=$(printf '%s\n' "$last_block" | sed -n 's/^peak_pressure_level: *//p')
  if [[ ! "$j_fcount" =~ ^[0-9]+$ || ! "$j_peak" =~ ^[0-9]+$ ]]; then
    echo "⚠ builder-journal.md 计数无效，不恢复" >&2; return 0
  fi
  echo "→ [compaction 续传] 检测到近期 builder-journal.md（${age}s 前）"
  echo "  恢复状态: phase=${j_phase:-unknown} failure_count=${j_fcount:-0} peak=L${j_peak:-0}"
  echo "  ⚠ 压力不因 compaction 重置——若 failure_count≥2，仍按对应 L 等级行动"
  if [[ "${j_fcount:-0}" -ge 2 ]]; then
    echo "  → 你在上个会话连续失败 ${j_fcount} 次（压力 L${j_peak:-0}）"
    echo "  → 先读 .swarm-yuan/error-history.jsonl 了解之前试了什么，避免重复失败方案"
    echo "  → 读 builder-journal.md 的「Next Candidate Action」段，从那里继续"
  fi
}

# ===== G1 C 档：checkpoint/restore 阶段级可回滚 =====
# 与决策 13 断点续传（文件级幂等补缺）正交——checkpoint 是显式的阶段级一致性快照，
# restore 回滚到指定快照（恢复 phase + 截断 decisions.jsonl 到快照行数 + 报告关键文件哈希变化）。
# 快照存 $STATE_DIR/checkpoints/<ts>-<phase>.ckpt（bash 3.2 兼容：KEY=VALUE 行，无 declare -A）。

# 计算关键文件哈希（decisions.jsonl / trace.jsonl / state.yaml 行数 + cksum）
_ckpt_fingerprint() {
  local dec="$STATE_DIR/decisions.jsonl" tr="$STATE_DIR/trace.jsonl"
  local dec_lines=0 tr_lines=0 dec_sum="-" tr_sum="-"
  [[ -f "$dec" ]] && dec_lines=$(wc -l < "$dec" | tr -d ' ')
  [[ -f "$tr" ]] && tr_lines=$(wc -l < "$tr" | tr -d ' ')
  command -v cksum >/dev/null 2>&1 || { echo "nocksum"; return; }
  [[ -f "$dec" ]] && dec_sum=$(cksum < "$dec" | awk '{print $1}')
  [[ -f "$tr" ]] && tr_sum=$(cksum < "$tr" | awk '{print $1}')
  echo "decisions_lines=$dec_lines trace_lines=$tr_lines decisions_cksum=$dec_sum trace_cksum=$tr_sum"
}

checkpoint_phase() {
  [[ ! -f "$STATE_FILE" ]] && { echo "ERROR: 状态文件不存在，先 init"; exit 1; }
  local current; current=$(get_field phase)
  local cp_dir="$STATE_DIR/checkpoints"
  mkdir -p "$cp_dir" 2>/dev/null || { echo "ERROR: 无法创建 $cp_dir"; exit 1; }
  local ts; ts="$(date -u +%Y%m%dT%H%M%SZ)"
  local cp_file="$cp_dir/${ts}-${current}.ckpt"
  {
    echo "checkpoint_ts=$ts"
    echo "phase=$current"
    echo "created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    _ckpt_fingerprint
  } > "$cp_file"
  echo "✓ checkpoint 已创建: $cp_file"
  echo "  phase=$current · $(_ckpt_fingerprint)"
}

list_checkpoints() {
  local cp_dir="$STATE_DIR/checkpoints"
  if [[ ! -d "$cp_dir" ]] || [[ -z "$(ls -A "$cp_dir" 2>/dev/null)" ]]; then
    echo "（无 checkpoint；用 'state-machine.sh checkpoint' 创建阶段级快照）"
    return 0
  fi
  echo "=== checkpoints（${cp_dir}）==="
  local f
  for f in "$cp_dir"/*.ckpt; do
    [[ -f "$f" ]] || continue
    echo "--- $(basename "$f") ---"
    cat "$f"
  done
}

restore_phase() {
  local target_ckpt="${1:-}"
  local cp_dir="$STATE_DIR/checkpoints"
  # 未指定则用最新 checkpoint
  if [[ -z "$target_ckpt" ]]; then
    # 用文件名（嵌入时间戳 ts-phase.ckpt）词序取最新，而非 ls -t（mtime）--
    # 对齐 G10 版本 oracle 单源真值（claude-mem v13.12.1 教训：mtime 排序在文件系统操作后可能失真）。
    # checkpoint 文件名格式 <YYYYmmddTHHMMSSZ>-<phase>.ckpt，ts 字典序 = 时间序。
    target_ckpt=$(ls -1 "$cp_dir"/*.ckpt 2>/dev/null | sort -r | head -1)
    [[ -z "$target_ckpt" ]] && { echo "ERROR: 无 checkpoint 可恢复（先 'checkpoint' 创建）"; exit 1; }
  fi
  [[ -f "$target_ckpt" ]] || target_ckpt="$cp_dir/$target_ckpt"
  [[ -f "$target_ckpt" ]] || { echo "ERROR: checkpoint 不存在: $target_ckpt"; exit 1; }
  # 读快照（KEY=VALUE；fingerprint 行是单行多空格串，取首个字段值）
  local cp_phase cp_dec_lines cp_dec_sum valid_phase=0 phase
  cp_phase=$(sed -n 's/^phase=//p' "$target_ckpt")
  cp_dec_lines=$(sed -n 's/^decisions_lines=//p' "$target_ckpt" | awk '{print $1}')
  for phase in "${PHASES[@]}"; do [[ "$cp_phase" == "$phase" ]] && valid_phase=1; done
  if [[ "$valid_phase" -ne 1 || ! "$cp_dec_lines" =~ ^(0|[1-9][0-9]*)$ || ${#cp_dec_lines} -gt 12 ]]; then
    echo "ERROR: checkpoint 阶段或决策行数无效，未恢复" >&2; return 1
  fi
  [[ -f "$STATE_FILE" ]] || { echo "ERROR: 状态文件不存在，未恢复" >&2; return 1; }
  # R126 合流保留：回滚同时作废结论字段（写入侧在下方原子 awk 内一并重置，
  # 不回 set_field 二次写）——陈旧 verify_result=pass 残留会让 archive 门禁凭过期结论放行。
  local dec="$STATE_DIR/decisions.jsonl"
  # 与 trace-log 写入共用互斥目录；恢复时不能丢掉并发新增的决策。
  local lock="$STATE_DIR/.decisions.lock"
  mkdir "$lock" 2>/dev/null || { echo "ERROR: 决策账本正在使用或有残留锁，未恢复: $lock" >&2; return 1; }
  trap 'rmdir "$STATE_DIR/.decisions.lock" 2>/dev/null || true' EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  local cur_lines=0
  [[ ! -f "$dec" ]] || cur_lines=$(wc -l < "$dec" | tr -d ' ')
  if [[ "$cp_dec_lines" -gt "$cur_lines" ]]; then
    echo "ERROR: 决策记录少于快照，无法恢复完整前缀；未恢复" >&2; return 1
  fi
  cp_dec_sum=$(awk '{for(i=1;i<=NF;i++) if($i ~ /^decisions_cksum=/) {sub(/^decisions_cksum=/,"",$i); print $i}}' "$target_ckpt")
  if [[ -n "$cp_dec_sum" && "$cp_dec_sum" != "-" ]]; then
    local prefix_sum
    prefix_sum=$(head -n "$cp_dec_lines" "$dec" | cksum | awk '{print $1}')
    if [[ "$prefix_sum" != "$cp_dec_sum" ]]; then
      echo "ERROR: 快照前决策内容已改变，校验码失配；未恢复" >&2; return 1
    fi
  fi

  # 删除前先归档；同目录临时文件 + rename 避免 cat 覆盖失败留下半文件。
  local backup tmp_state tmp_dec
  mkdir -p "$STATE_DIR/restore-backups"
  backup=$(mktemp -d "$STATE_DIR/restore-backups/$(date -u +%Y%m%dT%H%M%SZ).XXXXXX")
  cp -p "$STATE_FILE" "$backup/state.yaml"
  cp -p "$target_ckpt" "$backup/checkpoint.ckpt"
  [[ ! -f "$dec" ]] || cp -p "$dec" "$backup/decisions.jsonl"
  tmp_state=$(mktemp "$STATE_DIR/.restore-state.XXXXXX")
  tmp_dec=$(mktemp "$STATE_DIR/.restore-decisions.XXXXXX")
  trap 'rm -f "${tmp_state:-}" "${tmp_dec:-}"; rmdir "$STATE_DIR/.decisions.lock" 2>/dev/null || true' EXIT
  # R126 合流嫁接：同一原子写内把 verify_result/verify_evidence 一并重置——
  # 回滚语义=快照之后的工作不算数，结论同属快照之后（否则陈旧 pass 残留放行 archive）。
  awk -v p="$cp_phase" '/^phase:/ {if(!done) print "phase: " p; done=1; next}
    /^verify_result:/ {print "verify_result: pending"; vdone=1; next}
    /^verify_evidence:/ {print "verify_evidence:"; next}
    {print} END {if(!done) print "phase: " p}' "$STATE_FILE" > "$tmp_state"
  [[ ! -f "$dec" ]] || head -n "$cp_dec_lines" "$dec" > "$tmp_dec"
  if ! mv "$tmp_state" "$STATE_FILE" || { [[ -f "$dec" ]] && ! mv "$tmp_dec" "$dec"; }; then
    cp -p "$backup/state.yaml" "$STATE_FILE"
    [[ ! -f "$backup/decisions.jsonl" ]] || cp -p "$backup/decisions.jsonl" "$dec"
    echo "ERROR: 恢复写入失败，原文件存档: $backup" >&2; return 1
  fi
  echo "=== restore 到 checkpoint: $(basename "$target_ckpt") ==="
  echo "  phase 已回滚到: $cp_phase"
  echo "  verify_result/verify_evidence 已作废（重新 verify 后再归档）"
  echo "  decisions.jsonl: ${cur_lines} → ${cp_dec_lines} 行；恢复前存档: $backup"
  echo "✓ restore 完成（回滚 phase + 决策记录 + 作废 verify 旧结论；文件内容不回滚——文件级恢复走决策 13 断点续传/git）"
  rm -f "$tmp_state" "$tmp_dec"
  rmdir "$lock"
  trap - EXIT INT TERM
}

case "${1:-}" in
  init) init_state "${2:-}" "${3:-}" ;;   # --force 透传
  get) get_field "${2:-}" ;;
  set)
    # R126：受保护字段 fail-closed。旧版 set 对任意字段零门禁——`set phase archive` +
    # `set verify_result pass` 两步即可伪造全流程走完（transition 逐级校验与 guard
    # 准入全部形同虚设）。纪律：phase/created_at 只走 transition/init；verify_result=pass
    # 须先挂证据（MEA 铁律：自我声明不改变持久状态，evidence 先于结论）。
    case "${2:-}" in
      phase|created_at)
        echo "ERROR: 字段 ${2} 受保护——阶段推进用 transition <phase>（逐级+准入守卫），created_at 由 init 写入" >&2
        exit 1 ;;
      verify_result)
        if [[ "${3:-}" == "pass" && -z "$(get_field verify_evidence 2>/dev/null)" ]]; then
          echo "ERROR: verify_result=pass 须先挂证据——先 set verify_evidence \"<gate-run#N 或验证报告路径>\"（MEA 铁律）" >&2
          exit 1
        fi ;;
    esac
    set_field "${2:-}" "${3:-}" ;;
  transition) transition_phase "${2:-}" ;;
  guard) guard_phase "${2:-}" ;;
  next) next_phase ;;
  auto) auto_phase ;;
  status) show_status ;;
  dump-journal) dump_journal ;;
  restore-journal) restore_journal ;;
  checkpoint) checkpoint_phase ;;
  checkpoints|list-checkpoints) list_checkpoints ;;
  restore) restore_phase "${2:-}" ;;
  # update: 原地修订 plan + reconcile 关联 artifacts（openspec v1.6.0 /opsx:update 能力的脚本背书）
  # 不回退到 open 阶段，在当前 design 阶段内修订 plan
  update)
    echo "=== 原地修订 plan ==="
    current=$(get_field phase)
    if [[ "$current" != "design" && "$current" != "build" ]]; then
      echo "ERROR: update 仅在 design/build 阶段可用（当前 ${current}）"
      exit 1
    fi
    echo "  当前阶段: $current — 允许原地修订 plan + reconcile tasks"
    echo "  → 若装了 openspec: openspec update $(get_field change)"
    echo "  → 修订后须重跑 guard $current 确认门禁仍通过"
    ;;
  *) echo "Usage: state-machine.sh {init|get|set|transition|guard|next|status|update|dump-journal|restore-journal|checkpoint|restore} [args]"; exit 1 ;;
esac
