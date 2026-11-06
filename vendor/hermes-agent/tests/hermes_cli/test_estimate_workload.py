"""HERMES_CUSTOM[estimate]（团队并行二期）守门：估算落库 + 派发按在途工作量重排。

锚点：specs/2026-10-08-team-parallel-dev-capability.md §3 二期——estimate 从"纯
展示"变"落库参与派发决策"；重排仅同优先级层内换序（priority DESC/created_at ASC
语义不变），未评估卡按 1 人日保守计，unassigned 层内垫底。
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

_WORKTREE = Path(__file__).resolve().parents[2]
if str(_WORKTREE) not in sys.path:
    sys.path.insert(0, str(_WORKTREE))

import pytest

from hermes_cli import kanban_db as kb
from hermes_cli import kanban_db_connect as kbc
from hermes_cli.kanban_db_dispatch import _lane_rows, _reorder_ready_by_workload


def _prepare_home(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_KANBAN_HOME", str(tmp_path))
    kb._INITIALIZED_PATHS.clear()
    return kbc.connect()  # 直连（connect_closing 是 context manager，测试自管 close）


def _make_task(conn, title, assignee, status="todo", priority=0, days=None):
    # create_task 的 initial_status 契约只认 blocked/running（kanban_db.py
    # VALID_INITIAL_STATUSES）；测试直接 UPDATE 目标状态（状态机流转不在本测范围）
    tid = kb.create_task(
        conn=conn, title=title, body="", assignee=assignee,
        created_by="test", workspace_kind="dir",
    )
    with kb.write_txn(conn):
        conn.execute(
            "UPDATE tasks SET status = ?, priority = ? WHERE id = ?",
            (status, priority, tid),
        )
        if days is not None:
            conn.execute("UPDATE tasks SET estimate_days = ? WHERE id = ?", (days, tid))
    return tid


class TestSetEstimate:
    def test_persists_days_and_meta_with_event(self, tmp_path, monkeypatch):
        conn = _prepare_home(tmp_path, monkeypatch)
        tid = _make_task(conn, "pay-core", "chen")
        assert kb.set_estimate(conn, tid, 1.0, {"complexity": "M", "est_tokens": 90000})
        task = kb.get_task(conn, tid)
        assert task.estimate_days == 1.0
        assert task.estimate_meta["complexity"] == "M"
        events = conn.execute(
            "SELECT kind FROM task_events WHERE task_id = ?", (tid,)
        ).fetchall()
        assert "estimate_set" in [e["kind"] for e in events]
        conn.close()

    def test_clear_with_none_days(self, tmp_path, monkeypatch):
        conn = _prepare_home(tmp_path, monkeypatch)
        tid = _make_task(conn, "x", "hu")
        kb.set_estimate(conn, tid, 2.0)
        assert kb.set_estimate(conn, tid, None)
        assert kb.get_task(conn, tid).estimate_days is None
        conn.close()

    def test_archived_refused_and_bad_value_raises(self, tmp_path, monkeypatch):
        conn = _prepare_home(tmp_path, monkeypatch)
        tid = _make_task(conn, "y", "lin", status="archived")
        with pytest.raises(RuntimeError):
            kb.set_estimate(conn, tid, 1.0)
        tid2 = _make_task(conn, "z", "lin")
        with pytest.raises(ValueError):
            kb.set_estimate(conn, tid2, "abc")
        conn.close()

    def test_legacy_db_migrates_columns(self, tmp_path, monkeypatch):
        # 老库（无 estimate 列）打开即自动迁移（_LATER_TASK_COLUMNS 机制）
        conn = _prepare_home(tmp_path, monkeypatch)
        conn.close()
        conn2 = kbc.connect()
        cols = {r["name"] for r in conn2.execute("PRAGMA table_info(tasks)")}
        assert {"estimate_days", "estimate_meta"} <= cols
        conn2.close()


class TestWorkloadReorder:
    def test_same_tier_least_loaded_assignee_first(self, tmp_path, monkeypatch):
        conn = _prepare_home(tmp_path, monkeypatch)
        # 在途负载：chen 重（2+1=3 人日 running），hu 轻（0.5）
        _make_task(conn, "r1", "chen", status="running", days=2.0)
        _make_task(conn, "r2", "chen", status="running", days=1.0)
        _make_task(conn, "r3", "hu", status="running", days=0.5)
        # ready 同优先级：chen 的卡先建（SQL 序 chen 在前）
        t_chen = _make_task(conn, "ready-chen", "chen", status="ready", priority=1)
        t_hu = _make_task(conn, "ready-hu", "hu", status="ready", priority=1)
        rows = _lane_rows(conn, "ready")
        assert [r["id"] for r in rows][0] == t_chen  # SQL 序：created_at ASC
        reordered, changed = _reorder_ready_by_workload(conn, rows)
        assert changed is True
        assert [r["id"] for r in reordered] == [t_hu, t_chen]  # 轻载先行
        conn.close()

    def test_unestimated_counts_conservatively_and_tiers_preserved(self, tmp_path, monkeypatch):
        conn = _prepare_home(tmp_path, monkeypatch)
        # chen 在途一张未评估卡（保守 1 人日），lin 零在途
        _make_task(conn, "r1", "chen", status="running", days=None)
        t_p2 = _make_task(conn, "p2", "chen", status="ready", priority=2)
        t_p1 = _make_task(conn, "p1", "lin", status="ready", priority=1)
        rows = _lane_rows(conn, "ready")
        reordered, _ = _reorder_ready_by_workload(conn, rows)
        assert [r["id"] for r in reordered] == [t_p2, t_p1]  # priority 层不被负载打穿
        conn.close()

    def test_unassigned_last_within_tier(self, tmp_path, monkeypatch):
        conn = _prepare_home(tmp_path, monkeypatch)
        _make_task(conn, "r1", "chen", status="running", days=5.0)
        t_un = _make_task(conn, "un", None, status="ready", priority=1)
        t_busy = _make_task(conn, "busy", "chen", status="ready", priority=1)
        rows = _lane_rows(conn, "ready")
        reordered, _ = _reorder_ready_by_workload(conn, rows)
        assert [r["id"] for r in reordered] == [t_busy, t_un]  # 未指派层内垫底
        conn.close()

    def test_equal_workload_keeps_arrival_order(self, tmp_path, monkeypatch):
        conn = _prepare_home(tmp_path, monkeypatch)
        t_a = _make_task(conn, "a", "chen", status="ready", priority=1)
        t_b = _make_task(conn, "b", "hu", status="ready", priority=1)
        rows = _lane_rows(conn, "ready")
        reordered, changed = _reorder_ready_by_workload(conn, rows)
        assert changed is False
        assert [r["id"] for r in reordered] == [t_a, t_b]  # created_at 稳定性保留
        conn.close()
