"""Tests for Action Fusion (``then_run`` on write_file / patch) — SoL-Pi mechanism #1.

The fused validation command runs inside the file tool's own execution path, under a
content-hash guard that skips it when the written file changed on disk. These tests
exercise the real local file_ops chain (write → hash guard → command → merged block).
"""

import json

import pytest

from hermes_constants import reset_hermes_home_override, set_hermes_home_override
from tools import file_tools as ft


@pytest.fixture(autouse=True)
def isolated_home(tmp_path):
    token = set_hermes_home_override(str(tmp_path / "hermes"))
    yield tmp_path
    reset_hermes_home_override(token)


@pytest.fixture(autouse=True)
def clean_task_state():
    # Per-task read-tracking/baseline state is process-global; isolate the "fusion"
    # task so stale baselines from other tests cannot refuse the writes.
    from tools import file_state, file_tools_read_tracking as rt
    rt._read_tracker.pop("fusion", None)
    saved_locks = dict(getattr(file_state, "_task_locks", {}) or {})
    yield
    rt._read_tracker.pop("fusion", None)
    file_state._task_locks = saved_locks


class TestWriteFileFusion:
    def test_passing_command_merges_output(self, tmp_path):
        target = tmp_path / "ok.py"
        out = json.loads(ft.write_file_tool(
            path=str(target), content="print('hi')\n", task_id="fusion",
            then_run=f"python3 -m py_compile {target} && echo COMPILED"))
        assert not out.get("error"), out
        block = out["then_run"]
        assert block["exit_code"] == 0
        assert "COMPILED" in block["output"]
        assert block["command"].startswith("python3 -m py_compile")

    def test_failing_command_reports_verdict(self, tmp_path):
        target = tmp_path / "bad.py"
        out = json.loads(ft.write_file_tool(
            path=str(target), content="def broken(:\n", task_id="fusion",
            then_run=f"python3 -m py_compile {target}"))
        # The WRITE succeeded (content is valid text); the fused VALIDATION failed —
        # exactly the signal the model would otherwise burn a terminal round on.
        assert not out.get("error"), out
        assert out["then_run"]["exit_code"] != 0

    def test_hash_guard_skips_on_mismatch(self, tmp_path, monkeypatch):
        target = tmp_path / "guard.py"
        monkeypatch.setattr(ft, "_then_run_hash_ok", lambda *a, **k: False)
        out = json.loads(ft.write_file_tool(
            path=str(target), content="x = 1\n", task_id="fusion",
            then_run="echo SHOULD-NOT-RUN"))
        assert "skipped" in out["then_run"]
        assert "content-hash guard" in out["then_run"]["skipped"]

    def test_no_then_run_unchanged_shape(self, tmp_path):
        target = tmp_path / "plain.txt"
        out = json.loads(ft.write_file_tool(path=str(target), content="data\n", task_id="fusion"))
        assert "then_run" not in out

    def test_write_error_skips_command(self, tmp_path, monkeypatch):
        blocker = tmp_path / "blocker.txt"
        blocker.write_text("in the way")
        calls = []
        monkeypatch.setattr(ft, "_run_then_run_fused",
                            lambda *a, **k: calls.append(1) or {})
        out = json.loads(ft.write_file_tool(
            # parent is a regular FILE: the write must fail before any validation.
            path=str(blocker / "child.py"), content="x\n",
            task_id="fusion", then_run="echo X"))
        assert out.get("error") or out.get("_warning") or "then_run" not in out
        assert not calls


class TestPatchFusion:
    def test_patch_replace_then_run(self, tmp_path):
        target = tmp_path / "mod.py"
        ft.write_file_tool(path=str(target), content="value = 1\n", task_id="fusion")
        out = json.loads(ft.patch_tool(
            path=str(target), old_string="value = 1", new_string="value = 2",
            task_id="fusion", then_run=f"grep -q 'value = 2' {target} && echo PATCHED"))
        assert out.get("success") or not out.get("error"), out
        assert out["then_run"]["exit_code"] == 0
        assert "PATCHED" in out["then_run"]["output"]


class TestSchemas:
    def test_write_schema_advertises_then_run(self):
        prop = ft.WRITE_FILE_SCHEMA["parameters"]["properties"]["then_run"]
        assert prop["type"] == "string"
        assert "hash" in prop["description"].lower()

    def test_patch_schema_advertises_then_run(self):
        assert "then_run" in ft.PATCH_SCHEMA["parameters"]["properties"]

    def test_handlers_pass_then_run(self, monkeypatch, tmp_path):
        seen = {}
        real = ft.write_file_tool

        def spy(**kw):
            seen.update(kw)
            return real(**{k: v for k, v in kw.items() if k != "session_id" or True})

        monkeypatch.setattr(ft, "write_file_tool", spy)
        import hermes_cli.observability.shared_metrics_harness as smh
        monkeypatch.setattr(smh, "record_file_edit",
                            lambda name, mode, fn: fn())
        ft._handle_write_file({"path": str(tmp_path / "h.txt"), "content": "c",
                               "then_run": "echo hi"}, task_id="fusion")
        assert seen.get("then_run") == "echo hi"


class TestFusionLedger:
    def test_ledger_records_ran_and_skipped(self, tmp_path, monkeypatch):
        from tools.efficiency_ledger import ledger_path
        verdicts = iter([False, True])  # first call trips the guard, second passes it
        monkeypatch.setattr(ft, "_then_run_hash_ok", lambda *a, **k: next(verdicts))
        ft.write_file_tool(path=str(tmp_path / "l1.py"), content="a=1\n", task_id="fusion",
                           then_run="echo no")
        ft.write_file_tool(path=str(tmp_path / "l2.py"), content="a=2\n", task_id="fusion",
                           then_run="echo yes")
        events = [json.loads(l) for l in ledger_path().read_text().splitlines()]
        outcomes = {e.get("outcome") for e in events if e["kind"] == "action_fusion"}
        assert {"skipped_guard", "ran"} <= outcomes
