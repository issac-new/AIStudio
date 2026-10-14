"""从报告生成器的章节 CSS 中提取「按暗底挑选」的颜色规则，生成明色主题对应值。

背景：mx-report-gen.py 的章节样式（.nv-* / .art-* / .st-* 等）里有一批硬编码色，
这些色是为暗色底挑的（如 #c7d4e6），但样式表主体走的是亮色 token——于是明色主题下
白底浅字不可读（run19 实测 1.4:1）。本脚本把每条规则的选择器抓出来，配一个明色值，
追加到 report-light-override.css，规则全程带 html[data-theme="light"] 作用域。
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
GEN = HERE / 'report_narrative.py'   # 章节 CSS（.nv-* / .art-* / .st-*）真正所在
OUT = HERE / 'report-light-override.css'

# 暗底色 -> 明底色（同色相压深，保证白底 >= 4.5:1）
DARK_TO_LIGHT = {
    '#c7d4e6': '#334155',
    '#dbe4f0': '#334155',
    '#8ba0b8': '#64748b',
    '#94a3b8': '#64748b',
    '#a8b8cc': '#475569',
    '#57606a': '#475569',
    '#5a6a7d': '#475569',
    '#5a6b7d': '#475569',
    '#334155': '#334155',
    '#475569': '#475569',
    '#1e40af': '#1d4ed8',
    '#0f766e': '#0f766e',
    '#5eead4': '#0f766e',
    '#7dd3fc': '#0369a1',
    '#34d399': '#047857',
    '#f5b84c': '#b45309',
    '#f87171': '#b91c1c',
}

src = GEN.read_text(encoding='utf-8')
# 只看 CSS 片段：形如 sel{prop:val;...}
# 注意：章节 CSS 在生成器里是 f-string，花括号是双写的 {{ }}——
# 正则不处理这一点就一条都提取不到（本轮踩过）。
rule_re = re.compile(r'([.#a-zA-Z][^{}\n]{0,300}?)\{\{?([^{}\n]{1,400}?)\}\}?')
found = {}
for m in rule_re.finditer(src):
    sel, body = m.group(1), m.group(2)
    if not re.search(r'(^|[;{\s])color\s*:', body):
        continue
    cm = re.search(r'(?:^|[;{\s])color\s*:\s*(#[0-9a-fA-F]{3,8})\b', body)
    if not cm:
        continue
    val = cm.group(1).lower()
    if len(val) == 4:
        val = '#' + ''.join(ch * 2 for ch in val[1:])
    if val not in DARK_TO_LIGHT:
        continue
    if 'data-theme' in sel:          # 已主题化的规则不重复处理
        continue
    key = sel.strip()
    found.setdefault(key, set()).add(DARK_TO_LIGHT[val])

lines = ['\n/* ── 自动生成：章节样式里「按暗底挑选」的硬编码色 → 明底对应值 ──',
         '   （源：mux/report_narrative.py 章节 CSS；改该文件配色后须重跑 mux/tools/gen-light-override.py）*/']
n = 0
for sel in sorted(found):
    for val in sorted(found[sel]):
        sels = ', '.join('html[data-theme="light"] ' + s.strip() for s in sel.split(',') if s.strip())
        lines.append('%s{color:%s !important}' % (sels, val))
        n += 1

with OUT.open('a', encoding='utf-8') as f:
    f.write('\n'.join(lines) + '\n')
print('appended rules:', n)
