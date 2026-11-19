#!/usr/bin/env python3
"""01 工具调用意图闸门 — 正反 fixture 用例（pytest 兼容 + 独立可跑）。

正面（应放行）：
- 低风险只读动作（headless）-> ALLOW，exit 0
- 低风险 + 可疑参数 -> WARN（仍放行），exit 0
反面（应拒绝）：
- 未知工具 -> BLOCK（fail-closed）
- 高风险动作 headless -> BLOCK（核心默认拒绝）
- 高风险动作 headless 且 purpose 缺失 -> BLOCK
- schema 缺字段 -> BLOCK
- 高风险动作 interactive -> REVIEW（无批准通道 = 拒绝放行，exit 1）

独立运行：python3 test_gate.py  （exit 0=全部通过, 1=有用例失败）
pytest 兼容：函数名 test_* + 纯 assert，可被 pytest 直接收集。
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location(
    "gate_d1_tool_firewall", _HERE / "gate.py")
gate = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gate)


def _run(action_json: str) -> tuple[dict, int]:
    """跑 CLI 子进程路径之外的进程内入口，返回 (结果, 退出码)。"""
    result = gate.evaluate(json.loads(action_json))
    return result, gate.DECISION_EXIT[result["decision"]]


# ---------- 正面 fixture ----------

def test_positive_readonly_headless_allows():
    result, code = _run(json.dumps({
        "tool": "file_read", "caller": "worker-a",
        "purpose": "read research notes", "mode": "headless",
        "params": {"path": "research/moanju-fusion/research-slices/p0-claims.md"},
    }))
    assert result["decision"] == "ALLOW", result
    assert code == 0, code


def test_positive_lowrisk_with_suspicious_param_warns_but_allows():
    result, code = _run(json.dumps({
        "tool": "text_search", "caller": "worker-a",
        "purpose": "locate docs", "mode": "headless",
        "params": {"query": "../etc/passwd"},
    }))
    assert result["decision"] == "WARN", result
    assert any(h.startswith("possible_path_traversal") for h in result["hints"]), result
    assert code == 0, code


def test_positive_highrisk_interactive_returns_review():
    """交互场景高风险 -> REVIEW（决策非 BLOCK，但无批准通道 = exit 1）。"""
    result, code = _run(json.dumps({
        "tool": "file_write", "caller": "human-operator",
        "purpose": "patch config", "mode": "interactive",
        "params": {"path": "config.yaml"},
    }))
    assert result["decision"] == "REVIEW", result
    assert code == 1, code


# ---------- 反面 fixture（fail-closed 必须实测被拒） ----------

def test_negative_unknown_tool_blocked():
    result, code = _run(json.dumps({
        "tool": "format_disk", "caller": "worker-a",
        "purpose": "cleanup", "mode": "headless", "params": {},
    }))
    assert result["decision"] == "BLOCK", result
    assert "unknown_tool" in result["reason"], result
    assert code == 1, code


def test_negative_highrisk_headless_blocked():
    result, code = _run(json.dumps({
        "tool": "file_delete", "caller": "worker-a",
        "purpose": "cleanup tmp", "mode": "headless",
        "params": {"path": "/workspace/tmp/old.log"},
    }))
    assert result["decision"] == "BLOCK", result
    assert "high_risk_headless" in result["reason"], result
    assert code == 1, code


def test_negative_highrisk_headless_purpose_missing_blocked():
    result, code = _run(json.dumps({
        "tool": "external_send", "caller": "worker-a",
        "purpose": "", "mode": "headless",
        "params": {"url": "https://example.invalid"},
    }))
    assert result["decision"] == "BLOCK", result
    assert "purpose_missing" in result["reason"], result
    assert code == 1, code


def test_negative_schema_missing_fields_blocked():
    result, code = _run(json.dumps({"tool": "file_read", "caller": "x"}))
    assert result["decision"] == "BLOCK", result
    assert "schema_invalid" in result["reason"], result
    assert code == 1, code


def test_negative_credential_read_headless_blocked():
    result, code = _run(json.dumps({
        "tool": "credential_read", "caller": "worker-b",
        "purpose": "backup secrets", "mode": "headless", "params": {},
    }))
    assert result["decision"] == "BLOCK", result
    assert code == 1, code


def test_cli_input_error_exit_2():
    """无法解析的 JSON -> exit 2（配置/输入错误，fail-closed）。"""
    rc = gate.main(["--action", "{not-json"])
    assert rc == 2, rc


def _run_all() -> int:
    fns = [(n, f) for n, f in sorted(globals().items())
           if n.startswith("test_") and callable(f)]
    failed: list[str] = []
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
