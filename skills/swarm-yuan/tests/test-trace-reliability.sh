#!/usr/bin/env bash
# 决策留痕契约：CLI 有限退出、JSON 保真、并发序列唯一、链中断不能当旧格式跳过。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
python3 - "$ROOT/assets/trace-log.sh" <<'PY'
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import subprocess
import sys
import threading

script = sys.argv[1]
failures = []

def check(name, condition):
    print(('PASS ' if condition else 'FAIL ') + name)
    if not condition:
        failures.append(name)

with TemporaryDirectory(prefix='trace-reliability-') as temp:
    root = Path(temp)
    def run(project, *args, timeout=15):
        return subprocess.run(['bash', script, '--project-dir', str(project), *args],
                              capture_output=True, text=True, timeout=timeout)
    def decision(project, suggestion):
        return run(project, '--decision', '--type', 'Mechanical',
                   '--suggestion', suggestion, '--user-action', 'approved')
    for flag in ['--tool', '--note', '--project-dir', '--suggestion']:
        try:
            result = run(root / 'args', flag, timeout=2)
            check('缺参数有限失败 ' + flag, result.returncode != 0)
        except subprocess.TimeoutExpired:
            check('缺参数有限失败 ' + flag, False)

    value = '中文 "quote" \\ path\tline\nnext\r' + ''.join(chr(i) for i in range(1, 32))
    for mode, filename, field in [
        (['--tool', 'probe', '--note', value], 'trace.jsonl', 'note'),
        (['--key-node', 'probe', '--note', value], 'key-nodes.jsonl', 'note'),
        (['--decision', '--type', 'Mechanical', '--suggestion', value,
          '--user-action', 'approved'], 'decisions.jsonl', 'ai_suggestion')]:
        project = root / filename
        result = run(project, *mode)
        try:
            rows = (project / '.swarm-yuan' / filename).read_text().splitlines()
            check('JSON 字符保真 ' + filename,
                  result.returncode == 0 and len(rows) == 1 and json.loads(rows[0])[field] == value)
        except (ValueError, OSError):
            check('JSON 字符保真 ' + filename, False)

    # 同一批并发真实 CLI 写入；序号/前驱/校验码三个约束共同检查。
    project = root / 'concurrent'
    barrier = threading.Barrier(12)
    def write(index):
        barrier.wait(timeout=10)
        return decision(project, str(index))
    with ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(write, range(12)))
    ledger = project / '.swarm-yuan/decisions.jsonl'
    rows = [json.loads(line) for line in ledger.read_text().splitlines()]
    check('并发写入无丢失且序号连续', len(rows) == 12 and
          [row['seq'] for row in rows] == list(range(1, 13)) and
          all(result.returncode == 0 for result in results))
    check('并发链通过校验', run(project, '--verify-chain').returncode == 0)

    project = root / 'sequential'
    for index in range(3):
        decision(project, str(index))
    ledger = project / '.swarm-yuan/decisions.jsonl'
    original = ledger.read_text().splitlines()
    check('顺序写入正例', run(project, '--verify-chain').returncode == 0)
    # 用旧格式记录替换中间行，不能重置校验器从而掩盖删除。
    ledger.write_text(original[0] + '\n{"type":"legacy"}\n' + original[2] + '\n')
    check('链中旧格式不能重置检查', run(project, '--verify-chain').returncode != 0)
    ledger.write_text('\n'.join(original[1:]) + '\n')
    check('删除链首可检出', run(project, '--verify-chain').returncode != 0)
    ledger.write_text('\n'.join(original) + '\n')
    check('恢复原内容通过', run(project, '--verify-chain').returncode == 0)

    project = root / 'legacy'
    ledger = project / '.swarm-yuan/decisions.jsonl'
    ledger.parent.mkdir(parents=True)
    ledger.write_text('{"type":"legacy"}\n')
    decision(project, 'new')
    check('前导旧格式兼容', run(project, '--verify-chain').returncode == 0)

sys.exit(bool(failures))
PY
