# gate: skill-routing
# domain: quality / enforce: warn / tier: arch
check_skill_routing() {
  echo "=== 技能描述路由评测（触发词表回归 + 描述碰撞）==="
  local root="${PROJECT_DIR:-.}"
  if [[ ! -f "${root}/SKILL.md" ]]; then
    skip_if_unconfigured "当前目录无 SKILL.md（非目标技能根），路由评测跳过"
    return 0
  fi
  local cases="${SKILL_CASES_FILE:-assets/evals/cases.tsv}"
  [[ "$cases" = /* ]] || cases="${root}/${cases}"
  if [[ ! -f "$cases" ]]; then
    skip_if_unconfigured "未配置路由用例（${cases}）——生成期从目标仓的 issue/commit/AGENTS.md 取用户真实说法，落正例≥3、反例≥2"
    return 0
  fi
  # 定位外部判定器：源文件同目录 → ../scripts/ → 项目 scripts/（生成物与夹具两种布局都覆盖）
  local _d _runner="" _c
  _d="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd)"
  for _c in "$_d/eval-routing.sh" "$_d/../scripts/eval-routing.sh" "${root}/scripts/eval-routing.sh"; do
    [[ -f "$_c" ]] && { _runner="$_c"; break; }
  done
  if [[ -z "$_runner" ]]; then
    skip_if_unconfigured "eval-routing.sh 不可达，路由评测跳过（诚实披露：未评不等于通过）"
    return 0
  fi

  local minr="${ROUTING_MIN_RANK1:-90}"
  local out rc
  local peers="${root}/.."
  if compgen -G "${peers}/*/SKILL.md" >/dev/null 2>&1; then
    out=$(bash "$_runner" --cases "$cases" --skill "${root}/SKILL.md" --skill-dir "$peers" --min-rank1 "$minr" 2>&1); rc=$?
  else
    out=$(bash "$_runner" --cases "$cases" --skill "${root}/SKILL.md" --min-rank1 "$minr" 2>&1); rc=$?
  fi

  case "$rc" in
    0) pass "路由评测通过（$(printf '%s' "$out" | grep -c '^PASS' ) 例通过；$(printf '%s' "$out" | grep 'rank-1 率' | head -1)）" ;;
    1)
      local _pos _neg
      _pos=$(printf '%s' "$out" | grep -E '^FAIL 正例|^FAIL 描述碰撞' | head -2 | tr '\n' '；')
      _neg=$(printf '%s' "$out" | grep -E '^FAIL 反例|^ERR' | head -2 | tr '\n' '；')
      if [[ -n "$_pos" ]]; then
        fail "gate_skill_routing_hit: ${_pos}——描述缺用户会说的词或与邻技能过近；改描述，不要改用例"
      fi
      if [[ -n "$_neg" ]]; then
        fail "gate_skill_routing_neg: ${_neg}——反例被抢走或 owner 配错；先确认真实归属再改描述"
      fi
      ;;
    *) warn "gate_skill_routing_unavailable: 评测器无法运行（rc=${rc}）：$(printf '%s' "$out" | tail -1)——未评不等于通过" ;;
  esac
  return 0
}
