#!/usr/bin/env python3
"""plan-html-render.py — 推演方案 md → 自包含 HTML（run26 清偿批 2026-11-03）。

背景：pandoc 默认产物依赖外部 CDN CSS 且不渲染 mermaid——用户实看为裸文本
（2026-11-03 反馈）。本脚本产出零外部依赖的单文件 HTML：
  ① pandoc --standalone --toc 渲染骨架（标题锚/目录）；
  ② mermaid 代码块逐个经 mmdc 预渲染为 SVG 内联回嵌（离线可看，无运行时 JS）；
  ③ 内联紧凑 CSS（标题/表格/代码块/目录样式）。
用法：python3 plan-html-render.py <plan.md> [out.html]
依赖：pandoc、mmdc（/usr/local/bin/mmdc）。
"""
from __future__ import annotations
import re
import subprocess
import sys
import tempfile
from pathlib import Path

CSS = """
:root{color-scheme:light}
body{font:15px/1.75 -apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
     color:#1f2328;max-width:1060px;margin:0 auto;padding:28px 26px 80px;background:#fff}
h1{font-size:26px;border-bottom:2px solid #d0d7de;padding-bottom:8px}
h2{font-size:21px;margin-top:34px;border-bottom:1px solid #d8dee4;padding-bottom:6px}
h3{font-size:17px;margin-top:26px}h4{font-size:15px}
a{color:#0969da;text-decoration:none}a:hover{text-decoration:underline}
table{border-collapse:collapse;width:100%;margin:14px 0;font-size:13.5px;display:block;overflow-x:auto}
th,td{border:1px solid #d0d7de;padding:6px 10px;text-align:left;vertical-align:top}
th{background:#f6f8fa}
code{font:12.5px/1.6 ui-monospace,Menlo,monospace;background:#f6f8fa;padding:1px 5px;border-radius:4px}
pre{background:#f6f8fa;border:1px solid #d8dee4;border-radius:8px;padding:12px 14px;overflow-x:auto}
pre code{background:none;padding:0}
blockquote{border-left:4px solid #d0d7de;margin:12px 0;padding:2px 14px;color:#57606a;background:#f9fafb}
hr{border:0;border-top:1px solid #d0d7de;margin:28px 0}
nav#TOC{border:1px solid #d0d7de;border-radius:8px;background:#f9fafb;padding:12px 18px;margin:20px 0}
nav#TOC ul{margin:4px 0;padding-left:20px}nav#TOC a{color:#1f2328}
figure{margin:14px 0;text-align:center}figure svg{max-width:100%;height:auto}
figcaption{font-size:12.5px;color:#57606a;margin-top:4px}
"""


def render_mermaid(blocks: list[str]) -> list[str]:
    svgs = []
    for i, src in enumerate(blocks):
        with tempfile.TemporaryDirectory() as td:
            mmd = Path(td) / f'd{i}.mmd'
            svg = Path(td) / f'd{i}.svg'
            mmd.write_text(src, encoding='utf-8')
            r = subprocess.run(['mmdc', '-i', str(mmd), '-o', str(svg), '-b', 'white'],
                               capture_output=True, text=True, timeout=120)
            if r.returncode != 0 or not svg.exists():
                svgs.append(f'<pre class="mermaid-failed"><code>{src}</code></pre>'
                            f'<!-- mmdc 失败: {r.stderr.strip()[:300]} -->')
                continue
            svgs.append(f'<figure>{svg.read_text(encoding="utf-8")}</figure>')
    return svgs


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    src = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path('/tmp') / (src.stem + '.html')

    md = src.read_text(encoding='utf-8')

    # ① mermaid 块提取占位（渲染前剥离，防 pandoc 转义搅局）
    blocks: list[str] = []

    def stash(m: re.Match) -> str:
        blocks.append(m.group(1))
        return f'<!--MERMAID-{len(blocks) - 1}-->'

    md = re.sub(r'^```mermaid\n(.*?)^```$', stash, md, flags=re.S | re.M)

    # ② pandoc 骨架
    r = subprocess.run(
        ['pandoc', '-f', 'markdown+pipe_tables+backtick_code_blocks', '-t', 'html5',
         '--standalone', '--toc', '--toc-depth=3',
         '--metadata', 'title=' + src.stem, '--metadata', 'lang=zh-CN'],
        input=md, capture_output=True, text=True)
    if r.returncode != 0:
        print('pandoc 失败: ' + r.stderr, file=sys.stderr)
        return 1
    html = r.stdout

    # ③ mermaid SVG 回嵌
    svgs = render_mermaid(blocks)
    for i, svg in enumerate(svgs):
        html = html.replace(f'<!--MERMAID-{i}-->', svg)

    # ④ 内联 CSS（剥 pandoc 外链 style，注入自包含样式）
    html = re.sub(r'<link[^>]+rel="stylesheet"[^>]*>\s*', '', html)
    html = html.replace('</head>', f'<style>{CSS}</style></head>')

    out.write_text(html, encoding='utf-8')
    print(f'plan html written: {out}（{out.stat().st_size // 1024} KB，mermaid {len(blocks)} 块，零外部依赖）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
