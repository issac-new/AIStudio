#!/usr/bin/env python3
"""mx-narrative-skeleton.py — 按轮叙事集骨架生成器（V8.2 配套⑤，正本 §4.3 第 22 条）

用法：python3 mux/mx-narrative-skeleton.py --run <RUN_ID> > /tmp/STEPS_META_<RUN>.py

从 state.env（落键时刻）+ evidence/r18-steps.json（载荷计数）+ screenshots/steps
（帧文件清单）抽出 STEPS_META 骨架：keys/ts/imgs 预填真值，narrative 留 TODO 标记
由人工润色（禁编造叙事——按轮注册硬闸语义不变，本工具只免去手搓键名/帧名）。
生成物是草稿：必须人工审阅后才可注册进 mx-report-gen.py。
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

# SIM_ROOT 解析与 mx-lib.sh 同约：AIPAY_SIM_ROOT 覆盖优先（守门测试 fixture 隔离用），
# 缺省 NVMe 卷路径。
SIM = Path(os.environ.get('AIPAY_SIM_ROOT') or '/Volumes/nvme2230/lab/ncwk-sim-mux')

ap = argparse.ArgumentParser()
ap.add_argument('--run', required=True)
ap.add_argument('--part1', action='store_true',
                help='输出 PART1 人读导读层骨架（公文五段式）——数字实算预填，'
                     '人工语境句留【TODO】；润色后注册进 final-report-merge.py 的 PART1_BY_RUN')
a = ap.parse_args()
RUN = a.run
RUN_DIR = SIM / 'runs' / RUN
STATE = RUN_DIR / 'state.env'
if not STATE.exists():
    sys.exit(f'[skeleton] state.env 不存在：{STATE}')

state = {}
for line in STATE.read_text().splitlines():
    if '=' in line and not line.startswith('jwt_'):
        k, v = line.split('=', 1)
        state[k.strip()] = v.strip()

# §3.3 映射：步 → state 键（与正本唯一事实源一致；此处是生成草稿的只读消费）
STEP_KEYS = {
    1: ['smoke_done'], 2: ['smoke_done'], 3: ['smoke_done'], 4: ['smoke_done'],
    5: ['appinit_done'], 6: ['people_done'], 7: ['g1_frozen'], 8: ['room_analysis'],
    9: ['dispatch_marker'], 10: ['register_done'], 11: ['analysis_done', 'analysis_verified'],
    12: ['triage_done'], 13: ['anexec_done'], 14: ['review_done'], 15: ['g2_arch_pass'],
    16: ['close_done'], 17: ['plan_done'], 18: ['devimpl_done'], 19: ['defect_done', 'testpass_done'],
    20: ['ready_done', 'release_done'], 21: ['uat_done'], 22: ['workmgr_done'],
    23: ['audit_done'], 24: ['retro_done'], 25: ['ide_done'], 26: ['report_done'],
}

r18 = {}
r18f = RUN_DIR / 'evidence' / 'r18-steps.json'
if r18f.exists():
    try:
        r18 = json.loads(r18f.read_text(encoding='utf-8')).get('steps', {})
    except (json.JSONDecodeError, OSError):
        pass

shots_dir = RUN_DIR / 'evidence' / 'screenshots' / 'steps'
frames = {}
if shots_dir.exists():
    for p in sorted(shots_dir.glob('*.png')):
        m = re.match(r'(\d+)-', p.name)
        if m:
            frames.setdefault(int(m.group(1)), []).append(p.name[:-4])

n_frames_total = sum(len(v) for v in frames.values())


def part1_skeleton() -> str:
    """PART1 五段式骨架：数字一律实算（state/issues.log/帧清单），语境句【TODO】人工。
    模板槽 {{run_id}}/{{n_frames}}/{{uniq_note}}/{{ch0}} 留给 final-report-merge 实时替换。"""
    import datetime
    GATE_KEYS = {'G1': 'g1_frozen', 'G2': 'g2_arch_pass', 'G3': 'g3_code_pass',
                 'G4': 'g4_pass', 'G5': 'g5_ready', 'G6': 'retro_done'}
    # 26 步完成数（按 §3.3 步态键实抽）
    done_n = sum(1 for ks in STEP_KEYS.values() if any(state.get(k) for k in ks))
    # 六闸落键/首过（首过=issues.log 无该闸 gN- 前缀记单）
    ilog = RUN_DIR / 'evidence' / 'issues.log'
    gate_hits, cats, n_issue = {g: 0 for g in GATE_KEYS}, {}, 0
    disp_stat = {'已修': 0, '观察': 0, '延后': 0}
    if ilog.exists():
        for ln in ilog.read_text(encoding='utf-8', errors='replace').splitlines():
            p = ln.split('|')
            if len(p) >= 4 and p[0] == 'ISSUE':
                n_issue += 1
                m = re.match(r'^(g[1-6])[-_]', p[1])
                if m:
                    gate_hits['G' + m.group(1)[1]] += 1
                cats[p[1].split('-')[0]] = cats.get(p[1].split('-')[0], 0) + 1
            elif len(p) >= 4 and p[0] == 'DISP':
                # 行格式：DISP|键|who|处置：描述——处置词在第四段前缀
                dm = re.match(r'^(已修|观察|延后)', p[3].strip())
                if dm:
                    disp_stat[dm.group(1)] += 1
    gates_pass = sum(1 for g, k in GATE_KEYS.items() if state.get(k))
    first_pass = sum(1 for g, c in gate_hits.items() if c == 0 and state.get(GATE_KEYS[g]))
    # 起止窗口（state 数值型 unix 秒 实抽）
    ts = [int(v) for v in state.values() if v.isdigit() and len(v) == 10]
    win = (datetime.datetime.fromtimestamp(min(ts)).strftime('%m-%d %H:%M')
           + ' → ' + datetime.datetime.fromtimestamp(max(ts)).strftime('%m-%d %H:%M')
           + f'（约 {round((max(ts) - min(ts)) / 3600, 1)} 小时）') if ts else 'TODO（state 无落键时间）'
    feats = ', '.join(f'{k}={state[k]}' for k in ('MX_FAST', 'MX_GATE_GUARD', 'MX_DELIVERY') if state.get(k)) or '无特殊旗标'
    cat_top = '、'.join(f'{k}×{v}' for k, v in sorted(cats.items(), key=lambda x: -x[1])[:5]) or '零问题单'
    disp_sum = '，'.join(f'{k} {v}' for k, v in disp_stat.items())
    rfd = state.get('rfd_id') or 'RFD-001'
    return f'''# PART1 骨架（{RUN} 实算预填）——【TODO】=人工语境句（三问自检：判断句？带锚？人话？）
# 产物用法：润色后整段注册 final-report-merge.py 的 PART1_BY_RUN['{RUN}']；
# {{run_id}}/{{n_frames}}/{{uniq_note}}/{{ch0}} 是 merge 实时替换槽，保持原样勿手填。
<div class="guide" style="background:#fbfbfa;padding:6px 0 20px">

<h1 style="font-size:24px"> PART 1 · 一页读懂（说人话版）Swarm Studio 多智能体研发推演 · 最终报告<br><span class="sub">RUN={{{{run_id}}}} ｜ 任务：{rfd} ｜ {win}</span></h1>

<div class="card info"><b>这场推演在验证什么：</b>【TODO 一句】（特性旗标实抽：{feats}）</div>

<div class="card ok"><b>本轮的诚实结论：</b>26 步 {done_n}/26 落键；六闸 {gates_pass}/6 过，首过 {first_pass}/6（实算自 issues.log 闸键记单）；问题单 {n_issue} 项（DISP：{disp_sum}）。【TODO 两句：UAT 逐条判词汇总一句+最大的非粉饰事实一句】</div>

<div class="card warn"><b>真实发生的缺口（全部记单在案）：</b>【TODO 3-6 条，每条带问题单键】（类型分布实抽：{cat_top}）</div>

<div class="card info"><b>怎么读这份报告：</b>PART 2 是 26 步逐步档案（{{{{n_frames}}}} 张实拍界面帧 {{{{uniq_note}}}}）；每步四段=本轮实录/交付物真容+模板核对/已知问题/处置与改进；全部计数自 issues.log 与 state.env 实算，取不到显式 ⬜。</div>

<h2>研发全流程治理有效性（实算）</h2>
{{{{ch0}}}}
'''


if a.part1:
    print(part1_skeleton())
    sys.exit(0)

print(f'# STEPS_META_{RUN.upper().replace("-", "_")} 骨架（mx-narrative-skeleton.py {RUN} 生成）')
print('# keys/ts/imgs 为真值预填；narrative 一律 TODO——人工润色后方可注册（按轮硬闸语义不变）')
print(f'STEPS_META_{RUN.upper().replace("-", "_")} = {{')
for n in range(1, 27):
    keys = STEP_KEYS[n]
    ts = next((state.get(k) for k in keys if state.get(k)), '')
    imgs = frames.get(n, [])
    pay = r18.get(str(n)) or {}
    loads = []
    if pay.get('dialogs'):
        loads.append(f"对话×{len(pay['dialogs'])}")
    if pay.get('ops'):
        loads.append(f"操作×{len(pay['ops'])}")
    if pay.get('effect'):
        loads.append('效果✓')
    if pay.get('skill'):
        sk = pay['skill']
        loads.append(f"skill×{len(sk.get('gen') or []) + len(sk.get('invoke') or [])}")
    if pay.get('delivery'):
        loads.append(f"门禁灯×{len(pay['delivery'].get('frames') or [])}")
    imgs_repr = '[' + ', '.join(f"('{i}', 'TODO 图注', 'ui')" for i in imgs) + ']'
    print(f'    {n}: dict(keys={keys!r}, ts_override={ts!r},')
    print(f'            # 载荷：{("、".join(loads)) or "无"}')
    print(f'            # 三问自检：判断句？带锚？人话？')
    print(f'            narrative=\'TODO（三问过完再填：本步干成了什么+锚点 HH:MM/卡号/commit）\', imgs={imgs_repr}),')
print('}')
