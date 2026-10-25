"""交接检查点（长会话治理 604）：会话生命周期边界处落一份**机械**交接记录。

落点：``<HERMES_HOME>/session-checkpoints/<safe-key>.json``（每键保留最近 8 条历史，
原子写，fail-open）。写入方：603 会话轮换（auto 档）、fork API（api_server）、
后续任何压缩边界调用方。消费方：603 轮换后回合 sidecar note、kanban worker 冷启动
上下文（build_worker_context 的「最近会话交接检查点」段）。

诚实边界：这是**机械检查点**，不是 LLM 摘要——客观字段（目标指针、末次产出尾部、
累计计数、轮换原因）+ 纪律重申；done/left/blocked 的语义判断留给接手会话自行确认，
模板不做编造。字段格式对齐 delegate 交接短语协议（patch 416：done/left/blocked 带
file:line 锚点）与 kanban runs 表字段。
"""

from __future__ import annotations

import json
import logging
import os
import re
import tempfile
import time
from contextlib import suppress
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

CHECKPOINTS_DIR = "session-checkpoints"
HISTORY_CAP = 8
_OUTPUT_TAIL_CHARS = 400
_UNSAFE_KEY = re.compile(r"[^A-Za-z0-9._-]+")

RULES_RESTATEMENT = (
    "Standing rules: stay in role; every claim needs an evidence anchor "
    "(file:line / command output / URL); no evidence, no PASS; a diff or commit "
    "alone is not completion evidence; if blocked, persist done/left/blocked."
)


def _safe_key(key: str) -> str:
    cleaned = _UNSAFE_KEY.sub("-", str(key or "session")).strip("-.") or "session"
    return cleaned[:120]


def _checkpoints_dir() -> Optional[Path]:
    try:
        from hermes_constants import get_hermes_home
        directory = get_hermes_home() / CHECKPOINTS_DIR
        directory.mkdir(parents=True, exist_ok=True)
        return directory
    except Exception:  # noqa: BLE001
        return None


def write_checkpoint(key: str, source: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """追加一条检查点（历史有界）；返回写下的记录，失败返 None（fail-open）。"""
    directory = _checkpoints_dir()
    if directory is None:
        return None
    record = {"ts": time.time(), "source": str(source or "manual")}
    record.update({k: v for k, v in (fields or {}).items() if k not in ("ts", "source")})
    path = directory / f"{_safe_key(key)}.json"
    try:
        history: List[Dict[str, Any]] = []
        if path.is_file():
            with suppress(Exception):
                history = (json.loads(path.read_text(encoding="utf-8")) or {}).get("history", [])
        history.append(record)
        history = history[-HISTORY_CAP:]
        fd, tmp = tempfile.mkstemp(dir=str(directory), prefix=".ckpt.", suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as tmp_file:
            json.dump({"key": _safe_key(key), "history": history}, tmp_file, ensure_ascii=False)
        os.replace(tmp, path)
        return record
    except Exception:  # noqa: BLE001
        logger.debug("handoff checkpoint write failed for %s", key, exc_info=True)
        return None


def read_latest(key: str) -> Optional[Dict[str, Any]]:
    directory = _checkpoints_dir()
    if directory is None:
        return None
    path = directory / f"{_safe_key(key)}.json"
    with suppress(Exception):
        history = (json.loads(path.read_text(encoding="utf-8")) or {}).get("history", [])
        return history[-1] if history else None
    return None


def recent_checkpoints(limit: int = 3) -> List[Dict[str, Any]]:
    """跨键最近检查点（mtime 序）——worker 上下文用。"""
    directory = _checkpoints_dir()
    if directory is None:
        return []
    records: List[Dict[str, Any]] = []
    with suppress(Exception):
        for path in directory.glob("*.json"):
            with suppress(Exception):
                history = (json.loads(path.read_text(encoding="utf-8")) or {}).get("history", [])
                if history:
                    item = dict(history[-1])
                    item["key"] = path.stem
                    records.append(item)
    records.sort(key=lambda r: float(r.get("ts", 0)), reverse=True)
    return records[:limit]


def _tail(text: Any, limit: int = _OUTPUT_TAIL_CHARS) -> str:
    s = str(text or "").strip()
    return s[-limit:] if len(s) > limit else s


def checkpoint_from_turn(
    session_key: str, session_entry: Any, agent_result: Any,
    telemetry_entry: Optional[Dict[str, Any]], reason: str,
) -> Dict[str, Any]:
    """机械采集轮换时刻的交接字段（不调用模型）。"""
    final_response = ""
    if isinstance(agent_result, dict):
        final_response = agent_result.get("final_response") or agent_result.get("error") or ""
    telemetry = telemetry_entry if isinstance(telemetry_entry, dict) else {}
    return {
        "objective": str(getattr(session_entry, "display_name", "") or ""),
        "reason": str(reason or ""),
        "pointers": {
            "prev_session_id": str(getattr(session_entry, "session_id", "") or ""),
            "session_key": str(session_key or ""),
        },
        "last_output_tail": _tail(final_response),
        "counters": {
            "turns": telemetry.get("turns"),
            "cum_api_calls": telemetry.get("cum_api_calls"),
            "heartbeats": (telemetry.get("heartbeat") or {}).get("emitted"),
            "runaway_signal": (telemetry.get("runaway") or {}).get("signal"),
            "rotations": telemetry.get("rotations"),
        },
        "left": "confirm by reading the previous transcript (see pointers) before continuing",
        "blocked": "",
        "rules": RULES_RESTATEMENT,
    }


def build_checkpoint_note(record: Optional[Dict[str, Any]]) -> str:
    """轮换后首回合 sidecar note 文本（接手会话读）。"""
    if not isinstance(record, dict) or not record:
        return ""
    pointers = record.get("pointers") or {}
    counters = record.get("counters") or {}
    lines = [
        "[HANDOFF CHECKPOINT — session was rotated]",
        f"reason: {record.get('reason', '')}",
        f"objective: {record.get('objective', '') or '(untitled)'}",
        f"previous session: {pointers.get('prev_session_id', '')} (key {pointers.get('session_key', '')})",
    ]
    if counters:
        shown = " ".join(f"{k}={v}" for k, v in counters.items() if v is not None)
        if shown:
            lines.append(f"counters: {shown}")
    tail = str(record.get("last_output_tail", "")).strip()
    if tail:
        lines.append(f"last output (tail): {tail}")
    lines.append(f"next: {record.get('left', '')}")
    lines.append(record.get("rules", RULES_RESTATEMENT))
    return "\n".join(lines)


def worker_context_block(limit: int = 3) -> str:
    """kanban worker 冷启动上下文的「最近会话交接检查点」段（无检查点返回空串）。"""
    records = recent_checkpoints(limit)
    if not records:
        return ""
    lines = ["## Recent session handoff checkpoints"]
    for item in records:
        ts = time.strftime("%m-%d %H:%M", time.localtime(float(item.get("ts", 0) or 0)))
        lines.append(
            f"- [{ts}] {item.get('key', '?')} source={item.get('source', '?')} "
            f"reason={item.get('reason', '-')}: "
            f"left={str(item.get('left', ''))[:120]}"
        )
    lines.append(
        "(mechanical checkpoints from rotated sessions; confirm details from the "
        "pointers before relying on them)"
    )
    return "\n".join(lines)
