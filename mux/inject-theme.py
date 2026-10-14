#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""inject-theme.py —— 给推演程序产出的 HTML 页面挂上明暗主题（2026-10-14）

背景：推演程序产出多个 HTML 页面（机器报告、最终报告、路演报告、二合一报告、演示
素材页）。第一轮只给机器报告与最终报告接了主题切换（见 mx-report-gen.py /
final-report-merge.py），其余页面还是只能亮色看。工具链这块要一次做完，否则每加
一个新页面就多一个「忘了接主题」的坑。

用法：
    python3 mux/inject-theme.py <页面.html> [页面专属暗色层.css ...]

行为：
    ① 读同目录的 theme-toggle.css / theme-toggle.js 与 theme-base.css（通用暗色层），
       再把命令行给的页面专属层按顺序追加；
    ② 全部注入到 </body> 前（文档最末）——注入在中间会被页面自身的样式盖回去，
       这正是报告页踩过的坑（暗色层排中间，结果 60 处文字不可读）；
    ③ 幂等：页面已含 theme-toggle-btn 就直接跳过，重复调用不会注两份。

配色口径：明色 = 页面原样（本来就是亮色设计）；暗色 = 通用层 + 页面专属层。
两页共用 theme-toggle.js，同一浏览器内互相跟随切换。
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MARKER = 'theme-toggle-btn'


def build_block(extra_css: list) -> str:
    parts = [
        '<style>\n' + (HERE / 'theme-base.css').read_text(encoding='utf-8') + '\n</style>',
        '<style>\n' + (HERE / 'theme-toggle.css').read_text(encoding='utf-8') + '\n</style>',
    ]
    for p in extra_css:
        parts.append('<style>\n' + Path(p).read_text(encoding='utf-8') + '\n</style>')
    parts.append('<script>\n' + (HERE / 'theme-toggle.js').read_text(encoding='utf-8') + '\n</script>')
    return ''.join(parts)


def main(page_arg: str, extra: list) -> int:
    page = Path(page_arg)
    html = page.read_text(encoding='utf-8')
    if MARKER in html:
        print('[theme] 已含切换控件，跳过（幂等）：%s' % page)
        return 0
    i = html.rfind('</body>')
    if i < 0:
        print('[theme] 跳过（无 </body>）：%s' % page)
        return 1
    html = html[:i] + build_block(extra) + html[i:]
    page.write_text(html, encoding='utf-8')
    print('[theme] 已注入：%s（通用层 + %d 页面层）' % (page, len(extra)))
    return 0


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit('用法：inject-theme.py <页面.html> [页面专属暗色层.css ...]')
    raise SystemExit(main(sys.argv[1], sys.argv[2:]))