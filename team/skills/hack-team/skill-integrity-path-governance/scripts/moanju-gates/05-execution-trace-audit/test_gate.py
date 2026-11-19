#!/usr/bin/env python3
"""05 执行轨迹审计 — 正反 fixture 用例（pytest 兼容 + 独立可跑）。

正面：合法事件落盘、参数哈希可复现、verify 完整性通过、日志内 secret 被脱敏。
反面：
- 缺字段 -> recorded=false, exit 1
- 非法 decision -> recorded=false, exit 1
- params 非法 JSON -> exit 2
- 历史日志被篡改（坏 JSON 行）-> exit 2（fail-closed 停止追加）
另验：日志文件中不存在明文 secret。

独立运行：python3 test_gate.py （exit 0=通过, 1=失败）
"""
from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location(
    "gate_d5_trace_audit", _HERE / "gate.py")
gate = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gate)

# fixture 占位凭据（伪造），验证日志脱敏链路。
FAKE_SECRET = "sup3rs3cretvalue99"
FAKE_PARAMS = {"password": FAKE_SECRET, "path": "docs/x.md"}


def _tmplog() -> Path:
    return Path(tempfile.mkdtemp(prefix="audit_fixture_")) / "trace.jsonl"


def _read_lines(p: Path) -> list[dict]:
    return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines()
            if x.strip()]


# ---------- 正面 ----------

def test_valid_event_recorded():
    p = _tmplog()
    r = gate.append_event({"caller": "worker-a", "tool": "file_read",
                           "params": {"path": "README.md"},
                           "decision": "allow", "output": "42 bytes"}, p)
    assert r["recorded"] is True, r
    rec = r["record"]
    assert rec["caller"] == "worker-a" and rec["decision"] == "allow", rec
    assert len(rec["params_hash"]) == 64, rec
    assert rec["ts"].endswith("Z"), rec


def test_params_hash_reproducible():
    p = _tmplog()
    ev = {"caller": "w", "tool": "t", "params": {"a": 1}, "decision": "allow"}
    gate.append_event(ev, p)
    gate.append_event(dict(ev), p)
    lines = _read_lines(p)
    assert lines[0]["params_hash"] == lines[1]["params_hash"], lines
    import hashlib
    expect = hashlib.sha256(json.dumps({"a": 1}, sort_keys=True).encode()).hexdigest()
    assert lines[0]["params_hash"] == expect, lines[0]


def test_secret_not_in_log_file():
    p = _tmplog()
    r = gate.append_event({"caller": "w", "tool": "cred_read",
                           "params": FAKE_PARAMS, "decision": "deny",
                           "output": f"got {FAKE_SECRET}"}, p)
    assert r["recorded"] is True, r
    raw = p.read_text(encoding="utf-8")
    assert FAKE_SECRET not in raw, "log file leaks secret"


def test_output_summary_truncated():
    p = _tmplog()
    gate.append_event({"caller": "w", "tool": "t", "params": {},
                       "decision": "allow", "output": "x" * 500}, p)
    rec = _read_lines(p)[0]
    assert len(rec["output_summary"]) <= gate.SUMMARY_MAX + 3, rec


def test_verify_log_integrity():
    p = _tmplog()
    gate.append_event({"caller": "w", "tool": "a", "params": {},
                       "decision": "allow"}, p)
    gate.append_event({"caller": "w", "tool": "b", "params": {},
                       "decision": "deny", "gate_reason": "high_risk_headless"}, p)
    stats = gate.verify_log(p)
    assert stats["events"] == 2 and stats["intact"], stats


# ---------- 反面 ----------

def test_missing_field_rejected():
    r = gate.append_event({"caller": "w", "tool": "t"}, _tmplog())
    assert r["recorded"] is False and "missing_field" in r["error"], r


def test_bad_decision_rejected():
    r = gate.append_event({"caller": "w", "tool": "t", "params": {},
                           "decision": "maybe"}, _tmplog())
    assert r["recorded"] is False and "bad_decision" in r["error"], r


def test_tampered_history_refuses_append():
    p = _tmplog()
    gate.append_event({"caller": "w", "tool": "t", "params": {},
                       "decision": "allow"}, p)
    with p.open("a", encoding="utf-8") as f:
        f.write("garbage-not-json\n")
    try:
        gate.append_event({"caller": "w", "tool": "t2", "params": {},
                           "decision": "allow"}, p)
        assert False, "tampered log must refuse append"
    except ValueError as exc:
        assert "tamper_suspected" in str(exc), exc


def test_cli_bad_params_exit_2():
    rc = gate.main(["record", "--caller", "w", "--tool", "t",
                    "--params", "{bad", "--decision", "allow",
                    "--log", str(_tmplog())])
    assert rc == 2, rc


def test_cli_record_exit_0():
    rc = gate.main(["record", "--caller", "w", "--tool", "t",
                    "--params", "{\"path\": \"x\"}", "--decision", "allow",
                    "--log", str(_tmplog())])
    assert rc == 0, rc


def _run_all() -> int:
    fns = [(n, f) for n, f in sorted(globals().items())
           if n.startswith("test_") and callable(f)]
    failed = []
    for name, fn in fns:
        try:
            fn()
            print(f"PASS {name}")
        except AssertionError as exc:
            failed.append(name)
            print(f"FAIL {name}: {exc}")
        except Exception as exc:  # noqa: BLE001
            failed.append(name)
            print(f"ERROR {name}: {exc!r}")
    print(f"{len(fns) - len(failed)}/{len(fns)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(_run_all())
