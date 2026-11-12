#!/bin/bash
# frame-verify-empties.test.sh — 空白态否定词粒度守门（2026-11-12 run29 补拍轮第三粒度）
# 背景：0tasks 词三代误伤链（run26 裸「暂无」→run28 泳道占位词→run29 阶段条计数）。
# 本测钉住收窄判据不再回退：满板+他阶段 0tasks 必过、真空白必拦。
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fails=0
ok() { echo "PASS $*"; }
bad() { echo "FAIL $*"; fails=1; }

VF="$HERE/mux/frame-verify.py"
python3 - "$VF" <<'PY'
import sys, importlib.util
spec = importlib.util.spec_from_file_location('fv', sys.argv[1])
fv = importlib.util.module_from_spec(spec); spec.loader.exec_module(fv)
exp = {'want': ['任务', '看板', '分解']}
cases = [
    # (名, 文本, 期望 ok)
    ('满板+他阶段0tasks（run29 补拍实录形态）', '任务分解 5tasks 视图 搭建 0tasks 需求 2tasks 待分类0 待办0 已调度1', True),
    ('全零计数=真空板', '任务分解 0tasks 视图 待分类0', False),
    ('仅 0tasks 无其他计数', '任务分解 0tasks', False),
    ('他阶段有计数但目标板头 0（页内 maxN>0）→ 按 D1 判非空', '看板 3tasks 分析设计 0tasks', True),
    ('其他空白词不受收窄影响', '任务 看板 分解 还没有任务工作区', False),
    ('报错词不受收窄影响', '任务 看板 分解 APIError', False),
]
rc = 0
for name, text, want in cases:
    got = fv.verdict(text, exp)[0]
    mark = 'PASS' if got == want else 'FAIL'
    if got != want: rc = 1
    print(f'{mark} {name}（ok={got} 期望 {want}）')
sys.exit(rc)
PY
RC=$?
(( RC == 0 )) && echo ALL-PASS || echo HAS-FAIL
exit $RC
