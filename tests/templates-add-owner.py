#!/usr/bin/env python3
"""templates-add-owner.py — 批次二C：14 张交付物模版统一插入「主导者」契约注记。
插入位：文件头部注记区结束的 '---' 分隔线之后（正文首行前），以模版自身文法
（blockquote 注记）呈现。幂等：已含标记的文件跳过。"""
import sys
from pathlib import Path

TP = Path(__file__).resolve().parent.parent / 'mux' / 'templates-pending'
MARK = '主导者'
NOTE = ('\n> **主导者字段（V8.28 方案 §2.6.5）**：本交付物落仓时须在文档首部标注主导者'
        '（AI 产出·角色 agent ／ 人类角色模拟·驱动代演），逐件写实；代偿净额对账与'
        '清偿门按此取数，缺标即审计 FAIL（§5.9 净额对账线）。\n')

changed = skipped = missed = 0
for f in sorted(TP.glob('*.md')):
    if f.name == 'README.md':
        continue
    lines = f.read_text(encoding='utf-8').split('\n')
    if any(MARK in l and '主导者字段' in l for l in lines):
        skipped += 1
        continue
    try:
        idx = next(i for i, l in enumerate(lines) if l.strip() == '---')
    except StopIteration:
        print(f'MISS-ANCHOR {f.name}')
        missed += 1
        continue
    lines.insert(idx + 1, NOTE.rstrip('\n'))
    f.write_text('\n'.join(lines), encoding='utf-8')
    changed += 1
    print(f'INSERT {f.name}')
print(f'---- inserted={changed} skipped={skipped} missed={missed}')
sys.exit(1 if missed else 0)
