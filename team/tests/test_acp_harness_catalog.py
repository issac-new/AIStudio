"""ACP Harness 目录（2026-11-19 目录化批）守门测试。

覆盖：目录 schema、准入对账（active ⊆ 白名单 / legacy ⊆ 退役）、
provider 解析（binary/binary_or_npx/npx/command）、模型环境变量、21 副本与
patch 源字节一致。不启动真实 harness。
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
_PLUGIN = REPO / "team" / "profiles" / "worker-coder" / "plugins" / "acp-client" / "__init__.py"
_FIX = REPO / "team" / "patches" / "acp-client-codex-fix__init__.py"
_CATALOG = REPO / "team" / "shared" / "acp-harness-catalog.yaml"


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture
def acp(monkeypatch):
    monkeypatch.setenv("HERMES_ACP_CATALOG", str(_CATALOG))
    mod = _load("acp_catalog_under_test", _PLUGIN)
    mod._load_harness_catalog(reload=True)
    return mod


def test_catalog_schema_is_complete():
    import yaml

    raw = yaml.safe_load(_CATALOG.read_text(encoding="utf-8"))
    assert raw["version"] == 1
    providers = raw["providers"]
    assert {"opencode", "codex", "claude", "zcode"} <= set(providers)
    allowed = {"binary", "binary_or_npx", "npx", "command"}
    for name, entry in providers.items():
        assert entry.get("displayName"), name
        launch = entry.get("launch") or {}
        strategy = launch.get("strategy")
        assert strategy in allowed, (name, strategy)
        if strategy in ("binary", "binary_or_npx"):
            assert isinstance(launch.get("candidates"), list), name
        if strategy in ("npx", "binary_or_npx"):
            assert launch.get("package"), name
        model = entry.get("model") or {}
        assert isinstance(model.get("envKeys", []), list), name


def test_active_catalog_is_subset_of_governance_whitelist():
    import yaml

    raw = yaml.safe_load(_CATALOG.read_text(encoding="utf-8"))
    contract = json.loads((REPO / "config" / "execution-contract.json").read_text(encoding="utf-8"))
    whitelist = {row["registryId"] for row in contract["codingBackends"]["whitelist"]}
    retired = set(contract["codingBackends"]["retired"])
    for name, entry in raw["providers"].items():
        registry = entry.get("registry_id")
        status = entry.get("status")
        if status == "active":
            assert registry in whitelist, (name, registry, whitelist)
        elif status == "legacy":
            assert registry in retired, (name, registry, retired)
        else:
            raise AssertionError(f"unknown status for {name}: {status}")


def test_all_copies_and_patch_source_match_canonical():
    canonical = _PLUGIN.read_text(encoding="utf-8")
    copies = sorted((REPO / "team" / "profiles").glob("*/plugins/acp-client/__init__.py"))
    assert len(copies) == 21
    for path in copies:
        assert path.read_text(encoding="utf-8") == canonical, path
    assert _FIX.read_text(encoding="utf-8") == canonical


def test_binary_provider_resolution(acp, monkeypatch):
    monkeypatch.setattr(acp, "_binary_available", lambda c: f"/fake/{c}" if c == "zcode-acp-server" else None)
    cmd, display = acp._resolve_provider("zcode")
    assert cmd == ["/fake/zcode-acp-server"]
    assert display == "ZCode Agent"


def test_npx_provider_resolution(acp, monkeypatch):
    monkeypatch.setattr(acp, "_find_npx", lambda preferred="npx": "/fake/npx")
    cmd, display = acp._resolve_provider("codex")
    assert cmd[:2] == ["/fake/npx", "@zed-industries/codex-acp"]
    assert 'sandbox_mode="danger-full-access"' in cmd
    assert display == "Codex"


def test_command_provider_resolution(tmp_path, monkeypatch):
    catalog = tmp_path / "catalog.yaml"
    catalog.write_text(
        "version: 1\nproviders:\n  custom-x:\n    displayName: Custom X\n"
        "    launch:\n      strategy: command\n      command: ['/bin/echo', 'hi']\n"
        "      args: ['--acp']\n    model:\n      envKeys: []\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("HERMES_ACP_CATALOG", str(catalog))
    mod = _load("acp_catalog_custom_test", _PLUGIN)
    mod._load_harness_catalog(reload=True)
    cmd, display = mod._resolve_provider("custom-x")
    assert cmd == ["/bin/echo", "hi", "--acp"]
    assert display == "Custom X"
    assert "custom-x" in mod._PROVIDER_DESC


def test_unknown_provider_lists_catalog_names(acp):
    with pytest.raises(ValueError) as ei:
        acp._resolve_provider("nope")
    assert "zcode" in str(ei.value)


def test_model_env_keys_from_catalog(acp, monkeypatch):
    monkeypatch.setenv("ZCODE_ACP_MODEL", "GLM-5.3")
    assert acp._resolve_model("zcode", {}, {"providers": {}}) == "GLM-5.3"
    # 显式参数优先
    assert acp._resolve_model("zcode", {"model": "explicit"}, {"providers": {}}) == "explicit"
