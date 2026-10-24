#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
rd-estimate 示例估算脚本
按任务要求：拆卡 3 张、预估 40 轮、需 2 文件 patch + pytest 验证。
展示 estimate() 接口与方法的完整工作流（validate → estimate → JSON）。
"""
import json
import sys
import os

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))  # 父目录含 estimate.py
from estimate import estimate, validate

# 构造一个符合契约 §2 的输入对象，映射到任务场景
EXAMPLE_INPUT = {
    "schema_version": "rd-estimate/v1",
    "task_id": "t_example_ai_agent",
    "decomposition": {
        "app": "AI-agent-pipeline",
        "goal": "实现一个 AI agent 示例估算：拆卡 3 张、预估 40 轮、需 2 文件 patch + pytest 验证",
        "acceptance": [
            "skill 文件存在且内容完整",
            "包含方法原理、适配思路、estimate() 接口伪代码或示例",
            "已注册并可被 worker-coder/rd-decompose 调用",
            "提供 1 个示例估算",
        ],
    },
    "scope": {
        "system_boundary": "Hermes RD 估算管道（agent 估算子任务）",
        "users": [
            {"type": "program", "name": "rd-decompose"},
            {"type": "program", "name": "worker-coder"},
        ],
    },
    "functions": {
        "data": [
            {"id": "d1", "kind": "ILF", "complexity": "med", "note": "估算模板/约定存储"},
            {"id": "d2", "kind": "ILF", "complexity": "low", "note": "历史校准数据"},
        ],
        "transactional": [
            {"id": "t1", "kind": "EI", "complexity": "low", "note": "读拆解结果"},
            {"id": "t2", "kind": "EO", "complexity": "med", "note": "输出估算 JSON"},
            {"id": "t3", "kind": "EQ", "complexity": "low", "note": "错误码映射"},
            {"id": "t4", "kind": "EI", "complexity": "med", "note": "文件 patch 写入"},
            {"id": "t5", "kind": "EO", "complexity": "med", "note": "pytest 验证报告"},
        ],
    },
    "adjustment": {
        "reuse": "mid",
        "change_type": "add",
        "quality_factors": {"reliability": 1, "performance": 0},
        "workload_share": 1.0,
    },
    "workload": {
        "productivity_hours_per_size": 6.46,
        "hours_per_month": 160,
        "rate_per_person_month": 30000,
        "evidence_class": "observed",
        "productivity_source": "t_af428cf4",
    },
    "budget": {
        "goal_max_turns_estimate": 40,
        "history_anchor": "t_12601f3e",
    },
}


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--input-only":
        # 仅打印输入 JSON（供管道喂给 estimate.py）
        print(json.dumps(EXAMPLE_INPUT, ensure_ascii=False, indent=2))
        return 0

    # 完整工作流：validate → estimate
    try:
        validate(EXAMPLE_INPUT)
    except SystemExit as e:
        print(f"Validation 失败 rc={e.code}", file=sys.stderr)
        return e.code

    result = estimate(EXAMPLE_INPUT)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
