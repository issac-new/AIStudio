"""runaway 监督模式守门（routa §七#8：watchdog_retry/ralph_loop/有界恢复）。"""

from __future__ import annotations

import sys
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
