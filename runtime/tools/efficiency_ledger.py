"""Efficiency ledger — SoL-Pi-style JSONL audit trail for harness-efficiency mechanisms.

Every ObservationPack archive / ``obs_recall`` page / Action-Fusion ``then_run`` /
Evidence-Preserving-Reducer decision appends one JSON line here. Two consumers:

* the SwarmStudio efficiency panel (overlay server reads ``<home>/efficiency/ledger.jsonl``);
* post-hoc auditing — SoL-Pi keeps its ledger OUTSIDE the model's context so token
  savings never cost audit fidelity (the paper's "full-fidelity audit trail outside
  model input" governance rule).

Design constraints:
* NEVER raises, NEVER blocks: a telemetry write may not break a tool call. Every
  failure is a ``logger.debug``.
* One line per event, ``ensure_ascii=False``, atomic single ``write()`` of the full
  line (appends below the pipe buffer are effectively indivisible for line readers).
* Home follows ``get_hermes_home()`` (profile overrides / multiplexing respected).
"""

import json
import logging
import threading
import time
from pathlib import Path

logger = logging.getLogger(__name__)

LEDGER_SUBDIR = "efficiency"
LEDGER_FILENAME = "ledger.jsonl"
# Hard ceiling per event body: a receipt or command output pasted into an event must
# not turn the ledger itself into the unbounded artifact it exists to prevent.
_MAX_EVENT_CHARS = 4000

_ledger_lock = threading.Lock()


def ledger_path() -> Path:
    """``<hermes home>/efficiency/ledger.jsonl`` (parent not created here)."""
    from hermes_constants import get_hermes_home
    return Path(get_hermes_home()) / LEDGER_SUBDIR / LEDGER_FILENAME


def _bounded(value, _depth: int = 0):
    """Recursively bound every string in an event body to ``_MAX_EVENT_CHARS``."""
    if _depth > 4:
        return "…"
    if isinstance(value, str):
        return value if len(value) <= _MAX_EVENT_CHARS else value[:_MAX_EVENT_CHARS] + "…[bounded]"
    if isinstance(value, dict):
        return {str(k): _bounded(v, _depth + 1) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_bounded(v, _depth + 1) for v in value]
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return str(value)


def record_efficiency_event(kind: str, **fields) -> bool:
    """Append one event line; returns True on success. Best-effort, never raises.

    ``kind`` is one of ``observation_archive | obs_recall | action_fusion |
    evidence_reduce``. Callers pass ``session_id``/``tool`` plus mechanism-specific
    counters; everything is bounded by :func:`_bounded`.
    """
    event = {"ts": round(time.time(), 3), "kind": kind}
    event.update(_bounded(fields))
    try:
        line = json.dumps(event, ensure_ascii=False)
    except (TypeError, ValueError):
        return False
    try:
        path = ledger_path()
        with _ledger_lock:
            path.parent.mkdir(parents=True, exist_ok=True)
            with open(path, "a", encoding="utf-8") as fh:
                fh.write(line + "\n")
        return True
    except Exception as exc:  # noqa: BLE001 — telemetry must never break the tool path
        logger.debug("efficiency ledger write failed: %s", exc)
        return False
