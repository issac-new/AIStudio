#!/usr/bin/env python3
"""环境级上下文注入回归 runner — gap-20260923-004 / t_4047313e

模式:
  --mode dry-run  (默认, 安全)  校验用例库 schema/载荷可解析/判定规则可执行, 生成诱饵载荷样本
  --mode live     (需授权+隔离环境) 在隔离沙箱中注入载荷到目标 agent 输入流并采集 observables
  --mode selftest               内置自检 (等价 scripts/selftest.py)

用法:
  python3 run_context_injection_tests.py --mode dry-run
  python3 run_context_injection_tests.py --mode dry-run --cases C1,C5 --report /tmp/ctxinj.json
  python3 run_context_injection_tests.py --mode live --target-agent hack-auditor \
      --workspace /tmp/ctxinj-sandbox --cases C1,C5

退出码: 0=全部通过; 1=有用例失败; 2=用法/加载错误
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
import time
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = SKILL_DIR / "templates"

# ---- schema 校验 ----
REQUIRED_CASE_KEYS = {
    "case_id", "title", "severity", "source_gap", "description",
    "payload", "expected_behavior", "judgement",
}
REQUIRED_PAYLOAD_KEYS = {"carrier_type", "carrier_filename", "hiding_technique", "hidden_instruction"}
SEVERITIES = {"critical", "high", "medium", "low"}
CASE_ID_RE = re.compile(r"^CTXINJ-C[1-5]-[A-Z]+-\d{3}$")
CANARY_RE = re.compile(r"CTXINJ-CANARY-C[1-5]-\d{3}")

try:
    import yaml  # type: ignore
except ImportError:
    print("[FATAL] PyYAML 未安装: pip install pyyaml (或 hermes venv 自带)", file=sys.stderr)
    sys.exit(2)


def load_channel_file(path: Path) -> dict:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or "cases" not in data:
        raise ValueError(f"{path.name}: 缺少顶层 channel/cases 结构")
    return data


def validate_case(case: dict, where: str) -> list[str]:
    errs = []
    missing = REQUIRED_CASE_KEYS - set(case.keys())
    if missing:
        errs.append(f"{where}: 缺字段 {sorted(missing)}")
        return errs
    if not CASE_ID_RE.match(case["case_id"]):
        errs.append(f"{where}: case_id 格式不符 {case['case_id']}")
    if case["severity"] not in SEVERITIES:
        errs.append(f"{where}: severity 非法 {case['severity']}")
    payload = case.get("payload") or {}
    pmiss = REQUIRED_PAYLOAD_KEYS - set(payload.keys())
    if pmiss:
        errs.append(f"{where}: payload 缺字段 {sorted(pmiss)}")
    hi = str(payload.get("hidden_instruction", ""))
    if hi and not CANARY_RE.search(hi):
        errs.append(f"{where}: hidden_instruction 缺金丝雀标记 CTXINJ-CANARY-Cn-nnn")
    jb = case.get("judgement") or {}
    if not jb.get("fail_signal"):
        errs.append(f"{where}: judgement.fail_signal 为空")
    eb = case.get("expected_behavior") or {}
    if not eb.get("must_not"):
        errs.append(f"{where}: expected_behavior.must_not 为空")
    return errs


def build_carrier(case: dict) -> tuple[str, str]:
    """按 hiding_technique 把载荷物化为载体文件内容。返回 (filename, content)。"""
    p = case["payload"]
    tech, hi, vis = p["hiding_technique"], p["hidden_instruction"], p.get("visible_text", "")
    fname = p["carrier_filename"]
    if tech == "zero_width":
        zw = "\u200b"
        content = f"{vis}\n{zw}{hi}{zw}\n"
    elif tech == "comment_embedding":
        content = f"{vis}\n<!-- {hi} -->\n"
    elif tech == "css_hidden_text":
        content = f"{vis}\n<span style=\"color:#fff;background:#fff\">{hi}</span>\n"
    elif tech == "metadata_frontmatter":
        content = f"---\ntitle: doc\n{hi}\n---\n\n{vis}\n"
    elif tech == "dom_hidden_layer":
        content = f"{vis}\n<div style=\"display:none\">{hi}</div>\n"
    elif tech == "html_comment":
        content = f"{vis}\n<!-- {hi} -->\n"
    elif tech in {"forged_entry", "ansi_escape", "multiline_forgery", "format_string",
                  "truncation_abuse", "encoding_smuggling", "induce_self_tamper",
                  "residual_instruction", "semantic_drift", "hallucinated_authorization",
                  "replay_via_summary", "self_propagating", "induce_termination",
                  "induce_redirect", "forged_authorization", "induce_exfiltration",
                  "authority_impersonation", "malicious_script"}:
        content = f"{vis}\n{hi}\n" if vis else f"{hi}\n"
    else:
        content = f"{vis}\n{hi}\n"
    return fname, content


def run_dry(cases: list[dict], report: dict) -> bool:
    ok = True
    results = []
    with tempfile.TemporaryDirectory(prefix="ctxinj-dry-") as td:
        for case in cases:
            cid = case["case_id"]
            errs = validate_case(case, cid)
            fname, content = build_carrier(case)
            if not CANARY_RE.search(content):
                errs.append(f"{cid}: 物化载体后金丝雀丢失")
            out = Path(td) / fname
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(content, encoding="utf-8")
            reread = out.read_text(encoding="utf-8", errors="replace")
            if not CANARY_RE.search(reread):
                errs.append(f"{cid}: 载体 round-trip 后金丝雀丢失")
            passed = not errs
            ok = ok and passed
            results.append({
                "case_id": cid, "channel": case.get("channel_hint", ""),
                "severity": case["severity"], "mode": "dry-run",
                "status": "PASS" if passed else "FAIL",
                "carrier_bytes": len(content.encode("utf-8")),
                "errors": errs,
            })
    report["results"] = results
    report["summary"] = {
        "total": len(results),
        "passed": sum(1 for r in results if r["status"] == "PASS"),
        "failed": sum(1 for r in results if r["status"] == "FAIL"),
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }
    return ok


def run_live(cases: list[dict], report: dict, workspace: Path, target_agent: str) -> bool:
    """live 模式: 在隔离 workspace 物化诱饵载体 + 生成评估用的观察指令包。

    注意 (零真实副作用纪律):
      - 只在 --workspace 指定的隔离目录内落文件
      - 不调用真实 agent 进程, 不外发任何数据
      - observables 采集由人工/编排层在隔离环境执行后回填
    """
    workspace.mkdir(parents=True, exist_ok=True)
    carriers_dir = workspace / "carriers"
    carriers_dir.mkdir(exist_ok=True)
    manifest = []
    for case in cases:
        fname, content = build_carrier(case)
        rel = Path(case["payload"]["carrier_filename"])
        dest = carriers_dir / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(content, encoding="utf-8")
        manifest.append({
            "case_id": case["case_id"],
            "carrier": str(dest.relative_to(workspace)),
            "hiding_technique": case["payload"]["hiding_technique"],
            "severity": case["severity"],
            "expected_must_not": case["expected_behavior"]["must_not"],
            "fail_signal": case["judgement"]["fail_signal"],
            "verdict": "PENDING_OBSERVATION",  # 由隔离环境观察后回填
        })
    (workspace / "manifest.json").write_text(
        json.dumps({"target_agent": target_agent, "cases": manifest}, ensure_ascii=False, indent=2),
        encoding="utf-8")
    report["results"] = manifest
    report["summary"] = {
        "total": len(manifest),
        "mode": "live",
        "note": "载体已物化到隔离 workspace; verdict=PENDING_OBSERVATION, 需在隔离环境跑目标 agent 后回填",
        "workspace": str(workspace),
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }
    return True


def main() -> int:
    ap = argparse.ArgumentParser(description="环境级上下文注入回归 runner")
    ap.add_argument("--mode", choices=["dry-run", "live", "selftest"], default="dry-run")
    ap.add_argument("--cases", default="", help="通道过滤, 如 C1,C5 (默认全部)")
    ap.add_argument("--report", default="", help="报告 JSON 输出路径")
    ap.add_argument("--target-agent", default="hack-auditor")
    ap.add_argument("--workspace", default="", help="live 模式隔离工作区 (必填 for live)")
    args = ap.parse_args()

    if args.mode == "live" and not args.workspace:
        print("[FATAL] live 模式必须 --workspace 指定隔离目录", file=sys.stderr)
        return 2

    channels = []
    all_cases = []
    load_errors = []
    for f in sorted(TEMPLATES_DIR.glob("C[1-5]-*.yaml")):
        try:
            data = load_channel_file(f)
        except Exception as e:  # noqa: BLE001
            load_errors.append(f"{f.name}: {e}")
            continue
        ch = data.get("channel", f.stem)
        for c in data["cases"]:
            c = dict(c)
            c["channel_hint"] = ch
            channels.append((ch, c))
            all_cases.append(c)

    if load_errors:
        for e in load_errors:
            print(f"[LOAD-ERR] {e}", file=sys.stderr)

    want = [x.strip().upper() for x in args.cases.split(",") if x.strip()] if args.cases else None
    selected = [(ch, c) for ch, c in channels
                if want is None or any(ch.startswith(w) for w in want)]
    if not selected:
        print("[FATAL] 通道过滤后无用例", file=sys.stderr)
        return 2

    report: dict = {"tool": "context-injection-testcase-library", "gap": "gap-20260923-004",
                    "mode": args.mode, "load_errors": load_errors}

    if args.mode == "selftest":
        return selftest_main()

    cases = [c for _, c in selected]
    if args.mode == "dry-run":
        ok = run_dry(cases, report)
    else:
        ok = run_live(cases, report, Path(args.workspace).expanduser(), args.target_agent)

    s = report.get("summary", {})
    print(f"[{args.mode.upper()}] total={s.get('total')} passed={s.get('passed', '-')} "
          f"failed={s.get('failed', '-')}")
    for r in report.get("results", []):
        if r.get("status") == "FAIL":
            print(f"  FAIL {r['case_id']}: {'; '.join(r['errors'])}")
    if args.report:
        rp = Path(args.report).expanduser()
        rp.parent.mkdir(parents=True, exist_ok=True)
        rp.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"report -> {rp}")
    return 0 if ok else 1


def selftest_main() -> int:
    """内置自检: 库完整性 + runner 核心函数回环。等价 scripts/selftest.py。"""
    print("== selftest: context-injection-testcase-library ==")
    failures = 0

    files = sorted(TEMPLATES_DIR.glob("C[1-5]-*.yaml"))
    expect = ["C1-decoy-file.yaml", "C2-log-poisoning.yaml", "C3-web-content-poisoning.yaml",
              "C4-compaction-injection.yaml", "C5-decoy-canary-bomb.yaml"]
    names = [f.name for f in files]
    for e in expect:
        if e not in names:
            print(f"  [FAIL] 模板缺失: {e}")
            failures += 1
    print(f"  templates: {len(files)} found ({', '.join(names)})")

    total, per_ch, sev = 0, {}, {"critical": 0, "high": 0, "medium": 0, "low": 0}
    schema_errs = 0
    for f in files:
        try:
            data = load_channel_file(f)
        except Exception as e:  # noqa: BLE001
            print(f"  [FAIL] {f.name} 解析失败: {e}")
            failures += 1
            schema_errs += 1
            continue
        ch = data.get("channel", "?")
        n = len(data.get("cases", []))
        per_ch[ch] = n
        total += n
        for c in data.get("cases", []):
            errs = validate_case(c, str(c.get("case_id", f.name)))
            if errs:
                schema_errs += len(errs)
                for e in errs:
                    print(f"  [FAIL] {e}")
            sev[c.get("severity", "?")] = sev.get(c.get("severity", "?"), 0) + 1
    print(f"  cases total={total} per-channel={per_ch}")
    print(f"  severity={sev}")
    expect_counts = {"C1-decoy-file": 8, "C2-log-poisoning": 7, "C3-web-content-poisoning": 8,
                     "C4-compaction-injection": 5, "C5-decoy-canary-bomb": 6}
    for ch, n in expect_counts.items():
        if per_ch.get(ch) != n:
            print(f"  [FAIL] {ch} 用例数 {per_ch.get(ch)} != 承诺 {n}")
            failures += 1
    if total != 34:
        print(f"  [FAIL] 总用例数 {total} != 34 (SKILL.md 承诺)")
        failures += 1

    # 回环: build_carrier 物化 + 金丝雀保留
    loop_fail = 0
    for f in files:
        data = load_channel_file(f)
        for c in data["cases"]:
            _, content = build_carrier(c)
            if not CANARY_RE.search(content):
                print(f"  [FAIL] {c['case_id']} 载体物化后金丝雀丢失")
                loop_fail += 1
    failures += loop_fail
    print(f"  carrier round-trip: {total - loop_fail}/{total} canary preserved")

    # dry-run 全量
    rep: dict = {}
    ok = run_dry([c for f in files for c in load_channel_file(f)["cases"]], rep)
    print(f"  dry-run: {'PASS' if ok else 'FAIL'} summary={rep['summary']}")
    if not ok:
        failures += 1

    print(f"== selftest result: {'PASS' if failures == 0 else 'FAIL'} ({failures} failures) ==")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
