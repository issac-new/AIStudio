# gates/_lib.sh — shared helpers for domain gate sources (WP6)
# Generated view: aggregates in assets/gates-{strict,warn,advisory}.sh prepend this file.
_sec_scan() {
  local pattern="$1"; shift
  local d
  for d in "$@"; do
    [[ -z "$d" || ! -d "$d" ]] && continue
    # 基础文件类型
    local includes="--include=*.ts --include=*.js --include=*.jsx --include=*.tsx --include=*.vue --include=*.svelte --include=*.py --include=*.java --include=*.go --include=*.json --include=*.env"
    # 当配置了 MyBatis mapper 目录时，追加 .xml 扫描（SQL 注入实际在 XML mapper 中）
    if [[ ${#MYBATIS_MAPPER_DIRS[@]} -gt 0 ]]; then
      includes="$includes --include=*.xml"
    fi
    # --exclude-dir 排除链补齐（$d 可能配成项目根，.venv/node_modules 不入生产面）
    grep -rnE "$pattern" "$d" $includes --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.venv --exclude-dir=venv --exclude-dir=site-packages --exclude-dir=__pycache__ --exclude-dir=.tox --exclude-dir=dist --exclude-dir=build --exclude-dir=target --exclude-dir=vendor 2>/dev/null \
      | grep -viE 'node_modules|\.patch|\.d\.ts|/dist/|/\.tmp/|/out/|/build/|/\.next/|/coverage/|(^|/)(tests?|testdata|__tests__|__mocks__|fixtures?|mocks?|examples?)/|\.(test|spec)\.[a-z]+:|_test\.[a-z]+:' || true
  done
}
_check_security_semgrep() {
  # 与内置路径同一目标集：WRITABLE_DIRS + SCAN_DIRS 去重（语义同下方原逻辑）
  # 返回码语义扩展：0=semgrep 通过（ERROR 级 0 命中，调用方须继续叠加内置扫描）
  #   1=执行错误（≥2，降级内置）｜2=无可扫目录｜3=semgrep 已 fail（调用方跳过内置，避免重复报同一问题）
  local targets=() seen="" d
  for d in ${WRITABLE_DIRS[@]+"${WRITABLE_DIRS[@]}"} ${SCAN_DIRS[@]+"${SCAN_DIRS[@]}"}; do
    [[ -z "$d" || ! -d "$d" ]] && continue
    case " $seen " in *" $d "*) continue ;; esac
    seen="$seen $d"; targets+=("$d")
  done
  [[ ${#targets[@]} -eq 0 ]] && return 2
  local out rc=0 err_hits
  out=$(mktemp "${TMPDIR:-/tmp}/swarm-yuan.XXXXXX")
  # --error：有命中（任意级）时退出码 1；0=无命中；≥2=执行错误（降级内置）
  # --exclude-rule ifs-tampering：该 registry 规则对 bash 黄金 idiom `while IFS= read -r`
  #   （防词切分读行）系统性误报——生成器数十处规范写法全命中且命中点随 registry 版本漂移
  #   （CI ubuntu 绿/本地 macOS 红同一文件），不可作为可信信号。排除属规则级裁决，
  #   IFS= read 本身是防注入的正确写法而非风险。
  semgrep --config auto --json --quiet --error --exclude-rule bash.lang.security.ifs-tampering.ifs-tampering -o "$out" "${targets[@]}" >/dev/null 2>&1 || rc=$?
  if [[ "$rc" -ge 2 ]]; then
    rm -f "$out"
    return 1
  fi
  # ERROR 级命中 → warn 披露（非确定性信号不作 fail 依据）。自举实证：
  #   同一仓库同一提交，--config auto 云端规则集三次运行三种命中——ifs-tampering@
  #   profile-threshold-survey → ifs-tampering@inventory-verify → detect-insecure-
  #   websocket@inventory-update。同代码不同结果 = fail 信号本身不可信。确定性执法
  #   由内置模式族兜底（本函数 warn 后返回 0，调用方继续跑 builtin 扫描同一目标集，
  #   fail 权在彼处）；semgrep 命中降为疑似信号，逐条裁决：真风险修复/误报留痕。
  err_hits=$(grep -cE '"severity":[[:space:]]*"ERROR"' "$out" 2>/dev/null || true)
  err_hits=$(_norm_int "$err_hits")
  if [[ "$err_hits" -gt 0 ]]; then
    warn "gate_security_semgrep_hits: semgrep 命中 ${err_hits} 处（--config auto 云端规则集，非确定性信号）——逐条裁决：真风险修复 / 误报留痕 decisions.jsonl（builtin 确定性扫描另行执法）"
    # 粗解析多行 JSON：同一 result 内 check_id/path 先于 extra.severity 出现，按序配对取前 10 条
    awk '
      /"check_id":/ { cid=$0; sub(/^.*"check_id":[[:space:]]*"/,"",cid); sub(/".*$/,"",cid) }
      /"path":/     { p=$0;   sub(/^.*"path":[[:space:]]*"/,"",p);   sub(/".*$/,"",p) }
      /"severity":[[:space:]]*"ERROR"/ { if (p != "") { print cid" @ "p; p="" } }
    ' "$out" 2>/dev/null | head -10 | sed 's/^/    /'
    rm -f "$out"
    return 0
  fi
  pass "semgrep 扫描通过（ERROR 级 0 命中）"
  rm -f "$out"
  return 0
}
_ct_test_files() {
  local root="${PROJECT_DIR:-.}"
  [[ -d "$root" ]] || return 0
  {
    find "$root" -type f \( \
      -name '*_test.go' -o -name '*Test.java' -o -name '*Tests.java' -o -name '*IT.java' -o \
      -name '*Test.kt' -o -name '*Tests.kt' -o -name '*Spec.scala' -o -name '*Test.scala' -o \
      -name '*Test.cs' -o -name '*Tests.cs' -o -name '*Tests.swift' -o -name '*Test.swift' -o \
      -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.test.js' -o -name '*.test.jsx' -o \
      -name '*.spec.ts' -o -name '*.spec.tsx' -o -name '*.spec.js' -o -name '*.spec.jsx' -o \
      -name '*.e2e-spec.ts' -o -name '*.e2e-spec.js' -o \
      -name 'test_*.py' -o -name '*_test.py' -o -name '*_spec.rb' -o -name '*_test.rb' -o \
      -name '*Test.php' -o -name '*_test.exs' -o -name '*.test.exs' -o -name '*_test.dart' \
    \) -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/.git/*' \
       -not -path '*/build/*' -not -path '*/target/*' -not -path '*/vendor/*' \
       -not -path '*/.venv/*' -not -path '*/venv/*' -not -path '*/coverage/*' \
       -not -path '*/.claude/*' -not -path '*/.codex/*' -not -path '*/.swarm-yuan/*' \
       -not -path '*/__pycache__/*' 2>/dev/null || true
    # Rust 集成测试约定 tests/*.rs（src 内联 #[test] 不在文件级发现面）
    find "$root" -type f -path '*/tests/*.rs' -not -path '*/target/*' 2>/dev/null || true
  } | sort -u
}
_ct_coverage_pct() {
  local f="$1" pct=""
  [[ -f "$f" ]] || return 0
  case "$f" in
    *.info)
      pct=$(awk -F: '/^LF:/{lf+=$2} /^LH:/{lh+=$2} END{if(lf>0) printf "%.0f", lh*100/lf}' "$f" 2>/dev/null || true)
      ;;
    *.xml)
      if grep -q 'line-rate=' "$f" 2>/dev/null; then
        pct=$(sed -n 's/.*line-rate="\([0-9.]*\)".*/\1/p' "$f" 2>/dev/null | head -1 | awk '{printf "%.0f", $1*100}')
      elif grep -q 'type="LINE"' "$f" 2>/dev/null; then
        # Jacoco 在 method/class/sourcefile/package/report 多层写 LINE counter；
        # 只取最后一个（report 级汇总）——全量求和会按层级重复计权，覆盖率失真。
        pct=$(grep -o 'type="LINE"[^>]*' "$f" 2>/dev/null | tail -1 \
          | sed -E 's/.*missed="([0-9]+)".*covered="([0-9]+)".*/\1 \2/' \
          | awk '{if($1+$2>0) printf "%.0f", $2*100/($1+$2)}')
      elif grep -q 'coveredstatements=' "$f" 2>/dev/null; then
        local _cs _ss
        _cs=$(grep -oE 'coveredstatements="[0-9]+"' "$f" 2>/dev/null | head -1 | grep -oE '[0-9]+' || true)
        _ss=$(grep -oE '[[:space:]]statements="[0-9]+"' "$f" 2>/dev/null | head -1 | grep -oE '[0-9]+' || true)
        [[ -n "$_cs" && -n "$_ss" && "$_ss" -gt 0 ]] && pct=$(awk -v c="$_cs" -v s="$_ss" 'BEGIN{printf "%.0f", c*100/s}')
      fi
      ;;
    *.json)
      # coverage-summary.json 的 total 与每个文件都含 lines.pct；先按花括号
      # 深度截出根 total 对象，再读其中的 lines.pct，禁止贪婪匹配到末文件。
      pct=$(tr -d '\n' < "$f" 2>/dev/null | awk '
        match($0, /"total"[[:space:]]*:[[:space:]]*[{]/) {
          start=RSTART+RLENGTH-1; depth=0; stop=0
          for(i=start; i<=length($0); i++) {
            ch=substr($0,i,1)
            if(ch=="{") depth++
            else if(ch=="}") { depth--; if(depth==0) { stop=i; break } }
          }
          if(stop>0) {
            total=substr($0,start,stop-start+1)
            if(match(total, /"lines"[[:space:]]*:[[:space:]]*[{][^}]*"pct"[[:space:]]*:[[:space:]]*[0-9.]+/)) {
              value=substr(total,RSTART,RLENGTH)
              sub(/^.*"pct"[[:space:]]*:[[:space:]]*/,"",value)
              printf "%.0f", value+0
            }
          }
        }' || true)
      ;;
    *.out)
      if head -1 "$f" 2>/dev/null | grep -q '^mode:'; then
        # go test -coverprofile 每行末尾两列是语句数与执行次数；按语句块加权，
        # 不能把它当成 go tool cover -func 的 "(statements) N%" 文本摘要。
        pct=$(awk 'NR>1 && NF>=3 {total+=$2; if($3>0) covered+=$2} END{if(total>0) printf "%.0f", covered*100/total}' "$f" 2>/dev/null || true)
      else
        pct=$(grep -oE '\(statements\)[[:space:]]*[0-9.]+%' "$f" 2>/dev/null \
          | grep -oE '[0-9.]+' | tail -1 | awk '{printf "%.0f", $1}')
      fi
      ;;
    *)
      pct=$(grep -oE '(Lines|line coverage|TOTAL|coverage)[^0-9]*[0-9.]+%' "$f" 2>/dev/null \
        | tail -1 | grep -oE '[0-9.]+' | tail -1 | awk '{printf "%.0f", $1}')
      ;;
  esac
  printf '%s' "$pct"
}
_ct_coverage_pct_text() {
  printf '%s\n' "$1" 2>/dev/null \
    | grep -oE '(Lines|line coverage|TOTAL|coverage:)[^0-9]*[0-9.]+%' \
    | tail -1 | grep -oE '[0-9.]+' | tail -1 | awk '{printf "%.0f", $1}'
}
_ct_find_coverage_report() {
  local root="${PROJECT_DIR:-.}" c
  if [[ -n "${COVERAGE_REPORT:-}" ]]; then
    case "$COVERAGE_REPORT" in
      /*) printf '%s' "$COVERAGE_REPORT" ;;
      *)  printf '%s/%s' "$root" "$COVERAGE_REPORT" ;;
    esac
    return 0
  fi
  for c in \
    coverage/lcov.info lcov.info coverage.xml cobertura-coverage.xml \
    target/site/jacoco/jacoco.xml build/reports/jacoco/test/jacocoTestReport.xml \
    build/reports/jacoco/jacocoTestReport.xml coverage/coverage-summary.json \
    coverage.out clover.xml build/coverage.xml coverage/cobertura.xml; do
    [[ -f "$root/$c" ]] && { printf '%s' "$root/$c"; return 0; }
  done
  find "$root" -maxdepth 4 -type f \( \
    -name 'lcov.info' -o -name 'jacoco.xml' -o -name 'cobertura*.xml' -o \
    -name 'coverage-summary.json' -o -name 'coverage.out' -o -name 'clover.xml' \
  \) -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/vendor/*' 2>/dev/null | head -1
}
_ct_coverage_check() {
  local out="$1" min="${COVERAGE_MIN:-0}"
  case "$min" in ''|*[!0-9]*) min=0 ;; esac
  [[ "$min" -gt 0 ]] || return 0
  local report pct
  report=$(_ct_find_coverage_report)
  if [[ -n "$report" && -f "$report" ]]; then
    pct=$(_ct_coverage_pct "$report")
  else
    report=""
    pct=$(_ct_coverage_pct_text "$out")
  fi
  if [[ -z "$pct" ]]; then
    fail "gate_test_coverage: COVERAGE_MIN=${min}% 已配置，但未找到/无法解析覆盖率报告（配置 COVERAGE_REPORT，或让 TEST_CMD 产出 lcov/cobertura/jacoco/coverage-summary/coverage.out）"
    return 0
  fi
  if [[ "$pct" -lt "$min" ]]; then
    fail "gate_test_coverage: 行覆盖率 ${pct}% < 阈值 ${min}%（报告：${report:-TEST_CMD 输出}）——补测或按决策下调阈值并留痕"
  else
    pass "覆盖率 ${pct}% ≥ 阈值 ${min}%（${report:-TEST_CMD 输出}）"
  fi
}
_ct_test_quality_check() {
  local min_assert="${TEST_MIN_ASSERTIONS_PER_CASE:-0}"
  local min_neg="${TEST_MIN_NEGATIVE_RATIO:-0}"
  local strict="${TEST_QUALITY_STRICT:-0}"
  case "$min_assert" in ''|*[!0-9]*) min_assert=0 ;; esac
  case "$min_neg" in ''|*[!0-9]*) min_neg=0 ;; esac
  [[ "$strict" == "1" ]] || strict=0
  [[ "$min_assert" -gt 0 || "$min_neg" -gt 0 || "$strict" -eq 1 ]] || return 0

  local f cases assertions total_cases=0 total_assertions=0 files=0 neg_files=0
  local zero_files="" focused_hits="" case_re assert_re neg_re extra_re
  case_re='^[[:space:]]*(it|test|specify)(\.(only|skip|todo|each))?[[:space:]]*\(|@Test\b|@ParameterizedTest\b|@RepeatedTest\b|\[(Fact|Theory|Test|TestMethod)\]|^[[:space:]]*(async[[:space:]]+)?def[[:space:]]+test_|^func[[:space:]]+Test[A-Z_]|^[[:space:]]*(it|test|scenario)[[:space:]]+["'\'']|#\[(tokio::)?test\]|public[[:space:]]+function[[:space:]]+test|^[[:space:]]*test[[:space:]]*\('
  assert_re='expect[[:space:]]*\(|assert[A-Za-z0-9_]*[[:space:]]*\(|\bassert[[:space:]]|assert!|assert_eq!|assert_ne!|self\.assert|t\.(Error|Errorf|Fatal|Fatalf|FailNow)|require\.[A-Za-z]+|verify[[:space:]]*\(|should[[:space:]]*\(|assertThat[[:space:]]*\('
  [[ -n "${TEST_ASSERT_EXTRA_PATTERN:-}" ]] && assert_re="${assert_re}|${TEST_ASSERT_EXTRA_PATTERN}"
  neg_re='invalid|error|fail|exception|throw|reject|unauthoriz|forbidden|not.?found|timeout|conflict|bad.?request|4[0-9][0-9]|5[0-9][0-9]|边界|异常|失败|错误|超时|越界|非法|未授权|拒绝|空值|null|empty'
  local focused_re='(^|[^[:alnum:]_])(it|test|describe|context)[[:space:]]*[.]only[[:space:]]*[(]|(^|[^[:alnum:]_])fdescribe[[:space:]]*[(]|(^|[^[:alnum:]_])fit[[:space:]]*[(]'

  while IFS= read -r f; do
    [[ -n "$f" && -f "$f" ]] || continue
    files=$((files + 1))
    cases=$(grep -cE "$case_re" "$f" 2>/dev/null || true)
    assertions=$(grep -cE "$assert_re" "$f" 2>/dev/null || true)
    cases=$(_norm_int "${cases:-0}")
    assertions=$(_norm_int "${assertions:-0}")
    total_cases=$((total_cases + cases))
    total_assertions=$((total_assertions + assertions))
    [[ "$cases" -gt 0 && "$assertions" -eq 0 ]] && zero_files="${zero_files}${zero_files:+, }${f}"
    grep -qE "$neg_re" "$f" 2>/dev/null && neg_files=$((neg_files + 1))
    local _focused
    _focused=$(grep -nE "$focused_re" "$f" 2>/dev/null | head -3 || true)
    [[ -n "$_focused" ]] && focused_hits="${focused_hits}${focused_hits:+$'\n'}${f}:${_focused}"
  done <<< "$(_ct_test_files)"

  if [[ "$files" -eq 0 ]]; then
    warn "gate_test_quality: 未发现测试文件——无法核验断言/负向用例（TEST_CMD 可能只跑了冒烟命令）"
    return 0
  fi
  if [[ -n "$focused_hits" ]]; then
    fail "gate_test_quality_focused: 检出聚焦测试（.only/fdescribe/fit）——CI 会静默漏跑其余用例，须移除:
$(printf '%s\n' "$focused_hits" | head -5)"
  fi
  if [[ "$total_cases" -eq 0 ]]; then
    warn "gate_test_quality_cases: 发现 ${files} 个测试文件但未识别出测试用例——确认测试框架/命名约定，或 TEST_CMD 未覆盖这些文件"
    return 0
  fi
  if [[ -n "$zero_files" ]]; then
    if [[ "$strict" -eq 1 ]]; then
      fail "gate_test_quality_assertions: 以下测试文件有用例但零断言（测试只执行、不校验）: $(printf '%s' "$zero_files" | cut -c1-300)"
    else
      warn "gate_test_quality_assertions: 以下测试文件有用例但零断言（建议补具体期望值）: $(printf '%s' "$zero_files" | cut -c1-300)"
    fi
  fi
  if [[ "$min_assert" -gt 0 ]]; then
    local ratio
    ratio=$(awk -v a="$total_assertions" -v c="$total_cases" 'BEGIN{printf "%.2f", a/c}')
    if awk -v r="$ratio" -v m="$min_assert" 'BEGIN{exit !(r<m)}'; then
      if [[ "$strict" -eq 1 ]]; then
        fail "gate_test_quality_assert_density: 断言密度 ${ratio} 条/用例 < 阈值 ${min_assert}（${total_assertions} 断言 / ${total_cases} 用例）——一个用例至少一个具体断言"
      else
        warn "gate_test_quality_assert_density: 断言密度 ${ratio} 条/用例 < 阈值 ${min_assert}（${total_assertions} 断言 / ${total_cases} 用例）"
      fi
    else
      pass "断言密度 ${ratio} 条/用例 ≥ 阈值 ${min_assert}"
    fi
  fi
  if [[ "$min_neg" -gt 0 ]]; then
    local neg_pct
    neg_pct=$(awk -v n="$neg_files" -v f="$files" 'BEGIN{printf "%.0f", n*100/f}')
    if [[ "$neg_pct" -lt "$min_neg" ]]; then
      if [[ "$strict" -eq 1 ]]; then
        fail "gate_test_quality_negative: 含异常/边界/错误路径关键词的测试文件占比 ${neg_pct}% < 阈值 ${min_neg}%（${neg_files}/${files}）——补边界与失败路径用例"
      else
        warn "gate_test_quality_negative: 含异常/边界/错误路径关键词的测试文件占比 ${neg_pct}% < 阈值 ${min_neg}%（${neg_files}/${files}）"
      fi
    else
      pass "负向/边界测试文件占比 ${neg_pct}% ≥ 阈值 ${min_neg}%"
    fi
  fi
}
_ct_mutation_check() {
  local cmd="${MUTATION_CMD:-}"
  [[ -n "$cmd" ]] || return 0
  local min="${MUTATION_MIN_SCORE:-0}"
  case "$min" in ''|*[!0-9]*) min=0 ;; esac
  local out rc score
  out=$(eval "$cmd" 2>&1 | tail -60) && rc=0 || rc=1
  printf '%s\n' "$out"
  if [[ "$rc" -ne 0 ]]; then
    fail "gate_test_mutation: MUTATION_CMD 执行失败（rc=${rc}）——修复变异测试工具链，或清空 MUTATION_CMD 并留痕"
    return 0
  fi
  score=$(printf '%s\n' "$out" \
    | grep -oE '(Mutation score|mutationScore|Mutation Score|score)[^0-9]*[0-9.]+' \
    | tail -1 | grep -oE '[0-9.]+' | tail -1 \
    | awk '{printf "%.0f", $1}' || true)
  if [[ -z "$score" ]]; then
    if [[ "$min" -gt 0 ]]; then
      fail "gate_test_mutation: 未从 MUTATION_CMD 输出解析到 mutation score（阈值 ${min}%）——确认报告格式或改用支持 % 输出的工具"
    else
      warn "gate_test_mutation: 未从 MUTATION_CMD 输出解析到 mutation score（仅提示，未配阈值）"
    fi
    return 0
  fi
  if [[ "$min" -gt 0 && "$score" -lt "$min" ]]; then
    fail "gate_test_mutation: mutation score ${score}% < 阈值 ${min}%——测试对注入故障不敏感，补断言/边界用例"
  else
    pass "mutation score ${score}%${min:+（阈值 ${min}%）}"
  fi
}
_check_sensitive_gitleaks() {
  # 空 SCAN_DIRS 交回内置路径（与基线同一 warn 披露文案，避免双份漂移）
  # 返回码语义扩展：0=gitleaks 通过（调用方须继续叠加内置正则族）
  #   1=执行错误（降级内置）｜2=SCAN_DIRS 空｜3=gitleaks 已 fail（调用方跳过内置，避免重复报）
  [[ ${#SCAN_DIRS[@]} -eq 0 ]] && return 2
  local found=0 dir report hits files f rc
  for dir in ${SCAN_DIRS[@]+"${SCAN_DIRS[@]}"}; do
    [[ -d "$dir" ]] || continue
    report=$(mktemp "${TMPDIR:-/tmp}/swarm-yuan.XXXXXX")
    # --no-git 按文件系统扫描（与内置路径同口径）；--exit-code 0 统一由报告计数判定，不靠工具退出码
    rc=0
    gitleaks detect --no-git -s "$dir" --report-format json --report-path "$report" --exit-code 0 >/dev/null 2>&1 || rc=$?
    if [[ "$rc" -ne 0 ]]; then
      rm -f "$report"
      return 1
    fi
    # 报告为 JSON 数组：finding 元素含 RuleID（v8+）/rule（旧版）字段，元素数即命中数
    hits=$(grep -oE '"(RuleID|rule)"' "$report" 2>/dev/null | wc -l | xargs || true)
    hits=$(_norm_int "$hits")
    if [[ "$hits" -gt 0 ]]; then
      # 逐文件聚合去重（v8+ 字段 File；旧版小写 file 兜底）
      files=$(grep -oE '"File": ?"[^"]+"' "$report" 2>/dev/null | sed 's/"File": *"//; s/"$//' | sort -u || true)
      [[ -z "$files" ]] && files=$(grep -oE '"file": ?"[^"]+"' "$report" 2>/dev/null | sed 's/"file": *"//; s/"$//' | sort -u || true)
      # 修复（误报）：gitleaks 路径原零排除，而内置正则路径（L157）有
      # 'example|placeholder|test|mock|dummy' 排除——同一门禁两条路径判定标准不一致。
      # 实测误报：gin 的 context_test.go（测试假密钥）/ testdata/certificate/key.pem（测试证书）。
      # 两条路径改叠加后，装了 gitleaks 反而多收测试固件误报。此处对齐内置排除 +
      # SENSITIVE_EXCLUDE_GLOBS 可配豁免（测试路径/示例文件不应报为密钥泄露）。
      files=$(printf '%s\n' "$files" | grep -viE '(^|/)(test|tests|testdata|__tests__|__mocks__|fixtures?|mocks?|examples?)(/|$)|_test\.[a-z]+$|\.test\.|\.spec\.|example|placeholder|dummy' || true)
      if [[ ${#SENSITIVE_EXCLUDE_GLOBS[@]} -gt 0 ]]; then
        local _xgl
        for _xgl in "${SENSITIVE_EXCLUDE_GLOBS[@]}"; do
          files=$(printf '%s\n' "$files" | grep -vF "$_xgl" || true)
        done
      fi
      while IFS= read -r f; do
        [[ -n "$f" ]] && fail "gate_sensitive_gitleaks:${f}: gitleaks 检出疑似硬编码密钥（GB/T 34944-2017 6.2.6.3）"
      done <<< "$files"
      found=1
    fi
    rm -f "$report"
  done
  if [[ $found -eq 0 ]]; then
    pass "未发现明显敏感信息（gitleaks）"
    return 0
  fi
  # gitleaks 已 fail → 返回 3，调用方跳过内置正则（避免重复报同一文件）
  return 3
}
_extract_deps() {
  local f="$1"
  case "$f" in
    *package.json)
      grep -E '"[^"]+"[[:space:]]*:[[:space:]]*"[~^]?[0-9]' "$f" 2>/dev/null \
        | awk -F'"' '{ if($2!="" && $4!="") print $2"\t"$4 }' || true
      ;;
    *pyproject.toml)
      awk '/^[[:space:]]*[A-Za-z0-9_.-]+[[:space:]]*=[[:space:]]*"[~^><=!0-9]/ {
        n=$1; gsub(/[=[:space:]]/,"",n);
        v=$0; sub(/.*"/,"",v); sub(/".*/,"",v);
        if(n!="" && v!="") print n"\t"v
      }' "$f" 2>/dev/null || true
      ;;
    *requirements.txt)
      awk '{
        n=$0; sub(/[=<>~!].*/,"",n); gsub(/[[:space:]]/,"",n);
        v=$0; sub(/^[^=<>~!]*[=<>~!]+/,"",v); sub(/[,[[:space:];].*/,"",v);
        if(n!="" && v!="" && v ~ /^[0-9]/) print n"\t"v
      }' "$f" 2>/dev/null || true
      ;;
    *go.mod)
      awk '/^\t[[:alnum:]\/._-]+[[:space:]]+v[0-9]/ { print $1"\t"$2 }' "$f" 2>/dev/null || true
      ;;
    *Cargo.toml)
      awk '/^[[:space:]]*[A-Za-z0-9_-]+[[:space:]]*=[[:space:]]*"[0-9]/ {
        n=$1; gsub(/[=[:space:]]/,"",n);
        v=$0; sub(/.*"/,"",v); sub(/".*/,"",v);
        if(n!="" && v!="") print n"\t"v
      }' "$f" 2>/dev/null || true
      ;;
    *pom.xml)
      # Maven: <dependency><groupId>G</groupId><artifactId>A</artifactId><version>V</version>
      awk '/<dependency>/{gd="";ad="";vd=""}
           /<groupId>/{gd=$0}
           /<artifactId>/{ad=$0}
           /<version>/{vd=$0}
           /<\/dependency>/{
             g=gd; sub(/.*<groupId>/,"",g); sub(/<\/groupId>.*/,"",g)
             a=ad; sub(/.*<artifactId>/,"",a); sub(/<\/artifactId>.*/,"",a)
             v=vd; sub(/.*<version>/,"",v); sub(/<\/version>.*/,"",v)
             if(g!="" && a!="" && v!="") print g":"a"\t"v
           }' "$f" 2>/dev/null || true
      ;;
    *build.gradle|*build.gradle.kts)
      # Gradle: implementation 'group:artifact:version' 或 implementation group: 'g', name: 'a', version: 'v'
      grep -oE "implementation\s+['\"]([^'\"]+):([^'\"]+):([^'\"]+)['\"]" "$f" 2>/dev/null \
        | sed -E "s/.*['\"]([^'\"]+)['\"].*/\\1/" | awk -F: '{print $1":"$2"\t"$3}' || true
      # Gradle Kotlin DSL: implementation("group:artifact:version")
      grep -oE 'implementation\("([^"]+):([^"]+):([^"]+)"\)' "$f" 2>/dev/null \
        | sed -E 's/.*\("([^"]+)"\).*/\1/' | awk -F: '{print $1":"$2"\t"$3}' || true
      ;;
  esac
}
_norm_ver() {
  # 原实现只剥 range 前缀后做字面字符串比较，
  # semver 等价写法 ^5.7 vs ^5.7.0 被判"变更"（假阳性 fail——数字段缺省不参与比较）。
  # 修：数字段补齐三段后再比较（5.7 → 5.7.0）；非纯数字段（如 2.1.4.RELEASE）NF>3 原样保留。
  # 版本表列自然
  # 携带尾注（"4.5.14（devDep）"/"4.5.14 (dev)"）时两侧归一不等——报错信息显示基线=当前却 fail
  # （自相矛盾证据）。修：从第一个括号（全角/半角）起截断尾注再比较；无括号形态（2.1.4.RELEASE）
  # 不受影响——版本号内括号不合法，截断安全。
  printf '%s' "$1" | sed -E 's/^[~^><=]+//; s/[（(].*$//; s/[[:space:],;].*$//' | awk -F. -v OFS=. '{while(NF<3)$(NF+1)=0; print}'
}
_api_openapi_json_endpoints() {
  # 零 jq 依赖的 OpenAPI JSON 局部扫描：只取根 paths 对象；字符串内转义引号不改变
  # 花括号深度，depth1 的 "/path" 记为当前路径，depth2 的 HTTP 方法键才产出端点。
  tr -d '\n' < "$1" 2>/dev/null | awk '
    match($0, /"paths"[[:space:]]*:[[:space:]]*[{]/) {
      start=RSTART+RLENGTH-1; depth=0; in_string=0; escaped=0; token_start=0; current=""
      for(i=start; i<=length($0); i++) {
        ch=substr($0,i,1)
        if(in_string) {
          if(escaped) escaped=0
          else if(ch=="\\") escaped=1
          else if(ch=="\"") {
            token=substr($0,token_start+1,i-token_start-1)
            j=i+1
            while(j<=length($0) && substr($0,j,1) ~ /[[:space:]]/) j++
            if(substr($0,j,1)==":") {
              lower=tolower(token)
              if(depth==1 && token ~ /^\//) current=token
              else if(depth==2 && current!="" && lower ~ /^(get|post|put|delete|patch|head|options)$/) print toupper(lower), current
            }
            in_string=0
          }
          continue
        }
        if(ch=="\"") {in_string=1; token_start=i; continue}
        if(ch=="{") {depth++; continue}
        if(ch=="}") {depth--; if(depth==0) break}
      }
    }'
}
_api_route_paths_from_file() {
  local f="$1"
  # Java（Spring）：类级 @RequestMapping 作前缀 + 方法级映射（含无参形态）组合完整路径。
  # 旧通用正则只捕获「带字面路径参数」的映射——无参 @PostMapping/@GetMapping
  # （create/list 等核心端点）整体漏枚举，类级 @RequestMapping 反被计成 REQUEST 端点。
  # R139 两补：① 方法级 @RequestMapping("/x", method=…) 不再被吞作 base 候选——
  # base 已定或带 method= 形态按 REQUEST 端点枚举（旧版 next 后 return 0 跳过通用
  # 回落，端点从枚举结果消失、覆盖检查分母缩小）；② 路径拼接补分隔符与首斜杠
  # （旧版 base+"/api" + p="tasks" 产出 /apitasks；NestJS 分支同款逻辑对齐）。
  case "$f" in
    *.java)
      awk '
        function join_path(b, p,   full) {
          full = ""
          if (b != "") full = (b ~ /^\// ? b : "/" b)
          if (p != "") full = full (p ~ /^\// ? p : "/" p)
          if (full == "") full = "/"
          return full
        }
        /@RequestMapping[[:space:]]*\(/ {
          line = $0
          p = ""
          if (match(line, /"[^"]+"/)) { p = substr(line, RSTART + 1, RLENGTH - 2) }
          # 类级（无 method= 且 base 未定）作前缀并去尾斜杠；其余（方法级）按 REQUEST 端点枚举
          if (base == "" && line !~ /method[[:space:]]*=/) {
            base = p
            gsub(/\/+$/, "", base)
            next
          }
          print "REQUEST " join_path(base, p)
          next
        }
        /@(Get|Post|Put|Delete|Patch)Mapping/ {
          line = $0
          m = ""
          if (line ~ /@GetMapping/) m = "GET"
          else if (line ~ /@PostMapping/) m = "POST"
          else if (line ~ /@PutMapping/) m = "PUT"
          else if (line ~ /@DeleteMapping/) m = "DELETE"
          else if (line ~ /@PatchMapping/) m = "PATCH"
          if (m == "") next
          p = ""
          if (match(line, /"[^"]*"/)) { p = substr(line, RSTART + 1, RLENGTH - 2) }
          print m " " join_path(base, p)
        }
      ' "$f" 2>/dev/null
      return 0
      ;;
    # NestJS：类级 @Controller('prefix') 作前缀 + 方法级 @Get()/@Post('sub')（含无参形态）
    # 组合完整路径——与 Java 分支同族缺口：旧通用 grep 只捕「带引号参数」的装饰器，
    # 无参 @Get()/@Post()（list/create 核心端点）整体漏枚举，@Controller 前缀不组合，
    # :param 冒号参数原样输出。路径参数统一 {param} 规范（_api_path_ere 的转换锚点）。
    # R139：拼接改 join_path 同款——@Controller() 空 base 时旧式 (base ~ /^\// ? base : "/" base)
    # 恒产 "/"，再加 p 产出 //path 双斜杠；base 尾斜杠同理去重。
    *.ts|*.js)
      if ! grep -qE "@Controller[[:space:]]*\(" "$f" 2>/dev/null; then
        :   # 非 NestJS 控制器——落通用分支（Express/generic 装饰器扫描）
      else
        awk '
          function join_path(b, p,   full) {
            full = ""
            if (b != "") full = (b ~ /^\// ? b : "/" b)
            if (p != "") full = full (p ~ /^\// ? p : "/" p)
            if (full == "") full = "/"
            return full
          }
          /@Controller[[:space:]]*\(/ {
            line = $0
            if (base == "" && match(line, /["\x27][^\x27"]*["\x27]/)) {
              base = substr(line, RSTART + 1, RLENGTH - 2)
              gsub(/\/+$/, "", base)
            }
            next
          }
          /@(Get|Post|Put|Delete|Patch)[[:space:]]*\(/ {
            line = $0
            m = ""
            if (line ~ /@Get[[:space:]]*\(/) m = "GET"
            else if (line ~ /@Post[[:space:]]*\(/) m = "POST"
            else if (line ~ /@Put[[:space:]]*\(/) m = "PUT"
            else if (line ~ /@Delete[[:space:]]*\(/) m = "DELETE"
            else if (line ~ /@Patch[[:space:]]*\(/) m = "PATCH"
            if (m == "") next
            p = ""
            if (match(line, /["\x27][^\x27"]*["\x27]/)) { p = substr(line, RSTART + 1, RLENGTH - 2) }
            # :param → {param}（Express/NestJS 冒号风格 → 匹配器大括号锚点）
            gsub(/:[A-Za-z_][A-Za-z0-9_]*/, "{&}", p); gsub(/\{:/, "{", p)
            print m " " join_path(base, p)
          }
        ' "$f" 2>/dev/null
        return 0
      fi
      ;;
  esac
  # 统一输出 "METHOD /path"；RequestMapping 未声明方法时保留 REQUEST，
  # 由匹配器按路径兜底，避免把未知方法伪装成某个具体 HTTP 方法。
  grep -hoE '@(Get|Post|Put|Delete|Patch|Request)Mapping\([[:space:]]*"[^"]+"' "$f" 2>/dev/null \
    | sed -E 's/.*@(Get|Post|Put|Delete|Patch|Request)Mapping\([[:space:]]*"([^"]+)".*/\1 \2/' \
    | awk '{print toupper($1), $2}' || true
  grep -hoE '@(Get|Post|Put|Delete|Patch)\([[:space:]]*"[^"]+"' "$f" 2>/dev/null \
    | sed -E 's/.*@(Get|Post|Put|Delete|Patch)\([[:space:]]*"([^"]+)".*/\1 \2/' \
    | awk '{print toupper($1), $2}' || true
  grep -hoE "@(Get|Post|Put|Delete|Patch)\([[:space:]]*'[^']+'" "$f" 2>/dev/null \
    | sed -E "s/.*@(Get|Post|Put|Delete|Patch)\([[:space:]]*'([^']+)'.*/\1 \2/" \
    | awk '{print toupper($1), $2}' || true
  # Express/Koa/Fastify（限定路由对象，避免把 HTTP 客户端调用当端点）
  grep -hoE '(app|router|server|route|api)[[:space:]]*\.[[:space:]]*(get|post|put|delete|patch)\([[:space:]]*["'"'"'][^"'"'"']+' "$f" 2>/dev/null \
    | sed -E "s/.*(app|router|server|route|api)[[:space:]]*\.[[:space:]]*(get|post|put|delete|patch)\([[:space:]]*[\"']([^\"']+).*/\2 \3/" \
    | awk '{print toupper($1), $2}' || true
  # FastAPI/Flask/Blueprint 装饰器
  grep -hoE '@(app|router|bp|blueprint)\.(get|post|put|delete|patch)\([[:space:]]*["'"'"'][^"'"'"']+' "$f" 2>/dev/null \
    | sed -E "s/.*@(app|router|bp|blueprint)\.(get|post|put|delete|patch)\([[:space:]]*[\"']([^\"']+).*/\2 \3/" \
    | awk '{print toupper($1), $2}' || true
  # Gin（大写方法）
  grep -hoE '\.(GET|POST|PUT|DELETE|PATCH)\([[:space:]]*"[^"]+"' "$f" 2>/dev/null \
    | sed -E 's/.*\.(GET|POST|PUT|DELETE|PATCH)\([[:space:]]*"([^"]+)".*/\1 \2/' || true
}
_api_enumerate_endpoints() {
  local spec_dir="${API_SPEC_DIR:-}" f d out=""
  if [[ -n "$spec_dir" && -d "$spec_dir" ]]; then
    while IFS= read -r f; do
      [[ -n "$f" ]] || continue
      case "$f" in
        *.yaml|*.yml)
          out="${out}
$(awk '
  { line=$0; gsub(/"/,"",line) }
  line ~ /^[[:space:]]*\/[^:]+:[[:space:]]*$/ {
    p=line; sub(/^[[:space:]]*/,"",p); sub(/:[[:space:]]*$/,"",p); path=p; next
  }
  line ~ /^[[:space:]]*(get|post|put|delete|patch|head|options):[[:space:]]*$/ {
    if (path != "") {
      method=line; sub(/^[[:space:]]*/,"",method); sub(/:[[:space:]]*$/,"",method)
      print toupper(method), path
    }
  }
' "$f" 2>/dev/null || true)"
          ;;
        *.proto)
          out="${out}
$(sed -nE 's/^[[:space:]]*rpc[[:space:]]+([A-Za-z_][A-Za-z0-9_]*).*/RPC \1/p' "$f" 2>/dev/null || true)"
          ;;
        *.json)
          out="${out}
$(_api_openapi_json_endpoints "$f")"
          ;;
      esac
    done < <(find "$spec_dir" -type f \( -name '*.yaml' -o -name '*.yml' -o -name '*.proto' -o -name '*.json' \) 2>/dev/null)
  fi
  if [[ -z "$(printf '%s' "$out" | tr -d '[:space:]')" ]]; then
    local dirs=()
    for d in ${WRITE_HANDLER_DIRS[@]+"${WRITE_HANDLER_DIRS[@]}"} ${SERVICE_DIRS[@]+"${SERVICE_DIRS[@]}"} ${SCAN_DIRS[@]+"${SCAN_DIRS[@]}"}; do
      [[ -d "$d" ]] && dirs+=("$d")
    done
    [[ ${#dirs[@]} -eq 0 ]] && dirs=(".")
    for d in ${dirs[@]+"${dirs[@]}"}; do
      while IFS= read -r f; do
        [[ -n "$f" ]] || continue
        out="${out}
$(_api_route_paths_from_file "$f")"
      done < <(find "$d" -type f \( -name '*.java' -o -name '*.kt' -o -name '*.ts' -o -name '*.js' -o -name '*.py' -o -name '*.go' -o -name '*.cs' \) \
        -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/build/*' -not -path '*/target/*' -not -path '*/vendor/*' 2>/dev/null)
    done
  fi
  printf '%s\n' "$out" | sed -E 's/[[:space:]]+$//' | grep -v '^$' | sort -u
}
_api_test_files() {
  local d
  if [[ ${#API_TEST_DIRS[@]} -gt 0 ]]; then
    for d in ${API_TEST_DIRS[@]+"${API_TEST_DIRS[@]}"}; do
      [[ -d "$d" ]] || continue
      find "$d" -type f \( -name '*test*' -o -name '*spec*' -o -name '*Test.java' -o -name '*Tests.java' \) \
        -not -path '*/node_modules/*' -not -path '*/target/*' -not -path '*/build/*' 2>/dev/null || true
    done | sort -u
  else
    _ct_test_files
  fi
}
_api_path_ere() {
  local path="$1" escaped sq="'" bt='`'
  path=$(printf '%s' "$path" | sed -E 's/[?#].*$//; s#/$##')
  [[ -n "$path" ]] || return 1
  escaped=$(printf '%s' "$path" | sed -E 's#[][\\.^$*+?()|]#\\&#g; s#\{[^}]+\}#[^/]+#g')
  # 路径后必须是字符串结束、查询/片段或调用分隔符，防止 /orders 误中 /orders/123。
  # R138：字符类补反引号——模板字符串调用 request.patch(`/api/tasks/${id}`) 以 ` 结尾，
  # 缺它则动态参数端点（:id/{id} 形态）在 TS e2e（supertest + 模板字符串惯用法）永不命中。
  printf "%s/?([?#[:space:])}\"%s%s]|\$)" "$escaped" "$sq" "$bt"
}
_api_test_request_re() { # $1="METHOD /path" 或 "RPC Method" → 测试调用行 ERE
  local ep="$1" method path path_re method_chars method_re
  case "$ep" in
    RPC\ *) printf '%s' "${ep#RPC }"; return 0 ;;
  esac
  method="${ep%% *}"
  path="${ep#* }"
  path_re=$(_api_path_ere "$path") || return 1
  case "$method" in
    ANY|REQUEST) printf '%s' "$path_re"; return 0 ;;
  esac
  method_chars=$(printf '%s' "$method" | awk '{for(i=1;i<=length($0);i++){c=substr($0,i,1);printf "[%s%s]",tolower(c),toupper(c)}}')
  # 覆盖 request(app).post("/x")、MockMvc post("/x")、http.Post("/x")、
  # GetAsync("/x") 与 request("POST", "/x")；方法与路径须在同一调用行。
  method_re="(${method_chars}[A-Za-z]*[[:space:]]*\\(|[\"']${method_chars}[\"'])"
  printf '(%s).*(%s)|(%s).*(%s)' "$method_re" "$path_re" "$path_re" "$method_re"
}
_api_test_covers_endpoint() {
  local request_re
  request_re=$(_api_test_request_re "$2") || return 1
  grep -qE "$request_re" "$1" 2>/dev/null
}
_api_test_has_status_for_endpoint() {
  local tf="$1" request_re lines ln status_re next_re
  request_re=$(_api_test_request_re "$2") || return 1
  lines=$(grep -nE "$request_re" "$tf" 2>/dev/null | cut -d: -f1 || true)
  status_re='status[[:space:]]*\(|status_code|statusCode|StatusCode|HTTPStatus|\.status([^[:alnum:]_]|$)|toHaveStatus|[45][0-9][0-9]'
  next_re='(get|Get|GET|post|Post|POST|put|Put|PUT|delete|Delete|DELETE|patch|Patch|PATCH)[A-Za-z]*[[:space:]]*[(]|^[[:space:]]*(it|test|describe)[[:space:]]*[(]'
  for ln in $lines; do
    # 只看请求后的就近断言行，并在下一请求/用例处截断，防跨端点代答。
    if awk -v start="$ln" -v end="$((ln + 8))" -v stop_re="$next_re" '
      NR<start {next}
      NR>start && $0 ~ stop_re {exit}
      NR<=end {print}
      NR>end {exit}
    ' "$tf" | grep -qE "$status_re"; then
      return 0
    fi
  done
  return 1
}
_api_test_coverage_check() {
  local min="${API_TEST_MIN_RATIO:-0}" strict="${API_TEST_STRICT:-0}" require_status="${API_TEST_REQUIRE_STATUS:-0}"
  case "$min" in ''|*[!0-9]*) min=0 ;; esac
  [[ "$strict" == "1" ]] || strict=0
  [[ "$require_status" == "1" ]] || require_status=0
  if [[ "$min" -eq 0 && "$require_status" -eq 0 ]]; then
    # 未启用不得静默跳过——能力层在跑（check_api）而覆盖核验缺席必须可见（同 COVERAGE_MIN
    # 「不静默当作通过」口径；启用面=conf 的 API_TEST_* 块）。
    warn "gate_api_test_coverage: 接口测试覆盖检查未启用（API_TEST_MIN_RATIO=0 且 API_TEST_REQUIRE_STATUS=0）——端点×测试映射与状态码断言核验不生效；启用见 conf API_TEST_* 块"
    return 0
  fi
  local eps tests
  eps=$(_api_enumerate_endpoints)
  tests=$(_api_test_files)
  if [[ -z "$eps" ]]; then
    warn "gate_api_test_coverage: 未从 API_SPEC_DIR/路由声明枚举到端点——接口测试覆盖检查未执行（确认 API_SPEC_DIR 或 WRITE_HANDLER_DIRS）"
    return 0
  fi
  if [[ -z "$tests" ]]; then
    if [[ "$strict" -eq 1 ]]; then
      fail "gate_api_test_coverage: 枚举到 $(printf '%s\n' "$eps" | wc -l | tr -d ' ') 个端点但未发现接口测试文件——补 API 测试（$(_api_test_hint)）"
      return 1
    else
      warn "gate_api_test_coverage: 枚举到端点但未发现接口测试文件"
    fi
    return 0
  fi
  local total=0 covered=0 ep found status_ok tf uncovered="" status_missing=""
  while IFS= read -r ep; do
    [[ -n "$ep" ]] || continue
    [[ "${ep#* }" == "/" ]] && continue
    total=$((total + 1))
    found=0
    status_ok=0
    while IFS= read -r tf; do
      [[ -n "$tf" && -f "$tf" ]] || continue
      if _api_test_covers_endpoint "$tf" "$ep"; then
        found=1
        if [[ "$require_status" -eq 0 ]]; then
          break
        elif _api_test_has_status_for_endpoint "$tf" "$ep"; then
          status_ok=1
          break
        fi
      fi
    done <<< "$tests"
    if [[ "$found" -eq 1 ]]; then
      covered=$((covered + 1))
      [[ "$require_status" -eq 1 && "$status_ok" -eq 0 ]] && status_missing="${status_missing}${status_missing:+, }${ep}"
    else
      uncovered="${uncovered}${uncovered:+, }${ep}"
    fi
  done <<< "$eps"
  if [[ "$total" -eq 0 ]]; then
    warn "gate_api_test_coverage: 端点枚举结果为空（路径均为根路径/参数路径）——跳过比例判定"
    return 0
  fi
  local pct
  pct=$(awk -v c="$covered" -v t="$total" 'BEGIN{printf "%.0f", c*100/t}')
  if [[ "$min" -gt 0 && "$pct" -lt "$min" ]]; then
    if [[ "$strict" -eq 1 ]]; then
      fail "gate_api_test_coverage: 接口测试覆盖 ${covered}/${total}（${pct}%）< 阈值 ${min}%——未覆盖: $(printf '%s' "$uncovered" | cut -c1-400)"
      return 1
    else
      warn "gate_api_test_coverage: 接口测试覆盖 ${covered}/${total}（${pct}%）< 阈值 ${min}%——未覆盖: $(printf '%s' "$uncovered" | cut -c1-400)"
    fi
  else
    pass "接口测试覆盖 ${covered}/${total}（${pct}%）≥ 阈值 ${min}%"
  fi
  if [[ "$require_status" -eq 1 ]]; then
    if [[ -n "$status_missing" ]]; then
      if [[ "$strict" -eq 1 ]]; then
        fail "gate_api_test_status: 以下端点的测试调用附近未见状态码/错误路径断言: $(printf '%s' "$status_missing" | cut -c1-400)——每个端点须验证自身返回码与失败分支"
        return 1
      else
        warn "gate_api_test_status: 以下端点的测试调用附近未见状态码/错误路径断言: $(printf '%s' "$status_missing" | cut -c1-400)"
      fi
    else
      pass "接口测试覆盖端点均有就近状态码断言（${covered}/${total}）"
    fi
  fi
}
_api_test_hint() {
  printf '%s' '按 spec §19.1 的接口测试矩阵为每个端点补正常/鉴权失败/参数校验/不存在/冲突用例；测试目录可用 API_TEST_DIRS 指定'
}
_sast_deep_lexical_scan() {
  local hits
  hits=$(grep -rnE '\beval\s*\(|\bexec\s*\(|Runtime\.getRuntime\(\)\.exec|child_process\.exec' "${SECURITY_SCAN_DIRS[@]}" \
    --include='*.java' --include='*.ts' --include='*.js' --include='*.py' --include='*.go' 2>/dev/null \
    | grep -viE 'example|mock|node_modules' \
    | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|#|\*|/\*)' || true)
  [[ -z "$hits" ]] && return 1
  fail "$1"
  printf '%s\n' "$hits" | head -10 | sed 's/^/    /'
  return 0
}
_ai_hint() { # $1=门禁名 $2=AI 自查要点
  echo "=== $1（AI 自觉判断模式，GATE_AI_JUDGMENT=1）==="
  echo "  → AI 自查（不机械跑）：$2"
  echo "  → 提示：完成后可 echo 简单结论到 .swarm-yuan/notes/$(echo "$1" | tr '[:upper:]' '[:lower:]' | tr ' ' '-').md"
  pass "$1 已转 AI 自觉判断（advisory，不计 fail）"
}
