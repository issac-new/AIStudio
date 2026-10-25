"""交接话术落点守门（kimi coder，矩阵 §3.3）：话术须落在子代理可见面（开局提示）；
delegate_task 描述属父侧（子代理工具集屏蔽 delegate_task，永远看不到），只写第三人称
规则。话术写给子代理却落在父侧即红。"""

from __future__ import annotations

import sys
from pathlib import Path

_WORKTREE = Path(__file__).resolve().parents[2]
if str(_WORKTREE) not in sys.path:
    sys.path.insert(0, str(_WORKTREE))


class TestHandoffPhrasePlacement:
    def test_child_opening_prompt_carries_handoff_phrase(self):
        from tools.delegate_tool_progress import _build_child_system_prompt
        prompt = _build_child_system_prompt("g", "c")
        assert "final message IS the entire handoff" in prompt  # 子代理开局即见
        assert "done (with file:line anchors)" in prompt
        assert "blocked" in prompt

    def test_parent_description_is_third_person(self):
        from tools.delegate_tool import _build_top_level_description
        desc = _build_top_level_description()
        assert "final summary is the entire handoff" in desc
        assert "your final summary" not in desc  # 父侧描述不得以子代理口吻说话
