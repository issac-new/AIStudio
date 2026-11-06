#!/usr/bin/env python3
"""mx_cli_contract.py — AI-Friendly CLI 契约的 Python 镜像（被 import，不产出输出）。

词表与退出码正本：config/cli-contract.json。部署树可能没有 config/（SIM 运行态只拷
simharness），因此内置一份同值回退；两份一致性由 custom/__tests__/cli-contract.test.ts
断言（漂移即测试红）。

用法：
    from mx_cli_contract import add_common_args, ContractArgumentParser, emit_result, fail
    ap = ContractArgumentParser()
    add_common_args(ap)
    a = ap.parse_args()
    if a.format == "json":
        emit_result(a.format, build_result(summary={"ok": 1}), "人读摘要")
    fail("usage", "缺 --dir", "mx-eval-summary.py --dir <evidence/evals>")
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

_FALLBACK = {
    "contract_version": 1,
    "formats": ["human", "json"],
    "events_format": "ndjson",
    "statuses": ["ok", "completed_with_errors", "failed"],
    "exit_codes": {
        "ok": 0,
        "business_failure": 1,
        "environment": 2,
        "usage": 3,
        "partial": 4,
    },
    "error_categories": [
        "usage",
        "config",
        "auth_required",
        "environment",
        "upstream_unavailable",
        "timeout",
        "partial_failure",
        "gate_failed",
        "internal",
    ],
    "event_names": ["started", "progress", "heartbeat", "retry", "item_failed", "completed"],
}


def _load_contract():
    path = Path(__file__).resolve().parents[2] / "config" / "cli-contract.json"
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return _FALLBACK


CONTRACT = _load_contract()
CONTRACT_VERSION = CONTRACT["contract_version"]
FORMATS = tuple(CONTRACT["formats"])
STATUSES = tuple(CONTRACT["statuses"])
ERROR_CATEGORIES = tuple(CONTRACT["error_categories"])
EVENT_NAMES = tuple(CONTRACT["event_names"])
EXIT = dict(CONTRACT["exit_codes"])


def map_category_to_exit(category):
    if category == "usage":
        return EXIT["usage"]
    if category == "partial_failure":
        return EXIT["partial"]
    if category in ("config", "auth_required", "environment", "upstream_unavailable", "timeout"):
        return EXIT["environment"]
    return EXIT["business_failure"]


class ContractArgumentParser(argparse.ArgumentParser):
    """argparse 的用法错误也走契约信封（category=usage，退出码 3）。"""

    def error(self, message):
        fmt = "json" if "--format=json" in sys.argv or _format_in(sys.argv) == "json" else "human"
        fail("usage", message, "运行 --help 查看可用参数", fmt=fmt)


def _format_in(argv):
    for index, arg in enumerate(argv):
        if arg == "--format" and index + 1 < len(argv):
            return argv[index + 1]
        if arg.startswith("--format="):
            return arg.split("=", 1)[1]
    return "human"


def add_common_args(parser):
    parser.add_argument("--format", choices=FORMATS, default="human", help="输出格式（默认 human）")
    parser.add_argument("--events", choices=(CONTRACT["events_format"],), default=None,
                        help="事件流格式（与 --format json 互斥）")
    parser.add_argument("--inspect-config", action="store_true", help="只报告配置最终取值与来源层")


def validate_common(args):
    if getattr(args, "format", "human") == "json" and getattr(args, "events", None):
        fail("usage", "--events ndjson 与 --format json 互斥",
             "机读结果用 --format json；长任务进度用 --events ndjson，二选一",
             fmt=args.format)


def build_result(status="ok", summary=None, artifacts=None, data=None, error=None):
    if status not in STATUSES:
        raise ValueError(f"非法状态 {status}")
    if status == "failed" and not error:
        raise ValueError("status=failed 必须携带 error 信封")
    if status != "failed" and error:
        raise ValueError(f"status={status} 不得携带 error 信封")
    result = {"schema_version": CONTRACT_VERSION, "status": status}
    if summary is not None:
        result["summary"] = summary
    if artifacts is not None:
        result["artifacts"] = artifacts
    if data is not None:
        result["data"] = data
    if error is not None:
        result["error"] = {
            "category": error.get("category"),
            "reason": error.get("reason"),
            "remediation": error.get("remediation"),
        }
    return result


def emit_result(fmt, result, human_line=None):
    if fmt == "json":
        sys.stdout.write(json.dumps(result, ensure_ascii=False) + "\n")
        return
    if human_line:
        sys.stdout.write(str(human_line) + "\n")


def emit_event(event):
    if not isinstance(event, dict) or event.get("event") not in EVENT_NAMES:
        raise ValueError(f"事件名必须是 {'|'.join(EVENT_NAMES)}")
    body = {"ts": _now_iso(), **event}
    sys.stdout.write(json.dumps(body, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _now_iso():
    import datetime

    return datetime.datetime.now().astimezone().isoformat(timespec="seconds")


_SECRET_PATTERNS = (
    (re.compile(r"\bsk-[A-Za-z0-9_-]{8,}"), "sk-***"),
    (re.compile(r"\b(Bearer)\s+[A-Za-z0-9._~+/-]{8,}=*"), r"\1 ***"),
    (re.compile(r"\b(api[_-]?key|token|secret|password|authorization|cookie)\b"
                r"([\"']?\s*[:=]\s*[\"']?)([^\s\"',}]{4,})", re.IGNORECASE), r"\1\2***"),
)


def redact(value):
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    for pattern, replacement in _SECRET_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def resolve_config(steps):
    """steps: [{"source": str, "value": any}, ...]，按给定优先级取第一个有值层。"""
    if not steps:
        raise ValueError("resolve_config 需要至少一层配置")
    for step in steps:
        value = step.get("value")
        if value is not None and value != "":
            return {"value": value, "source": step.get("source")}
    last = steps[-1]
    return {"value": last.get("value"), "source": last.get("source")}


def config_inspect(steps):
    resolved = resolve_config(steps)
    used_source = resolved.get("source")
    return {
        "precedence": [step.get("source") for step in steps],
        "resolved": resolved,
        "layers": [
            {
                "source": step.get("source"),
                "value": step.get("value"),
                "used": step.get("source") == used_source,
            }
            for step in steps
        ],
    }


def fail(category, reason, remediation, fmt="human", exit_code=None):
    if category not in ERROR_CATEGORIES:
        category = "internal"
    code = exit_code if exit_code is not None else map_category_to_exit(category)
    if fmt == "json":
        sys.stderr.write(json.dumps({
            "schema_version": CONTRACT_VERSION,
            "status": "failed",
            "error": {
                "category": category,
                "reason": redact(str(reason)),
                "remediation": redact(str(remediation)),
            },
        }, ensure_ascii=False) + "\n")
    else:
        sys.stderr.write(f"[{category}] {reason}\n修复: {remediation}\n")
    raise SystemExit(code)
