#!/bin/bash
# roster-account-count.test.sh — R28 编制三方对账口径守门（run23 实录根治）
#
# 三件套断言：
#  ① 人类账号口径不含服务令牌：`^jwt_<名字>=`（单下划线）——run23 实锚：admin 的
#    治理服务令牌 jwt__gov 满足 `^jwt_`，被算进人类账号后再 +1 补 admin，恒报
#    16≠15/15 假不一致（48 次同文刷屏的根因之一）。
#  ② 冒烟段断言幂等：roster 不一致改 issue_once（该段每次驱动重启都重跑，无 _done 键，
#    裸 echo 会随重启次数刷单）。
#  ③ 同型状态断言（g2-security-not-closed / lifecycle-service-unreachable|gov-report）
#    亦须 issue_once——事件型（每分支/每缺陷各一单）不在此列。
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
DRIVER="$HERE/aipay-scenario.sh"
LIB="$HERE/mux/mx-scenario-lib.sh"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/roster-count.XXXXXX")" || exit 1
trap 'rm -rf "$TMP"' EXIT
fail() { echo "FAIL roster-account-count: $*" >&2; exit 1; }

# ── ① 计数口径（功能实测：模拟 state.env 两种形态）──
STATE="$TMP/state.env"
{ for i in $(seq 1 14); do echo "jwt_user$i=tok$i"; done; echo 'jwt__gov=servicetoken'; } > "$STATE"
_legacy=$(grep -c '^jwt_' "$STATE")                       # 15（含服务令牌）
_human=$(grep -cE '^jwt_[a-z][a-z0-9_]*=' "$STATE")       # 14（不含）
[[ "$_legacy" -eq 15 ]] || fail "夹具前提错：legacy 口径应得 15，实得 $_legacy"
[[ "$_human" -eq 14 ]] || fail "人类口径应得 14（排除 jwt__gov），实得 $_human"
[[ $(( _human + 1 )) -eq 15 ]] || fail "admin 补齐后应为 15（roster/org 同值），实得 $(( _human + 1 ))"

# ── ② 源码口径锁定（改一端即红）──
grep -qE "grep -cE '\^jwt_\[a-z\]\[a-z0-9_\]\*='" "$DRIVER" \
  || fail "驱动未采用收窄口径 '^jwt_[a-z][a-z0-9_]*='（服务令牌会被算进人类账号）"
grep -q 'issue_once roster-org-matrix-mismatch director' "$DRIVER" \
  || fail "roster 不一致未走 issue_once（冒烟段每次重启重跑，必然刷单）"
grep -q 'issue_once g2-security-not-closed secops-agent' "$DRIVER" \
  || fail "g2-security-not-closed 未走 issue_once（等待/重入面重复记录）"
grep -q 'issue_once lifecycle-service-unreachable gov-report' "$LIB" \
  || fail "lifecycle-service-unreachable|gov-report 未走 issue_once（报告链两次调用重复记录）"

# ── ③ 反向：issue_once 判据真的去重（防助手本身退化为裸 echo）──
EV="$TMP/evid"; mkdir -p "$EV"
( EVID_DIR="$EV"; eval "$(sed -n '/^issue_once()/,/^}/p' "$LIB")"
  issue_once demo-key demo-subject "第一版描述"
  issue_once demo-key demo-subject "第二版描述"   # 同 key+subject：应被吞
  issue_once demo-key other-subject "另一主体"     # 不同 subject：应记
)
n=$(grep -c '^ISSUE|demo-key|demo-subject|' "$EV/issues.log" || true)
[[ "$n" -eq 1 ]] || fail "issue_once 去重失效：同 key+subject 记了 $n 条（应 1）"
m=$(grep -c '^ISSUE|demo-key|' "$EV/issues.log" || true)
[[ "$m" -eq 2 ]] || fail "issue_once 过度去重：不同 subject 应各记一条（应 2，实得 $m）"

echo "PASS roster-account-count（口径收窄 14+1=15／源码锁定／issue_once 去重三断言）"
