# ruleset: pytest  requires_conf: PYTEST_TEST_GLOBS
# gates: fw_pytest_session_scope_mutable(fail) fw_pytest_assert_truthy_only(fail) fw_pytest_parametrize_boundary(warn) fw_pytest_conftest_hierarchy(warn) fw_pytest_xdist_isolation(warn) fw_pytest_asyncio_mode(warn) fw_pytest_mock_cleanup(warn) fw_pytest_skip_reason(warn) fw_pytest_naming(warn) fw_pytest_coverage_threshold(fail)
# harvested-from: Python 测试框架补强（2026-07-22），规律源自 pytest 8.x 官方最佳实践 + pytest-xdist 隔离要求
_fw_pytest_check() {
  echo "  [pytest] pytest 8.x/9.x 框架规律"
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${PYTEST_TEST_GLOBS[@]+"${PYTEST_TEST_GLOBS[@]}"} 2>/dev/null | sort -u)
  if [[ -z "$srcs" ]]; then
    warn "pytest: PYTEST_TEST_GLOBS 未配置或无文件可检"
    return
  fi
  while IFS= read -r ln; do [[ -n "$ln" ]] && srcarr+=("$ln"); done <<< "$srcs"

  # fw_pytest_session_scope_mutable(fail)：session fixture 含可变操作
  local sess_files
  sess_files=$(grep -rlE '@pytest\.fixture[^\n]*session' "${srcarr[@]+"${srcarr[@]}"}" 2>/dev/null || true)
  if [[ -n "$sess_files" ]]; then
    local mut_hits
    mut_hits=$(grep -rnE '\.append\(|\.extend\(|\.insert\(|open\(.+w|\.write\(' $sess_files 2>/dev/null | grep -vE 'def |#' || true)
    _fw_report fail fw_pytest_session_scope_mutable "$mut_hits" "session fixture 含可变操作（append/写文件），跨测试共享可变状态致顺序依赖" "session fixture 无可变操作"
  else
    pass "fw_pytest_session_scope_mutable: 无 session 作用域 fixture"
  fi

  # fw_pytest_assert_truthy_only(fail)：仅 assert x（无比较）
  local truthy_hits
  truthy_hits=$(grep -rnE '^\s*assert\s+[a-zA-Z_][a-zA-Z0-9_]*\s*(#.*)?$' "${srcarr[@]+"${srcarr[@]}"}" 2>/dev/null || true)
  _fw_report fail fw_pytest_assert_truthy_only "$truthy_hits" "检出仅 assert x（truthy 断言无法捕获错误值），须 assert x == y" "无 truthy-only 断言"

  # fw_pytest_parametrize_boundary(warn)
  local param_hits
  param_hits=$(grep -rlE '@pytest\.mark\.parametrize' "${srcarr[@]+"${srcarr[@]}"}" 2>/dev/null || true)
  if [[ -n "$param_hits" ]]; then
    local bound_hits
    bound_hits=$(grep -rnE 'None|0|null|空|max|-1|inf' $param_hits 2>/dev/null | grep -iE 'parametrize|None|0|null' || true)
    if [[ -z "$bound_hits" ]]; then
      warn "fw_pytest_parametrize_boundary: @parametrize 存在但未检出边界值（0/None/空/max）"
    else
      pass "fw_pytest_parametrize_boundary: parametrize 含边界值信号"
    fi
  else
    pass "fw_pytest_parametrize_boundary: 无 @parametrize，跳过"
  fi

  # fw_pytest_conftest_hierarchy(warn)
  local fixture_hits conftest_hits
  fixture_hits=$(grep -rlE '@pytest\.fixture' "${srcarr[@]+"${srcarr[@]}"}" 2>/dev/null || true)
  conftest_hits=$(grep -rlE 'conftest' <<< "$srcs" 2>/dev/null || echo "$srcs" | grep -c 'conftest' || true)
  if [[ -n "$fixture_hits" && -z "$conftest_hits" ]]; then
    warn "fw_pytest_conftest_hierarchy: 有 @pytest.fixture 但无 conftest.py（fixture 散乱难复用）"
  else
    pass "fw_pytest_conftest_hierarchy: conftest 层级正常或无 fixture"
  fi

  # fw_pytest_xdist_isolation(warn)：用 tmpdir（非 tmp_path）
  local tmpdir_hits
  tmpdir_hits=$(grep -rnE '\btmpdir\b' "${srcarr[@]+"${srcarr[@]}"}" 2>/dev/null | grep -vE 'tmp_path|#' || true)
  _fw_report warn fw_pytest_xdist_isolation "$tmpdir_hits" "用 tmpdir（非 tmp_path），xdist 并行可能共享目录" "无 tmpdir 用法（或用 tmp_path）"

  # fw_pytest_asyncio_mode(warn)
  local async_hits
  async_hits=$(grep -rlE 'async\s+def\s+test_' "${srcarr[@]+"${srcarr[@]}"}" 2>/dev/null || true)
  if [[ -n "$async_hits" ]]; then
    local amode_hits
    amode_hits=$(grep -rlE 'asyncio_mode' "${srcarr[@]+"${srcarr[@]}"}" 2>/dev/null || true)
    if [[ -z "$amode_hits" ]]; then
      warn "fw_pytest_asyncio_mode: async 测试存在但无 asyncio_mode 配置（行为可能不一致）"
    else
      pass "fw_pytest_asyncio_mode: 已配 asyncio_mode"
    fi
  else
    pass "fw_pytest_asyncio_mode: 无 async 测试，跳过"
  fi

  # fw_pytest_mock_cleanup(warn)
  local mock_hits
  mock_hits=$(grep -rnE 'mocker\.patch\(' "${srcarr[@]+"${srcarr[@]}"}" 2>/dev/null || true)
  if [[ -n "$mock_hits" ]]; then
    local mock_in_fixture
    mock_in_fixture=$(grep -rnE 'def test_|mocker\.patch' "${srcarr[@]+"${srcarr[@]}"}" 2>/dev/null | awk '/def test_/{intest=1} /mocker\.patch/{if(intest) print; }' || true)
    if [[ -n "$mock_in_fixture" ]]; then
      warn "fw_pytest_mock_cleanup: mocker.patch 在测试体内（非 fixture），须在 fixture 中清理防泄漏"
    else
      pass "fw_pytest_mock_cleanup: mock 在 fixture 中或已清理"
    fi
  else
    pass "fw_pytest_mock_cleanup: 无 mocker.patch 用法"
  fi

  # fw_pytest_skip_reason(warn)
  local skip_hits
  skip_hits=$(grep -rnE '@pytest\.mark\.(skip|xfail)\s*\(' "${srcarr[@]+"${srcarr[@]}"}" 2>/dev/null || true)
  if [[ -n "$skip_hits" ]]; then
    local skip_noreason
    skip_noreason=$(grep -rnE '@pytest\.mark\.(skip|xfail)\s*\(\s*\)' "${srcarr[@]+"${srcarr[@]}"}" 2>/dev/null || true)
    _fw_report warn fw_pytest_skip_reason "$skip_noreason" "@skip/@xfail 无 reason= 参数" "skip/xfail 均含 reason"
  else
    pass "fw_pytest_skip_reason: 无 skip/xfail，跳过"
  fi

  # fw_pytest_naming(warn)
  local badname_hits
  badname_hits=$(grep -rnE '^def\s+[a-z][a-z0-9_]*\s*\(' "${srcarr[@]+"${srcarr[@]}"}" 2>/dev/null | grep -vE 'def test_|def _' || true)
  _fw_report warn fw_pytest_naming "$badname_hits" "测试文件中函数非 test_ 开头（可能不被 pytest 发现）" "测试命名规范"

  # fw_pytest_coverage_threshold(fail)：阈值通常写在 pytest.ini/pyproject/setup.cfg/tox.ini，
  # 旧实现只 grep 测试源文件——配置文件里的 --cov-fail-under 永远搜不到，误报"无阈值"。
  local cov_hits="" _cf
  for _cf in "${PROJECT_DIR:-.}/pytest.ini" "${PROJECT_DIR:-.}/pyproject.toml" \
             "${PROJECT_DIR:-.}/setup.cfg" "${PROJECT_DIR:-.}/tox.ini"; do
    [[ -f "$_cf" ]] || continue
    if grep -qE 'cov-fail-under|fail_under' "$_cf" 2>/dev/null; then
      cov_hits="${cov_hits}${cov_hits:+,}${_cf}"
    fi
  done
  local _src_cov
  _src_cov=$(grep -rlE 'cov-fail-under|fail_under' "${srcarr[@]+"${srcarr[@]}"}" 2>/dev/null || true)
  [[ -n "$_src_cov" ]] && cov_hits="${cov_hits}${cov_hits:+,}${_src_cov}"
  if [[ -z "$cov_hits" ]]; then
    fail "fw_pytest_coverage_threshold: 无 cov-fail-under 配置（pytest.ini/pyproject/setup.cfg/tox.ini 均未设覆盖率阈值；覆盖率无门禁）"
  else
    pass "fw_pytest_coverage_threshold: 已配覆盖率阈值（${cov_hits%%%,*}）"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
