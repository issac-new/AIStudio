# ruleset: junit5-mockito  requires_conf: JUNIT_SRC_GLOBS
# gates: fw_junit_assertnotnull_only(fail) fw_junit_mockbean_context(warn) fw_junit_transactional_rollback(warn) fw_junit_strict_stubs(warn) fw_junit_parameterized_boundary(warn) fw_junit_beforeall_static(warn) fw_junit_disabled_reason(warn) fw_junit_naming(warn) fw_junit_testcontainers(warn) fw_junit_mock_vs_spy(warn) fw_junit_verify_times(warn) fw_junit_test_order(warn) fw_junit_timeout(warn) fw_junit_coverage_threshold(warn) fw_junit_controller_api_test(warn)
# harvested-from: T6 P2（2026-07-17），规律源自 JUnit 5.13/6.1 与 Mockito 5.23 官方文档
_fw_junit5_mockito_check() {
  echo "  [junit5-mockito] JUnit 5/6 + Mockito 5.x 框架规律"

  # ---------- 收集 Java 测试源文件清单 ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${JUNIT_SRC_GLOBS[@]+"${JUNIT_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    pass "junit5-mockito: 无 Java 测试源文件可检（JUNIT_SRC_GLOBS）"
    return
  fi

  local f

  # ---------- fw_junit_assertnotnull_only(fail)：断言禁止仅 assertNotNull ----------
  local an_bad="" nn other
  for f in "${srcarr[@]}"; do
    nn=$(grep -cE 'assertNotNull\(' "$f" 2>/dev/null || true)
    [[ "$nn" -eq 0 ]] && continue
    other=$(grep -cE 'assert(Equals|True|False|Throws|That|ArrayEquals|Same|InstanceOf|All|IterableEquals|LinesMatch|Timeout|DoesNotThrow|NotSame)\(|\bfail\(|verify\(' "$f" 2>/dev/null || true)
    if [[ "$other" -eq 0 ]]; then
      an_bad="${an_bad}${f}
"
    fi
  done
  _fw_report fail fw_junit_assertnotnull_only "$an_bad" "测试仅含 assertNotNull 断言（无具体期望值，回归保护为零——须 assertEquals/assertThrows/assertThat/verify）" "无仅 assertNotNull 的测试文件"

  # ---------- fw_junit_mockbean_context(warn)：@MockBean 上下文缓存污染 ----------
  local mb_files mb_bad=""
  mb_files=$(grep -lE '@MockBean\b|@MockitoBean\b' "${srcarr[@]}" 2>/dev/null || true)
  if [[ -z "$mb_files" ]]; then
    pass "fw_junit_mockbean_context: 无 @MockBean/@MockitoBean 用法"
  else
    while IFS= read -r f; do
      [[ -n "$f" ]] || continue
      if ! grep -qE '@DirtiesContext' "$f" 2>/dev/null; then
        mb_bad="${mb_bad}${f}
"
      fi
    done <<< "$mb_files"
    _fw_report warn fw_junit_mockbean_context "$mb_bad" "@MockBean/@MockitoBean 未配 @DirtiesContext/统一基类（Spring 上下文缓存重建爆炸 + mock 状态残留；纯单测优先 MockitoExtension + @Mock）" "@MockBean 均含上下文清理痕迹"
  fi

  # ---------- fw_junit_transactional_rollback(warn)：真实提交须显式 ----------
  local tx_hits
  tx_hits=$(grep -HnE '@Commit\b|@Rollback\(false\)' "${srcarr[@]}" 2>/dev/null || true)
  if [[ -n "$tx_hits" ]]; then
    warn "fw_junit_transactional_rollback: 检出 @Commit/@Rollback(false)（测试真实提交会污染共享库，须配 @Sql 清理；默认回滚是特性）:
$(printf '%s\n' "$tx_hits" | head -5)"
  else
    pass "fw_junit_transactional_rollback: 无真实提交用法（默认回滚隔离）"
  fi

  # ---------- fw_junit_strict_stubs(warn)：LENIENT 全局化禁令 ----------
  local ss_hits
  ss_hits=$(grep -HnE 'Strictness\.LENIENT|lenient\(\)' "${srcarr[@]}" 2>/dev/null || true)
  if [[ -n "$ss_hits" ]]; then
    warn "fw_junit_strict_stubs: 检出 Strictness.LENIENT/lenient()（strict stubs 是特性：无用 stub 必须删除；仅个别跨方法 stub 用 lenient().when 精准豁免）:
$(printf '%s\n' "$ss_hits" | head -5)"
  else
    pass "fw_junit_strict_stubs: 无 LENIENT 全局化用法"
  fi

  # ---------- fw_junit_parameterized_boundary(warn)：@ValueSource 单值 ----------
  local pv_hits
  pv_hits=$(grep -HnE '@ValueSource' "${srcarr[@]}" 2>/dev/null | grep -v ',' || true)
  if [[ -n "$pv_hits" ]]; then
    warn "fw_junit_parameterized_boundary: @ValueSource 单值（参数化价值在边界：0/-1/null/空串/最大值；null 用 @NullSource）:
$(printf '%s\n' "$pv_hits" | head -5)"
  else
    pass "fw_junit_parameterized_boundary: 无单值 @ValueSource 或无参数化测试"
  fi

  # ---------- fw_junit_beforeall_static(warn)：@BeforeAll 须 static ----------
  local ba_files ba_bad=""
  ba_files=$(grep -lE '@BeforeAll' "${srcarr[@]}" 2>/dev/null || true)
  if [[ -z "$ba_files" ]]; then
    pass "fw_junit_beforeall_static: 无 @BeforeAll 用法"
  else
    while IFS= read -r f; do
      [[ -n "$f" ]] || continue
      if ! grep -A3 '@BeforeAll' "$f" 2>/dev/null | grep -qE '\bstatic\b' && ! grep -qE 'PER_CLASS' "$f" 2>/dev/null; then
        ba_bad="${ba_bad}${f}
"
      fi
    done <<< "$ba_files"
    _fw_report warn fw_junit_beforeall_static "$ba_bad" "@BeforeAll 方法未检出 static（PER_METHOD 生命周期下启动即 PreconditionViolationException；非 static 仅 PER_CLASS 合法）" "@BeforeAll 均 static 或 PER_CLASS"
  fi

  # ---------- fw_junit_disabled_reason(warn)：@Disabled 须注明原因 ----------
  local dis_hits
  dis_hits=$(grep -HnE '@Disabled\b' "${srcarr[@]}" 2>/dev/null | grep -vE '@Disabled\(' || true)
  if [[ -n "$dis_hits" ]]; then
    warn "fw_junit_disabled_reason: 裸 @Disabled 无原因串（须注明 原因+issue 链接+责任人，防静默坟场）:
$(printf '%s\n' "$dis_hits" | head -5)"
  else
    pass "fw_junit_disabled_reason: 无裸 @Disabled"
  fi

  # ---------- fw_junit_naming(warn)：@DisplayName / 命名规范 ----------
  local nm_bad=""
  for f in "${srcarr[@]}"; do
    if grep -qE '@Test\b|@ParameterizedTest\b' "$f" 2>/dev/null && ! grep -qE '@DisplayName' "$f" 2>/dev/null; then
      nm_bad="${nm_bad}${f}
"
    fi
  done
  if [[ -n "$nm_bad" ]]; then
    warn "fw_junit_naming: 测试文件零 @DisplayName（方法名须 场景_期望 语义化，或类/方法级 @DisplayName 提供自然语言描述，二者至少居其一）:
$(printf '%s\n' "$nm_bad" | head -5)"
  else
    pass "fw_junit_naming: 测试均含 @DisplayName 或无测试方法"
  fi

  # ---------- fw_junit_testcontainers(warn)：容器 static 生命周期 ----------
  local tc_files tc_bad=""
  tc_files=$(grep -lE '@Testcontainers' "${srcarr[@]}" 2>/dev/null || true)
  if [[ -z "$tc_files" ]]; then
    pass "fw_junit_testcontainers: 无 @Testcontainers 用法"
  else
    while IFS= read -r f; do
      [[ -n "$f" ]] || continue
      if ! grep -qE '\bstatic\b[^;]*(Container|container)' "$f" 2>/dev/null; then
        tc_bad="${tc_bad}${f}
"
      fi
    done <<< "$tc_files"
    _fw_report warn fw_junit_testcontainers "$tc_bad" "@Testcontainers 未检出 static 容器（实例字段每方法起停容器，CI 时长爆炸；数据库容器应 static 共享）" "容器均 static 声明"
  fi

  # ---------- fw_junit_mock_vs_spy(warn)：@Spy 部分 mock 确认 ----------
  local spy_hits
  spy_hits=$(grep -HnE '@Spy\b' "${srcarr[@]}" 2>/dev/null || true)
  if [[ -n "$spy_hits" ]]; then
    warn "fw_junit_mock_vs_spy: 检出 @Spy（未 stub 方法走真实实现，语义暧昧；默认用 @Mock，@Spy 上 stub 用 doReturn().when() 语法）:
$(printf '%s\n' "$spy_hits" | head -5)"
  else
    pass "fw_junit_mock_vs_spy: 无 @Spy 用法"
  fi

  # ---------- fw_junit_verify_times(warn)：verify 显式次数 ----------
  local vt_hits
  vt_hits=$(grep -HnE '\bverify\(' "${srcarr[@]}" 2>/dev/null | grep -vE 'times\(|never\(|atLeast|atMost|\bonly\(' || true)
  if [[ -n "$vt_hits" ]]; then
    warn "fw_junit_verify_times: verify() 未显式次数（须 times(1)/never()/atLeast；收尾配 verifyNoMoreInteractions 防多调）:
$(printf '%s\n' "$vt_hits" | head -5)"
  else
    pass "fw_junit_verify_times: verify 均显式次数或无 verify"
  fi

  # ---------- fw_junit_test_order(warn)：顺序依赖禁令 ----------
  local to_hits
  to_hits=$(grep -HnE '@TestMethodOrder|@Order\(' "${srcarr[@]}" 2>/dev/null || true)
  if [[ -n "$to_hits" ]]; then
    warn "fw_junit_test_order: 检出 @TestMethodOrder/@Order（顺序依赖=共享可变状态，测试须独立；状态流程用 @Nested+PER_CLASS 显式建模）:
$(printf '%s\n' "$to_hits" | head -5)"
  else
    pass "fw_junit_test_order: 无顺序依赖注解"
  fi

  # ---------- fw_junit_timeout(warn)：Thread.sleep / @Timeout ----------
  local ts_hits
  ts_hits=$(grep -HnE 'Thread\.sleep' "${srcarr[@]}" 2>/dev/null || true)
  if [[ -n "$ts_hits" ]]; then
    warn "fw_junit_timeout: 测试检出 Thread.sleep（异步等待用 Awaitility；挂起防护用 @Timeout，SEPARATE_THREAD 模式处理不可中断 I/O）:
$(printf '%s\n' "$ts_hits" | head -5)"
  else
    pass "fw_junit_timeout: 无 Thread.sleep 用法"
  fi

  # ---------- fw_junit_coverage_threshold(warn)：Jacoco 覆盖率阈值 ----------
  # 配置代理检查：真正运行时覆盖率由 check_test 的 COVERAGE_MIN 统一拦截；
  # 此处确保 Maven/Gradle 工程确实启用了 Jacoco 且声明了最低覆盖率。
  local _bf _junit_build="" _jacoco=0 _cov_min=0
  while IFS= read -r _bf; do
    [[ -n "$_bf" ]] || continue
    _junit_build="${_junit_build}${_junit_build:+,}${_bf}"
    grep -qE 'jacoco' "$_bf" 2>/dev/null && _jacoco=1
    grep -qE '(minimum|limit)[^{]*\{?[[:space:]]*value[[:space:]]*=[[:space:]]*[0-9]|minimum[[:space:]]*=[[:space:]]*[0-9]|jacocoTestCoverageVerification' "$_bf" 2>/dev/null && _cov_min=1
  done <<< "$(find "${PROJECT_DIR:-.}" -maxdepth 2 -type f \( -name 'pom.xml' -o -name 'build.gradle' -o -name 'build.gradle.kts' \) -not -path '*/target/*' -not -path '*/build/*' 2>/dev/null)"
  if [[ -z "$_junit_build" ]]; then
    warn "fw_junit_coverage_threshold: 未找到 Maven/Gradle 构建文件，无法核验 Jacoco 覆盖率阈值（确认 PROJECT_DIR）"
  elif [[ "$_jacoco" -eq 0 ]]; then
    warn "fw_junit_coverage_threshold: 构建文件未启用 Jacoco（覆盖率无采集，check_test 的 COVERAGE_MIN 将无报告可解析）"
  elif [[ "$_cov_min" -eq 0 ]]; then
    warn "fw_junit_coverage_threshold: 已启用 Jacoco 但未见覆盖率最低阈值（jacocoTestCoverageVerification 的 minimum.value 或 check 规则）——补阈值并在 CI 强制执行"
  else
    pass "fw_junit_coverage_threshold: Jacoco 覆盖率采集与最低阈值均已配置"
  fi

  # ---------- fw_junit_controller_api_test(warn)：Controller 须有接口测试 ----------
  # 单元测试只测 service 不测 controller/route 是常见缺口：状态码、参数绑定、
  # 序列化、鉴权过滤器全在 controller 层。检出 Controller 但无 MockMvc/WebTestClient/
  # TestRestTemplate/@SpringBootTest 信号 → warn。
  local _ctrl_files
  _ctrl_files=$(grep -rlE '@(RestController|Controller)\b' "${PROJECT_DIR:-.}" \
    --include='*.java' --exclude-dir=target --exclude-dir=build --exclude-dir=.git 2>/dev/null || true)
  if [[ -z "$_ctrl_files" ]]; then
    pass "fw_junit_controller_api_test: 未检出 @RestController/@Controller，跳过"
  else
    local _api_signal=""
    _api_signal=$(grep -lE 'MockMvc|WebTestClient|TestRestTemplate|@SpringBootTest' "${srcarr[@]}" 2>/dev/null || true)
    if [[ -z "$_api_signal" ]]; then
      warn "fw_junit_controller_api_test: 检出 Controller 但测试源未见接口层测试（MockMvc/WebTestClient/TestRestTemplate/@SpringBootTest）——只测 service 会漏状态码/参数绑定/序列化/鉴权失败"
    else
      pass "fw_junit_controller_api_test: 检出接口层测试信号"
    fi
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
