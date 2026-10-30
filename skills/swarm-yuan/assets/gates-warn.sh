# GENERATED gates-warn.sh — source: assets/gates/ + gates.tsv; do not edit
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
_gate_src_files() { # stdout=待扫描源码清单（WRITABLE_DIRS 展开，统一排除构建/依赖面；上限 200 文件同其他门禁）
  # 用 [*] + 分词而非 [@]：conf 里既可能是数组 WRITABLE_DIRS=("a" "b")，也可能是标量 "a b"，
  # 取 [*] 后按空白切分两种形态都成立（与 check_method_size 既有取法一致）。
  local dir dirs="${WRITABLE_DIRS[*]:-}"
  for dir in $dirs; do
    [[ -n "$dir" && -d "${PROJECT_DIR:-.}/${dir}" ]] || continue
    find "${PROJECT_DIR:-.}/${dir}" -type f \( -name '*.java' -o -name '*.py' -o -name '*.go' -o -name '*.js' -o -name '*.ts' -o -name '*.kt' -o -name '*.vue' \) \
      -not -path '*/node_modules/*' -not -path '*/target/*' -not -path '*/dist/*' -not -path '*/build/*' \
      -not -path '*/vendor/*' -not -path '*/.venv/*' -not -path '*/venv/*' -not -path '*/coverage/*' 2>/dev/null | head -200
  done
}
_complexity_scan() { # $1=决策点上限；stdout=「file:line 决策点 N > 上限 M（启发式）」
  # 决策 58：与 ub-mode crapper 对齐的「复杂度可见化」维度，只做可算准的近似——
  # 决策点=控制关键字（边界匹配）+ && / || / ? 的出现次数；纯注释行跳过，行内尾注释不剥离。
  # 单 awk 进程扫完整批文件（逐行起 grep 在 200 文件量级会拖垮门禁）；FNR==1 重置函数状态。
  local max="$1"
  [[ "${max:-0}" -gt 0 ]] || return 0
  local _files=() _f
  while IFS= read -r _f; do
    [[ -n "$_f" && -f "$_f" ]] && _files+=("$_f")
  done <<< "$(_gate_src_files)"
  [[ ${#_files[@]} -gt 0 ]] || return 0
  awk -v max="$max" '
    function kwc(s, k,   t) { t = " " s " "; return gsub("[^A-Za-z0-9_]" k "[^A-Za-z0-9_]", "", t) }
    function dec(s,   n, t) {
      n = kwc(s, "if") + kwc(s, "elif") + kwc(s, "for") + kwc(s, "while") \
        + kwc(s, "case") + kwc(s, "when") + kwc(s, "catch") + kwc(s, "except")
      t = s; n += gsub(/&&/, "", t)
      t = s; n += gsub(/[|][|]/, "", t)
      t = s; n += gsub(/[?]/, "", t)
      return n
    }
    function flush() {
      if (in_fn && n > max) printf "%s:%d 决策点 %d > 上限 %d（启发式）\n", cur, start, n, max
    }
    FNR == 1 { flush(); cur = FILENAME; in_fn = 0; n = 0; start = 0 }   # 先按旧文件名冲刷上一文件的末函数，再切到新文件
    # 函数起始三条：①修饰符开头（public/private/protected/static/def/func/function）
    # ②控制关键字开头的行（if(/for( 等）只算决策点，不算起始——否则函数被切碎
    # ③裸标识符开头：仅当行尾为 { 或 : 才算声明（排除 log(...) 这类调用语句把函数切断）
    /^[[:space:]]*(public |private |protected |static |def |func |function )/ { flush(); in_fn=1; start=FNR; n=0; next }
    /^[[:space:]]*(if|for|while|switch|catch|else|elif|when|case|return|new|print|puts|console)[[:space:]]*\(/ { if (in_fn) n += dec($0); next }
    /^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*[[:space:]]*\(/ {
      if ($0 ~ /[{:]$/) { flush(); in_fn=1; start=FNR; n=0; next }
      if (in_fn) n += dec($0)
      next
    }
    { if (!in_fn) next
      if ($0 ~ /^[[:space:]]*(#|\/\/|\/\*|\*|--)/) next
      n += dec($0) }
    END { flush() }
  ' "${_files[@]}" 2>/dev/null
}
_duplication_scan() { # $1=最小重复块行数；stdout=「a:b 与 c:d 连续 N 行归一化后完全相同」
  # 决策 58：Type-1 精确重复块粗筛（忽略空白/纯注释行后的逐行精确相同），只抓复制粘贴；
  # 改名/改结构的 Type-2/3 相似重复须外部 DUPLICATION_CMD（jscpd/CPD/dupl 等）。
  # 单 awk 进程跨全部文件建立首现表——跨文件复制才检测得到（逐文件起进程会漏跨文件）。
  local minb="${1:-0}"
  [[ "${minb:-0}" -ge 2 ]] || return 0
  local _files=() _f
  while IFS= read -r _f; do
    [[ -n "$_f" && -f "$_f" ]] && _files+=("$_f")
  done <<< "$(_gate_src_files)"
  [[ ${#_files[@]} -gt 0 ]] || return 0
  awk -v n="$minb" '
    FNR == 1 { cnt = 0 }
    {
      line = $0
      if (line ~ /^[[:space:]]*$/) next
      if (line ~ /^[[:space:]]*(#|\/\/|\/\*|\*|--)/) next
      sub(/^[[:space:]]+/, "", line); sub(/[[:space:]]+$/, "", line); gsub(/[[:space:]]+/, " ", line)
      if (length(line) == 0) next
      slot = cnt % (n - 1)
      buf[slot] = line
      ln[slot] = FNR
      cnt++
      if (cnt < n) next
      key = ""
      for (j = 0; j < n - 1; j++) { idx = (cnt - (n - 1) + j) % (n - 1); key = key "\034" buf[idx] }
      key = key "\034" line
      if (length(key) < n * 4) next
      sline = ln[(cnt - (n - 1)) % (n - 1)]
      if (key in first_f) {
        # 同一段重复的滑动窗口只报一次：与上一次命中同文件且相距不足 n 行则不再报（冷却），
        # 否则 7 行重复块会按窗口逐条复报（实测 2 条同一处）
        if (!(first_f[key] == FILENAME && first_l[key] == sline) \
            && (FILENAME != hit_f || FNR - hit_end >= n)) {
          printf "%s:%d 与 %s:%d 连续 %d 行归一化后完全相同\n", first_f[key], first_l[key], FILENAME, sline, n
          hit_f = FILENAME; hit_end = FNR
        }
      } else { first_f[key] = FILENAME; first_l[key] = sline }
    }
  ' "${_files[@]}" 2>/dev/null
}
_duplication_cmd_check() { # 外部重复检测工具：百分比与阈值都到位才判定；只配命令不配阈值→未标定 warn
  local cmd="${DUPLICATION_CMD:-}" maxpct="${DUPLICATION_MAX_PCT:-0}"
  [[ -n "$cmd" ]] || return 0
  case "$maxpct" in ''|*[!0-9]*) maxpct=0 ;; esac
  if [[ "$maxpct" -le 0 ]]; then
    warn "gate_reuse_duplication: DUPLICATION_CMD 已配置但 DUPLICATION_MAX_PCT 未标定（=0）——工具默认阈值不能当规则值（ub-mode 的 dryer 默认 0.82、规则要求 0.8 同类坑），请显式标定后再启用判定"
    return 0
  fi
  local out rc pct
  out=$(eval "$cmd" 2>&1 | tail -40) && rc=0 || rc=1
  printf '%s\n' "$out"
  if [[ "$rc" -ne 0 ]]; then
    warn "gate_reuse_duplication: DUPLICATION_CMD 执行失败（rc=${rc}）——修复工具链，或清空 DUPLICATION_CMD 并在 spec 留痕"
    return 0
  fi
  pct=$(printf '%s\n' "$out" | grep -oE '[0-9]+([.][0-9]+)?[[:space:]]*%' | tail -1 | grep -oE '[0-9]+([.][0-9]+)?' || true)
  if [[ -z "$pct" ]]; then
    warn "gate_reuse_duplication: 未从 DUPLICATION_CMD 输出解析到重复率百分比（阈值 ${maxpct}%）——确认报告格式（jscpd/CPD/dupl 均支持百分比输出）"
    return 0
  fi
  if awk -v p="$pct" -v m="$maxpct" 'BEGIN{exit !(p>m)}'; then
    warn "gate_reuse_duplication: 重复率 ${pct}% > 阈值 ${maxpct}%——抽公共逻辑或删掉复制块（相似度阈值口径见 clean-code-metrics-methodology §四）"
  else
    pass "重复率 ${pct}% ≤ 阈值 ${maxpct}%"
  fi
}
# gate: scope
# domain: process / enforce: warn / tier: core
check_scope() {
  echo "=== 改动范围检查 ==="
  local readonly_violation=0
  # 在 PROJECT_DIR 下检查 git diff，看是否有改动落在只读目录
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    local changed; changed=$(_git_changed_files)
    # 两类工具链自有路径不属项目只读语义（列只读即每轮自干扰永久红）——
    # ① 运行时账本 .swarm-yuan/**：门禁与 hook 自写（trace/审计/flag/指纹/记忆写回），
    #    防篡改靠链式锚定与审计兜底，不靠 scope 门；
    # ② 技能资产 .agents/skills/**（含 .claude/skills/.codex/skills）：create/upgrade/--persist 的合法写入面，
    #    防手改由 integrity-guard（deny/advisory）与升级机制守卫——分层执法，scope 不重复兜。
    changed=$(printf '%s\n' "$changed" | grep -vE '^(\.agents/skills/|\.claude/skills/|\.codex/skills/|\.swarm-yuan/)' || true)
    if [[ -n "$changed" ]]; then
      for rd in ${READONLY_DIRS[@]+"${READONLY_DIRS[@]}"}; do
        [[ -z "$rd" ]] && continue
        # 只读目录可能是路径前缀（如 node_modules/ 或 upstream/）
        # R128：前缀判定改 bash 字面比较——旧版把 conf 值直接插进 ERE，目录名含 . [ + 等元字符
        # 即误配（假阳性），正则非法时 grep rc=2 被 || true 吞成「无违规」（假阴性）；conf 值是数据不是模式。
        local viol="" _ln _rdn="${rd%/}"
        while IFS= read -r _ln; do
          [[ -z "$_ln" ]] && continue
          if [[ "$_ln" == "$_rdn" || "$_ln" == "$_rdn/"* ]]; then
            viol="${viol}${viol:+$'\n'}${_ln}"
          fi
        done <<< "$changed"
        if [[ -n "$viol" ]]; then
          fail "只读目录有改动: ${rd}"
          echo "$viol" | head -10 | sed 's/^/    /'
          readonly_violation=1
        fi
      done
    fi
  else
    # 非 git 仓库：降级为检查只读目录是否有新文件（对比 gitignore 或 mtime）
    for rd in ${READONLY_DIRS[@]+"${READONLY_DIRS[@]}"}; do
      [[ -d "$rd" ]] || continue
      warn "非 git 仓库，只读目录 $rd 无法自动检测改动"
    done
  fi
  [[ $readonly_violation -eq 0 ]] && { pass "只读目录无改动"; return 0; }
}
# gate: spec-first
# domain: process / enforce: warn / tier: core
check_spec_first() {
  echo "=== spec-first 流程门（L3 门禁时强拦，R101）==="
  local _sr="${SPEC_REQUIRED:-}"
  # R128：占位符剥离收敛到 spec-first-lib spf_strip_placeholder（precheck.sh source 本文件前
  # 已加载判定库）；command -v 守卫=库缺失时不剥不炸（set -e 安全，同下方 spf_* 缺失守卫）。
  command -v spf_strip_placeholder >/dev/null 2>&1 && _sr="$(spf_strip_placeholder "${_sr}")"
  if [[ "$_sr" != "1" ]]; then
    skip_if_unconfigured "SPEC_REQUIRED 未启用（conf 置 1 开启——与 fail-gate-hook/pre-commit/state-machine 同开关）"
    return 0
  fi
  if [[ -z "${WRITABLE_DIRS[*]:-}" ]]; then
    skip_if_unconfigured "WRITABLE_DIRS 未配置（spec-first 检测面为空）"
    return 0
  fi
  if ! command -v spf_find_approved_spec >/dev/null 2>&1; then
    skip_if_unconfigured "spec-first-lib.sh 缺失（判定面不可用，生成物成套分发被破坏）"
    return 0
  fi
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    skip_if_unconfigured "非 git 仓库（无变更检测面；L2 pre-commit 亦不适用）"
    return 0
  fi
  local _root="${PROJECT_DIR:-$(pwd)}"
  local _changed _hit=""
  _changed=$(_git_changed_files)
  # 与 check_scope 同款豁免过滤：工具链自有路径（.swarm-yuan/.agents/skills/.claude/skills/.codex/skills）
  # 是门禁/hook/技能升级的合法写入面，不属"无 spec 写源码"语义——分层执法，不重复兜。
  _changed=$(printf '%s\n' "$_changed" | grep -vE '^(\.agents/skills/|\.claude/skills/|\.codex/skills/|\.swarm-yuan/)' || true)
  local _f
  while IFS= read -r _f; do
    [[ -z "${_f:-}" ]] && continue
    # _git_changed_files 给仓库相对路径；spf_path_in_dirs 按绝对路径段匹配——补根再判（同 L2）
    if spf_path_in_dirs "${_root}/${_f}" "$_root" "${WRITABLE_DIRS[*]}"; then _hit="$_f"; break; fi
  done <<< "$_changed"
  if [[ -z "$_hit" ]]; then
    pass "spec-first: git 变更未触及可写源码区（WRITABLE_DIRS）"
    return 0
  fi
  local _sg="${SPEC_GLOB:-}"
  # R128：占位符剥离收敛（同上方 _sr——spec-first-lib spf_strip_placeholder，守卫式调用）。
  command -v spf_strip_placeholder >/dev/null 2>&1 && _sg="$(spf_strip_placeholder "${_sg}")"
  _sg="${_sg:-docs/specs/*.md}"
  local _approved=""
  # R109-D8 spec-变更关联（与 L2 同源 spec-first-lib）：特性分支上治理 spec 须在变更集
  # （staged ∪ 本分支 diff ∪ untracked——门禁时开发中态的 spec 已写未提交也认）；
  # 基分支保留存在性（主干直提交归分支门，合并后全量复查按宽口径放行）。
  # --no-verify 逃逸的提交在 L3 被抓：分支 diff 有源码无 spec 即 fail（比存在性更强）。
  # conf 路径=本文件同目录（生成器 assets/ 与目标技能 scripts/ 两布局皆然）——BASE_BRANCH 优先级来源。
  local _CONF_PATH
  _CONF_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)/precheck.conf"
  [[ -f "$_CONF_PATH" ]] || _CONF_PATH=""
  if spf_on_base_branch "$_root" "$_CONF_PATH"; then
    _approved="$(spf_find_approved_spec "$_root" "$_sg")"
  else
    _approved="$(spf_find_governing_spec "$_root" "$_sg" 'staged branch untracked' "$_CONF_PATH")"
  fi
  if [[ -n "$_approved" ]]; then
    # DESIGN_SYNC 二段核验（与 L2 同判据 spec-first-lib；关联面=门禁态 staged∪branch∪untracked，worktree 视图）。
    # 治理 spec 选择器排除 DESIGN_DOCS（正本自身常含「## 决策记录」章会抢注 governing 选择——
    # 正本是被同步对象不是治理 spec，2026-10-26 立法轮实证）；无治理 spec 但变更集触及 DESIGN_DOCS
    # =正本修订无声明治理，同拦（unowned-doc-change）。
    if command -v spf_design_sync_check >/dev/null 2>&1; then
      local _ds_violation _ds_docs _ds_req _ds_spec _ds_f _d
      _ds_docs="$(spf_design_docs "$_CONF_PATH")"
      _ds_req="$(spf_conf_val "$_CONF_PATH" DESIGN_SYNC_REQUIRED)"
      if [[ "$_ds_req" == "1" && -n "$_ds_docs" ]]; then
        if spf_on_base_branch "$_root" "$_CONF_PATH"; then
          _ds_spec=""
        else
          _ds_spec="$(spf_find_governing_spec "$_root" "$_sg" 'staged branch untracked' "$_CONF_PATH" worktree $_ds_docs)"
        fi
        _ds_violation=""
        if [[ -n "$_ds_spec" ]]; then
          _ds_violation="$(spf_design_sync_check "$_root" "$_CONF_PATH" "$_ds_spec" 'staged branch untracked' worktree)"
        else
          while IFS= read -r _ds_f; do
            [[ -z "${_ds_f:-}" ]] && continue
            for _d in $_ds_docs; do
              [[ "$_ds_f" == "$_d" ]] && _ds_violation="unowned-doc-change: ${_ds_f} 设计文档修订无治理 spec（须有 spec 以「设计文档影响」段声明 DESIGN_SYNC: touched 治理本批修订——先 spec 再改正本）"
            done
          done <<< "$(spf_changed_files "$_root" 'staged branch untracked' "$_CONF_PATH")"
        fi
        if [[ -n "$_ds_violation" ]]; then
          fail "gate_design_sync: ${_ds_violation}——解除：写治理 spec 声明/并入设计文档修订/改声明 none 附理由（节点⑦审查背书）；开关 DESIGN_SYNC_REQUIRED/DESIGN_DOCS（precheck.conf）"
          return 0
        fi
      fi
    fi
    pass "spec-first: 可写区变更有变更集内已批准 spec（${_approved}）"
  else
    fail "gate_spec_first_missing: git 变更触及可写源码区（如 ${_hit}）但本变更集无已批准 spec（须含「## 决策记录」段且非占位；R109-D8 起=spec 须随本分支提交/staged/untracked 携带，历史 spec 不再放行）——先 spec 再编码；四层拦截同判据（L1 写时 hook/L2 提交时 pre-commit/本门/L4 状态机 build 准入）"
  fi
}
# gate: build
# domain: quality / enforce: warn / tier: core
check_build() {
  echo "=== 构建状态检查 ==="
  if [[ -z "$BUILD_CMD" || "$BUILD_CMD" == "<build 命令>" ]]; then
    echo "  (跳过：未配置 BUILD_CMD)"
    return
  fi
  # 显式捕获退出码——原实现
  # `if eval "$BUILD_CMD" | tail` 判的是管道尾命令（tail）的退出码，正确性依赖外层
  # pipefail 的间接传导；且命令不存在（127）与构建失败同词"构建失败"，排障方向不明。
  # 拆分捕获：127 单列（命令缺失→指向工具链/conf），其余才报"构建失败"。
  local _bout _brc
  _bout=$(eval "$BUILD_CMD" 2>&1 | tail -10) && _brc=0 || _brc=1
  printf '%s\n' "$_bout"
  if [[ "$_brc" -eq 0 ]]; then
    pass "构建通过"
  elif printf '%s\n' "$_bout" | grep -qiE 'command not found|未找到命令'; then
    fail "构建命令不可执行（command not found）：$BUILD_CMD——安装对应工具链或回生成流程 Step 8 修 conf（命令缺失≠构建失败，排障方向不同）"
  else
    fail "构建失败"
  fi
}
# gate: sensitive
# domain: security / enforce: warn / tier: core
check_sensitive() {
  echo "=== 敏感信息脱敏扫描（check §4 UI脱敏/日志）==="
  # 工具链降级：SENSITIVE_TOOL=auto/builtin/gitleaks；auto=有 gitleaks 用 gitleaks，否则内置
  # 内置路径（下方原逻辑）行为一字不变；gitleaks 执行失败降级内置（不静默 fail-open）
  local _sensitive_tool="${SENSITIVE_TOOL:-auto}"
  if [[ "$_sensitive_tool" == "auto" ]]; then
    if command -v gitleaks >/dev/null 2>&1; then _sensitive_tool="gitleaks"; else _sensitive_tool="builtin"; fi
  elif [[ "$_sensitive_tool" == "gitleaks" ]] && ! command -v gitleaks >/dev/null 2>&1; then
    warn "SENSITIVE_TOOL=gitleaks 但 gitleaks 未安装，降级内置正则扫描"
    _sensitive_tool="builtin"
  fi
  if [[ "$_sensitive_tool" == "gitleaks" ]]; then
    local _gitleaks_rc=0
    _check_sensitive_gitleaks || _gitleaks_rc=$?
    case "$_gitleaks_rc" in
      3)
        # gitleaks 已 fail → 跳过内置正则，避免重复报同一文件
        return ;;
      1)
        warn "gitleaks 执行失败，降级内置正则扫描" ;;
      2)
        : ;;  # SCAN_DIRS 空，落入内置路径的同文案披露
      0)
        # 修复（安全）：gitleaks 通过**不再 return**，继续叠加内置正则族。
        # 两者互补：gitleaks 强在熵检测/已知密钥格式（sk-/AKIA/JWT 等），
        # 内置正则强在自定义模式（yml 的 password: 键、mongodb:// 内联凭证等）。
        # 与 check_security 同款修复（原"工具通过就 return"把互补做成互斥二选一）。
        echo "  ⓘ gitleaks 通过，继续内置正则族扫描（熵检测 + 自定义模式叠加，非二选一）" ;;
    esac
  fi
  local patterns=(
    'sk-[a-zA-Z0-9]{20,}'
    'AKIA[0-9A-Z]{16}'
    'password\s*[:=]\s*['\''"][^'\'']{4,}'
    'api[_-]?key\s*[:=]\s*['\''"][^'\'']{8,}'
    'secret\s*[:=]\s*['\''"][^'\'']{8,}'
    'token\s*[:=]\s*['\''"][^'\'']{16,}'
    'mongodb(\+srv)?://[^/\s]+:[^/@\s]+@'
    'redis://[^:\s]+:[^@\s]+@'
    'postgres(ql)?://[^/\s]+:[^/@\s]+@'
    # R118：无引号的 .env/YAML 赋值（旧版只认引号值，API_KEY=... 整类漏报）
    '[A-Za-z0-9_]*(api[_-]?key|secret|token|password|passwd|pwd)[A-Za-z0-9_]*[[:space:]]*[:=][[:space:]]*[A-Za-z0-9+/=_-]{12,}'
    # R118：补齐主流云/JWT/私钥格式（gitleaks 不可用时的内置面）
    'AIza[0-9A-Za-z_-]{35}'
    '(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}'
    'xox[baprs]-[A-Za-z0-9-]{10,}'
    'AccountKey=[A-Za-z0-9+/=]{40,}'
    'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
    '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  )
  local found=0 _existing=0 dir
  for dir in ${SCAN_DIRS[@]+"${SCAN_DIRS[@]}"}; do
    [[ -d "$dir" ]] && _existing=$((_existing+1))
  done
  # R118：空配置=未执行（skip，不打印“未发现”）；配了但目录全不存在=配置错误（fail）。
  if [[ ${#SCAN_DIRS[@]} -eq 0 ]]; then
    skip_if_unconfigured "SCAN_DIRS 未配置，敏感信息扫描未执行"
    return
  fi
  if [[ "$_existing" -eq 0 ]]; then
    fail "gate_sensitive_dirs_missing: SCAN_DIRS 配置的目录全部不存在：${SCAN_DIRS[*]}"
    return
  fi
  for dir in "${SCAN_DIRS[@]}"; do
    [[ -d "$dir" ]] || continue
    for pattern in "${patterns[@]}"; do
      local matches _hits _hi_conf
      # R138 高置信分流：结构化密钥格式（AKIA/sk-/ghp_/AIza/xox/AccountKey/JWT/PEM）命中即
      # 高置信，不再走「表达式赋值排除」——`secret: env.X ?? 'AKIA…'` 这类 env 兜底字面量
      # （TS 生态标准写法）曾被排除管道整行吞掉（行内有 process. 形态即排除整行），密钥漏报。
      # 高置信行仅保留测试路径排除与用户豁免；低置信行（password:/api_key: 键值族）维持原四层排除。
      _hi_conf='AKIA[0-9A-Z]{16}|sk-[a-zA-Z0-9]{20,}|AIza[0-9A-Za-z_-]{35}|(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}|xox[baprs]-[A-Za-z0-9-]{10,}|AccountKey=[A-Za-z0-9+/=]{40,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|BEGIN [A-Z ]*PRIVATE KEY'
      _hits=$(grep -rniE "$pattern" "$dir" \
        --include='*.ts' --include='*.vue' --include='*.svelte' --include='*.js' --include='*.mjs' \
        --include='*.patch' --include='*.py' --include='*.go' --include='*.rs' \
        --include='*.scss' --include='*.java' --include='*.json' --include='*.yml' --include='*.yaml' \
        --include='*.properties' --include='*.toml' --include='*.ini' --include='*.conf' --include='*.cfg' \
        --include='*.pem' --include='*.key' --include='*.sh' --include='*.xml' \
        --include='*.env' --include='.env' --include='.env.*' \
        --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.venv --exclude-dir=venv --exclude-dir=site-packages --exclude-dir=__pycache__ --exclude-dir=.tox --exclude-dir=dist --exclude-dir=build --exclude-dir=target --exclude-dir=vendor 2>/dev/null || true)
      matches=$(
        {
          printf '%s\n' "$_hits" | grep -E "$_hi_conf" \
            | grep -viE '(^|/)(tests?|testdata|__tests__|__mocks__|fixtures?|mocks?|examples?)(/|:)|(^|/)(test|spec)\.[a-z]+:|\.(test|spec)\.[a-z]+:|_test\.[a-z]+:'
          printf '%s\n' "$_hits" | grep -vE "$_hi_conf" \
            | grep -viE '(^|/)(tests?|testdata|__tests__|__mocks__|fixtures?|mocks?|examples?)(/|:)|(^|/)(test|spec)\.[a-z]+:|\.(test|spec)\.[a-z]+:|_test\.[a-z]+:' \
            | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|#|/\*|\*)' \
            | grep -viE 'example|placeholder|dummy|<[^>]*>' \
            | grep -vE '[:=][[:space:]]*[A-Za-z_][A-Za-z0-9_]*[[:space:]]*[.(]'
        } 2>/dev/null | grep -v '^$' || true)
      # R118-D3（nest-forge 实证）：SENSITIVE_EXCLUDE_GLOBS 项目级豁免此前只对 gitleaks
      # 子路径生效，内置正则族路径零消费——测试夹具密码（*.spec.ts 内 password: 'xxx'）
      # 无法经 conf 豁免，内置路径必然 fail。上方已按 path:line: 的路径段过滤测试固件；
      # 此处再消费 SENSITIVE_EXCLUDE_GLOBS 精确豁免（grep -vF 同款）。
      if [[ -n "$matches" ]]; then
        if [[ ${#SENSITIVE_EXCLUDE_GLOBS[@]} -gt 0 ]]; then
          local _xgl2
          for _xgl2 in "${SENSITIVE_EXCLUDE_GLOBS[@]}"; do
            matches=$(printf '%s\n' "$matches" | grep -vF "$_xgl2" || true)
          done
          unset _xgl2
        fi
      fi
      if [[ -n "$matches" ]]; then
        fail "疑似敏感信息 ($dir):"
        echo "$matches" | head -10
        found=1
      fi
    done
  done
  [[ $found -eq 0 ]] && { pass "未发现明显敏感信息"; return 0; }
}
# gate: deps
# domain: process / enforce: warn / tier: core
check_deps() {
  # 非 git 仓库时依赖类门禁依赖 git 历史——诚实降级披露（fail-open 但须可见）
  if ! git rev-parse --git-dir >/dev/null 2>&1; then
    warn "check_deps: 非 git 仓库（--deps/--stable-diff 依赖 git 历史，本仓失能——人工核对依赖与稳定标注）"
    return 0
  fi
  echo "=== 依赖版本锁定检查（铁律：未经确认不得升级/更换核心依赖）==="
  local found=0

  # 定位基线 codebase.md
  local baseline_file=""
  if [[ -n "${CODEBASE_REF:-}" && -f "$CODEBASE_REF" ]]; then
    baseline_file="$CODEBASE_REF"
  else
    local cand
    cand=$(find "$PROJECT_DIR/.claude/skills" -name codebase.md -path '*/references/*' 2>/dev/null | head -n 1 || true)
    [[ -n "$cand" ]] && baseline_file="$cand"
    # 自定义 target-dir 生成的技能不在
    # 默认安装位 .claude/skills/ 下，find 失明致 warn——技能自带 references/codebase.md 即基线
    # （生成物自包含）。技能根绝对路径用 _CONF_DIR（precheck.sh:338 启动期解析，cd $PROJECT_DIR
    # 后仍有效；BASH_SOURCE 相对路径此时已失效）。
    if [[ -z "$baseline_file" ]]; then
      local _self_dir
      _self_dir="${_CONF_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)}"
      [[ -f "$_self_dir/../references/codebase.md" ]] && baseline_file="$_self_dir/../references/codebase.md"
    fi
  fi
  if [[ -z "$baseline_file" ]]; then
    warn "未找到 codebase.md 版本基线（设置 CODEBASE_REF 或确保 .claude/skills/<skill>/references/codebase.md 存在）"
    return 0
  fi

  # 版本约束声明文件（spec）——记录经用户确认允许变更的依赖及理由
  local spec_file=""
  if [[ -n "${SPEC_FILE:-}" && -f "$SPEC_FILE" ]]; then
    spec_file="$SPEC_FILE"
  else
    local cand2
    # R126-G15：旧 `grep -iE 'spec'` 子串匹配把 inspect.md/prospective.md 等无关文档
    # 误当版本约束声明 spec，命中后依赖升级被误报"未在 spec 声明"。收紧为文件名级
    # 词边界匹配（spec/specs 前后须是非字母数字分隔符；目录名 specs/ 仍命中）。
    cand2=$(find "$PROJECT_DIR/.claude/skills" -type f -name '*.md' 2>/dev/null | grep -iE '(^|/|[-_.])(spec|specs)([-_.]|$)' | head -n 1 || true)
    [[ -n "$cand2" ]] && spec_file="$cand2"
    # 同源兜底：自定义 target-dir 失明时走项目 SPEC_GLOB 约定位（版本约束声明在 spec §5.6）
    if [[ -z "$spec_file" ]]; then
      local _sf
      for _sf in "${PROJECT_DIR}"/${SPEC_GLOB:-docs/specs/*.md}; do
        [[ -f "$_sf" ]] && { spec_file="$_sf"; break; }
      done
    fi
  fi

  # 从 codebase.md 技术栈版本表提取 name<TAB>version 基线对（跨平台 awk，按 | 分列）
  # 表格行形如: | react | 18.2.0 | 核心 |  → $2=依赖名 $3=版本
  # 注意：v 中的空格必须 trim，否则 _norm_ver 的 sed 会误切
  local baseline_pairs
  baseline_pairs=$(awk -F'|' '
    /^\|.*\|.*[0-9]+\.[0-9]+.*\|/ {
      n=$2; v=$3;
      sub(/^[[:space:]]+/,"",n); sub(/[[:space:]]+$/,"",n);
      sub(/^[[:space:]]+/,"",v); sub(/[[:space:]]+$/,"",v);
      sub(/^[~^><=]+/,"",v);
      if(n!="" && v!="" && n !~ /^[-=+]/ && v ~ /^[0-9]+/) print n"\t"v
    }
  ' "$baseline_file" 2>/dev/null | sort -u || true)

  # 收集项目依赖清单文件（排除 node_modules / upstream / .git）
  local dep_files
  dep_files=$(find "$PROJECT_DIR" -maxdepth 3 \
    \( -name package.json -o -name pyproject.toml -o -name go.mod -o -name requirements.txt -o -name Cargo.toml -o -name pom.xml -o -name build.gradle -o -name build.gradle.kts \) \
    2>/dev/null | grep -vE 'node_modules|/upstream/|/\.git/' || true)

  local df name ver base_ver ver_clean base_clean declared
  for df in $dep_files; do
    [[ -f "$df" ]] || continue
    local cur; cur=$(_extract_deps "$df" | sort -u)
    [[ -z "$cur" ]] && continue
    # 用 while + 管道避免 set -e 在子进程中触发；process substitution 兼容 bash 4+
    while IFS= read -r dep_line; do
      [[ -z "$dep_line" ]] && continue
      name="${dep_line%%$'\t'*}"
      ver="${dep_line#*$'\t'}"
      [[ -z "$name" || -z "$ver" || "$name" == "$ver" ]] && continue
      ver_clean=$(_norm_ver "$ver")
      base_ver=$(printf '%s\n' "$baseline_pairs" | awk -F'\t' -v n="$name" '$1==n {print $2; exit}')
      [[ -z "$base_ver" ]] && continue   # 基线无记录 → 跳过（新依赖由 --reuse 关注）
      base_clean=$(_norm_ver "$base_ver")
      if [[ "$ver_clean" != "$base_clean" ]]; then
        declared=""
        if [[ -n "$spec_file" && -f "$spec_file" ]]; then
          declared=$(grep -E -- "${name}.*${ver_clean}" "$spec_file" 2>/dev/null | head -n 1 || true)
        fi
        if [[ -z "$declared" ]]; then
          fail "依赖版本被变更但未在 spec 版本约束声明段声明: ${name} 基线=${base_clean} 当前=${ver_clean} (${df})"
          found=1
        fi
      fi
    done <<< "$cur"
  done

  echo "  提示: 版本锁定铁律——功能性开发中不得随意升级/更换核心依赖版本"
  echo "    - 例外仅限：用户主动要求 / 严重安全或性能隐患 / 功能缺失"
  echo "    - 任何版本变更须在 spec 版本约束声明段显式声明理由 + 经用户确认"
  if [[ $found -eq 0 ]]; then
    pass "依赖版本锁定检查通过（未检测到未经声明的版本变更）"
  fi
}
# gate: adr
# domain: architecture / enforce: warn / tier: arch
check_adr() {
  echo "=== 架构决策记录检查（TOGAF：决策可追溯 + 技术债登记）==="
  local found=0

  # ---- 1. ADR 目录必须存在 ----
  if [[ -z "$ADR_DIR" ]]; then
    warn "未配置 ADR_DIR，跳过架构决策检查（生成目标技能时设为 docs/adr 或 adr）"
    return
  fi
  if [[ ! -d "$ADR_DIR" ]]; then
    fail "ADR 目录不存在：${ADR_DIR}（TOGAF 要求架构决策可追溯，须建立 ADR 目录）"
    found=1
    # 后续检查依赖目录存在，直接返回
    if [[ $found -eq 0 ]]; then pass "架构决策记录检查通过"; fi
    return
  fi

  # ---- 2. ADR 文件计数（至少应有 1 个 ADR）----
  local adr_count
  adr_count=$(find "$ADR_DIR" -type f \( -name '*.md' -o -name '*.adoc' \) 2>/dev/null | wc -l | xargs || true)
  if [[ "$adr_count" -eq 0 ]]; then
    warn "${ADR_DIR} 目录无 ADR 文件（在 ADR_DIR 新建 0001-技术栈选择.md + 0002-关键架构决策.md（格式：# ADR-NNNN: 标题 / 状态 / 上下文 / 决策 / 理由））"
  fi

  # ---- 3. 本次引入的新依赖/新框架必须有对应 ADR ----
  # 检测 git diff 中新增的 import 语句（package.json/requirements.txt/go.mod/pyproject.toml）
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    local base; base=$(_git_base)
    local diff_imports
    diff_imports=$(git diff "$base"...HEAD -- '*.ts' '*.js' '*.py' '*.go' 2>/dev/null \
      | grep -E '^\+.*(import|from)\s' \
      | grep -oE "['\"][^'\"./][^'\"]*['\"]" | sed "s/['\"]//g" | sort -u || true)
    # 过滤出"非相对路径"的第三方包（形如 lodash、@scope/pkg）
    local third_party=""
    while IFS= read -r pkg; do
      [[ -z "$pkg" ]] && continue
      # 相对路径（./ ../）跳过；node: 内置跳过
      case "$pkg" in
        ./*|../*|node:*) continue ;;
        @*/*|*) ;;
      esac
      third_party="${third_party}${third_party:+$'\n'}$pkg"
    done <<< "$diff_imports"

    if [[ -n "$third_party" ]]; then
      # 在所有 ADR 文件中搜索这些包名
      local adr_all; adr_all=$(cat "$ADR_DIR"/*.md "$ADR_DIR"/*.adoc 2>/dev/null || true)
      local unexplained=""
      while IFS= read -r pkg; do
        [[ -z "$pkg" ]] && continue
        if ! echo "$adr_all" | grep -qF -- "$pkg"; then
          unexplained="${unexplained}${unexplained:+$'\n'}$pkg"
        fi
      done <<< "$third_party"
      if [[ -n "$unexplained" ]]; then
        warn "本次新增以下第三方依赖未在 ADR 中说明选型理由（TOGAF 要求技术选型有决策记录）："
        echo "$unexplained" | sed 's/^/    - /'
        echo "  建议：在 ${ADR_DIR}/ 新增 ADR，记录为何选这些包（替代方案/权衡/影响）"
      fi
    fi
  fi

  # ---- 4. 技术债登记检查 ----
  if [[ -n "$TECH_DEBT_FILE" ]]; then
    if [[ ! -f "$TECH_DEBT_FILE" ]]; then
      warn "技术债登记文件不存在：${TECH_DEBT_FILE}（绕过架构决策的临时代码应在技术债登记，便于追踪）"
    else
      local td_count; td_count=$(grep -cE '^\s*[-*]\s' "$TECH_DEBT_FILE" 2>/dev/null || true)
      # 检测代码中是否有 TODO/FIXME/HACK 但未在技术债登记
      local code_todos
      code_todos=$(_scan_src 'TODO|FIXME|HACK|XXX' 'ts,js,py,go' 'node_modules\|\.patch' "${WRITABLE_DIRS[@]+"${WRITABLE_DIRS[@]}"}" | wc -l | xargs || true)
      if [[ "$code_todos" -gt 0 ]]; then
        warn "代码中有 ${code_todos} 处 TODO/FIXME/HACK——在 TECH_DEBT_FILE 追加条目：格式 '- [ ] 文件:行号 TODO内容 计划修复时间'（当前技术债条目 ${td_count} 个）"
      fi
    fi
  fi

  if [[ $found -eq 0 ]]; then
    pass "架构决策记录检查通过（${adr_count} 个 ADR）"
  fi
}
# gate: contract
# domain: architecture / enforce: warn / tier: arch
check_contract() {
  echo "=== 接口契约检查（TOGAF：契约版本化 + 防腐层 ACL）==="
  local found=0 _contract_checked=0

  # ---- 1. 契约文件版本化检查 ----
  if [[ -z "$CONTRACT_DIR" ]]; then
    warn "未配置 CONTRACT_DIR，跳过接口契约检查（生成目标技能时设为 docs/contracts）"
  elif [[ ! -d "$CONTRACT_DIR" ]]; then
    warn "契约目录不存在：${CONTRACT_DIR}（新建 CONTRACT_DIR/ 并为每个 API 创建 YAML/JSON 文件，必含 version: x.y.z 字段）"
  else
    local contracts; contracts=$(find "$CONTRACT_DIR" -type f \( -name '*.yaml' -o -name '*.yml' -o -name '*.json' -o -name '*.md' \) 2>/dev/null || true)
    if [[ -z "$contracts" ]]; then
      warn "${CONTRACT_DIR} 目录无契约文件"
    else
      _contract_checked=1
      local cf
      while IFS= read -r cf; do
        [[ -z "$cf" ]] && continue
        # 检查是否含 version 字段（yaml/json/md 都查 version 关键字）
        if ! grep -qE 'version\s*[:=]|## v?[0-9]' "$cf" 2>/dev/null; then
          fail "接口契约缺 version 字段：${cf}（TOGAF 要求系统间接口契约可追溯版本，便于变更影响分析）"
          found=1
        fi
      done <<< "$contracts"
    fi
  fi

  # ---- 2. 防腐层（ACL）检查：跨上下文 import 必须经 ACL 目录中转 ----
  if [[ -n "$ACL_DIR" && ${#CONTEXT_DIRS[@]} -gt 0 ]]; then
    if [[ ! -d "$ACL_DIR" ]]; then
      warn "ACL 目录不存在：${ACL_DIR}（新建 ACL_DIR/ 目录，跨上下文 import 须经此目录中转（在 ACL_DIR 为每个外部上下文建 adapter 文件））"
    else
      # 预解析每个上下文目录为绝对路径
      local ctx_abs=()
      local ci
      for ((ci=0; ci<${#CONTEXT_DIRS[@]}; ci++)); do
        local a; a=$(cd "${CONTEXT_DIRS[$ci]}" 2>/dev/null && pwd -P || echo "")
        ctx_abs+=("$a")
      done
      # 对每个上下文目录的文件，检测其 import 是否解析到其他上下文目录
      local i j
      for ((i=0; i<${#CONTEXT_DIRS[@]}; i++)); do
        local ctx_a="${CONTEXT_DIRS[$i]}"
        [[ -d "$ctx_a" ]] || continue
        local af target
        while IFS= read -r af; do
          [[ -z "$af" ]] && continue
          while IFS= read -r target; do
            [[ -z "$target" ]] && continue
            # 检查 target 是否落在其他上下文目录内
            for ((j=0; j<${#CONTEXT_DIRS[@]}; j++)); do
              [[ $i -eq $j ]] && continue
              local ctx_b_abs="${ctx_abs[$j]}"
              [[ -z "$ctx_b_abs" ]] && continue
              if [[ "$target" == "$ctx_b_abs"* ]]; then
                fail "上下文间直接引用（绕过 ACL）：${af} (${ctx_a}) 直接 import 了 ${CONTEXT_DIRS[$j]}。跨上下文应经 ${ACL_DIR} 防腐层中转"
                found=1
                break
              fi
            done
          done < <(_resolve_rel_imports "$af")
        done < <(find "$ctx_a" -type f \( -name '*.ts' -o -name '*.js' -o -name '*.py' \) 2>/dev/null)
      done
      pass "ACL 防腐层目录存在：${ACL_DIR}"
    fi
  fi

  if [[ $found -eq 0 ]]; then
    if [[ "$_contract_checked" -eq 1 ]]; then
      pass "接口契约检查通过"
    else
      # R118：未配置/目录不存在时不得再打印“通过”（旧版 warn 后仍 pass，自相矛盾）。
      skip_if_unconfigured "CONTRACT_DIR 未配置或目录/契约文件不存在，契约版本化检查未执行"
    fi
  fi
}
# gate: impact
# domain: architecture / enforce: warn / tier: arch
check_impact() {
  echo "=== 变更影响分析检查（TOGAF：变更须含影响范围段 + 消费方清单）==="
  local found=0

  # ---- 0. 基线短路 ----
  # 刚激活、无待审变更的存量项目基线跑 --all-full 即红"未找到 spec 文档"——TOGAF 语义
  # "变更须做影响分析"前提是有变更。与 check_scope 同口径：HEAD 在基点且工作区 clean
  # （无待审变更）→ 放行；有变更（工作区脏或领先基点）→ 维持原 fail 语义。
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    local _imp_base _imp_dirty _imp_ahead
    _imp_base=$(_git_base)
    # 技能/账本为工具链自有写入面（scope 豁免同口径）——create 未提交时不算待审变更；
    # porcelain 对未跟踪目录整目录显示（?? .claude/），故模式须匹配目录形态本身。
    # || true 与 check_scope 同口径：porcelain 为空或全被豁免滤掉时 grep 退出 1，
    # set -euo pipefail 下裸赋值会杀整个 precheck（v2.13.2 实证：干净基线一跑 --impact 即崩）
    _imp_dirty=$(git status --porcelain 2>/dev/null | grep -vE '(\.claude|\.codex|\.swarm-yuan)(/|$)' | head -1 || true)
    _imp_ahead=$(git rev-list --count "${_imp_base}"..HEAD 2>/dev/null || echo 1)
    if [[ -z "$_imp_dirty" && "${_imp_ahead:-1}" -eq 0 ]]; then
      pass "基线无待审变更（HEAD 在 ${_imp_base} 且工作区 clean）——影响分析待执勤变更时生效"
      return
    fi
  fi

  # ---- 1. 找 spec 文件（影响范围段应在此）----
  # 发现逻辑统一走 _find_spec_file（SPEC_GLOB 优先；显式 IMPACT_SPEC_FILE 仍最高）。
  local spec_file="${IMPACT_SPEC_FILE:-$SPEC_FILE}"
  [[ -z "$spec_file" ]] && spec_file=$(_find_spec_file '影响范围|impact|消费方|stakeholder')

  # ---- 2. spec 必须含"影响范围"段 ----
  if [[ -z "$spec_file" ]]; then
    fail "未找到 spec 文档——TOGAF 要求每次架构变更先做影响分析（spec 须含'影响范围'段，列出受影响消费方）"
    found=1
  else
    if ! grep -qE '影响范围|impact|消费方|stakeholder' "$spec_file" 2>/dev/null; then
      fail "${spec_file} 缺少'影响范围'段（TOGAF 要求架构变更声明影响范围：哪些系统/模块/消费方受影响、迁移路径）"
      found=1
    fi
  fi

  # ---- 3. 变更影响分析：优先用 gitnexus impact/detect_changes，降级 grep ----
  # 消费前确保已构建（gitnexus_ensure_indexed/graphify_ensure_built），未构建则触发构建提示/降级
  # graphify god-nodes 原挂在 gitnexus 分支的 elif 上——
  # 两工具同装时 graphify 永不执行，与 SKILL.md「代码图谱平权选型可并用」声称不符。两者检测面
  # 不同（gitnexus=受影响进程 / graphify=God Node 枢纽），正交应并行；grep 降级仍兜底在最后。
  if has_gitnexus && gitnexus_ensure_indexed; then
    # gitnexus detect_changes: git diff → 受影响进程（最准确）
    trace_tool "gitnexus" "detect_changes"
    local gn_impact; gn_impact=$(gitnexus detect_changes 2>/dev/null | head -30 || true)
    if [[ -n "$gn_impact" ]]; then
      local affected_count; affected_count=$(echo "$gn_impact" | grep -cE '^\s+\S' || true)
      if [[ "$affected_count" -gt 5 ]]; then
        warn "gitnexus 检测到 ${affected_count} 个受影响进程——变更影响范围较大，确认 spec 已列出受影响方"
      fi
      echo "  gitnexus detect_changes 输出（前 10 行）："
      echo "$gn_impact" | head -10 | sed 's/^/    /'
    fi
  fi
  if has_graphify && graphify_ensure_built; then
    # graphify God Nodes 变更影响检测（God Nodes 是变更风险放大器）
    # C4 修复：graphify v0.9.22+ 的 god-nodes 是顶层子命令（graphify god-nodes），非 graphify explain god-nodes。
    trace_tool "graphify" "god-nodes"
    local gf_report; gf_report=$(graphify god-nodes 2>/dev/null | head -50 || true)
    if echo "$gf_report" | grep -qiE 'god.node|hub|surprising'; then
      local god_count; god_count=$(echo "$gf_report" | grep -icE 'god.node|hub' || true)
      if [[ "$god_count" -gt 0 ]]; then
        warn "graphify 检出 ${god_count} 个 God Node（高扇入枢纽节点）——变更此类节点影响范围放大，确认 spec 已评估"
        echo "$gf_report" | grep -iE 'god.node|hub|surprising' | head -5 | sed 's/^/    /'
      fi
    fi
  fi
  if ! ( ( has_gitnexus && gitnexus_ensure_indexed ) || ( has_graphify && graphify_ensure_built ) ) \
     && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    # 降级：git diff + grep 反查消费方
    local changed; changed=$(_git_changed_files)
    if [[ -n "$changed" ]]; then
      local cf
      while IFS= read -r cf; do
        [[ -z "$cf" ]] && continue
        local in_writable=0 wd
        for wd in "${WRITABLE_DIRS[@]+"${WRITABLE_DIRS[@]}"}"; do
          case "$cf" in
            "$wd"*) in_writable=1; break ;;
          esac
        done
        [[ $in_writable -eq 0 ]] && continue
        local mod; mod=$(basename "$cf")
        mod="${mod%.*}"
        [[ -z "$mod" ]] && continue
        local consumers
        consumers=$(grep -rlwF -- "$mod" "${WRITABLE_DIRS[@]+"${WRITABLE_DIRS[@]}"}" \
          --include='*.ts' --include='*.js' --include='*.py' --include='*.java' --include='*.vue' 2>/dev/null \
          | grep -v "^${cf}$" || true)
        if [[ -n "$consumers" ]]; then
          local ccount; ccount=$(echo "$consumers" | wc -l | xargs || true)
          if [[ $ccount -gt 3 ]]; then
            warn "${cf} 有 ${ccount} 个消费方引用——变更影响范围较大，确认 spec 已列出这些消费方并评估回归"
          fi
        fi
      done <<< "$changed"
    fi
  fi

  if [[ $found -eq 0 ]]; then
    pass "变更影响分析检查通过"
  fi
}
# gate: service
# domain: architecture / enforce: warn / tier: arch
check_service() {
  echo "=== 微服务架构检查（共享DB/同步链/共享模型/网关/trace透传）==="
  local found=0

  if [[ ${#SERVICE_DIRS[@]} -eq 0 ]]; then
    warn "未配置 SERVICE_DIRS，跳过微服务架构检查（生成目标技能时列出各服务目录）"
    return
  fi

  # ---- 1. 共享数据库检测：多服务 DB 配置指向同一数据库 ----
  if [[ ${#DB_CONFIG_FILES[@]} -gt 0 ]]; then
    declare -a db_uris=()
    local cf
    for cf in "${DB_CONFIG_FILES[@]}"; do
      [[ -f "$cf" ]] || continue
      # 提取数据库连接 URI/host（粗筛：含 host/port/database 的配置行）
      # BRE sed 的 \s（字面 s）与 \?（GNU 扩展）在 BSD 不支持，
      # 改 ERE + [[:space:]] + ?——此前 macOS 上 URI 剥离行为分歧。
      local uri
      uri=$(grep -hoE '(host|HOST|url|URL|dsn|DSN|database_url|DATABASE_URL)[[:space:]]*[:=][[:space:]]*["'"'"']?[^"'"'"'[:space:],;]+' "$cf" 2>/dev/null \
        | sed -E 's/.*[:=][[:space:]]*["'"'"']?//' | sort -u || true)
      if [[ -n "$uri" ]]; then
        db_uris+=("${cf}::${uri}")
      fi
    done
    # 检测是否有两个服务指向同一 host+database
    local i j
    for ((i=0; i<${#db_uris[@]}; i++)); do
      for ((j=i+1; j<${#db_uris[@]}; j++)); do
        local uri_i="${db_uris[$i]##*::}"
        local uri_j="${db_uris[$j]##*::}"
        local file_i="${db_uris[$i]%%::*}"
        local file_j="${db_uris[$j]%%::*}"
        if [[ -n "$uri_i" && "$uri_i" == "$uri_j" ]]; then
          fail "共享数据库反模式：${file_i} 与 ${file_j} 指向同一数据库（${uri_i}）。微服务应每服务独立数据库，避免 schema 变更互相影响"
          found=1
        fi
      done
    done
    if [[ $found -eq 0 ]]; then
      pass "无共享数据库（${#db_uris[@]} 个 DB 配置均指向不同实例）"
    fi
  fi

  # ---- 2. 共享模型/库检测：多服务依赖同一共享包 ----
  if [[ -n "$SHARED_LIBS_DIR" && -d "$SHARED_LIBS_DIR" ]]; then
    local shared_pkg; shared_pkg=$(basename "$SHARED_LIBS_DIR")
    local svc_count=0
    local svc
    for svc in "${SERVICE_DIRS[@]}"; do
      [[ -d "$svc" ]] || continue
      # 检测服务是否 import 了共享包
      if grep -rqwF -- "$shared_pkg" "$svc" --include='*.ts' --include='*.js' --include='*.py' 2>/dev/null; then
        svc_count=$((svc_count+1))
      fi
    done
    if [[ $svc_count -gt 1 ]]; then
      warn "共享库 ${SHARED_LIBS_DIR} 被 ${svc_count} 个服务依赖——共享领域模型会导致服务无法独立演进（改一处全服务重发）。将共享库拆分：utils/types 可共享，领域模型复制到各服务（防分布式单体）"
    fi
  fi

  # ---- 3. API 网关存在性 ----
  if [[ -z "$API_GATEWAY" ]]; then
    warn "未配置 API_GATEWAY——新建 API_GATEWAY 目录/文件，实现认证+限流+跨域+路由聚合（或在 API_GATEWAY 指向已有网关）"
  elif [[ ! -e "$API_GATEWAY" ]]; then
    warn "API 网关不存在：${API_GATEWAY}（客户端直连后端服务会导致认证/跨域/限流各服务重复实现）"
  else
    pass "API 网关存在：${API_GATEWAY}"
  fi

  # ---- 4. 同步调用链深度（HTTP/RPC 调用）----
  if [[ "$MAX_SYNC_CHAIN" -gt 0 ]]; then
    local svc2
    for svc2 in "${SERVICE_DIRS[@]}"; do
      [[ -d "$svc2" ]] || continue
      # 粗筛：统计服务内 HTTP 调用语句（fetch/axios/httpClient/grpc）
      local call_count
      call_count=$(_scan_src '(fetch|axios|httpClient|grpc|http\.request|requests\.)\(' 'ts,js,py' 'test\|mock\|node_modules' "$svc2" | wc -l | xargs || true)
      if [[ "$call_count" -gt "$MAX_SYNC_CHAIN" ]]; then
        warn "${svc2} 有 ${call_count} 处对外同步调用——同步链过长易雪崩（建议熔断/降级/异步化，阈值 ${MAX_SYNC_CHAIN}）"
      fi
    done
  fi

  # ---- 5. 分布式追踪（traceId 透传）检测 ----
  local trace_found=0
  local svc3
  for svc3 in "${SERVICE_DIRS[@]}"; do
    [[ -d "$svc3" ]] || continue
    if grep -rqwE 'traceId|trace_id|x-trace|traceparent|spanId|span_id|opentelemetry|@opentelemetry' "$svc3" \
      --include='*.ts' --include='*.js' --include='*.py' 2>/dev/null; then
      trace_found=1
      break
    fi
  done
  if [[ $trace_found -eq 0 ]]; then
    warn "未检测到 traceId/spanId 透传——跨服务调用无分布式追踪，故障难定位（建议接入 OpenTelemetry 或透传 x-trace-id）"
  else
    pass "检测到分布式追踪（traceId 透传）"
  fi

  if [[ $found -eq 0 ]]; then
    pass "微服务架构检查通过"
  fi
}
# gate: api
# domain: architecture / enforce: warn / tier: arch
check_api() {
  echo "=== API 契约与幂等检查（版本化/幂等/跨服务事务）==="
  local found=0 _api_checked=0

  # ---- 1. API 定义文件版本化 ----
  if [[ -z "$API_SPEC_DIR" ]]; then
    warn "未配置 API_SPEC_DIR，跳过 API 契约检查（建议建立 OpenAPI/proto/GraphQL schema 目录）"
  elif [[ ! -d "$API_SPEC_DIR" ]]; then
    warn "API 定义目录不存在：${API_SPEC_DIR}"
  else
    local specs; specs=$(find "$API_SPEC_DIR" -type f \( -name '*.yaml' -o -name '*.yml' -o -name '*.json' -o -name '*.proto' -o -name '*.graphql' \) 2>/dev/null || true)
    if [[ -n "$specs" ]]; then
      _api_checked=1
      local sf
      while IFS= read -r sf; do
        [[ -z "$sf" ]] && continue
        if ! grep -qE 'version["'"'"']?[[:space:]]*[:=]|^version|## v?[0-9]|edition["'"'"']?[[:space:]]*[:=]' "$sf" 2>/dev/null; then
          fail "API 定义缺 version：${sf}（微服务契约无版本化会导致消费方静默挂）"
          found=1
        fi
      done <<< "$specs"
    fi
  fi

  # ---- 1b. 接口测试覆盖（端点 × 测试映射 + 状态码断言）----
  _api_test_coverage_check || found=1

  # ---- 2. 写操作幂等性检测 ----
  if [[ ${#WRITE_HANDLER_DIRS[@]} -gt 0 ]]; then
    local hd
    for hd in "${WRITE_HANDLER_DIRS[@]}"; do
      [[ -d "$hd" ]] || continue
      # 检测 POST/PUT/DELETE handler 是否含幂等键（idempotency-key/request-id 去重）
      local handlers
      handlers=$(grep -rlnE '(POST|PUT|DELETE|@Post|@Put|@Delete|app\.(post|put|delete))' "$hd" \
        --include='*.ts' --include='*.js' --include='*.py' 2>/dev/null || true)
      if [[ -n "$handlers" ]]; then
        local hf
        while IFS= read -r hf; do
          [[ -z "$hf" ]] && continue
          if ! grep -qwiE 'idempotency|request.?id|dedup|去重|幂等' "$hf" 2>/dev/null; then
            warn "${hf} 含写操作但无幂等设计（建议 idempotency-key 去重，防止重试导致重复扣款/重复创建）"
          fi
        done <<< "$handlers"
      fi
    done
  fi

  # ---- 3. 跨服务分布式事务检测（反模式：微服务不该用 2PC）----
  local svc
  for svc in "${SERVICE_DIRS[@]+"${SERVICE_DIRS[@]}"}"; do
    [[ -d "$svc" ]] || continue
    # 检测跨服务 BEGIN TRANSACTION / @Transactional 跨服务调用
    local xa
    xa=$(_scan_src 'XAResource|XA_OPEN|2pc|two.?phase|distributed.?transaction|seata|@GlobalTransactional' 'ts,js,py,java' 'test\|mock\|node_modules' "$svc")
    if [[ -n "$xa" ]]; then
      warn "${svc} 检测到分布式事务/2PC——微服务应避免跨服务事务，改用 Saga/Outbox 模式"
      echo "$xa" | head -3 | sed 's/^/    /'
    fi
  done

  # ---- 4. Outbox 模式提示（写库+发消息一致性）----
  local has_outbox=0
  for svc in "${SERVICE_DIRS[@]+"${SERVICE_DIRS[@]}"}"; do
    [[ -d "$svc" ]] || continue
    if grep -rqwiE 'outbox|out_box|event.?relay|transactional.?outbox' "$svc" \
      --include='*.ts' --include='*.js' --include='*.py' --include='*.java' 2>/dev/null; then
      has_outbox=1
      break
    fi
  done
  if [[ $has_outbox -eq 0 && ${#SERVICE_DIRS[@]} -gt 0 ]]; then
    warn "未检测到 Outbox 模式——服务写库后发消息可能不一致（库已改消息未发）。建议 outbox 表保证原子性"
  fi

  if [[ $found -eq 0 ]]; then
    if [[ "$_api_checked" -eq 1 ]]; then
      pass "API 契约与幂等检查通过"
    else
      # R118：版本化未执行时仍可能跑了幂等/事务检查——用 warn 明示“部分完成”，不写“通过”。
      warn "API 契约版本化未执行（API_SPEC_DIR 未配置或目录/定义文件不存在）；幂等与跨服务事务检查已执行"
    fi
  fi
}
# gate: frontend
# domain: architecture / enforce: warn / tier: arch
check_frontend() {
  echo "=== 前端组件架构检查（层级深/容器展示分离/props多/重复依赖/循环依赖/CSS污染）==="
  local found=0

  # 回归#18 防御：COMPONENT_DIR 为单目录标量；误配成数组时 [[ -z "$COMPONENT_DIR" ]]
  # 在 set -u + bash 3.2 直接 unbound 崩溃。兜底后"If it's an array, treat as unset"。
  [[ -z "${COMPONENT_DIR:-}" ]] && COMPONENT_DIR=""

  if [[ -z "$COMPONENT_DIR" || ! -d "$COMPONENT_DIR" ]]; then
    warn "未配置 COMPONENT_DIR 或目录不存在，跳过前端组件检查"
    return
  fi

  # ---- 1. 组件嵌套深度（>MAX_COMPONENT_DEPTH warn）----
  if [[ "$MAX_COMPONENT_DEPTH" -gt 0 ]]; then
    # 粗筛：找 JSX 中组件标签嵌套深度（按缩进估算）
    local cf
    while IFS= read -r cf; do
      [[ -z "$cf" ]] && continue
      local max_indent=0
      # 用 python 扫描字符算 JSX 组件标签的峰值嵌套深度（兼容同行嵌套）
      local depth
      depth=$(python3 -c "
import re,sys
try: t=open('$cf',encoding='utf-8').read()
except: t=''
depth=0; maxd=0
for m in re.finditer(r'<(/?)([A-Z][A-Za-z0-9]*)', t):
  if m.group(1)=='/': depth=max(0,depth-1)
  else: depth+=1; maxd=max(maxd,depth)
print(maxd)
" 2>/dev/null || echo 0)
      if [[ "$depth" -gt "$MAX_COMPONENT_DEPTH" ]]; then
        warn "${cf} 组件嵌套深度 ${depth}（>阈值 ${MAX_COMPONENT_DEPTH}）——层级过深导致渲染栈深、调试难、性能损耗，建议扁平化"
      fi
    done < <(find "$COMPONENT_DIR" -type f \( -name '*.tsx' -o -name '*.jsx' -o -name '*.vue' -o -name '*.svelte' \) 2>/dev/null)
  fi

  # ---- 2. 容器组件与展示组件未分离检测 ----
  # 粗筛：组件文件同时含 API 调用（fetch/axios/useQuery）和大量 JSX 渲染
  local cf2
  while IFS= read -r cf2; do
    [[ -z "$cf2" ]] && continue
    local has_io has_render
    has_io=$(grep -cE '(fetch|axios|useQuery|useMutation|useSWR|\.get\(|\.post\()' "$cf2" 2>/dev/null || true)
    has_io=$(_norm_int "${has_io:-0}")
    # 统计 JSX 标签出现次数（非行数），用 grep -o 计数
    has_render=$(grep -oE '<(div|span|ul|li|section|article|main|header|footer|table|button|input|form|p|h[1-6])' "$cf2" 2>/dev/null | wc -l | xargs || true)
    has_render=$(_norm_int "${has_render:-0}")
    if [[ "$has_io" -gt 0 && "$has_render" -gt 10 ]]; then
      warn "${cf2} 同时含数据获取（${has_io}）和大量渲染（${has_render}）——容器组件与展示组件未分离，建议拆分（容器管数据，展示管 UI），提升复用性与可测性"
      break  # 只提示一次，避免刷屏
    fi
  done < <(find "$COMPONENT_DIR" -type f \( -name '*.tsx' -o -name '*.jsx' -o -name '*.vue' -o -name '*.svelte' \) 2>/dev/null)

  # ---- 3. 组件 props 过多检测（>MAX_PROPS_COUNT warn）----
  if [[ "$MAX_PROPS_COUNT" -gt 0 ]]; then
    local cf3
    while IFS= read -r cf3; do
      [[ -z "$cf3" ]] && continue
      # 提取 props 解构 / interface Props 的字段数（粗筛，支持同行多字段）
      local props_count
      props_count=$(awk '
        /interface [A-Z][A-Za-z]*Props|type [A-Z][A-Za-z]*Props/ {in_props=1; next}
        in_props && /^\}/ {in_props=0; if(count>0) print count; count=0; next}
        in_props {
          # 统计该行中 "字段:" 模式的出现次数（同行多字段用 ; 或 , 分隔）
          n = gsub(/[a-zA-Z_][a-zA-Z0-9_]*[?:]?[[:space:]]*:/, "&")
          count += n
        }
      ' "$cf3" 2>/dev/null | sort -n | tail -1 || echo 0)
      if [[ "$props_count" -gt "$MAX_PROPS_COUNT" ]]; then
        warn "${cf3} props 数量 ${props_count}（>阈值 ${MAX_PROPS_COUNT}）——props 过多说明组件职责过重，建议拆分"
      fi
    done < <(find "$COMPONENT_DIR" -type f \( -name '*.tsx' -o -name '*.ts' \) 2>/dev/null)
  fi

  # ---- 4. 循环依赖检测（madge 优先，降级 grep）----
  if command -v madge >/dev/null 2>&1; then
    local circ _circ_err
    _circ_err=$(mktemp "${TMPDIR:-/tmp}/swarm-yuan-madge.XXXXXX")
    circ=$(madge --circular --extensions ts,tsx,js,jsx "$COMPONENT_DIR" 2>"$_circ_err" || true)
    if echo "$circ" | grep -qi 'circular'; then
      fail "检测到组件循环依赖（madge）——A↔B 互相 import 会导致运行时 undefined："
      echo "$circ" | sed 's/^/    /'
      found=1
    elif [[ -z "$circ" && -s "$_circ_err" ]]; then
      warn "madge 循环依赖检测执行失败（stderr: $(head -1 "$_circ_err" 2>/dev/null)）——本项未判定"
    fi
    rm -f "$_circ_err"
  else
    # 降级：检测同目录文件互引（粗筛）
    warn "未安装 madge，循环依赖检测跳过（npm i -g madge）"
  fi

  # ---- 5. 全局 CSS 污染检测 ----
  if [[ -n "$STYLE_DIR" && -d "$STYLE_DIR" ]]; then
    # 检测纯 CSS 文件（无 .module. 后缀）含全局类定义
    local global_css
    global_css=$(find "$STYLE_DIR" -type f -name '*.css' ! -name '*.module.css' 2>/dev/null || true)
    if [[ -n "$global_css" ]]; then
      local gcount; gcount=$(echo "$global_css" | wc -l | xargs || true)
      if [[ "$gcount" -gt 0 ]]; then
        warn "检测到 ${gcount} 个非 scoped CSS 文件（无 .module.css 后缀）——全局类名易冲突，建议 CSS Modules / styled-components / Tailwind scoped"
      fi
    fi
  fi

  # ---- 6. bundle 重复依赖（若有报告）----
  if [[ -n "$BUNDLE_REPORT" && -f "$BUNDLE_REPORT" ]]; then
    # 粗筛：bundle 报告中是否含同一包多版本（搜 "x.x.x" 重复包名）
    local dups
    dups=$(grep -oE '"[^"]+"' "$BUNDLE_REPORT" 2>/dev/null | sort | uniq -c | sort -rn | awk '$1>1' | head -5 || true)
    if [[ -n "$dups" ]]; then
      warn "bundle 报告中检测到重复依赖（可能多版本打包）："
      echo "$dups" | sed 's/^/    /'
    fi
  fi

  if [[ $found -eq 0 ]]; then
    pass "前端组件架构检查通过"
  fi
}
# gate: domain
# domain: architecture / enforce: warn / tier: arch
check_domain() {
  echo "=== 领域知识检查（动态识别→深入分析→客观规律违规检测）==="
  local found=0

  # ---- 1. spec §18 领域知识段存在性 + 动态分析质量 ----
  local spec_file="${SPEC_FILE:-}"
  [[ -z "$spec_file" ]] && spec_file=$(_first_existing_file "spec-template.md" "specs/spec-template.md" "docs/spec-template.md")
  # 排除 *template* 模板文件--模板含 §18 标题会自证 pass（乞题谬误）
  [[ -n "$spec_file" && "$(basename "$spec_file")" == *template* ]] && spec_file=""
  if [[ -n "$spec_file" && -f "$spec_file" ]]; then
    if grep -qE '^## 18\..*领域知识' "$spec_file" 2>/dev/null; then
      pass "spec §18 领域知识段存在"
      # 检查 §18.2 深入分析表是否有"依据"（非空壳填写）
      local analysis_rows; analysis_rows=$(awk '/^### 18\.2/,/^### 18\.3/' "$spec_file" 2>/dev/null | grep -cE '^\|.*\|.*\|.*\|.*\|.*\|.*\|' || true)
      local has_evidence; has_evidence=$(awk '/^### 18\.2/,/^### 18\.3/' "$spec_file" 2>/dev/null | grep -cE '因为|依据|证据|@/|src/|代码' || true)
      if [[ "$analysis_rows" -gt 2 ]]; then
        if [[ "$has_evidence" -ge 1 ]]; then
          pass "§18.2 领域深入分析表已填写且含代码依据（${analysis_rows} 行分析，${has_evidence} 处证据）"
        else
          warn "§18.2 领域分析表已填写但无代码依据——每条规律须标注依据（代码证据/文档证据/行业常识），非套用通用清单"
        fi
      else
        warn "§18.2 领域深入分析表未填写——须逐领域分析核心实体→因果→约束→遵循→风险"
      fi
      # 检查 §18.3 声明 checkbox
      if grep -qE '^\s*- \[[x]\].*动态识别' "$spec_file" 2>/dev/null; then
        pass "§18.3 领域声明已勾选"
      else
        warn "§18.3 领域声明未全部勾选——须确认动态识别+深入分析+标注依据+不违反客观规律"
      fi
    else
      warn "spec 缺少 §18 领域知识约束段——须动态识别领域→深入分析→推导客观规律"
    fi
  else
    # R118：这里不能 skip_if_unconfigured——下方代码层客观规律检查仍会执行，
    # 旧版会造成“跳过 1 + fail 1”同时出现、执行数被算成 0 的自相矛盾汇总。
    warn "未找到 spec，§18 领域知识段未检查（代码层客观规律检查继续执行）"
  fi

  # ---- 2. reference-manual 含"领域知识"段且规律有依据 ----
  local rm_file
  rm_file=$(_first_existing_file "${SKILL_DIR}/references/reference-manual.md" "references/reference-manual.md" "reference-manual.md" ".claude/skills/*/references/reference-manual.md")  # R140 G-D3：技能根候选最优先（temp 部署形态 CWD=PROJECT_DIR 落错文件）
  if [[ -n "$rm_file" ]]; then
    if grep -qiE '领域知识|领域规则|客观规律|业务规则|行业知识' "$rm_file" 2>/dev/null; then
      # 检查规律是否有代码依据（非通用清单复制）
      local has_evidence; has_evidence=$(grep -cE '因为|依据|证据|@/|src/|代码' "$rm_file" 2>/dev/null || true)
      if [[ "$has_evidence" -ge 1 ]]; then
        pass "reference-manual 含领域知识段且规律有代码依据"
      else
        warn "reference-manual 领域知识段无代码依据——规律须从项目代码分析推导，非套用通用清单"
      fi
      pass "reference-manual 含领域知识段"
    else
      warn "reference-manual 缺少'领域知识'段——须补充项目所属技术+业务领域的专业知识规则"
    fi
  fi

  # ---- 3. 客观规律违规检测（硬门禁：检测代码中违反通用常识的模式）----
  # 3a. 安全常识：密码明文存储
  # R118-D5（nest-forge 实证）：排除词表补 \.spec\. / \.test\. / \.e2e-spec\. 路径形态——
  # _scan_src 的 grep -v 作用于整行（含路径前缀），词表只认 test/mock 词时 *.spec.ts
  # 测试夹具密码（password: 'super-secret-1'）照命中"明文存储"硬 fail，无豁免通道。
  # 测试夹具不是"存储的密码"：夹具密码永不入生产存储，排除语义与 gitleaks 路径
  # 排除（check_sensitive）对齐——同门禁族判定标准一致。
  local pwd_violation
  pwd_violation=$(_scan_src "password\s*[=:]\s*['\"][^'\"]+['\"]" 'ts,js,py,java' 'test\|mock\|node_modules\|placeholder\|example\|xxx\|yyy\|\.spec\.\|\.test\.\|\.e2e-spec\.\|coverage\|dist\|target' "${WRITABLE_DIRS[@]+"${WRITABLE_DIRS[@]}"}")
  if [[ -n "$pwd_violation" ]]; then
    fail "违反安全客观规律：检测到密码明文存储（密码必须哈希，不可明文）"
    echo "$pwd_violation" | head -3 | sed 's/^/    /'
    found=1
  fi
  # 3b. 数据库常识：SQL 拼接（非参数化）——排除词同 R118-D5 补路径形态
  local sql_violation
  sql_violation=$(_scan_src "SELECT.*\+.*FROM|INSERT.*\+.*VALUES|WHERE.*\+.*=" 'ts,js,py,java' 'test\|mock\|node_modules\|\.spec\.\|\.test\.\|\.e2e-spec\.\|coverage\|dist\|target' "${WRITABLE_DIRS[@]+"${WRITABLE_DIRS[@]}"}")
  if [[ -n "$sql_violation" ]]; then
    fail "违反数据库客观规律：检测到 SQL 字符串拼接（必须参数化查询，防注入）"
    echo "$sql_violation" | head -3 | sed 's/^/    /'
    found=1
  fi
  # 3c. 前端常识：v-html / dangerouslySetInnerHTML 直接拼接动态内容（排除 sanitize/renderMarkdown/DOMPurify 等消毒场景）
  local xss_violation
  xss_violation=$(_scan_src 'v-html|dangerouslySetInnerHTML|innerHTML\s*=' 'vue,svelte,tsx,jsx,ts,js' 'test\|mock\|node_modules\|coverage\|dist\|target' "${WRITABLE_DIRS[@]+"${WRITABLE_DIRS[@]}"}" \
    | grep -viE 'sanitize|renderMarkdown|DOMPurify|escape|encode|sanitizeHtml|marked\(|markdownit' || true)
  if [[ -n "$xss_violation" ]]; then
    warn "潜在前端客观规律违反：v-html/innerHTML 使用但未检测到消毒函数（sanitize/renderMarkdown/DOMPurify）。如已消毒请人工确认"
    echo "$xss_violation" | head -3 | sed 's/^/    /'
  fi
  # 3d. 并发常识：共享可变状态无锁
  local race_violation
  race_violation=$(_scan_src 'global\s+\w+\s*=|window\.\w+\s*=' 'ts,js' 'test\|mock\|node_modules\|config\|const\|readonly\|coverage\|dist\|target' "${WRITABLE_DIRS[@]+"${WRITABLE_DIRS[@]}"}")
  if [[ -n "$race_violation" ]]; then
    warn "潜在并发违规：检测到全局可变状态（共享可变状态须同步，否则竞态）"
  fi

  if [[ $found -eq 0 ]]; then
    if [[ -n "$spec_file" && -f "$spec_file" ]]; then
      pass "领域知识检查通过（无客观规律违规）"
    else
      # 保留既有完整通过文案（下游断言/用户脚本按此匹配），追加“领域段未检查”披露。
      pass "领域知识检查通过（无客观规律违规）——spec §18 未提供，领域段未检查"
    fi
  fi
}
# gate: diagram
# domain: architecture / enforce: warn / tier: arch
check_diagram() {
  # 客观契约机械查，主观质量 AI 检查单——两层都跑，不再二选一。
  # 机械层只判可机检的硬契约（单文件安全/可访问 SVG/远程资源/脚本策略/viewBox），
  # 不判断“这张图是否值得画、是否好看”；后者留给下面的 AI 检查单与视觉审查留痕。
  # enforce 层在 precheck.sh _ENFORCE_OVERRIDE 登记为 warn（2026-10-19 R122）：
  # 0 fail 的静态分类来自旧实现未执行检查，硬契约违约应阻断 standard+ 交付。
  local _dc _dc_out _dc_rc
  _dc=""
  if [[ -f "$(dirname "$0")/diagram-check.sh" ]]; then
    _dc="$(dirname "$0")/diagram-check.sh"
  elif [[ -f "$(dirname "$0")/../scripts/diagram-check.sh" ]]; then
    _dc="$(dirname "$0")/../scripts/diagram-check.sh"
  fi

  echo "=== 图表生产检查（check_diagram）==="
  if [[ -n "$_dc" ]]; then
    _dc_rc=0
    _dc_out=$(PROJECT_DIR="${PROJECT_DIR:-.}" bash "$_dc" --all 2>&1) || _dc_rc=$?
    printf '%s\n' "$_dc_out"
    if [[ "$_dc_rc" -ne 0 ]]; then
      fail "图表结构自检发现违例（修复后重跑；DIAGRAM_ENFORCE=0 仅降级为警告）"
    else
      pass "图表结构自检通过（或未发现图表产物）"
    fi
  else
    warn "diagram-check.sh 未随技能分发，机械检查降级为 AI 检查单"
  fi

  echo "  → AI 检查单（主观质量，机械层不替你判断）："
  echo "    ① 这张图是否值得画？三列表格或一段话能否替代？"
  echo "    ② 选型是否先语义模式后视觉类型？是否读了所选 type-*.md？"
  echo "    ③ 是否 ≤9 节点 / ≤12 箭头 / ≤2 强调色？超出是否拆图？"
  echo "    ④ 图与代码/配置事实是否一致（每个节点有锚点，无凭空补件）？"
  echo "    ⑤ 390px 与桌面宽度、打印、reduced-motion 下是否仍可读？"
  echo "    → 判断留痕：${PROJECT_DIR:-.}/.swarm-yuan/notes/diagram.md"
  echo "    → 方法与运行时：references/diagram-production-methodology.md + runtime/diagram-design/"
}
# gate: framework
# domain: architecture / enforce: warn / tier: arch
check_framework() {
  echo "▶ 框架适配门禁 (--framework)"
  if [[ ${#ACTIVE_FRAMEWORKS[@]} -eq 0 ]]; then
    # 漏配检测：探查信号明显但未配置 → warn
    local hit
    hit=$(find "${PROJECT_DIR:-.}" -name '*Mapper.xml' -not -path '*/node_modules/*' 2>/dev/null | head -1)
    [[ -n "$hit" ]] && warn "发现 $hit 但 ACTIVE_FRAMEWORKS 未配置——疑似漏配 mybatis"
    skip_if_unconfigured "ACTIVE_FRAMEWORKS 未配置"; return
  fi
  local fw fn _run_list=()
  # --framework <id>：仅跑指定框架（单框架隔离）；未指定 id 则全量串联（兼容原行为）
  if [[ -n "${FRAMEWORK_ID:-}" ]]; then
    local _found=0 _cand
    for _cand in ${ACTIVE_FRAMEWORKS[@]+"${ACTIVE_FRAMEWORKS[@]}"}; do
      [[ "$_cand" == "$FRAMEWORK_ID" ]] && _found=1 && break
    done
    if [[ $_found -eq 0 ]]; then
      fail "框架 '$FRAMEWORK_ID' 不在 ACTIVE_FRAMEWORKS（${ACTIVE_FRAMEWORKS[*]}）——无法单跑"
      return
    fi
    _run_list=("$FRAMEWORK_ID")
    echo "  （单框架模式：仅 ${FRAMEWORK_ID}）"
  else
    _run_list=(${ACTIVE_FRAMEWORKS[@]+"${ACTIVE_FRAMEWORKS[@]}"})
  fi
  for fw in ${_run_list[@]+"${_run_list[@]}"}; do
    fn="_fw_$(echo "$fw" | tr '-' '_')_check"
    if declare -f "$fn" >/dev/null 2>&1; then
      # F2（dsh/cordis 吸收·满足判定显式化）：requires_conf 变量全空 → 门禁不生效。
      # requires_conf 声明随 --inject-frameworks 保留在标记区块头部，从本脚本自身 grep。
      # 对应论文 Def 25 的满足判定 σ ⊧ d 显式化——PENDING 态给可执行修复指令而非静默。
      local _rc_line _rc_vars _rv _all_empty=1
      _rc_line=$(grep -m1 "^# ruleset: ${fw}  requires_conf:" "$0" 2>/dev/null || true)
      if [[ -n "$_rc_line" ]]; then
        _rc_vars="${_rc_line##*requires_conf: }"
        for _rv in $_rc_vars; do
          # 未声明或空数组/空串都算未配置（启动兜底循环已把未声明的补成空数组）
          if eval "[[ -n \"\${${_rv}[@]:-}\" ]]"; then _all_empty=0; break; fi
        done
        [[ "$_all_empty" -eq 1 ]] && warn "框架 '$fw' 的 requires_conf 全空（${_rc_vars}）——门禁将不生效跳过。请在 precheck.arch.conf 配置，或跑 bash generate-skill.sh --inject-frameworks <skill_dir> 重同步占位"
      fi
      # || true 兜底：单个框架函数内若有命令返回非 0（如 grep 无匹配），
      # set -e 会触发整个 check_framework 退出，导致后续框架无法执行。
      # 框架函数内部的 pass/fail/warn 已自行记录检查结果，此处只须防止退出。
      "$fn" || true
    else
      fail "框架 '$fw' 已激活但无门禁实现（$fn 缺失）——须运行 generate-skill.sh --inject-frameworks"
    fi
  done
}
# gate: docs-pack
# domain: compliance / enforce: warn / tier: compliance
check_docs_pack() {
  echo "=== 交付文档包完备性检查（GB/T 8567/9386、RUSP）==="
  [[ -z "${DOCS_PACK_PROFILE:-}" ]] && { skip_if_unconfigured "DOCS_PACK_PROFILE 未配置"; return; }
  local docs_dir="${DOCS_PACK_DIR:-docs}"
  local required=()
  case "$DOCS_PACK_PROFILE" in
    rusp)
      # RUSP（GB/T 25000.51）内置清单
      required=("产品说明" "用户手册" "测试计划" "测试说明" "测试报告")
      ;;
    gbt9386)
      # GB/T 9386 测试文档内置清单（4 计划/说明 + 4 报告/日志）
      required=("测试计划" "测试设计说明" "测试用例说明" "测试规程说明" "测试项传递报告" "测试日志" "测试事件报告" "测试总结报告")
      ;;
    gbt8567)
      # GB/T 8567-2006 §7.1-7.25 内置清单（25 种文档，按六包分组）
      # 需求包：可行性分析/软件开发计划/需求规格说明
      # 设计包：系统/子系统需求规格说明/接口需求规格说明/系统/子系统设计说明/接口设计说明/数据需求说明/软件设计说明/数据库设计说明
      # 测试包：软件测试计划/软件测试说明/软件测试报告
      # 部署包：软件安装计划/软件移交计划/软件产品规格说明/软件版本说明
      # 运维包：软件用户手册/计算机操作手册/计算机编程手册
      # 管理包：软件配置管理计划/软件质量保证计划/开发进度月报/项目开发总结报告
      required=(
        "可行性分析" "软件开发计划" "软件需求规格说明"
        "系统需求规格说明" "子系统需求规格说明" "接口需求规格说明"
        "系统设计说明" "子系统设计说明" "接口设计说明" "数据需求说明" "软件设计说明" "数据库设计说明"
        "软件测试计划" "软件测试说明" "软件测试报告"
        "软件安装计划" "软件移交计划" "软件产品规格说明" "软件版本说明"
        "软件用户手册" "计算机操作手册" "计算机编程手册"
        "软件配置管理计划" "软件质量保证计划" "开发进度月报" "项目开发总结报告"
      )
      ;;
    custom)
      # custom 取 DOCS_PACK_REQUIRED 自定义清单
      required=(${DOCS_PACK_REQUIRED[@]+"${DOCS_PACK_REQUIRED[@]}"})
      ;;
    *)
      warn "未知 DOCS_PACK_PROFILE：${DOCS_PACK_PROFILE}（按 custom 处理，取 DOCS_PACK_REQUIRED）"
      required=(${DOCS_PACK_REQUIRED[@]+"${DOCS_PACK_REQUIRED[@]}"})
      ;;
  esac
  [[ ${#required[@]} -eq 0 ]] && { skip_if_unconfigured "文档包必备清单为空（profile=${DOCS_PACK_PROFILE}）"; return; }
  local found=0 req hit tbd
  for req in "${required[@]}"; do
    hit=""
    [[ -d "$docs_dir" ]] && hit=$(find "$docs_dir" -type f -name "*${req}*" 2>/dev/null | head -1)
    if [[ -z "$hit" ]]; then
      fail "gate_docs_pack_missing:${req}: 文档包缺少必备文档（${docs_dir} 下未找到 *${req}*）"
      found=1
      continue
    fi
    # TBD 扫描（ALLOW_TBD=1 时降级 warn）
    tbd=$(grep -nE 'TBD|待补充|待完善' "$hit" 2>/dev/null || true)
    if [[ -n "$tbd" ]]; then
      if [[ "${DOCS_PACK_ALLOW_TBD:-0}" == "1" ]]; then
        warn "gate_docs_pack_tbd:${hit}: 文档含 TBD（ALLOW_TBD=1 降级 warn）"
      else
        fail "gate_docs_pack_tbd:${hit}: 文档含 TBD/待补充占位"
        echo "$tbd" | head -5
        found=1
      fi
    fi
  done
  [[ $found -eq 0 ]] && { pass "文档包完备性检查通过（profile=${DOCS_PACK_PROFILE}）"; return 0; }
}
# gate: requirements
# domain: compliance / enforce: warn / tier: compliance
check_requirements() {
  echo "=== 需求质量检查（ISO/IEC/IEEE 29148：无 TBD / 唯一 ID / EARS）==="
  local found=0 hits l
  # —— 0. OpenSpec CLI 整合（WP1.1）：若装了 openspec 且配置了 OPENSPEC_SPEC_DIR，
  #     跑 `openspec validate --all --strict` 校验 delta spec 合法性；未装/未配置则降级（下方文档检查已覆盖）。
  #     语义：openspec validate 退出码不稳定（部分版本 failed 时仍 rc=0），故靠输出判断——
  #     输出含 "failed" 且 "passed" 项为 0 → spec 非法 → fail。独立于 SPEC_FILE，openspec 有自己的 spec 目录。
  local ospec_dir="${OPENSPEC_SPEC_DIR:-}"
  # 相对路径解析为 PROJECT_DIR 下（与 precheck 其他路径解析一致；run-gate-fixture 不 cd 到 fixture，
  # cwd 可能是 swarm-yuan/，相对路径 openspec 会解析到错误位置）
  if [[ -n "$ospec_dir" && "${ospec_dir:0:1}" != "/" && -n "${PROJECT_DIR:-}" ]]; then
    ospec_dir="$PROJECT_DIR/$ospec_dir"
  fi
  if has_openspec && [[ -n "$ospec_dir" && -d "$ospec_dir" ]]; then
    trace_tool "openspec" "validate --all --strict $ospec_dir"
    local ospec_out; ospec_out=$(openspec validate --all --strict --no-interactive "$ospec_dir" 2>&1 || true)
    if echo "$ospec_out" | grep -qE '[1-9][0-9]* failed' && ! echo "$ospec_out" | grep -qE '[1-9][0-9]* passed'; then
      fail "gate_requirements_openspec_invalid: openspec validate 失败（delta spec 非法，详见输出）"
      echo "$ospec_out" | tail -10 | sed 's/^/    /'
      found=1
    else
      pass "openspec validate 通过（delta spec 合法）"
    fi
  fi
  local spec="${SPEC_FILE:-}"
  if [[ -z "$spec" || ! -f "$spec" ]]; then
    if [[ $found -eq 0 ]]; then
      skip_if_unconfigured "SPEC_FILE 未配置或不存在，需求 lint 跳过（openspec 守卫已在上方执行）"
      return
    fi
    # openspec 已 fail，仍返回非 0
    return 1
  fi
  # —— 1. TBD 零容忍（REQUIREMENTS_STRICT=1）：spec 含 TBD/待定/待明确 → fail（id 带行号）
  if [[ "${REQUIREMENTS_STRICT:-0}" == "1" ]]; then
    hits=$(grep -nE 'TBD|待定|待明确' "$spec" 2>/dev/null || true)
    if [[ -n "$hits" ]]; then
      while IFS= read -r l; do
        [[ -n "$l" ]] && fail "gate_requirements_tbd:${l%%:*}: spec 含 TBD/待定/待明确（29148 要求需求集完备、不允许待定项）"
      done <<< "$hits"
      found=1
    fi
  fi
  # —— 2. 唯一标识（REQUIREMENTS_ID_REQUIRED=1）：需求条目（含 应当/应该/必须/shall/must 的列表项）缺 REQ- 编号 → fail
  if [[ "${REQUIREMENTS_ID_REQUIRED:-0}" == "1" ]]; then
    hits=$(grep -nE '^[[:space:]]*([-*+]|[0-9]+[.)])[[:space:]]+' "$spec" 2>/dev/null \
      | grep -E '应当|应该|必须|shall|must|SHALL|MUST' \
      | grep -vE 'REQ-[0-9A-Za-z-]+' || true)
    if [[ -n "$hits" ]]; then
      local noid_count
      noid_count=$(printf '%s\n' "$hits" | wc -l | xargs)
      fail "gate_requirements_no_id: ${noid_count} 条需求条目缺 REQ- 唯一编号（29148 要求每条需求可唯一标识）"
      printf '%s\n' "$hits" | head -10 | sed 's/^/    /'
      found=1
    fi
  fi
  # —— 3. EARS 句式覆盖率 → warn-only（粗估：需求句中含 当…时/如果/若/when/while/if 触发词的比例 <50% 提示）
  local total=0 ears=0
  total=$(_norm_int "$(grep -cE '应当|应该|必须|shall|must|SHALL|MUST' "$spec" 2>/dev/null || true)")
  ears=$(_norm_int "$(grep -cE '当.*时|如果|若|在.*时|when|while|if |When |While |If ' "$spec" 2>/dev/null || true)")
  if [[ "$total" -gt 0 ]]; then
    local pct=$((ears*100/total))
    if [[ "$pct" -lt 50 ]]; then
      warn "EARS 句式覆盖率约 ${pct}%（${ears}/${total}，<50%）——建议按 EARS（Ubiquitous/Event/State/Optional/Complex）改写需求句"
    fi
  fi
  # —— 4. 需求集合一致性（ISO/IEC/IEEE 29148 §5.2.7.2：同一概念同一术语，无矛盾）→ warn-only
  #    启发式：提取需求句中的名词性关键词（中文 2-4 字词/英文大写缩写），检查同一概念是否用了不同词
  #    实现局限：bash 无 NLP，仅做粗粒度术语漂移提示（同义词对配置在 REQUIREMENTS_SYNONYM_PAIRS）
  if [[ ${#REQUIREMENTS_SYNONYM_PAIRS[@]} -gt 0 ]]; then
    local _pair _term_a _term_b _term_hits
    for _pair in "${REQUIREMENTS_SYNONYM_PAIRS[@]}"; do
      IFS='|' read -r _term_a _term_b <<< "$_pair"
      [[ -z "$_term_a" || -z "$_term_b" ]] && continue
      _term_hits=$(grep -cE "$_term_a" "$spec" 2>/dev/null || true)
      local _term_b_hits; _term_b_hits=$(grep -cE "$_term_b" "$spec" 2>/dev/null || true)
      if [[ "$_term_hits" -gt 0 && "$_term_b_hits" -gt 0 ]]; then
        warn "需求术语不一致：'${_term_a}'（${_term_hits} 处）与 '${_term_b}'（${_term_b_hits} 处）混用——29148 要求同一概念同一术语"
      fi
    done
  fi
  # —— 5. 需求集合完备性（ISO/IEC/IEEE 29148 §5.2.7.1：无 TBD/TBC/TBP）→ 已在上文 REQUIREMENTS_STRICT 覆盖
  #    补充：TBC（待确认）/TBP（待提供）也纳入零容容忍（REQUIREMENTS_STRICT=1 时）
  if [[ "${REQUIREMENTS_STRICT:-0}" == "1" ]]; then
    local _tbc_hits
    _tbc_hits=$(grep -nE 'TBC|TBP|待确认|待提供' "$spec" 2>/dev/null || true)
    if [[ -n "$_tbc_hits" ]]; then
      while IFS= read -r l; do
        [[ -n "$l" ]] && fail "gate_requirements_tbc:${l%%:*}: spec 含 TBC/TBP/待确认/待提供（29148 要求需求集完备，不允许待定项）"
      done <<< "$_tbc_hits"
      found=1
    fi
  fi

  if [[ $found -eq 0 ]]; then
    pass "需求质量检查通过（执法项未命中；EARS 覆盖率为 warn-only 提示）"
  fi
}
# gate: rtm
# domain: compliance / enforce: warn / tier: compliance
check_rtm() {
  echo "=== 需求追溯矩阵（RTM）检查（ISO/IEC/IEEE 29148：需求↔测试/矩阵追溯）==="
  [[ "${RTM_REQUIRED:-0}" == "1" ]] || { skip_if_unconfigured "RTM_REQUIRED 未启用，RTM 检查跳过"; return; }
  local found=0
  local matrix="${RTM_MATRIX_FILE:-docs/rtm.md}"
  local matrix_ok=1
  if [[ ! -f "$matrix" ]]; then
    matrix_ok=0
    if [[ "${RTM_MATRIX_REQUIRED:-0}" == "1" ]]; then
      # fail-closed 锚点：声明矩阵强制而文件缺失即 fail 并返回（不再级联检查 REQ，防误报放大）
      fail "gate_rtm_matrix_missing: 追溯矩阵文件不存在：${matrix}（RTM_MATRIX_REQUIRED=1，fail-closed；可用 RTM_MATRIX_FILE 指定路径）"
      return
    fi
    warn "追溯矩阵文件不存在：${matrix}——降级为仅测试目录追溯（RTM_MATRIX_REQUIRED=1 可升级为 fail）"
  fi
  local spec="${SPEC_FILE:-}"
  if [[ -z "$spec" || ! -f "$spec" ]]; then
    warn "SPEC_FILE 未配置或不存在，无法提取 REQ- 编号——RTM 降级为仅矩阵存在性检查"
    pass "需求追溯矩阵检查通过（无需求源，0/0）"
    return
  fi
  # 从 spec 提取 REQ-[0-9]+ 编号集合（去重排序，与 --requirements 的 REQ- 机制同源）
  local reqs
  reqs=$(grep -oE 'REQ-[0-9]+' "$spec" 2>/dev/null | sort -u || true)
  if [[ -z "$reqs" ]]; then
    pass "需求追溯矩阵检查通过（spec 无 REQ- 编号条目，0/0）"
    return
  fi
  # 测试目录文件清单（TEST_DIR_PATTERNS 经 _fw_resolve_globs 解析，兼容 bash 3.2 无 globstar）
  local test_files=""
  if [[ ${#TEST_DIR_PATTERNS[@]} -gt 0 ]]; then
    test_files=$(_fw_resolve_globs ${TEST_DIR_PATTERNS[@]+"${TEST_DIR_PATTERNS[@]}"} || true)
  fi
  local total=0 traced=0 req hit _thits
  while IFS= read -r req; do
    [[ -z "$req" ]] && continue
    total=$((total+1))
    hit=0
    # 编号边界防护：REQ-001 不得误命中 REQ-0010（ERE 后置 [^0-9] 或行尾）
    if [[ $matrix_ok -eq 1 ]] && grep -qE "${req}([^0-9]|\$)" "$matrix" 2>/dev/null; then
      hit=1
    fi
    if [[ $hit -eq 0 && -n "$test_files" ]]; then
      _thits=$(printf '%s\n' "$test_files" | xargs grep -lE "${req}([^0-9]|\$)" 2>/dev/null || true)
      [[ -n "$_thits" ]] && hit=1
    fi
    if [[ $hit -eq 1 ]]; then
      traced=$((traced+1))
    else
      fail "gate_rtm_untraced:${req}: 需求未追溯——测试目录与追溯矩阵（${matrix}）均无 ${req} 引用（29148 RTM）"
      found=1
    fi
  done <<< "$reqs"
  local pct=$((traced*100/total))
  echo "  ⓘ 追溯率：${pct}%（${traced}/${total}，矩阵：${matrix}）"
  [[ $found -eq 0 ]] && { pass "需求追溯矩阵检查通过（全部 ${total} 个 REQ 已追溯，追溯率 ${pct}%）"; return 0; }
}
