# gate: floor-guard
# domain: process / enforce: strict / tier: core
check_floor_guard() {
  echo "=== 降标守卫（只报把质量底线往下挪的 diff 动作）==="
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    skip_if_unconfigured "非 git 仓库，降标守卫跳过"
    return 0
  fi
  # 定位外部判定器：源文件同目录 → ../scripts/ → 项目 scripts/（生成物与夹具两种布局都覆盖）
  local _d _runner="" _c
  _d="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd)"
  for _c in "$_d/floor-guard.sh" "$_d/../scripts/floor-guard.sh" "${PROJECT_DIR:-.}/scripts/floor-guard.sh"; do
    [[ -f "$_c" ]] && { _runner="$_c"; break; }
  done
  if [[ -z "$_runner" ]]; then
    skip_if_unconfigured "floor-guard.sh 不可达，降标守卫跳过（诚实披露：未判定不等于无降标）"
    return 0
  fi
  local out rc
  out=$(bash "$_runner" --root "${PROJECT_DIR:-.}" 2>&1); rc=$?
  case "$rc" in
    0) pass "降标守卫通过：${out}" ;;
    1)
      local _ln _lines
      # 用 here-string 而非管道：管道会让 while 落到子 shell，fail() 的计数增量丢失（门禁假绿）
      _lines="$(printf '%s\n' "$out" | grep '^降标' | head -5)"
      if [[ -n "$_lines" ]]; then
        while IFS= read -r _ln; do
          fail "gate_floor_guard: ${_ln}——恢复底线，或按决策 26.2 在 decisions.jsonl 逐条登记降标理由"
        done <<< "$_lines"
      else
        fail "gate_floor_guard: 守卫判定存在降标但未给出条目——检查 scripts/floor-guard.sh 输出格式"
      fi
      ;;
    *) warn "gate_floor_guard_unavailable: 无法判定（rc=${rc}）：${out}——rc=2 不计为通过" ;;
  esac
  return 0
}
