"""看板归属与 A2A 入口守门。

看板归属正本 = team/shared/domain-registry.yaml（domain→board→profiles→人类负责人）；
运行时围栏读 board.json 的 profiles/profile_scope。A2A 入口在 orchestrator 平台面启用，
安全参数（token/trusted peers）只经 env，仓内不落原值。
"""
from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
REGISTRY = REPO / "team" / "shared" / "domain-registry.yaml"
ORCHESTRATOR = REPO / "team" / "profiles" / "orchestrator" / "config.yaml"
DISPATCH = REPO / "runtime" / "hermes_cli" / "kanban_db_dispatch.py"
BOARD_KEYS = REPO / "runtime" / "hermes_cli" / "board_team_keys.py"


def _blocks(text: str) -> list[str]:
    parts = re.split(r"(?m)^- domain:", text)
    return ["- domain:" + p for p in parts[1:]]


def test_every_board_has_team_and_human_owner() -> None:
    blocks = _blocks(REGISTRY.read_text(encoding="utf-8"))
    assert len(blocks) == 9, f"领域/板数量异常：{len(blocks)}"
    boards = []
    for block in blocks:
        board = re.search(r"(?m)^  board:\s*(\S+)", block)
        profiles = re.search(r"(?m)^  profiles:\n((?:  - .+\n)+)", block)
        owner_label = re.search(r"(?m)^  owner_label:\s*(\S+)", block)
        owner_env = re.search(r"(?m)^  owner_account_env:\s*(\S+)", block)
        assert board, f"缺 board：\n{block[:200]}"
        assert profiles, f"缺 profiles：\n{block[:200]}"
        assert owner_label, f"缺 owner_label：\n{block[:200]}"
        assert owner_env, f"缺 owner_account_env：\n{block[:200]}"
        boards.append(board.group(1))
        assert owner_env.group(1).startswith("BOARD_OWNER_"), owner_env.group(1)
    assert len(set(boards)) == len(boards), f"board slug 重复：{boards}"


def test_orchestrator_exposes_a2a_without_embedded_tokens() -> None:
    text = ORCHESTRATOR.read_text(encoding="utf-8")
    assert re.search(r"(?m)^  a2a:\n    enabled: true", text), "orchestrator 未启用 A2A"
    # 安全参数只经 env；配置里不得出现 token 原值
    assert not re.search(r"(?m)^\s*A2A_(BEARER|PEER)_TOKENS:\s*\S+", text), "A2A token 不得落配置"


def test_dispatcher_fence_accepts_live_profile_scope_key() -> None:
    source = DISPATCH.read_text(encoding="utf-8")
    assert "from hermes_cli.board_team_keys import team_raw" in source
    helper = BOARD_KEYS.read_text(encoding="utf-8")
    assert 'meta.get("profiles")' in helper
    assert 'meta.get("profile_scope")' in helper
