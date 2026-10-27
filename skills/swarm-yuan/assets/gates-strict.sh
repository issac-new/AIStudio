# GENERATED gates-strict.sh — source: assets/gates/ + gates.tsv; do not edit
# 源目录按 domain 组织；本文件按 gates.tsv 的 enforce 列聚合（WP6）。
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
# gate: branch
# domain: process / enforce: strict / tier: core
check_branch() {
  echo "=== 分支检查 ==="
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    skip_if_unconfigured "非 git 仓库，分支检查跳过"
    return
  fi
  local branch
  branch=$(git branch --show-current 2>/dev/null || echo "")
  if [[ -z "$branch" ]]; then
    skip_if_unconfigured "无法获取当前分支（detached HEAD？），分支检查跳过"
    return
  fi
  for pb in ${PROTECTED_BRANCHES[@]+"${PROTECTED_BRANCHES[@]}"}; do
    if [[ "$branch" == "$pb" ]]; then
      fail "绝不允许在保护分支 ${pb} 上开发"
      return
    fi
  done
  if [[ "$branch" =~ $BRANCH_REGEX ]]; then
    pass "分支规范: ${branch}"
  elif [[ "$branch" == "main" || "$branch" == "master" ]]; then
    fail "当前在 ${branch}，应切到 feature 分支开发"
  else
    fail "分支名不规范: $branch (应为 $BRANCH_REGEX)"
  fi
}
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
# gate: reuse
# domain: process / enforce: strict / tier: core
check_reuse() {
  echo "=== 复用合规检查（拼装式开发：禁止重复造轮子）==="
  local found=0

  # ---- 1. 硬门禁：spec-template.md §5.5 复用约束段必须已填写 ----
  # 找到最近一份 spec（项目内 specs/ 或当前目录）。
  # 注意：排除 *-template.md 模板文件——模板的 §5.5 checkbox 本就该是 [ ] 待用户复制后勾选，
  # 把模板当具体 spec 检会误判 fail（范式自举检查发现的缺陷）。
  # 发现逻辑统一走 _find_spec_file（SPEC_GLOB 优先，旧硬编码路径兜底）。
  local spec_file
  spec_file=$(_find_spec_file '拼装合规声明')

  if [[ -z "$spec_file" ]]; then
    # 无 spec 文档（项目本身无具体变更 spec，如范式仓库自身/纯工具仓库）：跳过而非 fail。
    # --all-full 静默跳过；显式 --reuse 时 warn 提示（拼装式开发项目应配 spec）。
    skip_if_unconfigured "未找到含 §5.5 复用约束段的 spec 文档（拼装式开发项目应在 specs/ 下配 spec；纯工具/范式仓库可跳过）"
    # skip 后必须 return——
    # skip_if_unconfigured 不终止函数，原实现继续走下方 AI 自查指引并打印「✓ 复用合规检查通过」，
    # skip 态叠加假 pass 信号（trace 记 done），三处呈现分裂（汇总=skip 对、输出与 trace=done 错）。
    return 0
  else
    # 校验 §5.5 拼装合规声明 4 个 checkbox 已勾选
    # 原区间 '/复用约束|拼装合规声明/,/^## [0-9]/'
    # 的终止模式与 spec-template.md 自身标题形态冲突——模板 §5.5 标题是 "## 5.5 ★复用约束"（数字紧跟 ## ），
    # 同一行同时命中起止模式 → awk 区间自塌为单标题行 → 规范填齐 4 勾仍恒报 "0/4" 假 fail（"## §5.5"
    # 形态碰巧绕过）。且原终止只认数字标题，非数字标题（## 回滚）不终止 → 区间吞到文件尾，后续段落的
    # checkbox 被误计入本段（假放行面）。改为：标题含关键词进区间、任意其它 ## 标题出区间——两种标题
    # 形态（## 5.5 / ## §5.5）均正确解析，计数面收紧到本段。
    local decl; decl=$(awk '/复用约束|拼装合规声明/{inr=1} inr && /^## / && !/复用约束|拼装合规声明/{inr=0} inr{print}' "$spec_file" 2>/dev/null)
    if [[ -z "$decl" ]]; then
      fail "$spec_file 缺少 §5.5 复用约束段"
      found=1
    else
      local unchecked; unchecked=$(echo "$decl" | grep -cE '^\s*-\s*\[\s\]' || true)
      local checked;   checked=$(echo "$decl" | grep -cE '^\s*-\s*\[x\]' || true)
      if [[ $unchecked -gt 0 || $checked -lt 4 ]]; then
        fail "$spec_file §5.5 拼装合规声明未全部勾选（$checked/4 已勾，$unchecked 未勾）"
        found=1
      fi
    fi
  fi

  # ---- 1.5 --task-type 校验 spec 节必填/豁免落实（可选，向后兼容）----
  # 任务类型（feature/fix/refactor/chore/docs/test/exp）→ 必填节/可豁免节映射，
  # 数据来自 assets/task-type-gates.conf 的 TASK_EXEMPT_<type>（spec-template.md 头部表层化同源）。
  # 未传 --task-type 则跳过本段（维持现状：只校验 §5.5，向后兼容）。
  if [[ -n "${TASK_TYPE:-}" && -n "$spec_file" ]]; then
    # 任务类型 → 必填节清单（与 spec-template.md 头部矩阵 + task-type-gates.conf 对齐）
    case "$TASK_TYPE" in
      feature)        _required_sec="§1 §2 §3 §4 §5.5 §5.6 §5.7 §6 §7 §8 §9 §10 §11 §12 §13" ;;
      fix)            _required_sec="§1 §2 §3 §4 §5.5 §12" ;;
      refactor)       _required_sec="§1 §2 §3 §4 §5.5 §6 §7 §8 §9 §10 §11 §12 §13" ;;
      chore)          _required_sec="" ;;   # spec 全段可免
      docs)           _required_sec="" ;;   # 其他门禁全免
      test)           _required_sec="§19" ;;
      exp)            _required_sec="§1" ;;
      *) fail "未知任务类型 '$TASK_TYPE'（合法值：feature|fix|refactor|chore|docs|test|exp）"; found=1; _required_sec="" ;;
    esac
    # 校验必填节非空（§N 段在 spec 里存在且非「不适用」占位）
    local sec
    for sec in $_required_sec; do
      local sec_num="${sec#§}"
      local sec_body
      sec_body=$(awk -v sn="$sec_num" '
        $0 ~ "^## " sn "[. ]" {in_sec=1; next}
        /^## [0-9]/ && in_sec {in_sec=0}
        in_sec {print}
      ' "$spec_file" 2>/dev/null)
      # 段不存在 or 仅含「不适用」→ fail
      if [[ -z "$sec_body" ]] || echo "$sec_body" | grep -qE '^\s*(不适用|N/A)\s*$'; then
        fail "$spec_file §${sec_num} 为 $TASK_TYPE 任务必填节，但缺失或标「不适用」"
        found=1
      fi
    done
  fi

  # ---- 2. 硬门禁：新增胶水代码单元名 vs reference-manual.md §4/5/6 稳定单元名重名检测 ----
  # 兜底候选含 glob：.claude/skills/<*>/references/reference-manual.md
  local ref_file
  ref_file=$(_first_existing_file "references/reference-manual.md" "reference-manual.md" ".claude/skills/*/references/reference-manual.md")

  if [[ -n "$spec_file" && -n "$ref_file" ]]; then
    # 从 spec §5.5 "新增胶水代码" 表提取首列单元名（跳过表头/分隔行/空行）
    # 原提取用默认空白分字段取 $2——
    # 既不是表格列语义，又把"胶水落在既有文件内"（首列=文件路径，模板口径）与
    # §4/5/6 首列路径对比，重名必判——而"在既有单元内加最小胶水"正是拼装式开发
    # 的推荐形态，检测语义拧反，任何正常 spec 必被拦。修复：
    #   ① -F'|' 按表格列取首列单元格；
    #   ② 路径形态（含 /）的单元格 = 在既有文件内加胶水，不参与重名对比
    #     （路径已在稳定清单=合法拼装；不在=新文件，新文件无从与既有路径重名）；
    #   ③ 仅非路径单元格（单元名形态）参与重名检测（保留原拦截意图）。
    local new_names; new_names=$(awk -F'|' '
      /^### .*新增胶水代码/ {in_tbl=1; next}
      /^### / && in_tbl {in_tbl=0}
      in_tbl && /^[[:space:]]*\|/ && !/^[[:space:]]*\|[-: ]+\|/ && !/文件|单元名/ {
        cell=$2; gsub(/[ `]/,"",cell); if(cell!="") print cell
      }
    ' "$spec_file" 2>/dev/null | awk '
      !/\// {print}   # 路径形态跳过；单元名形态参与重名对比
    ' | sort -u)
    # 从 reference-manual.md §4/§5/§6 表格首列提取稳定单元名（-F'|' 表格列语义，同上）
    local stable_names; stable_names=$(awk -F'|' '
      /^#+ .*[§4-6].*(组件|依赖链路|接口)/ {in_sec=1}
      /^#+ / && !/[§4-6].*(组件|依赖链路|接口)/ {if(in_sec) in_sec=0}
      in_sec && /^[[:space:]]*\|/ && !/^[[:space:]]*\|[-: ]+\|/ {
        cell=$2; gsub(/[ `]/,"",cell); if(cell!="" && cell !~ /^</) print cell
      }
    ' "$ref_file" 2>/dev/null | sort -u)

    if [[ -n "$new_names" && -n "$stable_names" ]]; then
      local dups; dups=$(comm -12 <(echo "$new_names") <(echo "$stable_names"))
      if [[ -n "$dups" ]]; then
        fail "疑似重复造轮子：以下新增单元名与 reference-manual.md §4/5/6 既有稳定单元重名（应直接复用）："
        echo "$dups" | sed 's/^/    - /'
        found=1
      fi
    fi
  fi

  # ---- 3. 启发式 warn：本次 diff 新增导出单元数量异常（非全量统计）----
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    local base; base=$(_git_base)
    local diff_add; diff_add=$(git diff "$base"...HEAD --diff-filter=A --name-only 2>/dev/null || true)
    [[ -z "$diff_add" ]] && diff_add=$(git diff HEAD --diff-filter=A --name-only 2>/dev/null || true)
    if [[ -n "$diff_add" ]]; then
      local new_count=0
      while IFS= read -r nf; do
        [[ -z "$nf" ]] && continue
        case "$nf" in
          *.ts|*.js|*.vue|*.py)
            local exports; exports=$(grep -cE '^\s*(export\s+)?(function|const|class|def)\s+[A-Za-z_]' "$nf" 2>/dev/null | head -1 || true); exports=${exports:-0}
            new_count=$((new_count + exports))
            ;;
        esac
      done <<< "$diff_add"
      if [[ $new_count -gt 30 ]]; then
        warn "本次变更新增 $new_count 个导出单元——请核对 reference-manual.md §4/5/6 可复用稳定单元清单，确认无重复造轮子"
      fi
    fi
  fi

  echo "  提示: 拼装式开发原则——新功能应优先复用既有稳定单元（见 reference-manual.md §4/5/6）"
  echo "    - 禁止重复造轮子：新增前先查可复用稳定单元清单"
  echo "    - 禁止侵入式重构：不改既有稳定单元签名/行为"
  echo "    - 禁止破坏性改造：不改 upstream 骨架/第三方依赖"
  echo "    - 每个新增文件应标注复用了哪些既有单元（见 spec-template.md §5.5 复用约束段）"
  # 实证反馈（强行复用不贴合场景）——反方向检查：
  # 机械层只能抓"该复用没复用"（重名/新增导出过多），"复用错了"（跨场景硬套、
  # 为复用扭曲新代码）是语义判断，机械抓不住。此处给 AI 判断引导（_ai_hint 同款模式）：
  # 本次复用的每个稳定单元须有一句"场景贴合性"留痕，供审查回放。
  echo "  → AI 自查（语义层，机械不判）：本次改动复用的每个稳定单元，逐一回答——"
  echo "    ① 该单元的设计场景与本次需求场景是否同类（输入域/输出域/副作用面一致）？"
  echo "    ② 复用是否让新代码为它做了本不该做的适配（参数塞哑值/包一层壳改语义/引入无关依赖）？"
  echo "    ③ 若以上任一答'不贴合'，停止复用、新写单元，并在 spec §5.5 说明不复用理由。"
  echo "    留痕：echo '<结论>' >> .swarm-yuan/notes/check_reuse.md（审查与复盘的数据源）"
  if [[ $found -eq 0 ]]; then
    pass "复用合规检查通过"
  fi
}
# gate: security
# domain: security / enforce: strict / tier: core
check_security() {
  echo "=== 安全规范检查（OWASP Top 10 / 代码安全 / 网络安全）==="
  # 工具链降级：SECURITY_TOOL=auto/builtin/semgrep；auto=有 semgrep 用 semgrep，否则内置
  # 内置路径（下方原逻辑）行为一字不变；semgrep 执行失败降级内置（不静默 fail-open）
  local _security_tool="${SECURITY_TOOL:-auto}"
  if [[ "$_security_tool" == "auto" ]]; then
    if command -v semgrep >/dev/null 2>&1; then _security_tool="semgrep"; else _security_tool="builtin"; fi
  elif [[ "$_security_tool" == "semgrep" ]] && ! command -v semgrep >/dev/null 2>&1; then
    warn "SECURITY_TOOL=semgrep 但 semgrep 未安装，降级内置规则扫描"
    _security_tool="builtin"
  fi
  if [[ "$_security_tool" == "semgrep" ]]; then
    local _semgrep_rc=0
    _check_security_semgrep || _semgrep_rc=$?
    case "$_semgrep_rc" in
      3)
        # semgrep 已 fail（ERROR 级命中）→ 跳过内置，避免重复报同一问题
        return ;;
      1)
        warn "semgrep 执行失败（rc≥2），降级内置规则扫描" ;;
      2)
        : ;;  # 无可扫目录，落入内置路径的同文案披露
      0)
        # 修复（安全）：semgrep 通过**不再 return**，继续叠加内置模式族。
        # 缺陷：原逻辑"semgrep 通过就 return"把互补的两种范式做成互斥二选一——
        #   semgrep 强在语义/框架感知（依赖已知类型签名），内置强在模式化鲁棒性
        #   （SQL 关键字 + 字符串拼接特征 / eval 词法）。实测自定义对象方法
        #   （db.exec / engine.eval）semgrep --config auto 与 p/java 均 0 命中，
        #   而内置能精准抓到 → 装了 semgrep 的用户反而比不装更弱（违反"工具增强"直觉）。
        # 叠加成本仅几秒 grep，对齐"质量优先 > 兼顾效率"执行准则。
        echo "  ⓘ semgrep 通过，继续内置模式族扫描（语义层 + 词法层叠加，非二选一）" ;;
    esac
  fi
  local found=0
  # 合并 WRITABLE_DIRS + SCAN_DIRS 并去重（避免同一目录扫两遍产生重复告警）
  local targets=() seen=""
  for d in ${WRITABLE_DIRS[@]+"${WRITABLE_DIRS[@]}"} ${SCAN_DIRS[@]+"${SCAN_DIRS[@]}"}; do
    [[ -z "$d" || ! -d "$d" ]] && continue
    case " $seen " in *" $d "*) continue ;; esac
    seen="$seen $d"; targets+=("$d")
  done
  if [[ ${#targets[@]} -eq 0 ]]; then
    # R118：空配置=未执行（skip，不打印“通过”）；配了但目录全不存在=配置错误（fail）。
    # 旧版一律 warn+return 0，拼写错误/占位符会让安全门禁静默假通过（审计 P1-1）。
    if [[ ${#WRITABLE_DIRS[@]} -eq 0 && ${#SCAN_DIRS[@]} -eq 0 ]]; then
      skip_if_unconfigured "WRITABLE_DIRS/SCAN_DIRS 未配置"
    else
      fail "gate_security_scan_dirs_missing: WRITABLE_DIRS/SCAN_DIRS 配置的目录全部不存在"
    fi
    return
  fi

  local line

  # §1 SQL 注入：SQL 关键字 + 字符串拼接/插值
  # ★MyBatis 框架感知：#{} 是参数化安全写法（跳过），${} 是危险字符串拼接（仅 ORDER BY/表名白名单可用）
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    # 排除 MyBatis 安全的 #{} 参数化写法
    if echo "$line" | grep -qE '#\{'; then
      # 含 #{} 的行如果是纯 #{}（无 ${}），视为安全
      if ! echo "$line" | grep -qE '\$\{'; then
        continue
      fi
    fi
    # 检查白名单（SQL_INJECTION_WHITELIST）
    local in_whitelist=0
    if [[ ${#SQL_INJECTION_WHITELIST[@]} -gt 0 ]]; then
      local wl
      for wl in "${SQL_INJECTION_WHITELIST[@]}"; do
        echo "$line" | grep -qF "$wl" && in_whitelist=1 && break
      done
    fi
    # ★TS/JS 生态安全形态豁免（机械可判，better-sqlite3/fetch 标准写法）：
    #   列名常量插值 ${COLS}（值仍经 ? 参数化）/ URL 模板经 encodeURIComponent / IN 占位符 ${placeholders}
    if echo "$line" | grep -qE '\$\{[A-Z_][A-Z_0-9]*\}|\$\{placeholders\}|encodeURIComponent'; then
      continue
    fi
    # ★参数化绑定值豁免（R106-D13）：SQL 字面量含 ? 占位符且后随逗号——拼接只发生在
    # 绑定值实参位（GORM/参数化 query 标准写法 Where("... LIKE ?", "%"+name+"%")），
    # 且关键字字面量本身不被 + 拼接（"SELECT ... " + var 形态仍拦）。误报实证：go-forge
    # 回归轮参数化子查询（IN (SELECT ... LIKE ?) + "%"+custName+"%"）被误判注入 fail。
    if echo "$line" | grep -qE '"[^"]*(SELECT|INSERT|UPDATE|DELETE|DROP)[^"]*\?[^"]*"[[:space:]]*,' \
      && ! echo "$line" | grep -qE '"[^"]*(SELECT|INSERT|UPDATE|DELETE|DROP)[^"]*"[[:space:]]*\+'; then
      continue
    fi
    # ★HTTP 动词豁免（R108-D4）：method: 'DELETE' 是 HTTP 动词不是 SQL——与模板字面量 ${}
    # 同行时被注入启发式误伤（rust-forge 回归实证 web/src/api.js deleteTask 整行误报 fail，
    # 该文件零 SQL；前端 REST 层 DELETE/PUT/POST 端点全是此形态=大面积误报家族）。
    # 判据：关键字仅以 method 值（引号包裹）形态出现，且行内无 SQL 子句词
    # （FROM/WHERE/SET/INTO/VALUES/TABLE/JOIN）——真 SQL 拼接行仍拦（含子句词不豁免）。
    if echo "$line" | grep -qE "method[[:space:]]*:[[:space:]]*['\"\`]?[[:space:]]*(DELETE|GET|POST|PUT|PATCH|HEAD|OPTIONS)" \
      && ! echo "$line" | grep -qE '(FROM|WHERE|SET|INTO|VALUES|TABLE|JOIN)[^a-zA-Z]'; then
      continue
    fi
    if [[ $in_whitelist -eq 1 ]]; then
      warn "MyBatis \${} 白名单命中（须人工确认安全）：$line"
    # ★语义豁免（变量经 sanitize 函数，ERE 不可判）：降级 warn 人工复核，不 fail
    elif echo "$line" | grep -qE '\$\{(safe|sanitized|escaped)[A-Za-z]*\}'; then
      warn "SQL 插值变量疑似已经 sanitize（须人工确认校验覆盖）：$line"
    else
      fail "疑似 SQL 注入（字符串拼接 SQL）：$line"; found=1
    fi
  done < <(_sec_scan 'SELECT|INSERT|UPDATE|DELETE|DROP' "${targets[@]}" | grep -E '\+|\$\{' || true)

  # §2 命令注入：child_process exec/spawn + 动态拼接（排除 RegExp.exec）
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    fail "疑似命令注入（exec/system 拼接动态内容）：$line"; found=1
  done < <(_sec_scan 'exec\(|execSync\(|spawn\(|system\(|popen\(|child_process' "${targets[@]}" \
    | grep -E '\+|\$\{|%s|format\(' \
    | grep -viE '\.exec\(|RegExp|regex|pattern\.exec|match\.' || true)

  # §3 不安全动态代码执行：eval / new Function
  # 修复（误报）：原裸匹配 'eval\(|new Function\(' 无任何白名单，
  # 同文件 §1/§2/§4 都有排除（MyBatis #{}/命令注入 .exec(|RegExp/XSS 须含拼接），唯 §3 没有。
  # 实测误报：flask 的 ast.literal_eval()——Python 官方推荐的 eval 安全替代（只解析字面量、
  # 不执行代码），恰恰是正确解法，误报会训练用户改回不安全写法或加豁免（反向激励）。
  # 内置排除安全求值函数（词法层无法判定类型，按命名约定排除已知安全变体）：
  #   ast.literal_eval / literal_eval / .safe_eval（Python）｜json.loads（反序列化非代码执行）。
  # 另加 EVAL_WHITELIST 可配豁免（对齐 §1 SQL_INJECTION_WHITELIST 设计）。
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    # 排除已知安全的求值替代（literal_eval / safe_eval / json.loads）
    if echo "$line" | grep -qiE 'ast\.literal_eval|literal_eval|\.safe_eval|safe_eval|json\.loads'; then
      continue
    fi
    # 可配白名单（EVAL_WHITELIST，与 SQL_INJECTION_WHITELIST 同构）
    local in_whitelist=0
    if [[ ${#EVAL_WHITELIST[@]} -gt 0 ]]; then
      local wl
      for wl in "${EVAL_WHITELIST[@]}"; do
        if echo "$line" | grep -qF "$wl"; then
          warn "eval 白名单命中（须人工确认安全）：$line"
          in_whitelist=1; break
        fi
      done
    fi
    [[ "$in_whitelist" -eq 1 ]] && continue
    fail "不安全动态代码执行（eval / new Function）：$line"; found=1
  done < <(_sec_scan 'eval\(|new Function\(' "${targets[@]}" || true)

  # §4 XSS：v-html / dangerouslySetInnerHTML / innerHTML + 拼接
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    fail "疑似 XSS（v-html / dangerouslySetInnerHTML / innerHTML 拼接）：$line"; found=1
  done < <(_sec_scan 'v-html|dangerouslySetInnerHTML|innerHTML' "${targets[@]}" | grep -E '\+|\$\{' || true)

  # §5 路径穿越（warn）
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    warn "疑似路径穿越（../ 或 path.join 含动态片段）：$line"
  done < <(_sec_scan '\.\./|path\.join\(|path\.resolve\(' "${targets[@]}" | grep -E '\+|\$\{|req\.|input|param' || true)

  # §6 硬编码密钥：变量名含 key/secret/token/password + 赋值 16+ 位字符串字面量（排除注释/变量名/枚举）
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    fail "疑似硬编码密钥：$line"; found=1
  done < <(_sec_scan 'api[_-]?key|secret|token|password|passwd|pwd|private[_-]?key' "${targets[@]}" \
    | grep -E "[:=][[:space:]]*[\"'][A-Za-z0-9+/=_-]{16,}[\"']" \
    | grep -viE '^[^:]+:[0-9]+:.*(process\.env|getenv|os\.environ|config\.|env\.|example|placeholder|enum |type |interface |class )' \
    | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|/\*|\*)' || true)

  # §7 弱哈希用于密码（warn）
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    warn "疑似弱哈希（md5/sha1 用于密码场景）：$line"
  done < <(_sec_scan 'md5|sha1|createHash' "${targets[@]}" | grep -iE 'password|pwd|passwd|auth|token|secret' || true)

  # §8 TLS 验证关闭（R126-G3：旧过滤链 `grep -iE 'false|true' | grep -v rejectUnauthorized:true`
  # 只排除一种安全写法，insecure: false / verify: true / ssl.verify=true 等安全配置均误报 fail。
  # 改为正向匹配四类"不安全值"形态：rejectUnauthorized:false / verify:false / insecure:true / allowInsecure:true）
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    fail "不安全传输配置（TLS 验证关闭）：$line"; found=1
  done < <(_sec_scan 'rejectUnauthorized|verify\s*:\s*false|insecure|allowInsecure|ssl.*verify' "${targets[@]}" \
    | grep -iE 'rejectUnauthorized[[:space:]]*:[[:space:]]*false|verify[[:space:]]*:[[:space:]]*false|insecure[[:space:]]*[:=][[:space:]]*true|allowInsecure[[:space:]]*[:=][[:space:]]*true' || true)

  # §9 CORS 全开（warn）—— 只匹配实际 CORS 配置中的 *，不匹配注释
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    warn "疑似 CORS 全开（Allow-Origin: *）：$line"
  done < <(_sec_scan 'Access-Control-Allow-Origin|cors\(' "${targets[@]}" \
    | grep -E '\*' | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|/\*|\*)' || true)

  # §10 调试模式开启（warn）
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    warn "疑似生产调试模式开启（debug:true）：$line"
  done < <(_sec_scan 'debug\s*:\s*true|DEBUG\s*=\s*true|DEBUG\s*=\s*True' "${targets[@]}" \
    | grep -viE 'dev\.env|development|test' || true)

  echo "  提示: 安全规范——防范 OWASP Top 10（注入/XSS/CSRF/访问控制/认证/敏感数据）"
  echo "    - 硬性违规(fail)：SQL/命令注入、eval、XSS 拼接、硬编码密钥、TLS 关闭"
  echo "    - 人工复核(warn)：路径穿越、弱哈希、CORS *、调试模式"
  echo "    - 完整规范见 references/security-spec.md（应用安全/代码安全/网络安全/AI安全）"
  if [[ $found -eq 0 ]]; then
    pass "安全规范检查通过（未检测到硬性违规；warn 项请人工复核）"
  fi
}
# gate: layer
# domain: architecture / enforce: strict / tier: arch
check_layer() {
  echo "=== 分层边界检查（DDD：层穿透/倒置/循环/领域污染）==="
  local found=0

  if [[ ${#LAYER_DEFS[@]} -eq 0 || ${#LAYER_ORDER[@]} -eq 0 ]]; then
    skip_if_unconfigured "未配置 LAYER_DEFS/LAYER_ORDER，跳过分层检查"
    return
  fi

  # ---- 0. 优先用 gitnexus query 查跨层依赖（最准确）----
  # P0-5：消费前确保已构建（gitnexus_ensure_indexed），未构建则触发构建提示/降级
  if has_gitnexus && gitnexus_ensure_indexed; then
    trace_tool "gitnexus" "query cross-layer imports"
    local gn_layer_issues; gn_layer_issues=$(gitnexus query "cross-layer imports" --format text 2>/dev/null | head -20 || true)
    if [[ -n "$gn_layer_issues" ]]; then
      local issue_count; issue_count=$(echo "$gn_layer_issues" | grep -cE '^\s+\S' || true)
      if [[ "$issue_count" -gt 0 ]]; then
        warn "gitnexus 检测到 ${issue_count} 处可能的跨层依赖（详见输出）"
        echo "$gn_layer_issues" | head -5 | sed 's/^/    /'
      fi
      pass "分层检查增强（基于 gitnexus 代码图谱）"
    else
      # 空结果也提示（修静默——原代码 gitnexus 无跨层问题时连 pass 都不打印）
      pass "gitnexus 查询跨层依赖:无问题"
    fi
  else
    # gitnexus 缺失/未索引时原静默跳过（无 else 提示），
    # 与 check_review 的 ocr 缺失 warn 提示诚实化不一致——降级链须显式披露，不假装跑了图谱分析。
    warn "gitnexus 未装/未索引——分层检查降级为 grep/awk 静态分析（未用代码图谱，精度较低；gitnexus analyze 或 BUILD_DEEP_RUNTIMES=1 可升级）"
  fi

  # 临时映射文件（兼容 bash 3.2，不用 declare -A）
  local tmp_file2layer tmp_layer2idx tmp_layer_files
  tmp_file2layer=$(mktemp "${TMPDIR:-/tmp}/swarm-yuan-f2l.XXXXXX"); tmp_layer2idx=$(mktemp "${TMPDIR:-/tmp}/swarm-yuan-l2i.XXXXXX"); tmp_layer_files=$(mktemp "${TMPDIR:-/tmp}/swarm-yuan-lf.XXXXXX")
  # RETURN trap 会随外层函数（如 _gate_exec）返回二次触发——双引号定义期烘焙路径使其自包含，
  # 避免 set -u 下单引号延迟求值引用已销毁的局部变量；二次触发对已删文件 rm -f 为无害 no-op。
  # shellcheck disable=SC2064  # 有意用双引号在定义期烘焙 $tmp_* 路径（见上行注释），非延迟求值
  trap "rm -f '$tmp_file2layer' '$tmp_layer2idx' '$tmp_layer_files'" RETURN

  # ---- 1. 构建层→文件映射 + 文件→层映射 ----
  local ld
  for ld in "${LAYER_DEFS[@]}"; do
    local name="${ld%%=*}"
    local globs="${ld#*=}"
    [[ -z "$name" || -z "$globs" ]] && continue
    local matched=""
    IFS=',' read -ra garr <<< "$globs"
    for g in "${garr[@]}"; do
      g="${g// /}"
      [[ -z "$g" ]] && continue
      local m=""
      # 优先 find（覆盖未 git add 的新文件），再并 git ls-files（覆盖 git 历史但已删除的工作区文件）
      # base 解析：去掉末尾的 /**（用 % 最短匹配，不能用 %% 最长匹配——%% 会跨越中间的 * 把
      # 'overlay/custom/client/*/components/**' 误截成 'overlay/custom/client'，导致 find 扫整个 client 目录，
      # 把 __tests__/adapters/composables 全归入 component 层，check_layer §3 大量误判）。
      local base="${g%/\*\*}"
      # base 可能含 * 通配（如 overlay/custom/client/*/components），[[ -d ]] 不展开 glob 会 false。
      # 用 compgen -d 展开 glob 为实际目录列表，逐个 find（兼容 bash 3.2）。
      if [[ -d "$base" ]]; then
        m=$(find "$base" -type f \( -name '*.ts' -o -name '*.js' -o -name '*.py' -o -name '*.go' -o -name '*.java' -o -name '*.vue' \) 2>/dev/null || true)
      else
        # base 含 glob 字符，展开后逐个 find
        local expanded
        expanded=$(compgen -d "$base" 2>/dev/null || true)
        if [[ -n "$expanded" ]]; then
          local d
          while IFS= read -r d; do
            [[ -z "$d" ]] && continue
            local dm; dm=$(find "$d" -type f \( -name '*.ts' -o -name '*.js' -o -name '*.py' -o -name '*.go' -o -name '*.java' -o -name '*.vue' \) 2>/dev/null || true)
            [[ -n "$dm" ]] && m="${m}${m:+$'\n'}$dm"
          done <<< "$expanded"
        fi
      fi
      if [[ -z "$m" ]] && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        m=$(git ls-files "$g" 2>/dev/null || true)
      fi
      [[ -n "$m" ]] && matched="${matched}${matched:+$'\n'}$m"
    done
    # 记录 layer -> files
    printf '%s\t' "$name" >> "$tmp_layer_files"
    printf '%s\n' "$matched" >> "$tmp_layer_files"
    # 记录 file -> layer
    while IFS= read -r f; do
      [[ -z "$f" ]] && continue
      printf '%s\t%s\n' "$f" "$name" >> "$tmp_file2layer"
    done <<< "$matched"
  done

  if [[ ! -s "$tmp_file2layer" ]]; then
    warn "LAYER_DEFS 配置但未匹配到任何源文件，检查 glob 是否正确"
    return
  fi

  # ---- 2. 层索引（LAYER_ORDER[0] 最上层，只能依赖下方层）----
  local i=0 lo
  for lo in "${LAYER_ORDER[@]}"; do
    printf '%s\t%s\n' "$lo" "$i" >> "$tmp_layer2idx"
    i=$((i+1))
  done

  # 辅助：查文件所属层（接受绝对或相对路径，统一去掉 PROJECT_DIR 前缀）
  # 注意 macOS 下 /tmp 是 /private/tmp 的 symlink，PROJECT_DIR 与 realpath 结果可能前缀不一致
  local _pd; _pd=$(cd "$PROJECT_DIR" 2>/dev/null && pwd -P || echo "$PROJECT_DIR")
  _norm() { local p="$1"; p="${p#"$_pd"/}"; p="${p#"$PROJECT_DIR"/}"; p="${p#./}"; printf '%s' "$p"; }
  _layer_of() { local p; p=$(_norm "$1"); awk -F'\t' -v f="$p" '$1==f{print $2; exit}' "$tmp_file2layer"; }
  _idx_of()   { awk -F'\t' -v l="$1" '$1==l{print $2; exit}' "$tmp_layer2idx"; }

  # ---- 3. 层依赖方向断言：仅允许上层依赖下层 ----
  local f _layer_unreg=""
  while IFS= read -r line; do
    f="${line%%$'\t'*}"
    local src_layer; src_layer="${line#*$'\t'}"
    [[ -z "$f" || -z "$src_layer" ]] && continue
    local src_idx; src_idx=$(_idx_of "$src_layer")
    # R128：层在 LAYER_DEFS 命中但未登记 LAYER_ORDER 时，旧版默认索引 0（最顶层）——方向性
    # 误判（既可能假报倒置也可能漏报），且零披露。改为披露一次（去重）并跳过该文件方向判定。
    if [[ -z "$src_idx" ]]; then
      case " ${_layer_unreg:-} " in *" $src_layer "*) ;; *)
        _layer_unreg="${_layer_unreg:-} $src_layer"
        warn "层「${src_layer}」在 LAYER_DEFS 命中但未登记 LAYER_ORDER——方向判定跳过（补齐 LAYER_ORDER 后重跑）" ;;
      esac
      continue
    fi
    local imports
    imports=$(grep -hoE "(import|from)\s+['\"][^'\"]+['\"]|import\s+[a-zA-Z0-9_./]+|require\(['\"][^'\"]+['\"]\)" "$f" 2>/dev/null \
      | grep -oE "['\"][^'\"]+['\"]" | sed "s/['\"]//g" | sort -u || true)
    [[ -z "$imports" ]] && continue
    while IFS= read -r imp; do
      [[ -z "$imp" ]] && continue
      case "$imp" in
        ./*|../*)
          local dir; dir=$(dirname "$f")
          local target=""
          # realpath 对无扩展名的模块路径会失败，先按各扩展名尝试解析
          for ext in ".ts" ".js" ".py" ".go" ".tsx" ".jsx" "/index.ts" "/index.js"; do
            local cand
            cand=$(cd "$dir" 2>/dev/null && _resolve_path "${imp}${ext}" 2>/dev/null || echo "")
            if [[ -n "$cand" && -f "$cand" ]]; then target="$cand"; break; fi
          done
          [[ -z "$target" ]] && continue
          local tgt_layer; tgt_layer=$(_layer_of "$target")
          [[ -z "$tgt_layer" ]] && continue
          local tgt_idx; tgt_idx=$(_idx_of "$tgt_layer")
          if [[ -z "$tgt_idx" ]]; then
            case " ${_layer_unreg:-} " in *" $tgt_layer "*) ;; *)
              _layer_unreg="${_layer_unreg:-} $tgt_layer"
              warn "层「${tgt_layer}」在 LAYER_DEFS 命中但未登记 LAYER_ORDER——方向判定跳过（补齐 LAYER_ORDER 后重跑）" ;;
            esac
            continue
          fi
          if [[ "$tgt_layer" != "$src_layer" && "$tgt_idx" -le "$src_idx" ]]; then
            fail "层依赖违规：$f ($src_layer) → $target ($tgt_layer)。仅允许上层依赖下层（${LAYER_ORDER[*]}）"
            found=1
          fi
          ;;
      esac
    done <<< "$imports"
  done < "$tmp_file2layer"

  # ---- 4. 领域层污染检测：领域层不得 import 框架/ORM/Web/IO ----
  if [[ -n "$DOMAIN_LAYER" && ${#DOMAIN_FORBIDDEN_IMPORTS[@]} -gt 0 ]]; then
    local dom_files
    dom_files=$(awk -F'\t' -v l="$DOMAIN_LAYER" '$1==l{print $2}' "$tmp_layer_files")
    if [[ -n "$dom_files" ]]; then
      while IFS= read -r df; do
        [[ -z "$df" ]] && continue
        local ffi
        for ffi in "${DOMAIN_FORBIDDEN_IMPORTS[@]}"; do
          if grep -qE "from ['\"]?${ffi}|import ['\"]?${ffi}|require\(['\"]${ffi}" "$df" 2>/dev/null; then
            fail "领域层污染：$df import 了框架/ORM/IO 模块 '$ffi'（领域层应保持纯业务，不依赖框架）"
            found=1
          fi
        done
      done <<< "$dom_files"
    fi
  fi

  # ---- 5. 循环依赖检测（madge 若装）----
  if has_madge; then
    local circ
    circ=$(madge --circular --extensions ts,js "$PROJECT_DIR" 2>/dev/null || true)
    if echo "$circ" | grep -qi "circular"; then
      fail "检测到循环依赖（madge）："; echo "$circ" | sed 's/^/    /'
      found=1
    fi
  else
    warn "未安装 madge（npm i -g madge），循环依赖检测跳过"
  fi

  # ---- 6. 聚合间直接对象引用检测（聚合应只引用其他聚合的 ID，非对象）----
  if [[ -n "$AGGREGATE_DIR" && -d "$AGGREGATE_DIR" ]]; then
    local aggs; aggs=$(find "$AGGREGATE_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null || true)
    if [[ -n "$aggs" ]]; then
      local ad af
      while IFS= read -r ad; do
        [[ -z "$ad" ]] && continue
        local aname; aname=$(basename "$ad")
        while IFS= read -r af; do
          [[ -z "$af" ]] && continue
          local target
          while IFS= read -r target; do
            [[ -z "$target" ]] && continue
            local other
            while IFS= read -r other; do
              [[ -z "$other" || "$other" == "$aname" ]] && continue
              local other_dir; other_dir=$(cd "$AGGREGATE_DIR/$other" 2>/dev/null && pwd -P || echo "$AGGREGATE_DIR/$other")
              if [[ "$target" == "$other_dir"* ]]; then
                fail "聚合跨边界对象引用：$af ($aname 聚合) 直接 import 了 $other 聚合的内部。聚合间应只引用 ID，不引用对象"
                found=1
              fi
            done < <(find "$AGGREGATE_DIR" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; 2>/dev/null)
          done < <(_resolve_rel_imports "$af")
        done < <(find "$ad" -type f \( -name '*.ts' -o -name '*.js' -o -name '*.py' \) 2>/dev/null)
      done <<< "$aggs"
    fi
  fi

  if [[ $found -eq 0 ]]; then
    pass "分层边界检查通过（无穿透/倒置/领域污染/聚合跨引用）"
  fi
}
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
# gate: compliance
# domain: compliance / enforce: strict / tier: compliance
check_compliance() {
  echo "=== 标准合规矩阵校验（25000.51/8566/8567+9386/安全/国际/门禁姿态）==="
  # 矩阵路径：优先 COMPLIANCE_MATRIX_FILE，缺省探测 SKILL_DIR/references/standards-compliance.md
  local matrix="${COMPLIANCE_MATRIX_FILE:-}"
  if [[ -z "$matrix" ]]; then
    # SKILL_DIR 用 _CONF_DIR（配置加载时已解析为绝对路径，规避 cd 后 $0 相对路径失效）
    local skill_dir cand
    skill_dir=$(cd "${_CONF_DIR}/.." 2>/dev/null && pwd || echo "$PROJECT_DIR")
    cand="${skill_dir}/references/standards-compliance.md"
    [[ -f "$cand" ]] && matrix="$cand"
  fi
  if [[ -z "$matrix" || ! -f "$matrix" ]]; then
    if [[ -n "${COMPLIANCE_MATRIX_FILE:-}" ]]; then
      # 显式配置但文件不存在 → fail-closed
      fail "gate_compliance_matrix_missing: 配置的矩阵文件不存在：${COMPLIANCE_MATRIX_FILE}"
    else
      skip_if_unconfigured "标准合规矩阵未配置（references/standards-compliance.md 缺失）"
    fi
    return
  fi
  local found=0
  # 6 锚点默认集（与 references/standards-compliance.md 锚点契约一致，可用 COMPLIANCE_REQUIRED_SECTIONS 覆盖）
  local anchors=(
    '## A. GB/T 25000.51 八特性 × 门禁映射'
    '## B. GB/T 8566 过程 × 生成流程映射'
    '## C. GB/T 8567+9386 文档包 × 交付物映射'
    '## D. 安全标准 × 门禁映射（等保/三法/38674/34943/39786）'
    '## E. 国际工程标准映射（ISO 5055/SSDF/ASVS/SBOM-SLSA）'
    '## F. 门禁姿态与豁免登记'
  )
  if [[ ${#COMPLIANCE_REQUIRED_SECTIONS[@]} -gt 0 ]]; then
    anchors=("${COMPLIANCE_REQUIRED_SECTIONS[@]}")
  fi
  local a
  for a in "${anchors[@]}"; do
    if ! grep -qF "$a" "$matrix" 2>/dev/null; then
      fail "gate_compliance_anchor_incomplete:${a}: 矩阵缺少锚点章节"
      found=1
    fi
  done
  # 全文占位符扫描（骨架填充残留）
  local ph
  ph=$(grep -nE '待填充|（待填充）|<占位符>|填充指引' "$matrix" 2>/dev/null || true)
  if [[ -n "$ph" ]]; then
    fail "gate_compliance_placeholder: 矩阵存在未填充占位符："
    echo "$ph" | head -10
    found=1
  fi
  # SPEC_FILE 存在时查「## 22. 标准合规」段
  if [[ -n "${SPEC_FILE:-}" && -f "$SPEC_FILE" ]]; then
    if ! grep -qE '^## 22\. 标准合规' "$SPEC_FILE" 2>/dev/null; then
      fail "gate_compliance_spec_section_missing: spec 缺少「## 22. 标准合规」段"
      found=1
    fi
  fi
  # ---- 标准映射表核验（STANDARDS_MAP_FILE 配置或默认探测；文件不存在则跳过）----
  local _smap="${STANDARDS_MAP_FILE:-}"
  if [[ -z "$_smap" ]]; then
    # 默认探测 SKILL_DIR/assets/standards-map.conf（SKILL_DIR 用 _CONF_DIR 推导，同矩阵探测口径）
    local _smap_dir _smap_cand
    _smap_dir=$(cd "${_CONF_DIR}/.." 2>/dev/null && pwd || echo "")
    _smap_cand="${_smap_dir}/assets/standards-map.conf"
    [[ -n "$_smap_dir" && -f "$_smap_cand" ]] && _smap="$_smap_cand"
  fi
  if [[ -n "$_smap" && -f "$_smap" ]]; then
    local _ln_no=0 _bad_fmt="" _bad_conf="" _row _nf _cf
    while IFS= read -r _row || [[ -n "$_row" ]]; do
      _ln_no=$((_ln_no+1))
      case "$_row" in ''|\#*) continue;; esac
      _nf=$(printf '%s\n' "$_row" | awk -F'|' '{print NF}')
      if [[ "$_nf" -ne 5 ]]; then
        _bad_fmt="${_bad_fmt}${_ln_no}行(${_nf}字段) "
        continue
      fi
      _cf=$(printf '%s\n' "$_row" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/,"",$5); print $5}')
      case "$_cf" in high|medium|unverified) ;; *) _bad_conf="${_bad_conf}${_ln_no}行(${_cf}) ";; esac
    done < "$_smap"
    if [[ -n "$_bad_fmt" ]]; then
      fail "gate_compliance_standards_map_format: 标准映射表字段数≠5：${_bad_fmt}（须为 rule|cwe|gb_iso|asvs5|confidence 五字段）"
    fi
    if [[ -n "$_bad_conf" ]]; then
      fail "gate_compliance_standards_map_confidence: 标准映射表 confidence 非法值：${_bad_conf}（仅 high|medium|unverified）"
    fi
    [[ -z "$_bad_fmt" && -z "$_bad_conf" ]] && pass "标准映射表核验通过（${_smap}）"
  fi
  [[ $found -eq 0 ]] && { pass "标准合规矩阵校验通过（锚点齐备，无占位符）"; return 0; }
}
# gate: sbom
# domain: security / enforce: strict / tier: compliance
check_sbom() {
  echo "=== SBOM 物料清单与许可证扫描 ==="
  if [[ "${SBOM_REQUIRED:-0}" != "1" ]]; then
    if [[ -n "${SBOM_EXEMPT_REASON:-}" ]]; then
      warn "SBOM 检查已豁免（${SBOM_EXEMPT_REASON}）——fail-closed：豁免须显式声明理由"
    else
      fail "gate_sbom_unconfigured: SBOM_REQUIRED 未启用且无豁免理由——安全门禁须显式配置（SBOM_REQUIRED=1）或填写 SBOM_EXEMPT_REASON 豁免理由（数安法第27条/SLSA供应链要求）"
    fi
    return
  fi
  local out_dir="${SBOM_OUTPUT_DIR:-.sbom}"
  local ts sbom_file lic_file
  ts=$(date -u '+%Y%m%d-%H%M%S')
  sbom_file="${out_dir}/sbom-${ts}.txt"
  lic_file="${out_dir}/licenses-${ts}.txt"
  mkdir -p "$out_dir" 2>/dev/null || true
  local generated=0 tool="${SBOM_TOOL:-}"
  # 工具降级链：$SBOM_TOOL → syft → cdxgen → 内置 lockfile 解析
  # SBOM_TOOL=none：显式屏蔽外部工具，强制走内置 lockfile 解析（无工具链环境依赖的确定性路径，
  # 修 fixture 环境依赖遗留——机器装有 syft/cdxgen 时 fixture 结果不应漂移）
  if [[ "$tool" == "none" ]]; then
    tool=""
  elif [[ -z "$tool" ]]; then
    if command -v syft >/dev/null 2>&1; then tool="syft"
    elif command -v cdxgen >/dev/null 2>&1; then tool="cdxgen"
    fi
  fi
  if [[ -n "$tool" ]] && command -v "$tool" >/dev/null 2>&1; then
    case "$tool" in
      syft) syft "dir:${PROJECT_DIR:-.}" -o text > "$sbom_file" 2>/dev/null || true ;;
      cdxgen) cdxgen -o "$sbom_file" 2>/dev/null || true ;;
      *) "$tool" > "$sbom_file" 2>/dev/null || true ;;
    esac
    [[ -s "$sbom_file" ]] && generated=1
  fi
  if [[ $generated -eq 0 ]]; then
    # 内置 lockfile 解析（无外部工具时降级）：提取依赖名+版本
    local locks="" lf
    for lf in package-lock.json yarn.lock pnpm-lock.yaml go.sum requirements.txt pom.xml; do
      [[ -f "$lf" ]] && locks="${locks} ${lf}"
    done
    if [[ -z "$locks" ]]; then
      # 无工具且无 lockfile → fail-closed
      fail "gate_sbom_toolchain_unavailable: 无 SBOM 工具（syft/cdxgen）且未找到 lockfile，无法生成 SBOM"
      return
    fi
    : > "$sbom_file"
    for lf in $locks; do
      echo "# ${lf}" >> "$sbom_file"
      case "$lf" in
        package-lock.json)
          grep -oE '"node_modules/[^"]+"' "$lf" 2>/dev/null | sed 's/"node_modules\///; s/"$//' | sort -u >> "$sbom_file" || true ;;
        yarn.lock|pnpm-lock.yaml)
          grep -E '^[^#[:space:]][^:]*:' "$lf" 2>/dev/null | sed 's/["'\'']//g; s/:$//' | sort -u >> "$sbom_file" || true ;;
        go.sum)
          awk '{print $1" "$2}' "$lf" 2>/dev/null | sort -u >> "$sbom_file" || true ;;
        requirements.txt)
          grep -vE '^[[:space:]]*(#|$)' "$lf" 2>/dev/null >> "$sbom_file" || true ;;
        pom.xml)
          grep -oE '<artifactId>[^<]+</artifactId>' "$lf" 2>/dev/null | sed 's/<[^>]*>//g' | sort -u >> "$sbom_file" || true ;;
      esac
    done
    generated=1
  fi
  # R118：空 SBOM（只有 # lockfile 头、零依赖条目）不得当“已生成”放行。
  local _sbom_entries
  _sbom_entries=$(grep -cvE '^[[:space:]]*(#|$)' "$sbom_file" 2>/dev/null || true)
  _sbom_entries=$(_norm_int "${_sbom_entries:-0}")
  if [[ "$_sbom_entries" -eq 0 ]]; then
    fail "gate_sbom_empty: SBOM 未解析出任何依赖条目（${sbom_file}）"
    return
  fi
  # license 提取：node_modules 下 package.json 的 license/licenses 字段。
  # R118：深度 2→3 覆盖 @scope/pkg；同时支持 "licenses": [{"type": ...}] 形态。
  : > "$lic_file"
  if [[ -d node_modules ]]; then
    find node_modules -maxdepth 3 -name package.json 2>/dev/null | while read -r pj; do
      local nm lic
      nm=$(grep -oE '"name"[[:space:]]*:[[:space:]]*"[^"]+"' "$pj" 2>/dev/null | head -1 | sed 's/.*: *"//; s/"$//')
      lic=$(grep -oE '"license"[[:space:]]*:[[:space:]]*"[^"]+"' "$pj" 2>/dev/null | head -1 | sed 's/.*: *"//; s/"$//')
      if [[ -z "$lic" ]]; then
        lic=$(grep -oE '"type"[[:space:]]*:[[:space:]]*"[^"]+"' "$pj" 2>/dev/null | head -1 | sed 's/.*: *"//; s/"$//')
      fi
      [[ -n "$lic" ]] && echo "${nm:-unknown} ${lic}" >> "$lic_file"
    done
  fi
  # 许可证豁免：对象|规则|理由|审批人|日期（对象=包名；规则=块名单词或 license/*）
  _sbom_exempted() {
    local ex obj rule
    for ex in "${SBOM_LICENSE_EXEMPTIONS[@]+"${SBOM_LICENSE_EXEMPTIONS[@]}"}"; do
      obj=$(printf '%s\n' "$ex" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/,"",$1); print $1}')
      rule=$(printf '%s\n' "$ex" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2}')
      [[ "$obj" == "$1" ]] || continue
      [[ "$rule" == "$2" || "$rule" == "license" || "$rule" == "*" ]] && return 0
    done
    return 1
  }
  # 许可证块名单扫描（license 清单 + SBOM 产物）
  local found=0 b hits _lic_line _lic_pkg
  if [[ ${#SBOM_LICENSE_BLOCKLIST[@]} -gt 0 ]]; then
    for b in "${SBOM_LICENSE_BLOCKLIST[@]}"; do
      hits=$(grep -iE "$b" "$lic_file" 2>/dev/null || true)
      if [[ -n "$hits" ]]; then
        while IFS= read -r _lic_line; do
          [[ -n "$_lic_line" ]] || continue
          _lic_pkg="${_lic_line%% *}"
          if _sbom_exempted "$_lic_pkg" "$b"; then
            warn "gate_sbom_license_exempted:${_lic_pkg}: 命中许可证块名单「${b}」但已登记豁免（${_lic_line}）"
          else
            fail "gate_sbom_license_blocked:${_lic_pkg}: 命中许可证块名单「${b}」（${_lic_line}）"
            found=1
          fi
        done <<< "$hits"
      fi
    done
    if [[ ! -s "$lic_file" ]]; then
      # 非 fail 的观测项不带 gate_ 前缀：gate_sbom 是 compliant fixture 的禁中前缀。
      warn "sbom_license_evidence_missing: 未提取到许可证数据（node_modules 不存在或依赖无 license 字段），块名单未实际执行"
    fi
  fi
  # 豁免登记：5 字段（对象|规则|理由|审批人|日期）校验 + 回显
  if [[ ${#SBOM_LICENSE_EXEMPTIONS[@]} -gt 0 ]]; then
    local ex nf
    for ex in "${SBOM_LICENSE_EXEMPTIONS[@]}"; do
      nf=$(awk -F'|' '{print NF}' <<< "$ex")
      if [[ "$nf" -ne 5 ]]; then
        fail "gate_sbom_exemption_invalid: 豁免须为 5 字段（对象|规则|理由|审批人|日期）：${ex}"
        found=1
      else
        echo "  ⓘ 豁免登记：${ex}"
      fi
    done
  fi
  # B 方向：CVE 漏洞阈值门禁（SCA 补全）——SBOM 生成后 grype --fail-on 扫描，超阈值 fail。
  # 姿态：skip_if_unconfigured（CVE_THRESHOLD 未配置静默跳过）→ 配置后 fail-closed。
  # 工具降级链 grype → osv-scanner（仅提示，无阈值判定能力）→ warn 跳过（fail-open 风险如实披露）。
  if [[ -n "${CVE_THRESHOLD:-}" && -s "$sbom_file" ]]; then
    if command -v grype >/dev/null 2>&1; then
      trace_tool "grype" "sbom cve scan"
      if ! grype "sbom:${sbom_file}" --fail-on "$CVE_THRESHOLD" >/dev/null 2>&1; then
        fail "gate_sbom_cve_threshold: SBOM 检出 ≥${CVE_THRESHOLD} 级 CVE（grype --fail-on ${CVE_THRESHOLD}；豁免须 5 字段留痕 CVE_EXEMPTIONS）"
        found=1
      fi
    elif command -v osv-scanner >/dev/null 2>&1; then
      trace_tool "osv-scanner" "sbom cve scan"
      osv-scanner --sbom="$sbom_file" >/dev/null 2>&1 || true
      warn "grype 不可用，降级 osv-scanner（无阈值判定能力，结果须人工复核阈值）"
    else
      warn "CVE_THRESHOLD=${CVE_THRESHOLD} 已配置但 grype/osv-scanner 均不可用，跳过漏洞扫描（fail-open 风险如实披露）"
    fi
  fi
  # CVE 豁免登记：5 字段（对象|规则|理由|审批人|日期）校验 + 回显（与许可证豁免同机制）
  # bash 3.2 + set -u：CVE_EXEMPTIONS 可能未声明（conf 默认注释），先判声明再取长度
  if [[ -n "${CVE_EXEMPTIONS+x}" && ${#CVE_EXEMPTIONS[@]} -gt 0 ]]; then
    local cex cnf
    for cex in "${CVE_EXEMPTIONS[@]}"; do
      cnf=$(awk -F'|' '{print NF}' <<< "$cex")
      if [[ "$cnf" -ne 5 ]]; then
        fail "gate_sbom_cve_exemption_invalid: CVE 豁免须为 5 字段（对象|规则|理由|审批人|日期）：${cex}"
        found=1
      else
        echo "  ⓘ CVE 豁免登记：${cex}"
      fi
    done
  fi
  if [[ $found -eq 0 ]]; then
    if [[ ${#SBOM_LICENSE_BLOCKLIST[@]} -gt 0 && ! -s "$lic_file" ]]; then
      pass "SBOM 已生成：${sbom_file}（未提取到许可证数据，块名单未执行；证据归档）"
    else
      pass "SBOM 已生成：${sbom_file}（许可证块名单未命中或已豁免，证据归档）"
    fi
  fi
}
# gate: privacy
# domain: security / enforce: strict / tier: compliance
check_privacy() {
  echo "=== 个人信息（PII）扫描（个保法 / GB/T 35273）==="
  [[ ${#PRIVACY_SCAN_DIRS[@]} -eq 0 ]] && { skip_if_unconfigured "PRIVACY_SCAN_DIRS 未配置"; return; }
  # 配置目录全不存在 → fail-closed
  local existing=() d
  for d in "${PRIVACY_SCAN_DIRS[@]}"; do
    [[ -d "$d" ]] && existing+=("$d")
  done
  if [[ ${#existing[@]} -eq 0 ]]; then
    fail "gate_privacy_dirs_missing: PRIVACY_SCAN_DIRS 配置的目录全部不存在：${PRIVACY_SCAN_DIRS[*]}"
    return
  fi
  # 内置 ERE：18 位身份证 / 手机号 / 16-19 位银行卡
  local patterns=(
    '[1-9][0-9]{5}(19|20)[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[0-9]{3}[0-9Xx]'
    '1[3-9][0-9]{9}'
    '[0-9]{16,19}'
  )
  if [[ ${#PRIVACY_EXTRA_PATTERNS[@]} -gt 0 ]]; then
    patterns+=("${PRIVACY_EXTRA_PATTERNS[@]}")
  fi
  # R118：配置的非法 ERE 不得被 2>/dev/null 吞成“无命中”。扫描前逐条校验。
  local _pv_pat
  for _pv_pat in "${patterns[@]}"; do
    if ! _regex_is_valid "$_pv_pat"; then
      fail "gate_privacy_invalid_pattern: PRIVACY_EXTRA_PATTERNS 含非法 ERE：${_pv_pat}"
      return
    fi
  done
  local found=0 pat kw hits pii_files=""
  # R126-G9：PRIVACY_SCAN_DIRS 配 "." 时原实现全量扫 .git/node_modules——16-19 位数字
  # 规则命中锁文件哈希/依赖包内文本，PII 假阳性淹没真发现且是全门禁族最慢的一次扫描。
  # 对齐 check_security 的目录排除纪律（_sec_scan 恒排 .git/node_modules）。
  local _pv_xdirs=(--exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=target --exclude-dir=.swarm-yuan)
  for d in "${existing[@]}"; do
    for pat in "${patterns[@]}"; do
      # 滤 example/mock/dummy/placeholder/样例 噪声行；-I 跳过二进制
      hits=$(grep -rnIE "${_pv_xdirs[@]}" "$pat" "$d" 2>/dev/null | grep -viE 'example|mock|dummy|placeholder|样例' || true)
      [[ -n "$hits" ]] && pii_files="${pii_files}$(echo "$hits" | cut -d: -f1)
"
    done
    # 敏感关键词（固定串、忽略大小写）
    if [[ ${#PRIVACY_SENSITIVE_KEYWORDS[@]} -gt 0 ]]; then
      for kw in "${PRIVACY_SENSITIVE_KEYWORDS[@]}"; do
        hits=$(grep -rniF "${_pv_xdirs[@]}" "$kw" "$d" 2>/dev/null | grep -viE 'example|mock|dummy|placeholder|样例' || true)
        [[ -n "$hits" ]] && pii_files="${pii_files}$(echo "$hits" | cut -d: -f1)
"
      done
    fi
  done
  # 隐私豁免：对象|规则|理由|审批人|日期（对象=文件路径或文件名；规则=pii/privacy/*）
  _privacy_exempted() {
    local ex obj rule
    for ex in "${PRIVACY_EXEMPTIONS[@]+"${PRIVACY_EXEMPTIONS[@]}"}"; do
      obj=$(printf '%s\n' "$ex" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/,"",$1); print $1}')
      rule=$(printf '%s\n' "$ex" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2}')
      [[ "$obj" == "$1" || "$obj" == "$(basename "$1")" ]] || continue
      [[ -z "$rule" || "$rule" == "pii" || "$rule" == "privacy" || "$rule" == "*" ]] && return 0
    done
    return 1
  }
  # 按文件聚合去重后逐文件判定；命中豁免的降为 warn（旧版只回显登记行，豁免不生效）
  local _pii_exempted_n=0
  if [[ -n "$pii_files" ]]; then
    local f
    while IFS= read -r f; do
      [[ -n "$f" ]] || continue
      if _privacy_exempted "$f"; then
        warn "gate_privacy_pii_exempted:${f}: 疑似个人信息命中，但已登记 PRIVACY_EXEMPTIONS 豁免"
        _pii_exempted_n=$((_pii_exempted_n+1))
      else
        fail "gate_privacy_pii_found:${f}: 疑似个人信息命中（身份证/手机号/银行卡/敏感关键词）"
        found=1
      fi
    done <<< "$(printf '%s' "$pii_files" | sort -u)"
  fi
  # 豁免登记：5 字段（对象|规则|理由|审批人|日期）校验 + 回显
  if [[ ${#PRIVACY_EXEMPTIONS[@]} -gt 0 ]]; then
    local ex nf
    for ex in "${PRIVACY_EXEMPTIONS[@]}"; do
      nf=$(awk -F'|' '{print NF}' <<< "$ex")
      if [[ "$nf" -ne 5 ]]; then
        fail "gate_privacy_exemption_invalid: 豁免须为 5 字段（对象|规则|理由|审批人|日期）：${ex}"
        found=1
      else
        echo "  ⓘ 豁免登记：${ex}"
      fi
    done
  fi
  if [[ $found -eq 0 ]]; then
    if [[ "$_pii_exempted_n" -gt 0 ]]; then
      pass "未发现未豁免的个人信息泄露风险（${_pii_exempted_n} 个文件已按 PRIVACY_EXEMPTIONS 豁免）"
    else
      pass "未发现个人信息泄露风险"
    fi
  fi
}
# gate: authz
# domain: security / enforce: strict / tier: compliance
check_authz() {
  echo "=== 授权类弱点检查（CWE-862/863/639/284：服务端授权覆盖）==="
  [[ ${#AUTHZ_SCAN_DIRS[@]} -eq 0 ]] && { skip_if_unconfigured "AUTHZ_SCAN_DIRS 未配置"; return; }
  # R118：配置的目录全部不存在=配置错误，不得 warn 后打印“通过”。
  local found=0 d f hits files pat existing=0
  for d in "${AUTHZ_SCAN_DIRS[@]}"; do
    [[ -d "$d" ]] && existing=$((existing+1))
  done
  if [[ "$existing" -eq 0 ]]; then
    fail "gate_authz_dirs_missing: AUTHZ_SCAN_DIRS 配置的目录全部不存在：${AUTHZ_SCAN_DIRS[*]}"
    return
  fi
  # 用户自定义授权正则先校验，非法 ERE 直接 fail（不能静默当无命中）。
  for pat in "${AUTHZ_EXTRA_PATTERNS[@]+"${AUTHZ_EXTRA_PATTERNS[@]}"}"; do
    [[ -z "$pat" ]] && continue
    if ! _regex_is_valid "$pat"; then
      fail "gate_authz_invalid_pattern: AUTHZ_EXTRA_PATTERNS 含非法 ERE：${pat}"
      return
    fi
  done
  local inc=(--include='*.java' --include='*.kt' --include='*.ts' --include='*.js' --include='*.py')
  for d in "${AUTHZ_SCAN_DIRS[@]}"; do
    if [[ ! -d "$d" ]]; then
      warn "AUTHZ_SCAN_DIRS 目录不存在：${d}（跳过该目录）"
      continue
    fi
    # —— 1. 敏感操作缺鉴权注解（粗放：文件含请求映射方法但全文无鉴权注解/安全配置声明）
    # R118：Spring Security 的标准做法是集中式 SecurityFilterChain；控制器无注解不等于未授权。
    # 先探测扫描面内是否存在集中式安全配置，存在时把“同文件无注解”降为 warn（须人工确认路由覆盖）。
    local _authz_central=0
    if grep -rqE '@EnableWebSecurity|SecurityFilterChain|WebSecurityConfigurerAdapter' "$d" "${inc[@]}" 2>/dev/null; then
      _authz_central=1
    fi
    files=$(grep -rlE '@(Get|Post|Put|Delete|Patch|Request)Mapping|@(app|router)\.(get|post|put|delete|patch)\(' "$d" "${inc[@]}" 2>/dev/null \
      | grep -viE 'node_modules|(^|/)(tests?|testdata|__tests__|fixtures?|mocks?)/|\.(test|spec)\.[a-z]+:' || true)
    while IFS= read -r f; do
      [[ -z "$f" ]] && continue
      if ! grep -qE '@PreAuthorize|@Secured|@RolesAllowed|SecurityFilter|@EnableWebSecurity|@RequiresPermissions|@PreAuth|@login_required|@jwt_required|Depends\([^)]*(auth|user|permission)' "$f" 2>/dev/null; then
        if [[ "$_authz_central" -eq 1 ]]; then
          warn "gate_authz_missing_check:${f}: 控制器无方法级鉴权注解，但扫描面存在集中式安全配置——须人工确认该路由被覆盖（CWE-862）"
        else
          fail "gate_authz_missing_check:${f}: 控制器含请求映射但无鉴权注解/安全配置（CWE-862 缺失授权）"
          found=1
        fi
      fi
    done <<< "$files"
    # —— 2. IDOR 风险：findById(request.…) / findById(…getParameter(…)) 用户可控主键直取 → fail
    hits=$(grep -rnE 'findById\(\s*request\.|findById\([^)]*getParameter\(' "$d" "${inc[@]}" 2>/dev/null \
      | grep -viE 'test|mock|node_modules' || true)
    if [[ -n "$hits" ]]; then
      while IFS= read -r f; do
        [[ -n "$f" ]] && fail "gate_authz_idor:${f}: 用户可控主键直取对象（IDOR 风险，CWE-639）"
      done <<< "$(printf '%s\n' "$hits" | cut -d: -f1 | sort -u)"
      found=1
    fi
    # —— 3. CORS 全放行且带凭据（allowedOrigins("*") 与 allowCredentials(true) 同文件并存）→ fail
    files=$(grep -rlE 'allowedOrigins\(\s*"\*"\s*\)|allowedOriginPatterns\(\s*"\*"\s*\)' "$d" "${inc[@]}" 2>/dev/null \
      | grep -viE 'test|mock|node_modules' || true)
    while IFS= read -r f; do
      [[ -z "$f" ]] && continue
      if grep -qE 'allowCredentials\(\s*true\s*\)' "$f" 2>/dev/null; then
        fail "gate_authz_permissive:${f}: CORS allowedOrigins(\"*\") 且 allowCredentials(true)（CWE-284 不当访问控制）"
        found=1
      fi
    done <<< "$files"
    # —— 4. permitAll() 全放行 → warn-only（可能为有意公开端点，须人工复核，不计 fail）
    hits=$(grep -rnE 'permitAll\(\)' "$d" "${inc[@]}" 2>/dev/null \
      | grep -viE 'test|mock|node_modules' || true)
    if [[ -n "$hits" ]]; then
      warn "permitAll() 全放行 $(printf '%s\n' "$hits" | wc -l | xargs) 处（warn-only，确认均为有意公开端点）："
      printf '%s\n' "$hits" | head -5 | sed 's/^/    /'
    fi
    # —— 5. 自定义授权风险模式（AUTHZ_EXTRA_PATTERNS）→ warn-only
    if [[ ${#AUTHZ_EXTRA_PATTERNS[@]} -gt 0 ]]; then
      for pat in "${AUTHZ_EXTRA_PATTERNS[@]}"; do
        [[ -z "$pat" ]] && continue
        hits=$(grep -rnE "$pat" "$d" "${inc[@]}" 2>/dev/null | grep -viE 'test|mock|node_modules' || true)
        if [[ -n "$hits" ]]; then
          warn "授权自定义模式命中（warn-only，须人工复核）：${pat}"
          printf '%s\n' "$hits" | head -5 | sed 's/^/    /'
        fi
      done
    fi
  done
  echo "  提示: 授权铁律——服务端每个 API 默认拒绝、显式授权（OWASP ASVS V8 / CWE Top25:2025 授权类四弱点）"
  if [[ $found -eq 0 ]]; then
    pass "授权类弱点检查通过（fail 项未命中；warn 项请人工复核）"
  fi
}
# gate: crypto
# domain: security / enforce: strict / tier: compliance
check_crypto() {
  echo "=== 密码算法合规检查（GB/T 39786-2021 密评，国密白名单 SM2/SM3/SM4）==="
  local profile="${CRYPTO_PROFILE:-}"
  if [[ -z "$profile" ]]; then
    if [[ -n "${CRYPTO_EXEMPT_REASON:-}" ]]; then
      warn "密码算法检查已豁免（${CRYPTO_EXEMPT_REASON}）——fail-closed：豁免须显式声明理由"
    else
      fail "gate_crypto_unconfigured: CRYPTO_PROFILE 未配置且无豁免理由——安全门禁须显式配置（CRYPTO_PROFILE=gm）或填写 CRYPTO_EXEMPT_REASON 豁免理由（GB/T 39786-2021 密评）"
    fi
    return
  fi
  if [[ "$profile" != "gm" ]]; then
    warn "未知 CRYPTO_PROFILE：${profile}（当前仅内置 gm=GB/T 39786-2021 密评弱算法扫描），未执行"
    return
  fi
  local found=0 d f hits files _crypto_existing=0
  if [[ ${#CRYPTO_SCAN_DIRS[@]} -eq 0 ]]; then
    # R118：profile 已启用（gm）却无扫描目录=配置错误，不得静默 pass（旧版仅 warn）。
    fail "gate_crypto_scan_dirs_missing: CRYPTO_PROFILE=${profile} 已启用但 CRYPTO_SCAN_DIRS 未配置"
    return
  fi
  for d in "${CRYPTO_SCAN_DIRS[@]}"; do
    [[ -d "$d" ]] && _crypto_existing=$((_crypto_existing+1))
  done
  if [[ "$_crypto_existing" -eq 0 ]]; then
    fail "gate_crypto_scan_dirs_missing: CRYPTO_SCAN_DIRS 配置的目录全部不存在：${CRYPTO_SCAN_DIRS[*]}"
    return
  fi
  local inc=(--include='*.java' --include='*.kt' --include='*.ts' --include='*.js' --include='*.py' --include='*.go')
  for d in ${CRYPTO_SCAN_DIRS[@]+"${CRYPTO_SCAN_DIRS[@]}"}; do
    if [[ ! -d "$d" ]]; then
      warn "CRYPTO_SCAN_DIRS 目录不存在：${d}（跳过该目录）"
      continue
    fi
    # 弱算法 ERE（\b 词界防 SHA1PRNG/DESede 误命中）；滤 example/mock 噪声与注释行
    hits=$(grep -rnE '\bMD5\b|\bSHA1\b|\bDES\b|RSA[-_]?1024|\bECDSA\b' "$d" "${inc[@]}" 2>/dev/null \
      | grep -viE 'example|mock|node_modules' \
      | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|#|\*|/\*)' || true)
    if [[ -n "$hits" ]]; then
      files=$(printf '%s\n' "$hits" | cut -d: -f1 | sort -u)
      while IFS= read -r f; do
        [[ -n "$f" ]] && fail "gate_crypto_weak_algorithm:${f}: 检出弱密码算法（MD5/SHA1/DES/RSA-1024/ECDSA；GB/T 39786 密评应用 SM2/SM3/SM4 白名单）"
      done <<< "$files"
      printf '%s\n' "$hits" | head -10 | sed 's/^/    /'
      found=1
    fi
  done
  # B 方向：国密正向使用核查（warn 级——加密场景判断难自动化，不 fail 避免误报淹没；
  # 依据 references/crypto-spec.md §3 国密选型；机构密评测评仍属线下）
  local _enc_use _gm_use _rng_hit
  for d in ${CRYPTO_SCAN_DIRS[@]+"${CRYPTO_SCAN_DIRS[@]}"}; do
    [[ -d "$d" ]] || continue
    # 国密正向核查：检测到加密操作但全目录无 SM2/SM3/SM4 引用 → warn
    _enc_use=$(grep -rlE '\bencrypt\b|\bdecrypt\b|加密|解密' "$d" "${inc[@]}" 2>/dev/null \
      | grep -viE 'example|mock|node_modules' | head -1 || true)
    _gm_use=$(grep -rlE '\bSM2\b|\bSM3\b|\bSM4\b' "$d" "${inc[@]}" 2>/dev/null \
      | grep -viE 'example|mock|node_modules' | head -1 || true)
    if [[ -n "$_enc_use" && -z "$_gm_use" ]]; then
      warn "gate_crypto_gm_positive: 检测到加密操作但未使用国密算法（GB/T 39786 密评场景须 SM2/SM3/SM4）：${_enc_use}"
    fi
    # 随机数质量：安全上下文（password/token/secret/key/加密 同行）使用弱随机数 → warn
    _rng_hit=$(grep -rnE 'Math\.random|\brand[[:space:]]*\(' "$d" --include='*.js' --include='*.ts' --include='*.py' 2>/dev/null \
      | grep -viE 'example|mock|node_modules' | grep -iE 'password|token|secret|key|加密' | head -1 || true)
    [[ -n "$_rng_hit" ]] && warn "gate_crypto_weak_rng: 安全上下文使用弱随机数（Math.random/rand），安全场景须 CSPRNG：${_rng_hit}"
  done
  if [[ $found -eq 0 ]]; then
    pass "密码算法合规检查通过（未检出弱算法；国密白名单 SM2/SM3/SM4）"
  fi
}
# gate: dengbao
# domain: compliance / enforce: strict / tier: compliance
check_dengbao() {
  echo "=== 等级保护 2.0 控制点映射检查（GB/T 22239-2019 安全计算环境/安全建设管理）==="
  local level="${DENGBAO_LEVEL:-}"
  if [[ -z "$level" ]]; then
    if [[ -n "${DENGBAO_EXEMPT_REASON:-}" ]]; then
      warn "等保检查已豁免（${DENGBAO_EXEMPT_REASON}）——fail-closed：豁免须显式声明理由"
    else
      fail "gate_dengbao_unconfigured: DENGBAO_LEVEL 未配置且无豁免理由——安全门禁须显式配置（DENGBAO_LEVEL=2/3）或填写 DENGBAO_EXEMPT_REASON 豁免理由（GB/T 22239-2019 等保 2.0 / 数安法第27条）"
    fi
    return
  fi
  if [[ "$level" != "2" && "$level" != "3" && "$level" != "4" ]]; then
    # R118：未知枚举=配置错误，不得当“未执行”静默放行（拼写错误会关闭安全门禁）。
    fail "gate_dengbao_invalid_level: 未知 DENGBAO_LEVEL：${level}（仅支持 2/3/4）"
    return
  fi
  local found=0
  # 豁免登记（四字段：规则id|理由|审批人|日期；空理由视为无效豁免不降级）
  local _exempt=""
  if [[ -n "${DENGBAO_EXEMPT_FILE:-}" && -f "${DENGBAO_EXEMPT_FILE}" ]]; then
    _exempt=$(awk -F'|' '!/^[[:space:]]*(#|$)/ { r=$2; gsub(/^[ \t]+|[ \t]+$/,"",r); if (r != "") { id=$1; gsub(/^[ \t]+|[ \t]+$/,"",id); print id } }' "$DENGBAO_EXEMPT_FILE" 2>/dev/null || true)
  fi
  _db_exempted() { printf '%s\n' "$_exempt" | grep -qF "$1"; }
  # 扫描目录就绪性（与 --crypto 同姿态：启用但留空 → warn 披露）
  # R126-G6：DENGBAO_SCAN_DIRS 不在 _default_conf 兜底面，conf 未声明时 set -u 下
  # ${#ARR[@]} 直接崩（rc=127，`|| true` 救不了）——补 +x 守卫对齐 1495 行同函数内既有写法。
  if [[ -z "${DENGBAO_SCAN_DIRS[*]+x}" || "${#DENGBAO_SCAN_DIRS[@]}" -eq 0 ]]; then
    warn "DENGBAO_SCAN_DIRS 未配置，MFA/审计代码证据扫描未执行（fail-open 风险）"
  fi
  local _scan_hits
  _scan_hits() { # $1=ERE；stdout=命中行（跨目录聚合，滤注释行与 example/mock）
    local d
    for d in ${DENGBAO_SCAN_DIRS[@]+"${DENGBAO_SCAN_DIRS[@]}"}; do
      [[ -d "$d" ]] || continue
      grep -rnE "$1" "$d" --include='*.java' --include='*.kt' --include='*.ts' --include='*.js' --include='*.py' --include='*.go' 2>/dev/null \
        | grep -viE 'example|mock|node_modules' \
        | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|#|\*|/\*)' || true
    done
  }
  # ① 双因子鉴别（三级起强制：两种及以上组合且至少一种密码技术；GB/T 22239-2019 三级安全计算环境）
  #    四级增量：三种及以上组合鉴别（9.1.4.1），全部基于密码技术
  if [[ "$level" == "3" || "$level" == "4" ]]; then
    local _mfa
    _mfa=$(_scan_hits 'TOTP|GoogleAuthenticator|twoFactor|two_factor|2FA|\bMFA\b|\bOTP\b|短信验证码|动态口令')
    if [[ -z "$_mfa" ]]; then
      if _db_exempted gate_dengbao_mfa; then
        warn "gate_dengbao_mfa: 未检出双因子鉴别证据（已豁免留痕：${DENGBAO_EXEMPT_FILE}）"
      else
        fail "gate_dengbao_mfa: 等保${level}级要求${level}种及以上组合鉴别（口令+密码技术/生物技术等）——DENGBAO_SCAN_DIRS 内未检出 TOTP/OTP/MFA/短信验证码等证据（GB/T 22239-2019）"
        found=1
      fi
    fi
  fi
  # ② 安全审计存在性（二级 warn / 三级 fail）
  local _audit
  _audit=$(_scan_hits 'audit|Audit|审计')
  if [[ -z "$_audit" ]]; then
    if [[ "$level" == "3" || "$level" == "4" ]]; then
      if _db_exempted gate_dengbao_audit_missing; then
        warn "gate_dengbao_audit_missing: 未检出安全审计日志调用（已豁免留痕）"
      else
        fail "gate_dengbao_audit_missing: 未检出安全审计日志调用（audit/审计）——等保${level}级安全审计控制点要求记录并保护审计记录（GB/T 22239-2019）"
        found=1
      fi
    else
      warn "未检出安全审计日志调用（audit/审计）——等保二级建议补审计记录（GB/T 22239-2019）"
    fi
  fi
  # ③ 审计字段四要素声明（spec §23.2：日期时间/用户/事件类型/事件是否成功）
  local _spec="${SPEC_FILE:-}"
  if [[ -z "$_spec" || ! -f "$_spec" ]]; then
    if _db_exempted gate_dengbao_audit_fields; then
      warn "gate_dengbao_audit_fields: SPEC_FILE 未配置（已豁免留痕）"
    else
      fail "gate_dengbao_audit_fields: SPEC_FILE 未配置或不存在——无法核验审计字段四要素声明（spec §23.2 须声明：日期时间/用户/事件类型/事件是否成功）"
      found=1
    fi
  else
    local _fmiss=""
    grep -qF '日期时间' "$_spec" 2>/dev/null || _fmiss="${_fmiss}日期时间 "
    grep -qF '用户' "$_spec" 2>/dev/null || _fmiss="${_fmiss}用户 "
    grep -qF '事件类型' "$_spec" 2>/dev/null || _fmiss="${_fmiss}事件类型 "
    grep -qE '事件是否成功|成功与否' "$_spec" 2>/dev/null || _fmiss="${_fmiss}事件是否成功 "
    if [[ -n "$_fmiss" ]]; then
      if _db_exempted gate_dengbao_audit_fields; then
        warn "gate_dengbao_audit_fields: spec 审计字段声明缺：${_fmiss}（已豁免留痕）"
      else
        fail "gate_dengbao_audit_fields: spec §23.2 审计字段声明缺要素：${_fmiss}（GB/T 22239-2019：审计记录应包括事件的日期和时间、用户、事件类型、事件是否成功及其他审计相关信息）"
        found=1
      fi
    fi
    # ④ 等保级别一致性（spec 声明级别 vs DENGBAO_LEVEL）
    local _spec_lv
    _spec_lv=$(grep -oE '等保[^0-9]*[234]级' "$_spec" 2>/dev/null | grep -oE '[234]' | head -1 || true)
    if [[ -z "$_spec_lv" ]]; then
      warn "spec §23.2 未声明等保级别（建议补充「等保级别：X 级」）"
    elif [[ "$_spec_lv" != "$level" ]]; then
      if _db_exempted gate_dengbao_level_mismatch; then
        warn "gate_dengbao_level_mismatch: spec 声明 ${_spec_lv} 级 vs DENGBAO_LEVEL=${level}（已豁免留痕）"
      else
        fail "gate_dengbao_level_mismatch: spec 声明等保 ${_spec_lv} 级与 DENGBAO_LEVEL=${level} 不一致——立法（spec）与执法（conf）必须同源"
        found=1
      fi
    fi
  fi
  # ⑤ 个人信息保护勾稽（二级起要求；--privacy 须在配）
  if [[ ${#PRIVACY_SCAN_DIRS[@]} -eq 0 ]]; then
    if _db_exempted gate_dengbao_privacy_unconfigured; then
      warn "gate_dengbao_privacy_unconfigured: PRIVACY_SCAN_DIRS 未配置（已豁免留痕）"
    else
      fail "gate_dengbao_privacy_unconfigured: PRIVACY_SCAN_DIRS 未配置——等保二级起要求个人信息保护，须启用 --privacy 扫描（GB/T 22239-2019 个人信息保护控制点）"
      found=1
    fi
  fi
  # ⑥ 剩余信息保护（warn-only：敏感数据清除证据）
  local _resid
  _resid=$(_scan_hits 'Arrays\.fill|shred|secureErase|SecureRandom|清除敏感|内存清零')
  [[ -z "$_resid" ]] && warn "未检出剩余信息保护证据（敏感数据存储空间清除/释放，如 Arrays.fill/shred）——建议人工核对（GB/T 22239-2019 剩余信息保护）"
  # ⑦ 四级增量检查（9.1.4.x）：国密 SM4 加密传输+存储 + 异地灾备声明 + 可信验证提示
  if [[ "$level" == "4" ]]; then
    # 数据保密性：国密 SM4（9.1.4.8）
    local _sm4
    _sm4=$(_scan_hits '\bSM4\b|国密.*加密|hutool.*Sm4|bcprov.*SM4')
    if [[ -z "$_sm4" ]]; then
      if _db_exempted gate_dengbao4_sm4; then
        warn "gate_dengbao4_sm4: 未检出 SM4 国密加密证据（已豁免留痕）"
      else
        fail "gate_dengbao4_sm4: 等保四级要求国密 SM4 加密传输+存储（9.1.4.8）——DENGBAO_SCAN_DIRS 内未检出 SM4 证据（配 CRYPTO_PROFILE=gm 启用 --crypto 联检）"
        found=1
      fi
    fi
    # 灾备恢复等级 ≥4 声明（9.1.4.9 联动 BCP5级）
    if [[ -n "$_spec" && -f "$_spec" ]]; then
      if ! grep -qE '灾备.*[4-6]级|灾难恢复.*[4-6]级|RTO.*[0-6]|RPO' "$_spec" 2>/dev/null; then
        warn "gate_dengbao4_dr: spec 未声明灾备恢复等级（等保四级 9.1.4.9 要求灾备不低于4级，spec §20 须声明 RTO/RPO/灾备等级）"
      fi
    fi
    # 可信验证（9.1.4.6）：硬件级 TPM/TCM，门禁无法静态核查
    warn "gate_dengbao4_trust: 等保四级 9.1.4.6 可信验证（TPM/TCM）是硬件级要求——人工核对可信根实现"
    # MAC 强制访问控制（9.1.4.2）：OS/DB 层
    warn "gate_dengbao4_mac: 等保四级 9.1.4.2 强制访问控制（MAC）是 OS/DB 层——人工核对 MAC 策略配置"
  fi
  [[ $found -eq 0 ]] && { pass "等保 ${level} 级控制点映射检查通过（GB/T 22239-2019）"; return 0; }
}
# gate: pia
# domain: compliance / enforce: strict / tier: compliance
check_pia() {
  echo "=== 隐私影响评估（PIA）检查（个人信息保护法第55-56条 / GB/T 35273-2020）==="
  [[ "${PIA_REQUIRED:-0}" == "1" ]] || {
    if [[ -n "${PIA_EXEMPT_REASON:-}" ]]; then
      warn "PIA 检查已豁免（${PIA_EXEMPT_REASON}）——fail-closed：豁免须显式声明理由"
    else
      fail "gate_pia_unconfigured: PIA_REQUIRED 未启用且无豁免理由——安全门禁须显式配置（PIA_REQUIRED=1）或填写 PIA_EXEMPT_REASON 豁免理由（个保法第55条：处理敏感个人信息须事前进行个人信息保护影响评估）"
    fi
    return
  }
  local dir="${PIA_DOCS_DIR:-docs/privacy}"
  local found=0
  # PIA 豁免登记（5 字段：对象|规则|理由|审批人|日期；空理由视为无效豁免 → fail）
  local _pia_exempt=""
  if [[ ${#PIA_EXEMPTIONS[@]} -gt 0 ]]; then
    local _pex _pex_id _pex_reason
    for _pex in "${PIA_EXEMPTIONS[@]}"; do
      _pex_reason=$(printf '%s\n' "$_pex" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/,"",$3); print $3}')
      if [[ -z "$_pex_reason" ]]; then
        fail "gate_pia_exemption_invalid: PIA 豁免须为 5 字段（对象|规则|理由|审批人|日期）：${_pex}"
        return
      fi
      _pex_id=$(printf '%s\n' "$_pex" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/,"",$1); print $1}')
      _pia_exempt="${_pia_exempt}${_pex_id} "
    done
  fi
  _pia_exempted() { printf '%s\n' "$_pia_exempt" | grep -qF "$1"; }
  if [[ ! -d "$dir" ]]; then
    if _pia_exempted gate_pia_doc_missing; then
      warn "gate_pia_doc_missing: PIA 文档目录不存在（已豁免留痕）"
      return
    fi
    fail "gate_pia_doc_missing: PIA 文档目录不存在：${dir}（PIA_REQUIRED=1，fail-closed；个保法第55条：处理敏感个人信息等情形须事前进行个人信息保护影响评估）"
    return
  fi
  # ① PIA 评估文档存在性
  local _pia_doc
  _pia_doc=$(find "$dir" -maxdepth 2 -type f \( -iname '*pia*' -o -name '*隐私影响评估*' -o -name '*影响评估*' \) 2>/dev/null | head -1)
  if [[ -z "$_pia_doc" ]]; then
    if _pia_exempted gate_pia_doc_missing; then
      warn "gate_pia_doc_missing: PIA 评估文档不存在（已豁免留痕）"
    else
      fail "gate_pia_doc_missing: PIA 评估文档不存在（${dir} 下未见 *pia*/ *隐私影响评估* 文件；个保法第55-56条）"
      found=1
    fi
  fi
  # ② 个人信息处理活动清单存在性
  local _inv
  _inv=$(find "$dir" -maxdepth 2 -type f \( -name '*清单*' -o -iname '*inventory*' -o -iname '*register*' -o -iname '*activities*' \) 2>/dev/null | head -1)
  if [[ -z "$_inv" ]]; then
    if _pia_exempted gate_pia_inventory_missing; then
      warn "gate_pia_inventory_missing: 个人信息处理活动清单不存在（已豁免留痕）"
    else
      fail "gate_pia_inventory_missing: 个人信息处理活动清单不存在（${dir} 下未见 *清单*/*inventory*/*register* 文件；GB/T 35273-2020 处理活动记录）"
      found=1
    fi
  fi
  # ③ PIA 文档零 TBD（评估报告不得含待定项）
  local _tbd
  _tbd=$(grep -rnE 'TBD|待定|待明确|待补充' "$dir" 2>/dev/null || true)
  if [[ -n "$_tbd" ]]; then
    if _pia_exempted gate_pia_tbd; then
      warn "gate_pia_tbd: PIA 文档含待定项（已豁免留痕）"
    else
      fail "gate_pia_tbd: PIA 文档含待定项（TBD/待定/待明确/待补充）——评估结论必须完整：
$(printf '%s\n' "$_tbd" | head -5 | sed 's/^/    /')"
      found=1
    fi
  fi
  # ④ 清单覆盖勾稽（warn-only：PRIVACY_SCAN_DIRS 各目录应在清单中有引用）
  if [[ -n "$_inv" && ${#PRIVACY_SCAN_DIRS[@]} -gt 0 ]]; then
    local d _base
    for d in ${PRIVACY_SCAN_DIRS[@]+"${PRIVACY_SCAN_DIRS[@]}"}; do
      _base=$(basename "$d")
      grep -qF "$_base" "$_inv" 2>/dev/null || warn "处理活动清单（${_inv}）未引用 PRIVACY_SCAN_DIRS 目录：${d}——请核对登记完整性"
    done
  fi
  [[ $found -eq 0 ]] && { pass "PIA 检查通过（评估文档+处理活动清单齐备，零待定项）"; return 0; }
}
# gate: sast-deep
# domain: security / enforce: strict / tier: compliance
check_sast_deep() {
  echo "=== 深度 SAST 检查（AST/数据流层；GB/T 34943/34944/34946-2017 源代码漏洞测试规范）==="
  if [[ ${#SECURITY_SCAN_DIRS[@]} -eq 0 ]]; then
    if [[ -n "${SAST_DEEP_EXEMPT_REASON:-}" ]]; then
      warn "深度 SAST 检查已豁免（${SAST_DEEP_EXEMPT_REASON}）——fail-closed：豁免须显式声明理由"
    else
      fail "gate_sast_deep_unconfigured: SECURITY_SCAN_DIRS 未配置且无豁免理由——安全门禁须显式配置或填写 SAST_DEEP_EXEMPT_REASON 豁免理由（GB/T 34943/34944/34946-2017 源代码漏洞测试规范）"
    fi
    return
  fi
  local tool="${SAST_DEEP_TOOL:-auto}" sev="${SAST_DEEP_SEVERITY:-error}" found=0
  # SAST 豁免登记（5 字段：对象|规则|理由|审批人|日期；空理由视为无效豁免 → fail）
  local _sast_exempt=""
  if [[ ${#SAST_DEEP_EXEMPTIONS[@]} -gt 0 ]]; then
    local _sex _sex_id _sex_reason
    for _sex in "${SAST_DEEP_EXEMPTIONS[@]}"; do
      _sex_reason=$(printf '%s\n' "$_sex" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/,"",$3); print $3}')
      if [[ -z "$_sex_reason" ]]; then
        fail "gate_sast_deep_exemption_invalid: SAST 豁免须为 5 字段（对象|规则|理由|审批人|日期）：${_sex}"
        return
      fi
      _sex_id=$(printf '%s\n' "$_sex" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/,"",$1); print $1}')
      _sast_exempt="${_sast_exempt}${_sex_id} "
    done
  fi
  _sast_exempted() { printf '%s\n' "$_sast_exempt" | grep -qF "$1"; }
  local bin=""
  # 载体解析：builtin=强制内置；codex-security=AI 约束推理扫描（非 SAST，需 Node22+/Python3.10+/OPENAI_API_KEY）；
  #   可执行路径=直接调用（fixture mock 亦走此分支）；空/auto=SAST 降级链探测（semgrep→opengrep→builtin）
  # 注：codex-security 非 SAST，不进 auto 降级链——OpenAI 官方明确「不包含 SAST 报告」，
  #   采用约束推理 + 攻击路径验证而非模式匹配。显式配置时启用，与 SAST 正交可并行。
  if [[ "$tool" == "builtin" ]]; then
    bin="builtin"
  elif [[ "$tool" == "codex-security" ]]; then
    # codex-security AI 约束推理（source→sink 数据流 + 攻击路径推演，非 SAST 模式匹配）
    # 需求：Node.js 22.13+ / 24.x / 26.x + Python 3.10+ + OPENAI_API_KEY 或 CODEX_API_KEY
    # 开源 Apache-2.0，API 按 token 计费（--max-cost 可设上限），Trusted Access 非付费门槛
    # 详见 references/codex-security-methodology.md §二 CLI 整合方式
    if command -v npx >/dev/null 2>&1 && [[ -n "${OPENAI_API_KEY:-${CODEX_API_KEY:-}}" ]]; then
      bin="codex-security"
    else
      warn "SAST_DEEP_TOOL=codex-security 但 npx 不可用或未设 OPENAI_API_KEY/CODEX_API_KEY——降级回 SAST 链（semgrep→opengrep→builtin）"
    fi
  elif [[ "$tool" != "auto" && -n "$tool" ]]; then
    if [[ -x "$tool" ]]; then bin="$tool"; else warn "SAST_DEEP_TOOL=${tool} 不可执行，降级自动探测"; fi
  fi
  if [[ -z "$bin" ]]; then
    if command -v semgrep >/dev/null 2>&1; then bin="semgrep"
    elif command -v opengrep >/dev/null 2>&1; then bin="opengrep"
    else bin="builtin"; fi
  fi
  if [[ "$bin" == "builtin" ]]; then
    # 自带降级载体（词法模式族，明示降级；AST/数据流/AI 约束推理层未执行）
    echo "  ⓘ 降级为内置词法模式族（semgrep/opengrep/codex-security 不可用；AST/数据流/语义层未执行）"
    trace_tool "sast-deep" "builtin-lexical"
    if _sast_deep_lexical_scan "gate_sast_deep_builtin: 内置模式族检出高危代码执行 sink（eval/exec/Runtime.exec/child_process.exec；GB/T 34943/34944/34946 漏洞类别，降级词法检出）："; then
      found=1
    fi
  elif [[ "$bin" == "codex-security" ]]; then
    # codex-security 语义层（source→sink 数据流 + 攻击路径推演 + 威胁模型 + scan contract 等能力）
    # 详见 references/codex-security-methodology.md §二 CLI 整合方式
    echo "  ⓘ SAST 载体：codex-security（语义层：source→sink 数据流 + 攻击路径推演）"
    trace_tool "sast-deep" "codex-security"
    local _cs_scan_root; _cs_scan_root="$(mktemp -d "${TMPDIR:-/tmp}/codex-security.XXXXXX")"
    local _cs_sev="high"
    [[ "$sev" == "warning" ]] && _cs_sev="medium"
    local _cs_rc=0
    # 扫描日志落在 _cs_scan_root 内（原写死 /tmp/codex-security-sast-deep.log，多实例并行会互相覆盖）
    local _cs_log="$_cs_scan_root/sast-deep.log"
    # 原 `--json` 不在 codex-security scan 的
    # 真实 flag 面（0.1.21：--format <toon|json|yaml|md|jsonl>，真源 CLI --help 核验）——未知
    # flag → rc=2 走降级链，codex-security 载体从不真执行（恒降 semgrep 的假 opt-in）。改 --format json。
    npx @openai/codex-security scan "${SECURITY_SCAN_DIRS[@]}" \
      --output-dir "$_cs_scan_root/results" \
      --format json \
      --fail-on-severity "$_cs_sev" \
      >"$_cs_log" 2>&1 || _cs_rc=$?
    if [[ $_cs_rc -eq 1 ]]; then
      # rc=1 = 策略违规（检出达标严重级别 finding）
      if _sast_exempted gate_sast_deep_findings; then
        warn "gate_sast_deep_findings: codex-security 检出达标严重级别（${_cs_sev}）发现（已豁免留痕）——详见 ${_cs_log} + $_cs_scan_root/results/findings.json"
      else
        fail "gate_sast_deep_findings: codex-security 检出达标严重级别（${_cs_sev}）以上发现（语义层 source→sink 数据流 + 攻击路径推演；GB/T 34943/34944/34946 漏洞类别）——详见 ${_cs_log} + $_cs_scan_root/results/findings.json"
        found=1
      fi
    elif [[ $_cs_rc -eq 2 ]]; then
      # rc=2 = 输入无效/覆盖不全/运行时错误 → 降级 semgrep→builtin
      warn "codex-security 执行失败或覆盖不全（rc=2）——降级自动探测（semgrep→opengrep→builtin）"
      if command -v semgrep >/dev/null 2>&1; then
        bin="semgrep"
      elif command -v opengrep >/dev/null 2>&1; then
        bin="opengrep"
      else
        bin="builtin"
      fi
      # 重新走 semgrep/opengrep/builtin 分支（下方统一处理）
      if [[ "$bin" == "builtin" ]]; then
        trace_tool "sast-deep" "builtin-lexical"
        if _sast_deep_lexical_scan "gate_sast_deep_builtin: 内置模式族检出高危代码执行 sink（codex-security 失败后降级检出；GB/T 34943/34944/34946 漏洞类别）："; then
          found=1
        fi
      else
        trace_tool "sast-deep" "$bin"
        local json _rc=0 _e _w
        json=$("$bin" scan --config p/default --json --quiet "${SECURITY_SCAN_DIRS[@]}" 2>/dev/null) || _rc=$?
        # R126：rc/空输出检查（镜像末尾 else 分支既有判据）——旧版本分支吞掉
        # semgrep/opengrep 失败：json 空 → ERROR=0 → 直通「深度 SAST 检查通过」；
        # R118 在 else 分支修过的「异常退出码不得判通过」同族洞在本分支残留。
        # 同时补 local 声明：_rc/_e/_w 旧版泄漏为全局变量。
        if [[ $_rc -ne 0 || -z "$json" ]]; then
          warn "${bin} 执行失败或无输出（rc=${_rc}）——降级内置词法模式族"
          trace_tool "sast-deep" "builtin-lexical"
          if _sast_deep_lexical_scan "gate_sast_deep_builtin: 内置模式族检出高危代码执行 sink（${bin} 执行失败后降级检出；GB/T 34943/34944/34946 漏洞类别）："; then
            found=1
          fi
        else
          _e=$(printf '%s\n' "$json" | grep -cE '"severity"[^,]*ERROR' || true)
          _w=$(printf '%s\n' "$json" | grep -cE '"severity"[^,]*WARNING' || true)
          echo "  ⓘ ${bin} 结果：ERROR=${_e} WARNING=${_w}"
          if [[ "$sev" == "warning" && $((_e+_w)) -gt 0 ]] || [[ "$sev" == "error" && "$_e" -gt 0 ]]; then
            if _sast_exempted gate_sast_deep_findings; then
              warn "gate_sast_deep_findings: ${bin} 检出达标严重级别发现（已豁免留痕）"
            else
              fail "gate_sast_deep_findings: ${bin} 检出达标严重级别（${sev}）以上发现 ERROR=${_e} WARNING=${_w}（GB/T 34943/34944/34946 漏洞类别）——详见 ${bin} JSON 输出"
              found=1
            fi
          fi
        fi
      fi
    elif [[ $_cs_rc -eq 0 ]]; then
      # rc=0 = 完成报告扫描，无策略违规
      echo "  ⓘ codex-security 结果：无达标严重级别（${_cs_sev}）以上发现（语义层扫描通过）"
      # 可选 SARIF 导出（不阻塞）
      npx @openai/codex-security export "$_cs_scan_root/results" --export-format sarif --output "$_cs_scan_root/results.sarif" 2>/dev/null || true
    else
      # R118：3/124/127 等异常退出码旧版落入 rc=0 分支并打印“扫描通过”（审计 P1-6）。
      fail "gate_sast_deep_tool_error: codex-security 异常退出（rc=${_cs_rc}）——扫描未完成，不得判定通过"
      found=1
    fi
    rm -rf "$_cs_scan_root"
  else
    echo "  ⓘ SAST 载体：${bin}（AST/规则层）"
    trace_tool "sast-deep" "$bin"
    local json _rc=0
    json=$("$bin" scan --config p/default --json --quiet "${SECURITY_SCAN_DIRS[@]}" 2>/dev/null) || _rc=$?
    if [[ $_rc -ne 0 || -z "$json" ]]; then
      # 网络/规则包不可达（离线环境 p/default 拉取失败）→ 降级内置，明示
      warn "${bin} 执行失败或无输出（rc=${_rc}；离线环境规则包不可达）——降级内置词法模式族"
      if _sast_deep_lexical_scan "gate_sast_deep_builtin: 内置模式族检出高危代码执行 sink（${bin} 执行失败后降级检出；GB/T 34943/34944/34946 漏洞类别）："; then
        found=1
      fi
    else
      local _e _w
      _e=$(printf '%s\n' "$json" | grep -cE '"severity"[^,]*ERROR' || true)
      _w=$(printf '%s\n' "$json" | grep -cE '"severity"[^,]*WARNING' || true)
      echo "  ⓘ ${bin} 结果：ERROR=${_e} WARNING=${_w}"
      if [[ "$sev" == "warning" && $((_e+_w)) -gt 0 ]] || [[ "$sev" == "error" && "$_e" -gt 0 ]]; then
        if _sast_exempted gate_sast_deep_findings; then
          warn "gate_sast_deep_findings: ${bin} 检出达标严重级别发现（已豁免留痕）"
        else
          fail "gate_sast_deep_findings: ${bin} 检出达标严重级别（${sev}）以上发现 ERROR=${_e} WARNING=${_w}（GB/T 34943/34944/34946 漏洞类别）——详见 ${bin} JSON 输出"
          found=1
        fi
      fi
    fi
  fi
  if [[ $found -eq 0 ]]; then
    pass "深度 SAST 检查通过（载体：${bin}）"
    # 诚实化：本门禁是 if/elif 互斥载体选择（工具 **或** builtin，不叠加）——
    # 与 check_security/check_sensitive 已改为叠加不同。此处显式披露"未叠加"，
    # 避免"通过"被误读为"语义层+词法层都查过了"。
    # 不改控制流的理由：sast-deep 是 advisory-only + 重型路径（需 API key / 大扫描量），
    # 叠加收益低于 security/sensitive，且改动风险高（多重降级分支）。
    case "$bin" in
      builtin) : ;;  # 已在上游打印"降级为内置词法模式族"披露，不重复
      *) echo "  ⓘ 载体 ${bin} 单层执行（内置词法模式族未叠加；如需词法层兜底：SAST_DEEP_TOOL=builtin 单独跑一次）" ;;
    esac
  fi
}
# gate: oss-eval
# domain: security / enforce: strict / tier: compliance
check_oss_eval() {
  echo "=== 开源代码安全评价（GB/T 43848-2024：来源/安全质量/知识产权/管理四维）==="
  if [[ "${OSS_EVAL_REQUIRED:-0}" != "1" ]]; then
    if [[ -n "${OSS_EVAL_EXEMPT_REASON:-}" ]]; then
      warn "开源代码安全评价已豁免（${OSS_EVAL_EXEMPT_REASON}）——fail-closed：豁免须显式声明理由"
    else
      fail "gate_oss_eval_unconfigured: OSS_EVAL_REQUIRED 未启用且无豁免理由——安全门禁须显式配置（OSS_EVAL_REQUIRED=1）或填写 OSS_EVAL_EXEMPT_REASON 豁免理由（GB/T 43848-2024 开源代码安全评价）"
    fi
    return
  fi
  local found=0
  # ① 成分清单存在（复用 --sbom 产物；sbom 未跑时本门禁独立核验目录）
  local dir="${SBOM_OUTPUT_DIR:-.sbom}"
  local _sbom_files
  _sbom_files=$(find "$dir" -type f \( -name '*.json' -o -name '*.spdx' -o -name '*.xml' -o -name '*.txt' \) 2>/dev/null | head -20 || true)
  if [[ -z "$_sbom_files" ]]; then
    fail "gate_oss_eval_sbom_missing: 开源成分清单产物不存在（${dir}；GB/T 43848-2024 将成分清单纳入评价体系——先运行 --sbom 生成）"
    found=1
  fi
  # ② 许可证遵从（块名单扫描成分清单）
  if [[ -n "$_sbom_files" && ${#SBOM_LICENSE_BLOCKLIST[@]} -gt 0 ]]; then
    local lic _hits=""
    for lic in ${SBOM_LICENSE_BLOCKLIST[@]+"${SBOM_LICENSE_BLOCKLIST[@]}"}; do
      local h
      h=$(printf '%s\n' "$_sbom_files" | xargs grep -lF "$lic" 2>/dev/null || true)
      [[ -n "$h" ]] && _hits="${_hits}${lic}→$(printf '%s\n' "$h" | head -3 | tr '\n' ' ') "
    done
    if [[ -n "$_hits" ]]; then
      fail "gate_oss_eval_license_blocked: 成分清单命中许可证块名单：${_hits}（GB/T 43848-2024 知识产权维度：开源许可证遵从度评价）"
      found=1
    fi
  fi
  # ③ 上游来源登记（管理维度，warn-only）
  if [[ ! -f README.md && ! -f UPSTREAM.md ]]; then
    warn "未见上游来源登记文档（README.md 或 UPSTREAM.md）——GB/T 43848-2024 来源维度建议登记开源成分来源"
  fi
  # ④ 豁免到期检查（warn-only：SBOM_LICENSE_EXEMPTIONS 五字段第 5 字段日期 < 今天）
  if [[ ${#SBOM_LICENSE_EXEMPTIONS[@]} -gt 0 ]]; then
    local today ex _d
    today=$(date -u +%Y-%m-%d)
    for ex in ${SBOM_LICENSE_EXEMPTIONS[@]+"${SBOM_LICENSE_EXEMPTIONS[@]}"}; do
      _d=$(printf '%s\n' "$ex" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/,"",$5); print $5}')
      if [[ -n "$_d" && "$_d" < "$today" ]]; then
        warn "开源许可证豁免已过期：${ex}（到期日 ${_d} < ${today}）——须复审或移除"
      fi
    done
  fi
  [[ $found -eq 0 ]] && { pass "开源代码安全评价通过（成分清单在案，许可证未命中块名单）"; return 0; }
}
# gate: quality-model
# domain: compliance / enforce: strict / tier: compliance
check_quality_model() {
  echo "=== 质量特性剪裁核验（GB/T 25000.10-2016 八特性 + ISO/IEC 25010:2023 Safety 主动对齐）==="
  [[ "${QUALITY_MODEL_REQUIRED:-0}" == "1" ]] || { skip_if_unconfigured "QUALITY_MODEL_REQUIRED 未启用，质量特性剪裁核验跳过"; return; }
  local spec="${SPEC_FILE:-}"
  if [[ -z "$spec" || ! -f "$spec" ]]; then
    fail "gate_quality_model_missing: SPEC_FILE 未配置或不存在——无法核验质量特性剪裁表（spec §22 须含八特性逐项适用/剪裁声明）"
    return
  fi
  local found=0
  # ① 质量特性剪裁表存在性（spec 中须含质量特性剪裁表标题或至少一个八特性字段）
  local _qm_section
  _qm_section=$(grep -nE '质量特性剪裁表|^#+.*质量特性|质量模型|quality.*model|功能适合性|性能效率' "$spec" 2>/dev/null | head -1 || true)
  if [[ -z "$_qm_section" ]]; then
    fail "gate_quality_model_missing: spec 未声明质量特性剪裁表——须含 GB/T 25000.10-2016 八特性（功能适合性/性能效率/兼容性/易用性/可靠性/安全性/维护性/可移植性）逐项适用/剪裁声明"
    found=1
  fi
  # ② 八特性逐项覆盖（缺项 fail，列明缺失特性以利修复）
  local _ch _miss=""
  for _ch in 功能适合性 性能效率 兼容性 易用性 可靠性 安全性 维护性 可移植性; do
    grep -qF "$_ch" "$spec" 2>/dev/null || _miss="${_miss}${_ch} "
  done
  if [[ -n "$_miss" ]]; then
    fail "gate_quality_model_incomplete: 质量特性剪裁表缺特性：${_miss}（GB/T 25000.10-2016 八特性须逐项声明适用/剪裁+理由）"
    found=1
  fi
  # ③ Safety 维度声明（ISO/IEC 25010:2023 新增；国标 25000.10-2016 暂无，主动对齐）
  if ! grep -qE 'Safety|无害性|人身安全' "$spec" 2>/dev/null; then
    fail "gate_quality_model_safety: spec 未声明 Safety（无害性）维度——ISO/IEC 25010:2023 新增该特性，国标 GB/T 25000.10-2016 暂无，须主动对齐声明（适用/不适用+理由）"
    found=1
  fi
  # ④ 零 TBD（质量特性剪裁表不得含待定项）
  local _tbd
  _tbd=$(grep -nE 'TBD|待定|待明确|待补充' "$spec" 2>/dev/null || true)
  if [[ -n "$_tbd" ]]; then
    fail "gate_quality_model_tbd: spec 含待定项（TBD/待定/待明确/待补充）——质量特性剪裁结论必须完整：
$(printf '%s\n' "$_tbd" | head -5 | sed 's/^/    /')"
    found=1
  fi
  [[ $found -eq 0 ]] && { pass "质量特性剪裁核验通过（八特性+Safety 齐备，零待定项）"; return 0; }
}
# gate: test-evidence
# domain: compliance / enforce: strict / tier: compliance
check_test_evidence() {
  echo "=== 测试证据链检查（GB/T 15532-2008 测试规范 / GB/T 9386-2008 测试文档）==="
  [[ "${TEST_EVIDENCE_REQUIRED:-0}" == "1" ]] || { skip_if_unconfigured "TEST_EVIDENCE_REQUIRED 未启用，测试证据链检查跳过"; return; }
  local dir="${TEST_EVIDENCE_DIR:-docs/test}"
  if [[ ! -d "$dir" ]]; then
    fail "gate_test_evidence_missing: 测试证据文档目录不存在：${dir}（GB/T 15532-2008 须含测试计划/测试说明/测试报告）"
    return
  fi
  local found=0
  # ① 三类测试文档存在性（测试计划/测试说明/测试报告）
  local _plan _spec_doc _report
  _plan=$(find "$dir" -maxdepth 2 -type f \( -iname '*测试计划*' -o -iname '*test*plan*' -o -iname '*plan*' \) 2>/dev/null | head -1)
  _spec_doc=$(find "$dir" -maxdepth 2 -type f \( -iname '*测试说明*' -o -iname '*测试用例*' -o -iname '*test*case*' -o -iname '*test*spec*' \) 2>/dev/null | head -1)
  _report=$(find "$dir" -maxdepth 2 -type f \( -iname '*测试报告*' -o -iname '*test*report*' \) 2>/dev/null | head -1)
  if [[ -z "$_plan" || -z "$_spec_doc" || -z "$_report" ]]; then
    local _miss=""
    [[ -z "$_plan" ]] && _miss="${_miss}测试计划 "
    [[ -z "$_spec_doc" ]] && _miss="${_miss}测试说明/用例 "
    [[ -z "$_report" ]] && _miss="${_miss}测试报告 "
    fail "gate_test_evidence_missing: 测试证据文档缺：${_miss}（GB/T 15532-2008 须含测试计划+测试说明+测试报告三类）"
    found=1
  fi
  # ② 测试报告含准出条件结论段
  if [[ -n "$_report" ]]; then
    if ! grep -qE '准出|验收结论|测试结论|pass.*criteria|exit.*criteria' "$_report" 2>/dev/null; then
      fail "gate_test_evidence_exit_missing: 测试报告缺准出条件结论段（${_report}）——GB/T 15532-2008 要求测试报告含验收准则与结论"
      found=1
    fi
  fi
  # ③ REQ- 编号勾稽（warn-only：测试文档中 REQ- 引用与 spec 抽样核对）
  local _spec="${SPEC_FILE:-}"
  if [[ -n "$_spec" && -f "$_spec" ]]; then
    local _reqs _req _hit
    _reqs=$(grep -oE 'REQ-[0-9]+' "$_spec" 2>/dev/null | sort -u || true)
    if [[ -n "$_reqs" ]]; then
      while IFS= read -r _req; do
        [[ -z "$_req" ]] && continue
        _hit=$(find "$dir" -type f -exec grep -lE "${_req}([^0-9]|\$)" {} \; 2>/dev/null | head -1 || true)
        [[ -z "$_hit" ]] && warn "测试文档未引用 ${_req}（测试证据链断链，建议补追溯）"
      done <<< "$_reqs"
    fi
  fi
  # ④ 零 TBD
  local _tbd
  _tbd=$(grep -rnE 'TBD|待定|待明确|待补充' "$dir" 2>/dev/null || true)
  if [[ -n "$_tbd" ]]; then
    fail "gate_test_evidence_tbd: 测试证据文档含待定项——测试结论必须完整：
$(printf '%s\n' "$_tbd" | head -5 | sed 's/^/    /')"
    found=1
  fi
  [[ $found -eq 0 ]] && { pass "测试证据链检查通过（计划+说明+报告齐备，含准出结论，零待定项）"; return 0; }
}
# gate: review-record
# domain: quality / enforce: strict / tier: compliance
check_review_record() {
  echo "=== 评审记录与 AI 过程信息项检查（GB/T 8566-2022 评审过程 / ISO/IEC 42001 成文信息+可追溯）==="
  [[ "${REVIEW_RECORD_REQUIRED:-0}" == "1" ]] || { skip_if_unconfigured "REVIEW_RECORD_REQUIRED 未启用，评审记录检查跳过"; return; }
  local dir="${REVIEW_RECORD_DIR:-docs/reviews}"
  if [[ ! -d "$dir" ]]; then
    fail "gate_review_record_missing: 评审记录目录不存在：${dir}（GB/T 8566-2022 评审过程要求留存评审记录）"
    return
  fi
  local found=0
  # ① 评审记录存在且含评审人/日期/结论三要素
  # R140 G-D7：文件名口径对齐——check_review 的今日留痕自定命名就是 YYYY-MM-DD.md，
  # 本门禁旧 find 只认 *review*/*评审*，按姊妹口径命名的真实记录（trade-forge 实证
  # docs/reviews/2026-10-20.md）反被判 missing。两类命名都收；三要素内容检查不变。
  local _recs _rec
  _recs=$(find "$dir" -maxdepth 2 -type f \( -iname '*review*' -o -iname '*评审*' -o -iname '20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]*.md' \) 2>/dev/null || true)
  if [[ -z "$_recs" ]]; then
    fail "gate_review_record_missing: 评审记录目录无评审文件（${dir} 下未见 *review*/*评审* 文件）"
    found=1
  else
    while IFS= read -r _rec; do
      [[ -z "$_rec" ]] && continue
      local _miss=""
      grep -qE '评审人|reviewer|审核人' "$_rec" 2>/dev/null || _miss="${_miss}评审人 "
      grep -qE '日期|date|时间' "$_rec" 2>/dev/null || _miss="${_miss}日期 "
      grep -qE '结论|conclusion|result|通过|不通过' "$_rec" 2>/dev/null || _miss="${_miss}结论 "
      if [[ -n "$_miss" ]]; then
        fail "gate_review_record_incomplete: 评审记录缺要素：${_miss}（${_rec}；GB/T 8566-2022 评审记录须含评审人/日期/结论）"
        found=1
      fi
      # 零 TBD
      if grep -qE 'TBD|待定|待明确|待补充' "$_rec" 2>/dev/null; then
        fail "gate_review_record_tbd: 评审记录含待定项（${_rec}）——评审结论必须完整"
        found=1
      fi
    done <<< "$_recs"
  fi
  # ② AI 过程信息项（AI_DISCLOSURE_REQUIRED=1 时）
  if [[ "${AI_DISCLOSURE_REQUIRED:-0}" == "1" ]]; then
    local _spec="${SPEC_FILE:-}"
    if [[ -n "$_spec" && -f "$_spec" ]]; then
      if ! grep -qE 'AI.*(生成|辅助|generated)|人工智能.*生成|AI-assisted' "$_spec" 2>/dev/null; then
        fail "gate_review_record_ai_undisclosed: spec 未声明 AI 辅助生成（AI_DISCLOSURE_REQUIRED=1）——ISO/IEC 42001 成文信息要求 AI 生成产物声明+人工复核记录"
        found=1
      fi
    fi
    # 人工复核记录存在性（warn-only）
    local _hr
    _hr=$(find "$dir" -type f -exec grep -lE '人工复核|human.*(review|verify)|人工审查' {} \; 2>/dev/null | head -1 || true)
    [[ -z "$_hr" ]] && warn "未见人工复核记录（AI_DISCLOSURE_REQUIRED=1 建议留存人工复核签字）"
  fi
  [[ $found -eq 0 ]] && { pass "评审记录检查通过（评审人/日期/结论齐备，零待定项）"; return 0; }
}
# gate: release-sign
# domain: compliance / enforce: strict / tier: compliance
check_release_sign() {
  echo "=== 发布签名与 provenance 检查（SLSA Build L2 / SSDF PS.2 发布完整性）==="
  if [[ "${RELEASE_SIGN_REQUIRED:-0}" != "1" ]]; then
    if [[ -n "${RELEASE_SIGN_EXEMPT_REASON:-}" ]]; then
      warn "发布签名检查已豁免（${RELEASE_SIGN_EXEMPT_REASON}）——fail-closed：豁免须显式声明理由"
    else
      fail "gate_release_sign_unconfigured: RELEASE_SIGN_REQUIRED 未启用且无豁免理由——安全门禁须显式配置（RELEASE_SIGN_REQUIRED=1）或填写 RELEASE_SIGN_EXEMPT_REASON 豁免理由（SLSA Build L2 / SSDF PS.2 发布完整性）"
    fi
    return
  fi
  local found=0
  # 工具降级：RELEASE_SIGN_TOOL（空=auto：有 cosign 用 cosign；"none"=强制存在性检查，无工具链环境依赖）
  local tool="${RELEASE_SIGN_TOOL:-}"
  if [[ "$tool" == "none" ]]; then
    tool=""
  elif [[ -z "$tool" ]] && command -v cosign >/dev/null 2>&1; then
    tool="cosign"
  fi
  if [[ -n "$tool" ]] && ! command -v "$tool" >/dev/null 2>&1; then
    warn "RELEASE_SIGN_TOOL=${tool} 不可用，降级为签名文件存在性检查"
    tool=""
  fi
  if [[ -z "$tool" ]]; then
    echo "  ⓘ 降级为签名文件存在性检查（cosign 不可用或未启用，SLSA 验签未执行）"
  fi
  # 产物枚举（glob 空格分隔；nullglob 展开防未命中模式退化为字面量；shopt 状态保存/恢复）
  local globs="${RELEASE_ARTIFACTS_GLOB:-dist/*.tar.gz dist/*.zip dist/*.jar}"
  local _ng_save
  _ng_save=$(shopt -p nullglob || true)
  shopt -s nullglob
  local artifacts=() a
  for a in $globs; do [[ -e "$a" ]] && artifacts+=("$a"); done
  eval "$_ng_save"
  if [[ ${#artifacts[@]} -eq 0 ]]; then
    # R118：REQUIRED=1 且零产物时旧版输出“0 个产物签名齐备”并 rc=0——零证据通过。
    if [[ "${RELEASE_SIGN_REQUIRED:-0}" == "1" ]]; then
      fail "gate_release_sign_no_artifacts: RELEASE_SIGN_REQUIRED=1 但未匹配到发布产物（${globs}）"
      return
    fi
    warn "未匹配到发布产物（${globs}）——签名检查无对象"
    return
  fi
  local sig ext vrc _sig_unverified=0
  for a in ${artifacts[@]+"${artifacts[@]}"}; do
    sig=""
    # R118：用 -s（非空）而非 -f——零字节 .asc/.sig 旧版被当成“签名齐备”。
    for ext in .sig .asc .att .bundle; do
      if [[ -s "${a}${ext}" ]]; then sig="${a}${ext}"; break; fi
    done
    if [[ -z "$sig" ]]; then
      fail "gate_release_sign_missing:${a}: 发布产物缺伴随签名/证明（非空 .sig/.asc/.att/.bundle 其一；SLSA Build L2 / SSDF PS.2）"
      found=1
      continue
    fi
    if [[ -n "$tool" ]]; then
      vrc=0
      case "$sig" in
        "${a}.bundle")
          "$tool" verify-blob --bundle "$sig" "$a" >/dev/null 2>&1 || vrc=$? ;;
        "${a}.sig")
          "$tool" verify-blob --signature "$sig" "$a" >/dev/null 2>&1 || vrc=$? ;;
        *)
          # .asc/.att 当前无对应验签实现：不得在汇总里宣称“cosign 验签通过”。
          _sig_unverified=1 ;;
      esac
      if [[ "$vrc" -ne 0 ]]; then
        fail "gate_release_sign_verify_failed:${a}: cosign verify-blob 验签失败（${sig}）"
        found=1
      fi
    else
      _sig_unverified=1
    fi
  done
  # SLSA provenance（RELEASE_PROVENANCE_REQUIRED=1，fail-closed）
  if [[ "${RELEASE_PROVENANCE_REQUIRED:-0}" == "1" ]]; then
    local prov="${RELEASE_PROVENANCE_FILE:-dist/provenance.json}"
    if [[ ! -f "$prov" ]]; then
      fail "gate_release_provenance_missing: SLSA provenance 文件不存在：${prov}（RELEASE_PROVENANCE_REQUIRED=1，fail-closed；可用 RELEASE_PROVENANCE_FILE 指定路径）"
      found=1
    elif ! grep -q '"predicateType"' "$prov" 2>/dev/null; then
      warn "provenance 文件未见 \"predicateType\" 字段（${prov}）——请确认为 in-toto/SLSA 格式"
    fi
  fi
  if [[ $found -eq 0 ]]; then
    if [[ -n "$tool" && "$_sig_unverified" -eq 0 ]]; then
      pass "发布签名检查通过（${#artifacts[@]} 个产物签名齐备，cosign 验签通过）"
    else
      pass "发布签名检查通过（${#artifacts[@]} 个产物签名齐备，存在性检查；未执行密码学验签）"
    fi
  fi
}
# gate: loop-oracle
# domain: process / enforce: strict / tier: explicit
check_loop_oracle() {
  echo "=== Oracle Gate 循环状态核验（--loop-oracle，strict）==="
  local state_dir="${PROJECT_DIR:-$(pwd)}/.swarm-yuan"
  # 找 loop 状态文件（cwd 哈希命名 loop-<hash>.md）
  local loop_state=""
  if [[ -d "$state_dir" ]]; then
    loop_state=$(ls -1 "$state_dir"/loop-*.md 2>/dev/null | head -1 || true)
  fi

  # Z3 fail-closed：LOOP_ORACLE_REQUIRED=1 但无 loop → fail
  if [[ "${LOOP_ORACLE_REQUIRED:-0}" == "1" && -z "$loop_state" ]]; then
    if [[ -n "${LOOP_ORACLE_EXEMPT_REASON:-}" ]]; then
      warn "loop-oracle 检查已豁免（${LOOP_ORACLE_EXEMPT_REASON}）——fail-closed：豁免须显式声明理由"
    else
      fail "gate_loop_oracle_required: LOOP_ORACLE_REQUIRED=1 但无活跃 loop 状态文件——强制要求走 Oracle 验证（${state_dir}/loop-*.md 不存在）。或填 LOOP_ORACLE_EXEMPT_REASON 豁免理由"
    fi
    return
  fi

  # 无 loop 状态文件 → 未启用，pass 不阻塞
  if [[ -z "$loop_state" ]]; then
    pass "loop-oracle: 无活跃 loop（未启用 Oracle Gate，不阻塞——用 bash scripts/setup-loop.sh 启动）"
    return
  fi

  local found=0
  local history="${state_dir}/loop-history.jsonl"

  # ② loop 活跃但无 history.jsonl → fail
  if [[ ! -f "$history" ]]; then
    fail "gate_loop_oracle_no_history: loop 状态文件存在（${loop_state}）但无 loop-history.jsonl——loop 启动后未完成一轮迭代"
    found=1
  else
    # ① 读最后一条状态，断言 status=complete
    local last_status
    last_status=$(tail -1 "$history" 2>/dev/null | sed -E 's/.*"status":"([^"]+)".*/\1/' || true)
    if [[ "$last_status" != "complete" ]]; then
      fail "gate_loop_oracle_incomplete: loop 未完成（最后状态: ${last_status:-unknown}）——Oracle Gate 要求 verify_command 通过才完成"
      found=1
    else
      pass "loop-oracle: 最后一次 promise 被 Oracle 接受（status=complete）"
    fi

    # ③ Stall Detection warn（promise_rejections≥5）
    local last_rejections
    last_rejections=$(tail -1 "$history" 2>/dev/null | sed -E 's/.*"rejections":([0-9]+).*/\1/' || echo "0")
    [[ "$last_rejections" =~ ^[0-9]+$ ]] || last_rejections=0
    if [[ "$last_rejections" -ge 5 ]]; then
      warn "loop-oracle: Stall Detection 触发（promise_rejections=${last_rejections}）——建议人工介入或重新审视需求"
    fi
  fi

  [[ $found -eq 0 ]] && { pass "Oracle Gate 循环状态核验通过"; return 0; }
}
