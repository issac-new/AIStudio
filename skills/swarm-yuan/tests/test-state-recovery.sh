#!/usr/bin/env bash
# 恢复读取最后完整 journal；无效快照零写入，合法恢复保留回滚前证据。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
python3 - "$ROOT/assets/state-machine.sh" <<'PY'
from pathlib import Path
from tempfile import TemporaryDirectory
import os
import subprocess
import sys

failures = []
def check(name, condition):
    print(('PASS ' if condition else 'FAIL ') + name)
    if not condition:
        failures.append(name)

with TemporaryDirectory(prefix='state-recovery-') as temp:
    root = Path(temp)
    env = dict(os.environ, PROJECT_DIR=temp)
    def run(*args):
        return subprocess.run(['bash', sys.argv[1], *args], env=env,
                              capture_output=True, text=True, timeout=10)
    run('init', 'recovery')
    state = root / '.swarm-yuan'
    # R126 合流注：state-machine `set` 对受保护字段已 fail-closed（phase 只走
    # transition），本测试验证的是 restore/journal 行为而非 set 语义——
    # 夹具期状态改写直接写 state.yaml（外部篡改面正是 restore 须容忍的场景）。
    state_file = state / 'state.yaml'
    def force_phase(p):
        lines = state_file.read_text().splitlines(keepends=True)
        state_file.write_text(''.join('phase: %s\n' % p if ln.startswith('phase: ') else ln for ln in lines))
    (state / '.failure_count').write_text('2\n')
    run('dump-journal')
    force_phase('build')
    (state / '.failure_count').write_text('4\n')
    run('dump-journal')
    journal = state / 'builder-journal.md'
    with journal.open('a') as output:
        output.write('---\nphase: partial\n')
    result = run('restore-journal')
    check('恢复最后完整快照', result.returncode == 0 and
          'phase=build failure_count=4 peak=L0' in result.stdout and not result.stderr)
    ledger = state / 'decisions.jsonl'
    ledger.write_text('{"decision":1}\n{"decision":2}\n')
    original = (state / 'state.yaml').read_bytes()
    original_decisions = ledger.read_bytes()
    for name, content in [
        ('invalid-phase', 'phase=bogus\ndecisions_lines=0\n'),
        ('missing-count', 'phase=open\n'),
        ('negative-count', 'phase=open\ndecisions_lines=-1\n'),
        ('missing-prefix', 'phase=open\ndecisions_lines=99\n'),
        ('duplicate-phase', 'phase=open\nphase=build\ndecisions_lines=1\n')]:
        fixture = root / (name + '.ckpt')
        fixture.write_text(content)
        result = run('restore', str(fixture))
        check('拒绝无效快照 ' + name, result.returncode != 0 and
              (state / 'state.yaml').read_bytes() == original and ledger.read_bytes() == original_decisions)
        (state / 'state.yaml').write_bytes(original)
        ledger.write_bytes(original_decisions)
    # 真实 checkpoint -> 新增决策 -> restore；恢复前完整账本须有持久副本。
    run('checkpoint')
    checkpoint = next((state / 'checkpoints').glob('*.ckpt'))
    ledger.write_bytes(original_decisions + b'{"decision":3}\n')
    before_restore = ledger.read_bytes()
    force_phase('verify')
    result = run('restore', str(checkpoint))
    check('合法快照恢复', result.returncode == 0 and
          run('get', 'phase').stdout.strip() == 'build' and ledger.read_bytes() == original_decisions)
    backups = list((state / 'restore-backups').glob('*/decisions.jsonl'))
    check('恢复前决策存档', any(path.read_bytes() == before_restore for path in backups))
    # 保持行数不变但改快照之前的内容，应通过 checkpoint 内前缀校验拒绝恢复。
    ledger.write_text('{"decision":"changed"}\n{"decision":2}\n')
    tampered = ledger.read_bytes()
    result = run('restore', str(checkpoint))
    check('快照前证据漂移拒绝恢复', result.returncode != 0 and ledger.read_bytes() == tampered)

sys.exit(bool(failures))
PY
