# gate: test
# domain: quality / enforce: strict / tier: core
check_test() {
  echo "=== 测试检查（check §1 单测/接口/集成/回归/安全）==="
  if [[ -z "$TEST_CMD" || "$TEST_CMD" == "<test 命令>" ]]; then
    # 未配置 TEST_CMD 不再静默跳过——探到测试文件即显式 warn（探查漏项信号：
    # 测试体系存在而无运行通道=验证能力缺口，"配置≠使用≠有效"三段论第一段就不过）。
    # 检测模式与 assets/inventory-dimensions.conf 的 DIM_TESTFILES_CMD 镜像（两处注释互指，改一处须同步另一处）。
    local _tf=""
    _tf=$(find "${PROJECT_DIR:-.}" -type f \( -name '*test*.py' -o -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.test.js' -o -name '*.spec.ts' -o -name '*.spec.tsx' -o -name '*.spec.js' -o -name '*Test.java' -o -name '*_test.go' -o -name '*Tests.cs' -o -name '*Test.cs' \) \
      -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/.git/*' -not -path '*/bin/*' -not -path '*/obj/*' -print -quit 2>/dev/null || true)
    if [[ -n "${_tf}" ]]; then
      warn "测试体系存在（${_tf}）但 TEST_CMD 未配置——探查漏项，回生成流程 Step 8 补 conf（无运行通道=零验证能力）"
    else
      echo "  (跳过：未配置 TEST_CMD，且未探到测试文件——诚实降级)"
    fi
    return
  fi
  local _tout _trc
  # tail -80：suite 级失败明细（jest 逐 suite ● 段）在输出中部，tail -20 只剩汇总行——
  # 排障盲飞（实证：2 suite 失败原因被截，靠手动复跑定位才能看出崩溃栈）
  _tout=$(eval "$TEST_CMD" 2>&1 | tail -80) && _trc=0 || _trc=1
  printf '%s
' "$_tout"
  if [[ "$_trc" -ne 0 ]] && printf '%s' "$_tout" | grep -qiE 'command not found|未找到命令'; then
    # 同源排障方向区分：测试命令缺失≠测试失败——命令不可执行指向工具链/conf
    fail "测试命令不可执行（command not found）：$TEST_CMD——安装对应工具链或回生成流程 Step 8 修 conf（命令缺失≠测试失败，排障方向不同）"
    return
  fi
  # 实证反馈补强：0 用例检出——"测试通过"且输出明示 0 用例时
  # warn（空跑通过是逻辑错误的最弱兜底，不算真兜底）。各框架输出格式启发式匹配。
  # 原正则只认 jest/pytest 风格——Maven/Gradle surefire
  # "Tests run: 0"、Node TAP "# tests 0"、pytest "no tests ran" 三种形态漏检，零用例假阳性通过
  # 穿透门禁打出"✓ 测试通过"。补齐三种主流 runner 形态。
  if [[ "$_trc" -eq 0 ]]; then
    # cargo 多 suite 形态——
    # unittests/各集成测试/doc-tests 各打一行 "test result: ok. N passed; ..."，且空 suite
    # （无 doc-tests 的项目）合法打印 "running 0 tests"。原通用正则对 "0 tests" 单行即 warn，
    # 8 用例全过仍误报"输出 0 用例"（且 tail -20 窗口敏感：用例多时窗口滑过又不报，形态不稳）。
    # cargo 分支：聚合全部 test result 行的 passed 求和，总和 0 才 warn；失败套件不在此判
    # （test result: FAILED 时 cargo 退出码非 0，已走上方 fail 分支）。
    if printf '%s' "$_tout" | grep -q '^test result:'; then
      local _cargo_passed
      _cargo_passed=$(printf '%s' "$_tout" | sed -n 's/^test result: [^.]*\. \([0-9][0-9]*\) passed.*/\1/p' | awk '{s+=$1} END {print s+0}')
      if [[ "$_cargo_passed" -eq 0 ]]; then
        if [[ "${TEST_QUALITY_STRICT:-0}" == "1" ]]; then
          fail "gate_test_quality_zero_cases: cargo 全部 suite 共 0 用例通过——空跑不算兜底，须补真实用例"
        else
          warn "cargo 全部 suite 共 0 用例通过——空跑通过不算兜底，须补真实用例"
        fi
      else
        pass "测试通过（cargo ${_cargo_passed} 用例，多 suite 聚合）"
      fi
    # dotnet test 单行聚合形态——
    # xUnit/VSTest 各 assembly 打一行 "Passed!  - Failed: 0, Passed: 12, Skipped: 0, Total: 12"。
    # 原通用正则对其零用例形态（"Total: 0"）无一条命中 → 零用例假阳性通过静默 pass；多 target/
    # 多 assembly 时 Passed 数也不进汇总口径。dotnet 分支：聚合全部行的 Passed 求和，总和 0
    # 才 warn（失败行 Failed! 时 dotnet 退出码非 0，已走上方 fail 分支，与 cargo 分支同哲学）。
    elif printf '%s' "$_tout" | grep -qE '^[A-Za-z]+![[:space:]]*-[[:space:]]*Failed:[[:space:]]*[0-9]+,[[:space:]]*Passed:'; then
      local _dotnet_passed
      _dotnet_passed=$(printf '%s' "$_tout" | sed -n 's/^[A-Za-z]*![[:space:]]*-[[:space:]]*Failed:[[:space:]]*[0-9][0-9]*,[[:space:]]*Passed:[[:space:]]*\([0-9][0-9]*\).*/\1/p' | awk '{s+=$1} END {print s+0}')
      if [[ "$_dotnet_passed" -eq 0 ]]; then
        if [[ "${TEST_QUALITY_STRICT:-0}" == "1" ]]; then
          fail "gate_test_quality_zero_cases: dotnet test 全部 assembly 共 0 用例通过——空跑不算兜底，须补真实用例"
        else
          warn "dotnet test 全部 assembly 共 0 用例通过——空跑通过不算兜底，须补真实用例"
        fi
      else
        pass "测试通过（dotnet ${_dotnet_passed} 用例，聚合）"
      fi
    # 首分支加左边界约束——npm run 横幅
  # "> shop-api@0.1.0 test" 的版本号尾 0 与脚本名构成 "0 test" 子串，无边界正则
  # 对一切版本号以 0 结尾的 npm 项目假报空跑。0 须位于行首或空白后；
  # ".0 test"（版本号内）不再命中，"Tests: 0 passed"/"Ran 0 tests" 照常命中。
    elif printf '%s' "$_tout" | grep -qiE '(^|[[:space:]])0 (passed|tests?|examples?)|tests?: 0|tests? run: 0|#[[:space:]]*(tests?|pass)[[:space:]]+0|no tests ran|0 个用例|0 tests? found'; then
      if [[ "${TEST_QUALITY_STRICT:-0}" == "1" ]]; then
        fail "gate_test_quality_zero_cases: 测试命令退出码 0 但输出 0 用例——空跑不算兜底，须补真实用例"
      else
        warn "测试命令退出码 0 但输出 0 用例——空跑通过不算兜底，须补真实用例"
      fi
    else
      pass "测试通过"
    fi
    # 测试命令绿只是第一层：覆盖率、断言/负向用例质量、可选变异分数继续核验。
    _ct_coverage_check "$_tout"
    _ct_test_quality_check
    _ct_mutation_check
  else
    fail "测试失败"
  fi
}
