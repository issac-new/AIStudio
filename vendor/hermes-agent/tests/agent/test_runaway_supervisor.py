"""runaway 监督模式守门（routa §七#8：watchdog_retry/ralph_loop/有界恢复）。"""

from __future__ import annotations

import sys
import zoneinfo  # noqa: F401 预导入：本机 venv 标准库在真实 hermes home 下，护栏窗口内
                 # 惰性导入会被 home_io_guard 误伤（长会话治理轮实测，同 602-604 测试）。
from pathlib import Path

import pytest

_WORKTREE = Path(__file__).resolve().parents[2]
if str(_WORKTREE) not in sys.path:
    sys.path.insert(0, str(_WORKTREE))

from agent.runaway_supervisor import RunawaySupervisor, max_recovery, supervisor_mode


class TestModes:
    def test_default_report_only(self):
        s = RunawaySupervisor()
        d = s.on_signal("exact_action_repeat")
        assert d.action == "report"
        assert s.attempts_used == 0  # report 不计恢复次数

    def test_watchdog_retry_bounded(self):
        s = RunawaySupervisor(mode="watchdog_retry", limit=2)
        assert s.on_signal("text_ngram_repeat").action == "retry"
        assert s.on_signal("text_ngram_repeat").action == "retry"
        d = s.on_signal("text_ngram_repeat")
        assert d.action == "stop"  # 有界恢复尽→转人工
        assert "转人工" in d.detail

    def test_ralph_loop_and_reset(self):
        s = RunawaySupervisor(mode="ralph_loop", limit=1)
        assert s.on_signal("same_error_family").action == "ralph_loop"
        assert s.on_signal("same_error_family").action == "stop"
        s.reset()
        assert s.on_signal("x").action == "ralph_loop"

    def test_env_config(self, monkeypatch):
        monkeypatch.setenv("HERMES_RUNAWAY_SUPERVISOR", "watchdog_retry")
        monkeypatch.setenv("HERMES_RUNAWAY_MAX_RECOVERY", "5")
        assert supervisor_mode() == "watchdog_retry"
        assert max_recovery() == 5
        monkeypatch.setenv("HERMES_RUNAWAY_SUPERVISOR", "bogus")
        assert supervisor_mode() == "report"  # 非法回默认
        monkeypatch.setenv("HERMES_RUNAWAY_MAX_RECOVERY", "0")
        assert max_recovery() == 3  # 非法回默认


# ── 605 执行面接线：handle_runaway_signal ─────────────────────────────────────

def test_handle_signal_report_mode_no_interrupt():
    import os
    os.environ.pop("HERMES_RUNAWAY_SUPERVISOR", None)
    from types import SimpleNamespace
    from agent.runaway_supervisor import handle_runaway_signal, RunawaySupervisor

    calls = []
    agent = SimpleNamespace(interrupt=lambda reason=None: calls.append(reason),
                            _interrupt_requested=False)
    decision = handle_runaway_signal(agent, SimpleNamespace(signal="polling_repeat", tool="t", count=4))
    assert decision is not None and decision.action == "report"
    assert calls == []  # report 不干预
    assert agent._runaway_decisions == 1


def test_handle_signal_watchdog_retry_interrupts_with_guidance(monkeypatch):
    monkeypatch.setenv("HERMES_RUNAWAY_SUPERVISOR", "watchdog_retry")
    from types import SimpleNamespace
    from agent.runaway_supervisor import handle_runaway_signal

    calls = []
    agent = SimpleNamespace(interrupt=lambda reason=None: calls.append(reason),
                            _interrupt_requested=False)
    d1 = handle_runaway_signal(agent, SimpleNamespace(signal="abab_action_cycle", tool="t", count=2))
    assert d1.action == "retry" and calls and "watchdog_retry" in calls[-1]
    # 已在打断态：不重复打断
    agent._interrupt_requested = True
    calls.clear()
    d2 = handle_runaway_signal(agent, SimpleNamespace(signal="abab_action_cycle", tool="t", count=2))
    assert d2.action == "retry" and calls == []


def test_handle_signal_bounded_recovery_then_stop(monkeypatch):
    monkeypatch.setenv("HERMES_RUNAWAY_SUPERVISOR", "watchdog_retry")
    monkeypatch.setenv("HERMES_RUNAWAY_MAX_RECOVERY", "2")
    from types import SimpleNamespace
    from agent.runaway_supervisor import handle_runaway_signal

    agent = SimpleNamespace(interrupt=lambda reason=None: None, _interrupt_requested=False)
    assert handle_runaway_signal(agent, SimpleNamespace(signal="s", tool="t", count=1)).action == "retry"
    assert handle_runaway_signal(agent, SimpleNamespace(signal="s", tool="t", count=1)).action == "retry"
    d = handle_runaway_signal(agent, SimpleNamespace(signal="s", tool="t", count=1))
    assert d.action == "stop" and d.attempts_used == 2  # 有界恢复→转人工


def test_wiring_guard_calls_supervisor():
    from pathlib import Path
    import agent.runaway_guard as guard
    source = Path(guard.__file__).read_text(encoding="utf-8")
    assert "from agent.runaway_supervisor import handle_runaway_signal" in source
