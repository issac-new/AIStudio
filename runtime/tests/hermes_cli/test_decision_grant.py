"""Decision grant：TS/Python 修订一致性 + dispatcher 生成子进程前硬门。"""
from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

from hermes_cli import kanban_db as kb
from hermes_cli import kanban_db_connect as kbc
from hermes_cli import kanban_db_dispatch as kbd
from tools import kanban_tools as grant_tools


_REPO = Path(__file__).resolve().parents[3]
_VECTOR = json.loads(
    (_REPO / "custom/server/approval-inbox/__tests__/fixtures/decision-grant-revision.json").read_text(
        encoding="utf8"
    )
)


def test_shared_revision_vector_and_body_approved_is_not_a_grant():
    task = _VECTOR["task"]
    assert grant_tools.serialize_task_revision(task) == _VECTOR["canonical"]
    assert grant_tools.compute_task_revision(task) == _VECTOR["sha256"]
    assert grant_tools.decision_tier_for_task(task) == "T2"
    approved_text_only = {**task, "body": task["body"] + "\nAPPROVED"}
    assert grant_tools.check_decision_grant(None, approved_text_only, "T2") == (
        False,
        "missing_grant",
    )


@pytest.fixture
def kanban_home(tmp_path, monkeypatch):
    home = tmp_path / ".hermes"
    home.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setenv("HUMAN_GATE_STORE", str(home / "approvals" / "human-gate.json"))
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    from hermes_cli import profiles

    monkeypatch.setattr(profiles, "profile_exists", lambda _name: True)
    kb._INITIALIZED_PATHS.clear()
    kb.init_db()
    return home


def _make_task(conn, tier):
    tid = kb.create_task(
        conn,
        title=f"{tier} authenticated task",
        body=f"routed:heavy:tier={tier} src=test\nAPPROVED 只是正文，不是授权",
        assignee="alice",
        workspace_kind="dir",
        workspace_path=None,
    )
    with kb.write_txn(conn):
        conn.execute("UPDATE tasks SET status = 'ready' WHERE id = ?", (tid,))
    return kb.get_task(conn, tid)


def _task_dict(task, board="default"):
    return {
        "id": task.id,
        "board": board,
        "title": task.title,
        "body": task.body,
        "assignee": task.assignee,
        "status": task.status,
        "updated_at": getattr(task, "updated_at", None),
        "workspace_kind": task.workspace_kind,
        "workspace_path": task.workspace_path,
        "branch_name": task.branch_name,
    }


def _write_approved_grant(kanban_home, task, tier, *, choice=None, revision=None, expires_at=None, extra=None):
    now_ms = int(time.time() * 1000)
    task_dict = _task_dict(task)
    grant = {
        "taskId": task.id,
        "board": "default",
        "tier": tier,
        "decision": "approved",
        "actor": "human-director",
        "taskRevision": revision or grant_tools.compute_task_revision(task_dict),
        "issuedAt": now_ms - 1000,
        "decidedAt": now_ms - 1000,
    }
    if extra:
        grant.update(extra)
    if choice is not None:
        grant["choice"] = choice
    if expires_at is not None:
        grant["expiresAt"] = expires_at
    request = {
        "id": f"hgate:task:default:{task.id}",
        "runId": "task:default",
        "cardId": task.id,
        "title": task.title,
        "requestedBy": "human-requester",
        "createdAt": now_ms - 2000,
        "status": "approved",
        "decidedBy": "human-director",
        "decidedAt": now_ms - 1000,
        "scope": "task",
        "taskId": task.id,
        "board": "default",
        "tier": tier,
        "taskRevision": grant["taskRevision"],
        "grant": grant,
    }
    path = kanban_home / "approvals" / "human-gate.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps([request], ensure_ascii=False), encoding="utf8")
    return grant


def _dispatch(conn):
    spawns = []

    def fake_spawn(task, _workspace, board=None):
        spawns.append((task.id, board))
        return 4242

    result = kbd.dispatch_once(conn, spawn_fn=fake_spawn)
    return result, spawns


def test_t1_needs_no_grant(kanban_home):
    with kbc.connect() as conn:
        task = _make_task(conn, "T1")
        result, spawns = _dispatch(conn)
    assert [task_id for task_id, _ in spawns] == [task.id]
    assert [row[0] for row in result.spawned] == [task.id]
    assert result.needs_decision == []


def test_t2_missing_grant_prevents_spawn_with_visible_event(kanban_home):
    with kbc.connect() as conn:
        task = _make_task(conn, "T2")
        result, spawns = _dispatch(conn)
        events = kb.list_events(conn, task.id)
        current = kb.get_task(conn, task.id)
    assert spawns == []
    assert result.spawned == []
    assert result.needs_decision == [(task.id, "missing_grant")]
    denied = [event for event in events if event.kind == "needs_decision"]
    assert denied and denied[-1].payload["reason"] == "missing_grant"
    assert denied[-1].payload["tier"] == "T2"
    assert current.status == "ready"


def test_t2_approved_grant_requires_human_choice_then_allows_spawn(kanban_home):
    with kbc.connect() as conn:
        task = _make_task(conn, "T2")
        _write_approved_grant(kanban_home, task, "T2", choice="   ")
        denied, denied_spawns = _dispatch(conn)
        assert denied_spawns == []
        assert denied.needs_decision == [(task.id, "choice_required")]
        assert kb.get_task(conn, task.id).status == "ready"

        _write_approved_grant(kanban_home, task, "T2", choice="方案 B")
        allowed, allowed_spawns = _dispatch(conn)
    assert [task_id for task_id, _ in allowed_spawns] == [task.id]
    assert allowed.needs_decision == []
    assert [row[0] for row in allowed.spawned] == [task.id]


def test_t3_approved_grant_does_not_require_choice(kanban_home):
    with kbc.connect() as conn:
        task = _make_task(conn, "T3")
        _write_approved_grant(kanban_home, task, "T3")
        result, spawns = _dispatch(conn)
    assert [task_id for task_id, _ in spawns] == [task.id]
    assert result.needs_decision == []


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("body", "routed:heavy:tier=T2 src=test\n执行范围已改变"),
        ("workspace_path", "/tmp/other-workspace"),
        ("assignee", "bob"),
    ],
)
def test_task_changes_invalidate_grant_before_spawn(kanban_home, field, value):
    with kbc.connect() as conn:
        task = _make_task(conn, "T2")
        _write_approved_grant(kanban_home, task, "T2", choice="方案 B")
        with kb.write_txn(conn):
            conn.execute(f"UPDATE tasks SET {field} = ? WHERE id = ?", (value, task.id))
        result, spawns = _dispatch(conn)
        current = kb.get_task(conn, task.id)
    assert spawns == []
    assert result.needs_decision == [(task.id, "revision_mismatch")]
    assert current.status == "ready"


def test_expired_grant_prevents_spawn(kanban_home):
    with kbc.connect() as conn:
        task = _make_task(conn, "T2")
        _write_approved_grant(
            kanban_home,
            task,
            "T2",
            choice="方案 B",
            expires_at=int(time.time() * 1000) - 1,
        )
        result, spawns = _dispatch(conn)
    assert spawns == []
    assert result.needs_decision == [(task.id, "expired")]


def test_grant_with_new_auth_fields_still_passes(kanban_home):
    """2026-10-31 A+B 批：新增 strength/policyVersion/ruleIds/issuerRole 不改变 Python 判定。

    Python 消费端只读它认识的字段；未知字段必须被忽略而不是报错，否则 TS 侧扩展会把
    存量 worker 直接挡死。
    """
    with kbc.connect() as conn:
        task = _make_task(conn, "T3")
        _write_approved_grant(
            kanban_home,
            task,
            "T3",
            extra={
                "strength": "delegated",
                "policyVersion": 3,
                "ruleIds": ["admission:auto_accept"],
                "issuerRole": "local_operator",
            },
        )
        result, spawns = _dispatch(conn)
    assert len(spawns) == 1, result.needs_decision


def test_grant_check_ignores_unknown_fields(kanban_home):
    """直接调判定：带新字段的 grant 仍返回 ok（不因未知键失败）。"""
    task = {
        "id": "t-direct",
        "board": "default",
        "title": "直测未知字段",
        "body": "tier=T3",
        "assignee": None,
        "status": "ready",
        "updated_at": 1,
        "workspace_kind": None,
        "workspace_path": None,
        "branch_name": None,
    }
    grant = {
        "taskId": task["id"],
        "board": "default",
        "tier": "T3",
        "decision": "approved",
        "actor": "human-director",
        "taskRevision": grant_tools.compute_task_revision(task),
        "issuedAt": int(time.time() * 1000) - 1000,
        "decidedAt": int(time.time() * 1000) - 1000,
        "strength": "delegated",
        "policyVersion": 3,
        "ruleIds": ["admission:auto_accept"],
        "issuerRole": "local_operator",
    }
    assert grant_tools.check_decision_grant(grant, task, "T3") == (True, "ok")
