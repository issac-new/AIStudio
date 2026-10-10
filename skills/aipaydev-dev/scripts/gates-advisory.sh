#!/usr/bin/env bash
# advisory 物理文件（15 个 check_* 函数；原由 split-gates.sh 抽取，现手工维护；决策 19）
# 被 precheck.sh source（开发态/安装态同路径；install.sh 整目录拷贝含本文件）。
# 注：物理函数数 15 ≠ enforce-level advisory 16——check_method_size 物理在 gates-warn.sh
#   但 0 fail 机械归 advisory（新增，物理未迁移）；
#   check_cognition 在 fail-closed 化后由 warn 降为 advisory，物理与分档归位本文件。
# _enforce_of 读 gate-enforce-level.conf 而非文件位置（跨档情况见 gates-strict/warn.sh 头部）。
# 头部数字由 self-check.sh check_gates_header_comment 机器执法（防注释漂移）。
# 不要单独执行——依赖 precheck.sh 主文件的 fail()/warn()/pass() 与全局变量。

# ===== GATE_AI_JUDGMENT=1 时 5 个 advisory 门禁转 AI 自觉判断 =====
# 背景：机械门禁破坏 AI 灵活性（探索式评审结论）。
# 5 个候选：cognition / diagram / pr_quality / consistency / link_depth——
# 这些门禁的"质量判断"本质是 AI 看语义，不是 grep 能搞定的。
# GATE_AI_JUDGMENT 成为唯一模式（恒 1）——机械打分逻辑退役。
# 变量保留为兼容别名（旧 conf 设 0/1 均不影响行为），下游 _ai_hint 路径无条件生效。
_AI_JUDGMENT=1
_ai_hint() { # $1=门禁名 $2=AI 自查要点
  echo "=== $1（AI 自觉判断模式，GATE_AI_JUDGMENT=1）==="
  echo "  → AI 自查（不机械跑）：$2"
  echo "  → 提示：完成后可 echo 简单结论到 .swarm-yuan/notes/$(echo "$1" | tr '[:upper:]' '[:lower:]' | tr ' ' '-').md"
  pass "$1 已转 AI 自觉判断（advisory，不计 fail）"
}
check_consistency() {

  if [[ "$_AI_JUDGMENT" == "1" ]]; then
    _ai_hint "check_consistency" "逐文件读业务规则，对照数据勾稽核对（订单金额=Σ明细 / 库存=Σ在库+在途）；在 CONSISTENCY_DIRS 内人读 3-5 个核心文件；不要靠 grep"
  return 0
  fi
  # 机械分支已随 GATE_AI_JUDGMENT 恒 1 退役删除（D1 落地化——AI 判断引导为唯一模式）

}

check_link_depth() {

  if [[ "$_AI_JUDGMENT" == "1" ]]; then
    _ai_hint "check_link_depth" "挑 3 个核心用例，沿调用链逐层读代码（controller→service→repo），数层数；若 >6 层，AI 判断是否为适配层堆叠而非真实复杂度"
  return 0
  fi
  # 机械分支已随 GATE_AI_JUDGMENT 恒 1 退役删除（D1 落地化——AI 判断引导为唯一模式）

}

check_consistency_cross() {
  echo "=== BDAT 跨域一致性检查（TOGAF：业务-应用-数据命名一致 + 数据所有权 SoR）==="
  local found=0

  # ---- 1. 业务域术语表 vs 代码标识符命名一致性 ----
  if [[ -z "$GLOSSARY_FILE" ]]; then
    warn "未配置 GLOSSARY_FILE，跳过 BDAT 命名一致性检查（新建 GLOSSARY_FILE，格式：| 业务名 | 代码标识符 |（每行一个概念，供 --consistency-cross 校验））"
  elif [[ ! -f "$GLOSSARY_FILE" ]]; then
    warn "术语表文件不存在：${GLOSSARY_FILE}（TOGAF 要求业务域有统一术语表，避免同名异义/异名同义）"
  else
    # 解析术语表：每行 "业务名 <TAB> 代码标识符" 或 "| 业务名 | 代码标识符 |"
    # 跳过表头行（恰好是"业务名"）与分隔行（---）
    local entries; entries=$(LC_ALL=C awk '
      /^\|/ {
        gsub(/^\||\|$/,""); n=split($0,a,"|");
        if (n>=2) {
          gsub(/^ +| +$/,"",a[1]); gsub(/^ +| +$/,"",a[2]);
          if(a[1]!=""&&a[2]!="" && a[1]!="业务名" && a[1]!="业务" && a[1]!="名字" && a[1]!="标识符" && a[2] !~ /^[-:]+$/)
            print a[1]"\t"a[2]
        }
      }
      /\t/ { n=split($0,a,"\t"); if(a[1]!=""&&a[2]!=""&&a[1]!="业务名") print a[1]"\t"a[2] }
    ' "$GLOSSARY_FILE" 2>/dev/null || true)
    if [[ -n "$entries" ]]; then
      local biz code
      while IFS=$'\t' read -r biz code; do
        [[ -z "$biz" || -z "$code" ]] && continue
        # 检查代码中是否存在该标识符（粗筛：grep 类名/函数名/表名）
        # 注意 BSD grep：--include 必须紧跟 -r 选项，pattern 用 -e 防止 - 开头
        local hits
        hits=$(grep -rnwF --include='*.ts' --include='*.js' --include='*.py' --include='*.go' --include='*.sql' -e "$code" "${WRITABLE_DIRS[@]+"${WRITABLE_DIRS[@]}"}" 2>/dev/null | wc -l | xargs || true)
        if [[ "$hits" -eq 0 ]]; then
          warn "术语表中的代码标识符 '${code}'（业务名：${biz}）在代码中未找到——可能命名已漂移或术语表过时"
        fi
      done <<< "$entries"
    fi
  fi

  # ---- 2. 数据所有权（System of Record）检查 ----
  if [[ -z "$SOR_FILE" ]]; then
    warn "未配置 SOR_FILE，跳过数据所有权检查（新建 SOR_FILE，格式：| 实体 | 权威源 | 允许读 | 允许写 |（每个数据实体一行））"
  elif [[ ! -f "$SOR_FILE" ]]; then
    warn "数据所有权文件不存在：${SOR_FILE}（TOGAF 要求明确每个数据实体的 System of Record，避免双写不一致）"
  else
    # 解析 SoR 表：| 实体 | 权威源 | 允许读 | 允许写 |
    local sor_entries; sor_entries=$(LC_ALL=C awk '
      /^\|/ && !/^\|[-: ]+\|/ && !/实体|实体名/ {
        gsub(/^\||\|$/,""); n=split($0,a,"|");
        if (n>=2) { gsub(/^ +| +$/,"",a[1]); gsub(/^ +| +$/,"",a[2]); if(a[1]!="") print a[1]"\t"a[2] }
      }
    ' "$SOR_FILE" 2>/dev/null || true)
    if [[ -n "$sor_entries" ]]; then
      # 仅校验 SoR 表存在且实体有登记，详细双写检测需人工
      pass "数据所有权表存在（${SOR_FILE}），含 $(echo "$sor_entries" | wc -l | xargs) 个实体登记"
    fi
  fi

  if [[ $found -eq 0 ]]; then
    pass "BDAT 跨域一致性检查通过"
  fi
}

check_state() {
  echo "=== 状态管理检查（巨型store/prop drilling/派生状态）==="
  local found=0

  # 回归#18 防御：STORE_DIR/COMPONENT_DIR 为单目录标量（非空串才是目录）。
  # 用户误配成数组/空数组时 [[ -n "$STORE_DIR" ]] 在 set -u + bash 3.2 直接 unbound 崩溃；
  # 标量兜底后"If it's an array, treat as unset"——不崩、不假 pass，仅跳过本检查。
  [[ -z "${STORE_DIR:-}" ]] && STORE_DIR=""
  [[ -z "${COMPONENT_DIR:-}" ]] && COMPONENT_DIR=""

  # ---- 1. 巨型 store 检测：store 文件行数 ----
  if [[ -n "$STORE_DIR" && -d "$STORE_DIR" ]]; then
    if [[ "$MAX_STORE_LINES" -gt 0 ]]; then
      local sf
      while IFS= read -r sf; do
        [[ -z "$sf" ]] && continue
        local lines; lines=$(wc -l < "$sf" 2>/dev/null | xargs || echo 0)
        if [[ "$lines" -gt "$MAX_STORE_LINES" ]]; then
          warn "${sf} 有 ${lines} 行（>阈值 ${MAX_STORE_LINES}）——巨型 store 会导致改一个字段全组件重渲染，建议按领域拆分"
        fi
      done < <(find "$STORE_DIR" -type f \( -name '*.ts' -o -name '*.js' \) 2>/dev/null)
    fi
  else
    warn "未配置 STORE_DIR，跳过 store 检查"
  fi

  # ---- 2. Prop Drilling 深度检测：组件 props 透传链 ----
  if [[ -n "$COMPONENT_DIR" && -d "$COMPONENT_DIR" ]]; then
    # 粗筛：检测组件接收 props 后原样透传给子组件（...props / {...this.props}）
    local drilling
    drilling=$(_scan_src '\.\.\.props|\{\.\.\.props\}|\{\.\.\.this\.props\}|rest\.props|remaining.*props' 'ts,tsx,js,jsx,vue,svelte' 'test\|mock\|node_modules' "$COMPONENT_DIR")
    if [[ -n "$drilling" ]]; then
      local dcount; dcount=$(echo "$drilling" | wc -l | xargs || true)
      if [[ "$dcount" -gt 5 ]]; then
        warn "检测到 ${dcount} 处 props 透传（...props）——深度 prop drilling 会使中间组件被迫接收无关 props，建议 Context/compose"
      fi
    fi
  fi

  # ---- 3. 派生状态用 useState 检测（应改 useMemo/直接计算）----
  if [[ -n "$COMPONENT_DIR" && -d "$COMPONENT_DIR" ]]; then
    local derived
    derived=$(_scan_src 'useState\([^)]*(\.map|\.filter|\.reduce|\.sort|\.find|\.length|\.concat)' 'ts,tsx,js,jsx' 'test\|mock\|node_modules' "$COMPONENT_DIR")
    if [[ -n "$derived" ]]; then
      local dcount; dcount=$(echo "$derived" | wc -l | xargs || true)
      warn "检测到 ${dcount} 处 useState 内做派生计算（.map/.filter/.reduce 等）——派生状态应直接计算或 useMemo，存 state 会导致不同步"
      echo "$derived" | head -3 | sed 's/^/    /'
    fi
  fi

  if [[ $found -eq 0 ]]; then
    pass "状态管理检查通过"
  fi
}

check_cognition() {
  # 机械计分退役（awk 数表行数给"理解"打分——五轮诊断的病灶标本：
  # 0 fail、诱导填表冒充理解）。认知框架概念不删除，落地为 AI 判断引导 + notes 留痕——
  # 概念从"要背的名词"变为"AI 判断的检查单"，被真实消费（GATE_AI_JUDGMENT 唯一模式）。
  echo "=== 认知体检（check_cognition——AI 判断引导模式）==="
  echo "  机械计分已退役：本门禁不再用 awk 数表行数给理解打分。"
  echo "  → AI 按认知框架逐维自查（对照 reference-manual.md §1-§9），每维一句判断："
  echo "    ① 概念（六阶链第 1 阶）：核心业务概念是否都有定义？术语表与代码命名一致吗？"
  echo "    ② 结构（六阶链第 2 阶）：分层/模块边界清晰吗？有没有循环依赖？"
  echo "    ③ 映射（六阶链第 4 阶）：需求→组件→测试的对应关系完整吗？"
  echo "    ④ 规律（六阶链第 5 阶）：项目的隐性规律（编排约束/数据流向）被显式记录了吗？"
  echo "    ⑤ 动力学（六维）：关键链路的速度/聚散/趋势/强度/能耗/累积量中，哪维是本项目的痛点？"
  echo "    ⑥ 稳定性（五层认知）：哪些单元禁止改/稳定/不稳定？与 git churn 信号一致吗？"
  echo "  → 判断留痕：把每维一句判断写入 ${PROJECT_DIR:-.}/.swarm-yuan/notes/cognition.md"
  echo "    （六个月后回看 = 认知基线的纵向对比，替代此前的 14/22 机械分数）"
  if [[ ! -f "${PROJECT_DIR:-.}/.swarm-yuan/notes/cognition.md" ]]; then
    warn "认知自查留痕缺失（.swarm-yuan/notes/cognition.md 不存在）——AI 完成逐维自查后写入（advisory，不阻断）"
  else
    pass "认知自查留痕存在（notes/cognition.md，${PROJECT_DIR:-.}）——纵向对比见文件历史"
  fi
  return 0
}


check_diagram() {

  if [[ "$_AI_JUDGMENT" == "1" ]]; then
    _ai_hint "check_diagram" "AI 看 reference-manual.md 是否有架构图/调用链图（mermaid/echarts 任选）；没有则在 §9 加一段简短 ASCII 调用链（10 行内）"
  return 0
  fi
  # 机械分支已随 GATE_AI_JUDGMENT 恒 1 退役删除（D1 落地化——AI 判断引导为唯一模式）

}

# --operate：发布后运营验证（D 方向，warn 级 advisory——环境依赖型检查硬 fail 风险高）
# 检查：spec §23 灰度观察声明 / 健康检查端点可访问 / 告警阈值已配置 / runbook 已更新。
# 全未配置则跳过（与 advisory 姿态一致）；健康检查/告警/runbook 依赖部署环境，CI 不可达不硬 fail。
check_operate() {
  echo "=== 发布后运营（--operate，advisory）==="
  # ① spec §23 灰度观察声明
  local spec_f="${SPEC_FILE:-}"
  [[ -z "$spec_f" ]] && spec_f=$(_first_existing_file "docs/spec.md" "spec.md" "docs/spec-template.md" "spec-template.md")
  if [[ -n "$spec_f" && -f "$spec_f" ]]; then
    if grep -qE '## 23|发布后运营|灰度观察' "$spec_f" 2>/dev/null; then
      pass "spec 含 §23 发布后运营段（${spec_f}）"
    else
      warn "spec 缺 §23 发布后运营段（完整级别必填，D 方向研发全流程闭环）"
    fi
  else
    warn "未找到 spec 文件，跳过 §23 检查（可配 SPEC_FILE 启用）"
  fi
  # ② 健康检查端点（HEALTH_CHECK_URL 配置时 curl 探测，超时 5s）
  if [[ -n "${HEALTH_CHECK_URL:-}" ]]; then
    if command -v curl >/dev/null 2>&1; then
      if curl -sf --max-time 5 "$HEALTH_CHECK_URL" >/dev/null 2>&1; then
        pass "健康检查端点可访问（${HEALTH_CHECK_URL}）"
      else
        warn "健康检查端点不可达（${HEALTH_CHECK_URL}，环境依赖）"
      fi
    else
      warn "curl 不可用，跳过健康检查探测"
    fi
  fi
  # ③ 告警阈值配置（ALERT_CONFIG_FILE 存在且非空）
  if [[ -n "${ALERT_CONFIG_FILE:-}" ]]; then
    if [[ -s "$ALERT_CONFIG_FILE" ]]; then
      pass "告警阈值配置存在（${ALERT_CONFIG_FILE}）"
    else
      warn "告警配置文件缺失或为空：${ALERT_CONFIG_FILE}"
    fi
  fi
  # ④ runbook（RUNBOOK_FILE 存在）
  if [[ -n "${RUNBOOK_FILE:-}" ]]; then
    if [[ -f "$RUNBOOK_FILE" ]]; then
      pass "runbook 存在（${RUNBOOK_FILE}）"
    else
      warn "runbook 缺失：${RUNBOOK_FILE}"
    fi
  fi
  # 全未配置 → 跳过提示
  if [[ -z "${HEALTH_CHECK_URL:-}${ALERT_CONFIG_FILE:-}${RUNBOOK_FILE:-}" ]]; then
    echo "  (operate 监控项未配置，跳过——可配 HEALTH_CHECK_URL/ALERT_CONFIG_FILE/RUNBOOK_FILE 启用)"
  fi
}

# --decision-audit：决策审计轨迹完整性检查（G1 C 档，warn 级 advisory）
# 检查 .swarm-yuan/decisions.jsonl：① 每行 JSON 合法 ② UserChallenge 行五要素非空
# ③ 每阶段≥1 决策（有 phase 字段的行）。对齐 ISO/IEC 42001 人工监督留痕。
# 姿态：warn 级（决策留痕缺失不阻断开发，只提示可审计性缺口）。
check_decision_audit() {
  echo "=== 决策审计轨迹完整性（--decision-audit，advisory）==="
  local dec_file="${PROJECT_DIR:-$(pwd)}/.swarm-yuan/decisions.jsonl"
  if [[ ! -f "$dec_file" ]]; then
    warn "decisions.jsonl 不存在（决策未留痕，G1 决策治理；生成流程 draft 期可空）"
    return 0
  fi
  if [[ ! -s "$dec_file" ]]; then
    echo "  ℹ decisions.jsonl 存在但为空（draft 期允许）"
    return 0
  fi
  # ①② 逐行 JSON 合法性 + UserChallenge 五要素（有 python3 用 json.loads，无则 grep 降级）
  local issues=0
  if command -v python3 >/dev/null 2>&1; then
    local py_out
    py_out=$(python3 -c '
import sys, json
phases=set()
for i, line in enumerate(sys.stdin, 1):
    line=line.strip()
    if not line: continue
    try: obj=json.loads(line)
    except Exception as e:
        print("%d: 非法JSON (%s)" % (i, e)); continue
    if obj.get("phase"): phases.add(obj["phase"])
    if obj.get("type")=="UserChallenge":
        for k in ("ai_suggestion","rationale","alternatives","missing_context","cost_if_wrong"):
            if not obj.get(k): print("%d: UserChallenge 缺 %s" % (i, k))
print("PHASES:"+",".join(sorted(phases)) if phases else "PHASES:none")
' < "$dec_file" 2>/dev/null || true)
    # 提取问题行（非 PHASES 行）
    local problems
    problems=$(printf '%s\n' "$py_out" | grep -v '^PHASES:' || true)
    if [[ -n "$problems" ]]; then
      issues=$(printf '%s\n' "$problems" | grep -c . || true)
      printf '%s\n' "$problems" | while IFS= read -r p; do warn "decisions.jsonl:$p"; done
    fi
    local phases
    phases=$(printf '%s\n' "$py_out" | grep '^PHASES:' | sed 's/^PHASES://')
    [[ "$phases" != "none" && -n "$phases" ]] && pass "决策覆盖阶段：$phases"
  else
    # 降级：grep 字段存在性
    local ln=0 dline
    while IFS= read -r dline; do
      ln=$((ln + 1))
      echo "$dline" | grep -q '"type"' || { warn "decisions.jsonl:$ln: 非法JSON（缺 type）"; issues=$((issues+1)); continue; }
      echo "$dline" | grep -q '"type":"UserChallenge"' || continue
      for k in ai_suggestion rationale alternatives missing_context cost_if_wrong; do
        echo "$dline" | grep -q "\"$k\"" || { warn "decisions.jsonl:$ln: UserChallenge 缺 $k"; issues=$((issues+1)); }
      done
    done < "$dec_file"
  fi
  # 汇总
  local total
  total=$(grep -c . "$dec_file" 2>/dev/null || echo 0)
  if [[ "$issues" -eq 0 ]]; then
    pass "决策审计轨迹完整（${total} 条决策，JSON 合法 + UserChallenge 五要素齐备）"
  else
    warn "决策审计轨迹有 ${issues} 处完整性缺口（共 ${total} 条决策）"
  fi
}

# --canary：发布后基线对比监控（A 方向，gstack canary 吸收，warn 级 advisory）
# 哲学："alert on changes, not absolutes"（告警变化非绝对值）+ "don't cry wolf"（连续 2 次才告警）。
# 记录发布后健康指标（响应时间/错误率）基线到 .swarm-yuan/canary-baseline.jsonl，
# check_learnings（--learnings）：learn 闭环——检查 .swarm-yuan/learnings.jsonl
# 存在且对近期 fail 门禁有对应学习记录。advisory 级，不阻断交付。
# 理念来源：gstack learn 的 learnings.jsonl + 置信度 + operational self-improvement 闭环。
check_learnings() {
  echo "=== 学习闭环检查（--learnings，advisory）==="
  local learn_file="${PROJECT_DIR:-$(pwd)}/.swarm-yuan/learnings.jsonl"
  if [[ ! -f "$learn_file" ]]; then
    warn "learnings.jsonl 不存在（学习未留痕；learn 闭环——建议对近期 门禁失败记录根因与修复模式）"
    return 0
  fi
  if [[ ! -s "$learn_file" ]]; then
    echo "  ℹ learnings.jsonl 存在但为空（尚无学习记录）"
    return 0
  fi
  # 检查 JSONL 合法性 + 近 30 天记录覆盖率
  local issues=0 total=0 recent=0
  if command -v python3 >/dev/null 2>&1; then
    local py_out
    py_out=$(python3 -c '
import sys, json, time
now = time.time()
total = 0
recent = 0
low_confidence = 0
gates_with_learning = set()
for i, line in enumerate(sys.stdin, 1):
    line = line.strip()
    if not line: continue
    total += 1
    try:
        obj = json.loads(line)
    except Exception:
        print("%d: 非法JSON" % i); continue
    ts = obj.get("ts", "")
    if ts:
        try:
            t = time.mktime(time.strptime(ts[:19], "%Y-%m-%dT%H:%M:%S"))
            if now - t < 30 * 86400: recent += 1
        except Exception: pass
    for k in ("gate", "root_cause", "fix_pattern"):
        if not obj.get(k):
            print("%d: 缺 %s 字段" % (i, k)); break
    # 置信度字段检查（gstack learn 移植）
    conf = obj.get("confidence", "")
    if conf and conf not in ("high", "medium", "low"):
        print("%d: confidence 非法值（%s，须 high/medium/low）" % (i, conf))
    elif conf == "low":
        low_confidence += 1
    # 收集有学习记录的门禁（反哺门禁覆盖度）
    g = obj.get("gate", "")
    if g: gates_with_learning.add(g)
print("TOTAL:%d RECENT:%d LOW_CONF:%d GATES:%d" % (total, recent, low_confidence, len(gates_with_learning)))
print("GATES_WITH_LEARNING:" + ",".join(sorted(gates_with_learning)))
' < "$learn_file" 2>/dev/null || true)
    while IFS= read -r ln; do
      [[ -z "$ln" ]] && continue
      case "$ln" in
        TOTAL:*)
          total=$(echo "$ln" | sed 's/.*TOTAL:\([0-9]*\).*/\1/')
          recent=$(echo "$ln" | sed 's/.*RECENT:\([0-9]*\)/\1/')
          local _low_conf _gates_covered
          _low_conf=$(echo "$ln" | sed 's/.*LOW_CONF:\([0-9]*\).*/\1/')
          _gates_covered=$(echo "$ln" | sed 's/.*GATES:\([0-9]*\).*/\1/')
          ;;
        GATES_WITH_LEARNING:*)
          local _gates_list; _gates_list="${ln#GATES_WITH_LEARNING:}"
          if [[ -n "$_gates_list" ]]; then
            echo "  ℹ 有学习记录的门禁：$(echo "$_gates_list" | tr ',' ' ')"
          fi
          ;;
        *) echo "  ⚠ $ln"; issues=$((issues+1));;
      esac
    done <<< "$py_out"
  else
    # 无 python3 降级：只查行数和非空
    total=$(grep -c . "$learn_file" 2>/dev/null || echo 0)
    echo "  ℹ 无 python3，降级为行数检查（${total} 条记录）"
  fi
  if [[ "$total" -gt 0 && "$recent" -eq 0 ]]; then
    warn "learnings.jsonl 有 ${total} 条记录但近 30 天无新增——学习闭环停滞（learn 闭环：门禁失败应触发根因记录）"
  elif [[ "$total" -gt 0 ]]; then
    echo "  ✓ 学习闭环活跃（${total} 条记录，近 30 天 ${recent} 条）"
  fi
  if [[ $issues -eq 0 ]]; then
    pass "学习闭环检查通过（learnings.jsonl 格式合法，${total} 条记录）"
  fi
}

# check_state_phase（--state-phase）：comet 硬前置——阶段状态机证据核验
# 理念来源：comet "无证据不流转"。advisory 级（warn-only），不阻断交付。
# 检查 .swarm-yuan/state.json 存在且当前阶段有 evidence 记录。
check_state_phase() {
  echo "=== 阶段状态机证据核验（--state-phase，advisory；comet 理念：无证据不流转）==="
  local state_file="${PROJECT_DIR:-$(pwd)}/.swarm-yuan/state.json"
  if [[ ! -f "$state_file" ]]; then
    warn "state.json 不存在（comet 风格状态机未初始化；建议用 state-machine.sh init 初始化变更状态跟踪）"
    return 0
  fi
  if [[ ! -s "$state_file" ]]; then
    echo "  ℹ state.json 存在但为空（draft 期允许）"
    return 0
  fi
  # 解析 JSON：当前阶段 + evidence 字段
  local issues=0 phase="" has_evidence=0
  if command -v python3 >/dev/null 2>&1; then
    local py_out
    py_out=$(python3 -c '
import sys, json
try:
    with open(sys.argv[1]) as f:
        data = json.load(f)
except Exception as e:
    print("PARSE_ERROR: " + str(e)); sys.exit(0)
phase = data.get("current_phase") or data.get("phase") or ""
evidence = data.get("evidence") or data.get("phase_evidence") or {}
if not phase:
    print("MISSING_PHASE")
else:
    print("PHASE:" + phase)
    if isinstance(evidence, dict):
        for ph, ev in evidence.items():
            if not ev:
                print("NO_EVIDENCE:" + ph)
    elif isinstance(evidence, list):
        if len(evidence) == 0:
            print("NO_EVIDENCE:" + phase)
    elif not evidence:
        print("NO_EVIDENCE:" + phase)
    else:
        print("HAS_EVIDENCE")
' "$state_file" 2>/dev/null || true)
    while IFS= read -r ln; do
      [[ -z "$ln" ]] && continue
      case "$ln" in
        PARSE_ERROR:*) echo "  ⚠ state.json JSON 解析失败：${ln#PARSE_ERROR: }"; issues=$((issues+1));;
        MISSING_PHASE*) echo "  ⚠ state.json 缺 current_phase 字段"; issues=$((issues+1));;
        PHASE:*) phase="${ln#PHASE:}";;
        NO_EVIDENCE:*) echo "  ⚠ 阶段 ${ln#NO_EVIDENCE:} 无 evidence 记录（comet：无证据不流转）"; issues=$((issues+1));;
        HAS_EVIDENCE*) has_evidence=1;;
      esac
    done <<< "$py_out"
  else
    # 无 python3 降级：grep 检查关键字段
    phase=$(grep -oE '"current_phase"\s*:\s*"[^"]*"' "$state_file" 2>/dev/null | head -1 || true)
    [[ -z "$phase" ]] && { echo "  ⚠ state.json 缺 current_phase 字段"; issues=$((issues+1)); }
    grep -qE '"evidence"' "$state_file" 2>/dev/null || { echo "  ⚠ state.json 无 evidence 字段"; issues=$((issues+1)); }
  fi
  if [[ $issues -eq 0 ]]; then
    if [[ -n "$phase" ]]; then
      pass "阶段状态机证据核验通过（当前阶段：${phase#PHASE:}，evidence 在案）"
    else
      pass "阶段状态机证据核验通过"
    fi
  fi
}

# check_upstream_baseline（--upstream-baseline）：上游运行时基线 drift 核验
# 理念来源：上游基线漂移（comet/graphify/ruflo 版本落后）。
# 基线标记的正主是 docs/upstream-baseline.md（基线已自 README 物化移出，README 不再承载）。
# 候选序：项目内 → 技能根 → 技能根上一级（生成器仓内布局）；均无则跳过（目标技能侧无基线属正常）。
# 文件存在但 0 个 baseline_status 标记时显式 warn（不得以 synced=0 drifted=0 假通过）。
check_upstream_baseline() {
  echo "=== 上游运行时基线 drift 核验（--upstream-baseline，advisory）==="
  local _sd="${SKILL_DIR:-${_CONF_DIR:-$(pwd)}/..}"
  local bl_file=""
  local _cand
  for _cand in "${PROJECT_DIR:-$(pwd)}/docs/upstream-baseline.md" "${_sd}/docs/upstream-baseline.md" "${_sd}/../docs/upstream-baseline.md"; do
    if [[ -f "$_cand" ]]; then bl_file="$_cand"; break; fi
  done
  if [[ -z "$bl_file" ]]; then
    # warn 而非 skip：目标技能侧无基线属正常，但维持显式披露口径（执行统计与历史 golden 一致）
    warn "基线文件不存在（docs/upstream-baseline.md 未找到——目标技能侧无基线属正常）"
    return 0
  fi
  local drifted=0 synced=0 watch=0 license_risk=0
  # 扫 baseline_status= 标记
  while IFS= read -r ln; do
    [[ -z "$ln" ]] && continue
    case "$ln" in
      *baseline_status=synced*) synced=$((synced+1));;
      *baseline_status=drifted*) drifted=$((drifted+1));;
      *baseline_status=watch*) watch=$((watch+1));;
      *baseline_status=license-risk*) license_risk=$((license_risk+1));;
    esac
  done < "$bl_file" 2>/dev/null
  if [[ $((synced + drifted + watch + license_risk)) -eq 0 ]]; then
    warn "基线文件 ${bl_file} 存在但无任何 baseline_status 标记——基线未登记或已迁移，请重核（不以零标记假通过）"
    return 0
  fi
  echo "  ⓘ 上游基线（${bl_file}）：synced=${synced} drifted=${drifted} watch=${watch} license-risk=${license_risk}"
  if [[ $drifted -gt 0 ]]; then
    warn "上游运行时 ${drifted} 项 drifted（引用基线落后上游最新版）——建议重核并更新基线"
    grep -nE 'baseline_status=drifted' "$bl_file" 2>/dev/null | head -5 | sed 's/^/    /'
  fi
  if [[ $license_risk -gt 0 ]]; then
    warn "上游运行时 ${license_risk} 项 license-risk（许可证冲突风险）——须法务评估"
    grep -nE 'baseline_status=license-risk' "$bl_file" 2>/dev/null | head -5 | sed 's/^/    /'
  fi
  if [[ $drifted -eq 0 && $license_risk -eq 0 ]]; then
    pass "上游运行时基线核验通过（${synced} synced / ${watch} watch，无 drift 无 license-risk）"
  fi
}

# check_pr_quality（--pr-quality）：PR 质量评分 + fingerprint 去重
# 理念来源：gstack PR Quality Score + fingerprint 去重 +1 boost / Red Team。
# advisory 级（warn-only）。轻量实现：从 git diff 计算变更规模 + 重复模式检测。
check_pr_quality() {

  if [[ "$_AI_JUDGMENT" == "1" ]]; then
    _ai_hint "check_pr_quality" "AI 看 git diff 三指标：①是否超过 500 行（建议拆 PR）②是否含 >3 个无关改动 ③重复模式（同一文件改 3+ 处相似逻辑）；给一句判断"
  return 0
  fi
  # 机械分支已随 GATE_AI_JUDGMENT 恒 1 退役删除（D1 落地化——AI 判断引导为唯一模式）

}

# check_skill_supply_chain（--skill-supply-chain）：Skill 供应链安全审计
# 理念来源：cso Phase 8 Skill Supply Chain。advisory 级。
# 扫描 .claude/skills/ 下第三方 skill 的已知恶意模式。
check_skill_supply_chain() {
  echo "=== Skill 供应链安全审计（--skill-supply-chain，advisory；cso P8 理念）==="
  # 回归#19：扫描范围默认锁定项目级 .claude/skills（PROJECT_DIR 内）。
  # 仅在项目内无此目录时兜底扫全局 ~/.claude/skills，且加 --max-count 限额防止
  # 巨型全局 skill 仓库（1G+ / 2000+ 文件）下 grep 多模式 × 全文件导致超时（60s 内必返回）。
  local skills_dir="${PROJECT_DIR:-$(pwd)}/.claude/skills"
  local scan_global=0
  if [[ ! -d "$skills_dir" ]]; then
    # 兜底：~/.claude/skills
    skills_dir="${HOME}/.claude/skills"
  fi
  if [[ ! -d "$skills_dir" ]]; then
    echo "  ℹ 无 .claude/skills 目录，Skill 供应链审计跳过"
    return 0
  fi
  [[ "$skills_dir" == "${HOME}/.claude/skills" ]] && scan_global=1
  local found=0
  # ① 恶意模式扫描（cso P8：SKILL.md 是可执行提示代码，不豁免文档文件）
  local suspicious_files=""
  local skill_f
  # 回归#19：全局兜底扫描时限额（前 200 个文件 + 单文件 grep 超时），避免 1G+ 巨型仓库超时。
  local _ssc_limit=0
  while IFS= read -r skill_f; do
    [[ -z "$skill_f" ]] && continue
    ((_ssc_limit++)); [[ $_ssc_limit -gt 200 ]] && { warn "全局 skills 超 200 文件，供应链审计仅扫前 200（其余建议单独跑 check_skill_supply_chain <目录>）"; break; }
    # 检测 eval/exec + 网络请求组合（.sh）
    if grep -qE --max-count=1 '\beval\s*\(' "$skill_f" 2>/dev/null && grep -qE --max-count=1 'curl\s|wget\s|fetch\(' "$skill_f" 2>/dev/null; then
      suspicious_files="${suspicious_files}${skill_f}: eval+网络请求\n"
      found=1
    fi
    # 检测混淆代码（base64 解码后执行）
    if grep -qE --max-count=1 'base64.*decode.*\|.*bash|base64.*-d.*\|.*sh' "$skill_f" 2>/dev/null; then
      suspicious_files="${suspicious_files}${skill_f}: base64 混淆执行\n"
      found=1
    fi
    # 检测硬编码外部 URL + 下载执行
    if grep -qE --max-count=1 'curl.*\|.*bash|wget.*\|.*sh' "$skill_f" 2>/dev/null; then
      suspicious_files="${suspicious_files}${skill_f}: 远程脚本下载执行\n"
      found=1
    fi
    # cso P8 补充：凭证访问模式（读 ~/.ssh ~/.aws ~/.config 敏感目录）
    if grep -qE --max-count=1 'cat\s+~/\.ssh|cat\s+~/.aws|cat\s+~/.config|source\s+~/.ssh|cat\s+~/.env' "$skill_f" 2>/dev/null; then
      suspicious_files="${suspicious_files}${skill_f}: 凭证访问（读敏感目录）\n"
      found=1
    fi
    # cso P8 补充：提示注入覆写（尝试修改系统提示/覆写 skill 文件）
    if grep -qE --max-count=1 'override.*system.*prompt|ignore.*previous.*instructions|覆写.*提示|覆盖.*system' "$skill_f" 2>/dev/null; then
      suspicious_files="${suspicious_files}${skill_f}: 提示注入覆写尝试\n"
      found=1
    fi
    # cso P8 补充：网络外联（非项目域名硬编码）
    if grep -qE --max-count=1 'https?://[a-zA-Z0-9.-]+\.(ru|tk|ml|ga|cf)' "$skill_f" 2>/dev/null; then
      suspicious_files="${suspicious_files}${skill_f}: 可疑 TLD 网络外联\n"
      found=1
    fi
  done < <(find "$skills_dir" -maxdepth 2 -type f \( -name '*.sh' -o -name '*.md' \) 2>/dev/null || true)
  if [[ -n "$suspicious_files" ]]; then
    warn "检出 Skill 供应链可疑模式（cso P8：恶意 skill 可能利用 eval/网络请求/混淆执行/凭证访问/提示注入覆写）：
$(printf '%b\n' "$suspicious_files" | head -5 | sed 's/^/    /')"
  fi
  # ② UPSTREAM.md / 许可证登记检查（warn-only）
  local upstream_count
  upstream_count=$(find "$skills_dir" -maxdepth 2 \( -name 'UPSTREAM.md' -o -name 'LICENSE' \) 2>/dev/null | wc -l | xargs || true)
  local total_skills
  total_skills=$(find "$skills_dir" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l | xargs || true)
  if [[ $total_skills -gt 0 && $upstream_count -lt $total_skills ]]; then
    warn "Skills 目录有 ${total_skills} 个 skill 但仅 ${upstream_count} 个有 UPSTREAM.md/LICENSE——供应链溯源不完整"
    found=1
  fi
  [[ $found -eq 0 ]] && pass "Skill 供应链安全审计通过（无恶意模式，溯源登记完整）"
}

# check_canary 已于 2026-07-27 决策 26.1 等价替换为 check_loop_oracle（gates-strict.sh）
# 以腾出门禁预算（决策 26.2 冻结 55 上限）。canary 监控能力保留为 references/canary-monitoring.md
# 文档 + Oracle Gate 循环形式（bash scripts/setup-loop.sh --verify '<canary 验证命令>'）。
# 原 check_canary 函数体已删除，此处保留占位注释供 self-check 计数核验（check_canary 不再计入
# FACT_GATES_TOTAL，FACT_GATES_ADVISORY_ONLY 从 10 降至 9）。

# --cwe-audit：CWE 元数据库对账（B 方向完整分级，advisory）
# 检查仓库内所有 CWE-[0-9]+ 标注是否在 cwe-database.md 登记 + 每条有检查点 + 严重度分级。
# 对齐 ISO/IEC 5055:2021 / GB/T 34943 / CWE Top 25:2025。
check_cwe_audit() {
  echo "=== CWE 元数据库对账（--cwe-audit，advisory）==="
  local base="${PROJECT_DIR:-$(pwd)}"
  # 生成器自身：base=swarm-yuan/；目标 skill：base=项目根（references/cwe-database.md 拷贝自生成器）
  local cwe_db=""
  for cand in "$base/references/cwe-database.md" "$base/swarm-yuan/references/cwe-database.md"; do
    [[ -f "$cand" ]] && cwe_db="$cand" && break
  done
  if [[ -z "$cwe_db" ]]; then
    warn "cwe-database.md 不存在（CWE 元数据库未生成）"
    return 0
  fi
  local db_cwes
  db_cwes=$(grep -oE 'CWE-[0-9]+' "$cwe_db" | sort -u)
  local db_cnt; db_cnt=$(echo "$db_cwes" | grep -c . || true)
  echo "  cwe-database.md 登记条目: ${db_cnt} 条"

  # 收集仓库内所有 CWE 标注（框架规则 md + framework-gates + security-spec）
  local scan_dirs=()
  for d in "$base/references/frameworks" "$base/swarm-yuan/references/frameworks" "$base/references" "$base/swarm-yuan/references" "$base/assets/framework-gates" "$base/swarm-yuan/assets/framework-gates"; do
    [[ -d "$d" ]] && scan_dirs+=("$d")
  done
  local repo_cwes="" _found
  for d in ${scan_dirs[@]+"${scan_dirs[@]}"}; do
    _found=$(grep -rhoE 'CWE-[0-9]+' "$d"/*.md "$d"/*.sh 2>/dev/null || true)
    [[ -n "$_found" ]] && repo_cwes="${repo_cwes}${repo_cwes:+$'\n'}$_found"
  done
  # security-spec.md 也扫
  for f in "$base/references/security-spec.md" "$base/swarm-yuan/references/security-spec.md"; do
    [[ -f "$f" ]] && repo_cwes="${repo_cwes}${repo_cwes:+$'\n'}$(grep -oE 'CWE-[0-9]+' "$f" 2>/dev/null || true)"
  done
  repo_cwes=$(echo "$repo_cwes" | sort -u | grep . || true)
  local repo_cnt; repo_cnt=$(echo "$repo_cwes" | grep -c . || true)
  echo "  仓库内 CWE 标注（去重）: ${repo_cnt} 条"

  # 对账：仓库内有但数据库无 → 未登记
  local unregistered=0
  local cwe
  while IFS= read -r cwe; do
    [[ -z "$cwe" ]] && continue
    if ! echo "$db_cwes" | grep -qxF "$cwe"; then
      warn "CWE 未在 cwe-database.md 登记: $cwe"
      unregistered=$((unregistered + 1))
    fi
  done <<< "$repo_cwes"

  # 数据库有但仓库无 → 无检查点（孤儿条目）
  local orphans=0
  while IFS= read -r cwe; do
    [[ -z "$cwe" ]] && continue
    if ! echo "$repo_cwes" | grep -qxF "$cwe"; then
      orphans=$((orphans + 1))
    fi
  done <<< "$db_cwes"

  if [[ "$unregistered" -eq 0 && "$orphans" -eq 0 ]]; then
    pass "CWE 元数据库对账通过（${db_cnt} 条全登记 + 全有检查点，ISO 5055/GB 34943 对齐）"
  else
    [[ "$unregistered" -gt 0 ]] && warn "${unregistered} 条 CWE 标注未在 cwe-database.md 登记"
    [[ "$orphans" -gt 0 ]] && echo "  ℹ ${orphans} 条 CWE 在数据库登记但仓库无标注（文档级锚点，非缺陷）"
  fi
}

# --cert-audit：安全认证合规聚合门禁（等保4级/BCP5级/GB22240/PCI-DSS/ISO27001）
# 按 CERT_PROFILE 配置，聚合检查各认证标准的可机器化项 + 列出人工核对清单。
# 详见 references/security-certification-profiles.md。
# 姿态：聚合调度现有门禁（--crypto/--privacy/--security/--authz/--sbom/--shift-left/--operate/--compliance），
#       按认证标准要求组合检查 + 人工核对项 warn 提示。advisory 级（不重复各门禁的 fail 逻辑）。
check_cert_audit() {
  echo "=== 安全认证合规聚合（--cert-audit，advisory）==="
  local profile="${CERT_PROFILE:-}"
  if [[ -z "$profile" ]]; then
    echo "  (CERT_PROFILE 未配置——可选：dengbao4|bcp5|gb22240|jrt0142|pcidss|iso27001|all)"
    echo "  配置后在 precheck.compliance.conf 设 CERT_PROFILE 或环境变量传入"
    return 0
  fi
  local spec_f="${SPEC_FILE:-}"
  local has_spec=0
  [[ -n "$spec_f" && -f "$spec_f" ]] && has_spec=1
  local checks=0 warns=0

  _cert_check() { # $1=检查项名 $2=关联门禁 $3=状态(pass/warn/fail) $4=说明
    checks=$((checks + 1))
    case "$3" in
      pass) echo "  ✓ [$1] $2: $4" ;;
      warn) warns=$((warns + 1)); echo "  ⚠ [$1] $2: $4" ;;
      *)    warns=$((warns + 1)); echo "  ✗ [$1] $2: $4" ;;
    esac
  }

  # 等保4级（dengbao4）
  if [[ "$profile" == "dengbao4" || "$profile" == "all" ]]; then
    echo "--- 等保4级（GB/T 22239-2019 9.1.4.x）---"
    _cert_check "数据保密性" "--crypto" "pass" "须 CRYPTO_PROFILE=gm 启用国密 SM4 加密（9.1.4.8），运行 --crypto 联检"
    _cert_check "个人信息保护" "--privacy+--crypto" "pass" "须 --privacy 扫描 + 密码技术保护（9.1.4.11）"
    _cert_check "数据完整性" "--crypto" "warn" "国密 SM3 哈希正向核查（9.1.4.7），须 CRYPTO_PROFILE=gm"
    _cert_check "审计日志留存" "--shift-left" "warn" "spec §21 须声明日志留存≥6个月 + 异地实时备份（9.1.4.3）"
    _cert_check "灾备恢复等级" "--shift-left" "warn" "spec §20 须声明灾备≥4级（9.1.4.9，联动 BCP5级）"
    _cert_check "强制访问控制MAC" "人工核对" "warn" "9.1.4.2 MAC 是 OS/DB 层——人工核对策略配置"
    _cert_check "入侵检测IDS" "人工核对" "warn" "9.1.4.4 HIDS/NIDS 是运行态设施——人工核对"
    _cert_check "可信验证TPM" "人工核对" "warn" "9.1.4.6 可信根是硬件级——人工核对 TPM/TCM 实现"
    _cert_check "介质剩余信息" "人工核对" "warn" "9.1.4.10 密码技术擦除存储介质——人工核对"
    _cert_check "等保4级门禁联检" "--dengbao" "pass" "DENGBAO_LEVEL=4 启用 --dengbao 逐项检查（含 SM4/MFA/审计）"
  fi

  # BCP5级（bcp5）
  if [[ "$profile" == "bcp5" || "$profile" == "all" ]]; then
    echo "--- 业务连续性5级（GB/T 20988-2007 第5级）---"
    if [[ $has_spec -eq 1 ]]; then
      grep -qE 'RTO|RPO|灾备|灾难恢复' "$spec_f" 2>/dev/null \
        && _cert_check "灾备RTO/RPO声明" "--shift-left §20" "pass" "spec 含 RTO/RPO 声明" \
        || _cert_check "灾备RTO/RPO声明" "--shift-left §20" "warn" "spec §20 须声明 RTO≤6h/RPO≤15min（一类系统，GB/T 20988 6.3.2）"
      grep -qE '演练|灾备.*验证' "$spec_f" 2>/dev/null \
        && _cert_check "灾备演练记录" "--operate" "pass" "spec 含演练记录声明" \
        || _cert_check "灾备演练记录" "--operate" "warn" "spec §23 须声明灾备演练≥1次/年（GB/T 20988 第10章）"
    else
      _cert_check "灾备RTO/RPO声明" "--shift-left" "warn" "SPEC_FILE 未配置，无法核查灾备声明"
    fi
    _cert_check "实时数据传输" "人工核对" "warn" "第5级标志：实时数据传输是运行态设施——人工核对"
    _cert_check "应用级自动切换" "人工核对" "warn" "第5级标志：自动切换是运行态设施——人工核对"
  fi

  # GB/T 22240 定级（gb22240）
  if [[ "$profile" == "gb22240" || "$profile" == "all" ]]; then
    echo "--- GB/T 22240-2020 等保定级指南 ---"
    if [[ $has_spec -eq 1 ]]; then
      grep -qE '安全保护等级|等保.*级|定级' "$spec_f" 2>/dev/null \
        && _cert_check "定级声明" "--compliance" "pass" "spec 含定级声明" \
        || _cert_check "定级声明" "--compliance" "warn" "spec §22 须含安全保护等级声明（GB/T 22240-2020）"
    else
      _cert_check "定级声明" "--compliance" "warn" "SPEC_FILE 未配置"
    fi
    _cert_check "定级文档存在" "人工核对" "warn" "须有定级报告文档（定级→备案→按级保护）"
  fi

  # JR/T 0142-2016 银行卡清算业务设施技术要求（jrt0142）
  if [[ "$profile" == "jrt0142" || "$profile" == "all" ]]; then
    echo "--- JR/T 0142-2016 银行卡清算业务设施 + 《清算机构管理办法》---"
    _cert_check "国密SM2/3/4加密" "--crypto" "pass" "须 CRYPTO_PROFILE=gm（GB/T 39786 8.4 联动）"
    _cert_check "C3信息保护" "--sensitive+--crypto" "pass" "不得明文存储/传输/展示（JR/T 0171 6.1.1 联动）"
    _cert_check "多因素鉴别" "--dengbao" "pass" "须 DENGBAO_LEVEL=3（等保三级 8.1.4.1 d 联动）"
    _cert_check "PAN持卡人数据扫描" "--privacy" "pass" "须 --privacy 扩展 PAN 模式（PCI-DSS Req 3 对标）"
    _cert_check "漏洞管理CVE" "--sbom" "pass" "CVE 阈值门禁（PCI-DSS Req 6 对标）"
    _cert_check "审计日志≥6个月" "--shift-left" "warn" "spec §21 须声明日志留存≥6个月（网安法§21 联动）"
    _cert_check "灾备RTO/RPO" "--shift-left" "warn" "spec §20 须声明 RTO≤6h/RPO≤15min/能力≥5级（JR/T 0044 联动）"
    _cert_check "灾备演练≥1次/年" "--operate" "warn" "spec §23 须声明灾备演练记录（JR/T 0044 第10章）"
    _cert_check "数据本地化声明" "spec§22" "warn" "境外机构数据须境内存储（《清算机构管理办法》§31）"
    _cert_check "独立清算+灾备系统" "spec§22" "warn" "须声明独立/安全/高效清算系统+灾备系统（§10 准入条件）"
    _cert_check "网络分区分域" "人工核对" "warn" "边界防护/入侵检测是网络设施——人工核对"
    _cert_check "高可用双活/主备" "人工核对" "warn" "可用性架构是运行态——人工核对"
  fi

  # PCI-DSS 4.0（pcidss）
  if [[ "$profile" == "pcidss" || "$profile" == "all" ]]; then
    echo "--- PCI-DSS 4.0 ---"
    _cert_check "持卡人数据PAN扫描" "--privacy" "pass" "须 --privacy 扩展 PAN 模式扫描（Req 3）"
    _cert_check "传输加密" "--security" "pass" "禁用弱 TLS（Req 4）——--security §1.8"
    _cert_check "存储加密" "--crypto" "pass" "AES-256/SM4 加密存储（Req 3）"
    _cert_check "漏洞管理" "--sbom" "pass" "CVE 阈值门禁（Req 6）——--sbom CVE_THRESHOLD"
    _cert_check "访问控制MFA" "--authz" "pass" "缺鉴权/IDOR 检测（Req 7/8）"
    _cert_check "默认密码更改" "--security" "pass" "硬编码密码检测（Req 2）——--security §1.1"
    _cert_check "审计日志留存≥1年" "--shift-left" "warn" "spec §21 须声明日志留存≥1年（Req 10）"
    _cert_check "安全策略文档" "--compliance" "warn" "spec §22 须含安全策略声明（Req 12）"
  fi

  # ISO 27001:2022（iso27001）
  if [[ "$profile" == "iso27001" || "$profile" == "all" ]]; then
    echo "--- ISO/IEC 27001:2022 技术控制（Annex A.8）---"
    _cert_check "A.8.5身份验证" "--authz" "pass" "授权类门禁覆盖"
    _cert_check "A.8.7恶意代码" "--security/--sbom" "pass" "安全扫描+SBOM CVE 覆盖"
    _cert_check "A.8.8漏洞管理" "--sbom" "pass" "CVE 阈值门禁"
    _cert_check "A.8.11数据掩码" "--privacy" "pass" "PII 扫描覆盖"
    _cert_check "A.8.23 Web安全" "--security" "pass" "XSS/CSRF/注入检测"
    _cert_check "A.8.24密码学" "--crypto" "pass" "弱算法+国密检查"
    _cert_check "A.8.25-28安全SDLC" "--security+--shift-left" "pass" "安全开发+左移覆盖"
    _cert_check "A.8.33测试数据保护" "--privacy" "pass" "测试目录 PII 扫描"
    _cert_check "A.8.9配置管理" "--security" "warn" "调试模式/CORS 检测（部分）"
    _cert_check "A.8.15日志记录" "--shift-left" "warn" "spec §21 日志声明"
    _cert_check "A.8.31环境分离" "人工核对" "warn" "开发/测试/生产分离——人工核查配置"
    _cert_check "A.8.32变更管理" "--shift-left" "warn" "spec §20 变更左移声明"
    _cert_check "A.8.16监控/IDS" "人工核对" "warn" "入侵检测是运行态设施——人工核对"
    _cert_check "A.8.21网络隔离" "人工核对" "warn" "网络隔离是网络设施——人工核对"
  fi

  echo ""
  echo "  汇总：${checks} 项检查（${warns} 项须人工核对/声明补全），fail-closed 项由各门禁独立判定"
  echo "  边界：认证本身需机构测评/审计（等保测评机构/PCI QSA/ISO 27001 认证机构），本门禁是门禁级可查+文档锚点"
}
