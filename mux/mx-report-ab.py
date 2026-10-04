#!/usr/bin/env python3
"""mx-report-ab.py — P8 双跑对照（A/B 报告审计对比器，2026-10-04 九源轮）

用途：同一需求/同一 harness 的两轮推演（A=基线轮，B=改进轮）产出对照表，
落实 V3/V5 治理总则"同一需求可下轮双跑对比输出一致性"（口径已立从未执行）。

对照面（全部实取，不臆造）：
1. 六闸落键：state.env 键集对比（only-A / only-B / 共有；键值差异逐条）
2. 审计健康：对两轮各跑一次 mx-report-audit.py（子进程，隔离树口径同源），
   汇总 FAIL/WARN 条数与逐条列表，PASS→FAIL / FAIL→PASS 迁移显式标出
3. 完成度：state.env *_done 键计数对比（A/B 同 harness 同步集，相对对比有效；
   审计 stdout 只有 7 行摘要无 HTML，原先从 stdout 数 class="ok" 恒为 0——死指标）

用法：
  python3 mx-report-ab.py --a 20261003-v7-run7 --b 20261004-v7-run8
  AIPAY_SIM_ROOT=/path python3 mx-report-ab.py --a id1 --b id2   # 隔离树
  --json 只输出机器可读 JSON（CI/报告生成器消费）

输出：markdown 对照表（stdout）；exit 0=可对照（不代表两轮都健康——健康看各自
审计退出码，本工具 exit 2=对照面不成立（某轮数据缺席））。
"""
import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

MUX = Path(__file__).resolve().parent


def _sim_root() -> Path:
    """AIPAY_SIM_ROOT 优先；缺省与 mx-lib.sh 同款回落（默认 NVMe 路径不存在/不可写
    时落 $HOME/ncwk-sim-mux——否则无该挂载点的机器会误诊「两轮 state.env 均缺席」）。"""
    env = os.environ.get('AIPAY_SIM_ROOT', '').strip()
    if env:
        return Path(env)
    default = Path('/Volumes/nvme2230/lab/ncwk-sim-mux')
    try:
        if (default.is_dir() and os.access(default, os.W_OK)) or (
            not default.exists() and os.access(default.parent, os.W_OK)
        ):
            return default
    except OSError:
        pass
    return Path.home() / 'ncwk-sim-mux'


SIM = _sim_root()


def read_state(run_id: str) -> dict:
    """state.env → {key: value}；缺文件返回 {}（如实缺席）。"""
    f = SIM / 'runs' / run_id / 'state.env'
    if not f.exists():
        return {}
    out = {}
    for line in f.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, _, v = line.partition('=')
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def run_audit(run_id: str) -> dict:
    """跑一轮审计子进程；返回 {exit, fails[], warns[], report}；超时返回 exit='timeout'。"""
    try:
        proc = subprocess.run(
            [sys.executable, str(MUX / 'mx-report-audit.py'), '--run', run_id],
            capture_output=True, text=True, cwd=str(MUX), timeout=300,
        )
    except subprocess.TimeoutExpired:
        # 超时=审计健康面缺席，不是可对照的「零缺陷」——如实标注，不炸整轮对照
        return {'exit': 'timeout', 'fails': [], 'warns': [], 'report': None,
                'raw_head': 'mx-report-audit 子进程超时（>300s，重图跑场 PNG md5 可达）'}
    text = proc.stdout + proc.stderr
    fails = [m.group(1).strip() for m in re.finditer(r'^- (.+)$', text, re.M)]
    # FAIL 列表行 "- xxx" 只在 == FAIL == 段后有效；WARN 行独立
    fails = [f for f in fails if f]
    warns = [m.group(1).strip() for m in re.finditer(r'^WARN (.+)$', text, re.M)]
    report_m = re.search(r'报告：(\S+)', text)
    return {
        'exit': proc.returncode,
        'fails': fails,
        'warns': warns,
        'report': report_m.group(1) if report_m else None,
        'raw_head': '\n'.join(text.splitlines()[:3]),
    }


def compare(a_id: str, b_id: str) -> dict:
    sa, sb = read_state(a_id), read_state(b_id)
    if not sa or not sb:
        # 单侧缺席同样对照面不成立（docstring 的 exit 2 契约）：否则空侧全键落
        # 「仅 B/A」+ 审计子进程对着不存在的跑空转
        missing = [r for r, s in ((a_id, sa), (b_id, sb)) if not s]
        return {'ok': False, 'reason': f'state.env 缺席：{", ".join(missing)}（{SIM}/runs/<id>/state.env）——对照面不成立'}
    aa, ab = run_audit(a_id), run_audit(b_id)
    keys_a, keys_b = set(sa), set(sb)
    common = sorted(keys_a & keys_b)
    only_a, only_b = sorted(keys_a - keys_b), sorted(keys_b - keys_a)
    value_diff = [
        {'key': k, 'a': sa[k], 'b': sb[k]}
        for k in common if sa[k] != sb[k]
    ]
    fail_a, fail_b = set(aa['fails']), set(ab['fails'])
    # 完成度：与 mx_write_progress 同口径（*_done 键计数；A/B 同步集相对对比有效）
    done_a = sum(1 for k in keys_a if k.endswith('_done'))
    done_b = sum(1 for k in keys_b if k.endswith('_done'))
    return {
        'ok': True,
        'sim_root': str(SIM),
        'a': {'run': a_id, 'state_keys': len(keys_a), 'done_steps': done_a, 'audit': {k: aa[k] for k in ('exit', 'fails', 'warns', 'report')}},
        'b': {'run': b_id, 'state_keys': len(keys_b), 'done_steps': done_b, 'audit': {k: ab[k] for k in ('exit', 'fails', 'warns', 'report')}},
        'gates': {'common': common, 'only_a': only_a, 'only_b': only_b, 'value_diff': value_diff},
        'audit_delta': {
            'fail_only_a': sorted(fail_a - fail_b),
            'fail_only_b': sorted(fail_b - fail_a),
            'warn_count_a': len(aa['warns']), 'warn_count_b': len(ab['warns']),
        },
    }


def render_md(res: dict) -> str:
    if not res.get('ok'):
        return f'# 双跑对照：不可对照\n\n原因：{res["reason"]}\n'
    a, b, g, d = res['a'], res['b'], res['gates'], res['audit_delta']
    lines = [
        f'# 双跑对照：A `{a["run"]}` × B `{b["run"]}`',
        '',
        f'数据面：`{res["sim_root"]}`（state.env 实读 + mx-report-audit 子进程实跑）',
        '',
        '## 六闸落键',
        f'- 共有键 {len(g["common"])}：{", ".join(g["common"]) or "—"}',
        f'- 仅 A（{len(g["only_a"])}）：{", ".join(g["only_a"]) or "—"}',
        f'- 仅 B（{len(g["only_b"])}）：{", ".join(g["only_b"]) or "—"}',
    ]
    if g['value_diff']:
        lines.append('- 键值差异：')
        lines.extend(f'  - `{v["key"]}`：A=`{v["a"]}` → B=`{v["b"]}`' for v in g['value_diff'])
    lines += [
        '',
        '## 审计健康',
        '',
        '| 轮 | 审计退出 | FAIL | WARN | 报告 |',
        '|---|---|---|---|---|',
        f'| A `{a["run"]}` | {a["audit"]["exit"]} | {len(a["audit"]["fails"])} | {len(a["audit"]["warns"])} | {a["audit"]["report"] or "—"} |',
        f'| B `{b["run"]}` | {b["audit"]["exit"]} | {len(b["audit"]["fails"])} | {len(b["audit"]["warns"])} | {b["audit"]["report"] or "—"} |',
        '',
        f'- 完成度（state.env `*_done` 键）：A `{a["run"]}` = {a["done_steps"]} / B `{b["run"]}` = {b["done_steps"]}',
        '',
    ]
    if d['fail_only_a']:
        lines.append('### 仅 A 失败（B 已不失败——疑似修复）')
        lines.extend(f'- {f}' for f in d['fail_only_a'])
        lines.append('')
    if d['fail_only_b']:
        lines.append('### 仅 B 失败（A 不失败——疑似回归，改进主张的反证）')
        lines.extend(f'- {f}' for f in d['fail_only_b'])
        lines.append('')
    lines.append('> 对照≠判定：一致性看共有键与审计迁移；两轮各自健康看其审计退出码。')
    return '\n'.join(lines) + '\n'


def main() -> int:
    ap = argparse.ArgumentParser(description='双跑对照（A/B 报告审计对比）')
    ap.add_argument('--a', required=True, help='基线轮 run id')
    ap.add_argument('--b', required=True, help='对照轮 run id')
    ap.add_argument('--json', action='store_true', help='输出 JSON（CI 消费）')
    args = ap.parse_args()
    res = compare(args.a, args.b)
    if args.json:
        print(json.dumps(res, ensure_ascii=False, indent=2))
    else:
        print(render_md(res))
    return 0 if res.get('ok') else 2


if __name__ == '__main__':
    sys.exit(main())
