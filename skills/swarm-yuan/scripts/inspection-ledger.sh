#!/usr/bin/env bash
# inspection-ledger.sh — 迎检台账工具（合规检查能力，随发 compliance 档）
#
# 三模式（数据正本：references/regulatory-checkpoint-table.md + compliance-checkpoints.md §6）：
#   checklist    解析主表 173 条 → 按技术域渲染人工核查清单（机检项标注门禁 flag）
#   ledger       运行合规门禁套件（precheck --compliance-suite --format json，可选 --with-test 追加 --test）
#                × §6 机检映射表 → 统一台账（md + jsonl），未配置/未运行如实披露
#   agent-audit  智能体安全 A1～F3 机检子集对目标技能自身配置出证（B1/C4/D2/E1）
#
# 语义：advisory——发现项不置非零退出码（门禁只检测，修复由 AI 在 fail-closed 约束下完成）；
#       数据源缺失或解析失败 fail-closed（exit 2）。输出目录：--project-dir 下 .swarm-yuan/inspection/。
#
# 用法：bash scripts/inspection-ledger.sh <mode> [--project-dir DIR] [--skill-dir DIR] [--with-test]
set -uo pipefail

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(cd "${SELF_DIR}/.." && pwd)"
PROJECT_DIR="$(pwd)"
WITH_TEST=0
MODE="${1:-}"
shift 2>/dev/null || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-dir) PROJECT_DIR="$2"; shift 2;;
    --skill-dir)   SKILL_DIR="$2"; shift 2;;
    --with-test)   WITH_TEST=1; shift;;
    *) echo "✗ 未知参数：$1" >&2; exit 2;;
  esac
done

TABLE_MD="${SKILL_DIR}/references/regulatory-checkpoint-table.md"
CKPT_MD="${SKILL_DIR}/references/compliance-checkpoints.md"
OUT_DIR="${PROJECT_DIR}/.swarm-yuan/inspection"
TS="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
MAP_FILE=""
TABLE_CACHE=""

die() { echo "✗ $*" >&2; exit 2; }

cleanup() { rm -f "$MAP_FILE" "$TABLE_CACHE" 2>/dev/null || true; }
trap cleanup EXIT

require_sources() {
  [[ -s "$TABLE_MD" ]] || die "主表数据正本缺失：${TABLE_MD}（compliance 档随发件，勿单独分发脚本）"
  [[ -s "$CKPT_MD" ]] || die "检查点知识件缺失：${CKPT_MD}"
  # 数据契约锚：表头列序冻结，缺列即解析必错，前置拦截
  head -8 "$TABLE_MD" | grep -q '^| 优先级 | 编号 | 技术域 | 控制点 | 检查点 | 判断阈值 | 证据类型 | 义务条款（法规·条号） | 处罚编号 |' \
    || die "主表表头列序与数据契约不符（应 9 列冻结，见 regulatory-checkpoint-table.md 数据契约注记）"
  grep -q '^## 6\. 机检映射表' "$CKPT_MD" || die "机检映射表锚标题缺失（compliance-checkpoints.md §6 冻结契约）"
}

# §6 映射表 → 缓存：flag<TAB>ids(空格分隔)<TAB>罚则锚
read_mapping() {
  MAP_FILE="$(mktemp "${TMPDIR:-/tmp}/il-map.XXXXXX")"
  awk -F'|' '
    /^## 6\. 机检映射表/ { inmap=1; next }
    /^## / { inmap=0 }
    inmap && /^\| --/ {
      flag=$2; gsub(/^ +| +$/, "", flag)
      ids=$3;  gsub(/^ +| +$/, "", ids)
      pen=$5;  gsub(/^ +| +$/, "", pen)
      gsub(/、/, " ", ids)
      print flag "\t" ids "\t" pen
    }' "$CKPT_MD" > "$MAP_FILE"
  [[ -s "$MAP_FILE" ]] || die "机检映射表解析为空（§6 表行格式漂移）"
}

# 主表 → 缓存：id<TAB>域<TAB>优先级<TAB>检查点<TAB>阈值<TAB>证据<TAB>义务条款<TAB>处罚编号
read_table() {
  awk -F'|' '/^\| P[123]·/ {
    id=$3; gsub(/^ +| +$/, "", id)
    if (id !~ /^TECH-[0-9][0-9][0-9]$/) next
    dom=$4; pri=$2; chk=$6; thr=$7; ev=$8; duty=$9; pen=$10
    gsub(/^ +| +$/, "", dom); gsub(/^ +| +$/, "", pri); gsub(/^ +| +$/, "", chk)
    gsub(/^ +| +$/, "", thr); gsub(/^ +| +$/, "", ev); gsub(/^ +| +$/, "", duty); gsub(/^ +| +$/, "", pen)
    print id "\t" dom "\t" pri "\t" chk "\t" thr "\t" ev "\t" duty "\t" pen
  }' "$TABLE_MD" > "$TABLE_CACHE"
  local n
  n=$(wc -l < "$TABLE_CACHE" | tr -d ' ')
  [[ "$n" -eq 173 ]] || die "主表解析行数 ${n} ≠ 173（数据契约漂移，先核对源表）"
}

# checkpoint id → 覆盖它的 flag 清单（stdout：逗号分隔）
map_flags_for() {
  awk -F'\t' -v id="$1" '$2 ~ ("(^| )" id "( |$)") { printf "%s%s", sep, $1; sep="," }' "$MAP_FILE"
}

# id → 主表行（stdout：域/检查点/义务条款/处罚编号，tab 分隔；无则空）
table_row_for() {
  awk -F'\t' -v i="$1" '$1==i { print $2 "\t" $4 "\t" $7 "\t" $8; exit }' "$TABLE_CACHE"
}

do_checklist() {
  local out="${OUT_DIR}/checklist.md"
  mkdir -p "$OUT_DIR" || die "无法创建输出目录 ${OUT_DIR}"
  local cur_dom=""
  local flags=""
  local n_mach=0
  n_mach=$(awk -F'\t' '{ n=split($2,a," "); for(i=1;i<=n;i++) seen[a[i]]=1 } END { c=0; for (k in seen) c++; print c+0 }' "$MAP_FILE")
  {
    echo "# 执法检查人工核查清单（TECH-001～173，按技术域分组）"
    echo
    echo "> 生成：inspection-ledger.sh checklist（${TS}）。机检列=对应门禁 flag（结论仍需按证据列补人工证据）；人工=纯人工核查。填写纪律见 compliance-checkpoints.md §0。"
    echo
    while IFS=$'\t' read -r id dom pri chk thr ev duty pen; do
      if [[ "$dom" != "$cur_dom" ]]; then
        [[ -n "$cur_dom" ]] && echo ""
        echo "## ${dom}"
        echo
        echo "| 编号 | 优先级 | 检查点 | 判断阈值 | 证据类型 | 机检 |"
        echo "|---|---|---|---|---|---|"
        cur_dom="$dom"
      fi
      flags="$(map_flags_for "$id")"
      [[ -n "$flags" ]] || flags="人工"
      echo "| ${id} | ${pri} | ${chk} | ${thr} | ${ev} | ${flags} |"
    done < "$TABLE_CACHE"
    echo ""
    echo "统计：检查点 173 条；机检映射覆盖 ${n_mach} 条（其余 $((173-n_mach)) 条纯人工）。"
  } > "$out"
  echo "✓ 人工核查清单：${out}"
}

# precheck json 行 → stdout：gate<TAB>status<TAB>ids（gate 名剥 check_ 前缀，与 §6 映射 flag 对齐）；skipped 汇总为 skipped<TAB>-<TAB>清单
parse_gate_json() {
  printf '%s\n' "$1" | awk '
    {
      n=split($0, parts, /"gate":"/)
      for (i=2; i<=n; i++) {
        ent=parts[i]
        sub(/\][}].*/, "", ent)                       # 只取本条目（ids 数组闭合即条目结束）
        split(ent, f, "\"")
        g=f[1]
        sub(/^check_/, "", g)
        gsub(/_/, "-", g)
        st=""
        if (match(ent, /"status":"[^"]*"/)) st=substr(ent, RSTART+10, RLENGTH-11)
        ids=""
        if (match(ent, /"ids":\[[^]]*\]/)) { ids=substr(ent, RSTART+7, RLENGTH-8); gsub(/"/, "", ids); gsub(/,/, " ", ids) }
        if (g != "") printf "%s\t%s\t%s\n", g, st, ids
      }
      if (match($0, /"skipped":\[[^]]*\]/)) {
        sk=substr($0, RSTART+11, RLENGTH-12); gsub(/[",]/, " ", sk); gsub(/check_/, " ", sk); gsub(/ +/, " ", sk)
        printf "skipped\t-\t%s\n", sk
      }
    }'
}

# 运行 precheck（flags 透传）→ stdout：提取的 json 行（原始输出留档）
_PRECHECK_RUN_SEQ=0
run_precheck_json() {
  # 证据独立化：每次 precheck 运行落独立 precheck-raw.<seq>.log/stderr——
  # 多次调用（compliance-suite/sensitive/test）不再互相覆盖，证据链完整可溯。
  _PRECHECK_RUN_SEQ=$((_PRECHECK_RUN_SEQ + 1))
  local _seq="${_PRECHECK_RUN_SEQ}"
  local raw=""
  local json=""
  local _flagname="${1}"; _flagname="${_flagname#--}"
  local _raw_f="${OUT_DIR}/precheck-raw.${_seq}-${_flagname}.log"
  local _err_f="${OUT_DIR}/precheck-stderr.${_seq}-${_flagname}.log"
  raw="$( cd "$PROJECT_DIR" && bash "$SKILL_DIR/scripts/precheck.sh" "$@" --format json 2>"$_err_f" )" || true
  printf '%s\n' "$raw" > "$_raw_f"
  ln -sf "precheck-raw.${_seq}-${_flagname}.log" "${OUT_DIR}/precheck-raw.log"
  if grep -q '已禁用' "$_raw_f" "$_err_f" 2>/dev/null; then
    die "门禁套件被状态门禁禁用（skill 仍为 draft）——完成填充并 --mark-active 后重跑（见 ${_raw_f}）"
  fi
  json="$(printf '%s\n' "$raw" | grep -o '{"version".*' | tail -1)"
  [[ -n "$json" ]] || die "precheck $* --format json 未产出结构化结果（见 ${_raw_f}）——门禁套件执行异常"
  printf '%s\n' "$json"
}

do_ledger() {
  local precheck="${SKILL_DIR}/scripts/precheck.sh"
  [[ -f "$precheck" ]] || die "precheck.sh 缺失：${precheck}（ledger 依赖目标技能自带门禁执行入口）"
  mkdir -p "$OUT_DIR" || die "无法创建输出目录 ${OUT_DIR}"
  local runs_file="${OUT_DIR}/gate-results.tsv"
  local json=""
  : > "$runs_file"
  json="$(run_precheck_json --compliance-suite)" || exit 2
  parse_gate_json "$json" > "$runs_file"
  # --sensitive 属核心档、不在合规套件 19 条内，而它是 B1/TECH-013/021 的机检面——单跑补齐
  json="$(run_precheck_json --sensitive)" || exit 2
  parse_gate_json "$json" | grep -v '^skipped' >> "$runs_file" || true
  if [[ "$WITH_TEST" -eq 1 ]]; then
    json="$(run_precheck_json --test)" || exit 2
    parse_gate_json "$json" | grep -v '^skipped' >> "$runs_file" || true
  fi
  [[ -s "$runs_file" ]] || die "门禁结果解析为空（runs 解析失败）"
  local md_out="${OUT_DIR}/ledger.md"
  local jl_out="${OUT_DIR}/ledger.jsonl"
  local skipped_by_flag=""
  skipped_by_flag="$(awk -F'\t' '$1=="skipped"{print $3}' "$runs_file" | tr ' ' '\n' | grep -v '^$' | sort -u | tr '\n' ' ')"
  : > "$jl_out"
  local flag=""
  local ids=""
  local st_by_flag=""
  local verdict=""
  local ev=""
  local id=""
  local row=""
  local dom=""
  local chk=""
  local duty=""
  local pen=""
  {
    echo "# 合规检查统一台账（机检面）"
    echo
    echo "> 生成：inspection-ledger.sh ledger（${TS}）。证据=precheck --format json 输出（留档 ${OUT_DIR}/precheck-raw.log）；映射非判定——pass 仅代表机检面未见异常，完整结论仍需按主表证据列补人工证据；门禁未配置=如实披露（绿不等于合规）。"
    echo
    echo "| 域 | 编号 | 检查项 | 依据（义务条款→处罚编号） | 机检证据 | 结论 |"
    echo "|---|---|---|---|---|---|"
    while IFS=$'\t' read -r flag ids _pen; do
      st_by_flag="$(awk -F'\t' -v g="${flag#--}" '$1==g{print $2; exit}' "$runs_file")"
      case "${st_by_flag:-}" in
        fail) verdict="机检发现（须整改或豁免留痕）";;
        warn) verdict="机检告警（逐条裁决）";;
        pass) verdict="机检未见异常（人工证据仍需补齐）";;
        *)  if [[ " ${skipped_by_flag} " == *" ${flag#--} "* ]]; then
              verdict="门禁未配置（如实披露）"
            else
              verdict="未运行（不在本轮门禁执行面）"
            fi;;
      esac
      ev="precheck ${flag}：${st_by_flag:-无结果}（${OUT_DIR}/precheck-raw.log）"
      for id in $ids; do
        if [[ "$id" == TECH-* ]]; then
          row="$(table_row_for "$id")"
          if [[ -n "$row" ]]; then
            dom="$(printf '%s' "$row" | cut -f1)"
            chk="$(printf '%s' "$row" | cut -f2)"
            duty="$(printf '%s' "$row" | cut -f3)"
            pen="$(printf '%s' "$row" | cut -f4)"
            echo "| ${dom} | ${id} | ${chk} | ${duty}→${pen} | ${ev} | ${verdict} |"
            printf '{"ts":"%s","id":"%s","gate":"%s","status":"%s"}\n' "$TS" "$id" "${flag#--}" "${st_by_flag:-none}" >> "$jl_out"
          fi
        else
          echo "| 智能体安全 | ${id} | 检查项见 compliance-checkpoints.md §4 | §4 检查项 | ${ev} | ${verdict} |"
          printf '{"ts":"%s","id":"%s","gate":"%s","status":"%s"}\n' "$TS" "$id" "${flag#--}" "${st_by_flag:-none}" >> "$jl_out"
        fi
      done
    done < "$MAP_FILE"
    echo ""
    echo "未覆盖面：主表 173 条中未入 §6 映射的检查点为纯人工项，用 checklist 模式生成核查清单。整改与复核栏按 §0 台账纪律补齐（整改措施/责任人/期限/复核结果）。"
  } > "$md_out"
  echo "✓ 机检台账：${md_out}（jsonl：${jl_out}）"
}

do_agent_audit() {
  local out="${OUT_DIR}/agent-audit.md"
  mkdir -p "$OUT_DIR" || die "无法创建输出目录 ${OUT_DIR}"
  local conf="${SKILL_DIR}/scripts/precheck.conf"
  local hooks="${SKILL_DIR}/hooks/hooks.json"
  local b1_hits=""
  local b1_n=0
  local c4="人工核查（沙箱目录配置）"
  local d2="人工核查（审批门禁配置）"
  local e1="人工核查（操作日志五字段）"
  if [[ -f "$conf" ]]; then
    # 脱敏：只落 位置:变量名，不落疑似凭证原值（原值留在 conf，由人核对——台账外发不携带密文）。
    b1_hits="$(grep -nEi '(password|passwd|secret[_a-z0-9-]*|api[_-]?key|access[_-]?key|token) *= *["'"'"'][A-Za-z0-9_./+=-]{12,}["'"'"']' \
      "$SKILL_DIR"/scripts/*.conf 2>/dev/null | grep -v '（填入\|example\|sample\|xxxx\|CHANGE' \
      | awk -F: '{n=$1; sub(/=.*/,"",$3); print n": 疑似凭证变量 "$3}' || true)"
    b1_n="$(printf '%s\n' "$b1_hits" | grep -c . )" || true
    if [[ "$(grep -c '^WRITABLE_DIRS=(' "$conf" 2>/dev/null || true)" -gt 0 && "$(grep -c 'WRITABLE_DIRS=()$' "$conf" 2>/dev/null || true)" -eq 0 ]]; then
      c4="机检：WRITABLE_DIRS 已配置（边界仍需运行时验证）"
    fi
    if [[ -f "$hooks" && "$(grep -c 'fail-gate-hook' "$hooks" 2>/dev/null || true)" -gt 0 ]]; then
      d2="机检：hooks 挂接 fail-gate-hook（审批门禁面在位）"
    fi
  fi
  if [[ -f "${PROJECT_DIR}/.swarm-yuan/decisions.jsonl" || -f "${PROJECT_DIR}/.swarm-yuan/gate-runs/gate-runs.jsonl" || -f "${PROJECT_DIR}/.swarm-yuan/ops.jsonl" ]]; then
    e1="机检：留痕文件在位（decisions/gate-runs/ops 至少一件）"
  fi
  local b1_line="机检未见异常（conf 面扫描）"
  [[ "${b1_n:-0}" -gt 0 ]] && b1_line="机检发现：${b1_n} 处疑似硬编码凭证（见文末清单）"
  {
    echo "# 智能体安全自查（A1～F3）"
    echo
    echo "> 生成：inspection-ledger.sh agent-audit（${TS}）。机检=配置面证据；人工=需运行期/制度面核查（判据见 compliance-checkpoints.md §4）。"
    echo
    echo "| 编号 | 结论 |"
    echo "|---|---|"
    echo "| A1 | 人工核查（岗位工具集裁剪记录） |"
    echo "| A2 | 人工核查 |"
    echo "| A3 | 人工核查 |"
    echo "| B1 | ${b1_line} |"
    echo "| B2 | 人工核查（凭证有效期台账） |"
    echo "| B3 | 人工核查（服务账号清单） |"
    echo "| B4 | 人工核查（白名单/认证配置） |"
    echo "| C1 | 人工核查（工具分级与审批策略） |"
    echo "| C2 | 人工核查（行级隔离设计） |"
    echo "| C3 | 人工核查（工具白名单） |"
    echo "| C4 | ${c4} |"
    echo "| D1 | 人工核查（系统指令固化层） |"
    echo "| D2 | ${d2} |"
    echo "| D3 | 人工核查（子代理权限衰减） |"
    echo "| E1 | ${e1} |"
    echo "| E2 | 人工核查（三类告警配置） |"
    echo "| E3 | 人工核查（日志覆盖与留存时长） |"
    echo "| F1 | 人工核查 |"
    echo "| F2 | 人工核查 |"
    echo "| F3 | 人工核查 |"
    if [[ -n "$b1_hits" ]]; then
      echo ""
      echo "B1 疑似命中（逐条裁决：真凭证移入密管 / 误报留痕 decisions.jsonl）："
      echo ""
      printf '%s\n' "$b1_hits" | sed 's/^/    /'
    fi
  } > "$out"
  echo "✓ 智能体安全自查：${out}"
}

case "$MODE" in
  checklist)    require_sources; read_mapping; TABLE_CACHE="$(mktemp "${TMPDIR:-/tmp}/il-tbl.XXXXXX")"; read_table; do_checklist;;
  ledger)       require_sources; read_mapping; TABLE_CACHE="$(mktemp "${TMPDIR:-/tmp}/il-tbl.XXXXXX")"; read_table; do_ledger;;
  agent-audit)  do_agent_audit;;
  --help|-h|help|"") sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
  *) die "未知模式：${MODE}（可用：checklist / ledger / agent-audit）";;
esac
exit 0
