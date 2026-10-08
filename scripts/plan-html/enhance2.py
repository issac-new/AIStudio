#!/usr/bin/env python3
"""公文增强二段：①26 步主链卡片化（①-④ 四段结构化）②mermaid 图形渲染（本地引擎）。
只动渲染产物，不碰正本；幂等：标记在位即跳过对应项。"""
import os
import re
import shutil
import sys
from pathlib import Path

VIEW = Path(os.environ.get('PLAN_VIEW_DIR', '/tmp/plan-view'))
F = VIEW / 'mux-v8-plan.html'
s = F.read_text(encoding='utf-8')

# ── ① 26 步卡片化 ──
if 'class="step-card"' not in s:
    GATE_MAP = {7: 'G1', 15: 'G2', 18: 'G3', 19: 'G4', 20: 'G5', 24: 'G6'}
    SEG_LABELS = [('这步做什么', '① 这步做什么'), ('交付物及质量判据', '② 交付物及质量判据'),
                  ('已知问题', '③ 已知问题'), ('改进项', '④ 改进项')]

    def build_card(m):
        num, title, body = int(m.group(1)), m.group(2).strip(), m.group(3)
        # 内部按四段 <strong> 标记切分
        parts = re.split(r'<strong>(这步做什么|交付物及质量判据|已知问题|改进项)</strong>', body)
        segs_html = []
        # parts: [前置残留, label, content, label, content, ...]
        for i in range(1, len(parts) - 1, 2):
            label, content = parts[i], parts[i + 1]
            disp = next((d for k, d in SEG_LABELS if k == label), label)
            content = content.lstrip('：: \n').strip()
            segs_html.append(
                f'<div class="step-sec"><div class="step-sec-hd">{disp}</div>'
                f'<p>{content}</p></div>')
        gate = GATE_MAP.get(num)
        gate_chip = f'<span class="gate-chip">硬闸 {gate}</span>' if gate else ''
        return (f'<div class="step-card" data-step="{num}"{" data-gate=" + gate if gate else ""}>'
                f'<div class="step-hd"><span class="step-no">{num}</span>'
                f'<span class="step-title">{title}</span>{gate_chip}</div>'
                + ''.join(segs_html) + '</div>')

    s, n = re.subn(r'<p><strong>步 (\d+)｜([^<]*)</strong>(.*?)</p>', build_card, s, flags=re.S)
    print(f'① 26 步卡片化：{n} 张')
else:
    print('① 已在位')

# ── ② mermaid 渲染 ──
MERMAID_SRC = Path('/Users/cuishi/lab/ncwk/overlay/node_modules/mermaid/dist/mermaid.min.js')
MERMAID_JS = VIEW / 'mermaid.min.js'
if 'mermaid.initialize' not in s and MERMAID_SRC.exists():
    shutil.copy(MERMAID_SRC, MERMAID_JS)
    init = '''
<script src="mermaid.min.js"></script>
<script>
(function () {
  mermaid.initialize({
    startOnLoad: false, securityLevel: 'strict',
    theme: 'base',
    themeVariables: {
      primaryColor: '#eff6ff', primaryBorderColor: '#2563eb', primaryTextColor: '#0f172a',
      lineColor: '#64748b', secondaryColor: '#f0fdf4', tertiaryColor: '#fefce8',
      fontSize: '13px', fontFamily: '-apple-system,PingFang SC,Microsoft YaHei,sans-serif'
    },
    flowchart: { curve: 'basis', htmlLabels: true }
  });
  document.querySelectorAll('code.sourceCode.mermaid').forEach(function (code) {
    var pre = code.parentElement;             // pre.sourceCode
    var wrap = pre.parentElement;             // div.sourceCode
    var div = document.createElement('div');
    div.className = 'mermaid';
    div.textContent = code.textContent;
    (wrap.tagName === 'DIV' && wrap.className.indexOf('sourceCode') >= 0 ? wrap : pre)
      .parentElement.replaceChild(div, (wrap.tagName === 'DIV' && wrap.className.indexOf('sourceCode') >= 0 ? wrap : pre));
  });
  mermaid.run({ querySelector: '.mermaid' }).catch(function (e) { console.warn('mermaid:', e); });
})();
</script>
'''
    s = s.replace('</body>', init + '\n</body>', 1)
    print('② mermaid 引擎注入（本地离线）')
elif 'mermaid.init' in s:
    print('② 已在位')
else:
    print('② mermaid.min.js 缺失，跳过', file=sys.stderr)

# ── ③ 正文归拢（根治 grid 行拉伸空白：目录树与正文首题共行，行高被目录撑到 ~600px，
#      h1 与"文档定位"间出现大片空白）——nav 前置到横幅正下方独占左列，
#      其余全部正文（导读卡/术语卡/h1/正文/脚本）包进 main.doc-main，顺序流式排版 ──
if '<main class="doc-main">' not in s:
    m = re.search(r'<nav id="TOC"[^>]*>.*?</nav>', s, re.S)
    assert m, 'nav#TOC 未命中'
    nav = m.group(0)
    s = s.replace(nav, '', 1)
    s = s.replace('</header>', '</header>' + nav, 1)
    m2 = re.search(r'(</nav>)(.*?)(</body>)', s, re.S)
    assert m2, '正文归拢锚未命中'
    s = (s[:m2.start()] + m2.group(1) + '<main class="doc-main">'
         + m2.group(2) + '</main>' + m2.group(3) + s[m2.end():])
    print('③ 正文归拢：nav 前置 + main 包裹')
else:
    print('③ 已在位')

F.write_text(s, encoding='utf-8')
print('二段增强完成')
