"""kimi 六段交接摘要吸收守门（第一批 #3，docs/upstream-analysis/kimi.md 吸收表 1）。

kimi 六段 vs hermes 既有模板的映射与增量：
- 真实意图      → Goal 段指令（新增 TRUE INTENT vs 字面请求区分）
- 已定/未定     → Resolved Questions + Blocked（既有，强于 kimi）
- 精确命令与错误行 → Completed Actions 格式 + Errors & Fixes + 机械锚点索引（既有，强于 kimi）
- 还不知道      → 新增 ## Open Questions & Unknowns 段
- 前向计划      → 新增 ## Forward Plan 段
- 诚实标注      → 摘要器前言新增 [UNVERIFIED] 标注规则

本守门锁四项增量不回退（模板结构是行为契约，压缩后继作质量依赖它）。
"""

from __future__ import annotations

import sys
from pathlib import Path

_WORKTREE = Path(__file__).resolve().parents[2]
if str(_WORKTREE) not in sys.path:
    sys.path.insert(0, str(_WORKTREE))

from agent.context_compressor import ContextCompressor, HISTORICAL_TASK_HEADING


def _template(has_user_turn: bool = True) -> str:
    sections = {
        True: {
            "language": "L",
            "historical_task": "HT",
            "goal": "G",
            "constraints": "C",
            "resolved_questions": "RQ",
        },
        False: {
            "language": "L",
            "historical_task": "HT",
            "goal": "G",
            "constraints": "C",
            "resolved_questions": "RQ",
        },
    }[has_user_turn]
    return ContextCompressor._summary_template_sections.__func__(
        ContextCompressor, sections, 2000, ""
    )


class TestSixSegmentTemplate:
    def test_new_sections_present_in_order(self):
        t = _template()
        assert "## Open Questions & Unknowns" in t
        assert "## Forward Plan" in t
        # 顺序：未知问题紧跟已解决问题之后（成对），前向计划在其后、相关文件之前。
        order = [l for l in t.splitlines() if l.startswith("## ")]
        assert order.index("## Resolved Questions") < order.index("## Open Questions & Unknowns")
        assert order.index("## Open Questions & Unknowns") < order.index("## Forward Plan")
        assert order.index("## Forward Plan") < order.index("## Relevant Files")

    def test_open_questions_distinguished_from_blocked(self):
        t = _template()
        # 与 Blocked（已知失败）显式区分：本段是"从未验证过的事"。
        assert "never tested" in t or "never established" in t

    def test_forward_plan_overridden_by_latest_message(self):
        t = _template()
        # 前向计划是交接不是承诺：摘要后最新用户消息永远赢（与 SUMMARY_PREFIX 反复燃框架一致）。
        assert "overrides" in t

    def test_goal_instruction_carries_true_intent(self):
        import agent.context_compressor as cc
        src = open(cc.__file__, encoding="utf-8").read()
        assert "TRUE INTENT" in src
        assert "actual intent:" in src

    def test_honesty_marking_rule_in_preamble(self):
        import agent.context_compressor as cc
        src = open(cc.__file__, encoding="utf-8").read()
        assert "Honesty marking" in src
        assert "[UNVERIFIED]" in src

    def test_zero_user_variant_also_gets_new_sections(self):
        t = _template(has_user_turn=False)
        assert "## Open Questions & Unknowns" in t
        assert "## Forward Plan" in t

    def test_deterministic_fallback_has_new_sections(self):
        import inspect
        import agent.context_compressor as cc
        src = inspect.getsource(
            cc.ContextCompressor._build_static_fallback_summary
        )
        assert "## Open Questions & Unknowns" in src
        assert "## Forward Plan" in src

    def test_iterative_update_rules_cover_new_sections(self):
        import agent.context_compressor as cc
        src = open(cc.__file__, encoding="utf-8").read()
        # 迭代更新指令须覆盖两新段（避免更新轮丢段）。
        assert 'Move unknowns that got established out of "Open Questions & Unknowns"' in src
        assert 'Rewrite "Forward Plan" to the current intended next steps' in src
