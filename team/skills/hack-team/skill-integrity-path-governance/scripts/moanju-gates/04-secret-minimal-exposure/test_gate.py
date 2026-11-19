#!/usr/bin/env python3
"""04 secret 最小暴露 redactor — 正反 fixture 用例（pytest 兼容 + 独立可跑）。

正面（无凭据，exit 0 / 无 findings）：普通日志、普通配置。
反面（含凭据样例，必须全部脱敏；fixtures 全为占位符格式，非真实凭据）：
- password 赋值
- Bearer header
- AWS AKIA key
- GitHub token
- PEM 私钥块
- URL 连接串内嵌凭据
- 高熵随机串兜底
另验：redacted 输出不得残留原始凭据值；报告 preview 不得等于完整原值。

独立运行：python3 test_gate.py （exit 0=通过, 1=失败）
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location(
    "gate_d4_secret_redactor", _HERE / "gate.py")
gate = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gate)

# 以下均为 fixture 占位样例（伪造格式），非真实凭据。
SECRET_ASSIGN = "password = 'hunter2secret'"
BEARER = "Authorization: Bearer abcd1234efgh5678ijkl"
AWS_KEY = "AKIAIOSFODNN7EXAMPLE"
GH = "ghp_0123456789abcdefghijklmnopqrstuvwxyzABCD"
PEM = "-----BEGIN RSA PRIVATE KEY-----\nMIIB\n-----END RSA PRIVATE KEY-----"
CONN = "postgres://admin:s3cretpass@db.internal:5432/prod"
HE_ENTROPY = "Zk9mQ2x1c3RlcjIwMjYwOTE3c2VjcmV0a2V5MTIzNDU2Nzg5MA"


def _assert_no_leak(original_secret: str, redacted: str) -> None:
    assert original_secret not in redacted, (
        f"secret leaked in redacted output: {original_secret[:6]}...")


# ---------- 正面 ----------

def test_clean_log_no_findings():
    red, findings = gate.scan("2026-09-17 INFO worker-a finished batch 42 in 3.2s")
    assert findings == [], findings
    assert red.find("batch 42") != -1


def test_clean_config_no_findings():
    red, findings = gate.scan("host = db.internal\nport = 5432\npool = 10")
    assert findings == [], findings
    assert "5432" in red


# ---------- 反面：必须检出并脱敏 ----------

def test_password_assignment_redacted():
    red, findings = gate.scan(f"login with {SECRET_ASSIGN}")
    assert any(f["rule"] == "SEC-01-assignment" for f in findings), findings
    _assert_no_leak("hunter2secret", red)


def test_bearer_redacted():
    red, findings = gate.scan(BEARER)
    assert any(f["rule"] == "SEC-02-bearer" for f in findings), findings
    _assert_no_leak("abcd1234efgh5678ijkl", red)


def test_aws_key_redacted():
    red, findings = gate.scan(f"key {AWS_KEY} in log")
    assert any(f["rule"] == "SEC-03-aws-access-key" for f in findings), findings
    _assert_no_leak(AWS_KEY, red)


def test_github_token_redacted():
    red, findings = gate.scan(f"token {GH}")
    assert any(f["rule"] == "SEC-05-github-token" for f in findings), findings
    _assert_no_leak(GH, red)


def test_pem_block_redacted():
    red, findings = gate.scan(PEM)
    assert any(f["rule"] == "SEC-06-private-key-block" for f in findings), findings
    assert "BEGIN RSA PRIVATE KEY" not in red


def test_connection_string_redacted():
    red, findings = gate.scan(CONN)
    assert any(f["rule"] == "SEC-07-connection-string" for f in findings), findings
    _assert_no_leak("s3cretpass", red)


def test_high_entropy_fallback_redacted():
    red, findings = gate.scan(f"blob {HE_ENTROPY} end")
    assert any(f["rule"] == "SEC-08-high-entropy-heuristic" for f in findings), findings
    _assert_no_leak(HE_ENTROPY, red)


def test_preview_is_masked_not_full_value():
    _, findings = gate.scan(SECRET_ASSIGN)
    prev = findings[0]["preview"]
    assert "hunter2secret" not in prev, prev
    assert "[REDACTED]" in prev, prev


def test_findings_never_contain_full_secret():
    _, findings = gate.scan(f"{SECRET_ASSIGN} {AWS_KEY} {GH}")
    blob = str(findings)
    for s in ("hunter2secret", AWS_KEY, GH):
        assert s not in blob, f"finding report leaks {s[:6]}"


# ---------- CLI ----------

def test_cli_clean_exit_0():
    assert gate.main(["--text", "plain log line"]) == 0


def test_cli_secret_exit_1():
    assert gate.main(["--text", SECRET_ASSIGN]) == 1


def test_cli_bad_patterns_exit_2():
    assert gate.main(["--text", "x", "--patterns-json",
                      str(_HERE / "no-such.json")]) == 2


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
