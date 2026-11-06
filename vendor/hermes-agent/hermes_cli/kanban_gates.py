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
    # overlay[ontology]（本体轮四阶段路线二）：执行式校验器——validatorExec 真跑
    # studio 本体结卡校验（单任务增量摄取+校验，REST 毫秒级），rc!=0 = 数据契约
    # 违规。工具缺席（studio 后端未起/超时）= 放行 + detail 注明——工具故障不是
    # 数据违规，fail-open 不拦卡。与 validatorCommand（证据字面量门）互补：
    # 字面量门约束"结卡证据要写校验结果"，本门保证"校验真的跑过且通过"。
    if gates.get("validatorExec"):
        results.append(_run_ontology_validator(conn, task_id))
    payload: dict[str, Any] = {"to": to_status, "mode": mode, "results": results}
    if actor:
        payload["actor"] = actor
    return mode, results, payload


def _board_slug_for_validator(conn: Any) -> str:
    """从 DB 实路径推板 slug（与 _gates_file_for_conn 同源逻辑：PRAGMA 权威）。"""
    try:
        rows = conn.execute("PRAGMA database_list").fetchall()
        main = next((r for r in rows if r["name"] == "main"), None)
        if main is None or not main["file"]:
            return "main"
        path = str(main["file"]).replace("\\", "/")
        m = re.search(r"/boards/([^/]+)/kanban\.db$", path)
        return m.group(1) if m else "main"
    except Exception:
        return "main"


def _run_ontology_validator(conn: Any, task_id: str) -> dict[str, Any]:
    """validatorExec 门执行体：POST studio agent 桥（公开段，限回环）。

    走 /api/ontology/agent-bridge/validate-task（cron-bridge 同款公开段通道——
    鉴权段端点对 agent 侧无凭据恒 401，只能 fail-open 形同虚设）。token 经
    ONTOLOGY_BRIDGE_TOKEN（与 studio 同名 env；studio 侧设了才需要）。fail-open：
    连接失败/超时（默认 5s）不判违规——工具缺席放行并留痕。
    """
    import json as _json
    import os
    import urllib.request

    base = os.environ.get("HERMES_STUDIO_ONTOLOGY_URL", "http://127.0.0.1:8647").rstrip("/")
    board = _board_slug_for_validator(conn)
    headers = {"Content-Type": "application/json"}
    token = os.environ.get("ONTOLOGY_BRIDGE_TOKEN", "").strip()
    if token:
        headers["x-ontology-bridge-token"] = token
    try:
        req = urllib.request.Request(
            f"{base}/api/ontology/agent-bridge/validate-task",
            data=_json.dumps({"board": board, "taskId": task_id}).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            body = _json.loads(resp.read().decode("utf-8"))
        if body.get("ok") is True:
            return {"gate": "validatorExec", "ok": True}
        violations = body.get("violations") or []
        detail = "; ".join(
            f"{v.get('code')} {v.get('path', '')}: {v.get('detail', '')}".strip()
            for v in violations[:3]
        ) or str(body.get("detail", "validator failed"))
        return {"gate": "validatorExec", "ok": False,
                "reason": "validator_failed", "detail": detail[:300]}
    except Exception as exc:  # 工具缺席（后端未起/超时/坏响应）——fail-open 放行
        return {"gate": "validatorExec", "ok": True,
                "detail": f"ontology validator unavailable (fail-open): {exc}"}


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
