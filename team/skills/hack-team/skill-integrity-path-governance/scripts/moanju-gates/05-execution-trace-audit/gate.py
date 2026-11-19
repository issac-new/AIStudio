#!/usr/bin/env python3
"""05 执行轨迹可归因日志（D5 对抗评测与红队 / 审计归因）

对应研究卡矩阵：
- P0-16 TRACESAFE-BENCH 执行过程评测（评估完整轨迹与工具动作，而非只看文本输出）
- 承接 D1 闸门输出：每次工具调用记录可复现审计事件

机制：为工具调用写 append-only JSONL 审计日志，每条事件含：
- timestamp（UTC ISO8601）、caller、tool、params_hash（SHA-256）、
  output_summary（截断）、decision（allow/deny）、gate_reason
- **params 全文与 output 全文不落盘**，只落哈希与截断摘要；
  且写盘前强制过模块 04 的 redactor —— 日志中不落任何明文 secret。

fail-closed 原则：
- 日志目录不可写 -> 报错退出（exit 2），不静默丢弃审计事件。
- 事件缺关键字段 -> 拒绝记录并返回 error（不写半条事件）。
- append 校验：文件存在但非合法 JSONL -> exit 2（疑似被篡改，停止追加）。

退出码契约：0=记录成功；1=记录被拒（缺字段/策略拒绝）；2=配置/IO/篡改错误。
纯 Python 标准库，无第三方依赖。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SUMMARY_MAX = 120  # output 摘要截断长度


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _sha256(data: str) -> str:
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def _summary(output: str) -> str:
    flat = output.replace("\n", "\\n")
    return flat[:SUMMARY_MAX] + ("..." if len(flat) > SUMMARY_MAX else "")


def validate_event(event: dict[str, Any]) -> str | None:
    """返回错误原因或 None（合法）。"""
    for key in ("caller", "tool", "params", "decision"):
        if key not in event:
            return f"missing_field: {key}"
    if event["decision"] not in ("allow", "deny"):
        return f"bad_decision: {event['decision']}"
    return None


def _validate_jsonl_history(path: Path) -> None:
    """已有日志必须是合法 JSONL，否则视为篡改 -> 拒绝追加。"""
    if not path.exists():
        return
    with path.open(encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(
                    f"tamper_suspected: line {i} not valid JSON: {exc}") from exc


def append_event(event: dict[str, Any], log_path: str | Path) -> dict[str, Any]:
    """记录一条工具调用审计事件（先 redact，再落盘）。"""
    err = validate_event(event)
    if err:
        return {"recorded": False, "error": err}

    p = Path(log_path).expanduser()
    p.parent.mkdir(parents=True, exist_ok=True)
    _validate_jsonl_history(p)

    # 先过 secret redactor（模块 04 同源逻辑内联，避免路径依赖）
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent
                           / "04-secret-minimal-exposure"))
    try:
        from gate import scan as redact_scan  # type: ignore
        params_str = json.dumps(event["params"], ensure_ascii=False, sort_keys=True)
        red_params, _ = redact_scan(params_str)
        red_out, _ = redact_scan(str(event.get("output", "")))
    finally:
        sys.path.pop(0)

    record = {
        "ts": _utc_now(),
        "caller": str(event["caller"]),
        "tool": str(event["tool"]),
        "params_hash": _sha256(params_str),
        "output_summary": _summary(red_out),
        "decision": event["decision"],
        "gate_reason": str(event.get("gate_reason", "")),
    }
    with p.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
    return {"recorded": True, "record": record}


def verify_log(log_path: str | Path) -> dict[str, Any]:
    """复现审计：重放校验 JSONL 完整性，返回统计。"""
    p = Path(log_path).expanduser()
    if not p.exists():
        return {"events": 0, "intact": True}
    _validate_jsonl_history(p)
    with p.open(encoding="utf-8") as f:
        lines = [json.loads(x) for x in f if x.strip()]
    return {"events": len(lines),
            "intact": True,
            "first_ts": lines[0]["ts"] if lines else None,
            "last_ts": lines[-1]["ts"] if lines else None}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="D5 执行轨迹审计日志")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_rec = sub.add_parser("record", help="记录一条工具调用事件")
    p_rec.add_argument("--caller", required=True)
    p_rec.add_argument("--tool", required=True)
    p_rec.add_argument("--params", required=True, help="params JSON 字符串")
    p_rec.add_argument("--decision", required=True, choices=["allow", "deny"])
    p_rec.add_argument("--output", default="")
    p_rec.add_argument("--gate-reason", default="")
    p_rec.add_argument("--log", required=True, help="审计 JSONL 路径")

    p_ver = sub.add_parser("verify", help="校验审计日志完整性")
    p_ver.add_argument("--log", required=True)

    args = ap.parse_args(argv)
    try:
        if args.cmd == "record":
            try:
                params = json.loads(args.params)
            except json.JSONDecodeError as exc:
                print(json.dumps({"recorded": False,
                                  "error": f"params_json_error: {exc}"},
                                 ensure_ascii=False))
                return 2
            result = append_event(
                {"caller": args.caller, "tool": args.tool, "params": params,
                 "decision": args.decision, "output": args.output,
                 "gate_reason": args.gate_reason}, args.log)
            print(json.dumps(result, ensure_ascii=False))
            return 0 if result.get("recorded") else 1
        stats = verify_log(args.log)
        print(json.dumps(stats, ensure_ascii=False))
        return 0
    except (OSError, ValueError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    sys.exit(main())
