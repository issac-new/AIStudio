#!/usr/bin/env python3
"""product-outcome-summary.py — §5.4 产品成效三件之②③实算 + ①执行输出件（run14 起）

run13 复盘 B6 根修：方案 §5.4「产品成效呈现（run13 起）」承诺「数据源=evidence/
product-outcome/quality-summary.env，驱动于步 26 落盘」在 run13 未接线（全空）。
本脚本由驱动在报告段（mx-report-gen 之前）调用，落三件：

  quality-summary.env   ② 质量成效数字表——AC 判词分布/UAT 三态/testlog 用例计数/
                          缺陷统计，全部实算（中央仓 origin/main+integration 实读）
  idempotency.txt ① 幂等执行输出——优先仓内 node_modules 在位时 vitest 就地重放；
                          否则摘录 feat 分支 testlog 的幂等用例实跑输出原文（provenance
                          随行标注，均为本轮真实执行输出，禁手抄编造）
  （下单流程帧=①的 UI 部分：仓内无可服务 UI 面时记 product-outcome-missing 单，
    按 §5.6 采集纪律⑩ 降级——帧项由 r18_matrix.product_outcome_status 判定）

用法：product-outcome-summary.py --run <RUN_ID> [--rfd RFD-001]
"""
import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

SIM = Path(os.environ.get('AIPAY_SIM_ROOT', '/Volumes/nvme2230/lab/ncwk-sim-mux'))


def git(repo, *args, timeout=15):
    try:
        return subprocess.run(['git', '-C', str(repo), *args],
                              capture_output=True, text=True, timeout=timeout).stdout
    except Exception:
        return ''


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--run', required=True)
    ap.add_argument('--rfd', default=os.environ.get('RFD_ID', 'RFD-001'))
    a = ap.parse_args()

    run_dir = SIM / 'runs' / a.run
    evid = run_dir / 'evidence'
    po = evid / 'product-outcome'
    po.mkdir(parents=True, exist_ok=True)
    repo = SIM / 'central' / 'aipaydev'
    issues = (evid / 'issues.log')
    issues_txt = issues.read_text(encoding='utf-8', errors='replace') if issues.exists() else ''

    def issue_once(itype, subject, desc):
        f = evid / 'issues.log'
        line = f'ISSUE|{itype}|{subject}|{desc}'
        if line not in issues_txt and not any(
                l.startswith(f'ISSUE|{itype}|{subject}|') for l in issues_txt.splitlines()):
            with f.open('a', encoding='utf-8') as fh:
                fh.write(line + '\n')

    # ── ② quality-summary.env：数字全部实算 ──
    acc = git(repo, 'show', f'origin/main:docs/acceptance/{a.rfd}-acceptance.md')
    ac_dist = {'通过': 0, '有条件通过': 0, '不通过': 0}
    if acc:
        for ln in acc.splitlines():
            # 判词须锚定「判词：」后首词（run13 复盘实测：行内含三态说明文字，
            # 模糊包含会把「不通过」行计成「通过」）
            m = re.search(r'AC-\d+.*判词[：:]\s*(通过|有条件通过|不通过|部分通过|待验收)', ln)
            if not m:
                continue
            v = m.group(1)
            key = v if v in ac_dist else '有条件通过'  # 部分通过/待验收 归有条件档
            ac_dist[key] += 1
    ac_total = sum(ac_dist.values())

    # testlog 用例计数：integration 分支 docs/evidence/*-testlog.txt 的 passed 汇总行
    itip = git(repo, 'show', f'origin/integration/{a.rfd}:.git/HEAD')  # probe（通常失败，无妨）
    logs = []
    for br in (f'origin/integration/{a.rfd}', 'origin/main'):
        out = git(repo, 'ls-tree', '-r', '--name-only', br, 'docs/evidence/')
        if out:
            logs = [(br, p) for p in out.splitlines() if p.endswith('-testlog.txt')]
            if logs:
                break
    ut_total = ut_green = 0
    for br, p in logs:
        txt = git(repo, 'show', f'{br}:{p}')
        for m in re.finditer(r'(?:Tests?\s*)?(\d+)\s*(?:passed|✓)', txt):
            ut_total += int(m.group(1))
            ut_green += int(m.group(1))
        m2 = re.findall(r'(\d+)\s*failed', txt)
        if m2:
            ut_total += sum(int(x) for x in m2)
    # 缺陷统计：issues.log 缺陷族
    defects = len(re.findall(r'^ISSUE\|defect', issues_txt, re.M))
    defects_fixed = len(re.findall(r'^DISP\|defect[^\n]*?已修', issues_txt, re.M))
    integration_tip = git(repo, 'rev-parse', '--short', f'origin/integration/{a.rfd}').strip()
    main_tip = git(repo, 'rev-parse', '--short', 'origin/main').strip()

    # 键名对齐 mx-report-gen.py 第 4 章 _PO_LABELS（n_tests/n_pass/ac_cover/uat_*/defects_*/
    # doc_chain/branches）——报告侧零改键直渲染；其余锚点键随行不进表。
    env_lines = [
        f'# 产品成效质量摘要（{a.run}，实算自中央仓 origin/main@{main_tip}'
        + (f' + integration@{integration_tip}' if integration_tip else '') + '）',
        f'n_tests={ut_total}',
        f'n_pass={ut_green}',
        'ac_cover=⬜（AC↔用例映射未结构化，判词分布如下）',
        f'uat_pass={ac_dist["通过"]}',
        f'uat_cond={ac_dist["有条件通过"]}',
        f'uat_fail={ac_dist["不通过"]}',
        f'defects_total={defects}',
        f'defects_fixed={defects_fixed}',
        'doc_chain=见报告交付物全景矩阵（§2.7 全链实查）',
        'branches=见分支落地时间线（步 18）',
        f'ac_total={ac_total}',
        f'integration_tip={integration_tip}',
        f'main_tip={main_tip}',
    ]
    (po / 'quality-summary.env').write_text('\n'.join(env_lines) + '\n', encoding='utf-8')

    # ── ① 幂等执行输出：vitest 就地重放优先，testlog 摘录兜底 ──
    out_files = []
    if (repo / 'node_modules').exists():
        r = subprocess.run(['npx', 'vitest', 'run', 'apps/csw-pay-core', '-t', '幂等',
                            '--reporter=basic'],
                           cwd=str(repo), capture_output=True, text=True, timeout=420)
        if r.returncode in (0, 1) and ('passed' in (r.stdout + r.stderr)):
            (po / 'idempotency.txt').write_text(
                '# 幂等执行输出（provenance=报告段 vitest 就地重放，integration 工作树）\n'
                + r.stdout + r.stderr, encoding='utf-8')
            out_files.append('idempotency.txt')
    if not out_files:
        excerpt = []
        for br, p in logs:
            txt = git(repo, 'show', f'{br}:{p}')
            if not txt:
                continue
            hit = False
            for ln in txt.splitlines():
                if re.search(r'幂等|idempot', ln, re.I):
                    hit = True
                if hit:
                    excerpt.append(ln)
                    if len(excerpt) > 160:
                        break
            if len(excerpt) > 160:
                break
        if excerpt:
            (po / 'idempotency.txt').write_text(
                '# 幂等执行输出（provenance=feat 分支 testlog 实跑摘录——本轮 G3/G4 随分支提交的'
                '真实执行输出原文；报告段未重放原因=导演 clone 无 node_modules）\n' +
                '\n'.join(excerpt[:160]), encoding='utf-8')
            out_files.append('idempotency.txt')
    if not out_files:
        issue_once('product-outcome-missing', 'step26',
                   '幂等执行输出件缺席（仓内 testlog 亦无幂等用例实跑输出可摘）——§5.4 ①件缺口')
        print('[product-outcome] 幂等执行输出缺席（已记单）')

    # ── ① UI 帧：无可服务 UI 面即记单降级（§5.6 采集纪律⑩） ──
    ui_probe = []
    for pat in ('*.html', '*/index.html', '*/demo/*.html'):
        try:
            ui_probe += [p for p in repo.rglob(pat) if 'node_modules' not in str(p)]
        except Exception:
            pass
    if not ui_probe:
        issue_once('product-outcome-missing', 'step26-frames',
                   '下单流程前后帧缺席：交付物为逻辑层 SDK（csw-cashier-mp 无浏览器 UI 面），'
                   '按 §5.6 采集纪律⑩ 记单降级——待产品提供可走查 UI 后实拍')
        print('[product-outcome] UI 帧缺席（逻辑层 SDK，已记单降级）')

    print(f'[product-outcome] quality-summary.env 已落盘（AC {ac_total} 条 '
          f'{ac_dist["通过"]}/{ac_dist["有条件通过"]}/{ac_dist["不通过"]}，用例计数 {ut_green}/{ut_total}）；'
          f'幂等输出件={len(out_files)}')


if __name__ == '__main__':
    main()
