"""board_team_keys 纯函数守门（无 agent 包依赖，可在单仓直接跑）。"""

from __future__ import annotations

import importlib.util
from pathlib import Path

_MODULE = Path(__file__).resolve().parents[2] / "hermes_cli" / "board_team_keys.py"
_spec = importlib.util.spec_from_file_location("board_team_keys_under_test", _MODULE)
assert _spec and _spec.loader
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
team_raw = _mod.team_raw


def test_profiles_wins() -> None:
    assert team_raw({"profiles": ["sage"], "profile_scope": ["ops"]}) == ["sage"]


def test_profile_scope_fallback() -> None:
    assert team_raw({"profile_scope": ["ops", "sre"]}) == ["ops", "sre"]


def test_empty_profiles_is_present_and_fail_closed() -> None:
    # present-but-empty 必须原样返回（围栏据此 fail-closed），不能回落 profile_scope。
    assert team_raw({"profiles": [], "profile_scope": ["ops"]}) == []


def test_absent_and_non_dict() -> None:
    assert team_raw({}) is None
    assert team_raw(None) is None
    assert team_raw("profiles") is None
