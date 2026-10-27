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

配对口径单一正本（融合批三起）=治理服务 run-metrics.pairing（经 gov_report 落
的 evidence/governance-metrics.json 快照取件——本脚本不再本地复算配对）；
写桶策略保留原纪律：一律降不升（观察/结构性延后），已修须人工带锚点补记。
快照缺席=幂等安静退出（报告步前 gov_report 未跑过/服务不可达——不盲写）。
"""
import argparse
import os
import sys
from pathlib import Path

TRI = ('已修', '观察', '延后')
GENERIC = ('director', 'monitor', 'harness', '导演', '监控')

# run18 复盘 F10 根治：结构性缺陷类型禁自动归「观察」——自动归桶把闸键合规类/
# 审计发现类与琐碎观察同桶，retro 的「待处置」信号被抹平（run18 实锤：31/32 全
# 自动观察桶，F1-F4 级问题无差别降级）。此类键归「延后」桶并显式要求下轮前置
# 人工处置（延后=三态合法词，语义=明确挂起待办，与「观察=无需动作」区分）。
STRUCTURAL_TYPES = frozenset({
    'g3-local-gate-missing', 'test-report-missing', 'gate-evidence-blocked',
    'gate-bypass-blocked', 'gate-breaker-tripped', 'g5-review-record-missing',
    'audit-finding', 'uat-push', 'qgate-evidence', 'qgate-stale',
    'conclusion-gap', 'merge-conflict', 'acp-backend-delegate-log-missing',
    'g5-ready-fail', 'g2-design-review-fail',
})

ap = argparse.ArgumentParser()
# 2026-10-13 扩展（fix/lite-closeout）：ISSUE 键完全无 DISP 行时补观察桶行——纪律 28
# 「无锚点处置一律降为观察或待处置」的机制兑现（run18 实锤：20 键零 DISP 全 FAIL；
# 已修判定须人工带锚点补记，脚本只降不升）。幂等：该键已有任一 DISP 行即跳过。

ap.add_argument('--run', required=True)
a = ap.parse_args()

SIM = Path(os.environ.get('AIPAY_SIM_ROOT') or '/Users/cuishi/lab/ncwk-sim-mux')
EVID = SIM / 'runs' / a.run / 'evidence'
ilog = EVID / 'issues.log'
if not ilog.exists():
    sys.exit(0)  # 无台账=无事可做（幂等安静退出，非阻断）

lines = ilog.read_text(encoding='utf-8').splitlines()

# 配对取产品 DTO 快照（gov_report 落件；缺席=安静退出不盲写）
dto_path = EVID / 'governance-metrics.json'
if not dto_path.exists():
    print('[tri-disp] 治理指标快照缺席（governance-metrics.json）——配对正本未到位，本轮跳过归桶（不盲写）')
    sys.exit(0)
import json
try:
    pairing = json.loads(dto_path.read_text(encoding='utf-8')).get('pairing') or []
except json.JSONDecodeError:
    print('[tri-disp] 治理指标快照不可读——跳过归桶（不盲写）')
    sys.exit(0)

# 幂等基底：同键已有任一三态前缀 DISP 行则跳过（重放不重复追加）
disp_seen = set()
for l in lines:
    if l.startswith('DISP|'):
        p = l.split('|', 3)
        if len(p) > 3 and p[3].startswith(TRI):
            disp_seen.add(f'{p[1]}·{p[2]}')

appendix = []
n_fixed = n_ok = 0
n_created = 0
for row in pairing:
    k = row['key']
    d = row.get('disposition')
    mode = row.get('mode')
    if d is None or mode == 'none':
        t, s = k.split('·', 1)
        if k in disp_seen:
            n_ok += 1
            continue
        if t in STRUCTURAL_TYPES:
            appendix.append(
                f'DISP|{t}|{s}|延后（结构性缺陷类别禁自动观察归桶——须下轮开跑前人工处置并带锚点回写，纪律 28/46）')
        else:
            appendix.append(
                f'DISP|{t}|{s}|观察（收尾链自动归桶：无人工处置在案——待人工复核升桶，纪律 28）')
        n_created += 1
        continue
    if d.startswith(TRI):
        n_ok += 1
        continue
    if k in disp_seen:
        # 快照是静态件：首轮已补的三态归桶行以当前台账为准跳过（幂等不依赖快照新鲜度）
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
print(f'[tri-disp] 归桶 {n_fixed} 键（全部观察桶）；补建 {n_created} 键（无 DISP 行→观察桶）；已合规 {n_ok} 键；唯一键总数 {len(pairing)}')
