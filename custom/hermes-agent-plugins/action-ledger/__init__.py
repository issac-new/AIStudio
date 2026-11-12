"""action-ledger — Hermes plugin for side-effect action truth.

2026-11-12 ai-agent-handbook 吸收（批 2）：把工具动作记成可恢复的三态账本。
- pre_tool_call：为已知副作用工具写 intent（同键已有未结算动作时可拦截）。
- post_tool_call：写 confirmed / failed / sent。
  - 明确成功 → confirmed（带 external_ref，若结果里有）
  - 超时/断线/未知 → sent（效果未知，禁止当作失败直接重放）
  - 明确失败 → failed（带 error_class）

默认只记账（HERMES_ACTION_LEDGER_GUARD 未设置=0），零行为变化。
开启 guard 后，同键出现 sent/intended 且未过期时返回 block，要求先查外部状态。
账本是追加式 JSONL：Hermes 进程重启不丢，Studio 恢复计划器可只读消费。
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import threading
import time
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

_DEFAULT_DIR = Path.home() / ".hermes" / "action-ledger"
_LEDGER_FILE = "ledger.jsonl"
_LOCK = threading.Lock()
_INDEX: Dict[str, dict] = {}
_INDEX_PATH: Optional[Path] = None
_CALL_KEYS: Dict[str, str] = {}

# 已知副作用工具；env 可追加逗号分隔名单。MCP 工具默认不猜，交给调用方显式登记。
_SIDE_EFFECT_TOOLS = {
    "terminal", "terminal_exec", "write_file", "patch", "apply_patch", "execute_code",
    "skill_manage", "delegate_task", "send_message", "kanban_create", "kanban_update",
    "kanban_complete", "kanban_block", "memory_save", "memory_delete", "cron_create",
    "cron_delete", "image_generate", "video_generate", "browser_click", "browser_type",
}
_SIDE_EFFECT_PREFIXES = ("kanban_", "memory_", "cron_", "skill_", "delegate_", "send_")

_TIMEOUT_RE = re.compile(
    r"timeout|timed out|deadline|ETIMEDOUT|connection reset|broken pipe|"
    r"unknown|interrupted|KeyboardInterrupt|connection aborted",
    re.IGNORECASE,
)


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _env_int(name: str, default: int) -> int:
    raw = _env(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _ledger_dir() -> Path:
    explicit = _env("HERMES_ACTION_LEDGER_DIR")
    return Path(explicit) if explicit else _DEFAULT_DIR


def _ledger_path() -> Path:
    return _ledger_dir() / _LEDGER_FILE


def _stable_json(value: Any) -> str:
    try:
        return json.dumps(value, sort_keys=True, ensure_ascii=False, default=str)
    except Exception:
        return str(value)


def _compute_key(tool: str, args: Any, session_id: str, now: Optional[float] = None) -> str:
    window = max(1, _env_int("HERMES_ACTION_LEDGER_WINDOW_SECONDS", 900))
    bucket = int((now if now is not None else time.time()) // window)
    material = f"{tool}\x00{_stable_json(args)}\x00{session_id}\x00{bucket}"
    return hashlib.sha256(material.encode("utf-8", "replace")).hexdigest()[:32]


def _side_effect_tool(tool_name: str) -> bool:
    explicit = _env("HERMES_ACTION_LEDGER_TOOLS")
    if explicit:
        if tool_name in {t.strip() for t in explicit.split(",") if t.strip()}:
            return True
    if tool_name in _SIDE_EFFECT_TOOLS:
        return True
    return any(tool_name.startswith(prefix) for prefix in _SIDE_EFFECT_PREFIXES)


def _guard_enabled() -> bool:
    return _env("HERMES_ACTION_LEDGER_GUARD", "0") == "1"


def _stale_seconds() -> int:
    return max(1, _env_int("HERMES_ACTION_LEDGER_STALE_SECONDS", 60))


def _load_index(path: Path) -> Dict[str, dict]:
    """只读追加账本，保留每个 key 的末条记录。坏行跳过。"""
    index: Dict[str, dict] = {}
    try:
        if not path.exists():
            return index
        with path.open("r", encoding="utf-8", errors="replace") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except Exception:
                    continue
                key = row.get("key")
                if isinstance(key, str) and key:
                    index[key] = row
    except Exception as exc:
        logger.debug("action-ledger index load failed: %s", exc)
    return index


def _ensure_index() -> Dict[str, dict]:
    global _INDEX, _INDEX_PATH
    path = _ledger_path()
    if _INDEX_PATH != path:
        _INDEX = _load_index(path)
        _INDEX_PATH = path
    return _INDEX


def _append(row: dict) -> None:
    path = _ledger_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        line = json.dumps(row, ensure_ascii=False) + "\n"
        fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        try:
            os.write(fd, line.encode("utf-8", "replace"))
        finally:
            os.close(fd)
    except Exception as exc:
        logger.warning("action-ledger append failed: %s", exc)


def _record(event: str, *, key: str, tool: str, payload: dict, extra: Optional[dict] = None) -> dict:
    row = {
        "ts": time.time(),
        "event": event,
        "status": "intended" if event == "intent" else "sent" if event == "sent" else "confirmed" if event == "confirmed" else "failed" if event == "failed" else "blocked",
        "key": key,
        "tool": tool,
        "tool_call_id": payload.get("tool_call_id") or "",
        "session_id": payload.get("session_id") or "",
        "task_id": payload.get("task_id") or "",
        "turn_id": payload.get("turn_id") or "",
        "args_digest": hashlib.sha256(_stable_json(payload.get("args")).encode("utf-8", "replace")).hexdigest()[:16],
    }
    if extra:
        row.update({k: v for k, v in extra.items() if v is not None})
    _append(row)
    _ensure_index()[key] = row
    return row


def _is_unsettled(record: Optional[dict], now: Optional[float] = None) -> bool:
    if not record:
        return False
    status = record.get("status")
    if status not in ("intended", "sent"):
        return False
    ts = record.get("ts")
    if not isinstance(ts, (int, float)):
        return True
    return (now if now is not None else time.time()) - ts <= _stale_seconds()


def _extract_external_ref(result: Any) -> Optional[str]:
    if not isinstance(result, dict):
        return None
    for key in ("external_ref", "refund_id", "txn_id", "transaction_id", "message_id",
                "pr_id", "pull_request", "request_id", "operation_id", "id"):
        value = result.get(key)
        if isinstance(value, (str, int)) and str(value).strip():
            return str(value).strip()
    return None


def _classify_settlement(payload: dict) -> tuple[str, Optional[str]]:
    status = str(payload.get("status") or "").lower()
    error_type = str(payload.get("error_type") or "")
    error_message = str(payload.get("error_message") or "")
    if status in ("ok", "success", "succeeded", "completed") and not error_message:
        return "confirmed", None
    text = f"{error_type} {error_message}".strip()
    if not text:
        # 没有状态也没有错误：按未知处理，不能当成功。
        return "sent", "unknown"
    if _TIMEOUT_RE.search(text):
        return "sent", "timeout_or_unknown"
    return "failed", "tool_error"


def pre_tool_call(args: Any = None, session_id: Any = None, task_id: Any = None,
                  tool_call_id: Any = None, tool_name: Any = None, turn_id: Any = None,
                  **_kw: Any) -> Optional[dict]:
    """副作用工具执行前：写 intent；guard 开启且同键未结算时阻断。"""
    try:
        tool = str(tool_name or "")
        if not tool or not _side_effect_tool(tool):
            return None
        payload = {
            "args": args, "session_id": session_id or "", "task_id": task_id or "",
            "tool_call_id": tool_call_id or "", "turn_id": turn_id or "",
        }
        key = _compute_key(tool, args, str(session_id or ""))
        if tool_call_id:
            _CALL_KEYS[str(tool_call_id)] = key
        with _LOCK:
            index = _ensure_index()
            existing = index.get(key)
            if _guard_enabled() and _is_unsettled(existing):
                _record("blocked", key=key, tool=tool, payload=payload, extra={"reason": "unsettled-previous-action"})
                return {
                    "action": "block",
                    "message": (
                        f"ACTION_LEDGER_BLOCKED: {tool} 存在同键未结算动作"
                        f"（status={existing.get('status') if existing else 'unknown'}）；"
                        "先查外部真实状态，再决定重试或转人工。"
                    ),
                }
            _record("intent", key=key, tool=tool, payload=payload, extra={"attempts": int((existing or {}).get("attempts", 0)) + 1})
        return None
    except Exception as exc:
        logger.warning("action-ledger pre_tool_call fail-open: %s", exc)
        return None


def post_tool_call(args: Any = None, error_message: Any = None, error_type: Any = None,
                   result: Any = None, session_id: Any = None, status: Any = None,
                   task_id: Any = None, tool_call_id: Any = None, tool_name: Any = None,
                   turn_id: Any = None, **_kw: Any) -> None:
    """副作用工具结束后结算：confirmed / failed / sent。"""
    try:
        tool = str(tool_name or "")
        if not tool or not _side_effect_tool(tool):
            return
        payload = {
            "args": args, "session_id": session_id or "", "task_id": task_id or "",
            "tool_call_id": tool_call_id or "", "turn_id": turn_id or "",
            "status": status, "error_type": error_type, "error_message": error_message,
        }
        key = _CALL_KEYS.pop(str(tool_call_id), None) if tool_call_id else None
        if not key:
            key = _compute_key(tool, args, str(session_id or ""))
        settlement, error_class = _classify_settlement(payload)
        extra = {
            "external_ref": _extract_external_ref(result),
            "error_class": error_class,
        }
        with _LOCK:
            _record(settlement, key=key, tool=tool, payload=payload, extra=extra)
    except Exception as exc:
        logger.warning("action-ledger post_tool_call fail-open: %s", exc)


def register(ctx: Any) -> None:
    ctx.register_hook("pre_tool_call", pre_tool_call)
    ctx.register_hook("post_tool_call", post_tool_call)
    logger.info("action-ledger plugin enabled: %s", _ledger_path())
