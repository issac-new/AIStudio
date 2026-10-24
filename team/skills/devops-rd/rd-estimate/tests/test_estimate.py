import json
import sys
import os


def _run_estimator(input_data):
    """辅助：把 JSON 写入临时文件并调用 estimate.py，返回 (rc, stdout, stderr)。"""
    import tempfile
    import subprocess

    with tempfile.NamedTemporaryFile(suffix=".json", mode="w", delete=False) as f:
        json.dump(input_data, f)
        tmp_path = f.name
    try:
        result = subprocess.run(
            [sys.executable, os.path.expanduser("~/.hermes/skills/devops-rd/rd-estimate/estimate.py"), tmp_path],
            capture_output=True, text=True, timeout=30,
        )
        return result.returncode, result.stdout, result.stderr
    finally:
        os.unlink(tmp_path)


def test_success_estimate():
    """成功样例：含 ILF/EIF/EI/EO/EQ，reuse=high, change=add。"""
    data = {
        "schema_version": "rd-estimate/v1",
        "task_id": "t_test_success",
        "decomposition": {
            "app": "test-app",
            "goal": "测试成功路径",
            "acceptance": [{"id": "a1", "text": "验收项1"}],
        },
        "scope": {
            "system_boundary": "测试系统边界",
            "users": [{"type": "human", "name": "测试用户"}],
        },
        "functions": {
            "data": [{"id": "d1", "kind": "ILF", "complexity": "med", "note": "测试ILF"}],
            "transactional": [{"id": "t1", "kind": "EI", "complexity": "low", "note": "测试EI"}],
        },
        "adjustment": {"reuse": "high", "change_type": "add", "quality_factors": {}, "workload_share": 1.0},
        "workload": {"productivity_hours_per_size": 1.0, "hours_per_month": 160, "evidence_class": "observed", "productivity_source": "test"},
        "budget": {"goal_max_turns_estimate": None, "history_anchor": "test"},
    }
    rc, stdout, stderr = _run_estimator(data)
    assert rc == 0, f"期望 rc=0, 实际 rc={rc}, stderr={stderr}"
    result = json.loads(stdout)
    assert result["status"] == "estimated"
    assert result["task_id"] == "t_test_success"
    # ufp = ILF(med)=10 + EI(low)=3 = 13
    assert result["size"]["ufp"] == 13.0, f"ufp={result['size']['ufp']}"
    # us = ILF(med)*1/3*1 + EI(low)*1/3*1 = 10/3 + 3/3 ≈ 4.333
    assert abs(result["size"]["us"] - 4.333) < 0.01, f"us={result['size']['us']}"
    assert len(result["per_function_us"]) == 2
    assert result["evidence"]["no_network"] is True
    assert result["evidence"]["no_secret_access"] is True


def test_missing_top_level():
    """缺顶层段 → rc=2 INVALID_INPUT"""
    data = {"decomposition": {"goal": "x", "acceptance": ["a"]}, "scope": {"system_boundary": "b", "users": [{"type": "human"}]}}
    rc, stdout, stderr = _run_estimator(data)
    assert rc == 2, f"期望 rc=2, 实际 rc={rc}, stderr={stderr}"
    err = json.loads(stderr)
    assert err["error"] == "INVALID_INPUT"


def test_external_example_forbidden():
    """external_example 作为预算依据 → rc=4 FORBIDDEN_RUNTIME_BASIS"""
    data = {
        "schema_version": "rd-estimate/v1", "task_id": "t_ext",
        "decomposition": {"goal": "x", "acceptance": ["a"]},
        "scope": {"system_boundary": "b", "users": [{"type": "human"}]},
        "functions": {"data": [{"id": "d1", "kind": "ILF", "complexity": "low"}]},
        "adjustment": {"reuse": "low", "change_type": "add", "quality_factors": {}, "workload_share": 1.0},
        "workload": {"productivity_hours_per_size": 1.0, "hours_per_month": 160, "evidence_class": "external_example"},
        "budget": {},
    }
    rc, stdout, stderr = _run_estimator(data)
    assert rc == 4, f"期望 rc=4, 实际 rc={rc}, stderr={stderr}"
    err = json.loads(stderr)
    assert err["error"] == "FORBIDDEN_RUNTIME_BASIS"


def test_out_of_range_quality_factor():
    """quality_factors 越界 → rc=2 INVALID_INPUT"""
    data = {
        "schema_version": "rd-estimate/v1", "task_id": "t_qf",
        "decomposition": {"goal": "x", "acceptance": ["a"]},
        "scope": {"system_boundary": "b", "users": [{"type": "human"}]},
        "functions": {"data": [{"id": "d1", "kind": "ILF", "complexity": "low"}]},
        "adjustment": {"reuse": "low", "change_type": "add", "quality_factors": {"qf1": 5}, "workload_share": 1.0},
        "workload": {"productivity_hours_per_size": 1.0, "hours_per_month": 160, "evidence_class": "observed"},
        "budget": {},
    }
    rc, stdout, stderr = _run_estimator(data)
    assert rc == 2, f"期望 rc=2, 实际 rc={rc}, stderr={stderr}"
    err = json.loads(stderr)
    assert err["error"] == "INVALID_INPUT" and "quality_factors" in err.get("field", "")


def test_insufficient_evidence():
    """data/transactional 均为空 → rc=3 INSUFFICIENT_EVIDENCE"""
    data = {
        "schema_version": "rd-estimate/v1", "task_id": "t_ins",
        "decomposition": {"goal": "x", "acceptance": ["a"]},
        "scope": {"system_boundary": "b", "users": [{"type": "human"}]},
        "functions": {"data": [], "transactional": []},
        "adjustment": {"reuse": "low", "change_type": "add", "quality_factors": {}, "workload_share": 1.0},
        "workload": {"productivity_hours_per_size": 1.0, "hours_per_month": 160, "evidence_class": "observed"},
        "budget": {},
    }
    rc, stdout, stderr = _run_estimator(data)
    assert rc == 3, f"期望 rc=3, 实际 rc={rc}, stderr={stderr}"
    err = json.loads(stderr)
    assert err["error"] == "INSUFFICIENT_EVIDENCE"


if __name__ == "__main__":
    test_success_estimate()
    print("PASS test_success_estimate")
    test_missing_top_level()
    print("PASS test_missing_top_level")
    test_external_example_forbidden()
    print("PASS test_external_example_forbidden")
    test_out_of_range_quality_factor()
    print("PASS test_out_of_range_quality_factor")
    test_insufficient_evidence()
    print("PASS test_insufficient_evidence")
    print("\nAll tests passed!")