#!/usr/bin/env python3
"""test_fleet_burst_match.py — 类别 8 舰队级爆发速率分类器回测（fixture 全合成，无真实目标）。

5 组预期判定，锚定 SOCRadar CyberXero 实测（gap-20261102-005）：
  B1 32 事件 / 20 主机 / 61s   → swarm-burst（镜像实测密度 32 WebShell/61s）
  B2 6 管理号 / 6 主机 / 40s    → swarm-burst（rogue_admin_created 低配爆发）
  B3 8 事件 / 3 主机 / 3600s    → below-threshold（慢速人工战役，无密集窗口）
  B4 4 事件 / 4 主机 / 60s      → insufficient（样本 <N 不判，防小样本误报）
  B5 12 事件 / 2 主机 / 30s     → human_like_single_host（单机批量操作豁免）
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fleet_burst_match import classify  # noqa: E402

T0 = 1795000000.0


def ev(dt, host, etype="webshell_upload"):
    return {"ts": T0 + dt, "host": host, "event_type": etype}


def run():
    cases = []

    # B1: CyberXero 密度镜像 —— 32 事件跨 20 主机压进 61s
    events = [ev(i * 1.9, f"wp-host-{i % 20:02d}.example.com") for i in range(32)]
    cases.append(("B1", events, "swarm-burst"))

    # B2: 6 个 rogue_admin_created 跨 6 主机 40s（429 后台确认后的低配落地波）
    events = [ev(i * 7, f"shop-{i}.example.com", "rogue_admin_created") for i in range(6)]
    cases.append(("B2", events, "swarm-burst"))

    # B3: 慢速人工战役 —— 8 事件跨 3 主机摊在 1 小时
    events = [ev(i * 450, f"host-{i % 3}.example.com") for i in range(8)]
    cases.append(("B3", events, "below-threshold"))

    # B4: 样本不足 —— 4 事件跨 4 主机 60s 内（<min_hosts=5，小样本不判防误报）
    events = [ev(i * 15, f"h{i}.example.com") for i in range(4)]
    cases.append(("B4", events, "insufficient"))

    # B5: 单主机豁免 —— 12 事件全落 2 主机 30s（单管理员批量操作）
    events = [ev(i * 2.5, f"one-box-{i % 2}.example.com") for i in range(12)]
    cases.append(("B5", events, "human_like_single_host"))

    passed = 0
    for name, events, expect in cases:
        verdict, detail = classify(events)
        ok = verdict == expect
        passed += ok
        print(f"{'PASS' if ok else 'FAIL'} {name}: expect={expect} got={verdict} "
              f"(hosts={detail.get('total_hosts')}, best_window={detail.get('best_window_hosts')})")
    print(f"{passed}/{len(cases)} PASS" if passed == len(cases) else f"{passed}/{len(cases)} PASS — FAILED")
    return 0 if passed == len(cases) else 1


if __name__ == "__main__":
    sys.exit(run())
