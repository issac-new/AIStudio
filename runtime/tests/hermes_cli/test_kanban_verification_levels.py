"""批二（spec 2026-11-14-superagent-contract-batch2）任务二：完成验证分级。

覆盖：standard 缺省即现状、strict:pr（PR acceptance 未过拒/过后放/证据留痕）、
independent（review handoff 缺失拒/逐条 AC 报告放/周期闭合拒）、判定器异常
fail-closed、非法等级值建卡即拒。

2026-11-19 结果交付批：independent 的放行判据从「事件时序」升级为「当前评审周期的
逐条 AC 验收报告 + reviewer≠implementer」；本文件随 runtime 覆盖层部署，替换
patch 775 中的旧版测试。
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from hermes_cli import kanban_db as kb
from hermes_cli import kanban_db_connect as kbc

BODY = "AC-1: 产物存在\nAC-2: 测试通过\n"


def _report(cycle_id=None) -> dict:
    report = {
        "version": 1,
        "reviewer": "r",
        "reviewerKind": "agent",
        "verdict": "pass",
        "summary": "逐条复核通过",
        "checks": [
            {"id": "AC-1", "result": "pass", "evidence": "dist/app.js 已生成"},
            {"id": "AC-2", "result": "pass", "evidence": "tap 2/2 passed"},
        ],
    }
    if cycle_id is not None:
        report["reviewRequestedEventId"] = cycle_id
    return report


@pytest.fixture
def kanban_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    home = tmp_path / ".hermes"
    home.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    kb.init_db()
    return home


def _conn() -> sqlite3.Connection:
    return kbc.connect()


def _ready(conn, verification=None, body=None):
    tid = kb.create_task(conn, title="v", assignee="w", body=body)
    if verification:
        with kb.write_txn(conn):
            conn.execute("UPDATE tasks SET verification=? WHERE id=?", (verification, tid))
    with kb.write_txn(conn):
        conn.execute("UPDATE tasks SET status='ready' WHERE id=?", (tid,))
    return tid


def _latest_event_id(conn, tid: str, kind: str) -> int:
    row = conn.execute(
        "SELECT id FROM task_events WHERE task_id=? AND kind=? ORDER BY id DESC LIMIT 1",
        (tid, kind),
    ).fetchone()
    assert row is not None, f"{kind} event missing"
    return int(row["id"])


class TestStandardDefault:
    def test_missing_verification_behaves_as_today(self, kanban_home):
        conn = _conn()
        tid = _ready(conn)
        assert kb.complete_task(conn, tid, result="plain") is True

    def test_explicit_standard_passes_without_extra_evidence(self, kanban_home):
        conn = _conn()
        tid = _ready(conn, verification="standard")
        assert kb.complete_task(conn, tid, result="plain") is True


class TestStrictPr:
    def test_strict_pr_rejected_without_acceptance(self, kanban_home):
        conn = _conn()
        tid = _ready(conn, verification="strict:pr")
        with pytest.raises(Exception) as ei:
            kb.complete_task(conn, tid, result="pr not green")
        msg = str(ei.value).lower()
        assert "verification" in msg or "pr" in msg
        assert conn.execute("SELECT status FROM tasks WHERE id=?", (tid,)).fetchone()["status"] != "done"

    def test_strict_pr_passes_after_acceptance_recorded(self, kanban_home):
        # 判据只认 kanban 库内 pr_acceptance 事件（store.record_acceptance 的
        # 落库真值形态）：直落一条 ok receipt 模拟 store 写入后的库内状态。
        conn = _conn()
        tid = _ready(conn, verification="strict:pr")
        with kb.write_txn(conn):
            kb._append_event(conn, tid, "pr_acceptance", {"ok": True, "head": "abc123"})
        assert kb.complete_task(conn, tid, result="pr green") is True

    def test_strict_pr_satisfied_by_fresh_receipt_not_stale_event(self, kanban_home, monkeypatch):
        import hermes_cli.kanban_db as kdb
        conn = _conn()
        tid = _ready(conn, verification="strict:pr")
        captured = {}
        real_gate = kdb._gate_verification_level
        def gate_spy(conn_, task_id_, *, pr_receipt_ok=None, metadata=None):
            captured["pr_ok"] = pr_receipt_ok
            real_gate(conn_, task_id_, pr_receipt_ok=pr_receipt_ok, metadata=metadata)
        monkeypatch.setattr(kdb, "_gate_verification_level", gate_spy)
        import hermes_cli.kanban_pr_acceptance_store as prs
        monkeypatch.setattr(prs, "prepare_acceptance",
            lambda conn_, tid_, rid, md: ((1, "ready", "github:o/r#1"), {"ok": True}))
        monkeypatch.setattr(prs, "record_acceptance", lambda conn_, tid_, acc: True)
        assert kdb.complete_task(conn, tid, result="pr green now") is True
        assert captured["pr_ok"] is True

    def test_rejection_event_carries_level_result(self, kanban_home):
        conn = _conn()
        tid = _ready(conn, verification="strict:pr")
        with pytest.raises(Exception):
            kb.complete_task(conn, tid, result="no pr")
        row = conn.execute(
            "SELECT payload FROM task_events WHERE task_id=? AND kind LIKE '%verification%' ORDER BY id DESC",
            (tid,),
        ).fetchone()
        assert row is not None, "verification_level_result event missing"


class TestIndependent:
    def test_independent_reviewer_approval_counts(self, kanban_home):
        conn = _conn()
        tid = _ready(conn, verification="independent", body=BODY)
        with kb.write_txn(conn):
            kb._append_event(conn, tid, "review_requested", {"implementer": "w", "reviewer": "r"})
        cycle = _latest_event_id(conn, tid, "review_requested")
        assert kb.complete_task(
            conn, tid, result="approved path",
            metadata={"acceptance_report": _report(cycle)},
        ) is True

    def test_independent_rejected_without_review_handoff(self, kanban_home):
        conn = _conn()
        tid = _ready(conn, verification="independent", body=BODY)
        kb.claim_task(conn, tid, claimer="w")
        with pytest.raises(Exception) as ei:
            kb.complete_task(conn, tid, result="no review")
        assert "review" in str(ei.value).lower() or "independent" in str(ei.value).lower()

    def test_independent_passes_after_rework_review(self, kanban_home):
        # 返修后重新 request_review 开新周期；报告绑定最新周期即通过。
        conn = _conn()
        tid = _ready(conn, verification="independent", body=BODY)
        with kb.write_txn(conn):
            kb._append_event(conn, tid, "review_requested", {"implementer": "w", "reviewer": "r"})
            kb._append_event(
                conn, tid, "changes_requested",
                {"reviewer": "r", "reason": "fix", "reworkRound": 1},
            )
            kb._append_event(conn, tid, "review_requested", {"implementer": "w", "reviewer": "r"})
        cycle = _latest_event_id(conn, tid, "review_requested")
        assert kb.complete_task(
            conn, tid, result="after rework",
            metadata={"acceptance_report": _report(cycle)},
        ) is True

    def test_independent_rejected_when_cycle_closed_by_changes_requested(self, kanban_home):
        conn = _conn()
        tid = _ready(conn, verification="independent", body=BODY)
        with kb.write_txn(conn):
            kb._append_event(conn, tid, "review_requested", {"implementer": "w", "reviewer": "r"})
            kb._append_event(
                conn, tid, "changes_requested",
                {"reviewer": "r", "reason": "fix", "reworkRound": 1},
            )
        cycle = _latest_event_id(conn, tid, "review_requested")
        with pytest.raises(kb.VerificationLevelBlocked) as ei:
            kb.complete_task(
                conn, tid, result="stale pass",
                metadata={"acceptance_report": _report(cycle)},
            )
        assert "review_cycle_closed" in [b["code"] for b in ei.value.blockers]


class TestFailClosed:
    def test_verifier_crash_rejects_not_passes(self, kanban_home, monkeypatch):
        conn = _conn()
        tid = _ready(conn, verification="strict:pr")
        monkeypatch.setattr(
            "hermes_cli.kanban_db._pr_acceptance_satisfied",
            lambda conn, task_id: (_ for _ in ()).throw(RuntimeError("gh down")),
        )
        with pytest.raises(Exception) as ei:
            kb.complete_task(conn, tid, result="verifier down")
        assert "verifier" in str(ei.value).lower() or "unavailable" in str(ei.value).lower()

    def test_invalid_verification_value_rejected_at_write(self, kanban_home):
        conn = _conn()
        with pytest.raises(Exception):
            kb.create_task(conn, title="bad", assignee="w", verification="ultra")
