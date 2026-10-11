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

    # AC↔用例映射实算（run15 前置 P2-4，方案 §5.4 ac_cover 从 ⬜ 变实测）：
    # 两源提取测试文件的 AC 锚——①文件名 acN 模式（t05-ac6-*.spec.ts / ac4-*.test.ts）
    # ②文件头 40 行内「AC-N」或「验收 N」注释（集成 spec 头注释形态）。
    # AC 全集=freeze 文档 AC-\d（正本）；未覆盖 AC 如实列出（映射缺口可见）。
    freeze = git(repo, 'show', f'origin/main:docs/requirements/{a.rfd}.freeze.md')
    ac_ids = sorted({int(n) for n in re.findall(r'AC-(\d+)', freeze or '')},
                    key=int) if freeze else []
    ac_files = {n: [] for n in ac_ids}
    tfiles = git(repo, 'ls-tree', '-r', '--name-only',
                 f'origin/integration/{a.rfd}', 'apps/').splitlines()
    for p in tfiles:
        # MP 自研断言脚本（verify-*.js / qa-*.js）无 .test 后缀，一并纳入（AC-7 面）
        if not (re.search(r'/test/.*\.(spec|test)\.(ts|js)$', p)
                or re.search(r'/test/(?:verify|qa)-[A-Za-z0-9-]+\.js$', p)):
            continue
        hit = set()
        for n in re.finditer(r'(?<![A-Za-z0-9])ac(\d+)(?!\d)', p, re.I):
            hit.add(int(n.group(1)))
        head = git(repo, 'show', f'origin/integration/{a.rfd}:{p}').splitlines()[:40]
        for h in head:
            for m in re.finditer(r'AC-(\d+)|验收\s*(\d+)', h):
                hit.add(int(m.group(1) or m.group(2)))
        for n in hit & set(ac_ids):
            ac_files[n].append(p.split('/')[-1])
    ac_cov = sum(1 for v in ac_files.values() if v)
    if ac_ids:
        ac_cover_val = f'{ac_cov}/{len(ac_ids)}（映射明细见 product-outcome/ac-mapping.md）'
        md = ['# AC↔用例映射（实算，run15 前置 P2-4）', '',
              f'数据源=origin/integration/{a.rfd} 测试文件（文件名 acN + 头注释 AC-N/验收 N 两源提取）；',
              f'AC 全集=freeze 文档（{len(ac_ids)} 条）。', '',
              '| AC | 命中用例文件数 | 文件 |', '|---|---|---|']
        for n in ac_ids:
            fs = ac_files[n]
            md.append(f'| AC-{n} | {len(fs)} | {", ".join(fs) if fs else "（无对应用例——映射缺口）"} |')
        (po / 'ac-mapping.md').write_text('\n'.join(md) + '\n', encoding='utf-8')
    else:
        ac_cover_val = '⬜（freeze 文档不可读，AC 全集缺失）'

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
    # 缺陷统计：
    # ① 总数主源=中央仓测试报告缺陷清单行（| DEF-X | 表行实读，结构化真值）；
    # ② issues.log 的 ^ISSUE|defect 前缀兜底（defect-cards-assignee 类字段流转单不是
    #    缺陷本体——旧正则 ^DISP|defect 把它的"已修"误计成 defects_fixed=1）；
    # ③ 已修数=测试报告状态列（已修/VERIFIED/已验证），状态定格在报告落库时点，
    #    修复链闭合的终局证据以 integration tip 复验判词为准（见 defects_note）。
    treport = git(repo, 'show', f'origin/integration/{a.rfd}:docs/test/{a.rfd}-test-report.md') \
        or git(repo, 'show', f'origin/main:docs/test/{a.rfd}-test-report.md')
    defect_lines = [ln for ln in (treport.splitlines() if treport else [])
                    if re.match(r'^\|\s*DEF-[A-Za-z0-9-]+\s*\|', ln)]
    defects = len(defect_lines) or len(re.findall(r'^ISSUE\|defect-[a-z-]+\|', issues_txt, re.M))
    defects_fixed = sum(1 for ln in defect_lines if re.search(r'已修|VERIFIED|已验证', ln))
    integration_tip = git(repo, 'rev-parse', '--short', f'origin/integration/{a.rfd}').strip()
    main_tip = git(repo, 'rev-parse', '--short', 'origin/main').strip()

    # 键名对齐 mx-report-gen.py 第 4 章 _PO_LABELS（n_tests/n_pass/ac_cover/uat_*/defects_*/
    # doc_chain/branches）——报告侧零改键直渲染；其余锚点键随行不进表。
    env_lines = [
        f'# 产品成效质量摘要（{a.run}，实算自中央仓 origin/main@{main_tip}'
        + (f' + integration@{integration_tip}' if integration_tip else '') + '）',
        '# 口径：n_tests/n_pass 扫 integration 分支 docs/evidence/*-testlog.txt 输出行累计'
        '（含修复过程历史输出，非仅终态；n_fail=差值即历史失败快照计入）；'
        '缺陷计数主源=测试报告缺陷清单表行，defects_fixed=其状态列（定格在报告落库时点）',
        f'n_tests={ut_total}',
        f'n_pass={ut_green}',
        f'n_fail={ut_total - ut_green}',
        'ac_cover=' + ac_cover_val,
        f'uat_pass={ac_dist["通过"]}',
        f'uat_cond={ac_dist["有条件通过"]}',
        f'uat_fail={ac_dist["不通过"]}',
        f'defects_total={defects}',
        f'defects_fixed={defects_fixed}',
        'defects_note=状态列定格在测试报告落库时点（拆派态）；修复终局以 integration tip '
        '复验判词为准（TEST-INT testlog 全绿即修复链闭合）——两时点真值并存，禁只看其一',
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
