"""完成契约门（A 层）接线测试：env 契约、源哈希、warn/enforce 分支。"""
from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from completion_contract import CONTRACT_ENV, SOURCE_SHA_ENV, contract_source_sha256, derive_contract
from tools import kanban_tools


def _task(body: str, workspace: Path) -> SimpleNamespace:
    return SimpleNamespace(body=body, workspace_path=str(workspace), id="t-1")


def _workspace(tmp_path: Path) -> Path:
    (tmp_path / "dist").mkdir()
    (tmp_path / "dist" / "app.js").write_text("ok\n", encoding="utf8")
    (tmp_path / "tap.txt").write_text("1..1\nok 1 - case\n", encoding="utf8")
    return tmp_path


def _receipt() -> dict:
    return {
        "version": 1,
        "criteria": [{
            "id": "AC-1",
            "status": "pass",
            "evidence": [{"path": "dist/app.js"}],
        }],
        "artifacts": ["dist/app.js"],
        "verifications": [{"command": "npm test", "exitCode": 0, "report": "tap.txt", "format": "tap"}],
    }


def test_gate_returns_validated_receipt(tmp_path, monkeypatch):
    ws = _workspace(tmp_path)
    body = "AC-1: 产物存在且测试通过\n"
    monkeypatch.setenv(CONTRACT_ENV, json.dumps(derive_contract(body), ensure_ascii=False))
    monkeypatch.setenv(SOURCE_SHA_ENV, contract_source_sha256(body))
    result = kanban_tools._completion_contract_gate(None, None, _task(body, ws), "t-1", {"receipt": _receipt()})
    assert result["ok"] is True
    assert result["totals"] == {"tests": 1, "failures": 0}


def test_gate_blocks_missing_receipt_and_records_event(tmp_path, monkeypatch):
    ws = _workspace(tmp_path)
    body = "AC-1: 必须回执\n"
    monkeypatch.setenv(CONTRACT_ENV, json.dumps(derive_contract(body), ensure_ascii=False))
    monkeypatch.setenv(SOURCE_SHA_ENV, contract_source_sha256(body))
    events: list[tuple] = []
    monkeypatch.setattr(
        kanban_tools, "_record_completion_contract_event",
        lambda conn, tid, kind, payload: events.append((tid, kind, payload)),
    )
    with pytest.raises(ValueError, match="缺少结构化回执"):
        kanban_tools._completion_contract_gate(None, None, _task(body, ws), "t-1", {})
    assert events and events[0][1] == "completion_blocked_contract"
    assert events[0][2]["reason"] == "receipt_violation"


def test_gate_blocks_contract_source_edit(tmp_path, monkeypatch):
    ws = _workspace(tmp_path)
    original = "AC-1: 原始验收\n"
    edited = "AC-1: 原始验收\nAC-2: 派发后新增\n"
    monkeypatch.setenv(CONTRACT_ENV, json.dumps(derive_contract(original), ensure_ascii=False))
    monkeypatch.setenv(SOURCE_SHA_ENV, contract_source_sha256(original))
    monkeypatch.setattr(kanban_tools, "_record_completion_contract_event", lambda *a, **k: None)
    with pytest.raises(ValueError, match="changed after dispatch"):
        kanban_tools._completion_contract_gate(None, None, _task(edited, ws), "t-1", {"receipt": _receipt()})


def test_gate_warn_mode_returns_warnings_without_blocking(tmp_path, monkeypatch):
    ws = _workspace(tmp_path)
    body = 'AC-1: x\n```dod\n{"mode": "warn"}\n```\n'
    monkeypatch.setenv(CONTRACT_ENV, json.dumps(derive_contract(body), ensure_ascii=False))
    monkeypatch.setenv(SOURCE_SHA_ENV, contract_source_sha256(body))
    result = kanban_tools._completion_contract_gate(None, None, _task(body, ws), "t-1", {})
    assert result["ok"] is False
    assert result["warnings"]


def test_gate_is_noop_without_contract(tmp_path, monkeypatch):
    monkeypatch.delenv(CONTRACT_ENV, raising=False)
    monkeypatch.delenv(SOURCE_SHA_ENV, raising=False)
    assert kanban_tools._completion_contract_gate(None, None, _task("no ac", tmp_path), "t-1", {}) is None
