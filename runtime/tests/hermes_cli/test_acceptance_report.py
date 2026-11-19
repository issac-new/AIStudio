"""逐条 AC 验收报告纯函数测试（结果交付批，2026-11-19）。

覆盖：合法报告归一、自审拒绝、身份缺失、AC 条数/ID 不一致、重复判定、
fail/na 缺 note、总体结论矛盾、旧评审周期重放、无 AC 可判定、证据列表归一。
"""
from __future__ import annotations

import pytest

from hermes_cli.acceptance_report import (
    AcceptanceReportViolation,
    expected_criteria_ids,
    norm_ac_id,
    validate_report,
)

IMPLEMENTER = "implementer-1"
REVIEWER = "reviewer-1"
CYCLE = 42


def _report(**overrides):
    base = {
        "version": 1,
        "reviewer": REVIEWER,
        "reviewerKind": "agent",
        "reviewRequestedEventId": CYCLE,
        "verdict": "pass",
        "summary": "逐条复核通过",
        "checks": [
            {"id": "AC-1", "result": "pass", "evidence": "npx vitest run a.test.ts：12 passed"},
            {"id": "AC-2", "result": "pass", "evidence": ["dist/app.js sha256=...", "退出码 0"]},
        ],
    }
    base.update(overrides)
    return base


def _codes(exc: AcceptanceReportViolation) -> list[str]:
    return [b["code"] for b in exc.blockers]


def test_valid_report_normalizes_and_orders_checks():
    normalized = validate_report(
        _report(), expected_ids=["AC-1", "AC-2"], implementer=IMPLEMENTER,
        current_review_event_id=CYCLE,
    )
    assert normalized["version"] == 1
    assert normalized["reviewer"] == REVIEWER
    assert normalized["reviewRequestedEventId"] == CYCLE
    assert normalized["verdict"] == "pass"
    assert [c["id"] for c in normalized["checks"]] == ["AC-1", "AC-2"]
    assert normalized["checks"][1]["evidence"] == "dist/app.js sha256=...；退出码 0"


def test_missing_report_is_rejected_with_structured_blocker():
    with pytest.raises(AcceptanceReportViolation) as ei:
        validate_report(None, expected_ids=["AC-1"], implementer=IMPLEMENTER,
                        current_review_event_id=CYCLE)
    assert _codes(ei.value) == ["acceptance_report_missing"]
    assert ei.value.blockers[0]["action"]


def test_reviewer_equal_implementer_is_self_review():
    with pytest.raises(AcceptanceReportViolation) as ei:
        validate_report(_report(reviewer="  IMPLEMENTER-1 "), expected_ids=["AC-1", "AC-2"],
                        implementer=IMPLEMENTER, current_review_event_id=CYCLE)
    assert "reviewer_not_independent" in _codes(ei.value)


def test_unknown_implementer_fails_closed():
    with pytest.raises(AcceptanceReportViolation) as ei:
        validate_report(_report(), expected_ids=["AC-1", "AC-2"],
                        implementer=None, current_review_event_id=CYCLE)
    assert "implementer_unknown" in _codes(ei.value)


def test_missing_cycle_fails_closed():
    with pytest.raises(AcceptanceReportViolation) as ei:
        validate_report(_report(reviewRequestedEventId=None), expected_ids=["AC-1", "AC-2"],
                        implementer=IMPLEMENTER, current_review_event_id=None)
    assert "review_cycle_missing" in _codes(ei.value)


def test_stale_review_cycle_is_rejected():
    with pytest.raises(AcceptanceReportViolation) as ei:
        validate_report(_report(reviewRequestedEventId=CYCLE - 1), expected_ids=["AC-1", "AC-2"],
                        implementer=IMPLEMENTER, current_review_event_id=CYCLE)
    assert "stale_review_cycle" in _codes(ei.value)


def test_missing_criterion_is_rejected():
    report = _report()
    report["checks"] = report["checks"][:1]
    with pytest.raises(AcceptanceReportViolation) as ei:
        validate_report(report, expected_ids=["AC-1", "AC-2"], implementer=IMPLEMENTER,
                        current_review_event_id=CYCLE)
    assert "criteria_mismatch" in _codes(ei.value)


def test_extra_criterion_is_rejected():
    report = _report()
    report["checks"].append({"id": "AC-3", "result": "pass", "evidence": "x"})
    with pytest.raises(AcceptanceReportViolation) as ei:
        validate_report(report, expected_ids=["AC-1", "AC-2"], implementer=IMPLEMENTER,
                        current_review_event_id=CYCLE)
    assert "criteria_mismatch" in _codes(ei.value)


def test_duplicate_criterion_is_rejected():
    report = _report()
    report["checks"][1]["id"] = "AC-1"
    with pytest.raises(AcceptanceReportViolation) as ei:
        validate_report(report, expected_ids=["AC-1", "AC-2"], implementer=IMPLEMENTER,
                        current_review_event_id=CYCLE)
    assert "criteria_mismatch" in _codes(ei.value)


def test_fail_without_note_is_rejected():
    report = _report(verdict="changes_requested")
    report["checks"][0] = {"id": "AC-1", "result": "fail", "evidence": "测试红了"}
    with pytest.raises(AcceptanceReportViolation) as ei:
        validate_report(report, expected_ids=["AC-1", "AC-2"], implementer=IMPLEMENTER,
                        current_review_event_id=CYCLE, require_pass=False)
    assert "report_inconsistent" in _codes(ei.value)


def test_na_without_note_is_rejected():
    report = _report()
    report["checks"][0] = {"id": "AC-1", "result": "na", "evidence": "无法判定"}
    with pytest.raises(AcceptanceReportViolation) as ei:
        validate_report(report, expected_ids=["AC-1", "AC-2"], implementer=IMPLEMENTER,
                        current_review_event_id=CYCLE)
    assert "report_inconsistent" in _codes(ei.value)


def test_verdict_pass_with_fail_check_is_rejected():
    report = _report()
    report["checks"][0] = {"id": "AC-1", "result": "fail", "evidence": "红了", "note": "断言失败"}
    with pytest.raises(AcceptanceReportViolation) as ei:
        validate_report(report, expected_ids=["AC-1", "AC-2"], implementer=IMPLEMENTER,
                        current_review_event_id=CYCLE)
    assert "report_inconsistent" in _codes(ei.value)


def test_verdict_changes_requested_with_all_pass_is_rejected():
    report = _report(verdict="changes_requested")
    with pytest.raises(AcceptanceReportViolation) as ei:
        validate_report(report, expected_ids=["AC-1", "AC-2"], implementer=IMPLEMENTER,
                        current_review_event_id=CYCLE, require_pass=False)
    assert "report_inconsistent" in _codes(ei.value)


def test_failing_report_cannot_complete():
    report = _report(verdict="changes_requested")
    report["checks"][0] = {"id": "AC-1", "result": "fail", "evidence": "红了", "note": "断言失败"}
    with pytest.raises(AcceptanceReportViolation) as ei:
        validate_report(report, expected_ids=["AC-1", "AC-2"], implementer=IMPLEMENTER,
                        current_review_event_id=CYCLE, require_pass=True)
    assert "verdict_not_pass" in _codes(ei.value)


def test_no_criteria_is_rejected():
    with pytest.raises(AcceptanceReportViolation) as ei:
        validate_report(_report(), expected_ids=[], implementer=IMPLEMENTER,
                        current_review_event_id=CYCLE)
    assert "criteria_missing" in _codes(ei.value)


def test_missing_evidence_is_rejected():
    report = _report()
    report["checks"][0]["evidence"] = "   "
    with pytest.raises(AcceptanceReportViolation) as ei:
        validate_report(report, expected_ids=["AC-1", "AC-2"], implementer=IMPLEMENTER,
                        current_review_event_id=CYCLE)
    assert "evidence_missing" in _codes(ei.value)


def test_norm_ac_id_and_expected_ids_are_stable():
    assert norm_ac_id("ac 7") == "AC-7"
    assert norm_ac_id("AC_2") == "AC-2"
    assert expected_criteria_ids([{"id": "AC-1"}, {"id": "ac1"}, {"id": "AC-2"}]) == ["AC-1", "AC-2"]
