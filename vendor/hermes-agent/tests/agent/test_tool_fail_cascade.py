"""Sequential fail-cascade for tool-call batches (MiMo-Code gate semantics).

When a write/barrier-class (sequential) call — write_file / patch / terminal —
fails, the remaining calls of the same model response are skipped with an
explicit cancellation marker instead of executing a stale half-plan (classic
incident: ``patch`` fails on old_string mismatch, the batched ``git commit``
still ran and committed partial state).

Scope (2026-09-24 P5, mirroring MiMo ``tool/gate.ts``; 触发面收窄见 P5 复审):

* only write/barrier-class failures cascade — read-tool failures (empty
  observation / safety denial, e.g. ``read_file`` "File not found") never
  cancel later calls;
* parallel (read-only, non-conflicting) runs NEVER cascade a sibling failure;
* cascade spans later segments and later approval groups of the same response;
* ``HERMES_TOOL_FAIL_CASCADE=0`` restores pre-cascade behavior;
* success paths are byte-identical to before (no flag reads on success).
"""

import json
import threading
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from run_agent import AIAgent


def _tc(name="web_search", arguments="{}", call_id=None):
    return SimpleNamespace(
        id=call_id or f"call_{name}",
        function=SimpleNamespace(name=name, arguments=arguments),
    )


def _make_tool_defs(*names: str) -> list:
    return [
        {
            "type": "function",
            "function": {
                "name": name,
                "description": f"{name} (test stub)",
                "parameters": {"type": "object", "properties": {}},
            },
        }
        for name in names
    ]


@pytest.fixture
def agent():
    with (
        patch(
            "model_tools.get_tool_definitions",
            return_value=_make_tool_defs("web_search", "terminal", "read_file", "write_file", "patch"),
        ),
        patch("model_tools.check_toolset_requirements", return_value={}),
        patch("agent.process_bootstrap.OpenAI"),
    ):
        a = AIAgent(
            api_key="test-key-1234567890",
            base_url="https://openrouter.ai/api/v1",
            quiet_mode=True,
            skip_context_files=True,
            skip_memory=True,
        )
        a.client = MagicMock()
        return a


def _ok():
    return json.dumps({"success": True})


def _fail(tool_name: str):
    # terminal 的失败判定走 exit_code != 0 分支；其余工具走 success=False+error。
    if tool_name == "terminal":
        return json.dumps({"exit_code": 1, "error": "boom"})
    return json.dumps({"success": False, "error": "boom"})


class TestSequentialFailCascade:
    def test_sequential_failure_skips_remaining_with_marker(self, agent):
        """t2 fails -> t3 never executes and gets one cascade marker result."""
        calls = [
            _tc("terminal", '{"command":"a"}', call_id="t1"),
            _tc("terminal", '{"command":"b"}', call_id="t2"),
            _tc("terminal", '{"command":"c"}', call_id="t3"),
        ]
        msg = SimpleNamespace(content="", tool_calls=calls)
        messages = []
        executed = []
        lock = threading.Lock()

        def fake_handle(name, args, task_id, **kwargs):
            with lock:
                executed.append(kwargs["tool_call_id"])
            return _fail(name) if kwargs["tool_call_id"] == "t2" else _ok()

        with patch("model_tools.handle_function_call", side_effect=fake_handle):
            agent._execute_tool_calls(msg, messages, "task-1")

        assert executed == ["t1", "t2"]
        assert [m["tool_call_id"] for m in messages] == ["t1", "t2", "t3"]
        marker = messages[-1]["content"]
        assert "earlier tool call" in marker and "t3" not in executed
        assert getattr(agent, "_tool_fail_cascade_active", False) is True

    def test_all_success_executes_everything(self, agent):
        calls = [
            _tc("terminal", '{"command":"a"}', call_id="t1"),
            _tc("terminal", '{"command":"b"}', call_id="t2"),
        ]
        msg = SimpleNamespace(content="", tool_calls=calls)
        messages = []
        executed = []

        def fake_handle(name, args, task_id, **kwargs):
            executed.append(kwargs["tool_call_id"])
            return _ok()

        with patch("model_tools.handle_function_call", side_effect=fake_handle):
            agent._execute_tool_calls(msg, messages, "task-1")

        assert executed == ["t1", "t2"]
        assert getattr(agent, "_tool_fail_cascade_active", False) is False
        for m in messages:
            assert "earlier tool call" not in str(m.get("content", ""))

    def test_env_off_restores_pre_cascade_behavior(self, agent, monkeypatch):
        monkeypatch.setenv("HERMES_TOOL_FAIL_CASCADE", "0")
        calls = [
            _tc("terminal", '{"command":"a"}', call_id="t1"),
            _tc("terminal", '{"command":"b"}', call_id="t2"),
            _tc("terminal", '{"command":"c"}', call_id="t3"),
        ]
        msg = SimpleNamespace(content="", tool_calls=calls)
        messages = []
        executed = []

        def fake_handle(name, args, task_id, **kwargs):
            executed.append(kwargs["tool_call_id"])
            return _fail(name) if kwargs["tool_call_id"] == "t1" else _ok()

        with patch("model_tools.handle_function_call", side_effect=fake_handle):
            agent._execute_tool_calls(msg, messages, "task-1")

        assert executed == ["t1", "t2", "t3"]

    def test_read_failure_does_not_cancel_later_calls(self, agent):
        """读类失败（空观测/安全拒绝）只是展示事件：[read_file 不存在, terminal]
        里 terminal 必须照常执行（回归：曾被 _detect_tool_failure 展示启发式误伤）。"""
        calls = [
            _tc("read_file", '{"path":"/nope/never.txt"}', call_id="r1"),
            _tc("terminal", '{"command":"git commit"}', call_id="t1"),
        ]
        msg = SimpleNamespace(content="", tool_calls=calls)
        messages = []
        executed = []

        def fake_handle(name, args, task_id, **kwargs):
            executed.append(kwargs["tool_call_id"])
            return _fail(name) if kwargs["tool_call_id"] == "r1" else _ok()

        with patch("model_tools.handle_function_call", side_effect=fake_handle):
            agent._execute_tool_calls(msg, messages, "task-1")

        assert executed == ["r1", "t1"]
        assert getattr(agent, "_tool_fail_cascade_active", False) is False
        for m in messages:
            assert "earlier tool call" not in str(m.get("content", ""))

    def test_write_failure_cancels_later_calls(self, agent):
        """写类失败取消后续（经典事故回归）：patch 失败 → 批内 git commit 被取消。"""
        calls = [
            _tc("patch", '{"path":"a.txt","old":"x","new":"y"}', call_id="p1"),
            _tc("terminal", '{"command":"git commit"}', call_id="t1"),
        ]
        msg = SimpleNamespace(content="", tool_calls=calls)
        messages = []
        executed = []

        def fake_handle(name, args, task_id, **kwargs):
            executed.append(kwargs["tool_call_id"])
            return _fail(name) if kwargs["tool_call_id"] == "p1" else _ok()

        with patch("model_tools.handle_function_call", side_effect=fake_handle):
            agent._execute_tool_calls(msg, messages, "task-1")

        assert executed == ["p1"]
        assert [m["tool_call_id"] for m in messages] == ["p1", "t1"]
        assert "earlier tool call" in messages[-1]["content"]
        assert getattr(agent, "_tool_fail_cascade_active", False) is True

    def test_barrier_failure_drains_later_parallel_segment(self, agent):
        """[s1,s2 parallel] [t1 barrier, fails] [s3,s4 parallel]: the trailing
        read segment is drained with markers, never executed."""
        calls = [
            _tc("web_search", '{"query":"a"}', call_id="s1"),
            _tc("web_search", '{"query":"b"}', call_id="s2"),
            _tc("terminal", '{"command":"x"}', call_id="t1"),
            _tc("web_search", '{"query":"c"}', call_id="s3"),
            _tc("web_search", '{"query":"d"}', call_id="s4"),
        ]
        msg = SimpleNamespace(content="", tool_calls=calls)
        messages = []
        executed = []
        lock = threading.Lock()

        def fake_handle(name, args, task_id, **kwargs):
            with lock:
                executed.append(kwargs["tool_call_id"])
            return _fail(name) if kwargs["tool_call_id"] == "t1" else _ok()

        with patch("model_tools.handle_function_call", side_effect=fake_handle):
            agent._execute_tool_calls(msg, messages, "task-1")

        assert [m["tool_call_id"] for m in messages] == ["s1", "s2", "t1", "s3", "s4"]
        assert "s3" not in executed and "s4" not in executed
        for m in messages[-2:]:
            assert "earlier tool call" in m["content"]

    def test_parallel_sibling_failure_does_not_cascade(self, agent):
        """A failing read inside a parallel run must not cancel its siblings —
        they are independent observations the model needs for recovery."""
        calls = [
            _tc("web_search", '{"query":"a"}', call_id="s1"),
            _tc("web_search", '{"query":"b"}', call_id="s2"),
            _tc("web_search", '{"query":"c"}', call_id="s3"),
        ]
        msg = SimpleNamespace(content="", tool_calls=calls)
        messages = []
        executed = []
        lock = threading.Lock()

        def fake_handle(name, args, task_id, **kwargs):
            with lock:
                executed.append(kwargs["tool_call_id"])
            return _fail(name) if kwargs["tool_call_id"] == "s1" else _ok()

        with patch("model_tools.handle_function_call", side_effect=fake_handle):
            agent._execute_tool_calls(msg, messages, "task-1")

        assert sorted(executed) == ["s1", "s2", "s3"]
        assert [m["tool_call_id"] for m in messages] == ["s1", "s2", "s3"]
        assert getattr(agent, "_tool_fail_cascade_active", False) is False
