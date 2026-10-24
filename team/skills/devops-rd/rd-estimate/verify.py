#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
rd-estimate skill 本地验证脚本
运行后若全部 PASS，则表示 skill 完成交付。
"""
import subprocess
import sys
import os

ESTIMATE_PATH = os.path.expanduser("~/.hermes/skills/devops-rd/rd-estimate")


def run_test(script_name):
    """运行测试脚本，返回 (passed, output)"""
    script = os.path.join(ESTIMATE_PATH, "tests", script_name)
    result = subprocess.run([sys.executable, script], capture_output=True, text=True, timeout=60)
    passed = result.returncode == 0
    return passed, result.stdout + result.stderr


def main():
    results = []
    
    # 1. 语法检查
    print("=== 检查 1：语法检查 ===")
    result = subprocess.run([sys.executable, "-m", "py_compile", 
                              os.path.join(ESTIMATE_PATH, "estimate.py")],
                             capture_output=True, text=True)
    syntax_ok = result.returncode == 0
    print(f"estimate.py: {'PASS' if syntax_ok else 'FAIL'}")
    results.append(syntax_ok)
    
    # 2. 运行单元测试（使用 test_runner.py，不依赖 pytest）
    print("\n=== 检查 2：单元测试 ===")
    passed, output = run_test("test_runner.py")
    print(f"test_runner.py: {'PASS' if passed else 'FAIL'}")
    if not passed:
        print(output)
    results.append(passed)
    
    # 3. 验证 SKILL.md 存在且完整
    print("\n=== 检查 3：SKILL.md 完整性 ===")
    skill_path = os.path.join(ESTIMATE_PATH, "SKILL.md")
    skill_ok = os.path.exists(skill_path) and os.path.getsize(skill_path) > 1000
    print(f"SKILL.md: {'PASS' if skill_ok else 'FAIL'}")
    results.append(skill_ok)
    
    # 4. 验证目录结构
    print("\n=== 检查 4：目录结构 ===")
    expected = ["estimate.py", "SKILL.md", "tests", "tests/test_runner.py"]
    structure_ok = all(os.path.exists(os.path.join(ESTIMATE_PATH, p)) or 
                       os.path.isdir(os.path.join(ESTIMATE_PATH, p)) for p in expected)
    print(f"目录结构: {'PASS' if structure_ok else 'FAIL'}")
    results.append(structure_ok)
    
    # 汇总
    print("\n=== 汇总 ===")
    all_pass = all(results)
    print(f"总结果: {'ALL PASS ✓' if all_pass else '部分 FAIL ✗'}")
    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(main())