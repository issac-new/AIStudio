"""核心编码链接线守门（ACP→Ycode→项目技能→任务工作区）。

只做源码/配置级断言：不启动 ACP 引擎、不写宿主目录。真实编码回合需在有
`zcode-acp-server` 与任务工作区的宿主另跑。
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PROFILES = REPO / "team" / "profiles"


def _acp_plugins() -> list[Path]:
    return sorted(PROFILES.glob("*/plugins/acp-client/__init__.py"))


def test_acp_plugin_copies_are_identical() -> None:
    files = _acp_plugins()
    assert len(files) >= 20, f"ACP 插件副本数异常：{len(files)}"
    hashes = {hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    assert len(hashes) == 1, f"ACP 插件副本已分叉：{len(hashes)} 个哈希"


def test_acp_plugin_resolves_provider_and_task_cwd() -> None:
    source = _acp_plugins()[0].read_text(encoding="utf-8")
    # 不得覆盖既有的引擎命令解析函数
    assert "def _resolve_provider(name: str)" in source
    assert "def _resolve_provider_name(provider: str, cfg: dict)" in source
    assert "HERMES_ACP_PROVIDER" in source
    assert "HERMES_KANBAN_WORKSPACE" in source
    assert "_resolve_provider_name(provider or \"\", cfg)" in source
    # agents 与 send 两条入口都必须走统一 cwd 解析
    assert source.count("cwd = _resolve_cwd(args, client)") == 2


def test_worker_coder_defaults_to_ycode_provider() -> None:
    text = (REPO / "team" / "shared" / "profiles.yaml").read_text(encoding="utf-8")
    start = text.index("  worker-coder:")
    end = text.index("  worker-researcher:", start)
    block = text[start:end]
    assert "HERMES_ACP_PROVIDER: zcode" in block


def test_soul_prepares_project_skill_before_delegating() -> None:
    soul = (PROFILES / "worker-coder" / "SOUL.md").read_text(encoding="utf-8")
    loop_start = soul.index("## 标准作业循环")
    loop_end = soul.index("## RD 质量门", loop_start)
    loop = soul[loop_start:loop_end]
    prep = loop.index("项目 dev skill 准备")
    delegate = loop.index('acp_send(provider="zcode"')
    upgrade = loop.index("yuan skill: --upgrade")
    assert prep < delegate < upgrade, "标准循环顺序应为：准备技能 → ACP 委托 → 升级技能"
    assert "## 编码前：项目 dev skill 先行" in soul
    assert "## 编码后：升级与校验项目 dev skill" in soul
    assert 'SKILL_NAME="${PROJECT_NAME}-dev"' in soul
    assert '"$HERMES_KANBAN_WORKSPACE/.claude/skills/$SKILL_NAME"' in soul
    assert 'ln -sfn "$SKILL_DIR" "$HOME/.zcode/skills/$SKILL_NAME"' in soul


def test_runtime_manifest_ships_coding_delegate_skill_card() -> None:
    manifest = json.loads((REPO / "runtime-manifest.json").read_text(encoding="utf-8"))
    dests = {item["dest"] for item in manifest["files"]}
    assert "hermes-skills/coding-delegate/SKILL.md" in dests
    assert "hermes-skills/coding-delegate/scripts/zcode-acp-delegate.py" in dests


def _load_plugin():
    spec = importlib.util.spec_from_file_location("acp_plugin_under_test", _acp_plugins()[0])
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class _FakeClient:
    default_cwd = "/default-cwd"


def test_provider_and_cwd_precedence(monkeypatch) -> None:
    module = _load_plugin()
    monkeypatch.delenv("HERMES_ACP_PROVIDER", raising=False)
    monkeypatch.delenv("HERMES_KANBAN_WORKSPACE", raising=False)

    cfg = {"default_provider": "codex"}
    assert module._resolve_provider_name("", cfg) == "codex"
    monkeypatch.setenv("HERMES_ACP_PROVIDER", "zcode")
    assert module._resolve_provider_name("", cfg) == "zcode"
    assert module._resolve_provider_name("claude", cfg) == "claude"

    assert module._resolve_cwd({}, _FakeClient()) == "/default-cwd"
    monkeypatch.setenv("HERMES_KANBAN_WORKSPACE", "/task/ws")
    assert module._resolve_cwd({}, _FakeClient()) == "/task/ws"
    assert module._resolve_cwd({"cwd": "/explicit"}, _FakeClient()) == "/explicit"
