"""profile 五级来源+热重载守门（kimi §五 C 表 P1）。"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_WORKTREE = Path(__file__).resolve().parents[2]
if str(_WORKTREE) not in sys.path:
    sys.path.insert(0, str(_WORKTREE))

from agent.profile_hot_reload import ReloadWatch, resolve_profile_id, resolve_profile_sources


class TestFiveSources:
    def test_priority_order_env_first_builtin_last(self):
        full = resolve_profile_sources(env_profile='e', cli_profile='c', project_profile='p', global_profile='g')
        assert (full.profile_id, full.resolved_from) == ('e', 'env')
        assert resolve_profile_sources(cli_profile='c', project_profile='p').resolved_from == 'cli'
        assert resolve_profile_sources(project_profile='p', global_profile='g').resolved_from == 'project'
        assert resolve_profile_sources(global_profile='g').resolved_from == 'global'
        assert resolve_profile_sources(builtin='role-x') == resolve_profile_sources(builtin='role-x')

    def test_env_resolution(self, monkeypatch):
        monkeypatch.setenv('HERMES_PROFILE_OVERRIDE', 'ov')
        assert resolve_profile_id().resolved_from == 'env'
        monkeypatch.delenv('HERMES_PROFILE_OVERRIDE')
        monkeypatch.setenv('HERMES_PROFILE', 'cli-prof')
        assert resolve_profile_id().resolved_from == 'cli'
        monkeypatch.delenv('HERMES_PROFILE')
        assert resolve_profile_id().resolved_from == 'builtin'


class TestHotReload:
    def test_baseline_then_change_then_debounce(self):
        w = ReloadWatch(debounce_ms=300)
        assert w.observe({'p': 100.0}, now=1.0) is False  # 首观测建基线
        assert w.observe({'p': 100.0}, now=1.1) is False  # 无变化
        assert w.observe({'p': 200.0}, now=1.2) is True   # 变化触发
        assert w.observe({'p': 300.0}, now=1.25) is False  # 防抖窗内
        assert w.observe({'p': 400.0}, now=2.0) is True   # 过窗再触发

    def test_empty_files_noop_and_reset(self):
        w = ReloadWatch()
        assert w.observe({}, now=1.0) is False
        w.observe({'p': 1.0}, now=1.0)
        w.reset()
        assert w.observe({'p': 2.0}, now=2.0) is False  # reset 后重建基线
