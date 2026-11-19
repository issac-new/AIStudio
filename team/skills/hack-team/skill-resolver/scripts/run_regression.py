#!/usr/bin/env python3
"""run_regression.py — skill-resolver 路由回归门（对齐 reverse-skill test-routing.ps1 模式）。

逐 case 调 resolver，比对 primary / supports / abstain，任一 mismatch exit 1。
改动 routing 规则、routing 元数据（skill_routing.json）或 resolver 本体后必跑；
rc=0 才算改完（对齐 evals 纪律：护栏改动即验证）。

用法：
  python3 run_regression.py                    # 默认 resolver/routing/golden 路径
  python3 run_regression.py --resolver /x/resolver_cli.py --routing /x/skill_routing.json
  RESOLVER_CLI=/x/resolver_cli.py python3 run_regression.py

case 字段（golden.json，纯数组）：
  id, hint, expect_primary(技能id|null), expect_supports_contains(数组|null,子集断言),
  expect_abstain(bool), explicit_skill(可选,显式调用通道), note(锚定依据)
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_RESOLVER = os.environ.get(
    "RESOLVER_CLI",
    os.path.expanduser("~/.hermes/profiles/_shared/scripts/resolver_cli.py"),
)


def load_resolver(path: str):
    """import resolver_cli（优先，零 provenance 副作用）；失败返回 None。"""
    try:
        spec = importlib.util.spec_from_file_location("resolver_cli_reg", path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod
    except Exception as exc:  # noqa: BLE001 — 回退 subprocess
        print(f"[warn] import resolver 失败({exc})，回退 subprocess 模式", file=sys.stderr)
        return None


def resolve_subprocess(resolver_path: str, routing: str, hint: str, explicit_skill):
    """subprocess 兜底：走 resolver_cli --task-json（显式调用/explicit 通道一致）。"""
    task = {"text": hint}
    if explicit_skill:
        task["skill"] = [explicit_skill]
    proc = subprocess.run(
        [sys.executable, resolver_path, "--task-json", json.dumps(task, ensure_ascii=False),
         "--routing", routing, "--json"],
        capture_output=True, text=True, timeout=60,
    )
    if proc.returncode not in (0, 1):  # 1=abstain，均为正常业务返回
        raise RuntimeError(f"resolver exit={proc.returncode}: {proc.stderr[:400]}")
    return json.loads(proc.stdout)


def resolve_case(mod, resolver_path: str, routing: str, hint: str, explicit_skill):
    if mod is not None:
        explicit = {"skill": [explicit_skill]} if explicit_skill else None
        return mod.resolve(hint, routing, explicit=explicit)
    return resolve_subprocess(resolver_path, routing, hint, explicit_skill)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="skill-resolver 路由回归门")
    ap.add_argument("--golden", default=os.path.join(HERE, "golden.json"))
    ap.add_argument("--resolver", default=DEFAULT_RESOLVER)
    ap.add_argument("--routing", default=os.path.join(
        os.path.dirname(os.path.abspath(DEFAULT_RESOLVER)), "skill_routing.json"))
    args = ap.parse_args(argv)

    if not os.path.isfile(args.resolver):
        print(f"FATAL: resolver 不存在: {args.resolver}", file=sys.stderr)
        return 2
    if not os.path.isfile(args.routing):
        print(f"FATAL: routing 不存在: {args.routing}", file=sys.stderr)
        return 2
    with open(args.golden, encoding="utf-8") as f:
        cases = json.load(f)
    if not isinstance(cases, list) or not cases:
        print(f"FATAL: golden.json 应为非空数组: {args.golden}", file=sys.stderr)
        return 2

    mod = load_resolver(args.resolver)
    failures = []
    routed = abstained = 0
    for case in cases:
        cid = case.get("id", "<no-id>")
        hint = case["hint"]
        try:
            r = resolve_case(mod, args.resolver, args.routing, hint, case.get("explicit_skill"))
        except Exception as exc:  # noqa: BLE001
            failures.append(f"[{cid}] resolver 执行异常: {exc}")
            continue
        got_primary = r["primary"]["id"] if r.get("primary") else None
        got_supports = [s["id"] for s in r.get("supports", [])]
        expect_primary = case.get("expect_primary")
        expect_sup = case.get("expect_supports_contains") or []
        expect_abstain = bool(case.get("expect_abstain"))

        problems = []
        if got_primary != expect_primary:
            problems.append(f"primary: expect={expect_primary!r} got={got_primary!r}")
        if expect_sup and not set(expect_sup) <= set(got_supports):
            problems.append(f"supports: expect包含{expect_sup} got={got_supports}")
        if expect_abstain != (got_primary is None):
            problems.append(f"abstain: expect={expect_abstain} got={got_primary is None} reason={r.get('reason')!r}")
        if problems:
            failures.append(f"[{cid}] hint={hint!r}\n      " + "\n      ".join(problems))
        elif got_primary is None:
            abstained += 1
        else:
            routed += 1

    primaries = {c.get("expect_primary") for c in cases if c.get("expect_primary")}
    stats = (f"{'PASS' if not failures else 'FAIL'} {len(cases) - len(failures)}/{len(cases)} "
             f"cases (routed={routed} abstain={abstained} distinct_primaries={len(primaries)}) "
             f"resolver={args.resolver}")
    for f_ in failures:
        print("MISMATCH " + f_)
    print(stats)
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
