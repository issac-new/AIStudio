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
