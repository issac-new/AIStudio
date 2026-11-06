"""建卡幂等唯一索引（D 层）：跨进程唯一键 + 归档卡不挡重建。"""
from __future__ import annotations

from pathlib import Path

import pytest

from hermes_cli import kanban_db as kb
from hermes_cli import kanban_db_connect as kbc


@pytest.fixture
def kanban_home(tmp_path, monkeypatch):
    home = tmp_path / ".hermes"
    home.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    kb.init_db()
    return home


def test_partial_unique_index_is_installed(kanban_home):
    with kbc.connect() as conn:
        names = {row[1] for row in conn.execute("PRAGMA index_list('tasks')").fetchall()}
    assert "idx_tasks_idempotency_unique" in names


def test_duplicate_idempotency_key_insert_is_blocked(kanban_home):
    with kbc.connect() as conn:
        kb.create_task(conn, title="first", assignee="ops", idempotency_key="K1")
        cursor = conn.execute(
            "INSERT OR IGNORE INTO tasks (id, title, status, workspace_kind, idempotency_key) "
            "VALUES ('dup', 'dup', 'ready', 'scratch', 'K1')"
        )
        assert cursor.rowcount == 0
        count = conn.execute(
            "SELECT COUNT(*) FROM tasks WHERE idempotency_key = 'K1'"
        ).fetchone()[0]
    assert count == 1


def test_archived_card_does_not_block_recreation(kanban_home):
    with kbc.connect() as conn:
        first = kb.create_task(conn, title="a", assignee="ops", idempotency_key="K2")
        conn.execute("UPDATE tasks SET status = 'archived' WHERE id = ?", (first,))
        second = kb.create_task(conn, title="b", assignee="ops", idempotency_key="K2")
    assert second != first


def test_sequential_same_key_returns_existing_card(kanban_home):
    with kbc.connect() as conn:
        first = kb.create_task(conn, title="a", assignee="ops", idempotency_key="K3")
        second = kb.create_task(conn, title="b", assignee="ops", idempotency_key="K3")
    assert first == second
