#!/bin/bash
# 守门：方案×程序同步不变量（2026-11-02 同步批）。fail-closed：任一条不满足即红。
# 覆盖三件事：①方案与程序的判据/映射一致（G2 五项、uat_conditional 双键）；
# ②程序内数字与口径一致（prelaunch 37 签、qgate 47/50）；③账号供给口令解析行为。
set -u
HERE="$(cd "$(dirname "$0")/../.." && pwd)"          # simharness/
OV="${MX_OVERLAY_ROOT:-$(cd "$HERE/.." && pwd)}"       # 仓根
PLAN="$OV/docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md"
SC="$HERE/aipay-scenario.sh"
GEN="$HERE/mux/mx-report-gen.py"
AUD="$HERE/mux/mx-report-audit.py"
SKEL="$HERE/mux/mx-narrative-skeleton.py"
PRE="$HERE/mux/mx-prelaunch-check.sh"
QMAP="$HERE/mux/qgate-skill-map.md"
LIB="$HERE/mux/mx-lib.sh"
SETUP="$HERE/mux/mx-setup.sh"

FAIL=0
TOTAL=0
ck() { # <说明> <命令串>
  TOTAL=$((TOTAL+1))
  if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; FAIL=$((FAIL+1)); fi
}

ck "方案正本存在" "[ -f '$PLAN' ]"
ck "G2 评审卡 body 含第⑤项历史偏差" "grep -q '⑤历史偏差硬性拦截' '$SC'"
ck "G2 派发词含第 5 项" "grep -q '5) 历史偏差硬性拦截' '$SC'"
ck "G2 PASS 后缺失记问题单" "grep -q 'g2-history-check-missing' '$SC'"
ck "报告生成器步 21 双键" "grep -q \"21: \\['uat_done', 'uat_conditional'\\]\" '$GEN'"
ck "报告审计器步 21 双键" "grep -q \"('uat_done', 'uat_conditional')\" '$AUD'"
ck "叙事骨架步 21 双键" "grep -q \"21: \\['uat_done', 'uat_conditional'\\]\" '$SKEL'"
ck "方案 §3.3 步 21 双键" "grep -q '| 21 | uat | uat_done / uat_conditional |' '$PLAN'"
ck "prelaunch ㉚ 写 37 签" "grep -q '㉚ 阶段页签 37' '$PRE'"
ck "prelaunch ㉚ 断言六个治理签" "grep -q \"key: 'proactivity'\" '$PRE' && grep -q \"key: 'posture'\" '$PRE' && grep -q \"key: 'trust'\" '$PRE'"
ck "prelaunch ㉚ 用 -E 禁 29/31" "grep -q \"(29|31) 个页签\" '$PRE'"
ck "方案不含 29/31 签" "! grep -Eq '(29|31) 个页签' '$PLAN'"
ck "qgate 对照表 47 门/50 门" "grep -q '门总数 47' '$QMAP' && grep -q '全量 50 门四族' '$QMAP'"
ck "方案已写 eval 八页签" "grep -q '/app/eval 八页签' '$PLAN'"
ck "方案已写技能评估环" "grep -q '技能产出 Grader 环' '$PLAN'"
ck "prelaunch ㉓ 断言 skill-grade" "grep -q 'skill-grade' '$PRE'"
ck "方案已写 37 签" "grep -q '共 37 签' '$PLAN'"
ck "方案已写 96 条纪律" "grep -q '96 条纪律' '$PLAN'"
ck "方案含 §2.6.13-2.6.16" "grep -q '^#### 2.6.13 ' '$PLAN' && grep -q '^#### 2.6.16 ' '$PLAN'"
ck "mx-setup 建 admin-agent" "grep -q 'synapse_register \"admin-agent\"' '$SETUP'"
ck "mx-setup 登录用 login_password_for" "grep -q 'login_password_for \"\\\$n\"' '$SETUP'"

# 口令解析行为（真实 source mx-lib；隔离 SIM_ROOT/CREDS_DIR）
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/creds"
printf 'rand123' > "$T/creds/bella.invite-pass"
_PW=$(AIPAY_SIM_ROOT="$T" RUN_ID=gate bash -c "source '$LIB' >/dev/null 2>&1; CREDS_DIR='$T/creds'; login_password_for bella; printf '|'; login_password_for bella-agent; printf '|'; login_password_for hu" 2>/dev/null)
ck "邀请口令解析（人类/agent/回退）" "[ '$_PW' = 'rand123|rand123-agent|Aipay_hu_2026' ]"

echo "=== 结果：$((TOTAL-FAIL)) 过 / $FAIL 败 ==="
[ "$FAIL" -eq 0 ] || exit 1
