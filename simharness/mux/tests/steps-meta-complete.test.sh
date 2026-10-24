#!/bin/bash
# 守门：STEPS_META 表全键断言（run11 实锤：建表漏键首达报告步即崩/九步 imgs 缺）
# 契约（AST 硬解析，按生成器真实读取面）：每步必含 narrative/imgs/keys；title 来自
# 方案标题层不在表内（设计如此）；actor 生成器有回退（缺则 WARN 不 FAIL）。
set -u
cd "$(dirname "$0")/../.."
python3 - <<'PY'
import ast, sys
tree = ast.parse(open('mux/mx-report-gen.py', encoding='utf-8').read())
REQ = {'narrative', 'imgs', 'keys'}
fails, warns = [], []
found = 0
for node in ast.walk(tree):
    if isinstance(node, ast.Assign) and isinstance(node.value, ast.Dict):
        names = [t.id for t in node.targets if isinstance(t, ast.Name)]
        if not any(n.startswith('STEPS_META_RUN') for n in names):
            continue
        found += 1
        for k, v in zip(node.value.keys, node.value.values):
            if not (isinstance(k, ast.Constant) and isinstance(k.value, int)):
                continue
            kw = {a.arg for a in v.keywords} if isinstance(v, ast.Call) else set()
            absent = REQ - kw
            if absent:
                fails.append(f'{names[0]} 步{k.value} 缺 {sorted(absent)}')
            elif 'actor' not in kw:
                warns.append(f'{names[0]} 步{k.value} 缺 actor（生成器有 both 回退）')
assert found >= 1, '未找到任何 STEPS_META 表'
for w in warns:
    print('WARN', w)
if fails:
    print('FAIL'); [print(' -', f) for f in fails]; sys.exit(1)
print(f'steps-meta-complete: {found} 表全键断言过（WARN {len(warns)}）')
PY
