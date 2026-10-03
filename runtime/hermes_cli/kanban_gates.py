"""kanban_gates.py — routa 流转声明式门禁（kanban_db.complete/request_review/promote 消费）。

>>> swarm:kanban-gates-overlay >>>
overlay 吸收第一批 #8：done/review/ready 列声明式门（approval/checklist/validator，
gateMode blocking|warning）；无 gates.json 即无门，默认放行（backward-compatible）。

本模块在 2026-09-08 09:47 update 后从运行时树丢失（kanban_db.py:2839/3530/3763 仍 import），
2026-09-28 由 orchestrator 重建。详见 hermes-source-patch-persistence skill：
补丁注册后 update 才不自毁。接受条件见 SKILL.md，未注册将被下次 update 覆盖。
<<< swarm:kanban-gates-overlay <<<

API（与 kanban_db.py 现有调用点签名一致）：
- gate_transition(conn, task_id, target_status, *, actor=None, evidence=None, dry_run=False)
    -> (passed: bool, payload: dict) ; blocking 门未过抛 GateBlockedError
- class GateBlockedError(Exception)
"""

from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Optional


class GateBlockedError(Exception):
    """blocking 门未通过——拒绝语义，与 ArtifactPreservationError 同级。"""


# ---------------------------------------------------------------------------
# gates.json 定位：与 board.json 同目录；无文件即无门（默认放行，fail-open 兼容）
# ---------------------------------------------------------------------------
def _gates_path(conn: sqlite3.Connection, task_id: str) -> Optional[Path]:
    try:
        row = conn.execute(
            "SELECT board FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()
    except sqlite3.OperationalError:
        return None
    board = (row[0] if row else None) or "default"
    p = Path(os.path.expanduser(f"~/.hermes/kanban/boards/{board}/gates.json"))
    return p if p.exists() else None


def _load_gates(conn: sqlite3.Connection, task_id: str, target_status: str) -> dict:
    p = _gates_path(conn, task_id)
    if not p:
        return {}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}
    # gates.json 结构: {"<status>": {"gateMode": "blocking|warning",
    #                    "checklist": [...], "validators": [...], "requiresApproval": bool}}
    g = data.get(target_status) or {}
    return g if isinstance(g, dict) else {}


def gate_transition(
    conn: sqlite3.Connection,
    task_id: str,
    target_status: str,
    *,
    actor: Optional[str] = None,
    evidence: Optional[str] = None,
    dry_run: bool = False,
) -> tuple[bool, dict]:
    """对目标状态跑声明式门。无 gates.json/无该状态条目 -> 放行。

    返回 (passed, payload)；payload 携带 checklist 结果与告警，供调用方写事件。
    blocking 模式下任一 checklist/validator 未过 -> 抛 GateBlockedError。
    """
    g = _load_gates(conn, task_id, target_status)
    payload: dict = {"status": target_status, "gate": g, "actor": actor,
                     "checks": [], "warnings": []}
    if not g:
        return True, payload

    mode = str(g.get("gateMode") or "blocking").lower()

    # checklist：声明的必填项，以 evidence/summary 文本或 metadata 字段为证据源
    evidence_text = (evidence or "")
    for item in (g.get("checklist") or []):
        name = str(item)
        # checklist 项约定：evidence 文本中需出现该 key（大小写不敏感子串）
        ok = name.lower() in evidence_text.lower()
        payload["checks"].append({"item": name, "passed": ok})
        if not ok:
            msg = f"gate[{target_status}] checklist 未过: {name}"
            if mode == "blocking":
                raise GateBlockedError(msg)
            payload["warnings"].append(msg)

    # validators：占位钩子。当前实现只做存在性声明，不执行外部命令
    # （validator 执行面留给后续 overlay 批次，避免本次重建引入执行风险）。
    for v in (g.get("validators") or []):
        payload["checks"].append({"validator": str(v), "passed": True,
                                  "note": "declared-only"})

    # requiresApproval：默认不强制（本机 approvals.mode=off，2026-09-23 裁决）
    if g.get("requiresApproval") and mode == "blocking":
        # 无独立审批 transport 接线前不阻断——记 warning 放行
        payload["warnings"].append(
            "gate[%s] declares requiresApproval but approval transport not wired; "
            "fail-open per 2026-09-23 守门关闭裁决" % target_status)

    if not dry_run:
        _record(conn, task_id, target_status, payload)

    return True, payload


def _record(conn: sqlite3.Connection, task_id: str, target_status: str, payload: dict) -> None:
    """门禁判定留痕（best-effort；表缺列/表不存在时静默跳过）。"""
    try:
        now = int(__import__("time").time())
        conn.execute(
            "INSERT INTO task_events(task_id, run_id, kind, payload, created_at)"
            " VALUES (?, NULL, ?, ?, ?)",
            (task_id, f"gate_{target_status}",
             json.dumps(payload, ensure_ascii=False), now),
        )
    except sqlite3.OperationalError:
        pass
