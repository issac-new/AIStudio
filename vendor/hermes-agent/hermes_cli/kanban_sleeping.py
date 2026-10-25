"""Sleeping-workers probe (PR-3 minimal face, V8.29 governance round).

run14/run19/run20 root cause: after ``Turn ended`` a room mention only triggers
reaction pseudo-activity — real-work detection existed only in the simulation
harness (mx-hb/_realwork_ts). This module moves the probe INTO the product so
the harness compensation (sleep-wakeup) can retire. Read-only: it never wakes
anyone; waking stays with the existing ``gateway.wake`` path and its ownership
checks.

Real-work line = last ``tool <name> completed`` or ``API call #<n>`` line in
the profile agent.log — the same evidence the harness used (2026-10-15).
"""

from __future__ import annotations

import os
import re
import time
from pathlib import Path

_REALWORK_RE = re.compile(r"tool [a-z_]+ completed|API call #[2-9][0-9]* ")


def _profile_root() -> Path:
    root = os.environ.get("HERMES_HOME") or os.path.expanduser("~/.hermes/hermes-agent")
    return Path(root) / "profiles"


def _last_realwork_ts(profile: str) -> float:
    log = _profile_root() / profile / "logs" / "agent.log"
    if not log.is_file():
        return 0.0
    last = ""
    try:
        with log.open("r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                if _REALWORK_RE.search(line):
                    last = line
    except Exception:
        return 0.0
    if not last:
        return 0.0
    try:
        import datetime as _dt
        ts = _dt.datetime.strptime(last[:19], "%Y-%m-%d %H:%M:%S")
        return ts.timestamp()
    except Exception:
        return 0.0


def sleeping_workers(running_tasks: list[dict], *, idle_sec: int = 1800) -> list[dict]:
    """Given running kanban tasks (``[{"id","assignee",...}]``), return the subset whose
    assignee profile shows no real work for ``idle_sec`` (default 30min). One row per
    assignee: ``{"assignee", "idle_sec", "cards", "last_realwork_ts"}``. Profiles whose
    log is absent/unreadable report ``last_realwork_ts=None`` with ``"unknown": True``
    — never silently dropped."""
    now = time.time()
    by_assignee: dict[str, list[str]] = {}
    for t in running_tasks or []:
        who = (t.get("assignee") or "").strip()
        if who:
            by_assignee.setdefault(who, []).append(str(t.get("id") or "?"))
    out: list[dict] = []
    for who, cards in by_assignee.items():
        lw = _last_realwork_ts(who)
        if lw <= 0:
            out.append({"assignee": who, "cards": cards, "idle_sec": None,
                        "last_realwork_ts": None, "unknown": True})
            continue
        idle = now - lw
        if idle >= idle_sec:
            out.append({"assignee": who, "cards": cards, "idle_sec": round(idle),
                        "last_realwork_ts": lw, "unknown": False})
    return out
