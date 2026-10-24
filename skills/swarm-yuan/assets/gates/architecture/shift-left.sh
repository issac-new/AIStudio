# gate: shift-left
# domain: architecture / enforce: strict / tier: arch
check_shift_left() {
  echo "=== 左移检查（Shift-Left：测试设计+变更影响+可观测性，防缺陷/变更/故障流入后段）==="
  local found=0 _sl_skipped=0

  # ---- 定位 spec 文件 ----
  # 本门禁原用 _first_existing_file
  # 硬编码文件名发现——不走 SPEC_GLOB（fail-gate-hook/check_reuse 均走 _find_spec_file），
  # docs/specs/*.md 约定位的具体 spec 对本门禁不可见（spec-first 拦它写码，左移检查却不认它
  # 的 spec——同一 conf 语义两套发现逻辑）。统一走 _find_spec_file（SPEC_GLOB 优先）。
  local spec_file="${SPEC_FILE:-}"
  [[ -z "$spec_file" ]] && spec_file=$(_find_spec_file '测试设计|测试左移|测试策略|可观测性')
  # 排除 *template* 模板文件--模板的 §19/§20/§21 标题本就该存在，把模板当具体 spec 检会自证 pass（乞题谬误）
  [[ -n "$spec_file" && "$(basename "$spec_file")" == *template* ]] && spec_file=""
  local test_design_file="${TEST_DESIGN_FILE:-$spec_file}"
  local obs_file="${OBSERVABILITY_FILE:-$spec_file}"

  # ---- 定位 plan 文件 ----
  local plan_file="${CHANGE_IMPACT_FILE:-}"
  # R140 T2-D3：候选全为模板路径且模板名必被下方排除=死发现清单，「未找到 plan」warn 恒在。
  # 九节点工作流的 plan 产物落 .swarm-yuan/tasks.md（④节点），置候选首位使其真承载 §20 执法；
  # 未采用该工作流的项目不受影响（落空回模板路径→排除→warn 口径不变）。
  [[ -z "$plan_file" ]] && plan_file=$(_first_existing_file ".swarm-yuan/tasks.md" "plan-template.md" "plans/plan-template.md" "docs/plan-template.md")
  # plan 模板同样排除（模板含 §20 标题会自证 pass）
  [[ -n "$plan_file" && "$(basename "$plan_file")" == *template* ]] && plan_file=""

  echo "  ── 测试左移（spec §19 + test 先于 impl）──"

  # 1a. spec §19 测试设计段存在（硬门禁）
  if [[ -n "$test_design_file" && -f "$test_design_file" ]]; then
    if grep -qE '^## .*19.*测试左移|^## §19' "$test_design_file" 2>/dev/null; then
      pass "spec §19 测试左移段存在"
      # 检查 §19.2 用例骨架表是否有实质内容
      local case_rows; case_rows=$(awk '/^### 19\.2/,/^### 19\.3/' "$test_design_file" 2>/dev/null | grep -cE '^\|.*\|.*\|.*\|.*\|' || true)
      if [[ "$case_rows" -ge 3 ]]; then
        pass "§19.2 用例骨架有 $case_rows 行（含边界/异常用例）"
      else
        warn "§19.2 用例骨架行数不足（${case_rows}），须覆盖正常/边界/异常路径"
      fi
    else
      fail "spec 缺 §19 测试左移段——测试设计须在 spec 阶段写，不可编码后才补"
      found=1
    fi
  else
    warn "未找到 spec 文件，跳过 §19 测试左移段检查（配置 SPEC_FILE 或 TEST_DESIGN_FILE）"
    _sl_skipped=1
  fi

  # 1b. git diff 中 test 文件先于或同时于 impl 文件提交（warn）
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    local base; base=$(_git_base)
    local test_commits impl_commits
    # 测试文件形态必须跨栈识别：旧正则只认 JS 的 .test./.spec./__tests__ + Rust tests/*.rs，
    # Java *Test.java / Go *_test.go / Python test_*.py / Ruby *_spec.rb 全部漏检——
    # 这些栈明明先提交了测试，仍被判定"无 test 文件提交"，测试先行门禁形同虚设。
    local _test_path_re='(^|/)(tests?|__tests__|spec|specs)/|\.(test|spec|cy)\.[A-Za-z0-9]+$|(^|/)test_[^/]+\.(py|rs|rb|exs|dart)$|_test\.(go|py|rb|exs|dart)$|[A-Za-z0-9_](Test|Tests|IT|Spec)\.(java|kt|scala|cs|swift|php)$'
    test_commits=$(git log --name-only --pretty=format: "$base..HEAD" 2>/dev/null | grep -E "$_test_path_re" | sort -u | wc -l | tr -d ' ' || true)
    impl_commits=$(git log --name-only --pretty=format: "$base..HEAD" 2>/dev/null | grep -vE "$_test_path_re|\.md$|\.json$|\.lock$" | grep -E '\.(ts|tsx|js|jsx|py|go|java|kt|scala|cs|swift|php|rb|rs)$' | sort -u | wc -l | tr -d ' ' || true)
    # 防御：若值非纯数字（git log 异常输出多行），强制归 0
    test_commits=$(_norm_int "${test_commits:-0}")
    impl_commits=$(_norm_int "${impl_commits:-0}")
    if [[ "$impl_commits" -gt 0 && "$test_commits" -eq 0 ]]; then
      warn "本次变更有 $impl_commits 个 impl 文件但无 test 文件提交——须先写/更新测试再实现（TDD/BDD）"
      found=1
    elif [[ "$impl_commits" -gt 0 && "$test_commits" -gt 0 ]]; then
      pass "本次变更有 test 文件提交（$test_commits test + $impl_commits impl）"
    fi
  fi

  # 实证反馈补强：spec §11 测试策略段非占位核验——
  # "测试兜底逻辑错误"的前提是 spec 里有真测试设计，不是空表。§19 管"测试左移段存在"，
  # 此处管"§11 测试策略有实质内容"（单元/集成行须填覆盖范围，非空单元格）。
  if [[ -n "$test_design_file" && -f "$test_design_file" ]]; then
    local _s11_filled
    _s11_filled=$(awk '/^## 11\./,/^## 12\./' "$test_design_file" 2>/dev/null | grep -E '^\|[[:space:]]*[^|[:space:]（]' | grep -cvE '\|[[:space:]]*\|[[:space:]]*\|[[:space:]]*\|' || true)
    if [[ "${_s11_filled:-0}" -ge 2 ]]; then
      pass "spec §11 测试策略段有实质内容（${_s11_filled} 个非空行）"
    else
      warn "spec §11 测试策略段疑似占位（非空行 ${_s11_filled:-0}<2）——逻辑错误的测试兜底要求§11 有真设计（单测/集测覆盖范围必填）"
    fi
  fi

  echo "  ── 变更左移（plan §20 变更影响 + 回滚预案 + 迁移兼容）──"

  # 2a. plan §20 变更影响段存在（硬门禁）
  if [[ -n "$plan_file" && -f "$plan_file" ]]; then
    if grep -qE '^## .*20.*变更左移|^## §20' "$plan_file" 2>/dev/null; then
      pass "plan §20 变更左移段存在"
    else
      fail "plan 缺 §20 变更左移段——变更影响范围须在 plan 阶段写"
      found=1
    fi
  else
    warn "未找到 plan 文件，跳过 §20 变更左移段检查（配置 CHANGE_IMPACT_FILE）"
    _sl_skipped=1
  fi

  # 2b. spec 含回滚预案声明（硬门禁）
  if [[ -n "$spec_file" && -f "$spec_file" ]]; then
    local has_rollback
    has_rollback=$(grep -ciE "$ROLLBACK_KEYWORDS" "$spec_file" 2>/dev/null || true)
    has_rollback=$(_norm_int "${has_rollback:-0}")
    if [[ "$has_rollback" -ge 1 ]]; then
      pass "spec 含回滚预案声明（$has_rollback 处提及）"
    else
      fail "spec 无回滚预案声明——须含回滚方式+验证+窗口"
      found=1
    fi
  fi

  # 2c. 数据库迁移无破坏性 DDL（warn）
  if [[ ${#MIGRATION_DIRS[@]} -gt 0 ]]; then
    local breaking=0
    local md
    for md in "${MIGRATION_DIRS[@]}"; do
      [[ -d "$md" ]] || continue
      local hits; hits=$(grep -rnEi "$BREAKING_DDL_PATTERNS" "$md" 2>/dev/null | grep -viE 'down|rollback|revert' || true)
      if [[ -n "$hits" ]]; then
        warn "迁移目录 $md 含破坏性 DDL（DROP/TRUNCATE），须确认向前兼容或双写期："
        echo "$hits" | head -5
        breaking=1
      fi
    done
    [[ $breaking -eq 0 ]] && pass "迁移目录无破坏性 DDL（或均在 down/rollback 段）"
  fi

  echo "  ── 运维监控左移（spec §21 可观测性 + 代码埋点 + 健康检查）──"

  # 3a. spec §21 可观测性段存在（warn）
  if [[ -n "$obs_file" && -f "$obs_file" ]]; then
    if grep -qE '^## .*21.*可观测性|^## §21' "$obs_file" 2>/dev/null; then
      pass "spec §21 可观测性约束段存在"
    else
      warn "spec 缺 §21 可观测性约束段——日志/metrics/trace/告警须在 spec 阶段写"
      found=1
    fi
  else
    warn "未找到 spec 文件，跳过 §21 可观测性段检查"
    _sl_skipped=1
  fi

  # 3b. 代码中 metrics/日志/trace 埋点存在（warn）
  local scan_targets=()
  for d in ${WRITABLE_DIRS[@]+"${WRITABLE_DIRS[@]}"}; do [[ -d "$d" ]] && scan_targets+=("$d"); done
  [[ ${#scan_targets[@]} -eq 0 ]] && scan_targets=(".")

  local metric_hits=0 log_hits=0 trace_hits=0
  for d in "${scan_targets[@]}"; do
    local mh lh th
    mh=$(grep -rlE "$METRIC_CODE_PATTERNS" "$d" 2>/dev/null --include='*.ts' --include='*.js' --include='*.py' --include='*.go' --include='*.java' | wc -l | xargs || true)
    lh=$(grep -rlE "$LOG_CODE_PATTERNS" "$d" 2>/dev/null --include='*.ts' --include='*.js' --include='*.py' --include='*.go' --include='*.java' | wc -l | xargs || true)
    th=$(grep -rlE "$TRACE_CODE_PATTERNS" "$d" 2>/dev/null --include='*.ts' --include='*.js' --include='*.py' --include='*.go' --include='*.java' | wc -l | xargs || true)
    metric_hits=$((metric_hits + ${mh:-0}))
    log_hits=$((log_hits + ${lh:-0}))
    trace_hits=$((trace_hits + ${th:-0}))
  done
  if [[ $metric_hits -gt 0 ]]; then
    pass "代码中检测到 metrics 埋点（$metric_hits 个文件）"
  else
    warn "代码中未检测到 metrics 埋点——可观测性约束要求 spec §21 的埋点清单在代码中实现"
  fi
  if [[ $log_hits -gt 0 ]]; then
    pass "代码中检测到日志埋点（$log_hits 个文件）"
  else
    warn "代码中未检测到日志埋点"
  fi
  if [[ $trace_hits -gt 0 ]]; then
    pass "代码中检测到 trace 埋点（$trace_hits 个文件）"
  else
    warn "代码中未检测到 trace 埋点（微服务/分布式项目建议加 traceId 透传）"
  fi

  # 3c. 健康检查端点可访问（warn）
  if [[ ${#HEALTH_CHECK_URLS[@]} -gt 0 ]]; then
    local hc
    for hc in "${HEALTH_CHECK_URLS[@]}"; do
      local code
      code=$(curl -s -o /dev/null -w '%{http_code}' --max-time "$HEALTH_CHECK_TIMEOUT" "$hc" 2>/dev/null || echo "000")
      if [[ "$code" == "200" ]]; then
        pass "健康检查端点可访问：$hc (200)"
      else
        warn "健康检查端点不可访问：$hc (HTTP $code)——服务须启动后才能验证"
      fi
    done
  fi

  if [[ $found -eq 0 ]]; then
    if [[ "$_sl_skipped" -eq 1 ]]; then
      # R118：零 spec/plan 时不得打印“均已嵌入”——那是对未执行检查的正面结论。
      warn "左移检查部分完成：已执行代码/迁移检查；spec/plan 输入未配置，相关段未检查"
    else
      pass "左移检查通过（测试设计+变更影响+可观测性均已在 spec/plan 阶段嵌入）"
    fi
  else
    echo "  ⚠ 左移有 fail 项——测试/变更/运维约束须在 spec/plan 阶段写，不可后置"
  fi
}
