#!/usr/bin/env python3
"""run14 台账收尾补账（复盘 A3/A9 根修，幂等可重跑）。

三件事：
1. 11 个表外词键补「归桶」DISP 行（三态首词，§4.3-28 台账卫生）；
2. 4 个悬挂 DISP（无 ISSUE 配对）补记 ISSUE 行（注明补账时点）；
3. 步 9 承载范围承诺缺降级登记 → 补 ISSUE+DISP（product-surface-degraded）。

用法：python3 run14-ledger-backfill.py [--run 20261010-v8-run14]
"""
import os
import sys
from pathlib import Path

SIM = Path(os.environ.get('AIPAY_SIM_ROOT', '/Volumes/nvme2230/lab/ncwk-sim-mux'))
RUN = '20261010-v8-run14'
for i, a in enumerate(sys.argv):
    if a == '--run' and i + 1 < len(sys.argv):
        RUN = sys.argv[i + 1]
F = SIM / 'runs' / RUN / 'evidence' / 'issues.log'
TAG = '（run14 复盘归桶/补账 2026-10-11，幂等行）'

# ── 1. 表外词归桶（三态首词 + 一句原处置概括）──
BUCKET = [
    ('test-loop-stall', 'chen/hu/fei', '已修', '20:5x 双复活令后链路恢复（chen/hu 修复启动+fei 会签批准）'),
    ('g5-breaker', 'G5', '已修', '熔断根修三件（raci 守卫 4be3a3b/证据等待 32ff696/签名全口径 13b5739）+11:41 判词过闸'),
    ('fix-not-pushed', 'chen-agent', '已修', '23:4x 推送催办令后 chen 补推 fe0c968，复测继续'),
    ('retest-conclusion-missing', 'qi-agent', '已修', '复活令+最终 xiao 移交收口完成（结论行分层回执）'),
    ('kanban-udf-missing', 'xiao-agent', '延后', '网关内嵌路径注册错位——修法已明（补丁入 mx_apply_agent_patches+注册无条件化），列 run15 前置批次'),
    ('tester-api-hang', 'qi-agent', '观察', '诊断勘误两轮（初判服务端→内核断链→终判 Turn ended 正常收场）；根治=微任务策略+watcher v3，已立'),
    ('tester-unrecoverable', 'qi-agent', '已修', '02:2x 结论行权威移交 xiao-agent，收口完成（003/005 成立/004 未修复如实分层）'),
    ('hu-fix-stall', 'hu-agent', '已修', '微任务策略后推进完成（59285aa 修复+b687182 并入 integration）'),
    ('hu-turn-end-no-reply', 'hu-agent', '已修', '微任务打法根治（一次一件短指令+MICRO-N-DONE 回执）+watcher v3 空转收场自动唤醒'),
    ('gate-breaker-reset', 'director', '观察', '记录性行——复位机制实跑证据（签名 1→1:itip:1e32d79），随报告归档无需整改'),
    ('r18-collection-missing', 'step-21', '观察', '勘误改判维持——驱动挂钩路径错过，监控侧 12:2x 手动补登记（anchor $TTRhZeXw…），补登记非实时如实'),
]

# ── 2. 悬挂 DISP 补 ISSUE 配对（补记时点注明）──
ORPHAN_ISSUE = [
    ('tester-handoff-recheck', 'xiao-agent', 'qi 档案不可恢复后的移交收口工作（02:4x 移交令 $7cchjXLfW）——补记 ISSUE 以配对既有 DISP（悬挂 DISP=台账卫生缺陷 §4.3-28）'),
    ('defbe004-fix-dispatch', 'hu-agent', 'DEF-BE-004 修复任务派发（02:4x 修复启动令 $yLF179wv，七断点清单）——补记 ISSUE 以配对既有 DISP'),
    ('defbe004-fix-status', 'hu-agent', 'DEF-BE-004 修复实况核实（09:1x：feat/t_92d41d43@59285aa 已推、卡仍 todo 因结论链断）——补记 ISSUE 以配对既有 DISP'),
    ('g5-verdict-wait', 'fanfan-agent', 'G5 终审判词等待（10:3x 判词微任务 $qkTSmUy4——解锁条件全在案等 fanfan 新会话出终判）——补记 ISSUE 以配对既有 DISP'),
]

# ── 3. 步 9 承载范围承诺降级登记 ──
STEP9 = [
    ('ISSUE', 'product-surface-degraded', 'step-9', '步 9 在 §2.5 有产品承载范围承诺但报告零 UI 实拍帧（派发锚点的房间直达链接在采集环境不可达）——按 §5.6 采集纪律⑩ 补登记降级（复盘 A9：审计 WARN 未清的漏登）'),
    ('DISP', 'product-surface-degraded', 'step-9', '观察：对话全文载荷在位（r18 dialog 步 9 必采 ✓），UI 面降级——产品实现事件锚直跳后实拍（run15 复验项）'),
]


def main():
    txt = F.read_text(encoding='utf-8')
    lines = txt.splitlines()
    appended = []

    def has(prefix, itype, subj):
        return any(l.startswith(f'{prefix}|{itype}|{subj}|') for l in lines + appended)

    for itype, subj, state, note in BUCKET:
        line = f'DISP|{itype}|{subj}|归桶：{state}——{note}{TAG}'
        if not has('DISP', itype, subj) or any(l.startswith(f'DISP|{itype}|{subj}|归桶：') for l in lines):
            if not any(l.startswith(f'DISP|{itype}|{subj}|归桶：') for l in lines + appended):
                appended.append(line)
        else:
            # 有 DISP 但表外——追加归桶行
            appended.append(line)
    for itype, subj, desc in ORPHAN_ISSUE:
        line = f'ISSUE|{itype}|{subj}|{desc}{TAG}'
        if not has('ISSUE', itype, subj):
            appended.append(line)
    for kind, itype, subj, desc in STEP9:
        line = f'{kind}|{itype}|{subj}|{desc}{TAG}'
        if not has(kind, itype, subj):
            appended.append(line)
    if appended:
        with F.open('a', encoding='utf-8') as fh:
            fh.write('\n'.join(appended) + '\n')
    print(f'补账 {len(appended)} 行：')
    for l in appended:
        print(' ', l[:110])


if __name__ == '__main__':
    main()
