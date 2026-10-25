"""交接检查点（604）：写读回环、note 构造、轮换/fork/worker 三接线。"""
import zoneinfo  # noqa: F401 预导入：本机 venv 标准库在真实 hermes home 下，护栏窗口内
                 # 惰性导入会被 home_io_guard 误伤（同 602/603 测试）。
from types import SimpleNamespace

import pytest

from agent import handoff_checkpoint as hc


@pytest.fixture(autouse=True)
def _isolate(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    yield


def test_write_read_roundtrip_and_history_cap():
    for i in range(10):
        record = hc.write_checkpoint("sess/a b", "rotation", {"reason": f"r{i}", "left": "x"})
        assert record is not None
    latest = hc.read_latest("sess/a b")
    assert latest["reason"] == "r9"
    directory = hc._checkpoints_dir()
    import json
    data = json.loads((directory / "sess-a-b.json").read_text(encoding="utf-8"))
    assert len(data["history"]) == hc.HISTORY_CAP  # 有界历史


def test_missing_key_reads_none():
    assert hc.read_latest("no-such") is None


def test_checkpoint_from_turn_mechanical_fields():
    entry = SimpleNamespace(session_key="k1", session_id="sid-9", display_name="支付网关")
    telemetry = {"turns": 30, "cum_api_calls": 410,
                 "heartbeat": {"emitted": 3}, "runaway": {"signal": "polling_repeat"}}
    record = hc.checkpoint_from_turn(
        "k1", entry, {"final_response": "step 7 done. next: step 8"}, telemetry, "cumulative-api-calls")
    assert record["pointers"]["prev_session_id"] == "sid-9"
    assert record["counters"]["cum_api_calls"] == 410
    assert record["counters"]["runaway_signal"] == "polling_repeat"
    assert "step 7 done" in record["last_output_tail"]
    assert "evidence anchor" in record["rules"]


def test_checkpoint_note_contains_pointer_and_rules():
    record = hc.checkpoint_from_turn(
        "k1", SimpleNamespace(session_key="k1", session_id="s1", display_name=""),
        {"final_response": "tail text"}, None, "watermark-stuck")
    note = hc.build_checkpoint_note(record)
    assert "[HANDOFF CHECKPOINT" in note
    assert "s1" in note
    assert "no evidence, no PASS" in note


def test_worker_context_block_lists_recent():
    assert hc.worker_context_block() == ""  # 无检查点时空段
    hc.write_checkpoint("alpha", "rotation", {"reason": "empty-streak", "left": "verify step 3"})
    hc.write_checkpoint("beta", "fork", {"reason": "", "left": ""})
    block = hc.worker_context_block(limit=2)
    assert "## Recent session handoff checkpoints" in block
    assert "alpha" in block and "beta" in block
    assert "mechanical checkpoints" in block


@pytest.mark.asyncio
async def test_wiring_rotation_auto_writes_checkpoint_and_sidecar(tmp_path, monkeypatch):
    from gateway import session_rotation as sr
    from gateway import session_telemetry as st
    sr.reset_book()
    st.reset_state()
    st._STATE["k1"] = {"turns": 20, "cum_api_calls": 401, "watermark_pct": 40.0, "empty_streak": 0}
    monkeypatch.setenv("HERMES_SESSION_ROTATION", "auto")
    sidecar_notes = []

    class _Store:
        async def reset_session(self, key, display_name=None):
            return SimpleNamespace(session_key=key, session_id="fresh")

    gw = SimpleNamespace(
        async_session_store=_Store(),
        _evict_cached_agent=lambda k: None,
        _clear_conversation_scope=lambda k, reason=None: None,
        _sync_telegram_topic_binding=lambda *a, **kw: None,
        _set_pending_turn_sidecar_notes=lambda k, notes: sidecar_notes.extend(notes),
    )
    response, entry = await sr.maybe_rotate_session(
        gw, {"api_calls": 2, "final_response": "working"},
        "ok", SimpleNamespace(session_key="k1", session_id="old", display_name="目标"), "k1", None)
    assert entry.session_id == "fresh"
    assert sidecar_notes and "[HANDOFF CHECKPOINT" in sidecar_notes[0]
    saved = hc.read_latest("k1")
    assert saved is not None and saved["source"] == "rotation"
    assert saved["counters"]["cum_api_calls"] == 401
    assert "目标" in saved["objective"]


def test_wiring_worker_context_and_fork_reference_module():
    from pathlib import Path
    import hermes_cli.kanban_db as kdb
    source = Path(kdb.__file__).read_text(encoding="utf-8")
    assert "from agent.handoff_checkpoint import worker_context_block" in source
    import gateway.platforms.api_server as srv
    source = Path(srv.__file__).read_text(encoding="utf-8")
    assert "from agent.handoff_checkpoint import write_checkpoint" in source
