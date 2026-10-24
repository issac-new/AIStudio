#!/usr/bin/env python3
"""
直接运行 test_estimator.py 作为自检脚本，无需 pytest 框架。
"""
import sys
import os
import json
import tempfile
import subprocess

ESTIMATE_DIR = os.path.expanduser("~/.hermes/skills/devops-rd/rd-estimate")
ESTIMATE_PATH = os.path.join(ESTIMATE_DIR, "estimate.py")

results = {"passed": 0, "failed": 0}


def run_estimator(input_data):
    """返回 (rc, stdout, stderr)"""
    with tempfile.NamedTemporaryFile(suffix=".json", mode="w", delete=False) as f:
        json.dump(input_data, f)
        tmp_path = f.name
    try:
        result = subprocess.run(
            [sys.executable, ESTIMATE_PATH, tmp_path],
            capture_output=True, text=True, timeout=30,
        )
        return result.returncode, result.stdout, result.stderr
    finally:
        os.unlink(tmp_path)


def test(name, func):
    try:
        func()
        print(f"PASS {name}")
        results["passed"] += 1
    except AssertionError as e:
        print(f"FAIL {name}: {e}")
        results["failed"] += 1
    except Exception as e:
        print(f"ERROR {name}: {e}")
        results["failed"] += 1


def test_success_estimate():
    data = {
        "schema_version": "rd-estimate/v1",
        "task_id": "t_test_success",
        "decomposition": {
            "app": "test-app",
            "goal": "测试成功路径",
            "acceptance": [{"id": "a1", "text": "验收项1"}],
        },
        "scope": {"system_boundary": "测试系统边界", "users": [{"type": "human", "name": "测试用户"}]},
        "functions": {
            "data": [{"id": "d1", "kind": "ILF", "complexity": "med", "note": "测试ILF"}],
            "transactional": [{"id": "t1", "kind": "EI", "complexity": "low", "note": "测试EI"}],
        },
        "adjustment": {"reuse": "high", "change_type": "add", "quality_factors": {}, "workload_share": 1.0},
        "workload": {"productivity_hours_per_size": 1.0, "hours_per_month": 160, "evidence_class": "observed", "productivity_source": "test"},
        "budget": {"goal_max_turns_estimate": None, "history_anchor": "test"},
    }
    rc, stdout, stderr = run_estimator(data)
    assert rc == 0, f"期望 rc=0, 实际 rc={rc}, stderr={stderr}"
    result = json.loads(stdout)
    assert result["status"] == "estimated"
    assert result["task_id"] == "t_test_success"
    assert result["size"]["ufp"] == 13.0
    assert abs(result["size"]["us"] - 4.333) < 0.01
    assert len(result["per_function_us"]) == 2
    assert result["evidence"]["no_network"] is True
    assert result["evidence"]["no_secret_access"] is True


def test_missing_top_level():
    data = {"decomposition": {"goal": "x", "acceptance": ["a"]}}
    rc, stdout, stderr = run_estimator(data)
    assert rc == 2, f"期望 rc=2, 实际 rc={rc}, stderr={stderr}"
    err = json.loads(stderr)
    assert err["error"] == "INVALID_INPUT"


def test_external_example_forbidden():
    data = {
        "schema_version": "rd-estimate/v1", "task_id": "t_ext",
        "decomposition": {"goal": "x", "acceptance": ["a"]},
        "scope": {"system_boundary": "b", "users": [{"type": "human"}]},
        "functions": {"data": [{"id": "d1", "kind": "ILF", "complexity": "low"}]},
        "adjustment": {"reuse": "low", "change_type": "add", "quality_factors": {}, "workload_share": 1.0},
        "workload": {"productivity_hours_per_size": 1.0, "hours_per_month": 160, "evidence_class": "external_example"},
        "budget": {},
    }
    rc, stdout, stderr = run_estimator(data)
    assert rc == 4, f"期望 rc=4, 实际 rc={rc}, stderr={stderr}"
    err = json.loads(stderr)
    assert err["error"] == "FORBIDDEN_RUNTIME_BASIS"


def test_out_of_range_quality_factor():
    data = {
        "schema_version": "rd-estimate/v1", "task_id": "t_qf",
        "decomposition": {"goal": "x", "acceptance": ["a"]},
        "scope": {"system_boundary": "b", "users": [{"type": "human"}]},
        "functions": {"data": [{"id": "d1", "kind": "ILF", "complexity": "low"}]},
        "adjustment": {"reuse": "low", "change_type": "add", "quality_factors": {"qf1": 5}, "workload_share": 1.0},
        "workload": {"productivity_hours_per_size": 1.0, "hours_per_month": 160, "evidence_class": "observed"},
        "budget": {},
    }
    rc, stdout, stderr = run_estimator(data)
    assert rc == 2, f"期望 rc=2, 实际 rc={rc}, stderr={stderr}"
    err = json.loads(stderr)
    assert err["error"] == "INVALID_INPUT"


def test_insufficient_evidence():
    data = {
        "schema_version": "rd-estimate/v1", "task_id": "t_ins",
        "decomposition": {"goal": "x", "acceptance": ["a"]},
        "scope": {"system_boundary": "b", "users": [{"type": "human"}]},
        "functions": {"data": [], "transactional": []},
        "adjustment": {"reuse": "low", "change_type": "add", "quality_factors": {}, "workload_share": 1.0},
        "workload": {"productivity_hours_per_size": 1.0, "hours_per_month": 160, "evidence_class": "observed"},
        "budget": {},
    }
    rc, stdout, stderr = run_estimator(data)
    assert rc == 3, f"期望 rc=3, 实际 rc={rc}, stderr={stderr}"
    err = json.loads(stderr)
    assert err["error"] == "INSUFFICIENT_EVIDENCE"


def main():
    print("=== rd-estimate 单元测试 ===\n")
    
    test("test_success_estimate", test_success_estimate)
    test("test_missing_top_level", test_missing_top_level)
    test("test_external_example_forbidden", test_external_example_forbidden)
    test("test_out_of_range_quality_factor", test_out_of_range_quality_factor)
    test("test_insufficient_evidence", test_insufficient_evidence)

    print(f"\n=== 汇总 ===")
    print(f"总计: {results['passed'] + results['failed']}, 通过: {results['passed']}, 失败: {results['failed']}")
    return 0 if results["failed"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())