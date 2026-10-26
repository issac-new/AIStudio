"""ACP 客户端加固（Task 4A）：权限只允许一次、workspace 隔离、模型 fail-closed、重铺源一致。

不真起子进程：Popen/_send 全部打桩；只验证客户端侧判定逻辑。
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

_PLUGIN = Path(__file__).resolve().parents[2] / "team" / "profiles" / "worker-coder" / "plugins" / "acp-client" / "__init__.py"
_FIX = Path(__file__).resolve().parents[2] / "team" / "patches" / "acp-client-codex-fix__init__.py"


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture
def acp():
    return _load("acp_hardening_under_test", _PLUGIN)


class _CapturedClient:
    """捕获 _send 输出的最小客户端替身。"""

    def __init__(self, mod):
        self.mod = mod
        self.sent = []
        self.auto_approve = True
        self.default_cwd = "/tmp/w"
        self._session_roots = []
        self._path_within_roots = mod.ACPClient._path_within_roots

    def _send(self, payload):
        self.sent.append(payload)

    def permission(self, options):
        params = {"options": options}
        mid = 7
        self.mod.ACPClient._do_permission(self, mid, params)
        for msg in self.sent:
            if msg.get("id") == mid:
                return msg["result"]["outcome"]
        return None


def test_permission_auto_approve_selects_only_allow_once(acp):
    c = _CapturedClient(acp)
    c.auto_approve = True
    out = c.permission([
        {"kind": "allow_always", "optionId": "always-1"},
        {"kind": "allow_once", "optionId": "once-1"},
    ])
    assert out["outcome"] == "selected"
    assert out["optionId"] == "once-1"  # 永远不选 allow_always


def test_permission_auto_approve_without_allow_once_cancels(acp):
    c = _CapturedClient(acp)
    c.auto_approve = True
    out = c.permission([
        {"kind": "allow_always", "optionId": "always-1"},
        {"kind": "deny", "optionId": "deny-1"},
    ])
    assert out["outcome"] == "cancel"  # 原实现会退到首个选项（越权面）


def test_permission_disabled_cancels(acp):
    c = _CapturedClient(acp)
    c.auto_approve = False
    out = c.permission([{"kind": "allow_once", "optionId": "once-1"}])
    assert out["outcome"] == "cancel"


def test_fs_write_bounded_to_session_roots(acp, tmp_path):
    c = _CapturedClient(acp)
    c._session_roots = [str(tmp_path / "ws")]
    (tmp_path / "ws").mkdir()
    ok_file = tmp_path / "ws" / "a.txt"
    acp.ACPClient._do_fs_write(c, 11, {"path": str(ok_file), "content": "x"})
    assert ok_file.read_text() == "x"

    outside = tmp_path / "escape.txt"
    acp.ACPClient._do_fs_write(c, 12, {"path": str(outside), "content": "x"})
    assert not outside.exists()
    err = next(m for m in c.sent if m.get("id") == 12)
    assert "error" in err  # 越根写入被拒且不落盘


def test_terminal_cwd_escape_rejected(acp, tmp_path):
    root = tmp_path / "ws2"
    root.mkdir()
    assert acp.ACPClient._path_within_roots(str(root / "sub" / "deeper"), [str(root)])
    assert not acp.ACPClient._path_within_roots(str(tmp_path), [str(root)])
    assert not acp.ACPClient._path_within_roots("/etc", [str(root)])


def test_client_pool_keyed_by_provider_and_workspace(acp, tmp_path):
    a = acp._client_key("zcode", str(tmp_path / "w1"))
    b = acp._client_key("zcode", str(tmp_path / "w2"))
    c = acp._client_key("claude", str(tmp_path / "w1"))
    assert a != b and a != c


def test_model_resolution_precedence(acp, monkeypatch):
    cfg = {"providers": {"zcode": {"model": "GLM-5.3"}}}
    assert acp._resolve_model("zcode", {}, cfg) == "GLM-5.3"
    assert acp._resolve_model("zcode", {"model": "GLM-5.3-Flash"}, cfg) == "GLM-5.3-Flash"
    monkeypatch.setenv("ZCODE_ACP_MODEL", "GLM-5.3")
    assert acp._resolve_model("zcode", {}, cfg) == "GLM-5.3"
    monkeypatch.delenv("ZCODE_ACP_MODEL")
    env_cfg = {"providers": {"zcode": {"env": {"ZCODE_MODEL": "GLM-5.3-Flash"}}}}
    assert acp._resolve_model("zcode", {}, env_cfg) == "GLM-5.3-Flash"


def test_reapply_source_matches_hardened_plugin(acp):
    assert _FIX.read_bytes() == _PLUGIN.read_bytes(), (
        "重铺源与现役插件漂移：team/patches/acp-client-codex-fix__init__.py 必须随插件同步，"
        "否则 apply 脚本一次回放即回退加固"
    )


def test_all_profile_copies_identical(acp):
    import hashlib
    base = hashlib.md5(_PLUGIN.read_bytes()).hexdigest()
    for p in sorted((Path(__file__).resolve().parents[2] / "team" / "profiles").glob("*/plugins/acp-client/__init__.py")):
        assert hashlib.md5(p.read_bytes()).hexdigest() == base, f"副本漂移：{p}"
