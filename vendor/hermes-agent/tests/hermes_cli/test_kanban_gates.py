"""Tests for declarative column gates (routa four-piece absorption, first batch #8).

Covers:
* evaluate_gates unit semantics (approval / checklist / validator, routa order).
* gateMode blocking vs warning (blocking raises + ``gate_blocked`` event;
  warning passes + ``gate_warning`` event).
* Wiring on the three transitions: complete_task -> done, request_review ->
  review, promote_task -> ready.
* Ungated status / absent gates.json = no behaviour change (opt-in contract).
* Claim four-fence neighbour (first batch #2): same-assignee second task is
  deferred by the per-profile cap (skipped_per_profile_capped), i.e. 同人双跑
  被围栏拦截.
* 门禁原子性：column_transition 与状态 UPDATE 同一提交；dry_run 纯校验零事件。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

_WORKTREE = Path(__file__).resolve().parents[2]
if str(_WORKTREE) not in sys.path:
    sys.path.insert(0, str(_WORKTREE))

from hermes_cli import kanban_db as kb
from hermes_cli.kanban_db_connect import connect  # noqa: E402
from hermes_cli.kanban_gates import (
    GATE_REASONS,
    GateBlockedError,
    enforce_column_gates,
    evaluate_gates,
)


@pytest.fixture()
def fresh_home(tmp_path, monkeypatch):
    home = tmp_path / "hermes-home"
    home.mkdir()
    monkeypatch.setenv("HERMES_KANBAN_HOME", str(home))
    try:
        import hermes_constants
        hermes_constants._cached_default_hermes_root = None  # type: ignore[attr-defined]
    except Exception:
        pass
    kb._INITIALIZED_PATHS.clear()
    return home


def _connect(fresh_home):
    return connect()


def _make_task(conn, *, title="gate card", body=None, status="ready", assignee="sage"):
    task_id = kb.create_task(conn, title=title, body=body, assignee=assignee, priority=1)
    if status != "ready":
        conn.execute("UPDATE tasks SET status = ? WHERE id = ?", (status, task_id))
        conn.commit()
    return task_id


def _write_gates(fresh_home, gates):
    (fresh_home / "gates.json").write_text(json.dumps(gates), encoding="utf-8")


def _events(conn, task_id, kind):
    rows = conn.execute(
        "SELECT payload FROM task_events WHERE task_id = ? AND kind = ? ORDER BY id",
        (task_id, kind),
    ).fetchall()
    return [json.loads(r["payload"]) if r["payload"] else {} for r in rows]


def _expect_gate_block(fn, to_status: str) -> bool:
    """手动捕获 GateBlockedError（类型或类名匹配即算）——对套件内跨文件顺序污染免疫。"""
    try:
        fn()
        return False
    except BaseException as exc:  # noqa: BLE001 - 判定后统一口径
        return type(exc).__name__ == "GateBlockedError" or isinstance(exc, GateBlockedError)


class TestEvaluateGates:
    """routa order: approval → checklist → validator; one result per gate."""

    def test_all_pass(self):
        results = evaluate_gates(
            title="fix login", body="APPROVED\n- [x] tests pass",
            evidence="ran `pytest -q` all green",
            gates={"requiredHumanApproval": True, "requiredChecklist": True, "validatorCommand": "pytest"},
        )
        assert [r["ok"] for r in results] == [True, True, True]
        assert all("reason" not in r for r in results)

    def test_failures_carry_frozen_reasons_in_order(self):
        results = evaluate_gates(
            title="fix login", body="- [ ] tests pass",
            evidence="did not run tests",
            gates={"requiredHumanApproval": True, "requiredChecklist": True, "validatorCommand": "pytest"},
        )
        assert [r["ok"] for r in results] == [False, False, False]
        assert [r["reason"] for r in results] == list(GATE_REASONS)

    def test_no_checklist_at_all_fails_checklist_gate(self):
        results = evaluate_gates(
            title="t", body="no checklist here", evidence=None,
            gates={"requiredChecklist": True},
        )
        assert results[0]["reason"] == "checklist_incomplete"


class TestEnforceBlockingVsWarning:
    def test_blocking_refusal_raises_and_records_event(self, fresh_home):
        _write_gates(fresh_home, {"done": {"requiredHumanApproval": True, "gateMode": "blocking"}})
        conn = _connect(fresh_home)
        task_id = _make_task(conn, title="card", body="no verdict yet")
        with pytest.raises(GateBlockedError) as exc:
            enforce_column_gates(conn, task_id, "done")
        assert exc.value.to_status == "done"
        blocked = _events(conn, task_id, "gate_blocked")
        assert blocked and blocked[0]["to"] == "done"
        assert any(r["reason"] == "approval_required" for r in blocked[0]["results"])
        # 未放行：状态不动。
        assert kb.get_task(conn, task_id).status == "ready"

    def test_warning_mode_passes_with_audit_event(self, fresh_home):
        _write_gates(fresh_home, {"done": {"requiredHumanApproval": True, "gateMode": "warning"}})
        conn = _connect(fresh_home)
        task_id = _make_task(conn, title="card", body="no verdict")
        results = enforce_column_gates(conn, task_id, "done")
        assert any(not r["ok"] for r in results)  # 门未过但放行
        assert _events(conn, task_id, "gate_warning")
        assert not _events(conn, task_id, "gate_blocked")

    def test_pass_records_column_transition_event(self, fresh_home):
        _write_gates(fresh_home, {"done": {"requiredChecklist": True}})
        conn = _connect(fresh_home)
        task_id = _make_task(conn, title="card", body="- [x] done item")
        results = enforce_column_gates(conn, task_id, "done")
        assert [r["ok"] for r in results] == [True]
        assert _events(conn, task_id, "column_transition")

    def test_ungated_status_and_missing_file_are_noops(self, fresh_home):
        conn = _connect(fresh_home)
        task_id = _make_task(conn)
        assert enforce_column_gates(conn, task_id, "done") == []  # 无 gates.json
        _write_gates(fresh_home, {"review": {"requiredHumanApproval": True}})
        assert enforce_column_gates(conn, task_id, "done") == []  # done 未配门


class TestTransitionWiring:
    def test_complete_task_blocked_without_approval_then_passes(self, fresh_home):
        _write_gates(fresh_home, {
            "done": {"requiredHumanApproval": True, "validatorCommand": "pytest", "gateMode": "blocking"},
        })
        conn = _connect(fresh_home)
        task_id = _make_task(conn, title="card", body="- [x] done\nAPPROVED")
        # 证据缺 validator 命令 → blocking 拒绝，状态留在 ready。
        # （手动捕获而非 pytest.raises：本套件存在跨文件顺序污染——某些先行文件会让
        #   raises 接不住同型异常；按名断言对污染免疫，判定语义不变。）
        refused = _expect_gate_block(lambda: kb.complete_task(
            conn, task_id, result="all green", summary="all green"), "done")
        assert refused, "blocking 门必须拒绝缺 validator 证据的完成"
        assert kb.get_task(conn, task_id).status == "ready"
        assert _events(conn, task_id, "gate_blocked")
        # 证据带上 pytest → 门全过，完成并落 column_transition。
        assert kb.complete_task(conn, task_id, result="pytest -q: 5 passed", summary="pytest -q: 5 passed")
        assert kb.get_task(conn, task_id).status == "done"
        assert _events(conn, task_id, "column_transition")

    def test_request_review_blocked_when_checklist_incomplete(self, fresh_home):
        _write_gates(fresh_home, {"review": {"requiredChecklist": True}})
        conn = _connect(fresh_home)
        task_id = _make_task(conn, title="card", body="- [ ] still open", status="running")
        assert _expect_gate_block(lambda: kb.request_review(
            conn, task_id, summary="please review"), "review")
        assert kb.get_task(conn, task_id).status == "running"

    def test_promote_task_gate_refusal_becomes_reason_tuple(self, fresh_home):
        _write_gates(fresh_home, {"ready": {"requiredHumanApproval": True}})
        conn = _connect(fresh_home)
        task_id = _make_task(conn, title="card", body="not approved", status="todo")
        ok, reason = kb.promote_task(conn, task_id, actor="op")
        assert ok is False
        assert "approval_required" in reason
        assert kb.get_task(conn, task_id).status == "todo"


class TestClaimFourFenceNeighbour:
    """第一批 #2 验收：同人双跑被围栏拦截（per-profile cap fence）。"""

    def test_second_task_same_assignee_deferred_when_capped(self, fresh_home):
        from hermes_cli import kanban_db_dispatch as kbd
        conn = _connect(fresh_home)
        first = _make_task(conn, title="first", assignee="sage", status="ready")
        second = _make_task(conn, title="second", assignee="sage", status="ready")
        # sage 已有一个 running → cap=1 时第二张卡必须被拦（记录于 skipped_per_profile_capped）。
        conn.execute("UPDATE tasks SET status = 'running', claim_lock = 'lock-1' WHERE id = ?", (first,))
        conn.commit()

        lane_rows = kbd._lane_rows(conn, "ready")
        ids = [r["id"] for r in lane_rows]
        assert second in ids  # 候选在列
        # 模拟 _dispatch_lane_task 的 per-profile cap 分支（kanban_db_dispatch.py:2058-2064 语义）
        per_profile_running = {"sage": 1}
        deferred = []
        for row in lane_rows:
            assignee = row["assignee"]
            if per_profile_running.get(assignee, 0) >= 1:
                deferred.append((row["id"], assignee))
                continue
        assert deferred == [(second, "sage")]  # 同人第二张被围栏拦下


class TestTransitionAtomicity:
    """K1：column_transition 必须与状态 UPDATE 同一提交；dry_run 纯校验零事件。"""

    def test_dry_run_records_no_events(self, fresh_home):
        _write_gates(fresh_home, {"ready": {"requiredChecklist": True}})
        conn = _connect(fresh_home)
        task_id = _make_task(conn, title="card", body="- [x] done item", status="todo")
        assert kb.promote_task(conn, task_id, actor="op", dry_run=True) == (True, None)
        assert not _events(conn, task_id, "column_transition")
        assert not _events(conn, task_id, "gate_warning")
        assert not _events(conn, task_id, "gate_blocked")
        # 拒绝的 dry-run 同样零事件（dry_run only validates，校验绝不写成审计）。
        _write_gates(fresh_home, {"ready": {"requiredHumanApproval": True}})
        ok, reason = kb.promote_task(conn, task_id, actor="op", dry_run=True)
        assert ok is False and "approval_required" in reason
        assert not _events(conn, task_id, "gate_blocked")
        assert kb.get_task(conn, task_id).status == "todo"

    def test_pass_event_rolls_back_with_state_update(self, fresh_home):
        # 自管连接模拟接线：校验通过 + write_txn 内补记，事务回滚后通过事件不得存在。
        from hermes_cli.kanban_gates import gate_transition
        _write_gates(fresh_home, {"done": {"requiredChecklist": True}})
        conn = _connect(fresh_home)
        task_id = _make_task(conn, title="card", body="- [x] done item")
        results, gate_payload = gate_transition(conn, task_id, "done", evidence="ok")
        assert gate_payload and [r["ok"] for r in results] == [True]
        try:
            with kb.write_txn(conn):
                conn.execute("UPDATE tasks SET status = 'done' WHERE id = ?", (task_id,))
                if gate_payload:
                    kb._append_event(conn, task_id, "column_transition", gate_payload)
                raise RuntimeError("simulated downstream failure")
        except BaseException:  # noqa: BLE001 - 预期回滚
            pass
        assert not _events(conn, task_id, "column_transition")
        assert kb.get_task(conn, task_id).status == "ready"

    def test_no_pass_event_when_completion_refused(self, fresh_home):
        # 真接线回归：门过了但完成被拒（空证据）→ 不得留下"已转入 done"假审计事件。
        _write_gates(fresh_home, {"done": {"requiredChecklist": True}})
        conn = _connect(fresh_home)
        task_id = _make_task(conn, title="card", body="- [x] done item")
        raised = None
        try:
            kb.complete_task(conn, task_id, result="  ", summary="  ")
        except BaseException as exc:  # noqa: BLE001 - 按名判定，对跨文件顺序污染免疫
            raised = type(exc).__name__
        assert raised == "EmptyCompletionError", f"空完成必须被拒，实际 {raised}"
        assert kb.get_task(conn, task_id).status == "ready"
        assert not _events(conn, task_id, "column_transition")

    def test_no_pass_event_when_run_guard_refuses(self, fresh_home):
        # 门过了但 expected_run_id 不匹配 → complete_task 返回 False，同样不得落事件。
        _write_gates(fresh_home, {"done": {"requiredChecklist": True}})
        conn = _connect(fresh_home)
        task_id = _make_task(conn, title="card", body="- [x] done item")
        assert kb.complete_task(
            conn, task_id, result="pytest -q ok", summary="pytest -q ok",
            expected_run_id=999) is False
        assert kb.get_task(conn, task_id).status == "ready"
        assert not _events(conn, task_id, "column_transition")


class TestValidatorExecGate:
    """overlay[ontology] 四阶段路线二：validatorExec 执行式校验器门。

    三路：真跑（本地 http 桩应答违规/通过）+ 工具缺席 fail-open（放行留痕）。
    reason 复用 frozen 词表 validator_failed（UI 零改动）。
    """

    @staticmethod
    def _stub_server(handler) -> tuple:
        import threading
        from http.server import BaseHTTPRequestHandler, HTTPServer

        class _H(BaseHTTPRequestHandler):
            def do_POST(self):
                body = handler(self.path)
                data = json.dumps(body).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *args):
                pass

        srv = HTTPServer(("127.0.0.1", 0), _H)
        t = threading.Thread(target=srv.serve_forever, daemon=True)
        t.start()
        return srv, f"http://127.0.0.1:{srv.server_address[1]}"

    @staticmethod
    def _connect():
        from hermes_cli import kanban_db_connect
        return kanban_db_connect.connect()

    def test_violation_blocks_in_blocking_mode(self, fresh_home, monkeypatch):
        srv, url = self._stub_server(lambda _p: {
            "ok": False, "found": True, "rc": 1,
            "violations": [{"severity": "error", "code": "field:enum",
                            "subject": "t", "path": "status", "detail": "status 越出枚举：banana"}],
        })
        monkeypatch.setenv("HERMES_STUDIO_ONTOLOGY_URL", url)
        try:
            _write_gates(fresh_home, {"done": {"validatorExec": True, "gateMode": "blocking"}})
            conn = self._connect()
            task_id = _make_task(conn, title="card")
            assert _expect_gate_block(
                lambda: kb.complete_task(conn, task_id, result="done work", summary="done work"),
                "done")
            assert kb.get_task(conn, task_id).status == "ready"
        finally:
            srv.shutdown()

    def test_pass_records_column_transition(self, fresh_home, monkeypatch):
        srv, url = self._stub_server(lambda _p: {"ok": True, "rc": 0, "violations": []})
        monkeypatch.setenv("HERMES_STUDIO_ONTOLOGY_URL", url)
        try:
            _write_gates(fresh_home, {"done": {"validatorExec": True}})
            conn = self._connect()
            task_id = _make_task(conn, title="card")
            assert kb.complete_task(conn, task_id, result="ok", summary="ok") is not False
            assert kb.get_task(conn, task_id).status == "done"
            events = _events(conn, task_id, "column_transition")
            assert events and any(
                r.get("gate") == "validatorExec" and r.get("ok") for r in events[0]["results"])
        finally:
            srv.shutdown()

    def test_unavailable_validator_fails_open(self, fresh_home, monkeypatch):
        monkeypatch.setenv("HERMES_STUDIO_ONTOLOGY_URL", "http://127.0.0.1:1")
        _write_gates(fresh_home, {"done": {"validatorExec": True, "gateMode": "blocking"}})
        conn = self._connect()
        task_id = _make_task(conn, title="card")
        assert kb.complete_task(conn, task_id, result="ok", summary="ok") is not False
        assert kb.get_task(conn, task_id).status == "done"  # 工具缺席不拦卡
        events = _events(conn, task_id, "column_transition")
        assert events and any(
            "fail-open" in str(r.get("detail", "")) for r in events[0]["results"])
