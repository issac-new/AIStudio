"""zcode-acp-delegate 引擎身份解析守门（九点对账轮 P0-2）。

resolve_engine_bin_env 的三级优先序是「ACP 调用的是 Ycode（本仓分叉）」的
唯一开关：显式 env ZCODE_BIN > 部署位 ~/.hermes/ycode/zcode.cjs > 桥自兜底
（PATH/官方 ZCode.app）。断言：部署位在位必须注入 env（否则 ACP 链悄悄跑在
官方引擎上=身份漂移）；显式 env 不被覆盖。
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

    def test_deployed_fork_preferred(self, monkeypatch, tmp_path):
        mod = _load()
        monkeypatch.delenv("ZCODE_BIN", raising=False)
        fork = tmp_path / "zcode.cjs"
        fork.write_text("// stub", encoding="utf-8")
        monkeypatch.setattr(mod, "YCODE_FORK_CLI", str(fork))
        assert mod.resolve_engine_bin_env() == "ycode-fork"
        assert os.environ["ZCODE_BIN"] == str(fork)
        monkeypatch.delenv("ZCODE_BIN", raising=False)

    def test_bridge_default_when_absent(self, monkeypatch, tmp_path):
        mod = _load()
        monkeypatch.delenv("ZCODE_BIN", raising=False)
        monkeypatch.setattr(mod, "YCODE_FORK_CLI", str(tmp_path / "missing.cjs"))
        assert mod.resolve_engine_bin_env() == "bridge-default"
        assert "ZCODE_BIN" not in os.environ
