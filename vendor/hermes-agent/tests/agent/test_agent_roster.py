"""Agent 名册配置层守门（第一批 #10 独立子件：dsh 角色配置+kimi 昵称池+routa 名册）。"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_WORKTREE = Path(__file__).resolve().parents[2]
if str(_WORKTREE) not in sys.path:
    sys.path.insert(0, str(_WORKTREE))

from agent.agent_roster import (  # noqa: E402
    AgentRoster, load_roster, reset_roster_cache,
)


class TestBuiltins:
    def test_default_role_catalog_and_guards(self):
        r = AgentRoster()
        assert "researcher" in r.role_catalog and "agent-lead" in r.role_catalog
        assert r.guards() == {"max_concurrent_children": 10, "max_delegation_depth": 1}

    def test_display_names_titleized(self):
        r = AgentRoster()
        d = {x.role: x.display_name for x in r.roles()}
        assert d["code-reviewer"] == "Code Reviewer"


class TestNicknamePool:
    def test_same_role_dedup_pool_exhaust_numbered(self):
        r = AgentRoster(nickname_pool=("Alex", "Sam"))
        first = [r.assign_nickname("qa") for _ in range(2)]
        assert first == ["Alex", "Sam"]
        assert r.assign_nickname("qa") == "Alex-3"  # 池耗尽追加序号
        # 跨角色可重名（kimi 语义：同角色内去重）。
        assert r.assign_nickname("backend") == "Alex"

    def test_release_returns_nickname(self):
        r = AgentRoster(nickname_pool=("Alex",))
        n = r.assign_nickname("qa")
        r.release_nickname("qa", n)
        assert r.assign_nickname("qa") == n


class TestConfigLayer:
    def test_yaml_overrides_four_elements(self, tmp_path):
        cfg = tmp_path / "agent-roster.yaml"
        cfg.write_text(
            "roles: [backend, qa]\n"
            "nicknames: [Kai, Noa]\n"
            "max_concurrent_children: 2\n"
            "max_delegation_depth: 1\n"
            "role_descriptions: {qa: 质量验证}\n",
            encoding="utf-8",
        )
        r = load_roster(cfg)
        assert r.role_catalog == ("backend", "qa")
        assert r.nickname_pool == ("Kai", "Noa")
        assert r.guards() == {"max_concurrent_children": 2, "max_delegation_depth": 1}
        assert r.role_descriptions["qa"] == "质量验证"

    def test_missing_and_broken_files_fall_back(self, tmp_path):
        assert load_roster(tmp_path / "absent.yaml").guards()["max_delegation_depth"] == 1
        bad = tmp_path / "bad.yaml"
        bad.write_text("{{{{not yaml", encoding="utf-8")
        assert load_roster(bad).role_catalog == AgentRoster().role_catalog

    def test_cache_reset(self, monkeypatch, tmp_path):
        import agent.agent_roster as ar
        monkeypatch.setenv("HERMES_HOME", str(tmp_path))
        ar.reset_roster_cache()
        cfg = tmp_path / "agent-roster.yaml"
        cfg.write_text("max_delegation_depth: 3\n", encoding="utf-8")
        ar.reset_roster_cache()
        assert ar.get_roster().guards()["max_delegation_depth"] == 3
        ar.reset_roster_cache()


class TestGuardSingleSource:
    def test_guard_defaults_track_delegate_tool_config(self):
        """Y2 守门：护栏默认值单一事实源在 tools/delegate_tool_config.py，roster 只派生。
        任一端改字面量，此测试必须当场 fail（防 4/2 vs 10/1 两套事实源复发）。"""
        from agent.agent_roster import (
            DEFAULT_MAX_CONCURRENT_CHILDREN, DEFAULT_MAX_DELEGATION_DEPTH,
        )
        from tools.delegate_tool_config import (
            MAX_DEPTH, _DEFAULT_MAX_CONCURRENT_CHILDREN,
        )

        assert DEFAULT_MAX_CONCURRENT_CHILDREN == _DEFAULT_MAX_CONCURRENT_CHILDREN == 10
        assert DEFAULT_MAX_DELEGATION_DEPTH == MAX_DEPTH == 1
