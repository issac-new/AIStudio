#!/usr/bin/env python3
"""tri-disp-backfill.py — DISP 三态归桶收尾件（run15 复盘 N2 / 纪律 28 / V8.17 §4.3-43）。

run15 实证：80 条 DISP 的处置文本全部缺三态分桶词前缀（已修/观察/延后），报告
第 8 章唯一键 59 中 58 个落入「表外词」桶——四桶计数失真（已修 0/观察 1/延后 0），
且生成器括注里「收尾链补记三态 DISP 行后归桶」只是一句承诺，无机制兑现。

本脚本在报告步（mx-report-gen 之前）执行：
  1) 复用生成器同款配对逻辑（type·subject 精确 → 泛指主体广播 → 单键容措辞差），
     找出「已有 DISP 但处置文本不以三态词开头」的唯一键；
  2) 对每个此类键追加一行收尾归桶 DISP：一律「观察」桶——纪律 28 明文「无锚点
     处置一律降为观察或待处置」，已修判定须人工带锚点补记，禁脚本自动升桶；
  3) 幂等：该键已存在任一三态前缀 DISP 行则跳过（重放不重复追加）。

配对口径与 mx-report-gen.issues_stats() 保持同源；两侧漂移由守门测试
tests/tri-disp-backfill.test.sh（run15 真实台账夹具）咬住。
"""
import argparse
import os
import sys
from pathlib import Path

TRI = ('已修', '观察', '延后')
GENERIC = ('director', 'monitor', 'harness', '导演', '监控')

ap = argparse.ArgumentParser()
ap.add_argument('--run', required=True)
a = ap.parse_args()

SIM = Path(os.environ.get('AIPAY_SIM_ROOT') or '/Volumes/nvme2230/lab/ncwk-sim-mux')
EVID = SIM / 'runs' / a.run / 'evidence'
ilog = EVID / 'issues.log'
if not ilog.exists():
    sys.exit(0)  # 无台账=无事可做（幂等安静退出，非阻断）

lines = ilog.read_text(encoding='utf-8').splitlines()
iss_keys, order = {}, []
for l in lines:
    if l.startswith('ISSUE|'):
        p = l.split('|', 3)
        key = f'{p[1]}·{p[2]}'
        if key not in iss_keys:
            iss_keys[key] = True
            order.append(key)

disp_exact, disp_generic = {}, {}
for l in lines:
    if l.startswith('DISP|'):
        p = l.split('|', 4)
        if len(p) > 3:
            if p[2] in GENERIC:
                disp_generic[p[1]] = p[3]
            else:
                disp_exact[(p[1], p[2])] = p[3]

types_of = {}
for k in order:
    types_of.setdefault(k.split('·')[0], []).append(k)


def disp_for(key):
    t, s = key.split('·', 1)
    if (t, s) in disp_exact:
        return disp_exact[(t, s)]
    if t in disp_generic:
        return disp_generic[t]
    if len(types_of.get(t, [])) == 1:
        for (dt, ds), dv in disp_exact.items():
            if dt == t:
                return dv
    return None


appendix = []
n_fixed = n_ok = 0
for k in order:
    d = disp_for(k)
    if d is None:
        continue
    if d.startswith(TRI):
        n_ok += 1
        continue
    t, s = k.split('·', 1)
    summary = d[:60].replace('\n', ' ')
    appendix.append(
        f'DISP|{t}|{s}|观察（收尾归桶：处置语义见同键上方原始 DISP 行——{summary}…；'
        f'如属已修复，请人工补记带锚点的已修行，禁脚本自动升桶）')
    n_fixed += 1

if appendix:
    with open(ilog, 'a', encoding='utf-8') as f:
        f.write('\n'.join(appendix) + '\n')
print(f'[tri-disp] 归桶 {n_fixed} 键（全部观察桶）；已合规 {n_ok} 键；唯一键总数 {len(order)}')
