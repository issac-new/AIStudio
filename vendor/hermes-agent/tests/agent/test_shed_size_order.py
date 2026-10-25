"""剪枝次序化守门（codex 候补"最大优先装下即停"）：大结果先剪、达目标早停、无目标全量不变。"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_WORKTREE = Path(__file__).resolve().parents[2]
if str(_WORKTREE) not in sys.path:
    sys.path.insert(0, str(_WORKTREE))

from agent.context_compressor import ContextCompressor  # noqa: E402


def _tool_msg(cid: str, text: str) -> dict:
    return {"role": "tool", "tool_call_id": cid, "content": text}


def _assistant_with_calls(*cids) -> dict:
    return {"role": "assistant", "content": "",
            "tool_calls": [{"id": c, "type": "function", "function": {"name": "t", "arguments": "{}"}} for c in cids]}


def _session(big: str, small: str, mid: str):
    return [
        {"role": "user", "content": "q"},
        _assistant_with_calls("c1", "c2", "c3"),
        _tool_msg("c1", big),
        _tool_msg("c2", small),
        _tool_msg("c3", mid),
        {"role": "assistant", "content": "done"},
    ]


BIG = "B" * 4000
MID = "M" * 1200
SMALL = "S" * 260  # 须过 _PRUNE_MIN_CHARS=200 门槛才有剪枝资格


class TestSizeOrderShed:
    """边界语义：protect_tail_count=2 保护末两条（assistant 终答 + MID），
    故可剪集 = {BIG, SMALL}；shed 目标按"回收字符数"计（demote 后留 1 行摘要）。"""

    def test_no_target_demotes_all_eligible(self):
        c = ContextCompressor(model="m", quiet_mode=True)
        out, count = c._prune_old_tool_results(_session(BIG, SMALL, MID), protect_tail_count=2)
        assert count == 2  # BIG+SMALL（MID 在保护尾）
        contents = [m["content"] for m in out if m.get("role") == "tool"]
        assert any(c == MID for c in contents)

    def test_target_stops_after_biggest(self):
        c = ContextCompressor(model="m", quiet_mode=True)
        msgs = _session(BIG, SMALL, MID)
        out, count = c._prune_old_tool_results(
            msgs, protect_tail_count=2,
            shed_target_chars=len(BIG) - 400,  # BIG 剪后净回收≈len-摘要行，目标留裕量
        )
        assert count == 1  # 最大者即达标停
        contents = [m["content"] for m in out if m.get("role") == "tool"]
        assert any(c == SMALL for c in contents) and any(c == MID for c in contents)
        assert not any(c == BIG for c in contents)

    def test_target_needs_both_eligible(self):
        c = ContextCompressor(model="m", quiet_mode=True)
        msgs = _session(BIG, SMALL, MID)
        out, count = c._prune_old_tool_results(
            msgs, protect_tail_count=2,
            shed_target_chars=len(BIG) + len(SMALL),  # 两可剪项全回收也不够——自然尽
        )
        assert count == 2
        contents = [m["content"] for m in out if m.get("role") == "tool"]
        assert any(c == MID for c in contents)  # 保护尾不动



class TestTieredSacrificeAndMetrics:
    """余半项守门：分级牺牲优先级表（可再生先牺牲）+ shed_bytes 指标。"""

    def test_regen_tool_sacrificed_before_bigger_bash(self):
        # c1=read_file（tier0 可再生，1500 字）先于 c2=bash（tier1，4000 字）牺牲，
        # 尽管后者更大——目标 1400 时剪 read 即达标停，bash 保留完整。
        c = ContextCompressor(model="m", quiet_mode=True)
        regen, heavy = "R" * 1500, "B" * 4000
        msgs = [
            {"role": "user", "content": "q"},
            {"role": "assistant", "content": "",
             "tool_calls": [
                 {"id": "c1", "type": "function", "function": {"name": "read_file", "arguments": "{}"}},
                 {"id": "c2", "type": "function", "function": {"name": "bash", "arguments": "{}"}},
             ]},
            _tool_msg("c1", regen),
            _tool_msg("c2", heavy),
            {"role": "assistant", "content": "done"},
        ]
        out, count = c._prune_old_tool_results(msgs, protect_tail_count=2, shed_target_chars=1400)
        assert count == 1
        contents = [m["content"] for m in out if m.get("role") == "tool"]
        assert heavy in contents and regen not in contents  # 只牺牲可再生者
        m = c.last_shed_metrics
        assert m["demoted"] == 1
        assert m["shed_bytes"] > 0
        assert m["met_target"] is True
        assert m["target_chars"] == 1400

    def test_metrics_reflect_full_shed_when_no_target(self):
        c = ContextCompressor(model="m", quiet_mode=True)
        c._prune_old_tool_results(_session(BIG, SMALL, MID), protect_tail_count=2)
        m = c.last_shed_metrics
        assert m["demoted"] == 2
        assert m["shed_bytes"] > 0
        assert m["target_chars"] is None
        assert m["met_target"] is True  # 无目标=自然尽即命中
