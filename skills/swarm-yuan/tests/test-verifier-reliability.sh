#!/usr/bin/env bash
# 验证入口一致性：ShellCheck 失败、框架合规误报和 fixture 钩子失败必须阻断。
# 全部语料与变异在临时目录；all 的其他外部检查使用成功替身，只检验投票传播。
set -uo pipefail  # 失败用例须继续执行，最后统一汇总。
BASE="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$BASE/.." && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/verifier-reliability.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/tmp"
export TMPDIR="$WORK/tmp"  # 失败探针保留的 verifier 日志也只留在本次沙箱。
PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✗ $1"; }
expect_rc() { # $1=zero|nonzero|指定退出码 $2=标签 $3..=命令；保留输出供后续断言。
  local wanted="$1" label="$2" rc; shift 2
  OUTPUT=$("$@" 2>&1); rc=$?
  if [[ "$wanted" == "$rc" ]] || { [[ "$wanted" == zero && "$rc" -eq 0 ]]; } || { [[ "$wanted" == nonzero && "$rc" -ne 0 ]]; }; then
    ok "${label}（rc=${rc}）"
  else
    bad "${label}（rc=${rc}）"
    printf '%s\n' "$OUTPUT"
  fi
}
need() {
  if printf '%s\n' "$OUTPUT" | grep -qF -- "$1"; then ok "$2"; else bad "$2"; fi
}

# 1. 真实 verifier + 可控 ShellCheck：正常、诊断、无输出工具故障三个状态。
SBOX="$WORK/shellcheck"
mkdir -p "$SBOX/verifier/v1" "$SBOX/swarm-yuan/assets/framework-gates" \
  "$SBOX/swarm-yuan/scripts" "$SBOX/swarm-yuan/tests/e2e" \
  "$SBOX/swarm-yuan/tests/fixtures" "$SBOX/swarm-yuan/tests/gate-fixtures"
cp "$REPO/verifier/v1/run-verifier.sh" "$SBOX/verifier/v1/"
cp "$REPO/verifier/v1/run-one-fixture.sh" "$SBOX/verifier/v1/"
cp "$BASE/tests/run-framework-fixture.sh" "$BASE/tests/run-gate-fixture.sh" "$SBOX/swarm-yuan/tests/"
for f in assets/precheck.sh assets/state-machine.sh assets/framework-gates/demo.sh \
  scripts/generate-skill.sh scripts/self-check.sh tests/e2e/run-e2e.sh tests/e2e/run-gen-e2e.sh; do
  printf '#!/usr/bin/env bash\nexit 0\n' > "$SBOX/swarm-yuan/$f"
done
# all 正向对照需要一个真实非空 fixture；空集合的 fail-closed 另有专项探针。
mkdir -p "$SBOX/swarm-yuan/tests/fixtures/min/violating" \
  "$SBOX/swarm-yuan/tests/fixtures/min/compliant"
cat > "$SBOX/swarm-yuan/assets/framework-gates/min.sh" <<'SH'
_fw_min_check() { :; }
SH
for mode in violating compliant; do
  printf 'MODE=%s\nPROJECT_DIR="__REPO_ROOT__"\n' "$mode" > "$SBOX/swarm-yuan/tests/fixtures/min/$mode/precheck.conf"
done
mkdir -p "$SBOX/swarm-yuan/tests/gate-fixtures/summary/compliant/scripts"
printf 'MODE=compliant\nPROJECT_DIR="__REPO_ROOT__"\n' > "$SBOX/swarm-yuan/tests/gate-fixtures/summary/compliant/scripts/precheck.conf"
printf '#!/usr/bin/env bash\n. "$(dirname "$0")/precheck.conf"\nif [[ "$MODE" == violating ]]; then printf "⚠ advisory: fw_min_probe\\n"; fi\nexit 0\n' \
  > "$SBOX/swarm-yuan/assets/precheck.sh"
for f in metrics-assert.sh cli-ab-test.sh; do
  printf '#!/usr/bin/env bash\nexit 0\n' > "$SBOX/verifier/v1/$f"
done
printf 'FIXTURE min OK (v=0 c=0 ids=0)\nFIXTURES_TOTAL 1 FAILS 0\n' > "$SBOX/verifier/v1/golden-vector.txt"
cat > "$SBOX/shellcheck" <<'SH'
#!/usr/bin/env bash
if [[ "${1:-}" == "--version" ]]; then echo "sandbox-shellcheck 0.0"; exit 0; fi
severity=""
for target in "$@"; do
  case "$target" in error|warning) severity="$target";; esac
done
if grep -q '^AUDIT_ERROR$' "$target"; then
  echo "$target:2:1: error: audit syntax error [SC1073]"
  exit 1
fi
if grep -q '^AUDIT_TOOL_FAILURE$' "$target"; then exit 2; fi
if [[ "$severity" == warning ]] && grep -q '^AUDIT_WARNING$' "$target"; then
  echo "$target:2:1: warning: audit warning [SC2034]"
  exit 1
fi
exit 0
SH
chmod +x "$SBOX/shellcheck"
VR="$SBOX/verifier/v1/run-verifier.sh"
expect_rc zero 'ShellCheck 正向对照' env SHELLCHECK="$SBOX/shellcheck" bash "$VR" shellcheck
expect_rc zero 'all 正向对照' env SHELLCHECK="$SBOX/shellcheck" bash "$VR" all
printf 'AUDIT_WARNING\n' >> "$SBOX/swarm-yuan/assets/precheck.sh"
expect_rc zero 'ShellCheck warning 保持信息性' env SHELLCHECK="$SBOX/shellcheck" bash "$VR" shellcheck
need 'SHELLCHECK_WARNINGS_CORE 1' 'ShellCheck warning 仍计数'
expect_rc zero 'warning 不阻断 all' env SHELLCHECK="$SBOX/shellcheck" bash "$VR" all
printf '#!/usr/bin/env bash\nexit 0\n' > "$SBOX/swarm-yuan/assets/precheck.sh"
printf 'AUDIT_ERROR\n' >> "$SBOX/swarm-yuan/assets/precheck.sh"
expect_rc nonzero 'ShellCheck 发现错误即失败' env SHELLCHECK="$SBOX/shellcheck" bash "$VR" shellcheck
need 'SHELLCHECK_ERRORS 1' 'ShellCheck 错误计数真实'
expect_rc nonzero 'ShellCheck 错误传播至 all' env SHELLCHECK="$SBOX/shellcheck" bash "$VR" all
printf '#!/usr/bin/env bash\nAUDIT_TOOL_FAILURE\n' > "$SBOX/swarm-yuan/assets/precheck.sh"
expect_rc nonzero 'ShellCheck 无输出工具故障即失败' env SHELLCHECK="$SBOX/shellcheck" bash "$VR" shellcheck
expect_rc nonzero 'ShellCheck 工具故障传播至 all' env SHELLCHECK="$SBOX/shellcheck" bash "$VR" all
if command -v shellcheck >/dev/null 2>&1; then
  printf '#!/usr/bin/env bash\nif then\n' > "$SBOX/swarm-yuan/assets/precheck.sh"
  expect_rc nonzero '真实 ShellCheck 语法错误即失败' env SHELLCHECK="$(command -v shellcheck)" bash "$VR" shellcheck
fi

# 夹具资产整体丢失时不能以 0/0 空跑通过。
EMPTY="$WORK/empty"
mkdir -p "$EMPTY/verifier/v1" "$EMPTY/swarm-yuan/tests/fixtures" "$EMPTY/swarm-yuan/tests/gate-fixtures"
cp "$REPO/verifier/v1/run-verifier.sh" "$EMPTY/verifier/v1/"
EV="$EMPTY/verifier/v1/run-verifier.sh"
expect_rc nonzero '空框架夹具集失败' bash "$EV" fixtures
need 'FIXTURES_EMPTY' '空框架夹具集显式披露'
expect_rc nonzero '空门禁夹具集失败' bash "$EV" gate-fixtures
need 'GATE_FIXTURES_EMPTY' '空门禁夹具集显式披露'

# 并行 verifier 运行日志独立；失败保留准确路径，成功不留下空目录。
printf '#!/usr/bin/env bash\necho AUDIT_E2E_FAILURE\nexit 1\n' > "$SBOX/swarm-yuan/tests/e2e/run-e2e.sh"
expect_rc nonzero 'E2E 失败保留日志' bash "$VR" e2e
LOG_A=$(printf '%s\n' "$OUTPUT" | sed -n 's/^失败日志保留: //p')
if [[ -f "$LOG_A/e2e.log" ]] && grep -q AUDIT_E2E_FAILURE "$LOG_A/e2e.log"; then
  ok '失败日志路径可读且包含现场'
else
  bad '失败日志路径可读且包含现场'
fi
expect_rc nonzero '第二次 E2E 失败独立留痕' bash "$VR" e2e
LOG_B=$(printf '%s\n' "$OUTPUT" | sed -n 's/^失败日志保留: //p')
if [[ -n "$LOG_A" && -n "$LOG_B" && "$LOG_A" != "$LOG_B" ]]; then ok '两次 verifier 日志不共用路径'; else bad '两次 verifier 日志不共用路径'; fi
mkdir -p "$WORK/success-logs"
printf '#!/usr/bin/env bash\nexit 0\n' > "$SBOX/swarm-yuan/tests/e2e/run-e2e.sh"
expect_rc zero 'E2E 成功对照' env TMPDIR="$WORK/success-logs" bash "$VR" e2e
set -- "$WORK/success-logs"/verifier-logs.*
[[ ! -e "$1" ]] && ok '成功运行清理日志目录' || bad '成功运行清理日志目录'

# 2. 同一个真实 .NET 双态 fixture：合规误报不能被 verifier/golden 忽略。
FBOX="$WORK/framework"
mkdir -p "$FBOX/verifier/v1" "$FBOX/swarm-yuan/tests/fixtures" "$FBOX/swarm-yuan/assets/framework-gates"
cp "$REPO/verifier/v1/run-verifier.sh" "$REPO/verifier/v1/run-one-fixture.sh" "$FBOX/verifier/v1/"
cp "$BASE/tests/run-framework-fixture.sh" "$FBOX/swarm-yuan/tests/"
for f in precheck.sh gates-strict.sh gates-warn.sh gates-advisory.sh gate-enforce-level.conf; do
  cp "$BASE/assets/$f" "$FBOX/swarm-yuan/assets/"
done
cp -R "$BASE/tests/fixtures/dotnet" "$FBOX/swarm-yuan/tests/fixtures/"
cp "$BASE/assets/framework-gates/dotnet.sh" "$FBOX/swarm-yuan/assets/framework-gates/"
FR="$FBOX/swarm-yuan/tests/run-framework-fixture.sh"
VR="$FBOX/verifier/v1/run-verifier.sh"
expect_rc zero '框架直接入口正向对照' bash "$FR" dotnet
expect_rc zero '框架 verifier 正向对照' bash "$VR" fixtures
printf '%s\n' "$OUTPUT" > "$FBOX/verifier/v1/golden-vector.txt"
expect_rc zero '框架机器模式正向对照' bash "$FR" --machine dotnet
if [[ "$OUTPUT" =~ ^[01]\ 0\ 0$ ]]; then ok '机器契约仅输出三段数字'; else bad '机器契约仅输出三段数字'; fi
awk '{print} /^_fw_dotnet_check\(\) \{/ {print "  warn \"fw_dotnet_nullable: audit forced false positive\""}' \
  "$BASE/assets/framework-gates/dotnet.sh" > "$FBOX/swarm-yuan/assets/framework-gates/dotnet.sh"
expect_rc nonzero '合规误报被直接入口拒绝' bash "$FR" dotnet
OUTPUT=$(bash "$FR" --machine dotnet 2> "$FBOX/machine-error.log"); machine_rc=$?
if [[ "$machine_rc" -eq 1 && "$OUTPUT" =~ ^[01]\ 0\ [1-9][0-9]*$ ]]; then
  ok '机器失败契约保留三整数与 rc=1'
else
  bad '机器失败契约保留三整数与 rc=1'
fi
if grep -q 'expected-pass-ids' "$FBOX/machine-error.log"; then ok '机器模式诊断只写 stderr'; else bad '机器模式诊断只写 stderr'; fi
expect_rc nonzero '合规误报被 verifier 拒绝' bash "$VR" fixtures
need 'FIXTURE dotnet BAD' 'verifier 显示失败框架'
expect_rc nonzero '合规误报被 golden 拒绝' bash "$VR" golden
expect_rc nonzero '合规误报不能重建为 golden' bash "$VR" rebuild-golden
expect_rc 2 '缺少框架夹具返回 2' bash "$FR" --machine missing
cp "$BASE/assets/framework-gates/dotnet.sh" "$FBOX/swarm-yuan/assets/framework-gates/"
mv "$FBOX/swarm-yuan/assets/precheck.sh" "$FBOX/precheck.saved"
expect_rc 2 '缺少 precheck 返回 2' bash "$FR" --machine dotnet
printf '#!/usr/bin/env bash\necho "⚠ advisory: fw_dotnet_nullable"\nexit 23\n' > "$FBOX/swarm-yuan/assets/precheck.sh"
expect_rc 2 'precheck 执行错误返回 2' bash "$FR" --machine dotnet
mv "$FBOX/precheck.saved" "$FBOX/swarm-yuan/assets/precheck.sh"

# 3. 钩子失败不能由成功 precheck 掩盖；setup 失败仍须 teardown。
GBOX="$WORK/gate"
mkdir -p "$GBOX/swarm-yuan/tests/gate-fixtures/demo/compliant/scripts" "$GBOX/swarm-yuan/assets"
cp "$BASE/tests/run-gate-fixture.sh" "$GBOX/swarm-yuan/tests/"
FX="$GBOX/swarm-yuan/tests/gate-fixtures/demo/compliant"
cat > "$GBOX/swarm-yuan/assets/precheck.sh" <<'SH'
#!/usr/bin/env bash
GATE_FLAGS=(--demo)
. "$(dirname "$0")/precheck.conf"
printf 'ran\n' > "$PROJECT_DIR/precheck-ran"
exit 0
SH
printf 'PROJECT_DIR="__REPO_ROOT__"\n' > "$FX/scripts/precheck.conf"
printf '#!/usr/bin/env bash\nexit 0\n' > "$FX/scripts/setup.sh"
printf '#!/usr/bin/env bash\nprintf "cleaned\\n" > teardown-ran\nexit 0\n' > "$FX/scripts/teardown.sh"
GR="$GBOX/swarm-yuan/tests/run-gate-fixture.sh"
expect_rc zero '钩子成功正向对照' bash "$GR" demo
rm -f "$FX/precheck-ran" "$FX/teardown-ran"
printf '#!/usr/bin/env bash\necho AUDIT_SETUP_FAILED >&2\nexit 23\n' > "$FX/scripts/setup.sh"
expect_rc nonzero 'setup 失败即拒绝 fixture' bash "$GR" demo
[[ -f "$FX/teardown-ran" ]] && ok 'setup 失败仍执行 teardown' || bad 'setup 失败仍执行 teardown'
[[ ! -e "$FX/precheck-ran" ]] && ok 'setup 失败不执行 precheck' || bad 'setup 失败不执行 precheck'
printf '#!/usr/bin/env bash\nexit 0\n' > "$FX/scripts/setup.sh"
printf '#!/usr/bin/env bash\necho AUDIT_TEARDOWN_FAILED >&2\nexit 24\n' > "$FX/scripts/teardown.sh"
expect_rc nonzero 'teardown 失败即拒绝 fixture' bash "$GR" demo
expect_rc nonzero 'teardown 失败传播至全部门禁组' bash "$GR"

echo "test-verifier-reliability: PASS $PASS / FAIL $FAIL"
[[ "$FAIL" -eq 0 ]]
