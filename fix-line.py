#!/usr/bin/env python3
# 一次性修复脚本：把判词用例的假输出改写为 section 形态（TS 源内 JSON 转义为 \\n）
import sys

p = 'custom/server/harness/workbench/__tests__/workbench-http.test.ts'
bs = chr(92)
sq = chr(39)
nl = bs + bs + 'n'  # TS 源中的 \\n（四字符：\ \ n 前再加两个反斜杠？不——两反斜杠+n）
json_body = '{"title":"x","hypothesis":"y","section":"## 小节' + nl + nl + '包含 deterministic_eval_summary 标记"}'
target = '      cli: async () => ({ ok: true, stdout: ' + sq + json_body + sq + ' }),'
lines = open(p).read().split('\n')
hit = 0
for i, l in enumerate(lines):
    if 'deterministic_eval_summary' in l and 'stdout' in l:
        lines[i] = target
        hit += 1
if hit != 1:
    print('hit =', hit, '（预期 1）——未改动')
    sys.exit(1)
open(p, 'w').write('\n'.join(lines))
print('rewritten ok')
print(target)
