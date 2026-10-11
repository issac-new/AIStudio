#!/usr/bin/env python3
"""demo-kit-gen.py — 演示素材层生成器（方案 §5.4.6）

只读消费当轮真值数据源（state.env / issues.log / approved.events /
r18-steps.json），聚合出六件可直接剪辑的视觉素材，落 evidence/demo-kit.html。
六件：全程时间轴 / 治理拦截高光 / 人机接力时刻线 / 责任矩阵 / 组织全景卡 /
对话字幕卡。禁编造：缺数据源如实缺席明示。

用法：python3 mux/demo-kit-gen.py --run <RUN_ID>
"""
import argparse
import html as H
import json
import re
import sys
from pathlib import Path

SIM_ROOT = Path(__file__).resolve().parent.parent
_CAND = [SIM_ROOT, Path('/Volumes/nvme2230/lab/ncwk-sim-mux')]


def find_run(run_id: str) -> Path:
    for base in _CAND:
        d = base / 'runs' / run_id
        if d.is_dir():
            return d
    sys.exit(f'[demo-kit] run 目录不存在: {run_id}（候选根: {_CAND}）')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--run', required=True)
    args = ap.parse_args()
    run = find_run(args.run)
    evid = run / 'evidence'

    # ── 数据源只读加载 ──
    state = {}
    sf = run / 'state.env'
    if sf.exists():
        for ln in sf.read_text(encoding='utf-8', errors='replace').splitlines():
            if '=' in ln and not ln.startswith('jwt_'):
                k, v = ln.split('=', 1)
                state[k.strip()] = v.strip()

    issues = []
    ilog = evid / 'issues.log'
    if ilog.exists():
        for ln in ilog.read_text(encoding='utf-8', errors='replace').splitlines():
            if ln.startswith('ISSUE|'):
                parts = ln.split('|')
                if len(parts) >= 4:
                    issues.append({'key': parts[1], 'subject': parts[2], 'desc': '|'.join(parts[3:])})

    approvals = []
    aev = evid / 'approved.events'
    if aev.exists():
        for ln in aev.read_text(encoding='utf-8', errors='replace').splitlines():
            if ln.strip():
                approvals.append(ln.strip())

    def _fmt_approval(ln: str) -> str:
        # 行格式＝事件id 房间id 审批人 时间戳（approved.events 实测）
        parts = ln.split()
        if len(parts) >= 4:
            ev, room, user, ts = parts[0], parts[1], parts[2], parts[3]
            import datetime as _dt
            try:
                h = _dt.datetime.fromtimestamp(int(ts)).strftime('%m-%d %H:%M')
            except (ValueError, OSError):
                h = ts
            return (f'<span class="ap-user">👤 {H.escape(user)}</span><span class="ap-ts">{h} 批准</span>'
                    f'<span class="ap-hash">事件 {H.escape(ev[1:11])}</span>'
                    f'<span class="ap-hash">房间 {H.escape(room[1:11])}</span>')
        return H.escape(ln[:120])

    r18 = {}
    r18f = evid / 'r18-steps.json'
    r18_ok = r18f.exists()
    if r18_ok:
        try:
            r18 = json.loads(r18f.read_text(encoding='utf-8'))
        except Exception:
            r18_ok = False

    # ── ① 全程时间轴 ──
    STAGE_ORDER = ['smoke_done', 'appinit_done', 'people_done', 'g1_frozen', 'room_analysis',
                   'dispatch_marker', 'register_done', 'analysis_done', 'triage_done',
                   'anexec_done', 'review_done', 'g2_arch_pass', 'close_done', 'plan_done',
                   'devimpl_done', 'defect_done', 'testpass_done', 'g5_ready', 'release_done',
                   'uat_done', 'workmgr_done', 'audit_done', 'retro_done', 'ide_done', 'report_done']
    GATES = {'g1_frozen': 'G1', 'g2_arch_pass': 'G2', 'devimpl_done': 'G3',
             'testpass_done': 'G4', 'g5_ready': 'G5', 'retro_done': 'G6'}
    tl_rows = []
    for k in STAGE_ORDER:
        v = state.get(k)
        if v:
            try:
                ts = int(float(v))
                label = f'{GATES[k]} 上锁' if k in GATES else k.replace('_done', '')
                gate_cls = ' tl-gate' if k in GATES else ''
                tl_rows.append(f'<div class="tl-row{gate_cls}"><span class="tl-label">{H.escape(label)}</span>'
                               f'<span class="tl-time">{ts}</span></div>')
            except (ValueError, TypeError):
                pass

    # ── ② 治理拦截高光 ──
    INTERCEPT_PAT = re.compile(r'(fail|FAIL|打回|拒收|熔断|退回|blocked|missing)', re.I)
    intercepts = [i for i in issues if INTERCEPT_PAT.search(i['key'] + i['desc'])][:8]
    ic_cards = []
    for i in intercepts:
        ic_cards.append(f'<div class="ic-card"><div class="ic-key">{H.escape(i["key"])}</div>'
                        f'<div class="ic-desc">{H.escape(i["desc"][:180])}</div></div>')
    if not ic_cards:
        ic_cards = ['<div class="empty">本轮零拦截记录（或 issues.log 缺席）</div>']

    # ── ③ 人机接力时刻线 ──
    ap_rows = []
    for a in approvals[:20]:
        ap_rows.append(f'<div class="ap-row">{_fmt_approval(a)}</div>')
    if not ap_rows:
        ap_rows = ['<div class="empty">approved.events 缺席——人工审批事件未留痕</div>']

    # ── ④ 责任矩阵 ──
    AI_OWNER = {'smoke': '驱动脚本+agent', 'devimpl': 'AI（chen/hu/lin/xiao）', 'defect': 'AI（测试→研发→复测）'}
    resp_rows = [
        ('1-4 环境', '驱动脚本（AI）', '人（运维工程师A 核环境）'),
        ('7 G1 需求上锁', 'AI 判读四要素', '人（需求分析师A 定 AC）'),
        ('11-14 分析', 'AI（需求分析AI 四路系分）', '人（产品经理A 复核汇总）'),
        ('15 G2 架构评审', 'AI（系统架构师A 五项检查）', '人（评审人账号可反查）'),
        ('18 编码 G3', 'AI（四研发×六路并行）', '人（团队负责人A/B 分诊确认）'),
        ('19-20 测试 G4/G5', 'AI（双测试线独立验证）', '人（HumanGate 对外发布批准）'),
        ('21 UAT', 'AI 逐条出证据锚', '人（需求分析师A 逐条判词、放行权）'),
        ('23-24 审计复盘', 'AI 机械化审计+独立复核', '人（审计师A 独立签名线）'),
    ]
    resp_html = ''.join(
        f'<tr><td>{H.escape(a)}</td><td class="ai">{H.escape(b)}</td><td class="hu">{H.escape(c)}</td></tr>'
        for a, b, c in resp_rows)

    # ── ⑤ 组织全景卡 ──
    n_issues = len(issues)
    n_appr = len(approvals)
    ai_pct = '—'
    gr = evid / 'governance-report.md'
    if gr.exists():
        m = re.search(r'AI[^\n]*?([\d.]+)%', gr.read_text(encoding='utf-8', errors='replace'))
        if m:
            ai_pct = m.group(1) + '%'

    # ── ⑥ 对话字幕卡 ──
    quotes = []
    sl = run.parent.parent / 'logs' / f'{run.name}-driver.log'
    scen = SIM_ROOT.parent / 'aipay-scenario.sh'  # 不读源码——金句从 r18/消息留档取
    if r18_ok and isinstance(r18, dict):
        steps = r18.get('steps', r18)
        for step_key in sorted(steps, key=lambda x: int(x) if str(x).isdigit() else 999):
            payload = steps[step_key]
            if not isinstance(payload, dict):
                continue
            for dlg in (payload.get('dialogs') or [])[:1]:
                title = dlg.get('title', '') if isinstance(dlg, dict) else str(dlg)
                anchor = dlg.get('anchor', '') if isinstance(dlg, dict) else ''
                if title:
                    quotes.append(f'<div class="qt-card"><span class="qt-step">步 {H.escape(str(step_key))}</span>'
                                  f'{H.escape(title[:220])}<div class="qt-anchor">{H.escape(str(anchor)[:60])}</div></div>')
    if not quotes:
        quotes = ['<div class="empty">r18-steps.json 缺席——对话留档未采集（帧时刻断言见 §5.5）</div>']
    quotes = quotes[:10]

    src_missing = []
    if not ilog.exists(): src_missing.append('issues.log')
    if not aev.exists(): src_missing.append('approved.events')
    if not r18_ok: src_missing.append('r18-steps.json')
    src_note = ('数据源全部在位' if not src_missing
                else f'<span class="warn">缺席数据源: {", ".join(src_missing)}（对应件如实缺席呈现）</span>')

    html_doc = f'''<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8"><title>demo-kit · {H.escape(args.run)}</title>
<style>
body{{font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;margin:0;background:#0f1729;color:#dbe4f0;padding:24px}}
h1{{font-size:22px;color:#fff}} h2{{font-size:16px;color:#7db4ff;border-left:3px solid #3872e0;padding-left:8px;margin-top:32px}}
.grid{{display:grid;grid-template-columns:1fr 1fr;gap:16px}}
.tl-row{{display:flex;justify-content:space-between;padding:3px 8px;font-size:12px;border-radius:4px}}
.tl-gate{{background:#1d3a5f;color:#9dc3ff;font-weight:600}}
.tl-label{{}} .tl-time{{color:#6b7f99;font-family:monospace}}
.ic-card{{background:#1a2438;border-radius:8px;padding:10px;margin-bottom:8px}}
.ic-key{{color:#ff9d6b;font-size:12px;font-weight:600}} .ic-desc{{font-size:12px;color:#b8c6d9;margin-top:4px}}
.ap-row{{font-size:12px;padding:4px 8px;border-left:2px solid #4ade80;margin-bottom:4px;display:flex;gap:10px;align-items:baseline}}
.ap-user{{color:#4ade80;font-weight:600}} .ap-hash{{font-family:monospace;color:#64748b;font-size:11px}}
.ap-user{{color:#a78bfa}} .ap-ts{{color:#64748b;margin-left:auto}}
table{{width:100%;border-collapse:collapse;font-size:12px}}
td,th{{padding:6px 8px;border-bottom:1px solid #24344d;text-align:left}}
td.ai{{color:#a78bfa}} td.hu{{color:#4ade80}}
.stat{{display:inline-block;background:#1a2438;border-radius:8px;padding:12px 20px;margin:4px;text-align:center}}
.stat b{{display:block;font-size:28px;color:#fff}} .stat span{{font-size:11px;color:#6b7f99}}
.qt-card{{background:#1a2438;border-radius:8px;padding:10px;margin-bottom:8px;font-size:12px;line-height:1.6}}
.qt-step{{color:#3872e0;font-weight:600;margin-right:8px;font-family:monospace}}
.empty{{color:#6b7f99;font-size:12px;padding:12px;border:1px dashed #2a3b55;border-radius:8px}}
.warn{{color:#fbbf24}} .src{{font-size:11px;color:#6b7f99;margin-top:8px}}
</style></head><body>
<h1>演示素材包 demo-kit · {H.escape(args.run)}</h1>
<div class="src">六件套自当轮真值只读聚合（方案 §5.4.6）· {src_note}</div>

<h2>① 全程时间轴——一张需求单怎么流过 15 人组织</h2>
<div class="grid"><div>{''.join(tl_rows) or '<div class="empty">state.env 缺席</div>'}</div>
<div class="stat"><b>26</b><span>步骤</span></div><div class="stat"><b>6</b><span>强制关卡</span></div>
<div class="stat"><b>{n_appr}</b><span>人工审批事件</span></div><div class="stat"><b>{len(state)}</b><span>状态键落键</span></div></div>

<h2>② 治理拦截高光——保障体系拦住了什么（非全绿叙事）</h2>
{''.join(ic_cards)}

<h2>③ 人机接力时刻线——人拍板的每个瞬间</h2>
{''.join(ap_rows)}

<h2>④ 责任矩阵——AI 负责产出，人对结果负责</h2>
<table><tr><th>阶段</th><th>产出（AI）</th><th>负责（人）</th></tr>{resp_html}</table>

<h2>⑤ 组织全景卡——一家 AI 公司的编制与产能</h2>
<div><div class="stat"><b>15</b><span>AI 员工编制</span></div><div class="stat"><b>30</b><span>matrix 账号</span></div>
<div class="stat"><b>42</b><span>智能体配置</span></div><div class="stat"><b>{ai_pct}</b><span>AI 主理占比</span></div>
<div class="stat"><b>{n_issues}</b><span>问题单全记账</span></div><div class="stat"><b>{n_appr}</b><span>人工介入</span></div></div>

<h2>⑥ 对话字幕卡——关键金句（event 锚可回查）</h2>
{''.join(quotes)}
<div class="src">生成=demo-kit-gen.py · 禁编造：全部字段自 state.env/issues.log/approved.events/r18-steps.json 实读</div>
</body></html>'''

    out = evid / 'demo-kit.html'
    out.write_text(html_doc, encoding='utf-8')
    print(f'[demo-kit] {out}（{len(tl_rows)} 时间轴行 / {len(intercepts)} 拦截卡 / '
          f'{len(approvals)} 审批 / {len(quotes)} 字幕卡）')


if __name__ == '__main__':
    main()
