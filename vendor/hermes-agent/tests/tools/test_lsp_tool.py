"""Agent-callable LSP navigation tool (P2, 2026-09-24).

Unit tests stub the LSPService — no real language server is spawned. Pins:
  * error paths are descriptive JSON, never exceptions (model learns WHY);
  * LSP 0-based positions are converted from 1-based tool args;
  * Location/LocationLink/hover-contents/symbol-tree normalization and caps;
  * read_file-grade path guards (NT namespace / credential denylist) run first;
  * outer join budget covers the inner ceiling and never blacklists the client;
  * the tool registers and ships in the coding toolset.
"""
import concurrent.futures
import json
import os
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from tools.lsp_tool import lsp_navigate


def _svc():
    calls = []

    def navigation_sync(file_path, operation, *, line=None, character=None, query=None, timeout=None):
        calls.append({"file_path": file_path, "operation": operation,
                      "line": line, "character": character, "query": query})
        if operation == "hover":
            return {"ok": True, "operation": "hover", "server": "pyright",
                    "result": {"contents": {"kind": "markdown", "value": "`foo(x: int) -> str`"}}}
        if operation == "definition":
            return {"ok": True, "operation": "definition", "server": "pyright",
                    "result": [{"uri": "file:///w/a.py", "range": {"start": {"line": 9, "character": 3},
                                                                   "end": {"line": 9, "character": 7}}}]}
        if operation == "references":
            return {"ok": True, "operation": "references", "server": "pyright", "result": None}
        if operation == "document_symbol":
            return {"ok": True, "operation": "document_symbol", "server": "pyright",
                    "result": [{"name": "foo", "kind": 12, "range": {"start": {"line": 0}},
                                "children": [{"name": "bar", "kind": 6,
                                              "range": {"start": {"line": 2}}}]}]}
        if operation == "workspace_symbol":
            return {"ok": True, "operation": "workspace_symbol", "server": "pyright",
                    "result": [{"name": "foo", "kind": 12, "location": {"uri": "file:///w/a.py",
                                 "range": {"start": {"line": 0}}}}]}
        return {"ok": False, "error": "unknown"}

    return SimpleNamespace(navigation_sync=navigation_sync), calls


class TestErrorPaths:
    def test_missing_file_path(self):
        assert json.loads(lsp_navigate())["ok"] is False

    def test_nonexistent_file(self):
        out = json.loads(lsp_navigate(operation="hover", file_path="/nope/never.py"))
        assert out["ok"] is False and "not found" in out["error"]

    def test_service_inactive_is_descriptive(self, tmp_path):
        f = tmp_path / "a.py"
        f.write_text("x = 1\n")
        with patch("tools.lsp_tool._active_service", return_value=None):
            out = json.loads(lsp_navigate(operation="hover", file_path=str(f)))
        assert out["ok"] is False and "not active" in out["error"]


class TestPathGuards:
    """read_file 同级守卫：NT 命名空间（触碰即 NTLM 泄露）与敏感文件拒绝清单。"""

    def test_nt_namespace_unc_path_rejected_before_any_touch(self):
        # 守卫必须先于存在性检查：解析 \\?\UNC\... 本身就触发 SMB 认证。
        out = json.loads(lsp_navigate(
            operation="hover", file_path="\\\\?\\UNC\\evilhost\\share\\missing.py"))
        assert out["ok"] is False and "NTLM" in out["error"]
        assert "not found" not in out["error"]

    def test_env_file_rejected(self, tmp_path):
        f = tmp_path / ".env"
        f.write_text("SECRET=1\n")
        out = json.loads(lsp_navigate(operation="hover", file_path=str(f), line=1, character=1))
        assert out["ok"] is False and "denied" in out["error"].lower()

    def test_credential_store_rejected(self):
        import hermes_constants
        f = hermes_constants.get_hermes_home() / "auth.json"
        f.write_text("{}\n")
        out = json.loads(lsp_navigate(operation="hover", file_path=str(f), line=1, character=1))
        assert out["ok"] is False and "credential" in out["error"]


class TestNavigation:
    def test_hover_normalizes_markdown_contents(self, tmp_path):
        f = tmp_path / "a.py"
        f.write_text("def foo(): pass\n")
        svc, calls = _svc()
        with patch("tools.lsp_tool._active_service", return_value=svc):
            out = json.loads(lsp_navigate(operation="hover", file_path=str(f), line=1, character=5))
        assert out["ok"] is True
        assert "`foo(x: int) -> str`" in out["hover"]
        assert calls[0]["line"] == 1 and calls[0]["character"] == 5

    def test_definition_formats_1_based_locations(self, tmp_path):
        f = tmp_path / "a.py"
        f.write_text("from b import foo\nfoo()\n")
        svc, _ = _svc()
        with patch("tools.lsp_tool._active_service", return_value=svc):
            out = json.loads(lsp_navigate(operation="definition", file_path=str(f), line=2, character=1))
        assert out["locations"] == ["/w/a.py:10 (col 4)"]  # LSP line 9 → 1-based 10

    def test_definition_accepts_locationlink_shape(self, tmp_path):
        """client 声明 linkSupport:true，服务器可回 LocationLink[]（targetUri/targetRange）。"""
        f = tmp_path / "a.py"
        f.write_text("from b import foo\nfoo()\n")
        svc = SimpleNamespace(navigation_sync=lambda *a, **k: {
            "ok": True, "operation": "definition", "server": "pyright",
            "result": [
                {"targetUri": "file:///w/a.py",
                 "targetRange": {"start": {"line": 9, "character": 3}, "end": {"line": 9, "character": 7}}},
                {"targetUri": "file:///w/b.py",
                 "targetSelectionRange": {"start": {"line": 2, "character": 0},
                                          "end": {"line": 2, "character": 4}}},
            ]})
        with patch("tools.lsp_tool._active_service", return_value=svc):
            out = json.loads(lsp_navigate(operation="definition", file_path=str(f), line=2, character=1))
        assert out["locations"] == ["/w/a.py:10 (col 4)", "/w/b.py:3 (col 1)"]

    def test_locations_are_url_decoded_and_windows_drives_restored(self, tmp_path):
        f = tmp_path / "a.py"
        f.write_text("foo()\n")
        svc = SimpleNamespace(navigation_sync=lambda *a, **k: {
            "ok": True, "operation": "definition", "server": "pyright",
            "result": [
                {"uri": "file:///w/my%20dir/%E4%B8%AD%E6%96%87.py",
                 "range": {"start": {"line": 0, "character": 0}, "end": {"line": 0, "character": 1}}},
                {"uri": "file:///C:/proj/x.py",
                 "range": {"start": {"line": 0, "character": 0}, "end": {"line": 0, "character": 1}}},
            ]})
        with patch("tools.lsp_tool._active_service", return_value=svc):
            out = json.loads(lsp_navigate(operation="definition", file_path=str(f), line=1, character=1))
        # %XX 解码还原空格/中文；file:///C:/x 剥掉盘符前导斜杠。
        assert out["locations"] == ["/w/my dir/中文.py:1 (col 1)", "C:/proj/x.py:1 (col 1)"]

    def test_references_none_result_gets_note(self, tmp_path):
        f = tmp_path / "a.py"
        f.write_text("foo()\n")
        svc, _ = _svc()
        with patch("tools.lsp_tool._active_service", return_value=svc):
            out = json.loads(lsp_navigate(operation="references", file_path=str(f), line=1, character=1))
        assert out["ok"] is True and out["count"] == 0 and "no matches" in out["note"]

    def test_document_symbol_flattens_tree(self, tmp_path):
        f = tmp_path / "a.py"
        f.write_text("def foo():\n    bar()\n")
        svc, _ = _svc()
        with patch("tools.lsp_tool._active_service", return_value=svc):
            out = json.loads(lsp_navigate(operation="document_symbol", file_path=str(f)))
        assert out["symbols"] == ["12 foo:1", "  6 bar:3"]

    def test_workspace_symbol_symbolinformation_shape(self, tmp_path):
        f = tmp_path / "a.py"
        f.write_text("x = 1\n")
        svc, calls = _svc()
        with patch("tools.lsp_tool._active_service", return_value=svc):
            out = json.loads(lsp_navigate(operation="workspace_symbol", file_path=str(f), query="foo"))
        assert out["symbols"] == ["12 foo:1"]
        assert calls[0]["query"] == "foo"

    def test_service_error_propagates_as_json(self, tmp_path):
        f = tmp_path / "a.py"
        f.write_text("x = 1\n")
        svc = SimpleNamespace(navigation_sync=lambda *a, **k: {"ok": False, "error": "LSP is disabled"})
        with patch("tools.lsp_tool._active_service", return_value=svc):
            out = json.loads(lsp_navigate(operation="hover", file_path=str(f), line=1, character=1))
        assert out["ok"] is False and "disabled" in out["error"]


class TestManagerNavigationSync:
    """navigation_sync argument validation (no server spawned)."""

    def _manager(self):
        from agent.lsp.manager import LSPService
        return LSPService.__new__(LSPService)  # no __init__: no loop/config needed

    def test_unknown_operation_rejected(self):
        out = self._manager().navigation_sync("/tmp/x.py", "rename")
        assert out["ok"] is False and "unknown operation" in out["error"]

    def test_missing_position_rejected(self):
        out = self._manager().navigation_sync("/tmp/x.py", "hover")
        assert out["ok"] is False and "line" in out["error"]

    def test_workspace_symbol_requires_query(self):
        out = self._manager().navigation_sync("/tmp/x.py", "workspace_symbol")
        assert out["ok"] is False and "query" in out["error"]

    def test_disabled_service_is_descriptive(self, tmp_path):
        m = self._manager()
        with patch.object(m, "enabled_for", return_value=False):
            out = m.navigation_sync(str(tmp_path / "x.py"), "hover", line=1, character=1)
        assert out["ok"] is False and ("disabled" in out["error"] or "no language server" in out["error"])

    def test_non_integer_position_rejected(self):
        """int() 在 try 之外：非法类型必须在参数校验挡掉，不得逃出 "Never raises"。"""
        for bad in ("abc", [], {}):
            out = self._manager().navigation_sync("/tmp/x.py", "hover", line=bad, character=1)
            assert out["ok"] is False and "integer" in out["error"], bad

    def test_bool_position_rejected(self):
        out = self._manager().navigation_sync("/tmp/x.py", "hover", line=True, character=1)
        assert out["ok"] is False and "integer" in out["error"]


class TestManagerTimeoutBudget:
    """外层 join 预算必须盖住内层上界；只读查询失败不拉黑共享 LSP 客户端。"""

    def _manager(self):
        from agent.lsp.manager import LSPService
        return LSPService.__new__(LSPService)  # no __init__: no loop/config needed

    def test_outer_join_budget_covers_inner_ceiling(self):
        m = self._manager()
        recorded = {}

        class _Loop:
            def run(self, coro, *, timeout=None):
                recorded["timeout"] = timeout
                coro.close()
                raise concurrent.futures.TimeoutError("outer join timed out")

        m._loop = _Loop()
        broken = []
        with (
            patch.object(m, "enabled_for", return_value=True),
            patch.object(m, "_server_for", return_value=SimpleNamespace(server_id="pyright")),
            patch.object(m, "_wait_budget", return_value=5.0),
            patch.object(m, "_mark_broken_for_file", side_effect=lambda *a, **k: broken.append(a)),
        ):
            out = m.navigation_sync("/tmp/x.py", "hover", line=1, character=1)
        assert out["ok"] is False and "failed" in out["error"]
        # 内层上界 = 2*max(budget,1) + 1.5(空答复重发) + 7(两轮 ContentModified 退避) + 1(余量)
        assert recorded["timeout"] >= 2 * 5.0 + 1.5
        assert broken == []  # 只读查询超时不得拉黑共享客户端（broken_retry_seconds=0 → 永久）

    def test_timeout_classified_as_timeout_not_server_error(self):
        """外层 join 抛 concurrent.futures.TimeoutError：记 timeout，不记 server_error。"""
        m = self._manager()

        class _Loop:
            def run(self, coro, *, timeout=None):
                coro.close()
                raise concurrent.futures.TimeoutError("outer join timed out")

        m._loop = _Loop()
        with (
            patch.object(m, "enabled_for", return_value=True),
            patch.object(m, "_server_for", return_value=SimpleNamespace(server_id="pyright")),
            patch.object(m, "_wait_budget", return_value=5.0),
            patch("agent.lsp.manager.eventlog.log_timeout") as log_timeout,
            patch("agent.lsp.manager.eventlog.log_server_error") as log_server_error,
        ):
            out = m.navigation_sync("/tmp/x.py", "hover", line=1, character=1)
        assert out["ok"] is False
        assert log_timeout.called and not log_server_error.called


class TestTaskPathResolution:
    """schema 允许工作区相对路径：解析走 read_file 的 _resolve_path_for_task（task_id）。"""

    def test_handler_forwards_task_id_to_path_resolution(self, tmp_path, monkeypatch):
        f = tmp_path / "a.py"
        f.write_text("x = 1\n")
        svc, _ = _svc()
        seen = {}

        def fake_resolve(p, task_id="default"):
            seen["task_id"] = task_id
            return f if not os.path.isabs(p) else Path(p)

        monkeypatch.setattr("tools.lsp_tool._resolve_path_for_task", fake_resolve)
        from tools.lsp_tool import _handle_lsp
        with patch("tools.lsp_tool._active_service", return_value=svc):
            out = json.loads(_handle_lsp(
                {"operation": "hover", "file_path": str(f), "line": 1, "character": 1},
                task_id="task-42"))
        assert out["ok"] is True
        assert seen["task_id"] == "task-42"


class TestRegistration:
    def test_tool_in_coding_toolset(self):
        from tools.registry import discover_builtin_tools, registry
        discover_builtin_tools()
        assert "lsp" in registry._tools
        import toolsets
        coding = toolsets.resolve_toolset("coding")
        flat = json.dumps(coding if not isinstance(coding, str) else [coding])
        assert "lsp" in flat or coding == "lsp"
