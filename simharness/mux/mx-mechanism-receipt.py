#!/usr/bin/env python3
"""mx-mechanism-receipt.py — 烧机收据 digest 绑定件（P2 Task 2）。

为什么有它：mx-burn-test 旧收据（schema 1）不绑定机制真身——机制文件改了、旧 pass
收据照样被认账；旧 shell 拼 JSON 在空值场景产破损行（burn-20261103-215414 实锤）；
--dry-run 与真跑在索引上不可区分。本件三合一：

  digest          机制文件清单 length-prefixed 哈希（内容身份：同内容同值、内容变即
                  变、mtime 变不变；清单见 MECHANISM_FILES）
  emit            写 schema 2 收据（json 序列化，非 shell 拼 JSON）+ 追加仓内索引
                  .qgate/burn/burn-receipts.jsonl（一行一条；dry-run 永不落件）
  verify-latest   prelaunch ㉛ 核验：当前 digest 的**最新**收据 status=pass 且
                  coverage 达 archgate（旧 pass/坏 JSON/后 fail/短场景全拦）

清单边界守门=simharness/tests/mechanism-behavior.test.ts（锁「覆盖机制地图且不纳入
无关面」）；本清单是单一事实源，mx-burn-test.sh 经 `digest`/`emit` 消费。
"""
import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

# 机制文件清单（单一事实源）：机制地图（docs/design/mechanism-map.md §1/§4）四族——
# 回合内重试（707/722 patch 载体）、跨回合恢复（725/726/729）、进程级监督
# （run-driver-supervisor/mx-relay/supervisor.ts/guard）、闸门等待与熔断
# （aipay-scenario/mx-scenario-lib/mx-gate-lib/mx-recovery-lib/breaker.ts）。
# 报告面/清场工具/构建面不纳入（纳入即每次无关改动都要求烧机）。
MECHANISM_FILES = (
    'simharness/aipay-scenario.sh',
    'simharness/mux/run-driver-supervisor.sh',
    'simharness/mux/mx-lib.sh',
    'simharness/mux/mx-scenario-lib.sh',
    'simharness/mux/mx-gate-lib.sh',
    'simharness/mux/mx-recovery-lib.sh',
    'simharness/mux/mx-relay.sh',
    'scripts/platform/runtime/guard.mjs',
    'scripts/platform/runtime/guard-cli.mjs',
    'custom/server/simrun/supervisor.ts',
    'custom/server/governance/lifecycle/breaker.ts',
    'patches/707-agent-codex-terminal-incomplete-retry.patch',
    'patches/722-agent-emptystream-ladder-classify.patch',
    'patches/725-agent-chat-turn-recovery.patch',
    'patches/726-agent-chat-recovery-kwarg-fix.patch',
    'patches/729-agent-recovery-kwargs-pure.patch',
)

# 烧机步序（与 mx-burn-test.sh STEPS 同源；coverage 达标线=archgate）
STEPS = ('smoke', 'appinit', 'people', 'ba', 'reqgate', 'room', 'dispatch', 'register',
         'analysis', 'triage', 'anexec', 'review', 'archgate', 'close', 'plan', 'devimpl',
         'defect', 'testpass', 'ready', 'release', 'uat', 'workmgr', 'audit', 'retro', 'ide',
         'report')
COVERAGE_FLOOR = 'archgate'


def _hput(h, data: bytes) -> None:
    """length-prefixed 吸收：先长度后内容（防「路径A+内容B」拼接歧义）。"""
    h.update(str(len(data)).encode('ascii'))
    h.update(b':')
    h.update(data)


def mechanism_digest(root: str):
    """→ (digest_hex, file_count)；任一清单文件缺席=硬错（fail-closed，不产半 digest）。"""
    h = hashlib.sha256()
    n = 0
    for rel in MECHANISM_FILES:
        p = Path(root) / rel
        if not p.is_file():
            raise SystemExit(f'[mechanism-receipt FAIL] 机制文件缺席：{rel}（清单=MECHANISM_FILES 单一事实源）')
        _hput(h, rel.encode('utf-8'))
        _hput(h, p.read_bytes())
        n += 1
    return h.hexdigest(), n


def coverage_ok(coverage) -> bool:
    """coverage 达标=目标步达成 且 until 步位 ≥ archgate（短场景 triage 不算覆盖）。"""
    if not isinstance(coverage, dict):
        return False
    until = str(coverage.get('until', ''))
    reached = coverage.get('goal_step_reached') is True
    if until not in STEPS or COVERAGE_FLOOR not in STEPS:
        return False
    return reached and STEPS.index(until) >= STEPS.index(COVERAGE_FLOOR)


def cmd_digest(a):
    d, n = mechanism_digest(a.root)
    print(json.dumps({'digest': d, 'file_count': n}))


def cmd_list(_a):
    for rel in MECHANISM_FILES:
        print(rel)


def cmd_selfcheck(a):
    missing = [rel for rel in MECHANISM_FILES if not (Path(a.root) / rel).is_file()]
    if missing:
        print(f'[mechanism-receipt FAIL] 机制文件缺席：{", ".join(missing)}')
        return 1
    print(f'selfcheck ok（{len(MECHANISM_FILES)} 机制文件在位）')
    return 0


def cmd_emit(a):
    d, n = mechanism_digest(a.root)
    coverage = {'until': a.until, 'goal_step_reached': a.goal_ok == 1}
    receipt = {
        'kind': 'burn-test-receipt',
        'schema': 2,
        'run_id': a.run_id,
        'until': a.until,
        'status': a.status,
        'reasons': a.reasons,
        'driver_rc': a.driver_rc,
        'fail_lines': a.fail_lines,
        'done_keys': a.done_keys,
        'goal_step_reached': a.goal_ok,
        'coverage': coverage,
        'started_at': a.started_at,
        'finished_at': a.finished_at,
        'elapsed_sec': max(0, a.finished_at - a.started_at),
        'log': a.log,
        'fail_excerpt': a.fail_excerpt,
        'mechanism_digest': d,
        'mechanism_file_count': n,
        'driver_log_sha256': _file_sha(a.log),
        'receipt_path': os.path.abspath(a.out),
    }
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(out.name + f'.tmp.{os.getpid()}')
    tmp.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    os.replace(tmp, out)  # 原子写（temp+rename）
    # 索引一行一条（append；最新在后——verify-latest 取同 digest 末条）
    if a.index:
        idx = Path(a.index)
        idx.parent.mkdir(parents=True, exist_ok=True)
        with idx.open('a', encoding='utf-8') as f:
            f.write(json.dumps({
                'run_id': a.run_id, 'until': a.until, 'status': a.status,
                'finished_at': a.finished_at, 'elapsed_sec': max(0, a.finished_at - a.started_at),
                'reasons': a.reasons, 'mechanism_digest': d,
                'mechanism_file_count': n, 'coverage': coverage,
                'driver_log_sha256': receipt['driver_log_sha256'],
                'receipt_path': receipt['receipt_path'],
            }, ensure_ascii=False) + '\n')
    print(json.dumps({'ok': True, 'digest': d, 'receipt': str(out)}))


def _file_sha(path: str):
    try:
        return hashlib.sha256(Path(path).read_bytes()).hexdigest()
    except OSError:
        return None


def cmd_verify_latest(a):
    d, _n = mechanism_digest(a.root)
    receipts_path = Path(a.receipts)
    if not receipts_path.is_file():
        print(f'verify-latest FAIL：收据索引缺席（{receipts_path}）——机制改动后从未烧机，先跑 mx-burn-test.sh')
        return 1
    latest = None
    for lineno, line in enumerate(receipts_path.read_text(encoding='utf-8').splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            print(f'verify-latest FAIL：索引第 {lineno} 行坏 JSON（fail-closed 不跳过）——人工核 {receipts_path}')
            return 1
        if rec.get('mechanism_digest') == d:
            latest = rec
    if latest is None:
        print('verify-latest FAIL：无当前 digest 的烧机收据（旧 digest 的 pass 不认账）——机制面已变化，须重烧')
        return 1
    if latest.get('status') != 'pass':
        print(f"verify-latest FAIL：当前 digest 最新收据 status={latest.get('status')}（run={latest.get('run_id')}）——最新 fail 覆盖历史 pass，先修复再烧")
        return 1
    if not coverage_ok(latest.get('coverage')):
        print(f"verify-latest FAIL：coverage 不足（{json.dumps(latest.get('coverage'), ensure_ascii=False)}，达标线=goal_step_reached 且 until≥{COVERAGE_FLOOR}）——短场景收据不算覆盖")
        return 1
    print(f"verify-latest ok：当前 digest 最新收据 pass 且 coverage 达 {COVERAGE_FLOOR}（run={latest.get('run_id')}）")
    return 0


def main():
    ap = argparse.ArgumentParser(description='烧机收据 digest 绑定件（digest/emit/verify-latest）')
    sub = ap.add_subparsers(dest='cmd', required=True)

    p = sub.add_parser('digest'); p.add_argument('--root', required=True); p.set_defaults(fn=cmd_digest)
    p = sub.add_parser('list'); p.set_defaults(fn=cmd_list)
    p = sub.add_parser('selfcheck'); p.add_argument('--root', default=str(Path(__file__).resolve().parents[2])); p.set_defaults(fn=cmd_selfcheck)
    p = sub.add_parser('emit')
    p.add_argument('--root', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--index', default='')
    p.add_argument('--run-id', required=True)
    p.add_argument('--until', required=True)
    p.add_argument('--status', required=True, choices=['pass', 'fail'])
    p.add_argument('--driver-rc', type=int, required=True)
    p.add_argument('--fail-lines', type=int, required=True)
    p.add_argument('--done-keys', type=int, required=True)
    p.add_argument('--goal-ok', type=int, required=True)
    p.add_argument('--started-at', type=int, required=True)
    p.add_argument('--finished-at', type=int, required=True)
    p.add_argument('--log', required=True)
    p.add_argument('--reasons', default='none')
    p.add_argument('--fail-excerpt', default='')
    p.set_defaults(fn=cmd_emit)
    p = sub.add_parser('verify-latest')
    p.add_argument('--root', required=True)
    p.add_argument('--receipts', required=True)
    p.set_defaults(fn=cmd_verify_latest)

    a = ap.parse_args()
    rc = a.fn(a)
    sys.exit(rc if isinstance(rc, int) else 0)


if __name__ == '__main__':
    main()
