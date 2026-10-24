"""板级 team 围栏守门（board-team-fence）：坏 board.json 必须 fail-closed。

锚点：_board_team_allowlist 承诺 "a corrupt/misconfigured board must never widen
this dispatcher's claim scope"；read_board_metadata 永不抛错，坏文件只能经
_board_json_unreadable 原文件探针判定，except 兜底救不了它。
"""

from __future__ import annotations

import sys
from pathlib import Path

_WORKTREE = Path(__file__).resolve().parents[2]
if str(_WORKTREE) not in sys.path:
    sys.path.insert(0, str(_WORKTREE))

from hermes_cli import kanban_db as kb
from hermes_cli.kanban_db_dispatch import (
    _board_json_unreadable,
    _board_team_allowlist,
    _profile_exists_fn,
)
from hermes_cli.profiles import normalize_profile_name


def _prepare_home(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_KANBAN_HOME", str(tmp_path))
    monkeypatch.delenv("HERMES_KANBAN_DISPATCH_PROFILES", raising=False)
    kb._INITIALIZED_PATHS.clear()
    return tmp_path


def _write_board_json(slug, text):
    path = kb.board_metadata_path(slug)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


class TestBoardTeamAllowlistFailClosed:
    def test_bad_board_json_returns_empty_allowlist(self, tmp_path, monkeypatch):
        # 坏 board.json → frozenset()（fail-closed）：一张也不许领，绝不放行全量。
        _prepare_home(tmp_path, monkeypatch)
        _write_board_json("team-a", "{not valid json")
        assert _board_team_allowlist(normalize_profile_name, "team-a") == frozenset()
        assert _board_json_unreadable("team-a") is True

    def test_missing_board_json_is_unfenced(self, tmp_path, monkeypatch):
        _prepare_home(tmp_path, monkeypatch)
        assert _board_team_allowlist(normalize_profile_name, "team-b") is None
        assert _board_json_unreadable("team-b") is False

    def test_valid_board_json_without_profiles_is_unfenced(self, tmp_path, monkeypatch):
        # 合法空配置（board.json 在、无 profiles 键）≠坏文件：无围栏是既有契约。
        _prepare_home(tmp_path, monkeypatch)
        _write_board_json("team-c", '{"name": "Team C"}')
        assert _board_team_allowlist(normalize_profile_name, "team-c") is None

    def test_profiles_key_builds_allowlist(self, tmp_path, monkeypatch):
        _prepare_home(tmp_path, monkeypatch)
        _write_board_json("team-d", '{"profiles": ["Sage", "", "ops"]}')
        assert _board_team_allowlist(normalize_profile_name, "team-d") == frozenset({"sage", "ops"})
        # present-but-empty 同样 fail-closed。
        _write_board_json("team-d", '{"profiles": []}')
        assert _board_team_allowlist(normalize_profile_name, "team-d") == frozenset()

    def test_corrupt_board_fences_the_spawn_gate(self, tmp_path, monkeypatch):
        # 接线面：坏 board.json 下 _profile_exists_fn 谁都不认（claim scope 不被放宽）。
        _prepare_home(tmp_path, monkeypatch)
        _write_board_json("team-e", "\x00\x01 binary junk")
        monkeypatch.setattr("hermes_cli.profiles.profile_exists", lambda name: True)
        fn = _profile_exists_fn("team-e")
        assert fn is not None
        assert fn("sage") is False
