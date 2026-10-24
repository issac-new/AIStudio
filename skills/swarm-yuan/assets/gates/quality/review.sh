# gate: review
# domain: quality / enforce: strict / tier: core
check_review() {
  echo "=== 代码审查（ocr/gstack 5 维审查执行 + 独立审查留痕核验两段式）==="
  # rebase 冲突解决（wp-p0-five-breaks ← wp-p1-eight-deepens）：P1 的 ocr 审查执行版与
  # P0-4 的留痕核验版曾在本文件重复定义 check_review——bash 后定义覆盖先定义，⑦ 硬门会静默失效。
  # 合并为单一函数两段式：
  #   第一段：ocr/gstack 5 维审查执行（正确性/安全/性能/可维护/测试覆盖），High/Critical → fail
  #   第二段：⑦独立审查节点硬性交付门（P0-4 九节点硬拆：原 ⑥ 混测试/审查，本批次独立为 ⑦）——
  #     生成物目录须存在 references/review-record.md 且非空（含 5 维审查点 + findings 表，零 TBD），否则 fail
  local found=0
  local _review_executed=0  # 追踪是否真跑了审查（ocr 未装时 fallback 不假装完成）
  local _ocr_ok=0           # ocr 真正产出审查结论（区别于"装了"）

  if has_ocr; then
    pass "ocr 已安装"
    _review_executed=1
    # 优先用 ocr review（diff 审查），有 git diff 时用 --from + --to
    if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      local base; base=$(_git_base)
      local head_ref; head_ref=$(git rev-parse HEAD 2>/dev/null || echo "HEAD")
      trace_tool "ocr" "review --from $base --to $head_ref"
      local diff_output; diff_output=$(ocr review --from "$base" --to "$head_ref" --audience agent --format text 2>&1 || true)
      if [[ -n "$diff_output" && "$diff_output" != *"Error"* ]]; then
        echo "$diff_output" | tail -30
        _ocr_ok=1
        # 检查是否有 High 级问题
        # R126-G14：旧 `grep -qiE 'high|critical|严重'` 子串匹配——干净报告里的
        # "High: 0" / "no high severity issues" / "Highest priority handled" 也判 fail。
        # 收紧为严重度标签形态；括号字面量用 POSIX 规范类（[([]/[])]，反斜杠转义在
        # 字符类内是未定义行为，BSD grep C locale 下 [\[(] 不识别——fixture 环境实证）；
        # 中文分支拆开单独求值（多分支混多字节在 C locale 下有整式失效面，R125 awk 同族坑）。
        if { echo "$diff_output" | grep -qiE '(^|[^a-z])(high|critical)[^a-z]+[1-9]|severity:[[:space:]]*(high|critical)|(high|critical)[[:space:]]+issue|[([](high|critical)[])]' \
             || echo "$diff_output" | grep -qE '(高|严重)(级|问题|缺陷)'; } \
          && ! echo "$diff_output" | grep -qiE '(no|zero|0)[[:space:]]+(high|critical)|high[^a-z0-9]*0[[:space:]]*(issue|finding|problem)'; then
          fail "ocr review 检测到 High/Critical 级问题（须修复）"
          found=1
        fi
        # A 方向：pre-emit 引用门（gstack #1539 吸收，治 fail-open/误报）——
        # finding 须逐字引用动机代码行（file:line），缺引用的 finding 降级 warn 压出主报告。
        # "If you cannot quote the motivating line(s), the finding is unverified."
        local _noref_cnt
        _noref_cnt=$(echo "$diff_output" | grep -iE 'issue|finding|问题|风险|漏洞' \
          | grep -vE '[a-zA-Z0-9_/.-]+\.[a-zA-Z]+:[0-9]+' | grep -c . || true)
        if [[ "${_noref_cnt:-0}" -gt 0 ]]; then
          warn "pre-emit 引用门：${_noref_cnt} 条 finding 未引用动机代码行（file:line），按 gstack #1539 降级（未验证 finding 不进主报告）"
        fi
        # A 方向：FP 硬排除清单（gstack cso 22 条硬排除吸收，治误报）——
        # 已知误报类模式命中时降级提示（可配 FP_EXCLUSIONS，| 分隔的 ERE 模式）。
        # 内置默认排除：文档文件误报（md/txt 不是可执行代码）、注释行、test/mock 样本。
        local _fp_patterns="${FP_EXCLUSIONS:-README|\.md:|\.txt:|// |# |\* }"
        local _fp_cnt
        _fp_cnt=$(echo "$diff_output" | grep -iE 'issue|finding|问题|风险|漏洞' \
          | grep -E "$_fp_patterns" | grep -c . || true)
        if [[ "${_fp_cnt:-0}" -gt 0 ]]; then
          warn "FP 硬排除：${_fp_cnt} 条 finding 命中已知误报类（文档/注释/样本），降级提示（可配 FP_EXCLUSIONS 扩展）"
        fi
      else
        # --from/--to 失败时降级为 ocr scan
        # 降级链须核真——scan 也失败（如 LLM endpoint 未配）时不得让外层
        # 打"ocr 已执行，无 High/Critical"假 pass（实证：endpoint 错误后仍绿）。
        # 判定用输出形态（非空且无 Error 头行），不用退出码——本文件宿主 set -euo pipefail，
        # 管道失败须 || true 护栏，退出码取不到。
        warn "ocr review --from/--to 失败（可能无 diff 或参数不支持），降级 ocr scan"
        local scan_dirs=""; scan_dirs=$(printf '%s ' "${WRITABLE_DIRS[@]+"${WRITABLE_DIRS[@]}"}")
        if [[ -n "$scan_dirs" ]]; then
          trace_tool "ocr" "scan --path $scan_dirs"
          local _scan_out
          _scan_out=$(ocr scan --path "$scan_dirs" --audience agent --format text 2>&1 | tail -30 || true)
          if [[ -n "$_scan_out" ]] && ! printf '%s' "$_scan_out" | grep -q '^Error'; then
            printf '%s\n' "$_scan_out"
            _ocr_ok=1
          else
            [[ -n "$_scan_out" ]] && printf '%s\n' "$_scan_out"
          fi
        fi
      fi
    else
      # 非 git 仓库：用 ocr scan
      trace_tool "ocr" "scan"
      local _scan_out
      _scan_out=$(ocr scan --audience agent --format text 2>&1 | tail -30 || true)
      if [[ -n "$_scan_out" ]] && ! printf '%s' "$_scan_out" | grep -q '^Error'; then
        printf '%s\n' "$_scan_out"
        _ocr_ok=1
      else
        [[ -n "$_scan_out" ]] && printf '%s\n' "$_scan_out"
        warn "ocr scan 失败或无输出——审查未真正执行"
      fi
    fi
  else
    warn "ocr 未安装，安装 ocr（npm i -g @alibaba-group/open-code-review）或由 AI 按 5 维度审查：正确性/安全/性能/可维护/测试覆盖"
    echo "  两遍清单：CRITICAL（SQL/竞态/注入/越权/路径穿越）+ INFORMATIONAL（命名/注释/风格）"
    echo "  严重度：High（必修）/ Medium（评估）/ Low（丢弃）"
    # A 方向：pre-emit 引用门指引（gstack #1539）——AI 审查每条 finding 须引用动机代码行（file:line），
    # 缺引用的 finding 视为未验证，压出主报告。置信度标定：high/medium/low，低置信压附录。
    echo "  pre-emit 引用门（gstack #1539）：每条 finding 须引用动机代码行（file:line），缺引用=未验证压出主报告"
    # A 方向：置信度标定 + FP 硬排除指引（gstack cso 吸收）——
    # finding 带置信度（high/medium/low，低置信压附录）；已知误报类（文档/注释/样本）先排除。
    echo "  置信度标定（gstack cso）：finding 带 high/medium/low 置信度，低置信压附录；FP 硬排除：文档/注释/test/mock 样本误报先过滤（可配 FP_EXCLUSIONS）"
  fi

  # 附加：如果装了 gstack，提示可用的扩展审查维度
  # 候选目录跨宿主生态探测（Claude Code skills/plugins + 通用 ~/.agents/skills + ZCode ~/.zcode/skills）
  local _gd
  for _gd in "$HOME/.claude/skills/gstack" "$HOME/.agents/skills/gstack" "$HOME/.zcode/skills/gstack"; do
    if [[ -d "$_gd" ]]; then
      echo "  gstack 扩展审查可用：/cso（安全 OWASP+STRIDE）/ /investigate（根因调试）/ /codex（跨模型第二意见）/ /benchmark（性能）"
      break
    fi
  done

  # 附加：gsd-tools CLI 整合（WP1.3）：若装了 gsd-tools 且项目用了 gsd-core（有 .planning/ 或 .gsd/），
  # 跑 `gsd-tools validate health` 检查项目一致性健康度。status!=healthy → warn（项目配置问题，非代码缺陷，不 fail）。
  # 未装/项目未用 gsd-core 时降级（本函数上方 ocr/手动清单已覆盖代码审查）。
  if has_gsd_tools; then
    local gsd_root="${GSD_PROJECT_DIR:-$PROJECT_DIR}"
    if [[ -n "$gsd_root" && ( -d "$gsd_root/.planning" || -d "$gsd_root/.gsd" ) ]]; then
      trace_tool "gsd-tools" "validate health --cwd $gsd_root"
      local gsd_health; gsd_health=$(gsd-tools validate health --cwd "$gsd_root" 2>/dev/null || true)
      if [[ -n "$gsd_health" ]]; then
        local gsd_status; gsd_status=$(echo "$gsd_health" | grep -oE '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"status"[[:space:]]*:[[:space:]]*"//;s/"$//')
        if [[ "$gsd_status" == "healthy" ]]; then
          pass "gsd-tools validate health: 项目一致性健康度通过"
        else
          warn "gsd-tools validate health: status=${gsd_status:-unknown}（项目 gsd-core 配置不一致，建议修复）"
          echo "$gsd_health" | grep -oE '"message"[[:space:]]*:[[:space:]]*"[^"]*"' | head -5 | sed 's/^/    /'
        fi
      fi
    fi
  fi

  # 实证反馈补强：审查须留痕——AI 审查是逻辑错误的审查兜底，
  # 但"看过了"没有证据等于没看。docs/reviews/ 下落一行审查记录（日期+范围+结论三要素，
  # 与 check_review_record 合规门禁的要素口径一致），给审查留可回放证据。
  local _rr_dir="${REVIEW_RECORD_DIR:-docs/reviews}"
  local _rr_today="${PROJECT_DIR:-.}/${_rr_dir}/$(date -u +%Y-%m-%d).md"
  if [[ -f "$_rr_today" ]]; then
    pass "今日审查留痕存在（${_rr_today}）"
  else
    warn "审查未留痕（${_rr_dir}/$(date -u +%Y-%m-%d).md 不存在）——AI 审查后须落一行：日期/范围/结论三要素"
  fi
  # ocr 未装时走 AI fallback（found=0 但未真审查），不假装完成，诚实 warn。
  # _review_executed 只说明"装了 ocr"，不说明"审查真跑成"——
  # review/scan 降级链全失败（如 LLM endpoint 未配）时不得打"无 High/Critical"假 pass。
  if [[ $_ocr_ok -eq 1 ]]; then
    [[ $found -eq 0 ]] && pass "代码审查检查完成（ocr 已执行，无 High/Critical 级问题）"
  elif [[ $_review_executed -eq 1 ]]; then
    warn "ocr 已安装但审查未真正执行（review/scan 降级链失败，如 LLM endpoint 未配置）——本门禁不构成审查证据；AI 须按 5 维度自行审查并在 review-record 留痕"
  else
    warn "代码审查未执行（ocr 未装；AI 须自行按 5 维度审查：正确性/安全/性能/可维护/测试覆盖，本门禁未验证）"
  fi

  # ── 第二段：独立审查留痕核验（⑦独立审查节点硬性交付门，九节点硬拆）──
  # 生成物目录须存在 references/review-record.md 且非空（含 5 维审查点 + findings 表），否则 fail。
  # 开关守卫（对齐 check_review_record 惯例）：REVIEW_RECORD_REQUIRED 未配置（默认 0）时
  # 降级 warn 明示、不 fail——CI 自举/工具仓库无生成物产物是常态，fail-closed 会让
  # precheck --all 在无 SKILL_DIR 上下文的环境恒红（CI 实证：gate-fixture review/summary 红）。
  # =1 时本段为 ⑦ 节点硬门（目标技能 active 态建议在 conf 里配置）。
  if [[ "${REVIEW_RECORD_REQUIRED:-0}" != "1" ]]; then
    warn "独立审查留痕核验未启用（REVIEW_RECORD_REQUIRED 未配置=warn 不 fail；=1 后核验 references/review-record.md 五维点+findings+零TBD）"
  else
  # 重置 found：第一段的结果已在上方各自 pass/warn/fail 落账，本段独立判定。
  found=0
  local _rr="${REVIEW_RECORD_FILE:-references/review-record.md}"
  # 允许 SKILL_DIR 前缀推导
  local _rr_path="$_rr"
  if [[ ! -f "$_rr_path" && -n "${SKILL_DIR:-}" && -f "${SKILL_DIR}/${_rr}" ]]; then
    _rr_path="${SKILL_DIR}/${_rr}"
  fi
  # 项目根直跑 precheck 时 SKILL_DIR 不存在——补技能标准落点 glob 探测
  # （create 默认生成到 <项目根>/.claude/skills/<name>/，review-record ⑦ 交付物在其 references/ 下）
  if [[ ! -f "$_rr_path" ]]; then
    local _rr_hit
    _rr_hit=$(_first_existing_file ".claude/skills/*/references/review-record.md" ".codex/skills/*/references/review-record.md")
    [[ -n "$_rr_hit" ]] && _rr_path="$_rr_hit"
  fi
  if [[ ! -f "$_rr_path" ]]; then
    fail "gate_review_record_missing: 独立审查产物不存在：${_rr}（⑦独立审查节点须 cp review-record-template.md 并填充 5 维审查点 + findings 表，作为审查证据落盘；缺则 review 门禁 fail）"
    found=1
  else
    if [[ ! -s "$_rr_path" ]]; then
      fail "gate_review_record_empty: 独立审查产物为空：${_rr_path}（须含评审表 + 5 维审查要点 + findings 表，非空）"
      found=1
    else
      # 5 维审查点存在性核验
      local _dims="正确性|安全|性能|可维护|测试覆盖"
      if ! grep -qE "$_dims" "$_rr_path" 2>/dev/null; then
        fail "gate_review_record_dims_missing: ${_rr_path} 缺 5 维审查点（正确性/安全/性能/可维护/测试覆盖）"
        found=1
      fi
      # findings 表存在性核验
      if ! grep -qE '发现项|findings|finding|## ' "$_rr_path" 2>/dev/null; then
        fail "gate_review_record_findings_missing: ${_rr_path} 缺 findings 表（独立审查须列发现项：文件/问题/处置）"
        found=1
      fi
      # 零 TBD
      if grep -qE 'TBD|待定|待明确|待补充' "$_rr_path" 2>/dev/null; then
        fail "gate_review_record_tbd: ${_rr_path} 含待定项——审查结论必须完整"
        found=1
      fi
    fi
  fi
  [[ $found -eq 0 ]] && pass "独立审查留痕核验通过（${_rr_path} 存在且含 5 维审查点 + findings 表，零待定项）"
  fi
}
