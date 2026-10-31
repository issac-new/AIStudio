"""内核完成契约门测试（A 层下沉 complete_task，2026-11-01 dod-drill 实锤后）。

覆盖：无回执拒绝（事件留痕）、坏回执拒绝、好回执过门、契约源被改拒绝、
无契约直通。force=True 绕过 live-claim 栅（单测焦点在契约门，不在属主栅）。
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from completion_contract import CONTRACT_ENV, SOURCE_SHA_ENV, contract_source_sha256, derive_contract
from hermes_cli import kanban_db as kb
from hermes_cli import kanban_db_connect as kbc


BODY = "任务正文\nAC-1: 产物存在\nAC-2: TAP 报告零失败\n"


@pytest.fixture
def kanban_home(tmp_path, monkeypatch):
    home = tmp_path / ".hermes"
    home.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    monkeypatch.delenv(CONTRACT_ENV, raising=False)
    monkeypatch.delenv(SOURCE_SHA_ENV, raising=False)
    kb.init_db()
    return home


def _receipt(ws: Path) -> dict:
    return {
        "version": 1,
        "criteria": [
            {"id": "AC-1", "status": "pass", "evidence": [{"path": "hello.txt"}]},
            {"id": "AC-2", "status": "pass", "evidence": [{"kind": "test_report", "path": "tap.txt"}]},
        ],
        "artifacts": ["hello.txt"],
        "verifications": [{"command": "cat tap.txt", "exitCode": 0, "report": "tap.txt", "format": "tap"}],
    }


def _setup_task(ws: Path) -> str:
    ws.mkdir(parents=True, exist_ok=True)
    (ws / "hello.txt").write_text("ok\n", encoding="utf8")
    (ws / "tap.txt").write_text("1..2\nok 1 - a\nok 2 - b\n", encoding="utf8")
    with kbc.connect() as conn:
        tid = kb.create_task(conn, title="contract gate", assignee="ops", body=BODY)
        kb.claim_task(conn, tid)
    return tid


def _kinds(conn, tid: str) -> list:
    return [e.kind for e in kb.list_events(conn, tid)]


def test_kernel_gate_blocks_completion_without_receipt(tmp_path, kanban_home, monkeypatch):
    ws = tmp_path / "ws"
    tid = _setup_task(ws)
    monkeypatch.setenv(CONTRACT_ENV, json.dumps(derive_contract(BODY), ensure_ascii=False))
    monkeypatch.setenv(SOURCE_SHA_ENV, contract_source_sha256(BODY))
    with kbc.connect() as conn:
        with pytest.raises(ValueError, match="completion contract"):
            kb.complete_task(conn, tid, summary="没带回执", workspace=str(ws), force=True)
        assert kb.get_task(conn, tid).status != "done"
        assert "completion_blocked_contract" in _kinds(conn, tid)


def test_kernel_gate_blocks_bad_receipt_and_keeps_task_open(tmp_path, kanban_home, monkeypatch):
    ws = tmp_path / "ws"
    tid = _setup_task(ws)
    monkeypatch.setenv(CONTRACT_ENV, json.dumps(derive_contract(BODY), ensure_ascii=False))
    monkeypatch.setenv(SOURCE_SHA_ENV, contract_source_sha256(BODY))
    bad = _receipt(ws)
    bad["criteria"][0]["evidence"][0]["path"] = "missing.txt"
    with kbc.connect() as conn:
        with pytest.raises(ValueError, match="文件不存在|completion contract"):
            kb.complete_task(conn, tid, summary="坏回执", receipt=bad, workspace=str(ws), force=True)
        assert kb.get_task(conn, tid).status != "done"


def test_kernel_gate_passes_good_receipt(tmp_path, kanban_home, monkeypatch):
    ws = tmp_path / "ws"
    tid = _setup_task(ws)
    monkeypatch.setenv(CONTRACT_ENV, json.dumps(derive_contract(BODY), ensure_ascii=False))
    monkeypatch.setenv(SOURCE_SHA_ENV, contract_source_sha256(BODY))
    with kbc.connect() as conn:
        ok = kb.complete_task(conn, tid, summary="带回执完成", receipt=_receipt(ws), workspace=str(ws), force=True)
        assert ok is True
        assert kb.get_task(conn, tid).status == "done"
        assert "completion_blocked_contract" not in _kinds(conn, tid)


def test_kernel_gate_blocks_edited_contract_source(tmp_path, kanban_home, monkeypatch):
    ws = tmp_path / "ws"
    tid = _setup_task(ws)
    monkeypatch.setenv(CONTRACT_ENV, json.dumps(derive_contract(BODY), ensure_ascii=False))
    monkeypatch.setenv(SOURCE_SHA_ENV, contract_source_sha256(BODY))
    edited = BODY + "AC-3: 派发后偷加\n"
    with kbc.connect() as conn:
        conn.execute("UPDATE tasks SET body = ? WHERE id = ?", (edited, tid))
        conn.commit()
        with pytest.raises(ValueError, match="changed after dispatch"):
            kb.complete_task(conn, tid, summary="改过卡面", receipt=_receipt(ws), workspace=str(ws), force=True)


def test_kernel_gate_noop_without_contract(tmp_path, kanban_home):
    ws = tmp_path / "ws"
    tid = _setup_task(ws)
    with kbc.connect() as conn:
        assert kb.complete_task(conn, tid, summary="无契约直通", workspace=str(ws), force=True) is True
