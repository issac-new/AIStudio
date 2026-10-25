"""会话遥测 sidecar（602）：累计口径、fail-open、LRU 有界、原子写。"""
import zoneinfo  # noqa: F401 预导入：本机 venv 标准库位于真实 hermes home 下，护栏
                 # 窗口内惰性导入 zoneinfo 会被 home_io_guard 误伤并级联炸掉报告器。
from types import SimpleNamespace

import pytest

from gateway import session_telemetry as st


@pytest.fixture(autouse=True)
def _isolate(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    st.reset_state()
    yield
    st.reset_state()


def _session_entry(key="k1", sid="s1", total=12345):
    return SimpleNamespace(session_key=key, session_id=sid, total_tokens=total, output_tokens=678)


def _result(api=5, prompt=90000, ctx=100000, model="m1", final="done", tools=None):
    return {
        "api_calls": api, "last_prompt_tokens": prompt, "context_length": ctx,
        "model": model, "final_response": final,
        "tools": ["t"] if tools is None else tools,
    }


def test_records_watermark_and_cumulative():
    gw = SimpleNamespace(_agent_cache={})
    st.record_turn_telemetry(gw, _session_entry(), _result(), SimpleNamespace(platform=SimpleNamespace(value="matrix")))
    entry = st.read_state("k1")
    assert entry is not None
    assert entry["watermark_pct"] == 90.0
    assert entry["turns"] == 1 and entry["cum_api_calls"] == 5
    assert entry["platform"] == "matrix" and entry["model"] == "m1"
    assert entry["session_total_tokens"] == 12345
    st.record_turn_telemetry(gw, _session_entry(), _result(api=3), SimpleNamespace(platform=None))
    entry = st.read_state("k1")
    assert entry["turns"] == 2 and entry["cum_api_calls"] == 8


def test_empty_streak_resets_on_progress():
    gw = SimpleNamespace(_agent_cache={})
    empty = _result(api=4, final="", tools=[])
    st.record_turn_telemetry(gw, _session_entry(), empty, None)
    st.record_turn_telemetry(gw, _session_entry(), empty, None)
    assert st.read_state("k1")["empty_streak"] == 2
    st.record_turn_telemetry(gw, _session_entry(), _result(), None)
    assert st.read_state("k1")["empty_streak"] == 0


def test_rotation_note_increments():
    st.note_rotation("k9", reason="watermark")
    entry = st.read_state("k9")
    assert entry["rotations"] == 1 and entry["last_rotation_reason"] == "watermark"


def test_agent_health_counters_via_cache():
    agent = SimpleNamespace(
        _runaway_guard=object(),
        _last_runaway_signal=SimpleNamespace(signal="polling_repeat", tool="t", count=4),
        _runaway_decisions=2,
        _rule_heartbeat_step=12, _rule_heartbeats_emitted=1, rule_heartbeat_interval=12,
    )
    lock_free_gw = SimpleNamespace(_agent_cache={"k1": (agent, "sig", 3, "s1")})
    st.record_turn_telemetry(lock_free_gw, _session_entry(), _result(), None)
    entry = st.read_state("k1")
    assert entry["runaway"]["signal"] == "polling_repeat"
    assert entry["runaway"]["decisions"] == 2
    assert entry["heartbeat"]["emitted"] == 1


def test_fail_open_on_bad_inputs():
    st.record_turn_telemetry(None, None, None, None)  # 不得抛
    st.record_turn_telemetry(SimpleNamespace(), _session_entry(), {"api_calls": "x"}, None)
    assert st.read_state("k1") is None or st.read_state("k1").get("turns") == 1


def test_lru_bound_and_stale_eviction(monkeypatch):
    for i in range(st.MAX_SESSIONS + 5):
        st.record_turn_telemetry(
            SimpleNamespace(_agent_cache={}),
            _session_entry(key=f"k{i:03d}"), _result(api=1), None,
        )
    data = st.read_state()
    assert len(data) <= st.MAX_SESSIONS


def test_wiring_run_turn_hook_present():
    from pathlib import Path
    import gateway.run_turn as rt
    source = Path(rt.__file__).read_text(encoding="utf-8")
    assert "from gateway.session_telemetry import record_turn_telemetry" in source
