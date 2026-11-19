#!/usr/bin/env python3
"""test_determinism.py — resolver 纯函数确定性验证。

同一 hint 连跑 N 次（默认 10，--runs 可调至 SKILL.md §6 承诺的 100），
完整 Resolution JSON 必须逐字节一致；任一漂移 exit 1。
覆盖四类路径：typed 精排 / alias 主导 / abstain 门 / explicit 显式调用。
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_RESOLVER = os.environ.get(
    "RESOLVER_CLI",
    os.path.expanduser("~/.hermes/profiles/_shared/scripts/resolver_cli.py"),
)

PROBES = [
    ("typed-exploit", "Test SQL injection on https://target.com/api/users, union based injection point, mysql backend", None),
    ("alias-audit", "tf04 缓解审计 skill-security 技能加固方案", None),
    ("abstain-gate", "帮我写一份婚礼致辞演讲稿", None),
    ("explicit-invocation", "例行检查一下", "skillguard"),
]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="resolver 确定性验证")
    ap.add_argument("--resolver", default=DEFAULT_RESOLVER)
    ap.add_argument("--routing", default=os.path.join(
        os.path.dirname(os.path.abspath(DEFAULT_RESOLVER)), "skill_routing.json"))
    ap.add_argument("--runs", type=int, default=10, help="每 hint 重复次数（SKILL.md §6 承诺 100）")
    args = ap.parse_args(argv)

    spec = importlib.util.spec_from_file_location("resolver_cli_det", args.resolver)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod  # Py3.14: @dataclass 需模块已注册，否则 _is_type 取 ns=None 崩
    spec.loader.exec_module(mod)

    failures = []
    for cid, hint, explicit_skill in PROBES:
        explicit = {"skill": [explicit_skill]} if explicit_skill else None
        first = json.dumps(mod.resolve(hint, args.routing, explicit=explicit),
                           ensure_ascii=False, sort_keys=True)
        drifted = 0
        for _ in range(args.runs - 1):
            again = json.dumps(mod.resolve(hint, args.routing, explicit=explicit),
                               ensure_ascii=False, sort_keys=True)
            if again != first:
                drifted += 1
        if drifted:
            failures.append(f"[{cid}] {drifted}/{args.runs - 1} 次结果漂移")
            print(f"FAIL [{cid}] {drifted}/{args.runs - 1} runs drifted")
        else:
            p = json.loads(first)["primary"]
            print(f"PASS [{cid}] {args.runs}/{args.runs} identical "
                  f"(primary={p['id'] if p else None})")

    print(f"{'PASS' if not failures else 'FAIL'} determinism {len(PROBES)} probes x {args.runs} runs "
          f"resolver={args.resolver}")
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
