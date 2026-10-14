#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""inject-theme.py —— 把明暗主题层与切换控件注入方案页 HTML（render.sh 末步调用）

为什么单独成文件而不是塞进 render.sh 的内联 heredoc：这段逻辑要读三个 CSS/JS 文件
并做幂等判断，内联在 shell 里既难读又难测。render.sh 只管调用。

注入位置是 </body> 前（文档最末）：pandoc 主题、tokens、组件样式、以及 enhance.py /
enhance2.py 重写出来的 DOM 都在它之前，暗色层必须排在最后才能赢过它们的浅色硬编码。
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main(page_arg: str) -> None:
    page = Path(page_arg)
    root = HERE
    html = page.read_text(encoding='utf-8')

    if 'theme-toggle-btn' in html:
        print('[theme] 页面已含主题脚本，跳过（幂等）')
        return

    theme_css = (root / 'plan-theme.css').read_text(encoding='utf-8')
    toggle_css = (root / 'theme-toggle.css').read_text(encoding='utf-8')
    toggle_js = (root / 'theme-toggle.js').read_text(encoding='utf-8')

    i = html.rfind('</body>')
    if i < 0:
        raise SystemExit('[theme] 未找到 </body>，无法注入')

    html = (html[:i]
            + '<style>\n' + theme_css + '\n</style>\n'
            + '<style>\n' + toggle_css + '\n</style>\n'
            + '<script>\n' + toggle_js + '\n</script>\n'
            + html[i:])
    page.write_text(html, encoding='utf-8')
    print('[theme] 主题层与切换脚本已注入：%s' % page)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('用法：inject-theme.py <plan.html>')
    main(sys.argv[1])
