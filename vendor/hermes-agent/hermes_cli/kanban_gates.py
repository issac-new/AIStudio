"""Declarative column gates for kanban transitions (absorbed from routa four-piece set).

Origin: upstream/routa ``src/core/models/kanban.ts:109-127`` +
``src/core/kanban/transition-gates.ts`` (see docs/upstream-analysis/routa.md
absorption table #4, first batch #8). routa enforces per-column automation
gates server-side on task PATCH; this module ports the four knobs onto the
hermes kanban state machine:

- ``requiredHumanApproval``: the card's own text (title + body) must carry an
  explicit ``APPROVED`` verdict (routa semantics: the ruling lives in the task
  text — approval is a human artifact, not a UI toggle).
- ``requiredChecklist``: every ``- [ ]`` checkbox in the body must be checked
  (``- [x]``); a body with no checklist at all also fails (nothing was verified).
- ``validatorCommand``: the transition's evidence text (result/summary where
  the transition carries one) must contain the configured command, proving the
  named verification actually ran.
- ``gateMode``: ``blocking`` refuses the transition (reason code below),
  ``warning`` records a ``gate_warning`` event and lets it through.

Gate config lives beside the board's DB file — ``gates.json`` in the same
directory (default board: ``<kanban_home>/gates.json`` next to ``kanban.db``;
named board: ``<boards_root>/<slug>/gates.json`` next to its ``kanban.db``;
the DB location from PRAGMA database_list is the authority), mapping target
status to its gate block. Absent file / absent status = ungated (opt-in, never
a default lockdown). Reason codes are frozen vocabulary: UI localizes by
literal.

Cross-vocab note: these are *gate* reasons (column-transition adjudication),
distinct from the engine-channel dispatch reasons in
overlay ``custom/server/zcode/dispatch-reasons.ts`` — different surfaces, each
with its own single source of truth.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Optional

GATE_REASONS = ("approval_required", "checklist_incomplete", "validator_failed")
"""Frozen gate rejection vocabulary (UI localizes by literal value)."""

APPROVAL_MARKER = "APPROVED"
_CHECKBOX_UNCHECKED = re.compile(r"^\s*[-*]\s+\[ \]", re.MULTILINE)
_CHECKBOX_ANY = re.compile(r"^\s*[-*]\s+\[[ xX]\]", re.MULTILINE)


class GateBlockedError(RuntimeError):
    """A blocking gate refused the transition; ``results`` carries the evidence."""

    def __init__(self, results: list[dict[str, Any]], to_status: str,
                 payload: Optional[dict[str, Any]] = None):
        self.results = results
        self.to_status = to_status
        # 拒绝事件的现成载荷：record=False 纯校验后由调用点决定是否留在事务外。
        self.payload = payload or {"to": to_status, "results": results}
        reasons = ", ".join(r["reason"] for r in results if not r["ok"])
        super().__init__(f"column gate blocked transition to {to_status!r}: {reasons}")


def _gates_file_for_conn(conn: Any) -> Optional[Path]:
    """Resolve gates.json beside the task DB (each board owns its DB file:
    ``<kanban>/kanban.db`` for default, ``<boards_root>/<slug>/board.db`` for
    named boards — PRAGMA database_list is the authority, no board column on
    tasks by design)."""
    try:
        rows = conn.execute("PRAGMA database_list").fetchall()
        main = next((r for r in rows if r["name"] == "main"), None)
        if main is None or not main["file"]:
            return None
        return Path(main["file"]).parent / "gates.json"
    except Exception:
        return None


def load_board_gates(conn_or_home: Any = None) -> dict[str, dict[str, Any]]:
    """Parse the task DB's ``gates.json``; unreadable/invalid file yields no
    gates (fail-open, matching the opt-in contract: a broken config must not
    brick the board). Accepts either a live connection (preferred — derives the
    board from the DB location) or a ``kanban_home`` path (tests)."""
    if hasattr(conn_or_home, "execute"):
        path = _gates_file_for_conn(conn_or_home)
    else:
        path = Path(conn_or_home) / "kanban" / "gates.json"
    if path is None or not path.is_file():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    if not isinstance(raw, dict):
        return {}
    return {str(k): v for k, v in raw.items() if isinstance(v, dict)}


def evaluate_gates(
    *, title: str, body: str, evidence: Optional[str], gates: dict[str, Any]
) -> list[dict[str, Any]]:
    """Evaluate one status's gate block in routa order (approval → checklist →
    validator). Returns one result per configured gate (``ok`` + ``reason``)."""
    results: list[dict[str, Any]] = []
    text = f"{title}\n{body or ''}"
    if gates.get("requiredHumanApproval"):
        ok = APPROVAL_MARKER in text
        results.append({"gate": "requiredHumanApproval", "ok": ok,
                        **({} if ok else {"reason": "approval_required",
                                           "detail": f"task text lacks {APPROVAL_MARKER} verdict"})})
    if gates.get("requiredChecklist"):
        unchecked = bool(_CHECKBOX_UNCHECKED.search(body or ""))
        any_box = bool(_CHECKBOX_ANY.search(body or ""))
        ok = (not unchecked) and any_box
        results.append({"gate": "requiredChecklist", "ok": ok,
                        **({} if ok else {"reason": "checklist_incomplete",
                                           "detail": "body has unchecked '- [ ]' items (or no checklist at all)"})})
    validator = gates.get("validatorCommand")
    if validator:
        ok = bool(evidence) and str(validator) in evidence
        results.append({"gate": "validatorCommand", "ok": ok,
                        **({} if ok else {"reason": "validator_failed",
                                           "detail": f"evidence does not contain {validator!r}"})})
    return results


def _eval_gates(
    conn: Any, task_id: str, to_status: str, *, evidence: Optional[str], actor: Optional[str],
) -> Optional[tuple[str, list[dict[str, Any]], dict[str, Any]]]:
    """门评估共用芯：``(mode, results, event_payload)``；任务不存在/该列未配门返回 None。"""
    from hermes_cli.kanban_db import get_task

    task = get_task(conn, task_id)
    if task is None:
        return None
    gates = load_board_gates(conn).get(to_status)
    if not gates:
        return None
    mode = gates.get("gateMode", "blocking")
    results = evaluate_gates(
        title=getattr(task, "title", "") or "",
        body=getattr(task, "body", "") or "",
        evidence=evidence,
        gates=gates,
    )
    payload: dict[str, Any] = {"to": to_status, "mode": mode, "results": results}
    if actor:
        payload["actor"] = actor
    return mode, results, payload


def enforce_column_gates(
    conn: Any, task_id: str, to_status: str, *, evidence: Optional[str] = None,
    actor: Optional[str] = None, record: bool = True,
) -> list[dict[str, Any]]:
    """Gate a transition into ``to_status`` (wired at complete/review/promote).

    Appends a ``column_transition`` event on pass (from/to + gate results — the
    COLUMN_TRANSITION piece of the routa coordination bus) or a ``gate_blocked``
    / per-gate ``gate_warning`` event on refusal. Raises :class:`GateBlockedError`
    for a blocking refusal; returns the gate results otherwise (``[]`` = the
    status is ungated).

    ``record=False`` 是纯校验：一个事件都不写（``dry_run`` 只校验，绝不把校验写成
    永久审计）。流转接线见 :func:`gate_transition`：拒绝/告警事件留在事务外，通过
    事件 ``column_transition`` 由 write_txn 内补记，与状态 UPDATE 同一提交。"""
    from hermes_cli.kanban_db import _append_event

    ev = _eval_gates(conn, task_id, to_status, evidence=evidence, actor=actor)
    if ev is None:
        return []
    mode, results, payload = ev
    failures = [r for r in results if not r["ok"]]
    if failures and mode == "blocking":
        if record:
            _append_event(conn, task_id, "gate_blocked", payload)
        raise GateBlockedError(failures, to_status, payload=payload)
    if failures:
        # warning: the transition proceeds, but the miss is auditable.
        if record:
            _append_event(conn, task_id, "gate_warning", payload)
        return results
    if record:
        _append_event(conn, task_id, "column_transition", payload)
    return results


def gate_transition(
    conn: Any, task_id: str, to_status: str, *, evidence: Optional[str] = None,
    actor: Optional[str] = None, dry_run: bool = False,
) -> tuple[list[dict[str, Any]], Optional[dict[str, Any]]]:
    """kanban_db 流转接线（complete/review/promote 共用）：门校验 + 事件编排。

    事件语义：``gate_blocked``（拒绝）/``gate_warning``（告警）留在事务外落盘，不因
    后续回滚消失；``column_transition``（通过）不在这里落——返回其 payload，由调用点
    在 ``write_txn`` 内与状态 UPDATE 一起 ``_append_event(conn, task_id,
    "column_transition", payload)`` 补记（同一提交：流转不成事件就不落，校验通过
    ≠ 已流转）。``dry_run=True`` 纯校验：任何事件都不落、不返回 payload。
    返回 ``(gate_results, column_transition_payload)``。"""
    from hermes_cli.kanban_db import _append_event

    ev = _eval_gates(conn, task_id, to_status, evidence=evidence, actor=actor)
    if ev is None:
        return [], None
    mode, results, payload = ev
    failures = [r for r in results if not r["ok"]]
    if failures and mode == "blocking":
        if not dry_run:
            _append_event(conn, task_id, "gate_blocked", payload)
        raise GateBlockedError(failures, to_status, payload=payload)
    if failures:
        if not dry_run:
            _append_event(conn, task_id, "gate_warning", payload)
        return results, None
    return results, (None if dry_run else payload)
