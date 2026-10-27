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


class TestTaskContext:
    """--task 装配：worker_context 注入、workspace 规范化与 delegate-result 落盘。
    需拼合树 PYTHONPATH（runtime 覆盖 vendor/hermes-agent）。"""

    def _home(self, tmp_path, monkeypatch):
        import sys
        home = tmp_path / ".hermes"
        home.mkdir()
        monkeypatch.setenv("HERMES_HOME", str(home))
        from hermes_cli import kanban_db as kb
        kb._INITIALIZED_PATHS.clear()
        kb.init_db()
        return home

    def test_compose_prompt_carries_context_and_instruction(self):
        mod = _load()
        p = mod.compose_task_prompt("# 上下文\n验收：AC-1", "实现 X")
        assert "AC-1" in p and "实现 X" in p
        assert p.index("# 上下文") < p.index(mod.INSTRUCTION_HEADER) < p.index("实现 X")

    def test_resolve_workspace_relative_anchored_and_escape_refused(self, tmp_path, monkeypatch):
        mod = _load()
        monkeypatch.setenv("HERMES_KANBAN_WORKSPACES_ROOT", str(tmp_path / "ws"))
        import types
        task = types.SimpleNamespace(id="t_1", workspace_kind="dir", workspace_path="rel/deep")
        p, ok = mod.resolve_task_workspace(task, None)
        assert str(p).endswith("rel/deep") and ok is False
        bad = types.SimpleNamespace(id="t_2", workspace_kind="dir", workspace_path="../escape")
        try:
            mod.resolve_task_workspace(bad, None)
            raise AssertionError("逃逸应拒绝")
        except mod.TaskContextError:
            pass
        scratch = types.SimpleNamespace(id="t_3", workspace_kind="scratch", workspace_path=None)
        p3, _ = mod.resolve_task_workspace(scratch, None)
        assert p3.name == "t_3"

    def test_load_task_context_missing_or_unmaterialized(self, tmp_path, monkeypatch):
        mod = _load()
        home = self._home(tmp_path, monkeypatch)
        try:
            mod.load_task_context("t_none", None)
            raise AssertionError("任务不存在应报错")
        except mod.TaskContextError:
            pass
        from hermes_cli import kanban_db as kb
        from hermes_cli import kanban_db_connect as kbc
        with kbc.connect() as conn:
            tid = kb.create_task(conn, title="T", body="验收：AC-9", assignee="a",
                                 workspace_kind="dir", workspace_path=None)
        try:
            mod.load_task_context(tid, None)
            raise AssertionError("未物化应报错")
        except mod.TaskContextError as exc:
            assert "未物化" in str(exc)
        ws = home / "kanban" / "workspaces" / tid
        ws.mkdir(parents=True)
        from hermes_cli import kanban_db_workspace as kbw
        with kbc.connect() as conn:
            kbw.set_workspace_path(conn, tid, ws)
        ctx, task, cwd = mod.load_task_context(tid, None)
        assert "AC-9" in ctx and str(cwd) == str(ws)

    def test_write_delegate_result_atomic(self, tmp_path):
        import json as _json
        mod = _load()
        out = mod.write_delegate_result(tmp_path, {"exit": 0, "taskId": "t"})
        assert out is not None and out.exists()
        doc = _json.loads(out.read_text())
        assert doc["taskId"] == "t" and doc["exit"] == 0
        assert not list((tmp_path / "materials").glob(".delegate-result.*"))
