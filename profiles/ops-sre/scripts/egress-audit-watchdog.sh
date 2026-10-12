#!/bin/bash
# egress-audit-watchdog.sh — egress_write_audit 周期值守（cron no_agent 日检）
# 任务卡: t_314fb55e（gap-20260909-005 后续）
# 职责: 每日跑 egress_write_audit.py → 产物落 daily/ → unknown 超阈值时输出微信告警段
#       （规则: egress-audit-alert-rules.yaml；severity=medium；无告警时 stdout 空 → cron
#        no_agent 语义自动不投递）
# 纪律: 只读扫描器+白名单（本卡不改二者）；扫描器恒 exit 0，本脚本对扫描步骤失败也
#       继续用历史值评估（可在告警段标注 source_error）；set -u 防变量笔误静默错判
set -u

GAP_DIR="/Volumes/YOURVOLUME/lab/hermes-docker-sandbox/workspace/life-workbench/gap_workspaces/gap-20260909-005"
DAILY_DIR="$GAP_DIR/daily"
SCANNER="$GAP_DIR/egress_write_audit.py"
RULES="$GAP_DIR/ops-sre-watchdog/egress-audit-alert-rules.yaml"
PY=python3
TODAY=$(date '+%Y%m%d')
TS=$(date '+%F %H:%M')

mkdir -p "$DAILY_DIR"

# ① 日检扫描（恒 exit 0；JSON 报告落 daily/，事件流 append 到共享 JSONL 留痕）
SCAN_JSON="$DAILY_DIR/egress_audit_daily_$TODAY.json"
SCAN_OUT=$($PY "$SCANNER" --json "$SCAN_JSON" --append-log "$GAP_DIR/egress_audit_events.jsonl" 2>&1)

# 从 JSON 报告提取 unknown 计数（报告写失败则回退 stdout 解析）
UNKNOWN=""
SCAN_ID=""
if [ -s "$SCAN_JSON" ]; then
    UNKNOWN=$($PY - "$SCAN_JSON" <<'PYEOF'
import json, sys
try:
    r = json.load(open(sys.argv[1]))
    print(r.get("counts", {}).get("unknown", ""))
    print(r.get("scan_id", ""))
except Exception:
    pass
PYEOF
)
    UNKNOWN=$(printf '%s\n' "$UNKNOWN" | sed -n 1p)
    SCAN_ID=$(printf '%s\n' "$UNKNOWN" >/dev/null; printf '%s' "$SCAN_OUT" | grep -o 'scan_id: [0-9a-z_]*' | head -1 | awk '{print $2}')
else
    # 报告缺失：从 stdout 兜底抓 unknown 计数
    UNKNOWN=$(printf '%s' "$SCAN_OUT" | grep -o '^unknown: [0-9]*' | awk '{print $2}' | head -1)
    SCAN_ID=$(printf '%s' "$SCAN_OUT" | grep -o 'scan_id: [0-9a-z_]*' | head -1 | awk '{print $2}')
fi

# ② 阈值评估 + 告警输出（规则文件驱动；基线=daily/ 最近 7 份【历史】报告 unknown 中位数，
#    不含今日——尖峰不被当日值稀释，对比口径=今日 vs 7 日基线中位数）
$PY - "$RULES" "$DAILY_DIR" "$SCAN_JSON" "$UNKNOWN" "$SCAN_ID" "$TS" "$SCAN_OUT" <<'PYEOF'
import json, os, re, sys

rules_path, daily_dir, scan_json, unknown_s, scan_id, ts, scan_out = sys.argv[1:8]

# --- 极简 YAML 读取（只取本规则文件用到的标量键，零第三方依赖）---
rules_txt = open(rules_path, encoding='utf-8').read()
def scalar(key, default=None):
    m = re.search(r'^\s*%s:\s*([^\s#]+)' % re.escape(key), rules_txt, re.M)
    return m.group(1) if m else default
win_days = int(scalar('window_days', '7'))
seed = int(scalar('seed_baseline', '0'))
growth_thr = float(scalar('median_growth_pct', '50'))
abs_max = int(scalar('absolute_max', '3000'))

# --- 基线: daily/ 最近 win_days 份【历史】报告的 unknown 中位数（不含今日）---
hist = []
for fn in sorted(os.listdir(daily_dir)):
    if fn.startswith('egress_audit_daily_') and fn.endswith('.json') and fn != os.path.basename(scan_json):
        try:
            c = json.load(open(os.path.join(daily_dir, fn))).get('counts', {}).get('unknown')
            if isinstance(c, int):
                hist.append((fn, c))
        except Exception:
            pass
hist = sorted(hist)[-win_days:]

def median(vals):
    s = sorted(vals)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2

unknown = int(unknown_s) if (unknown_s or '').strip().isdigit() else None
if unknown is None:
    # 计数拿不到：不虚构，按数据源失败处理——静默会吞告警，改为明确告警段
    print('[severity: medium] egress 审计异常: 日检扫描计数缺失（%s）' % ts)
    print('stdout 片段: %s' % (scan_out or '(empty)').strip().replace('\n', ' | ')[:300])
    sys.exit(0)

# 基线窗口=纯历史日；无历史（首日）回落 seed_baseline；seed 也没有 → 不评估增幅，只查绝对阈值
if hist:
    baseline_median = median([c for _, c in hist])
    baseline_src = '%d 日历史中位数' % len(hist)
elif seed:
    baseline_median = seed
    baseline_src = 'seed(首轮真实扫描)'
else:
    baseline_median = 0
    baseline_src = 'n/a'
growth_pct = round((unknown - baseline_median) / baseline_median * 100, 1) if baseline_median else 0.0

triggered = []
if baseline_median and (unknown - baseline_median) / baseline_median * 100 > growth_thr:
    triggered.append('7日中位数增幅 %.1f%% > %.0f%%' % ((unknown - baseline_median) / baseline_median * 100, growth_thr))
if unknown > abs_max:
    triggered.append('单日 unknown %d > %d' % (unknown, abs_max))

# --- 无告警: stdout 留空（no_agent 语义=不投递，防骚扰）---
if not triggered:
    sys.exit(0)

report_rel = scan_json if os.path.exists(scan_json) else '(report missing)'
print('[severity: medium] egress 审计告警: unknown 公网写入事件 %d 条' % unknown)
print('基线(%s): %s | 增幅: %s%%' % (baseline_src, baseline_median, growth_pct))
print('触发规则: %s' % '; '.join(triggered))
print('scan_id: %s | 报告: %s' % (scan_id or '(n/a)', report_rel))
print('处置入口: 父卡 gap-20260909-005 GAP-CLOSURE-REPORT.md §五（复跑+白名单裁决走官方通道）')
PYEOF
