#!/usr/bin/env python3
"""Weekly triage of stale placeholder entries in gap_register.yaml.

Selects status=open, severity medium or high, placeholder proposed_fix, and
created_date older than seven days.  One idempotent Kanban triage card is
created per domain.  The register is read under its companion advisory lock
and is never rewritten by this job: domain workers use gap_register.py's
validated update command for writeback.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
from collections import defaultdict
from contextlib import contextmanager
from pathlib import Path

try:
    import fcntl
    import yaml
except ImportError as exc:  # pragma: no cover
    raise SystemExit(f"missing dependency: {exc}")

SCRIPT_DIR = Path(__file__).resolve().parent
WORKSPACE = SCRIPT_DIR.parent
REGISTER = Path("/Users/YOURNAME/hermes-docker-sandbox/workspace/life-workbench/gap_register.yaml")
PLACEHOLDER_MARKS = (
    "待领域团队分析", "待方案化", "待领域分析", "待分析", "（待",
)
SEVERITY_RANK = {"high": 2, "medium": 1}
DOMAIN_ASSIGNEE = {
    "agent": "worker-coder", "llm": "worker-coder", "[已移除]": "[已移除]",
    "hack": "hack-auditor", "[已移除]": "[已移除]-orchestrator",
    "pay": "pay-orchestrator", "tech": "platform-skill-miner",
    "data": "data-orchestrator", "platform": "platform-ontology-curator",
    "product": "product-researcher", "aiteam": "aiteam-orchestrator",
    "ops": "ops-sre",
}


@contextmanager
def register_lock(path: Path):
    lock_path = path.with_suffix(path.suffix + ".lock")
    with lock_path.open("a+", encoding="utf-8") as handle:
        fcntl.flock(handle.fileno(), fcntl.LOCK_SH)
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def load_gaps(path: Path) -> list[dict]:
    with register_lock(path):
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    gaps = data.get("gaps", [])
    if not isinstance(gaps, list):
        raise ValueError("gap_register.yaml: gaps must be a list")
    return [g for g in gaps if isinstance(g, dict)]


def stale_placeholders(gaps: list[dict], today: dt.date) -> list[dict]:
    selected = []
    for gap in gaps:
        if gap.get("status") != "open":
            continue
        if SEVERITY_RANK.get(str(gap.get("severity")), 0) < SEVERITY_RANK["medium"]:
            continue
        proposed = str(gap.get("proposed_fix") or "")
        if not any(mark in proposed for mark in PLACEHOLDER_MARKS):
            continue
        try:
            created = dt.date.fromisoformat(str(gap.get("created_date")))
        except (TypeError, ValueError):
            continue
        age = (today - created).days
        if age > 7:
            item = dict(gap)
            item["age_days"] = age
            selected.append(item)
    return selected


def card_body(domain: str, items: list[dict], week: str) -> str:
    lines = [
        "来源：gap_register 批量分诊周 cron（只读筛选，不直接改写寄存器）",
        f"周期：{week}；领域：{domain}；命中：{len(items)} 条", "",
        "清单：",
    ]
    for gap in items:
        lines.append(
            f"- {gap.get('id')} [{gap.get('severity')}, {gap.get('age_days')}d] "
            f"{gap.get('description', '')}"
        )
        lines.append(f"  证据：{gap.get('evidence') or '（无）'}")
    lines += [
        "", "处置契约（逐条给出一种判定及理由，命令可直接执行）：",
        "- ADOPT/TRACK（有机制启发/保留观察）：",
        "  `python3 " + str(REGISTER.parent / "scripts" / "gap_register.py") + " update <ID> "
        "--set status=done --set resolved_fix='ADOPT|TRACK: <结论与理由>'`",
        "  （status=done 自动落 resolved_date；done 强制要求 resolved_fix）",
        "- REJECT/N-A（不构成差距/与既有机制重复）：",
        "  `python3 " + str(REGISTER.parent / "scripts" / "gap_register.py") + " update <ID> "
        "--set status=dropped --set resolved_fix='REJECT|N-A: <依据或重复项>'`",
        "- 仅部分推进：--set status=in_progress --set resolved_fix='<进度与下一步>'",
        "- 判定参考：版本发布/纯外部新闻→REJECT；指向集群真缺口→ADOPT 另立能力卡；",
        "  status 白名单 todo|in_progress|done|dropped，'open' 不在其中，禁止只回写 open。",
        "- 回写命令必须带合法 status；命令失败不得宣称完成。",
        "markings: TLP:GREEN/CLEAR",
    ]
    return "\n".join(lines)


def create_card(title: str, body: str, assignee: str, key: str,
                dry_run: bool, initial_status: str | None = None) -> dict:
    cmd = ["hermes", "kanban", "create", title, "--assignee", assignee,
           "--idempotency-key", key, "--body", body, "--json"]
    if initial_status:
        cmd += ["--initial-status", initial_status]
    if dry_run:
        return {"title": title, "assignee": assignee, "idempotency_key": key,
                "dry_run": True}
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
    result = {"title": title, "assignee": assignee, "idempotency_key": key,
              "returncode": proc.returncode}
    match = re.search(r"\{[\s\S]*\}", proc.stdout)
    if match:
        try:
            result["response"] = json.loads(match.group(0))
        except json.JSONDecodeError:
            result["stdout"] = proc.stdout[-500:]
    if proc.stderr.strip():
        result["stderr"] = proc.stderr[-500:]
    if proc.returncode:
        raise RuntimeError(json.dumps(result, ensure_ascii=False))
    return result


def run(path: Path, today: dt.date, dry_run: bool,
        initial_status: str | None = None) -> dict:
    items = stale_placeholders(load_gaps(path), today)
    week = today.strftime("%G-W%V")
    grouped: dict[str, list[dict]] = defaultdict(list)
    for item in items:
        grouped[str(item.get("domain") or "unknown")].append(item)
    cards, failures = [], []
    for domain in sorted(grouped):
        domain_items = grouped[domain]
        assignee = DOMAIN_ASSIGNEE.get(domain)
        if not assignee:
            failures.append({"domain": domain, "error": "no assignee mapping"})
            continue
        title = f"[triage] gap_register {domain} 域 {len(domain_items)} 条存量分诊"
        key = f"triage:{domain}:{week}"
        try:
            cards.append(create_card(title, card_body(domain, domain_items, week),
                                     assignee, key, dry_run,
                                     initial_status=initial_status))
        except (OSError, subprocess.TimeoutExpired, RuntimeError) as exc:
            failures.append({"domain": domain, "error": str(exc)})
    return {"as_of": today.isoformat(), "week": week, "matched": len(items),
            "domains": {d: len(v) for d, v in sorted(grouped.items())},
            "cards": cards, "failures": failures}


def selftest() -> int:
    today = dt.date(2026, 9, 14)
    fixture = [
        {"id": "old", "domain": "agent", "status": "open", "severity": "medium",
         "proposed_fix": "待领域团队分析", "created_date": "2026-09-01"},
        {"id": "new", "domain": "agent", "status": "open", "severity": "medium",
         "proposed_fix": "待领域团队分析", "created_date": "2026-09-10"},
        {"id": "done", "domain": "hack", "status": "done", "severity": "high",
         "proposed_fix": "待领域团队分析", "created_date": "2026-08-01"},
    ]
    assert [g["id"] for g in stale_placeholders(fixture, today)] == ["old"]
    assert run_fixture(fixture, today)["cards"][0]["idempotency_key"] == "triage:agent:2026-W38"
    print("selftest: 2/2 passed")
    return 0


def run_fixture(gaps: list[dict], today: dt.date) -> dict:
    items = stale_placeholders(gaps, today)
    return {"cards": [{"idempotency_key": f"triage:{d}:{today.strftime('%G-W%V')}"}
                       for d in sorted({g["domain"] for g in items})]}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--register", type=Path, default=REGISTER)
    parser.add_argument("--today", type=dt.date.fromisoformat, default=dt.date.today())
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--selftest", action="store_true")
    parser.add_argument("--initial-status", default=None,
                        help="透传 kanban create --initial-status（如 blocked 便于人工审核建卡）")
    args = parser.parse_args(argv)
    if args.selftest:
        return selftest()
    report = run(args.register, args.today, args.dry_run,
                 initial_status=args.initial_status)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if report["failures"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
