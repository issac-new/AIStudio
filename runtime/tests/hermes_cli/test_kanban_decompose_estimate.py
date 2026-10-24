"""HERMES_CUSTOM[estimate-decompose]（团队并行三期）守门：decompose 拆分粒度。

锚点：specs/2026-10-09-parallel-capability-foundation-spec.md §3——
子卡 estimate_days 全链（LLM 提议→归一→落库）；>1 人日触发一轮重规划；
重规划仍超限=钳到 1.0d 带审计放行。estimate_set 事件链=派发加权的真值源。

直跑说明：kanban_db_graph 不在 overlay runtime 镜像（部署时从上游解析），
本测在 import 前注入 stub；其余（estimate 落库/归一化/重规划决策）全真码。
"""

from __future__ import annotations

import sys
import types
from pathlib import Path

_WORKTREE = Path(__file__).resolve().parents[2]
if str(_WORKTREE) not in sys.path:
    sys.path.insert(0, str(_WORKTREE))

# kanban_db_graph 属上游树（部署合并时解析）；真模块在（合并树/部署树）就让位，
# 仅在纯 overlay runtime（无该文件）注入 stub 防 import 失败——曾因无条件 stub
# 遮蔽真模块炸掉 kanban_db.create_task 的 initial_task_state 导入。
try:
    import hermes_cli.kanban_db_graph  # noqa: F401
except Exception:
    _graph = types.ModuleType("hermes_cli.kanban_db_graph")
    _graph.decompose_triage_task = lambda *a, **k: None  # pragma: no cover
    sys.modules["hermes_cli.kanban_db_graph"] = _graph

import pytest

from hermes_cli import kanban_db as kb
from hermes_cli import kanban_db_connect as kbc
from hermes_cli.kanban_decompose import (
    _clean_children,
    _normalize_estimate,
    _oversize_feedback,
    _persist_child_estimates,
    _Routing,
    decompose_task,
)


def _routing():
    return _Routing(
        orchestrator="orch", default_assignee="default", auto_promote=True,
        roster=[], valid_names={"chen", "default", "orch"},
    )


class TestNormalizeEstimate:
    def test_clamp_envelope(self):
        assert _normalize_estimate(0.1) == (0.25, False)   # 下界抬到 0.25
        assert _normalize_estimate(5) == (2.0, True)       # 上界压到 2.0，超帽标记
        assert _normalize_estimate(0.75) == (0.75, False)  # 合法值透传
        assert _normalize_estimate(1.0) == (1.0, False)    # 帽值本身合法
        assert _normalize_estimate(1.01) == (1.01, True)   # 恰超帽即标记

    def test_garbage_falls_back_to_one_day(self):
        for bad in (None, "lots", [], {}, -3, float("nan")):
            assert _normalize_estimate(bad) == (1.0, False)


class TestCleanChildren:
    def test_estimate_normalized_and_over_cap_flagged(self):
        children, reason = _clean_children(
            "tk-1",
            [
                {"title": "a", "body": "x", "assignee": "chen", "estimate_days": 3},
                {"title": "b", "body": "y", "estimate_days": 0.5},
            ],
            _routing(),
        )
        assert reason == ""
        assert children[0]["estimate_days"] == 2.0 and children[0]["over_cap"] is True
        assert children[1]["estimate_days"] == 0.5 and children[1]["over_cap"] is False

    def test_oversize_feedback_names_indices(self):
        children = [
            {"title": "a", "estimate_days": 2.0, "over_cap": True},
            {"title": "b", "estimate_days": 0.5, "over_cap": False},
        ]
        fb = _oversize_feedback(children)
        assert "0 estimates above" in fb
        assert "1 estimates" not in fb  # template wraps "tasks\n<idx> estimates above"


class TestPersistEstimates:
    def _conn(self, home, monkeypatch):
        monkeypatch.setenv("HERMES_KANBAN_HOME", str(home))
        kb._INITIALIZED_PATHS.clear()
        return kbc.connect()

    def test_over_cap_clamped_and_estimate_set_event(self, monkeypatch):
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            conn = self._conn(Path(td), monkeypatch)
            tid = kb.create_task(
                conn=conn, title="root", body="", assignee="orch",
                created_by="test", workspace_kind="dir",
            )
            clamped = _persist_child_estimates("root-1", [tid], [{
                "estimate_days": 2.0, "over_cap": True,
            }])
            assert clamped == 1
            task = kb.get_task(conn, tid)
            assert task is not None and task.estimate_days == 1.0
            events = conn.execute(
                "SELECT kind FROM task_events WHERE task_id = ? AND kind = 'estimate_set'",
                (tid,),
            ).fetchall()
            assert events, "estimate persist must emit estimate_set audit event"

    def test_in_cap_children_persist_verbatim(self, monkeypatch):
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            conn = self._conn(Path(td), monkeypatch)
            tid = kb.create_task(
                conn=conn, title="c", body="", assignee="chen",
                created_by="test", workspace_kind="dir",
            )
            clamped = _persist_child_estimates("root-2", [tid], [{
                "estimate_days": 0.5, "over_cap": False,
            }])
            assert clamped == 0
            assert kb.get_task(conn, tid).estimate_days == 0.5


class TestReplanRound:
    """重规划决策链：首计划超帽→带反馈再问→合规计划替换；再问仍超→钳制放行。"""

    @staticmethod
    def _plan(estimate):
        return {
            "fanout": True,
            "rationale": "r",
            "tasks": [
                {"title": "t1", "body": "b", "assignee": "chen", "parents": [], "estimate_days": estimate},
                {"title": "t2", "body": "b", "assignee": "chen", "parents": [0], "estimate_days": 0.5},
            ],
        }

    def _harness(self, monkeypatch, replies, created):
        import hermes_cli.kanban_decompose as kd

        task = types.SimpleNamespace(
            id="tk-9", title="root", body="b", assignee="orch", status="triage",
        )
        monkeypatch.setattr(kd, "_load_triage_task", lambda tid: (task, ""))
        monkeypatch.setattr(kd, "_load_routing", lambda **kw: _routing())
        calls = {"n": 0}

        def fake_call_aux(label, task_id, *, aux_task, system, user, max_tokens, timeout, log):
            idx = min(calls["n"], len(replies) - 1)
            calls["n"] += 1
            calls.setdefault("users", []).append(user)
            return replies[idx], None

        monkeypatch.setattr(kd, "_call_aux", fake_call_aux)

        def fake_fanout(task_id, parsed, routing, author):
            created.append(parsed)
            return kd.DecomposeOutcome(task_id, True, "decomposed", fanout=True, child_ids=["c1", "c2"])

        monkeypatch.setattr(kd, "_apply_fanout", fake_fanout)
        return calls

    def test_first_plan_oversize_triggers_one_replan(self, monkeypatch):
        created = []
        calls = self._harness(
            monkeypatch,
            replies=[  # round 1 oversize; round 2 compliant
                '{"fanout": true, "tasks": [{"title": "t1", "body": "b", "estimate_days": 3}, {"title": "t2", "body": "b", "estimate_days": 0.5}]}',
                '{"fanout": true, "tasks": [{"title": "t1a", "body": "b", "estimate_days": 0.5}, {"title": "t1b", "body": "b", "estimate_days": 0.5}, {"title": "t2", "body": "b", "estimate_days": 0.5}]}',
            ],
            created=created,
        )
        out = decompose_task("tk-9")
        assert out.ok and out.fanout
        assert calls["n"] == 2, "oversize first plan must trigger exactly one re-plan round"
        assert "RE-PLAN REQUIRED" in calls["users"][1]
        assert created[0]["tasks"][0]["title"] == "t1a", "compliant re-plan must replace the oversized one"

    def test_replan_still_oversize_clamps_and_proceeds(self, monkeypatch):
        created = []
        calls = self._harness(
            monkeypatch,
            replies=[  # both rounds oversize
                '{"fanout": true, "tasks": [{"title": "t1", "body": "b", "estimate_days": 4}]}',
                '{"fanout": true, "tasks": [{"title": "t1", "body": "b", "estimate_days": 3}]}',
            ],
            created=created,
        )
        out = decompose_task("tk-9")
        assert out.ok and out.fanout
        assert calls["n"] == 2, "exactly one re-plan even when it stays oversize (no infinite loop)"

    def test_compliant_first_plan_skips_replan(self, monkeypatch):
        created = []
        calls = self._harness(
            monkeypatch,
            replies=['{"fanout": true, "tasks": [{"title": "t1", "body": "b", "estimate_days": 0.5}, {"title": "t2", "body": "b", "estimate_days": 1.0}]}'],
            created=created,
        )
        out = decompose_task("tk-9")
        assert out.ok and out.fanout
        assert calls["n"] == 1, "compliant plan must not burn a second LLM round"
