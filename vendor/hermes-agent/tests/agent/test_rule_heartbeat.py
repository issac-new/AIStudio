"""Rule heartbeat (601)：取模注入、缓存契约（仅最新未持久化 tool 行）、旋钮归一化。"""
from types import SimpleNamespace

import pytest

from agent.context_compressor import _DB_PERSISTED_MARKER
from agent.rule_heartbeat import (
    DEFAULT_HEARTBEAT_INTERVAL,
    MIN_HEARTBEAT_INTERVAL,
    heartbeat_counters,
    maybe_inject_rule_heartbeat,
    parse_heartbeat_config,
    resolve_heartbeat_interval,
)


def _fake_agent(interval=None, tools=("kanban_complete",)):
    return SimpleNamespace(
        _interrupt_requested=False,
        rule_heartbeat_interval=interval,
        valid_tool_names=tools,
        session_id="s-test",
    )


def _messages(persisted=False):
    row = {"role": "tool", "tool_call_id": "t1", "content": "result"}
    if persisted:
        row[_DB_PERSISTED_MARKER] = True
    return [{"role": "user", "content": "work"}, row]


def _fire(agent, messages, tries=10):
    """模拟逐迭代调用直到命中取模点（interval=1 会被夹到 3）。"""
    for _ in range(tries):
        if maybe_inject_rule_heartbeat(agent, messages):
            return True
    return False


def test_interval_resolution_default_off_and_clamp():
    assert resolve_heartbeat_interval(_fake_agent()) == DEFAULT_HEARTBEAT_INTERVAL
    assert resolve_heartbeat_interval(_fake_agent(0)) == 0
    assert resolve_heartbeat_interval(_fake_agent(1)) == MIN_HEARTBEAT_INTERVAL
    assert resolve_heartbeat_interval(_fake_agent(2)) == MIN_HEARTBEAT_INTERVAL
    assert resolve_heartbeat_interval(_fake_agent(24)) == 24
    assert resolve_heartbeat_interval(_fake_agent("bogus")) == DEFAULT_HEARTBEAT_INTERVAL


def test_parse_heartbeat_config():
    assert parse_heartbeat_config(None) is None
    assert parse_heartbeat_config(0) == 0
    assert parse_heartbeat_config(12) == 12
    assert parse_heartbeat_config(-5) is None
    assert parse_heartbeat_config("x") is None


def test_fires_on_modulo_and_counts_emissions():
    agent = _fake_agent(interval=3)
    fired = 0
    for step in range(1, 10):
        messages = _messages()
        if maybe_inject_rule_heartbeat(agent, messages):
            fired += 1
            assert "rule heartbeat #" in messages[-1]["content"]
        agent._rule_heartbeat_step = step
    assert fired == 3  # steps 3, 6, 9
    counters = heartbeat_counters(agent)
    assert counters["emitted"] == 3 and counters["interval"] == 3


def test_no_injection_when_disabled():
    agent = _fake_agent(interval=0)
    for _ in range(5):
        messages = _messages()
        assert maybe_inject_rule_heartbeat(agent, messages) is False
        assert messages[-1]["content"] == "result"


def test_cache_contract_tool_tail_only():
    agent = _fake_agent(interval=1)
    # 非持久化 tool 行：注入；持久化行：跳过（历史行绝不动）。
    messages = _messages(persisted=False)
    assert _fire(agent, messages) is True
    persisted_messages = _messages(persisted=True)
    assert _fire(agent, persisted_messages) is False
    assert persisted_messages[-1]["content"] == "result"
    # 尾行是 user 行（回合首个迭代）：跳过且不崩。
    user_tail = [{"role": "user", "content": "work"}]
    assert _fire(agent, user_tail) is False


def test_multimodal_content_append():
    agent = _fake_agent(interval=1)
    messages = [
        {"role": "user", "content": "work"},
        {"role": "tool", "tool_call_id": "t1",
         "content": [{"type": "text", "text": "pic"}]},
    ]
    assert _fire(agent, messages) is True
    assert messages[-1]["content"][-1]["type"] == "text"
    assert "rule heartbeat #" in messages[-1]["content"][-1]["text"]
    assert messages[-1]["content"][0] == {"type": "text", "text": "pic"}


def test_interrupted_agent_skips():
    agent = _fake_agent(interval=1)
    agent._interrupt_requested = True
    messages = _messages()
    assert maybe_inject_rule_heartbeat(agent, messages) is False
    assert messages[-1]["content"] == "result"


def test_kanban_worker_variant(monkeypatch, tmp_path):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    monkeypatch.setenv("HERMES_KANBAN_TASK", "T-1")
    import agent.delegation_context as dc
    monkeypatch.setattr(dc, "is_dispatcher_owned_worker_context", lambda: True)
    agent = _fake_agent(interval=1, tools=("kanban_complete", "read_file"))
    messages = _messages()
    assert _fire(agent, messages) is True
    assert "acceptance criteria" in messages[-1]["content"]
    # 非 worker（无环境变量）：无 kanban 附言。
    monkeypatch.delenv("HERMES_KANBAN_TASK")
    agent2 = _fake_agent(interval=1)
    messages2 = _messages()
    assert _fire(agent2, messages2) is True
    assert "acceptance criteria" not in messages2[-1]["content"]


def test_extra_section_from_home_charter(monkeypatch, tmp_path):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    (tmp_path / "rule-heartbeat.md").write_text("自定义条款第一条", encoding="utf-8")
    agent = _fake_agent(interval=1)
    messages = _messages()
    assert _fire(agent, messages) is True
    assert "自定义条款第一条" in messages[-1]["content"]
    # 缺席时不追加段。
    (tmp_path / "rule-heartbeat.md").unlink()
    agent2 = _fake_agent(interval=1)
    messages2 = _messages()
    assert _fire(agent2, messages2) is True
    assert "Deployed charter" not in messages2[-1]["content"]


def test_wiring_prepared_in_iteration_prep():
    """TestWiring（同 401 先例）：prepare_iteration 消费心跳注入。"""
    from pathlib import Path
    import agent.turn_iteration_prep as prep
    source = Path(prep.__file__).read_text(encoding="utf-8")
    assert "from agent.rule_heartbeat import maybe_inject_rule_heartbeat" in source
    assert "maybe_inject_rule_heartbeat(agent, messages)" in source


def test_wiring_config_knob_declared():
    from pathlib import Path
    import agent.agent_init as init
    source = Path(init.__file__).read_text(encoding="utf-8")
    assert "rule_heartbeat_interval" in source
