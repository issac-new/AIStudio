#!/usr/bin/env bash
# 用法: run-framework-fixture.sh [--machine] <ruleset_id>
# 双态使用同一执行/断言实现：violating 须有发现，compliant 须退出 0；检查双方 ID 清单。
# --machine: stdout 仅三整数 <violating_rc> <compliant_rc> <assertion_failures>，诊断 stderr。
# 退出码：0=全部通过，1=断言失败，2=输入/执行异常。缺失输入不输出机器结果。
set -u
BASE="$(cd "$(dirname "$0")/.." && pwd)"
MACHINE=0
if [[ "${1:-}" == --machine ]]; then MACHINE=1; shift; fi
[[ $# -eq 1 ]] || { echo "用法: run-framework-fixture.sh [--machine] <ruleset_id>" >&2; exit 2; }
ID="$1"
FX="$BASE/tests/fixtures/$ID"
for required in "$BASE/assets/precheck.sh" "$BASE/assets/framework-gates/$ID.sh" \
  "$FX/violating/precheck.conf" "$FX/compliant/precheck.conf"; do
  [[ -f "$required" ]] || { echo "✗ fixture 输入缺失：$required" >&2; exit 2; }
done
WORK="$(mktemp -d /tmp/fwfx.XXXXXX)" || exit 2
trap 'rm -rf "$WORK"' EXIT
REPO_ROOT="$(cd "$BASE/.." && pwd)"
ASSERT_FAILURES=0
RESULT_RC=2
say() {
  if [[ "$MACHINE" -eq 1 ]]; then printf '%s\n' "$*" >&2; else printf '%s\n' "$*"; fi
}

run_one() { # $1=violating|compliant $2=fail|pass；RESULT_RC 留下真实子进程码。
  local mode="$1" expect="$2" tmp="$WORK/$1" out rc fid pid before="$ASSERT_FAILURES" gf
  RESULT_RC=2
  mkdir -p "$tmp/scripts" || return 2
  cp "$BASE/assets/precheck.sh" "$tmp/scripts/precheck.sh" || return 2
  for gf in gates-strict.sh gates-warn.sh gates-advisory.sh gate-enforce-level.conf; do
    if [[ -f "$BASE/assets/$gf" ]]; then cp "$BASE/assets/$gf" "$tmp/scripts/$gf" || return 2; fi
  done
  sed "s|__REPO_ROOT__|$REPO_ROOT|g" "$FX/$mode/precheck.conf" > "$tmp/scripts/precheck.conf" || return 2
  # 直接注入真实门禁片段，模拟 --inject-frameworks 产物。
  awk -v frag="$BASE/assets/framework-gates/$ID.sh" '
    /^# >>> swarm-yuan:framework-gates >>>/ { print; while ((getline l < frag) > 0) print l; skip=1; next }
    /^# <<< swarm-yuan:framework-gates <<</ { skip=0 }
    !skip { print }
  ' "$tmp/scripts/precheck.sh" > "$tmp/scripts/p2.sh" || return 2
  mv "$tmp/scripts/p2.sh" "$tmp/scripts/precheck.sh" || return 2
  out="$( cd "$FX/$mode" && bash "$tmp/scripts/precheck.sh" --framework 2>&1 )"
  rc=$?; RESULT_RC=$rc
  rm -f "$FX/$mode/.swarm-yuan/.gate-fail-flag" 2>/dev/null || true
  if [[ "$rc" -gt 1 ]]; then
    say "  ✗ ${mode}：precheck 执行异常（rc=${rc}）"
    say "$out"
    return 2
  fi
  if [[ "$expect" == fail ]]; then
    if ! printf '%s\n' "$out" | grep -qE '⚠ advisory: fw_|✗ fw_|✗ fail'; then
      ASSERT_FAILURES=$((ASSERT_FAILURES+1))
    fi
  elif [[ "$rc" -ne 0 ]]; then
    ASSERT_FAILURES=$((ASSERT_FAILURES+1))
  fi
  if [[ -f "$FX/$mode/expected-fail-ids" ]]; then
    while IFS= read -r fid || [[ -n "$fid" ]]; do
      [[ -z "$fid" ]] && continue
      case "$fid" in \#*) continue;; esac
      if ! printf '%s\n' "$out" | grep -qF -- "$fid"; then
        say "  ✗ expected-fail-ids 未命中：$fid"
        ASSERT_FAILURES=$((ASSERT_FAILURES+1))
      fi
    done < "$FX/$mode/expected-fail-ids"
  fi
  if [[ -f "$FX/$mode/expected-pass-ids" ]]; then
    while IFS= read -r pid || [[ -n "$pid" ]]; do
      [[ -z "$pid" ]] && continue
      case "$pid" in \#*) continue;; esac
      if printf '%s\n' "$out" | grep -E '(⚠|✗)' | grep -qF -- "$pid"; then
        say "  ✗ expected-pass-ids 违规：${pid} 在合规侧告警（门禁存在误报/死分支回归）"
        ASSERT_FAILURES=$((ASSERT_FAILURES+1))
      fi
    done < "$FX/$mode/expected-pass-ids"
  fi
  [[ "$ASSERT_FAILURES" -eq "$before" ]]
}

run_one violating fail; v_result=$?; v_rc=$RESULT_RC
if [[ "$v_result" -eq 0 ]]; then
  [[ "$MACHINE" -eq 1 ]] || say "✓ violating → 检出（符合预期）"
else
  say "✗ violating 未检出（无 advisory/fail 发现行）"
  [[ "$MACHINE" -eq 1 ]] || exit "$v_result"
fi
run_one compliant pass; c_result=$?; c_rc=$RESULT_RC
if [[ "$c_result" -eq 0 ]]; then
  [[ "$MACHINE" -eq 1 ]] || say "✓ compliant → PASS（符合预期）"
else
  say "✗ compliant 未 PASS"
fi
if [[ "$MACHINE" -eq 1 ]]; then printf '%s %s %s\n' "$v_rc" "$c_rc" "$ASSERT_FAILURES"; fi
if [[ "$v_result" -eq 2 || "$c_result" -eq 2 ]]; then exit 2; fi
[[ "$v_result" -eq 0 && "$c_result" -eq 0 ]]
