"""完成契约（A 层）单元测试：派生、源哈希、回执校验、证据重算。"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from completion_contract import (
    ContractViolation,
    contract_source_sha256,
    derive_contract,
    parse_contract,
    validate_receipt,
)


def _contract(body: str) -> dict:
    return derive_contract(body)


def _workspace(tmp_path: Path) -> Path:
    (tmp_path / "dist").mkdir()
    (tmp_path / "reports").mkdir()
    (tmp_path / "dist" / "app.js").write_text("console.log('ok')\n", encoding="utf8")
    (tmp_path / "reports" / "tap.txt").write_text(
        "1..3\nok 1 - A\nok 2 - B\nok 3 - C\n", encoding="utf8"
    )
    return tmp_path


def _receipt(**overrides):
    base = {
        "version": 1,
        "criteria": [
            {
                "id": "AC-1",
                "status": "pass",
                "evidence": [{"kind": "artifact", "path": "dist/app.js"}],
            }
        ],
        "artifacts": ["dist/app.js"],
        "verifications": [
            {"command": "npx vitest run", "exitCode": 0, "report": "reports/tap.txt", "format": "tap"}
        ],
    }
    base.update(overrides)
    return base


def test_no_acceptance_criteria_keeps_mode_off():
    contract = _contract("普通任务，没有验收标准")
    assert contract["mode"] == "off"
    assert contract["criteria"] == []


def test_ac_lines_derive_enforce_contract():
    contract = _contract("## 验收标准\n- AC-1: 完成门拒绝空回执\n- AC_2 证据可重算\n")
    assert contract["mode"] == "enforce"
    assert [item["id"] for item in contract["criteria"]] == ["AC-1", "AC-2"]
    assert contract["criteria"][1]["statement"] == "证据可重算"


def test_dod_block_can_strengthen_and_cannot_drop_declared_ac():
    body = """AC-1: 测试通过
```dod
{"mode":"enforce","minTests":2,"criteria":[{"id":"AC-1","require":["test","artifact"]}],"artifactGlobs":["dist/*"]}
```
"""
    contract = _contract(body)
    assert contract["minTests"] == 2
    assert contract["artifactGlobs"] == ["dist/*"]
    assert [item["id"] for item in contract["criteria"]] == ["AC-1"]
    assert contract["criteria"][0]["require"] == ["test", "artifact"]


def test_invalid_dod_json_blocks_instead_of_silently_disabling():
    contract = _contract('AC-1: x\n```dod\n{"mode":\n```\n')
    assert contract["mode"] == "enforce"
    assert contract["criteria"] == []
    assert "dod JSON 解析失败" in contract["invalid"]
    with pytest.raises(ContractViolation, match="声明无效"):
        validate_receipt(contract, _receipt(), ".")


def test_source_hash_ignores_text_outside_contract_source():
    a = "AC-1: 通过\n一些正文"
    b = "AC-1: 通过\n正文被改写，但契约没变"
    assert contract_source_sha256(a) == contract_source_sha256(b)
    assert contract_source_sha256(a) != contract_source_sha256("AC-1: 通过\nAC-2: 新增")


def test_valid_receipt_passes_and_recomputes_counts(tmp_path):
    ws = _workspace(tmp_path)
    contract = _contract("AC-1: 产物存在\n")
    result = validate_receipt(contract, _receipt(), ws)
    assert result["ok"] is True
    assert result["totals"] == {"tests": 3, "failures": 0}
    assert result["artifacts"][0]["path"] == "dist/app.js"
    assert len(result["artifacts"][0]["sha256"]) == 64
    assert result["verifications"][0]["tests"] == 3


def test_missing_criterion_is_rejected(tmp_path):
    ws = _workspace(tmp_path)
    contract = _contract("AC-1: x\nAC-2: y\n")
    with pytest.raises(ContractViolation, match="缺少契约要求的 criterion"):
        validate_receipt(contract, _receipt(), ws)


def test_self_reported_failure_is_rejected(tmp_path):
    ws = _workspace(tmp_path)
    contract = _contract("AC-1: x\n")
    receipt = _receipt(criteria=[{"id": "AC-1", "status": "fail", "note": "没过"}])
    with pytest.raises(ContractViolation, match="自报 fail"):
        validate_receipt(contract, receipt, ws)


def test_sha_mismatch_is_rejected(tmp_path):
    ws = _workspace(tmp_path)
    contract = _contract("AC-1: x\n")
    receipt = _receipt(
        criteria=[{
            "id": "AC-1",
            "status": "pass",
            "evidence": [{"path": "dist/app.js", "sha256": "0" * 64}],
        }]
    )
    with pytest.raises(ContractViolation, match="sha256 不匹配"):
        validate_receipt(contract, receipt, ws)


def test_path_escape_is_rejected(tmp_path):
    ws = _workspace(tmp_path)
    (tmp_path.parent / "outside.txt").write_text("secret", encoding="utf8")
    contract = _contract("AC-1: x\n")
    receipt = _receipt(criteria=[{
        "id": "AC-1",
        "status": "pass",
        "evidence": [{"path": "../outside.txt"}],
    }])
    with pytest.raises(ContractViolation, match="越出 workspace"):
        validate_receipt(contract, receipt, ws)


def test_junit_failures_are_recomputed(tmp_path):
    ws = _workspace(tmp_path)
    (ws / "reports" / "junit.xml").write_text(
        '<testsuites><testsuite tests="4" failures="1" errors="0"/></testsuites>', encoding="utf8"
    )
    contract = _contract("AC-1: x\n")
    receipt = _receipt(
        verifications=[{"command": "pytest", "exitCode": 0, "report": "reports/junit.xml", "format": "junit"}]
    )
    with pytest.raises(ContractViolation, match="1 个失败"):
        validate_receipt(contract, receipt, ws)


def test_min_tests_requires_enough_recomputed_cases(tmp_path):
    ws = _workspace(tmp_path)
    contract = _contract('AC-1: x\n```dod\n{"minTests": 10}\n```\n')
    with pytest.raises(ContractViolation, match="至少 10 个测试"):
        validate_receipt(contract, _receipt(), ws)


def test_text_report_cannot_satisfy_test_requirement(tmp_path):
    ws = _workspace(tmp_path)
    (ws / "reports" / "log.txt").write_text("all good\n", encoding="utf8")
    contract = _contract('AC-1: x\n```dod\n{"criteria":[{"id":"AC-1","require":["test"]}]}\n```\n')
    receipt = _receipt(
        verifications=[{"command": "npm test", "exitCode": 0, "report": "reports/log.txt", "format": "text"}]
    )
    with pytest.raises(ContractViolation, match="没有 TAP/JUnit"):
        validate_receipt(contract, receipt, ws)


def test_na_requires_note(tmp_path):
    ws = _workspace(tmp_path)
    contract = _contract("AC-1: x\n")
    receipt = _receipt(criteria=[{"id": "AC-1", "status": "na"}])
    with pytest.raises(ContractViolation, match="必须写 note"):
        validate_receipt(contract, receipt, ws)


def test_artifact_glob_is_enforced(tmp_path):
    ws = _workspace(tmp_path)
    contract = _contract('AC-1: x\n```dod\n{"artifactGlobs": ["build/**"]}\n```\n')
    with pytest.raises(ContractViolation, match="至少一个产物匹配"):
        validate_receipt(contract, _receipt(), ws)


def test_parse_contract_rejects_wrong_version():
    with pytest.raises(ContractViolation, match="version"):
        parse_contract(json.dumps({"version": 2, "mode": "enforce"}))
