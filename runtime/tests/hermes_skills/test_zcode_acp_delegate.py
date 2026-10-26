"""zcode-acp-delegate 引擎身份解析守门。

resolve_engine_bin_env 的四级优先序（2026-10-26 实测矩阵定谳后）：显式 env
ZCODE_BIN > 官方捆绑（3.16.3，coding-plan 端点当前唯一可用客户端基座）>
分叉部署位 ~/.hermes/ycode/zcode.cjs > 桥自兜底。断言：官方在位必须优先
（公开 main 基底被端点全量 500）；显式 env 不被覆盖；缺位时按序回落。
"""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path

_RUNTIME = Path(__file__).resolve().parents[2]
_SCRIPT = _RUNTIME / "hermes-skills" / "coding-delegate" / "scripts" / "zcode-acp-delegate.py"


def _load():
    spec = importlib.util.spec_from_file_location("zcode_acp_delegate", _SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class TestEngineBinEnv:
    def test_explicit_env_wins(self, monkeypatch):
        mod = _load()
        monkeypatch.setenv("ZCODE_BIN", "/opt/custom/zcode")
        assert mod.resolve_engine_bin_env() == "env"
        assert os.environ["ZCODE_BIN"] == "/opt/custom/zcode"

    def test_official_bundle_preferred(self, monkeypatch, tmp_path):
        mod = _load()
        monkeypatch.delenv("ZCODE_BIN", raising=False)
        official = tmp_path / "official.cjs"
        fork = tmp_path / "zcode.cjs"
        monkeypatch.setattr(mod, "OFFICIAL_BUNDLE_CLI", str(official))
        monkeypatch.setattr(mod, "YCODE_FORK_CLI", str(fork))
        official.write_text("// stub", encoding="utf-8")
        fork.write_text("// stub", encoding="utf-8")
        assert mod.resolve_engine_bin_env() == "official-bundle"
        assert os.environ["ZCODE_BIN"] == str(official)
        monkeypatch.delenv("ZCODE_BIN", raising=False)

    def test_fork_when_official_absent(self, monkeypatch, tmp_path):
        mod = _load()
        monkeypatch.delenv("ZCODE_BIN", raising=False)
        fork = tmp_path / "zcode.cjs"
        fork.write_text("// stub", encoding="utf-8")
        monkeypatch.setattr(mod, "OFFICIAL_BUNDLE_CLI", str(tmp_path / "absent.cjs"))
        monkeypatch.setattr(mod, "YCODE_FORK_CLI", str(fork))
        assert mod.resolve_engine_bin_env() == "ycode-fork"
        assert os.environ["ZCODE_BIN"] == str(fork)
        monkeypatch.delenv("ZCODE_BIN", raising=False)

    def test_bridge_default_when_all_absent(self, monkeypatch, tmp_path):
        mod = _load()
        monkeypatch.delenv("ZCODE_BIN", raising=False)
        monkeypatch.setattr(mod, "OFFICIAL_BUNDLE_CLI", str(tmp_path / "a.cjs"))
        monkeypatch.setattr(mod, "YCODE_FORK_CLI", str(tmp_path / "b.cjs"))
        assert mod.resolve_engine_bin_env() == "bridge-default"
        assert "ZCODE_BIN" not in os.environ
