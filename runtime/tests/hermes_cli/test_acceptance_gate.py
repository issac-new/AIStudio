"""independent 验收门与返修轮次的内核集成测试（结果交付批，2026-11-19）。

覆盖：无报告拒绝、合法报告完成并落事件、自审拒绝、旧周期重放拒绝、
返修轮次上限与 force 越过。全部走 ``kanban_db.complete_task`` 的真实事务边界。
"""
from __future__ import annotations

from pathlib import Path

import pytest

from hermes_cli import kanban_db as kb
from hermes_cli import kanban_db_connect as kbc


BODY = "任务正文\nAC-1: 产物存在\nAC-2: TAP 报告零失败\n"


@pytest.fixture
def kanban_home(tmp_path, monkeypatch):
    home = tmp_path / ".hermes"
    home.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    monkeypatch.delenv("HERMES_KANBAN_DOD_CONTRACT", raising=False)
    monkeypatch.delenv("HERMES_KANBAN_DOD_SOURCE_SHA256", raising=False)
    monkeypatch.delenv("HERMES_KANBAN_MAX_REWORK_ROUNDS", raising=False)
    monkeypatch.delenv("HERMES_KANBAN_ACCEPTANCE_OVERRIDE", raising=False)
    kb.init_db()
    return home


def _setup_independent(tmp_path: Path) -> str:
    with kbc.connect() as conn:
        tid = kb.create_task(
            conn, title="independent acceptance", assignee="ops", body=BODY,
            verification="independent",
        )
        assert kb.claim_task(conn, tid) is not None
        assert kb.request_review(
            conn, tid, reviewer="reviewer-1", summary="实现完成，请复核", force=True,
        ) is True
        task = kb.get_task(conn, tid)
        assert task.status == "review"
    return tid


def _report(version=None, **overrides) -> dict:
    base = {
        "version": 1,
        "reviewer": "reviewer-1",
        "reviewerKind": "agent",
        "verdict": "pass",
        "summary": "逐条复核通过",
        "checks": [
            {"id": "AC-1", "result": "pass", "evidence": "hello.txt sha256=..."},
            {"id": "AC-2", "result": "pass", "evidence": "tap 2/2 passed"},
        ],
    }
    if version is not None:
        base["deliveryVersionId"] = version["versionId"]
        base["artifactChecksum"] = version["checksum"]
    base.update(overrides)
    return base


def _latest_version(conn, tid: str) -> dict:
    from hermes_cli.delivery_version import latest_delivery_version
    version = latest_delivery_version(conn, tid)
    assert version is not None, "request_review should have created a delivery version"
    return version


def _kinds(conn, tid: str) -> list[str]:
    return [e.kind for e in kb.list_events(conn, tid)]


def test_independent_requires_acceptance_report(tmp_path, kanban_home):
    tid = _setup_independent(tmp_path)
    with kbc.connect() as conn:
        with pytest.raises(kb.VerificationLevelBlocked) as ei:
            kb.complete_task(conn, tid, summary="复核通过", force=True)
        assert kb.get_task(conn, tid).status == "review"
        codes = [b["code"] for b in ei.value.blockers]
        assert "acceptance_report_missing" in codes
        assert "acceptance_blocked" in _kinds(conn, tid)


def test_independent_valid_report_completes_and_records_event(tmp_path, kanban_home):
    tid = _setup_independent(tmp_path)
    with kbc.connect() as conn:
        cycle = [
            e for e in kb.list_events(conn, tid) if e.kind == "review_requested"
        ][-1]
        report = _report(_latest_version(conn, tid), reviewRequestedEventId=cycle.id)
        ok = kb.complete_task(
            conn, tid, summary="复核通过", metadata={"acceptance_report": report},
            force=True,
        )
        assert ok is True
        assert kb.get_task(conn, tid).status == "done"
        events = kb.list_events(conn, tid)
        report_events = [e for e in events if e.kind == "acceptance_report"]
        assert len(report_events) == 1
        payload = report_events[0].payload or {}
        assert payload["reviewer"] == "reviewer-1"
        assert payload["reviewRequestedEventId"] == cycle.id
        assert payload["deliveryVersionId"].startswith("dv_")
        assert len(payload["artifactChecksum"]) == 64
        assert [c["id"] for c in payload["checks"]] == ["AC-1", "AC-2"]


def test_report_must_bind_current_delivery_version(tmp_path, kanban_home):
    tid = _setup_independent(tmp_path)
    with kbc.connect() as conn:
        version = _latest_version(conn, tid)
        report = _report(version, artifactChecksum="0" * 64)
        with pytest.raises(kb.VerificationLevelBlocked) as ei:
            kb.complete_task(
                conn, tid, summary="错版本", metadata={"acceptance_report": report}, force=True,
            )
        assert "delivery_checksum_mismatch" in [b["code"] for b in ei.value.blockers]
        assert kb.get_task(conn, tid).status == "review"


def test_report_without_delivery_version_is_rejected(tmp_path, kanban_home):
    tid = _setup_independent(tmp_path)
    with kbc.connect() as conn:
        with pytest.raises(kb.VerificationLevelBlocked) as ei:
            kb.complete_task(
                conn, tid, summary="缺版本", metadata={"acceptance_report": _report()}, force=True,
            )
        assert "delivery_version_missing" in [b["code"] for b in ei.value.blockers]
        assert kb.get_task(conn, tid).status == "review"


def _complete_with_report_for(conn, tid: str, version: dict) -> bool:
    """按最新评审周期提交绑定 ``version`` 的通过报告并请求完成。"""
    cycle = [e for e in kb.list_events(conn, tid) if e.kind == "review_requested"][-1]
    report = _report(version, reviewRequestedEventId=cycle.id)
    return kb.complete_task(
        conn, tid, summary="复核通过", metadata={"acceptance_report": report}, force=True,
    )


# ---- 送审后卡片被改动（2026-11-27 交付版本过期校验）----


def test_body_edited_after_review_rejects_old_report(tmp_path, kanban_home):
    tid = _setup_independent(tmp_path)
    with kbc.connect() as conn:
        version = _latest_version(conn, tid)
        assert kb.edit_task(conn, tid, body=BODY + "\n补充说明：产物放在 hello.txt\n") is True
        with pytest.raises(kb.VerificationLevelBlocked) as ei:
            _complete_with_report_for(conn, tid, version)
        codes = [b["code"] for b in ei.value.blockers]
        assert codes == ["delivery_version_stale"]
        assert "kanban_request_review" in ei.value.blockers[0]["action"]
        assert kb.get_task(conn, tid).status == "review"
        assert _kinds(conn, tid).count("acceptance_blocked") == 1
        # 被拒的完成不得顺带记出新版本：最新版本仍是送审时那个
        assert _latest_version(conn, tid)["versionId"] == version["versionId"]


def test_ac_wording_changed_after_review_is_rejected(tmp_path, kanban_home):
    """只改验收条件的措辞、编号不变：契约 AC 一致，但卡片内容已不是送审时那份。"""
    tid = _setup_independent(tmp_path)
    with kbc.connect() as conn:
        version = _latest_version(conn, tid)
        kb.edit_task(conn, tid, body="任务正文\nAC-1: 产物存在且非空\nAC-2: TAP 报告零失败\n")
        with pytest.raises(kb.VerificationLevelBlocked) as ei:
            _complete_with_report_for(conn, tid, version)
        assert [b["code"] for b in ei.value.blockers] == ["delivery_version_stale"]
        assert kb.get_task(conn, tid).status == "review"


def test_attachment_added_after_review_is_rejected(tmp_path, kanban_home):
    tid = _setup_independent(tmp_path)
    with kbc.connect() as conn:
        version = _latest_version(conn, tid)
        note = tmp_path / "review-note.txt"
        note.write_text("评审补充材料", encoding="utf8")
        kb.add_attachment(
            conn, tid, filename="review-note.txt", stored_path=str(note),
            size=note.stat().st_size, uploaded_by="reviewer-1",
        )
        with pytest.raises(kb.VerificationLevelBlocked) as ei:
            _complete_with_report_for(conn, tid, version)
        assert [b["code"] for b in ei.value.blockers] == ["delivery_version_stale"]
        assert kb.get_task(conn, tid).status == "review"


def test_rerequest_after_edit_issues_new_version_and_new_report_passes(tmp_path, kanban_home):
    tid = _setup_independent(tmp_path)
    with kbc.connect() as conn:
        old = _latest_version(conn, tid)
        kb.edit_task(conn, tid, body=BODY + "\n补充说明一行\n")
        assert kb.claim_review_task(conn, tid) is not None
        ok, _ = kb.request_changes(conn, tid, reason="卡片已补充说明，请按新内容重新送审")
        assert ok is True
        assert kb.claim_task(conn, tid) is not None
        assert kb.request_review(
            conn, tid, reviewer="reviewer-1", summary="按新内容重新送审",
        ) is True
        new = _latest_version(conn, tid)
        assert new["versionId"] != old["versionId"]
        # 旧版本的报告在新周期上提交：版本不匹配，照旧被拒
        with pytest.raises(kb.VerificationLevelBlocked) as ei:
            _complete_with_report_for(conn, tid, old)
        assert "delivery_version_mismatch" in [b["code"] for b in ei.value.blockers]
        assert _complete_with_report_for(conn, tid, new) is True
        assert kb.get_task(conn, tid).status == "done"
        # 完成不再另记版本：验收报告绑定的版本就是最终交付版本
        assert _latest_version(conn, tid)["versionId"] == new["versionId"]
        report_event = [e for e in kb.list_events(conn, tid) if e.kind == "acceptance_report"][-1]
        assert report_event.payload["deliveryVersionId"] == new["versionId"]


def test_implementer_cannot_review_own_work(tmp_path, kanban_home):
    tid = _setup_independent(tmp_path)
    with kbc.connect() as conn:
        with pytest.raises(kb.VerificationLevelBlocked) as ei:
            kb.complete_task(
                conn, tid, summary="自己审自己",
                metadata={"acceptance_report": _report(reviewer="OPS")},
                force=True,
            )
        assert "reviewer_not_independent" in [b["code"] for b in ei.value.blockers]
        assert kb.get_task(conn, tid).status == "review"


def test_stale_report_from_previous_cycle_is_rejected(tmp_path, kanban_home):
    tid = _setup_independent(tmp_path)
    with kbc.connect() as conn:
        events = kb.list_events(conn, tid)
        cycle = [e for e in events if e.kind == "review_requested"][-1]
        report = _report(reviewRequestedEventId=cycle.id - 1)
        with pytest.raises(kb.VerificationLevelBlocked) as ei:
            kb.complete_task(
                conn, tid, summary="重放旧报告",
                metadata={"acceptance_report": report}, force=True,
            )
        assert "stale_review_cycle" in [b["code"] for b in ei.value.blockers]


def test_rework_round_limit_blocks_request_review(tmp_path, kanban_home, monkeypatch):
    tid = _setup_independent(tmp_path)
    with kbc.connect() as conn:
        assert kb.claim_review_task(conn, tid) is not None
        ok, implementer = kb.request_changes(conn, tid, reason="AC-1 没过：hello.txt 缺失")
        assert ok is True and implementer == "ops"
        changes = [e for e in kb.list_events(conn, tid) if e.kind == "changes_requested"]
        assert changes[-1].payload["reworkRound"] == 1

        monkeypatch.setenv("HERMES_KANBAN_MAX_REWORK_ROUNDS", "1")
        assert kb.claim_task(conn, tid) is not None
        ok, reason = kb.request_review(
            conn, tid, reviewer="reviewer-1", summary="返修完成", with_reason=True,
        )
        assert ok is False
        assert "rework rounds exhausted" in (reason or "")
        assert "rework_exhausted" in _kinds(conn, tid)

        # force=True 是人工越过通道；越过本身不改变任务语义
        assert kb.request_review(
            conn, tid, reviewer="reviewer-1", summary="人工越过后再审", force=True,
        ) is True
        assert kb.get_task(conn, tid).status == "review"


def test_override_env_allows_completion_and_records_event(tmp_path, kanban_home, monkeypatch):
    tid = _setup_independent(tmp_path)
    monkeypatch.setenv("HERMES_KANBAN_ACCEPTANCE_OVERRIDE", "1")
    with kbc.connect() as conn:
        ok = kb.complete_task(conn, tid, summary="紧急放行", force=True)
        assert ok is True
        assert "acceptance_override" in _kinds(conn, tid)


def test_independent_without_acceptance_criteria_is_rejected(tmp_path, kanban_home):
    with kbc.connect() as conn:
        tid = kb.create_task(
            conn, title="no acceptance criteria", assignee="ops",
            body="普通任务，没有 AC 行", verification="independent",
        )
        assert kb.claim_task(conn, tid) is not None
        assert kb.request_review(conn, tid, reviewer="reviewer-1", summary="交", force=True) is True
        with pytest.raises(kb.VerificationLevelBlocked) as ei:
            kb.complete_task(
                conn, tid, summary="复核", metadata={"acceptance_report": _report()}, force=True,
            )
        assert "criteria_missing" in [b["code"] for b in ei.value.blockers]
        assert kb.get_task(conn, tid).status == "review"


def test_failing_report_cannot_complete(tmp_path, kanban_home):
    tid = _setup_independent(tmp_path)
    report = _report(verdict="changes_requested")
    report["checks"][0] = {
        "id": "AC-1", "result": "fail", "evidence": "hello.txt 缺失", "note": "断言不成立",
    }
    with kbc.connect() as conn:
        with pytest.raises(kb.VerificationLevelBlocked) as ei:
            kb.complete_task(
                conn, tid, summary="不通过", metadata={"acceptance_report": report}, force=True,
            )
        assert "verdict_not_pass" in [b["code"] for b in ei.value.blockers]
        assert kb.get_task(conn, tid).status == "review"
