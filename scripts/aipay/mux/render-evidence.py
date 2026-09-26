#!/usr/bin/env python3
# render-evidence.py — 逐步证据工件渲染：仓库文档/本地台账/matrix 消息存证/分支图 → 带溯源头的 HTML
# 输出：evidence/screenshots/_render/<id>.html（由截图套件统一转 PNG）
import json, re, subprocess, sys, urllib.request, html as H
from pathlib import Path

SIM = Path('/Volumes/nvme2230/lab/ncwk-sim-mux')
CEN = SIM / 'central/aipaydev'
OUT = SIM / 'evidence/screenshots/_render'
OUT.mkdir(parents=True, exist_ok=True)
HS = 'http://127.0.0.1:8008'
# 时间窗过滤（09-26）：只取本轮推演窗口内的消息（以 state.g1_frozen 前 30 分钟为界），
# 防旧轮次同名结论行混入导致"截图信息与步骤对不上"。
import os
_c = os.environ.get('RUN_SINCE', '')
CUTOFF = int(_c) if _c.isdigit() and _c else 0
_u = os.environ.get('RUN_UNTIL', '')
CUTOFF_HI = int(_u) if _u.isdigit() and _u else 0

CSS = '''<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:1100px;background:#f5f7fa;font-family:"PingFang SC","Helvetica Neue",sans-serif;color:#22303c;padding:18px 22px}
.hd{background:#1c3a5e;color:#fff;border-radius:10px;padding:12px 18px;margin-bottom:12px}
.hd h1{font-size:19px;margin-bottom:3px}
.hd .src{font-size:11px;opacity:.85;font-family:Menlo,monospace}
.card{background:#fff;border:1.5px solid #cfd9e4;border-radius:10px;padding:16px 20px}
.md h1{font-size:19px;color:#1c3a5e;margin:10px 0 6px;border-bottom:2px solid #2c6fb0;padding-bottom:4px}
.md h2{font-size:16px;color:#20507e;margin:12px 0 5px}
.md h3{font-size:13.5px;color:#2c6fb0;margin:9px 0 4px}
.md p,.md li{font-size:12.5px;line-height:1.75;margin:3px 0}
.md ul,.md ol{padding-left:22px}
.md code{background:#eef2f7;border:1px solid #d5dee8;border-radius:4px;padding:1px 5px;font-family:Menlo,monospace;font-size:11.5px}
.md pre{background:#233245;color:#dce8f5;border-radius:8px;padding:10px 14px;font-family:Menlo,monospace;font-size:11px;line-height:1.6;overflow:hidden;white-space:pre-wrap}
.md table{border-collapse:collapse;width:100%;margin:8px 0}
.md th,.md td{border:1px solid #c2cfdb;padding:4px 9px;font-size:11.5px;text-align:left}
.md th{background:#e8eef5}
.md blockquote{border-left:4px solid #7fb0e0;margin:6px 0;padding:2px 12px;color:#456}
.md strong{color:#12406b}
.msg{border:1px solid #d5dee8;border-radius:8px;padding:10px 14px;margin:8px 0;background:#fbfdff}
.msg .who{font-size:12px;font-weight:700;color:#1c3a5e}
.msg .meta{font-size:10px;color:#8395a7;font-family:Menlo,monospace;margin-bottom:4px}
.msg .body{font-size:12px;line-height:1.7;white-space:pre-wrap}
.tag{display:inline-block;background:#2c6fb0;color:#fff;border-radius:4px;padding:1px 8px;font-size:10.5px;margin-right:6px}
.tag.ok{background:#1a7a35}.tag.warn{background:#b45f06}
</style>'''

def md_render(text: str) -> str:
    out = []
    lines = text.splitlines()
    in_code = False
    for ln in lines:
        if ln.strip().startswith('```'):
            out.append('</pre>' if in_code else '<pre>')
            in_code = not in_code
            continue
        if in_code:
            out.append(H.escape(ln))
            continue
        h = re.match(r'^(#{1,4})\s+(.*)$', ln)
        if h:
            lv = min(len(h.group(1)), 3)
            out.append(f'<h{lv}>{inline(h.group(2))}</h{lv}>')
            continue
        if re.match(r'^\s*[-*]\s+', ln):
            out.append('<ul><li>' + inline(re.sub(r'^\s*[-*]\s+', '', ln)) + '</li></ul>')
            continue
        if re.match(r'^\s*\d+[.)]\s+', ln):
            out.append('<ol><li>' + inline(re.sub(r'^\s*\d+[.)]\s+', '', ln)) + '</li></ol>')
            continue
        if ln.strip().startswith('|'):
            out.append(f'<pre style="background:#eef3f9;color:#234">{H.escape(ln.strip())}</pre>')
            continue
        if ln.strip().startswith('>'):
            out.append('<blockquote>' + inline(ln.strip().lstrip('> ')) + '</blockquote>')
            continue
        if ln.strip() == '':
            out.append('')
        else:
            out.append('<p>' + inline(ln) + '</p>')
    if in_code:
        out.append('</pre>')
    return '\n'.join(out)

def inline(t: str) -> str:
    t = H.escape(t)
    t = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', t)
    t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
    return t

def page(ident: str, title: str, src: str, body: str, extra=''):
    (OUT / f'{ident}.html').write_text(
        f'<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8">{CSS}</head><body>'
        f'<div class="hd"><h1>{H.escape(title)}</h1><div class="src">证据来源：{H.escape(src)}</div></div>'
        f'{extra}<div class="card md">{body}</div></body></html>', encoding='utf-8')
    print('render:', ident)

def git_show(ref: str, path: str) -> str:
    r = subprocess.run(['git', '-C', str(CEN), 'show', f'{ref}:{path}'], capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else f'（取件失败 {ref}:{path}）'

def render_doc(ident, title, path, ref='origin/main', src_note=''):
    src = f'{ref}:{path}' + (f' · {src_note}' if src_note else '')
    commit = subprocess.run(['git', '-C', str(CEN), 'rev-parse', '--short', ref], capture_output=True, text=True).stdout.strip()
    body = md_render(git_show(ref, path))
    page(ident, title, f'{src} @ {commit}', body)

def render_file(ident, title, fpath, src_note=''):
    p = Path(fpath)
    text = p.read_text(encoding='utf-8', errors='replace')
    page(ident, title, f'{p}' + (f' · {src_note}' if src_note else ''), md_render(text))

def fetch_room_msgs(room, token, limit=1000):
    url = f'{HS}/_matrix/client/v3/rooms/{room}/messages?access_token={token}&dir=b&limit={limit}'
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            return json.load(r).get('chunk', [])
    except Exception as e:
        return []

def joined_rooms(token):
    try:
        with urllib.request.urlopen(f'{HS}/_matrix/client/v3/joined_rooms?access_token={token}', timeout=10) as r:
            return json.load(r).get('joined_rooms', [])
    except Exception:
        return []

def render_transcript(ident, title, room, token, matcher, src_note='', maxn=14):
    # 09-26 修正：历史结论行在早前的分析房（state 的 room_analysis 被后续重跑换新），
    # 跨全部已加入房间搜证，消息标注来源房间。
    msgs = []
    rooms = [room] + [r for r in joined_rooms(token) if r != room]
    for rid in rooms:
        for e in fetch_room_msgs(rid, token):
            c = e.get('content', {})
            body = str(c.get('body', ''))
            if e.get('type') != 'm.room.message':
                continue
            ts = e.get('origin_server_ts', 0)
            if matcher(body) and (CUTOFF == 0 or ts >= CUTOFF) and (CUTOFF_HI == 0 or ts <= CUTOFF_HI):
                msgs.append((ts, e.get('event_id', ''), e.get('sender', ''), body, rid))
    msgs.sort(key=lambda x: x[0])
    blocks = []
    import datetime
    for ts, eid, sender, body, rid in msgs[:maxn]:
        t = datetime.datetime.fromtimestamp(ts / 1000).strftime('%m-%d %H:%M:%S') if ts else '?'
        blocks.append(f'<div class="msg"><div class="who">{H.escape(sender)}</div>'
                      f'<div class="meta">event {H.escape(eid)} · {t} · room {H.escape(rid)}</div>'
                      f'<div class="body">{H.escape(body[:1400])}</div></div>')
    if not blocks:
        blocks = ['<p>（无匹配消息）</p>']
    page(ident, title, f'room {room} · matrix 真实事件转录' + (f' · {src_note}' if src_note else ''),
         ''.join(blocks), extra='<div style="margin:8px 0"><span class="tag ok">matrix 真实事件</span><span class="tag">含 event_id 可反查</span></div>')

def render_gitgraph():
    r = subprocess.run(['git', '-C', str(CEN), 'log', '--graph', '--oneline', '--decorate', '--all',
                        '--simplify-by-decoration', '-n', '40'], capture_output=True, text=True)
    page('18-gitgraph', '⑱ 开发分支与集成线（git 图谱）', 'central/aipaydev · git log --graph --decorate --all',
         f'<pre>{H.escape(r.stdout)}</pre>',
         extra='<div style="margin:8px 0"><span class="tag ok">真实 git 引用</span><span class="tag">feat/DEV-* ×4 + integration + main</span></div>')

# ── 仓库文档工件 ──
render_doc('05-app-registry', '⑤ 应用初始化 · 应用资产登记表', 'docs/admin/app-registry.md')
render_doc('06-org', '⑥ 研发人员管理 · 组织与权限矩阵', 'docs/admin/org.md')
render_doc('07-freeze', '⑦ G1 需求上锁 · 冻结文件', 'docs/requirements/RFD-001.freeze.md')
render_doc('11-tasklist', '⑪ 系统分析 · SMART 任务清单', 'docs/analysis/RFD-001-tasklist.md')
render_doc('13-an-paycore', '⑬ 四路系分 · AN-PAYCORE（csw-pay-core）', 'docs/analysis/AN-PAYCORE-analysis.md')
render_doc('13-an-chwx', '⑬ 四路系分 · AN-CHWX（微信渠道）', 'docs/analysis/AN-CHWX-analysis.md')
render_doc('13-an-chali', '⑬ 四路系分 · AN-CHALI（支付宝渠道）', 'docs/analysis/AN-CHALI-analysis.md')
render_doc('13-an-mp', '⑬ 四路系分 · AN-MP（收银台小程序）', 'docs/analysis/AN-MP-analysis.md')
render_doc('14-design', '⑭⑮ 复核定稿 · 概要设计（G2 评审对象）', 'docs/design/RFD-001-architecture-design.md')
render_doc('17-schedule', '⑰ 开发/测试排期计划', 'docs/plan/RFD-001-schedule.md')
render_doc('19-testreport', '⑲ G4 测试报告（51 例纠正版）', 'docs/test/RFD-001-test-report.md')
render_doc('20-release-notes', '⑳⑱ 发布说明（面向用户收益）', 'RELEASE.md')
render_doc('21-acceptance', '⑳ 业务验收（UAT）报告', 'docs/acceptance/RFD-001-acceptance.md')
render_doc('23-audit', '㉓ 合规审计意见书（签名线）', 'docs/retro/default-audit-opinion.md')
render_doc('24-retro', '㉔ G6 复盘与治理报告回写', 'docs/retro/default-RFD-001-retrospective.md')

# ── 本地台账 ──
render_file('22-workreport', '㉒ 研发工作台账（WIP/卡壳清点）', SIM / 'evidence/work-report.md', 'M3 工作管理')
render_file('24-gov', '㉔ 闭环治理报告（闸状态/问题单/凭证）', SIM / 'evidence/governance-report.md', 'G6 治理产物')

# ── G3 测试证据（开发分支） ──
for task, br in [('DEV-PAYCORE', 'feat/DEV-PAYCORE'), ('DEV-CHWX', 'feat/DEV-CHWX'),
                 ('DEV-CHALI', 'feat/DEV-CHALI'), ('DEV-MP', 'feat/DEV-MP')]:
    render_doc(f'18-testlog-{task.lower()}', f'⑱ G3 本地测试证据 · {task}',
               f'docs/evidence/{task}-testlog.txt', ref=f'origin/{br}', src_note='随分支提交')
render_gitgraph()

# ── matrix 消息存证 ──
tok = (SIM / 'creds/fanfan.token').read_text().splitlines()[0]
bella_tok = (SIM / 'creds/bella.token').read_text().splitlines()[0]
state = dict(l.split('=', 1) for l in (SIM / 'state.env').read_text().splitlines() if '=' in l)
room_main = state.get('room_analysis', '')
room_dm = state.get('dm_bella_fanfan', '')
render_transcript('07-req-dm', '⑦ 需求提出 · BA→PM 私信送达', room_dm, bella_tok,
                  lambda b: '需求' in b or 'RFD' in b or '收银台' in b, '步骤 7')
render_transcript('09-dispatch', '⑨ @派发指令（RACI 派发链起点）', room_main, tok,
                  lambda b: ('派发' in b and 'RFD-001' in b) or b.startswith('【'), '步骤 9')
render_transcript('11-done', '⑪ 系统分析 · ANALYSIS-DONE 凭证行', room_main, tok,
                  lambda b: 'ANALYSIS-DONE-RFD-001 commit=' in b, '步骤 11')
render_transcript('12-raci', '⑫ 分诊与 RACI 逐条派发', room_main, tok,
                  lambda b: ('@chen-agent' in b or '@hu-agent' in b or '@lin-agent' in b or '@xiao-agent' in b) and ('执行' in b or '任务' in b or 'RACI' in b), '步骤 12/13')
render_transcript('15-archgate', '⑮ G2 架构评审结论行', room_main, tok,
                  lambda b: 'ARCH-GATE' in b and ('PASS' in b or 'FAIL' in b), '步骤 15')
render_transcript('19-testpass', '⑲ 测试通过回执（TEST-PASS）', room_main, tok,
                  lambda b: 'TEST-PASS' in b or '51/51' in b or '全绿' in b, '步骤 19')
render_transcript('20-readygate', '⑳ G5 发布准出结论行（三轮）', room_main, tok,
                  lambda b: 'READY-GATE' in b and ('PASS' in b or 'FAIL' in b), '步骤 20')
render_transcript('21-uat', '㉑ UAT 业务验收逐条对账', room_main, tok,
                  lambda b: ('AC-' in b and ('验收' in b or 'UAT' in b or '证据' in b)) or 'ACCEPT' in b, '步骤 21')
render_transcript('23-audit-line', '㉓ 合规审计结论行', room_main, tok,
                  lambda b: 'AUDIT-OPINION' in b, '步骤 23')

print('ALL RENDERS DONE')
