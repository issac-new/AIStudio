#!/usr/bin/env python3
"""weixin_backlog_deliver.py — 夜间报告微信补投（错峰限速版）

背景：2026-09-06 微信 iLink 对账号持续限流（凌晨 PDF 连发疑似触发配额）。
策略：cron 每 15 分钟调一次，每次只投 1 份未投递的 PDF；投递成功标记 sent；
     只在 23:00-09:00 窗口工作（避开白天+免费时段配额竞争）；全部投完 stdout 空（静默）。
状态文件：~/hermes-docker-sandbox/workspace/life-workbench/cache/radar/weixin_backlog_state.json
"""
import json
import os
import subprocess
import sys
from datetime import datetime, timezone, timedelta

CST = timezone(timedelta(hours=8))
REPORTS = "/Volumes/YOURVOLUME/lab/hermes-docker-sandbox/workspace/life-workbench/reports"
STATE = "/Volumes/YOURVOLUME/lab/hermes-docker-sandbox/workspace/life-workbench/cache/radar/weixin_backlog_state.json"

# 待补投队列：2026-09-05 夜间生成的 5 份 + 2026-09-06 补跑的 5 份
QUEUE = [
    "nightly_radar_2026-09-05.pdf",
    "[已移除].pdf",
    "domain_hack_2026-09-05.pdf",
    "domain_[已移除]_2026-09-05.pdf",
    "domain_pay_2026-09-06.pdf",
    "domain_aiteam_2026-09-06.pdf",
    "domain_data_2026-09-06.pdf",
    "domain_ops_2026-09-06.pdf",
    "domain_platform_2026-09-06.pdf",
    "domain_product_2026-09-06.pdf",
]


def load_state():
    try:
        return json.load(open(STATE))
    except Exception:
        return {"sent": []}


def in_window(now):
    return now.hour >= 23 or now.hour < 9


def main():
    now = datetime.now(CST)
    state = load_state()
    pending = [f for f in QUEUE if f not in state["sent"] and os.path.exists(os.path.join(REPORTS, f))]
    if not pending:
        return  # 全部投完或无文件：静默
    if not in_window(now):
        print(f"[backlog] outside window, {len(pending)} pending")
        return
    target = pending[0]
    path = os.path.join(REPORTS, target)
    label = target.replace(".pdf", "")
    r = subprocess.run(
        ["hermes", "send", "-t", "weixin",
         f"夜间报告补投: {label}\nMEDIA:{path}"],
        capture_output=True, text=True, timeout=120,
    )
    if r.returncode == 0 and "failed" not in r.stdout.lower():
        state["sent"].append(target)
        json.dump(state, open(STATE, "w"), ensure_ascii=False, indent=1)
        print(f"[backlog] delivered {target} ({len(state['sent'])}/{len(QUEUE)})")
    else:
        print(f"[backlog] send failed for {target}: {r.stdout.strip()[:120]} {r.stderr.strip()[:120]}")
        sys.exit(1)  # 让 scheduler 知道本次失败（limit 期间静默重试下个 tick）


if __name__ == "__main__":
    main()
