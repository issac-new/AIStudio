"""runaway-guard 六信号守门（第一批 #6，吸收 minimax agent-modules/runaway-guard）。

锚点：docs/upstream-analysis/minimax-code.md §2.6（六类信号 + HMAC 指纹 16KB 有界）。
"""

from __future__ import annotations

import sys
from pathlib import Path

_WORKTREE = Path(__file__).resolve().parents[2]
if str(_WORKTREE) not in sys.path:
    sys.path.insert(0, str(_WORKTREE))

from agent.runaway_guard import (
    RUNAWAY_SIGNALS, RunawayGuard, observe_tool_step, step_fingerprint,
)


class _MiniAgent:
    def __init__(self):
        self.interrupts = []
        self._runaway_guard = None

    def interrupt(self, reason=""):
        self.interrupts.append(reason)


def _feed(guard, steps):
    """steps: [(tool, args, result)] 依次喂入，返回首个信号与触发步序。"""
    for i, (t, a, r) in enumerate(steps):
        sig = guard.observe_tool_step(t, a, r)
        if sig is not None:
            return sig, i
    return None, None


class TestSixSignals:
    def test_vocabulary_frozen(self):
        assert RUNAWAY_SIGNALS == (
            "exact_action_repeat", "exact_result_repeat", "same_error_family",
            "abab_action_cycle", "polling_repeat", "unchanged_progress_repeat",
        )

    def test_exact_action_repeat(self):
        g = RunawayGuard()
        sig, i = _feed(g, [("patch", {"f": "a.py", "s": "x"}, "ok")] * 4)
        assert sig is not None and sig.signal == "exact_action_repeat" and sig.count >= 3

    def test_exact_result_repeat_different_actions(self):
        g = RunawayGuard()
        # 动作不同（文件不同）但结果一字不差——纯动作守卫抓不到，结果守卫要抓。
        steps = [("patch", {"f": f"a{i}.py"}, "no changes needed") for i in range(4)]
        sig, _ = _feed(g, steps)
        assert sig is not None and sig.signal == "exact_result_repeat"

    def test_same_error_family(self):
        g = RunawayGuard()
        err = lambda i: f"Error executing tool 'terminal': ECONNREFUSED 127.0.0.1:{5000 + i} retry {i}"
        sig, _ = _feed(g, [("terminal", {"cmd": f"curl x{i}"}, err(i)) for i in range(3)])
        assert sig is not None and sig.signal == "same_error_family"

    def test_abab_action_cycle(self):
        g = RunawayGuard()
        steps = [("read_file", {"f": "a.py"}, "x"), ("patch", {"f": "b.py"}, "y")] * 3
        sig, _ = _feed(g, steps)
        assert sig is not None and sig.signal == "abab_action_cycle"

    def test_polling_repeat(self):
        g = RunawayGuard()
        steps = [("terminal", {"cmd": "kubectl get pod"}, "Pending")] * 4
        sig, _ = _feed(g, steps)
        # 同工具同参数同结果：polling_repeat 与 exact_action_repeat 都成立，廉价者先报。
        assert sig is not None and sig.signal in ("polling_repeat", "exact_action_repeat")

    def test_unchanged_progress_repeat(self):
        g = RunawayGuard()
        # 动作在换（不同文件/不同参数）、结果持续不变。
        steps = [(t, {"i": i}, "empty") for i, t in enumerate(["read", "grep", "glob", "read", "grep", "glob"])]
        sig, _ = _feed(g, steps)
        assert sig is not None and sig.signal == "unchanged_progress_repeat"

    def test_healthy_progress_no_signal(self):
        g = RunawayGuard()
        steps = [(t, {"i": i}, f"result-{i}") for i, t in enumerate(["read", "grep", "patch", "read", "grep"])]
        sig, _ = _feed(g, steps)
        assert sig is None
        assert g.last_signal is None

    def test_window_zero_stays_bounded(self):
        # 防御性误设 window=0：裁剪下限夹到 ≥1，缓冲不无界增长。
        g = RunawayGuard(window=0)
        for i in range(50):
            g.observe_tool_step("t", {"i": i}, f"r{i}")
        assert len(g._actions) <= 1
        assert len(g._results) <= 1
        assert len(g._errors) <= 1


class TestFingerprint:
    def test_stable_and_arg_sensitive(self):
        assert step_fingerprint("patch", {"a": 1}) == step_fingerprint("patch", {"a": 1})
        assert step_fingerprint("patch", {"a": 1}) != step_fingerprint("patch", {"a": 2})
        assert step_fingerprint("patch", {"a": 1}) != step_fingerprint("read", {"a": 1})

    def test_bounded_serialization_huge_args(self):
        huge = {"blob": "x" * (64 * 1024)}
        fp = step_fingerprint("write_file", huge)
        assert len(fp) == 64  # sha256 hex
        # 有界：同前缀的超大参数指纹一致（截断语义），不炸不漂。
        assert fp == step_fingerprint("write_file", {"blob": "x" * (64 * 1024)})


class TestWiring:
    def test_observe_attached_to_agent_and_disabled_bypass(self, monkeypatch):
        agent = _MiniAgent()
        fired = []
        sig = observe_tool_step(agent, "t", {}, "r", notify=fired.append)
        assert sig is None and fired == []
        # 连续同动作触发：信号挂到 agent + 通知面收到。
        for _ in range(3):
            sig = observe_tool_step(agent, "t", {}, "r", notify=fired.append)
        assert sig is not None and agent._last_runaway_signal is not None
        assert fired and fired[-1].signal == sig.signal
        # 默认不打断。
        assert agent.interrupts == []
        # 关守卫：直通零信号。
        monkeypatch.setenv("HERMES_RUNAWAY_GUARD", "0")
        g = RunawayGuard()
        assert observe_tool_step(agent, "x", {}, "y") is None
        monkeypatch.setenv("HERMES_RUNAWAY_GUARD", "1")
        monkeypatch.setenv("HERMES_RUNAWAY_GUARD_INTERRUPT", "1")
        for _ in range(4):
            observe_tool_step(agent, "z", {}, "w")
        assert agent.interrupts, "INTERRUPT=1 时信号应触发 agent.interrupt"
