#!/usr/bin/env bash
# test-ci-informational-steps.sh — CI 信息性步骤台账锁（R130）
#
# 守两件事：
#   ① ci.yml ↔ ci/informational-steps.conf 对账：每个 continue-on-error: true 步骤必有 id 且登记在台账；
#     台账每项在 ci.yml 真实存在；含信息性步骤的 Job 末尾有 if: always() 的对账步并注入全部 outcome。
#   ② ci/informational-steps-check.sh 三值语义行为级：observe 到期即红 / red 转绿即红（棘轮）/ green 变红即红。
#   ③ 真台账在今天日期下合规——**注意**：observe 项到期后本断言会按设计转红，这不是回归，
#     是逼人把该步骤归类为 red 或 green（改 ci/informational-steps.conf 即可）。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
BASE="$(pwd)"; REPO="$(cd "${BASE}/.." && pwd)"
CI="$REPO/.github/workflows/ci.yml"; CONF="$BASE/ci/informational-steps.conf"; CHK="$BASE/ci/informational-steps-check.sh"
TMP="$(mktemp -d /tmp/ciinfo.XXXXXX)"; trap 'rm -rf "$TMP"' EXIT
FAIL=0; ok() { echo "  ✓ $1"; }; bad() { echo "  ✗ $1" >&2; FAIL=1; }

# ===== ① ci.yml ↔ 台账对账 =====
[[ -f "$CI" && -f "$CONF" && -x "$CHK" ]] && ok "①a 三件在位（ci.yml / conf / check.sh 可执行）" || bad "①a 缺件"
# 每个 continue-on-error: true 向上找最近的 "- name:" 块内须有 id:
_coe_total=0; _coe_noid=""
while IFS= read -r ln; do
  _coe_total=$((_coe_total+1))
  _start=$(awk -v L="$ln" 'NR<=L && /^      - name:/{s=NR} END{print s}' "$CI")
  _id=$(sed -n "${_start},${ln}p" "$CI" | grep -E '^        id: ' | sed 's/^ *id: *//' | head -1)
  if [[ -z "$_id" ]]; then _coe_noid="${_coe_noid} L${ln}"; else
    grep -q "^${_id}	" "$CONF" || bad "①b 步骤 id=${_id}（ci.yml:${ln}）未登记台账"
  fi
done < <(grep -n 'continue-on-error: true' "$CI" | cut -d: -f1)
[[ -z "$_coe_noid" ]] && ok "①b 全部 ${_coe_total} 个 continue-on-error 步骤有 id 且登记台账" || bad "①b 无 id 的信息性步骤: ${_coe_noid}"
# 台账每项在 ci.yml 存在 id:
while IFS=$'\t' read -r sid _ _ _ || [[ -n "${sid:-}" ]]; do
  [[ -z "${sid:-}" || "$sid" == \#* ]] && continue
  grep -q "^        id: ${sid}\$" "$CI" || bad "①c 台账项 ${sid} 在 ci.yml 无对应 id:"
  grep -q "INFO_OUTCOME_$(printf '%s' "$sid" | tr '[:lower:]' '[:upper:]'): \${{ steps.${sid}.outcome }}" "$CI" \
    || bad "①c 台账项 ${sid} 的 outcome 未注入对账步 env"
done < "$CONF"
[[ $FAIL -eq 0 ]] && ok "①c 台账项全部在 ci.yml 有 id 且 outcome 注入对账步"
[[ $(grep -c 'informational-steps-check.sh ci/informational-steps.conf' "$CI") -eq 2 ]] \
  && ok "①d 两个含信息性步骤的 Job 各有对账步" || bad "①d 对账步数量≠2"
[[ $(grep -A1 '信息性步骤台账对账' "$CI" | grep -c 'if: always()') -eq 2 ]] \
  && ok "①e 对账步 if: always()（信息性步骤红也要跑）" || bad "①e 对账步缺 if: always()"
# 信息性步骤失败须 exit 1（否则 outcome 永远 success，台账失明）
[[ $(grep -c '（信息性.*"; exit 1; }' "$CI") -eq 3 ]] \
  && ok "①f 三个信息性步骤失败时 exit 1（outcome 真实）" || bad "①f 信息性步骤仍把失败吞成 echo（$(grep -c '（信息性.*"; exit 1; }' "$CI") 处 exit 1）"

# ===== ② check.sh 三值语义（固定日期 2026-10-21）=====
mk() { printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "r" > "$TMP/c.conf"; }
mk s_obs observe 2026-11-20; INFO_OUTCOME_S_OBS=failure bash "$CHK" "$TMP/c.conf" 2026-10-21 >/dev/null 2>&1 && ok "②a observe 未到期+红 → 0" || bad "②a"
mk s_obs observe 2026-10-01; INFO_OUTCOME_S_OBS=success bash "$CHK" "$TMP/c.conf" 2026-10-21 >"$TMP/o" 2>&1; rc=$?
[[ $rc -eq 1 ]] && grep -q '到期仍未归类' "$TMP/o" && ok "②b observe 到期 → 1（逼归类）" || bad "②b rc=${rc}"
mk s_red red 2026-10-01; INFO_OUTCOME_S_RED=failure bash "$CHK" "$TMP/c.conf" 2026-10-21 >/dev/null 2>&1 && ok "②c red+失败 → 0" || bad "②c"
INFO_OUTCOME_S_RED=success bash "$CHK" "$TMP/c.conf" 2026-10-21 >"$TMP/o" 2>&1; rc=$?
[[ $rc -eq 1 ]] && grep -q '棘轮' "$TMP/o" && ok "②d red 转绿 → 1（棘轮）" || bad "②d rc=${rc}"
mk s_grn green 2026-10-01; INFO_OUTCOME_S_GRN=success bash "$CHK" "$TMP/c.conf" 2026-10-21 >/dev/null 2>&1 && ok "②e green+成功 → 0" || bad "②e"
INFO_OUTCOME_S_GRN=failure bash "$CHK" "$TMP/c.conf" 2026-10-21 >"$TMP/o" 2>&1; rc=$?
[[ $rc -eq 1 ]] && grep -q '真回归' "$TMP/o" && ok "②f green 变红 → 1（不再被掩盖）" || bad "②f rc=${rc}"
mk s_grn green 2026-10-01; bash "$CHK" "$TMP/c.conf" 2026-10-21 >/dev/null 2>&1 && ok "②g 未注入 outcome（本地）不判定 → 0" || bad "②g"
mk s_bad weird 2026-10-01; bash "$CHK" "$TMP/c.conf" 2026-10-21 >/dev/null 2>&1; [[ $? -eq 1 ]] && ok "②h 非法 state → 1" || bad "②h"
: > "$TMP/c.conf"; bash "$CHK" "$TMP/c.conf" 2026-10-21 >/dev/null 2>&1; [[ $? -eq 1 ]] && ok "②i 空台账 → 1（零登记=失明）" || bad "②i"

# ===== ③ 真台账今天合规（observe 到期后按设计转红——届时改台账归类）=====
if bash "$CHK" "$CONF" >"$TMP/o" 2>&1; then ok "③ 真台账合规（$(grep -c '^  ·' "$TMP/o") 项观察中）"; else bad "③ 真台账违规（若为观察期到期：把该步骤归类 red/green）：$(grep '✗' "$TMP/o" | head -2)"; fi

echo ""
[[ $FAIL -eq 0 ]] && echo "✓ test-ci-informational-steps 全绿" || { echo "✗ test-ci-informational-steps 存在失败项" >&2; }
exit $FAIL
