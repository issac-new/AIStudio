"""HERMES_CUSTOM[outcome-kanban]（AI 原生组织运行模型批一 Task 9）守门：
tasks.outcome_id 列 + decompose 子卡继承。

锚点：specs/2026-11-19-ai-native-operating-model-design.md——结果合同挂靠列
（tasks.outcome_id TEXT，Studio 侧 kanban-bind.ts 在合同激活时写入，只允许
「空→值」或同值）；decompose 建子卡时子卡继承父卡 outcome_id（继承落点=
kanban_db_graph._insert_decomposed_child，与 session_id 继承同事务）。

直跑说明：kanban_db_graph 不在 overlay runtime 镜像（部署时从上游解析），
本测直接 import 真模块——纯 overlay runtime（无该文件且 vendor 不在
PYTHONPATH）时 skip，不在该环境下造假绿。
"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

_WORKTREE = Path(__file__).resolve().parents[2]
if str(_WORKTREE) not in sys.path:
    sys.path.insert(0, str(_WORKTREE))

try:
    from hermes_cli.kanban_db_graph import decompose_triage_task
except Exception:  # pragma: no cover - 纯 overlay runtime 无该模块
    decompose_triage_task = None

import pytest

from hermes_cli import kanban_db as kb
from hermes_cli import kanban_db_connect as kbc


def _prepare_home(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_KANBAN_HOME", str(tmp_path))
    kb._INITIALIZED_PATHS.clear()
    return kbc.connect()  # 直连（connect_closing 是 context manager，测试自管 close）


def _make_task(conn, title, assignee, status="todo"):
    tid = kb.create_task(
        conn=conn, title=title, body="", assignee=assignee,
        created_by="test", workspace_kind="dir",
    )
    with kb.write_txn(conn):
        conn.execute("UPDATE tasks SET status = ? WHERE id = ?", (status, tid))
    return tid


def _children(title_a="child-a", title_b="child-b"):
    return [
        {"title": title_a, "body": "b", "assignee": "chen", "parents": []},
        {"title": title_b, "body": "b", "assignee": "chen", "parents": [0]},
    ]


def _outcome_of(conn, task_id):
    row = conn.execute(
        "SELECT outcome_id FROM tasks WHERE id = ?", (task_id,)
    ).fetchone()
    return row["outcome_id"] if row is not None else None


@pytest.mark.skipif(decompose_triage_task is None, reason="kanban_db_graph 不可用（纯 overlay runtime）")
class TestDecomposeInheritsOutcomeId:
    def test_children_inherit_bound_root(self, tmp_path, monkeypatch):
        conn = _prepare_home(tmp_path, monkeypatch)
        root = _make_task(conn, "root", "orch", status="triage")
        with kb.write_txn(conn):
            conn.execute(
                "UPDATE tasks SET outcome_id = ? WHERE id = ?", ("oc-1", root)
            )
        child_ids = decompose_triage_task(
            conn, root, root_assignee="orch", children=_children(), author="t",
        )
        assert child_ids, "root in triage with no prior decompose must fan out"
        for cid in child_ids:
            assert _outcome_of(conn, cid) == "oc-1", "child must inherit root outcome_id"
        assert _outcome_of(conn, root) == "oc-1", "root keeps its outcome_id"
        conn.close()

    def test_children_null_when_root_unbound(self, tmp_path, monkeypatch):
        conn = _prepare_home(tmp_path, monkeypatch)
        root = _make_task(conn, "root", "orch", status="triage")
        child_ids = decompose_triage_task(
            conn, root, root_assignee="orch", children=_children(), author="t",
        )
        assert child_ids
        for cid in child_ids:
            assert _outcome_of(conn, cid) is None
        conn.close()

    def test_single_promotion_keeps_binding(self, tmp_path, monkeypatch):
        # fanout=false 只提升根卡自身（specify_triage_task），不建子卡——
        # 根卡 outcome_id 必须原样保留（继承只发生在「新建子卡」面）。
        conn = _prepare_home(tmp_path, monkeypatch)
        root = _make_task(conn, "root", "orch", status="triage")
        with kb.write_txn(conn):
            conn.execute(
                "UPDATE tasks SET outcome_id = ? WHERE id = ?", ("oc-9", root)
            )
        ok = kb.specify_triage_task(
            conn, root, title="promoted", body="b", assignee="orch", author="t",
        )
        assert ok
        assert _outcome_of(conn, root) == "oc-9"
        conn.close()


@pytest.mark.skipif(decompose_triage_task is None, reason="kanban_db_graph 不可用（纯 overlay runtime）")
class TestLegacyDbMigration:
    def test_legacy_db_without_column_migrates_and_data_intact(self, tmp_path, monkeypatch):
        # 老库（无 outcome_id 列）→ 首次 connect 触发 ALTER 惰性迁移，既有行零丢失；
        # 迁移后 decompose 全链照常（继承可写）。
        conn = _prepare_home(tmp_path, monkeypatch)
        root = _make_task(conn, "legacy-root", "orch", status="triage")
        other = _make_task(conn, "legacy-other", "chen", status="done")
        conn.close()

        raw = sqlite3.connect(str(tmp_path / "kanban.db"))
        raw.row_factory = sqlite3.Row
        raw.execute("ALTER TABLE tasks DROP COLUMN outcome_id")
        raw.commit()
        raw.close()

        conn2 = _prepare_home(tmp_path, monkeypatch)
        cols = {r["name"] for r in conn2.execute("PRAGMA table_info(tasks)")}
        assert "outcome_id" in cols, "connect() must lazily add outcome_id to legacy boards"
        # 数据完好：两行仍在，状态/标题不坏
        rows = {
            r["id"]: r
            for r in conn2.execute(
                "SELECT id, title, status FROM tasks WHERE id IN (?, ?)", (root, other)
            )
        }
        assert rows[root]["title"] == "legacy-root" and rows[root]["status"] == "triage"
        assert rows[other]["status"] == "done"
        # 迁移列可用：绑定 + decompose 继承一路可写
        with kb.write_txn(conn2):
            conn2.execute(
                "UPDATE tasks SET outcome_id = ? WHERE id = ?", ("oc-legacy", root)
            )
        child_ids = decompose_triage_task(
            conn2, root, root_assignee="orch", children=_children(), author="t",
        )
        assert child_ids
        for cid in child_ids:
            assert _outcome_of(conn2, cid) == "oc-legacy"
        conn2.close()
