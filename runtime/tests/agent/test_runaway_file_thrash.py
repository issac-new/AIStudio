"""Tests for the file_edit_thrash runaway signal (2026-11-05 AI Native absorption T3).

颤振（六死法之一）：同一文件反复编辑且其间验证连续失败——「改了又改、改不过
还改」。判据=窗口内同路径写类编辑 ≥5 次且错误族 ≥2 次；干净多步改写（零失败）
不报；完全相同的重复编辑由 exact_action_repeat 先拦（阈 3）。本信号默认与其他
六信号同语义：只观测报告，不打断（HERMES_RUNAWAY_GUARD_INTERRUPT 才触发 interrupt）。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "agent"))

from runaway_guard import RunawayGuard  # noqa: E402


def _edit(path: str, content: str, fail: bool = False):
    # 成功结果也逐次唯一（"ok vN"）：隔离本信号，不被 exact_result_repeat 等既有信号抢先
    return ("patch", {"mode": "patch", "path": path, "old_string": "a", "new_string": content},
            f"error: assertion failed at {path}:{content}" if fail else f"ok {content}")


def test_thrash_fires_on_same_file_many_edits_with_failures():
    g = RunawayGuard()
    sig = None
    for i in range(5):
        sig = g.observe_tool_step(*_edit("src/a.ts", f"v{i}", fail=(i >= 3)))
    assert sig is not None and sig.signal == "file_edit_thrash"
    assert sig.count == 5 and "src/a.ts" in sig.detail


def test_clean_multistep_rewrite_does_not_fire():
    g = RunawayGuard()
    sig = None
    for i in range(8):
        sig = g.observe_tool_step(*_edit("src/b.ts", f"v{i}"))
    assert sig is None


def test_below_threshold_and_single_failure_do_not_fire():
    g = RunawayGuard()
    sig = None
    for i in range(4):  # 4 次 < 阈 5（同族错误连续会先触发 same_error_family，那是既有信号的正确行为）
        sig = g.observe_tool_step(*_edit("src/c.ts", f"v{i}", fail=True))
    assert not (sig and sig.signal == "file_edit_thrash")


def test_different_files_do_not_accumulate():
    g = RunawayGuard()
    sig = None
    for i in range(3):
        sig = g.observe_tool_step(*_edit("src/x.ts", f"v{i}", fail=True))
        sig = g.observe_tool_step(*_edit("src/y.ts", f"v{i}", fail=True))
    # 每文件 3 次 < 5：不触发（same_error_family 阈 3 会先报，但那不是本信号）
    assert not (sig and sig.signal == "file_edit_thrash")


def test_signal_registered_in_table_and_default_observe_only():
    import runaway_guard as m
    assert "file_edit_thrash" in m.RUNAWAY_SIGNALS
    # 默认只观测不拦（与六信号同语义）：should_interrupt 默认关
    assert m.should_interrupt_on_signal() is False or m.__dict__.get("_env_interrupt_forced")
