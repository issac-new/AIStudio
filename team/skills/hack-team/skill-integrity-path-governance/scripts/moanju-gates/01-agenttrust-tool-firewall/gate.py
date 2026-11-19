#!/usr/bin/env python3
"""01 工具调用意图闸门（D1 工具调用意图闸门）

对应研究卡矩阵（moanju-fusion/research-slices/mechanism-matrix.md 与 p0-claims.md）：
- P0-01 AgentTrust 工具调用防火墙：Action 结构化 -> 规则判断 -> ALLOW/WARN/BLOCK/REVIEW
- P0-02 可信动作清单：允许的动作列为可执行清单，清单外一律拒绝
- P0-03 Agent IAM 目的/意图约束：写类动作必须绑定显式 purpose，权限存在 != 应被允许

fail-closed 原则：
- 动作 schema 不完整 / mode 非法 -> BLOCK（无法判断 = 不放行）
- 工具不在可信动作清单 -> BLOCK（未明确允许 = 拒绝）
- 高风险动作在非交互(headless)场景 -> BLOCK（本模块的核心默认拒绝）
- 高风险动作在交互场景 -> REVIEW（须人工批准后才能执行，本模块不放行）
- 输入 JSON 无法解析 -> 退出码 2（配置/输入错误，绝不默认放行）

决策到退出码映射（契约）：
- exit 0 = 放行（ALLOW / WARN，WARN 为放行但带风险提示）
- exit 1 = 拒绝放行（BLOCK / REVIEW，REVIEW 在无人工批准通道时视同拒绝）
- exit 2 = 配置/输入错误（JSON 解析失败、参数缺失）

纯 Python 标准库，无第三方依赖。
"""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any

# P0-02 可信动作清单：tool -> (风险级, 是否写类需要显式 purpose)
TRUSTED_ACTIONS: dict[str, tuple[str, bool]] = {
    "file_read": ("low", False),
    "dir_list": ("low", False),
    "text_search": ("low", False),
    "file_write": ("high", True),
    "file_delete": ("high", True),
    "shell_exec": ("high", True),
    "external_send": ("high", True),
    "credential_read": ("high", True),
}

REQUIRED_FIELDS = ("tool", "caller", "purpose", "mode", "params")
VALID_MODES = ("interactive", "headless")

SUSPICIOUS_PARAM_KEYS = ("password", "secret", "token", "api_key", "credential")


def _result(decision: str, reason: str, action: dict | None = None,
            risk: str | None = None, hints: list[str] | None = None) -> dict:
    out: dict[str, Any] = {"decision": decision, "reason": reason}
    if action is not None:
        out["tool"] = action.get("tool")
        out["caller"] = action.get("caller")
        out["mode"] = action.get("mode")
    if risk is not None:
        out["risk"] = risk
    if hints:
        out["hints"] = hints
    return out


def _param_hints(params: Any) -> list[str]:
    """低风险动作的参数风险提示（只提示，不拦截）。确定性规则，无 LLM。"""
    hints: list[str] = []
    if isinstance(params, dict):
        for k, v in params.items():
            ks = str(k).lower()
            if any(s in ks for s in SUSPICIOUS_PARAM_KEYS):
                hints.append(f"suspicious_param_key:{k}")
            vs = json.dumps(v, ensure_ascii=False) if not isinstance(v, str) else v
            if isinstance(vs, str) and ".." in vs:
                hints.append(f"possible_path_traversal:{k}")
    elif isinstance(params, str) and ".." in params:
        hints.append("possible_path_traversal:params")
    return hints


def evaluate(action: dict) -> dict:
    """对结构化 Action 做确定性闸门判断。任何分支都不抛异常、不默认放行。"""
    if not isinstance(action, dict):
        return _result("BLOCK", "schema_invalid: action must be a JSON object")

    # 1) schema 校验（fail-closed）
    missing = [f for f in REQUIRED_FIELDS if f not in action]
    if missing:
        return _result("BLOCK", f"schema_invalid: missing fields {missing}")
    if action["mode"] not in VALID_MODES:
        return _result(
            "BLOCK",
            f"schema_invalid: mode must be one of {list(VALID_MODES)}", action)

    tool = action["tool"]

    # 2) 可信动作清单（P0-02，fail-closed：未知工具拒绝）
    if tool not in TRUSTED_ACTIONS:
        return _result(
            "BLOCK",
            f"unknown_tool: '{tool}' not in trusted action checklist (fail-closed)",
            action)

    risk, needs_purpose = TRUSTED_ACTIONS[tool]

    # 3) Agent IAM 目的约束（P0-03）：写类高风险动作必须绑定显式 purpose
    if needs_purpose:
        purpose = str(action.get("purpose") or "").strip()
        if not purpose or purpose.lower() in ("none", "unspecified", "n/a"):
            return _result(
                "BLOCK",
                "purpose_missing: high-risk write action requires explicit purpose",
                action, risk)

    # 4) 非交互场景默认拒绝高风险动作（核心 fail-closed 规则）
    if risk == "high":
        if action["mode"] == "headless":
            return _result(
                "BLOCK",
                "high_risk_headless: non-interactive session denies high-risk "
                "action by default",
                action, risk)
        return _result(
            "REVIEW",
            "high_risk_interactive: requires explicit human approval before "
            "execution",
            action, risk)

    # 5) 低风险动作放行；参数有可疑特征时降级为 WARN（放行但提示）
    hints = _param_hints(action.get("params"))
    if hints:
        return _result("WARN", "allowed_with_hints: low-risk action with "
                       "suspicious parameter features", action, risk, hints)
    return _result("ALLOW", "trusted_low_risk_action", action, risk)


DECISION_EXIT = {"ALLOW": 0, "WARN": 0, "BLOCK": 1, "REVIEW": 1}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="D1 工具调用意图闸门")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--action", help="动作 JSON 字符串")
    g.add_argument("--action-file", help="动作 JSON 文件路径")
    g.add_argument("--stdin", action="store_true", help="从 stdin 读动作 JSON")
    args = ap.parse_args(argv)

    try:
        if args.action is not None:
            action = json.loads(args.action)
        elif args.action_file is not None:
            with open(args.action_file, encoding="utf-8") as f:
                action = json.load(f)
        else:
            action = json.load(sys.stdin)
    except (json.JSONDecodeError, OSError) as exc:
        print(json.dumps({"decision": "BLOCK", "reason": f"input_error: {exc}"},
                         ensure_ascii=False))
        return 2  # 配置/输入错误：fail-closed，绝不默认放行

    result = evaluate(action)
    print(json.dumps(result, ensure_ascii=False))
    return DECISION_EXIT[result["decision"]]


if __name__ == "__main__":
    sys.exit(main())
