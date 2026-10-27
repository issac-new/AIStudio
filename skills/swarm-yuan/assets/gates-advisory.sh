# GENERATED gates-advisory.sh — source: assets/gates/ + gates.tsv; do not edit
# 源目录按 domain 组织；本文件按 gates.tsv 的 enforce 列聚合（WP6）。
_AI_JUDGMENT=1
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
# gate: consistency
# domain: quality / enforce: advisory / tier: core
check_consistency() {

  if [[ "$_AI_JUDGMENT" == "1" ]]; then
    _ai_hint "check_consistency" "逐文件读业务规则，对照数据勾稽核对（订单金额=Σ明细 / 库存=Σ在库+在途）；在 CONSISTENCY_DIRS 内人读 3-5 个核心文件；不要靠 grep"
  return 0
  fi
  # 机械分支已随 GATE_AI_JUDGMENT 恒 1 退役删除（D1 落地化——AI 判断引导为唯一模式）

}
# gate: stable-diff
# domain: architecture / enforce: advisory / tier: arch
check_stable_diff() {
  echo "=== 稳定单元篡改检查（DDD：稳定层/聚合根/Repository 不得被随意改）==="
  local found=0

  if [[ ${#STABLE_GLOBS[@]} -eq 0 ]]; then
    # 模板把 STABLE_GLOBS 标 deprecated、流程无填写指引——README 3.5 管束链
    # 承诺的"稳定单元被改而未声明（失败）"出厂即休眠。reference-manual §4/§6/§9 是
    # 稳定性标注的三节载体（组件/接口/数据勾稽——模板 §9 示例自带「禁止改——勾稽恒等式」
    # 引导），说明列稳定性标注词（与 --stability-audit 同一词库）可机械反推
    # 稳定单元路径作兜底源；显式配置 STABLE_GLOBS 仍优先。
    # R138：节锚由 §4 扩到 §4/§6/§9——旧锚只认 §4，§9 标「禁止改」的实体被改时
    # 反推不到（nest-forge 实证：改 task.entity.ts 触发 §9 标注却报「未改动稳定层」），
    # 与 inventory-verify/inventory-update 的三节口径对齐。
    local _rm_file
    _rm_file=$(_first_existing_file "${PROJECT_DIR:-.}/.claude/skills/*/references/reference-manual.md" "${PROJECT_DIR:-.}/.codex/skills/*/references/reference-manual.md")
    if [[ -n "$_rm_file" ]]; then
      local _p
      STABLE_GLOBS=()
      while IFS= read -r _p; do
        [[ -z "$_p" ]] && continue
        STABLE_GLOBS+=("$_p")
      done < <(awk '
        /^## .*§(4|6|9)/ {insec=1; next}
        insec && /^## / {insec=0}
        insec && /^\|/ {
          line=$0
          if (match(line, /`[^`]+`/)) {
            p=substr(line, RSTART+1, RLENGTH-2)
            rest=substr(line, RSTART+RLENGTH)
            if (index(rest,"禁止改")>0 || index(rest,"稳定")>0) print p
          }
        }
      ' "$_rm_file")
      if [[ ${#STABLE_GLOBS[@]} -gt 0 ]]; then
        echo "  ⓘ STABLE_GLOBS 未配置——从 reference-manual §4/§6/§9 稳定性标注反推 ${#STABLE_GLOBS[@]} 个稳定单元（显式配置可覆盖）"
      fi
    fi
  fi
  if [[ ${#STABLE_GLOBS[@]} -eq 0 ]]; then
    warn "未配置 STABLE_GLOBS 且 reference-manual §4 无稳定性标注，跳过稳定单元篡改检查"
    return
  fi
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    warn "非 git 仓库，稳定单元篡改检查跳过"
    return
  fi

  # ---- 1. 收集本次变更（vs main）触及的稳定层文件 ----
  local changed; changed=$(_git_changed_files)
  [[ -z "$changed" ]] && { pass "无变更，稳定单元篡改检查通过"; return; }

  # 匹配 stable globs
  # R126-G4：旧实现在循环内 shopt -s globstar extglob nullglob 且从不恢复——三个 shell
  # 选项泄漏为全局态影响后续所有门禁（nullglob 泄漏后 gates-advisory 的 `"$d"/*.md "$d"/*.sh`
  # 双 glob 齐空时展开为零操作数，grep -rhoE 退化为扫 CWD）。改子 shell 内设置，
  # 选项随子 shell 退出自动还原，零全局态污染。
  declare -a stable_changed=()
  local c sg _sc_hits
  _sc_hits=$(
    shopt -s globstar extglob nullglob 2>/dev/null || true
    while IFS= read -r c; do
      [[ -z "$c" ]] && continue
      for sg in "${STABLE_GLOBS[@]}"; do
        # 简单前缀匹配：把 glob 的 ** 之前部分作为前缀（% 最短匹配——与 check_layer §516 同款修复；
        # %% 会把 'overlay/custom/client/*/components/**' 误截成 'overlay/custom/client'，导致整目录被误判为稳定层改动）
        local prefix="${sg%/\**}"
        if [[ "$c" == "$prefix"* ]]; then
          printf '%s\n' "$c"
          break
        fi
      done
    done <<< "$changed"
  )
  while IFS= read -r c; do
    [[ -n "$c" ]] && stable_changed+=("$c")
  done <<< "$_sc_hits"

  if [[ ${#stable_changed[@]} -eq 0 ]]; then
    pass "本次未改动稳定层文件"
    return
  fi

  # ---- 2. 对每个被改的稳定文件，检查是否有 spec 声明 MODIFIED ----
  # 找 spec 文档（含 §5.5 复用约束的 spec）——统一走 _find_spec_file
  local spec_file
  spec_file=$(_find_spec_file '复用约束|拼装合规声明|MODIFIED')

  # 从 spec 提取声明为 MODIFIED 的文件路径
  local declared_modified=""
  if [[ -n "$spec_file" ]]; then
    declared_modified=$(awk '
      /MODIFIED|修改文件|侵入点/ {in_sec=1}
      /^## [0-9]/ && in_sec {in_sec=0}
      in_sec && /`[^`]+`/ {
        line=$0; while (match(line, /`[^`]+`/)) {
          print substr(line, RSTART+1, RLENGTH-2); line=substr(line, RSTART+RLENGTH)
        }
      }
    ' "$spec_file" 2>/dev/null | grep -E '/|\.' | sort -u || true)
  fi

  local sc si
  for ((si=0; si<${#stable_changed[@]}; si++)); do
    sc="${stable_changed[$si]}"
    # 检查该稳定文件是否在 spec 的 MODIFIED 清单中
    if echo "$declared_modified" | grep -qF -- "$sc"; then
      : # 已声明修改，允许
    else
      fail "稳定单元被篡改但未在 spec MODIFIED 段声明：${sc}（稳定层改动必须先立 spec，标注 MODIFIED + 理由 + 迁移）"
      found=1
    fi
  done

  # ---- 3. ★标记沿调用链传播（决策 28，Palantir markings-propagate 映射）----
  # 直接改稳定单元已由上面 §2 的 fail() 执法；本节补"下游传播 warn"：
  # 若本次变更触及"调用 STABLE_GLOBS 文件的下游文件"（1 跳邻域），不阻断，只 warn
  # "该文件依赖禁止改单元 X，改动可能破坏其契约，须在 spec §MODIFIED 声明"。
  # 下游影响域来源：reference-manual.md §5 调用链路图的"下游影响域"标注（特征卡
  # 第 11 项 §11g 的 STABLE_PROPAGATE 记录）；未记录则降级 grep import 反查（best-effort）。
  # 设计：warn 不增 fail() 计数 → 不改变 --stable-diff 的 enforce_level 归类（保持原档）。
  # 关闭：STABLE_PROPAGATE_HOPS=0 时跳过（默认 1）。
  local hops="${STABLE_PROPAGATE_HOPS:-1}"
  if [[ "${STABLE_PROPAGATE:-1}" == "1" && "$hops" -ge 1 && ${#stable_changed[@]} -gt 0 ]]; then
    local downstream_set=""
    # 3a. 优先从 reference-manual §5 提取已记录的下游影响域（机器可读标记：
    #     `<!-- stable-propagate: <stable_file> → <downstream_file> -->`）
    local refmanual
    refmanual=$(_first_existing_file "references/reference-manual.md" "docs/reference-manual.md")
    if [[ -n "$refmanual" && -f "$refmanual" ]]; then
      # 提取所有 stable-propagate 标记的下游文件（去重）
      downstream_set=$(grep -oE '<!-- stable-propagate: [^→]*→[^-]*-->' "$refmanual" 2>/dev/null \
        | sed -E 's/<!-- stable-propagate:[^→]*→//; s/ *-->.*//' \
        | tr ',' '\n' | sed 's/^ *//;s/ *$//' | grep -v '^$' | sort -u || true)
    fi
    # 3a'. 机器可读关系边集（references/relations.jsonl，relations-extract.sh 产物）补充——
    #      边 to=稳定文件 的 from 即 1 跳下游（import 边精确，优于 3b 的 basename grep 启发式）。
    #      与标记集取并集（warn-only 语义：多召回只多提示不误拦）；无边集时行为不变。
    local reledge
    reledge=$(_first_existing_file "references/relations.jsonl" "docs/relations.jsonl")
    if [[ -n "$reledge" && -f "$reledge" ]]; then
      local sc3 e_hits
      for sc3 in "${stable_changed[@]}"; do
        e_hits=$(grep -F "\"to\":\"${sc3}\"" "$reledge" 2>/dev/null \
          | sed -n 's/.*"from":"\([^"]*\)".*/\1/p' || true)
        [[ -n "$e_hits" ]] && downstream_set="${downstream_set}${downstream_set:+$'\n'}${e_hits}"
      done
      downstream_set=$(printf '%s\n' "$downstream_set" | sort -u | grep -v '^$' || true)
    fi
    # 3b. 降级：未记录时用 grep import 反查（best-effort，仅支持常见语言）
    if [[ -z "$downstream_set" ]]; then
      local sc2
      for sc2 in "${stable_changed[@]}"; do
        # 提取稳定文件 basename（去扩展名）作为 import 关键词
        local bname; bname=$(basename "$sc2" 2>/dev/null | sed -E 's/\.(ts|tsx|js|jsx|py|java|go|rs|kt|rb|php)$//')
        [[ -z "$bname" ]] && continue
        # 在可改源码目录 grep import/from/use 该 basename 的文件（排除稳定文件自身）
        local hits=""
        for dir in ${WRITABLE_DIRS[@]+"${WRITABLE_DIRS[@]}"} ${SCAN_DIRS[@]+"${SCAN_DIRS[@]}"}; do
          [[ -d "$dir" ]] || continue
          hits=$(grep -rlE "(import|from|use|require)[[:space:]].*${bname}" "$dir" \
            --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
            --include='*.py' --include='*.java' --include='*.go' --include='*.rs' \
            --include='*.kt' --include='*.rb' --include='*.php' 2>/dev/null || true)
          [[ -n "$hits" ]] && { downstream_set="${downstream_set}${downstream_set:+$'\n'}${hits}"; }
        done
      done
      downstream_set=$(printf '%s\n' "$downstream_set" | sort -u | grep -v '^$' || true)
    fi
    # 3c. 对每个下游文件，若本次变更触及它且未在 spec 声明 → warn（不阻断，不调 fail()）
    local ds
    while IFS= read -r ds; do
      [[ -z "$ds" ]] && continue
      # 排除稳定文件自身（已在 §2 处理）
      local is_stable=0
      for sg in "${STABLE_GLOBS[@]}"; do
        local prefix="${sg%/\**}"
        if [[ "$ds" == "$prefix"* ]]; then is_stable=1; break; fi
      done
      [[ $is_stable -eq 1 ]] && continue
      # 本次变更是否触及该下游文件
      if echo "$changed" | grep -qF -- "$ds"; then
        if ! echo "$declared_modified" | grep -qF -- "$ds"; then
          warn "下游文件依赖禁止改稳定单元但未在 spec 声明：${ds}（依赖稳定层，改动可能破坏其契约，须在 spec §MODIFIED 声明+理由）"
        fi
      fi
    done <<< "$downstream_set"
  fi

  if [[ $found -eq 0 ]]; then
    pass "稳定单元篡改检查通过（${#stable_changed[@]} 个稳定文件改动均已在 spec 声明）"
  fi
}
# gate: link-depth
# domain: architecture / enforce: advisory / tier: arch
check_link_depth() {

  if [[ "$_AI_JUDGMENT" == "1" ]]; then
    _ai_hint "check_link_depth" "挑 3 个核心用例，沿调用链逐层读代码（controller→service→repo），数层数；若 >6 层，AI 判断是否为适配层堆叠而非真实复杂度"
  return 0
  fi
  # 机械分支已随 GATE_AI_JUDGMENT 恒 1 退役删除（D1 落地化——AI 判断引导为唯一模式）

}
# gate: consistency-cross
# domain: architecture / enforce: advisory / tier: arch
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
# gate: state
# domain: architecture / enforce: advisory / tier: arch
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
# gate: cognition
# domain: architecture / enforce: advisory / tier: arch
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
# gate: knowledge
# domain: architecture / enforce: advisory / tier: arch
check_knowledge() {
  echo "=== 项目知识复用检查（AGENTS.md/CLAUDE.md/记忆 → 生成 skill 是否复用）==="
  local found=0

  # ---- 0. 可检索记忆后端逐个探（memory-backends.sh 适配层派发，不绑定具体插件）----
  # 后端未定义 search 契约函数（如 local 文件后端）或不可用时自然跳过；
  # 有一个后端有历史记录即 pass，已装但无记忆/报错则 warn 披露（首次生成属正常）。
  if command -v mem_backends_list >/dev/null 2>&1; then
    local _backend _rc
    for _backend in $(mem_backends_list); do
      # 仅可检索后端参与（未定义 mem_<id>_search 契约的后端——如 local 项目状态文件——不算记忆证据源）
      command -v "mem_${_backend}_search" >/dev/null 2>&1 || continue
      mem_detect "$_backend" || continue
      # set -e 下取退出码必须走 if 条件上下文（条件位挂起 -e，else 分支 $? 仍有效）
      if mem_search "$_backend" "project rules conventions" >/dev/null 2>&1; then
        _rc=0
      else
        _rc=$?
      fi
      trace_tool "mem:${_backend}" "search project rules conventions"
      if [[ $_rc -eq 0 ]]; then
        pass "记忆后端 ${_backend} 有历史记录（项目知识已积累）"
      elif [[ $_rc -eq 2 ]]; then
        warn "记忆后端 ${_backend} 已装但检索报错——首次生成或 worker 未运行，探查后写入项目特征摘要"
      else
        warn "记忆后端 ${_backend} 已装但无项目记忆——首次生成 skill，探查后写入项目特征摘要"
      fi
    done
  fi

  # ---- 1. 检查项目是否有知识文件 ----
  local has_agents=0 has_claude=0 has_memories=0
  [[ -f "$PROJECT_DIR/AGENTS.md" ]] && has_agents=1
  [[ -f "$PROJECT_DIR/CLAUDE.md" ]] && has_claude=1
  # 记忆痕迹探测：项目内通用目录 + 适配层各后端的 present（含插件数据目录，由后端自报）
  [[ -d "$PROJECT_DIR/.zcode/memories" || -d "$HOME/.zcode/cli/memories" || -d "$PROJECT_DIR/.claude" ]] && has_memories=1
  if command -v mem_present >/dev/null 2>&1; then
    local _pb
    for _pb in $(mem_backends_list); do
      if mem_present "$_pb"; then has_memories=1; break; fi
    done
  fi

  if [[ $has_agents -eq 0 && $has_claude -eq 0 && $has_memories -eq 0 ]]; then
    skip_if_unconfigured "项目无 AGENTS.md/CLAUDE.md/记忆文件，知识复用检查跳过"
    return
  fi

  # ---- 2. 检查生成的 SKILL.md 是否引用了知识来源 ----
  local skill_file
  # 同源兜底：候选末位加本技能自身 SKILL.md（技能根取 _CONF_DIR 绝对路径）——
  # 自定义 target-dir 生成时前三级（默认安装位/相对 cwd）在项目根 cwd 下全部失明。
  local _self_skill_md
  _self_skill_md="${_CONF_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd)}/SKILL.md"
  skill_file=$(_first_existing_file "$PROJECT_DIR/.claude/skills/*/SKILL.md" ".claude/skills/*/SKILL.md" "SKILL.md" "$_self_skill_md")
  if [[ -z "$skill_file" ]]; then
    skip_if_unconfigured "未找到生成的 SKILL.md，知识复用检查跳过"
    return
  fi

  local refs=0
  [[ $has_agents -eq 1 ]] && grep -qiE 'AGENTS\.md|见 AGENTS' "$skill_file" 2>/dev/null && refs=$((refs+1))
  [[ $has_claude -eq 1 ]] && grep -qiE 'CLAUDE\.md|见 CLAUDE' "$skill_file" 2>/dev/null && refs=$((refs+1))
  [[ $has_memories -eq 1 ]] && grep -qiE 'memories|记忆|claude-mem|\.zcode' "$skill_file" 2>/dev/null && refs=$((refs+1))

  local total=$((has_agents + has_claude + has_memories))
  if [[ $refs -ge $total ]]; then
    pass "项目知识复用完整（${refs}/${total} 个知识来源被引用）"
  elif [[ $refs -gt 0 ]]; then
    warn "项目知识部分复用（${refs}/${total} 个来源被引用）——建议在 SKILL.md 铁律段引用全部知识来源"
  else
    fail "项目有知识文件（AGENTS.md/CLAUDE.md/记忆）但生成的 SKILL.md 未引用——须读取项目知识并写入铁律段"
    found=1
  fi

  # ---- 3. 检查特征卡是否从知识文件提取了规则 ----
  # 检查 SKILL.md 的铁律段是否含"见 AGENTS.md"等引用（非写死规则值）
  if [[ $has_agents -eq 1 ]]; then
    # 读 AGENTS.md 的关键规则（可改范围/只读区/分支策略）
    local agents_rules; agents_rules=$(grep -iE '可改|只读|禁止|分支|feature|feat|fix' "$PROJECT_DIR/AGENTS.md" 2>/dev/null | head -5 || true)
    if [[ -n "$agents_rules" ]]; then
      # 检查 SKILL.md 是否引用了这些规则（而非写死值）
      if ! grep -qiE 'AGENTS\.md' "$skill_file" 2>/dev/null; then
        warn "AGENTS.md 含项目规则但 SKILL.md 未引用来源——须标注'见 AGENTS.md'而非写死规则值"
      fi
    fi
  fi

  if [[ $found -eq 0 ]]; then
    pass "项目知识复用检查通过"
  fi
}
# gate: metrics
# domain: compliance / enforce: advisory / tier: compliance
check_metrics() {
  echo "=== 度量门禁化检查（GB/T 25000.30 质量度量 / DevOps 度量趋势恶化告警）==="
  local runs_dir="${GATE_RUNS_DIR:-}"
  if [[ -z "$runs_dir" ]]; then
    skip_if_unconfigured "GATE_RUNS_DIR 未配置，度量检查跳过（无 gate-runs.jsonl 数据源）"
    return
  fi
  local jsonl="${runs_dir}/gate-runs.jsonl"
  if [[ ! -f "$jsonl" ]]; then
    skip_if_unconfigured "gate-runs.jsonl 不存在（${jsonl}）——度量检查跳过（首次运行无历史数据）"
    return
  fi
  local window="${METRICS_TREND_WINDOW:-3}"
  local found=0
  # 提取 strict 门禁列表（从 gate-enforce-level.conf）
  local _conf_dir _gel
  _conf_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  _gel="${_conf_dir}/gate-enforce-level.conf"
  local _strict_gates=""
  if [[ -f "$_gel" ]]; then
    _strict_gates=$(grep -E '=strict$' "$_gel" 2>/dev/null | cut -d= -f1 || true)
  fi
  [[ -z "$_strict_gates" ]] && { warn "gate-enforce-level.conf 无 strict 门禁或文件缺失——度量趋势检查降级为全门禁"; _strict_gates=$(grep -oE '"gate":"[^"]*"' "$jsonl" 2>/dev/null | sed 's/"gate":"//;s/"//' | sort -u || true); }
  local _g _statuses _half _total _first_half _second_half _fh_pass _sh_pass _prev_rate _rate _declining=""
  for _g in $_strict_gates; do
    [[ -z "$_g" ]] && continue
    # 取该门禁最近 N 次状态
    _statuses=$(grep -F "\"gate\":\"$_g\"" "$jsonl" 2>/dev/null | grep -oE '"status":"[^"]*"' | sed 's/"status":"//;s/"//' | tail -"$window" || true)
    [[ -z "$_statuses" ]] && continue
    _total=$(printf '%s\n' "$_statuses" | grep -c . || true)
    [[ "$_total" -lt 2 ]] && continue
    _half=$((_total / 2))
    [[ "$_half" -eq 0 ]] && _half=1
    _first_half=$(printf '%s\n' "$_statuses" | head -"$_half" || true)
    _second_half=$(printf '%s\n' "$_statuses" | tail -"$((_total - _half))" || true)
    _fh_pass=$(printf '%s\n' "$_first_half" | grep -c 'pass' || true)
    _sh_pass=$(printf '%s\n' "$_second_half" | grep -c 'pass' || true)
    _prev_rate=$((_fh_pass * 100 / _half))
    _rate=$((_sh_pass * 100 / (_total - _half)))
    if [[ "$_rate" -lt "$_prev_rate" ]]; then
      _declining="${_declining}${_g}(${_prev_rate}%→${_rate}%) "
    fi
  done
  if [[ -n "$_declining" ]]; then
    fail "gate_metrics_trend_declining: strict 门禁通过率趋势恶化：${_declining}（窗口 ${window} 次；GB/T 25000.30 度量反馈——质量退化信号，须排查根因）"
    found=1
  fi
  [[ $found -eq 0 ]] && { pass "度量趋势检查通过（strict 门禁通过率无恶化，窗口 ${window} 次）"; return 0; }
}
# gate: method-size
# domain: architecture / enforce: advisory / tier: arch
check_method_size() {
  echo "=== 方法粒度检查（单方法行数上限）==="
  local max_lines="${METHOD_MAX_LINES:-60}"
  local scan_dirs="${WRITABLE_DIRS[*]:-}"
  if [[ -z "$scan_dirs" ]]; then
    skip_if_unconfigured "WRITABLE_DIRS 未配置，方法粒度检查跳过"
    return
  fi
  local found=0 _dir _f
  for _dir in $scan_dirs; do
    [[ -d "${PROJECT_DIR:-.}/${_dir}" ]] || continue
    while IFS= read -r _f; do
      [[ -f "$_f" ]] || continue
      # awk：匹配函数起始行模式，到下一个起始或 EOF 计行数，超阈值输出
      awk -v max="$max_lines" -v file="$_f" '
        /^[[:space:]]*(public |private |protected |static |def |func |function |[a-zA-Z_][a-zA-Z0-9_]*\s*\()/ {
          if (start > 0 && NR - start > max) printf "%s:%d 方法起始于第 %d 行，长度 %d 行 > 上限 %d\n", file, NR, start, NR-start, max
          start = NR
        }
        END { if (start > 0 && NR - start > max) printf "%s:%d 方法起始于第 %d 行，长度 %d 行 > 上限 %d\n", file, NR, start, NR-start, max }
      ' "$_f" 2>/dev/null
    done < <(find "${PROJECT_DIR:-.}/${_dir}" -type f \( -name '*.java' -o -name '*.py' -o -name '*.go' -o -name '*.js' -o -name '*.ts' -o -name '*.kt' \) \
      -not -path '*/node_modules/*' -not -path '*/target/*' -not -path '*/dist/*' -not -path '*/build/*' \
      -not -path '*/vendor/*' -not -path '*/.venv/*' -not -path '*/venv/*' 2>/dev/null | head -200)
  done | while IFS= read -r _line; do
    [[ -n "$_line" ]] && warn "$_line"
  done
  # 汇总（子管道内 warn 计数不进主 shell——此处只决定 pass/fail 出口）
  local _big
  _big=$(for _dir in $scan_dirs; do
    [[ -d "${PROJECT_DIR:-.}/${_dir}" ]] || continue
    find "${PROJECT_DIR:-.}/${_dir}" -type f \( -name '*.java' -o -name '*.py' -o -name '*.go' -o -name '*.js' -o -name '*.ts' -o -name '*.kt' \) \
      -not -path '*/node_modules/*' -not -path '*/target/*' -not -path '*/dist/*' -not -path '*/build/*' \
      -not -path '*/vendor/*' -not -path '*/.venv/*' -not -path '*/venv/*' 2>/dev/null | head -200 | while read -r _f; do
      awk -v max="$max_lines" 'BEGIN{s=0;c=0} /^[[:space:]]*(public |private |protected |static |def |func |function |[a-zA-Z_][a-zA-Z0-9_]*\s*\()/ {if(s>0&&NR-s>max)c++; s=NR} END{if(s>0&&NR-s>max)c++; print c+0}' "$_f" 2>/dev/null
    done
  done | awk '{s+=$1} END{print s+0}')
  if [[ "${_big:-0}" -gt 0 ]]; then
    warn "发现 ${_big} 个方法超 ${max_lines} 行（METHOD_MAX_LINES）——拆分职责或抽子方法"
  else
    pass "方法粒度达标（无超 ${max_lines} 行方法）"
  fi
}
# gate: operate
# domain: process / enforce: advisory / tier: explicit
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
  # ② 健康检查端点（HEALTH_CHECK_URLS 配置时 curl 探测，超时 5s）
  # R126-G13：旧实现读单数 HEALTH_CHECK_URL，而 conf 模板/_default_conf/check_shift_left/
  # 文档口径均为复数 HEALTH_CHECK_URLS——用户按模板配置后探测永不生效。改读复数
  # （逐端点探测），单数保留为遗留兼容回退。
  if [[ ${#HEALTH_CHECK_URLS[@]} -gt 0 ]]; then
    local _op_hc
    for _op_hc in "${HEALTH_CHECK_URLS[@]}"; do
      if command -v curl >/dev/null 2>&1; then
        if curl -sf --max-time 5 "$_op_hc" >/dev/null 2>&1; then
          pass "健康检查端点可访问（${_op_hc}）"
        else
          warn "健康检查端点不可达（${_op_hc}，环境依赖）"
        fi
      else
        warn "curl 不可用，跳过健康检查探测"
      fi
    done
  elif [[ -n "${HEALTH_CHECK_URL:-}" ]]; then
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
# gate: decision-audit
# domain: process / enforce: advisory / tier: full_tail
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
# gate: cwe-audit
# domain: security / enforce: advisory / tier: compliance
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
# gate: cert-audit
# domain: compliance / enforce: advisory / tier: compliance
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
  local checks=0 warns=0 pendings=0

  _cert_check() { # $1=检查项名 $2=关联门禁 $3=状态(pass/warn/fail/pending) $4=说明
    checks=$((checks + 1))
    case "$3" in
      pass) echo "  ✓ [$1] $2: $4" ;;
      pending) pendings=$((pendings + 1)); echo "  ◻ [$1] $2: 待联检——$4" ;;
      warn) warns=$((warns + 1)); echo "  ⚠ [$1] $2: $4" ;;
      *)    warns=$((warns + 1)); echo "  ✗ [$1] $2: $4" ;;
    esac
  }

  # 等保4级（dengbao4）
  if [[ "$profile" == "dengbao4" || "$profile" == "all" ]]; then
    echo "--- 等保4级（GB/T 22239-2019 9.1.4.x）---"
    _cert_check "数据保密性" "--crypto" "pending" "须 CRYPTO_PROFILE=gm 启用国密 SM4 加密（9.1.4.8），运行 --crypto 联检"
    _cert_check "个人信息保护" "--privacy+--crypto" "pending" "须 --privacy 扫描 + 密码技术保护（9.1.4.11）"
    _cert_check "数据完整性" "--crypto" "warn" "国密 SM3 哈希正向核查（9.1.4.7），须 CRYPTO_PROFILE=gm"
    _cert_check "审计日志留存" "--shift-left" "warn" "spec §21 须声明日志留存≥6个月 + 异地实时备份（9.1.4.3）"
    _cert_check "灾备恢复等级" "--shift-left" "warn" "spec §20 须声明灾备≥4级（9.1.4.9，联动 BCP5级）"
    _cert_check "强制访问控制MAC" "人工核对" "warn" "9.1.4.2 MAC 是 OS/DB 层——人工核对策略配置"
    _cert_check "入侵检测IDS" "人工核对" "warn" "9.1.4.4 HIDS/NIDS 是运行态设施——人工核对"
    _cert_check "可信验证TPM" "人工核对" "warn" "9.1.4.6 可信根是硬件级——人工核对 TPM/TCM 实现"
    _cert_check "介质剩余信息" "人工核对" "warn" "9.1.4.10 密码技术擦除存储介质——人工核对"
    _cert_check "等保4级门禁联检" "--dengbao" "pending" "DENGBAO_LEVEL=4 启用 --dengbao 逐项检查（含 SM4/MFA/审计）"
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
    _cert_check "国密SM2/3/4加密" "--crypto" "pending" "须 CRYPTO_PROFILE=gm（GB/T 39786 8.4 联动）"
    _cert_check "C3信息保护" "--sensitive+--crypto" "pending" "不得明文存储/传输/展示（JR/T 0171 6.1.1 联动）"
    _cert_check "多因素鉴别" "--dengbao" "pending" "须 DENGBAO_LEVEL=3（等保三级 8.1.4.1 d 联动）"
    _cert_check "PAN持卡人数据扫描" "--privacy" "pending" "须 --privacy 扩展 PAN 模式（PCI-DSS Req 3 对标）"
    _cert_check "漏洞管理CVE" "--sbom" "pending" "CVE 阈值门禁（PCI-DSS Req 6 对标）"
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
    _cert_check "持卡人数据PAN扫描" "--privacy" "pending" "须 --privacy 扩展 PAN 模式扫描（Req 3）"
    _cert_check "传输加密" "--security" "pending" "禁用弱 TLS（Req 4）——--security §1.8"
    _cert_check "存储加密" "--crypto" "pending" "AES-256/SM4 加密存储（Req 3）"
    _cert_check "漏洞管理" "--sbom" "pending" "CVE 阈值门禁（Req 6）——--sbom CVE_THRESHOLD"
    _cert_check "访问控制MFA" "--authz" "pending" "缺鉴权/IDOR 检测（Req 7/8）"
    _cert_check "默认密码更改" "--security" "pending" "硬编码密码检测（Req 2）——--security §1.1"
    _cert_check "审计日志留存≥1年" "--shift-left" "warn" "spec §21 须声明日志留存≥1年（Req 10）"
    _cert_check "安全策略文档" "--compliance" "warn" "spec §22 须含安全策略声明（Req 12）"
  fi

  # ISO 27001:2022（iso27001）
  if [[ "$profile" == "iso27001" || "$profile" == "all" ]]; then
    echo "--- ISO/IEC 27001:2022 技术控制（Annex A.8）---"
    _cert_check "A.8.5身份验证" "--authz" "pending" "授权类门禁覆盖"
    _cert_check "A.8.7恶意代码" "--security/--sbom" "pending" "安全扫描+SBOM CVE 覆盖"
    _cert_check "A.8.8漏洞管理" "--sbom" "pending" "CVE 阈值门禁"
    _cert_check "A.8.11数据掩码" "--privacy" "pending" "PII 扫描覆盖"
    _cert_check "A.8.23 Web安全" "--security" "pending" "XSS/CSRF/注入检测"
    _cert_check "A.8.24密码学" "--crypto" "pending" "弱算法+国密检查"
    _cert_check "A.8.25-28安全SDLC" "--security+--shift-left" "pending" "安全开发+左移覆盖"
    _cert_check "A.8.33测试数据保护" "--privacy" "pending" "测试目录 PII 扫描"
    _cert_check "A.8.9配置管理" "--security" "warn" "调试模式/CORS 检测（部分）"
    _cert_check "A.8.15日志记录" "--shift-left" "warn" "spec §21 日志声明"
    _cert_check "A.8.31环境分离" "人工核对" "warn" "开发/测试/生产分离——人工核查配置"
    _cert_check "A.8.32变更管理" "--shift-left" "warn" "spec §20 变更左移声明"
    _cert_check "A.8.16监控/IDS" "人工核对" "warn" "入侵检测是运行态设施——人工核对"
    _cert_check "A.8.21网络隔离" "人工核对" "warn" "网络隔离是网络设施——人工核对"
  fi

  echo ""
  echo "  汇总：${checks} 项检查（${pendings} 项待联检，${warns} 项须人工核对/声明补全），fail-closed 项由各门禁独立判定"
  echo "  边界：认证本身需机构测评/审计（等保测评机构/PCI QSA/ISO 27001 认证机构），本门禁是门禁级可查+文档锚点"
}
# gate: pr-quality
# domain: quality / enforce: advisory / tier: explicit
check_pr_quality() {

  if [[ "$_AI_JUDGMENT" == "1" ]]; then
    _ai_hint "check_pr_quality" "AI 看 git diff 三指标：①是否超过 500 行（建议拆 PR）②是否含 >3 个无关改动 ③重复模式（同一文件改 3+ 处相似逻辑）；给一句判断"
  return 0
  fi
  # 机械分支已随 GATE_AI_JUDGMENT 恒 1 退役删除（D1 落地化——AI 判断引导为唯一模式）

}
# gate: skill-supply-chain
# domain: security / enforce: advisory / tier: explicit
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
  [[ $found -eq 0 ]] && { pass "Skill 供应链安全审计通过（无恶意模式，溯源登记完整）"; return 0; }
}
# gate: state-phase
# domain: process / enforce: advisory / tier: full_tail
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
# gate: upstream-baseline
# domain: process / enforce: advisory / tier: explicit
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
# gate: learnings
# domain: process / enforce: advisory / tier: explicit
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
          recent=$(echo "$ln" | sed 's/.*RECENT:\([0-9]*\).*/\1/')
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
