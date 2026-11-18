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
import json
import os
import re
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

# run31 N32-2：审计器 R18 两种帧缺口 FAIL 的机器可读原文。主体、类型与正文栏位严格
# 对齐 mx-report-audit.py 的 ISSUE|frame-capture-failed|step-<n>|… 配对契约；不从
# WARN 或其他 R18 族推导凭证，避免把未达标证据洗成全过。
_R18_FRAME_MISSING_RE = re.compile(r'^R18 步 (\d+) 操作序列存在缺帧（(\d+) 处）')
_R18_FRAME_SHORT_RE = re.compile(
    r'^R18 步 (\d+) 操作序列帧数不足（.*?当前渲染 (\d+) 帧/期望 ≥(\d+)）')


def backfill_r18_frame_gap_credentials(evid, run_id, lines):
    """把上一轮审计的 R18 帧缺口 FAIL 写成可配对 ISSUE＋观察 DISP。

    返回实际追加的行；侧柜缺席、跨轮或不可读时不盲写。每步只写一条凭证，正文合并
    该步全部缺帧观测，重复重试凭既有 ISSUE 键幂等跳过。
    """
    findings_path = evid / 'report-audit-findings.json'
    if not findings_path.exists():
        return []
    try:
        findings = json.loads(findings_path.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError) as exc:
        print(f'[tri-disp] R18 帧缺口侧柜不可读——跳过自动凭证（不盲写）：{exc}')
        return []
    if not isinstance(findings, dict) or findings.get('run') != run_id:
        print('[tri-disp] R18 帧缺口侧柜轮次不一致——跳过自动凭证（不盲写）')
        return []

    observed = {}
    fails = findings.get('fails')
    for finding in fails if isinstance(fails, list) else []:
        if not isinstance(finding, str):
            continue
        missing = _R18_FRAME_MISSING_RE.match(finding)
        short = _R18_FRAME_SHORT_RE.match(finding)
        if missing:
            step = int(missing.group(1))
            detail = f'操作序列存在缺帧 {int(missing.group(2))} 处'
        elif short:
            step = int(short.group(1))
            detail = (f'操作序列帧数不足（当前渲染 {int(short.group(2))} 帧／'
                      f'期望 ≥{int(short.group(3))} 帧）')
        else:
            continue
        if not 1 <= step <= 26:
            continue
        observed.setdefault(step, [])
        if detail not in observed[step]:
            observed[step].append(detail)

    existing = {
        (parts[1], parts[2])
        for parts in (line.split('|', 3) for line in lines)
        if len(parts) >= 4 and parts[0] == 'ISSUE'
    }
    appended = []
    for step in sorted(observed):
        subject = f'step-{step}'
        if ('frame-capture-failed', subject) in existing:
            continue
        detail = '；'.join(observed[step])
        appended.append(
            f'ISSUE|frame-capture-failed|{subject}|R18 审计实测：{detail}——采集失败，'
            '真实缺口保留；按 §5.6 采集纪律⑩登记降级，复扫仅将该步 FAIL 降为 WARN，'
            '不冒充补拍或达标（run31 N32-2 自动写入）')
        appended.append(
            f'DISP|frame-capture-failed|{subject}|观察（R18 帧缺口审计自动降级：'
            '缺口与实测帧数见同键 ISSUE；采集面修复并复核后人工升桶，禁脚本自动升桶）')
    if appended:
        with open(evid / 'issues.log', 'a', encoding='utf-8') as log:
            log.write('\n'.join(appended) + '\n')
        lines.extend(appended)
        print(f'[tri-disp] R18 帧缺口凭证补记 {len(appended) // 2} 步'
              '（ISSUE＋观察 DISP；真实缺口保留，复扫降 WARN）')
    return appended


ap = argparse.ArgumentParser()
# 2026-10-13 扩展（fix/lite-closeout）：ISSUE 键完全无 DISP 行时补观察桶行——纪律 28
# 「无锚点处置一律降为观察或待处置」的机制兑现（run18 实锤：20 键零 DISP 全 FAIL；
# 已修判定须人工带锚点补记，脚本只降不升）。幂等：该键已有任一 DISP 行即跳过。

ap.add_argument('--run', required=True)
a = ap.parse_args()

SIM = Path(os.environ.get('AIPAY_SIM_ROOT') or '/Users/cuishi/lab/ncwk-sim-mux')
EVID = SIM / 'runs' / a.run / 'evidence'
ilog = EVID / 'issues.log'
lines = ilog.read_text(encoding='utf-8').splitlines() if ilog.exists() else []

# 报告审计失败后的断点重试会先回到本脚本：先消费上一轮缺口侧柜，再进入既有归桶。
# 新 ISSUE 同步带精确主体观察 DISP，后续 gov_report 刷新快照时不会新增 R5 待处置键。
backfill_r18_frame_gap_credentials(EVID, a.run, lines)
if not ilog.exists():
    sys.exit(0)  # 无台账且无有效审计侧柜=无事可做（幂等安静退出，非阻断）

# 配对取产品 DTO 快照（gov_report 落件；缺席=安静退出不盲写）
dto_path = EVID / 'governance-metrics.json'
if not dto_path.exists():
    print('[tri-disp] 治理指标快照缺席（governance-metrics.json）——配对正本未到位，本轮跳过归桶（不盲写）')
    sys.exit(0)
try:
    pairing = json.loads(dto_path.read_text(encoding='utf-8')).get('pairing') or []
except json.JSONDecodeError:
    print('[tri-disp] 治理指标快照不可读——跳过归桶（不盲写）')
    sys.exit(0)

# 幂等基底（P2 Task 2 改「末次 DISP」口径）：同键取**末次适用** DISP 行（适用优先级
# exact＞generic＞single，所选类别内取行序最后——与治理服务 run-metrics.pairing 同构）。
# 末次适用行已是三态前缀 → 跳过；末次适用行非三态（如原始人工行）→ 仍须追加（旧口径
# 「存在任一三态行即跳过」会在人工后续回写非三态行后误判已归桶）。
GENERIC_SUBJECTS = ('director', 'monitor', 'harness', '导演', '监控')
last_exact = {}    # key -> disp 文本（行序覆盖=末次）
last_exact_type = {}  # type -> (key, disp)（single 判定用：该 type 末条 exact）
last_generic = {}  # type -> disp
for l in lines:
    if not l.startswith('DISP|'):
        continue
    p = l.split('|', 3)
    if len(p) <= 3 or not p[3]:
        continue
    t, s, d = p[1], p[2], p[3]
    if s in GENERIC_SUBJECTS:
        last_generic[t] = d
    else:
        last_exact[f'{t}·{s}'] = d
        last_exact_type[t] = (f'{t}·{s}', d)
disp_seen = set()
_keys_of_type = {}
for row in pairing:
    _t = row['key'].split('·', 1)[0]
    _keys_of_type[_t] = _keys_of_type.get(_t, 0) + 1
for row in pairing:
    k = row['key']
    t = k.split('·', 1)[0]
    # 末次适用行选择（与 run-metrics.pairing 同构：exact＞generic＞single[仅同类型唯一键]）
    d = None
    if k in last_exact:
        d = last_exact[k]
    elif t in last_generic:
        d = last_generic[t]
    elif _keys_of_type.get(t, 0) == 1 and t in last_exact_type:
        d = last_exact_type[t][1]
    if d is not None and d.startswith(TRI):
        disp_seen.add(k)

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
