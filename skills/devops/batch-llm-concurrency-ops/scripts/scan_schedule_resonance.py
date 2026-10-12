#!/usr/bin/env python3
"""扫描全部 profile 的 cron jobs.json，报告共振 (hour,minute) 槽位。

用法: python3 scan_schedule_resonance.py [--min 3]
多 profile 周期任务对齐整点会在同一分钟叠加突发 LLM 并发；对输出的每个
≥min 槽位把任务 +1~+13 分钟错开（避开既有分钟），复跑本脚本应为空。
"""
import argparse
import glob
import json
import os
import re
from collections import defaultdict


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--min', type=int, default=3, help='共振阈值（同槽位任务数）')
    args = ap.parse_args()
    by_slot = defaultdict(list)
    for p in sorted(glob.glob(os.path.expanduser('~/.hermes/profiles/*/cron/jobs.json'))):
        try:
            d = json.load(open(p, encoding='utf-8'))
        except Exception as e:
            print(f'# skip {p}: {e}')
            continue
        prof = os.path.basename(os.path.dirname(os.path.dirname(p)))
        for j in d.get('jobs', []):
            if not j.get('enabled', True):
                continue
            s = j.get('schedule', '')
            expr = s.get('expr') if isinstance(s, dict) else s  # dict 格式 schedule 勿漏
            if not isinstance(expr, str):
                continue
            f = expr.split()
            if len(f) != 5 or f[0] == '*' or f[1] == '*':
                continue
            # 只统计纯数字/逗号列表的 minute+hour；*/N 步进与范围不参与共振判定
            if not (re.fullmatch(r'[\d,]+', f[0]) and re.fullmatch(r'[\d,]+', f[1])):
                continue
            for h in f[1].split(','):
                for m in f[0].split(','):
                    if h.isdigit() and m.isdigit():
                        label = j.get('name') or j.get('id', '?')
                        by_slot[(int(h), int(m))].append(f'{prof}:{str(label)[:30]}')
    hot = {k: v for k, v in sorted(by_slot.items()) if len(v) >= args.min}
    if not hot:
        print(f'no resonance slots (>={args.min}) - clean')
        return
    for (h, m), names in hot.items():
        print(f'{h:02d}:{m:02d} x{len(names)}')
        for n in names:
            print(f'   {n}')


if __name__ == '__main__':
    main()
