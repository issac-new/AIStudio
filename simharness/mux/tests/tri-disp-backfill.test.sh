#!/bin/bash
# tri-disp-backfill.test.sh — DISP 三态归桶收尾件守门（run15 复盘 N2 / V8.17 纪律 43 配套）。
# 夹具=run15 真实台账形态抽样（精确配对/泛指广播/悬挂 DISP/已是三态四种形态各一）。
# 断言：①表外键补观察桶行 ②幂等重跑不重复 ③已修禁自动升桶（归桶行全为观察）。
set -euo pipefail
LC_ALL=C
HERE="$(cd "$(dirname "$0")/../.." && pwd)"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/runs/tri-disp-test/evidence"
cp "$HERE/tests/fixtures/tri-disp-issues.log" "$T/runs/tri-disp-test/evidence/issues.log"
# 配对正本件（治理服务 run-metrics.pairing 快照——夹具四形态预计算）
cat > "$T/runs/tri-disp-test/evidence/governance-metrics.json" <<'DTO'
{"ok": true, "pairing": [
  {"key": "receipt-missing·AN-PAYCORE", "type": "receipt-missing", "subject": "AN-PAYCORE", "freq": 1, "mode": "exact", "disposition": "终态闭环：审计段复核回执已在房间可见（免等窗记单后补账成功）——原单保留记时点真值", "bucket": "表外词"},
  {"key": "wake-order-analysis·xiao", "type": "wake-order-analysis", "subject": "xiao", "freq": 1, "mode": "exact", "disposition": "空转收场唤醒令（anexec 系分产物 AN-MP 未以新提交入仓；驱动 wait_truth 串行硬窗在途）。回执见群消息。监控代行（纪律36 唤醒令类）", "bucket": "表外词"},
  {"key": "security-review-fail·secops-agent", "type": "security-review-fail", "subject": "secops-agent", "freq": 1, "mode": "none", "disposition": null, "bucket": "待处置"},
  {"key": "dev-branch-missing·DEV-PAYCORE-C", "type": "dev-branch-missing", "subject": "DEV-PAYCORE-C", "freq": 1, "mode": "none", "disposition": null, "bucket": "待处置"},
  {"key": "frame-capture-failed·step-appinit", "type": "frame-capture-failed", "subject": "step-appinit", "freq": 1, "mode": "generic", "disposition": "已修 同帧合法化处理后摘除（审计语义两步收紧件）", "bucket": "已修"}
]}
DTO
export AIPAY_SIM_ROOT="$T"

python3 "$HERE/mux/tri-disp-backfill.py" --run tri-disp-test >/dev/null
N1=$(grep -c '观察（收尾归桶' "$T/runs/tri-disp-test/evidence/issues.log")
[ "$N1" -eq 2 ] || { echo "FAIL: 期望归桶 2 键（receipt 精确+wake 精确），得 $N1"; exit 1; }

python3 "$HERE/mux/tri-disp-backfill.py" --run tri-disp-test >/dev/null
N2=$(grep -c '观察（收尾归桶' "$T/runs/tri-disp-test/evidence/issues.log")
[ "$N2" -eq "$N1" ] || { echo "FAIL: 幂等破坏（$N1 -> $N2）"; exit 1; }

if grep -qE '^DISP\|[^|]+\|[^|]+\|已修（收尾归桶' "$T/runs/tri-disp-test/evidence/issues.log"; then
  echo "FAIL: 归桶件出现自动升桶（已修桶）——纪律 28 禁"; exit 1
fi

# 快照缺席=安静退出不盲写（融合批三 fail-soft 面）
T2="$(mktemp -d)"; mkdir -p "$T2/runs/x/evidence"
cp "$HERE/tests/fixtures/tri-disp-issues.log" "$T2/runs/x/evidence/issues.log"
AIPAY_SIM_ROOT="$T2" python3 "$HERE/mux/tri-disp-backfill.py" --run x | grep -q '快照缺席' || { echo "FAIL: 快照缺席应安静退出"; exit 1; }
rm -rf "$T2"

echo "PASS tri-disp-backfill（归桶 $N1 键 / 幂等 / 零自动升桶 / 快照缺席不盲写）"
