#!/usr/bin/env python3
"""02 提示注入识别器（D2 提示注入识别与拦截）

对应研究卡矩阵：
- P0-05 CodeSentinel CST 节点级检测（间接提示注入在进入模型前识别、代码数据与指令分离）
- P0-06 PI-Hunter 提示注入路径猎杀（沿输入来源追踪，而非只看单片段）

机制：对用户输入 / 网页内容 / MCP 工具返回做注入特征检测。pattern 列表可配置
（--patterns-json 覆盖/扩展），返回结构化 match 列表（规则 id、severity、span、脱敏摘录）。

fail-closed 原则：
- 任何 HIGH/MEDIUM 命中 -> 判定"不可信内容"，该内容只能作数据，不得升级为指令。
- --patterns-json 解析失败 -> exit 2（配置错误），且不退化为"无 pattern 放行"。
- 输入文件缺失 -> exit 2。

退出码契约：0=未检出（clean）；1=检出注入特征；2=配置/输入错误。
纯 Python 标准库，无第三方依赖。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from typing import Any

# 默认注入特征 pattern（可被 --patterns-json 整体覆盖；条目：id/severity/regex）
DEFAULT_PATTERNS: list[dict[str, str]] = [
    {"id": "PI-001-ignore-previous", "severity": "high",
     "regex": r"(?i)\bignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)\b"},
    {"id": "PI-002-disregard", "severity": "high",
     "regex": r"(?i)\bdisregard\s+(all\s+|any\s+|the\s+)?(previous|prior|above)\b"},
    {"id": "PI-003-reveal-prompt", "severity": "high",
     "regex": r"(?i)\b(reveal|print|show|repeat)\s+(me\s+)?(your|the)\s+(system\s+)?(prompt|instructions)\b"},
    {"id": "PI-004-role-override", "severity": "medium",
     "regex": r"(?i)\byou\s+are\s+now\s+(a|an|the)\b"},
    {"id": "PI-005-new-directive", "severity": "medium",
     "regex": r"(?i)\bnew\s+(instructions?|directive|rules?)\s*:"},
    {"id": "PI-006-special-tokens", "severity": "high",
     "regex": r"<\|(im_start|im_end|system|endoftext)\|>"},
    {"id": "PI-007-invisible-chars", "severity": "medium",
     "regex": "[\u200b\u200c\u200d\u2060\ufeff]"},
]

_CONTEXT_WINDOW = 40  # 摘录在命中点前后各取的字符数


def _compile(patterns: list[dict[str, str]]) -> list[tuple[str, str, re.Pattern]]:
    out = []
    for p in patterns:
        out.append((p["id"], p.get("severity", "medium"), re.compile(p["regex"])))
    return out


def _excerpt(text: str, start: int, end: int) -> str:
    lo = max(0, start - _CONTEXT_WINDOW)
    hi = min(len(text), end + _CONTEXT_WINDOW)
    frag = text[lo:hi].replace("\n", "\\n")
    if len(frag) > 2 * _CONTEXT_WINDOW + 20:
        frag = frag[: 2 * _CONTEXT_WINDOW + 20]
    return frag


def scan(text: str, source: str = "unknown",
         patterns: list[dict[str, str]] | None = None) -> dict[str, Any]:
    """扫描文本，返回结构化结果。matched 非空即视为注入特征命中。

    source 标注输入来源（user/web/mcp/memory/...），落实 PI-Hunter 的
    来源分级思想：外部内容命中后只能作数据，不得作为行动指令。
    """
    compiled = _compile(patterns if patterns is not None else DEFAULT_PATTERNS)
    matches: list[dict[str, Any]] = []
    for pid, severity, rx in compiled:
        for m in rx.finditer(text):
            matches.append({
                "rule": pid,
                "severity": severity,
                "span": [m.start(), m.end()],
                "excerpt": _excerpt(text, m.start(), m.end()),
            })
    matches.sort(key=lambda x: x["span"][0])
    return {
        "source": source,
        "clean": not matches,
        "matches": matches,
        "treatment": (
            "untrusted-content-envelope: matched content must be treated as "
            "data only; never escalate to instructions" if matches else
            "no injection signature detected"),
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="D2 提示注入识别器")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--text", help="待扫描文本")
    g.add_argument("--file", help="待扫描文件路径")
    g.add_argument("--stdin", action="store_true", help="从 stdin 读文本")
    ap.add_argument("--source", default="unknown",
                    help="输入来源标注：user/web/mcp/memory/...")
    ap.add_argument("--patterns-json", help="自定义 pattern 列表 JSON（覆盖默认）")
    args = ap.parse_args(argv)

    patterns = DEFAULT_PATTERNS
    if args.patterns_json:
        try:
            with open(args.patterns_json, encoding="utf-8") as f:
                patterns = json.load(f)
            if not isinstance(patterns, list) or not patterns:
                raise ValueError("patterns must be a non-empty list")
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            print(json.dumps({"error": f"config_error: {exc}"},
                             ensure_ascii=False))
            return 2  # 配置错误：保持默认拒绝语义（不放行、不静默用空规则）

    try:
        if args.text is not None:
            text = args.text
        elif args.file is not None:
            with open(args.file, encoding="utf-8") as f:
                text = f.read()
        else:
            text = sys.stdin.read()
    except OSError as exc:
        print(json.dumps({"error": f"input_error: {exc}"}, ensure_ascii=False))
        return 2

    result = scan(text, source=args.source, patterns=patterns)
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["clean"] else 1


if __name__ == "__main__":
    sys.exit(main())
