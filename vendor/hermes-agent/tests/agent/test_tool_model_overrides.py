"""per-model 工具覆盖守门（codex 候补吸收：按模型套 description/parameters，坏 schema 整条跳过）。"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_WORKTREE = Path(__file__).resolve().parents[2]
if str(_WORKTREE) not in sys.path:
    sys.path.insert(0, str(_WORKTREE))

from agent.tool_model_overrides import apply_model_tool_overrides, load_overrides  # noqa: E402


def _defs():
    return [
        {"type": "function", "function": {"name": "terminal",
         "description": "bundled terminal", "parameters": {"type": "object", "properties": {}}}},
        {"type": "function", "function": {"name": "read_file",
         "description": "bundled read", "parameters": {"type": "object", "properties": {}}}},
    ]


class TestApply:
    def test_exact_match_overrides_desc_and_params(self):
        ov = {"qwen3.7-max": {"terminal": {
            "description": "为 qwen 定制",
            "parameters": {"type": "object", "properties": {"cmd": {"type": "string"}}, "required": ["cmd"]},
        }}}
        out = apply_model_tool_overrides(_defs(), "qwen3.7-max", ov)
        term = out[0]["function"]
        assert term["description"] == "为 qwen 定制"
        assert term["parameters"]["required"] == ["cmd"]
        assert out[1]["function"]["description"] == "bundled read"  # 未覆盖工具原样

    def test_wildcard_pattern(self):
        ov = {"glm-*": {"terminal": {"description": "glm 系定制"}}}
        out = apply_model_tool_overrides(_defs(), "glm-5.3-flash", ov)
        assert out[0]["function"]["description"] == "glm 系定制"
        # 其他模型不受影响。
        out2 = apply_model_tool_overrides(_defs(), "qwen3.7-max", ov)
        assert out2[0]["function"]["description"] == "bundled terminal"

    def test_invalid_params_fallback_bundled_with_warning(self, caplog):
        ov = {"m": {"terminal": {"parameters": {"no_type": True}}}}
        out = apply_model_tool_overrides(_defs(), "m", ov)
        assert out[0]["function"]["parameters"] == {"type": "object", "properties": {}}
        assert any("invalid parameters" in r.message for r in caplog.records)

    def test_unknown_tool_and_no_match_passthrough(self):
        ov = {"m": {"nonexistent_tool": {"description": "x"}}}
        assert apply_model_tool_overrides(_defs(), "m", ov) == _defs()
        ov2 = {"other-model": {"terminal": {"description": "x"}}}
        assert apply_model_tool_overrides(_defs(), "m", ov2) == _defs()
        assert apply_model_tool_overrides(_defs(), "m", {}) == _defs()
        assert apply_model_tool_overrides(_defs(), "", {"m": {"terminal": {"description": "x"}}}) == _defs()

    def test_input_not_mutated(self):
        d = _defs()
        ov = {"m": {"terminal": {"description": "changed"}}}
        apply_model_tool_overrides(d, "m", ov)
        assert d[0]["function"]["description"] == "bundled terminal"

    def test_missing_properties_skips_whole_override(self, caplog):
        # {"type": "object"} 缺 properties 也是坏 schema：整条 override（含 description）
        # 跳过并告警一次，捆绑版原样——不做半套用。
        ov = {"bad-schema-model": {"terminal": {
            "description": "不该被套用",
            "parameters": {"type": "object"},
        }}}
        out = apply_model_tool_overrides(_defs(), "bad-schema-model", ov)
        assert out[0]["function"] == _defs()[0]["function"]
        assert any("invalid parameters" in r.message for r in caplog.records)

    def test_required_must_be_list(self):
        ov = {"req-model": {"terminal": {
            "parameters": {"type": "object", "properties": {}, "required": "cmd"},
        }}}
        out = apply_model_tool_overrides(_defs(), "req-model", ov)
        assert out[0]["function"]["parameters"] == {"type": "object", "properties": {}}


class TestLoadOverrides:
    def test_config_failure_warns_not_silent(self, caplog, monkeypatch):
        # load_overrides 的吞错不再零告警：配置读取失败必须留痕后回空。
        import types

        def _boom():
            raise OSError("config.yaml is gone")

        stub = types.ModuleType("hermes_cli.config")
        stub.load_config_readonly = _boom
        monkeypatch.setitem(sys.modules, "hermes_cli.config", stub)
        assert load_overrides() == {}
        assert any("config 读取失败" in r.message for r in caplog.records)
