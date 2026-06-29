"""run-trace — Hermes plugin for local RunTraceView observability.

Writes JSONL trace files to ~/.hermes/traces/ for consumption by the
RunTraceView frontend via Layer 3 Koa API.

Supports two output formats (controlled by HERMES_RUN_TRACE_FORMAT env var):
  - "legacy"  (default): custom header/chunk/trailer format
  - "otel":   OpenTelemetry GenAI semantic convention spans (Jaeger/Langfuse compatible)

Activation is handled by the Hermes plugin system — standalone plugins only
load when listed in ``plugins.enabled`` (via ``hermes plugins enable run-trace``).

Fail-open design: if the trace directory is not writable, hooks are inert.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Optional

# OTel formatter (Phase 4: aligns with OpenTelemetry GenAI semantic conventions)
try:
    from .otel_formatter import (
        build_session_span,
        build_llm_span,
        build_tool_span,
        build_subagent_span,
        build_trailer_span,
    )
    _OTEL_AVAILABLE = True
except ImportError:
    _OTEL_AVAILABLE = False

logger = logging.getLogger(__name__)

# Default trace directory
_DEFAULT_TRACE_DIR = Path.home() / ".hermes" / "traces"

# Thread-safe state
_STATE_LOCK = threading.Lock()
_SESSION_FILES: Dict[str, Any] = {}  # session_id -> file handle
_TRACE_STATE: Dict[str, TraceSession] = {}
_MAX_STATE_ENTRIES = 256


@dataclass
class TraceSession:
    """Per-session trace state."""
    session_id: str
    task_id: Optional[str] = None
    file_path: Path
    file_handle: Any = None
    started_at: float = field(default_factory=time.time)
    api_request_ids: Dict[str, dict] = field(default_factory=dict)  # api_request_id -> span info
    tool_call_ids: Dict[str, dict] = field(default_factory=dict)  # tool_call_id -> span info
    subagent_ids: Dict[str, dict] = field(default_factory=dict)  # subagent label -> span info
    last_updated_at: float = field(default_factory=time.time)


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _use_otel_format() -> bool:
    """Whether to output OpenTelemetry span format (Phase 4)."""
    return _env("HERMES_RUN_TRACE_FORMAT", "legacy").lower() == "otel" and _OTEL_AVAILABLE


def _get_trace_dir() -> Path:
    """Get trace directory from env or default."""
    dir_path = _env("HERMES_RUN_TRACE_DIR")
    if dir_path:
        return Path(dir_path)
    return _DEFAULT_TRACE_DIR


def _ensure_trace_dir() -> Optional[Path]:
    """Ensure trace directory exists, return None if not writable."""
    trace_dir = _get_trace_dir()
    try:
        trace_dir.mkdir(parents=True, exist_ok=True)
        # Test write permission
        test_file = trace_dir / ".write_test"
        test_file.write_text("ok")
        test_file.unlink()
        return trace_dir
    except Exception as exc:
        logger.warning("Could not create/write trace directory %s: %s", trace_dir, exc)
        return None


def _write_jsonl_line(file_handle: Any, data: dict) -> None:
    """Write a single JSONL line."""
    try:
        line = json.dumps(data, ensure_ascii=False) + "\n"
        file_handle.write(line)
        file_handle.flush()
    except Exception as exc:
        logger.warning("Failed to write JSONL line: %s", exc)


def _session_key(session_id: str, task_id: Optional[str] = None) -> str:
    """Build stable session key."""
    if task_id:
        return f"task:{task_id}:session:{session_id}"
    return f"session:{session_id}"


# ── Hook Handlers ──

def _on_session_start(ctx: Any, payload: dict) -> None:
    """Create new JSONL file, write header."""
    trace_dir = _ensure_trace_dir()
    if not trace_dir:
        return

    session_id = payload.get("session_id", "")
    task_id = payload.get("task_id")
    key = _session_key(session_id, task_id)

    with _STATE_LOCK:
        # Evict oldest if over cap
        if len(_TRACE_STATE) >= _MAX_STATE_ENTRIES:
            oldest_key = min(_TRACE_STATE.keys(), key=lambda k: _TRACE_STATE[k].last_updated_at)
            old_session = _TRACE_STATE.pop(oldest_key, None)
            if old_session and old_session.file_handle:
                try:
                    old_session.file_handle.close()
                except Exception:
                    pass

        # Create file
        file_name = f"{session_id}.jsonl"
        file_path = trace_dir / file_name
        try:
            file_handle = file_path.open("a", encoding="utf-8")
        except Exception as exc:
            logger.warning("Could not open trace file %s: %s", file_path, exc)
            return

        # Build header
        started_at = payload.get("started_at", time.time())
        if _use_otel_format():
            header = build_session_span(
                session_id=session_id,
                task_id=task_id,
                started_at=started_at,
                model=payload.get("model"),
                provider=payload.get("provider"),
            )
        else:
            header = {
                "type": "header",
                "version": "1.0.0",
                "session_id": session_id,
                "task_id": task_id,
                "started_at": started_at,
                "model": payload.get("model"),
                "provider": payload.get("provider"),
                "source": payload.get("source", "hermes-agent"),
            }
        _write_jsonl_line(file_handle, header)

        # Store state
        state = TraceSession(
            session_id=session_id,
            task_id=task_id,
            file_path=file_path,
            file_handle=file_handle,
            started_at=started_at,
        )
        _TRACE_STATE[key] = state
        _SESSION_FILES[session_id] = file_handle

    logger.debug("Started trace session %s", session_id)


def _on_session_end(ctx: Any, payload: dict) -> None:
    """Write trailer, close file."""
    session_id = payload.get("session_id", "")
    task_id = payload.get("task_id")
    key = _session_key(session_id, task_id)

    with _STATE_LOCK:
        state = _TRACE_STATE.pop(key, None)
        if not state:
            return

        # Write trailer
        ended_at = payload.get("ended_at", time.time())
        duration_ms = int((ended_at - state.started_at) * 1000)
        if _use_otel_format():
            trailer = build_trailer_span(
                session_id=session_id,
                ended_at=ended_at,
                duration_ms=duration_ms,
                outcome=payload.get("outcome"),
                error=payload.get("error"),
            )
        else:
            trailer = {
                "type": "trailer",
                "session_id": session_id,
                "ended_at": ended_at,
                "duration_ms": duration_ms,
                "outcome": payload.get("outcome"),
                "error": payload.get("error"),
                "summary": payload.get("summary"),
            }
        _write_jsonl_line(state.file_handle, trailer)

        # Close file
        try:
            state.file_handle.close()
        except Exception:
            pass

        _SESSION_FILES.pop(session_id, None)

    logger.debug("Ended trace session %s", session_id)


def _pre_api_request(ctx: Any, payload: dict) -> None:
    """Write LLM span start chunk."""
    session_id = payload.get("session_id", "")
    task_id = payload.get("task_id")
    api_request_id = payload.get("api_request_id", "")
    key = _session_key(session_id, task_id)

    with _STATE_LOCK:
        state = _TRACE_STATE.get(key)
        if not state:
            return

        started_at = payload.get("started_at", time.time())
        if _use_otel_format():
            chunk = build_llm_span(
                session_id=session_id,
                api_request_id=api_request_id,
                model=payload.get("model"),
                provider=payload.get("provider"),
                started_at=started_at,
            )
        else:
            chunk = {
                "type": "chunk",
                "kind": "llm_span",
                "phase": "pre",
                "session_id": session_id,
                "api_request_id": api_request_id,
                "turn_id": payload.get("turn_id"),
                "model": payload.get("model"),
                "provider": payload.get("provider"),
                "started_at": started_at,
                "api_call_count": payload.get("api_call_count"),
                "request_messages": payload.get("request_messages"),
            }
        _write_jsonl_line(state.file_handle, chunk)

        # Track span for post handler
        state.api_request_ids[api_request_id] = {
            "started_at": started_at,
            "model": payload.get("model"),
        }
        state.last_updated_at = time.time()

    logger.debug("Pre API request %s for session %s", api_request_id, session_id)


def _post_api_request(ctx: Any, payload: dict) -> None:
    """Write LLM span end chunk with usage."""
    session_id = payload.get("session_id", "")
    task_id = payload.get("task_id")
    api_request_id = payload.get("api_request_id", "")
    key = _session_key(session_id, task_id)

    with _STATE_LOCK:
        state = _TRACE_STATE.get(key)
        if not state:
            return

        span_info = state.api_request_ids.pop(api_request_id, {})
        started_at = span_info.get("started_at", payload.get("started_at"))
        ended_at = payload.get("ended_at", time.time())
        duration_ms = int((ended_at - started_at) * 1000) if started_at else payload.get("api_duration", 0)

        if _use_otel_format():
            chunk = build_llm_span(
                session_id=session_id,
                api_request_id=api_request_id,
                model=payload.get("model") or span_info.get("model"),
                provider=payload.get("provider"),
                started_at=started_at,
                ended_at=ended_at,
                duration_ms=duration_ms,
                usage=payload.get("usage"),
                finish_reason=payload.get("finish_reason"),
            )
        else:
            chunk = {
                "type": "chunk",
                "kind": "llm_span",
                "phase": "post",
                "session_id": session_id,
                "api_request_id": api_request_id,
                "turn_id": payload.get("turn_id"),
                "model": payload.get("model"),
                "provider": payload.get("provider"),
                "started_at": started_at,
                "ended_at": ended_at,
                "duration_ms": duration_ms,
                "finish_reason": payload.get("finish_reason"),
                "usage": payload.get("usage"),
                "response_preview": payload.get("response"),
            }
            # Truncate large response previews
            if chunk["response_preview"] and isinstance(chunk["response_preview"], str):
                if len(chunk["response_preview"]) > 500:
                    chunk["response_preview"] = chunk["response_preview"][:500] + "..."

        _write_jsonl_line(state.file_handle, chunk)
        state.last_updated_at = time.time()

    logger.debug("Post API request %s for session %s", api_request_id, session_id)


def _post_tool_call(ctx: Any, payload: dict) -> None:
    """Write tool chunk with duration, args, result."""
    session_id = payload.get("session_id", "")
    task_id = payload.get("task_id")
    tool_call_id = payload.get("tool_call_id", "")
    key = _session_key(session_id, task_id)

    with _STATE_LOCK:
        state = _TRACE_STATE.get(key)
        if not state:
            return

        if _use_otel_format():
            chunk = build_tool_span(
                session_id=session_id,
                tool_call_id=tool_call_id,
                tool_name=payload.get("tool_name"),
                args=payload.get("args"),
                result=payload.get("result"),
                duration_ms=payload.get("duration_ms"),
                status=payload.get("status"),
                error_message=payload.get("error_message"),
                started_at=payload.get("ts", time.time()),
            )
        else:
            chunk = {
                "type": "chunk",
                "kind": "tool_span",
                "session_id": session_id,
                "tool_call_id": tool_call_id,
                "tool_name": payload.get("tool_name"),
                "args": payload.get("args"),
                "result": payload.get("result"),
                "duration_ms": payload.get("duration_ms"),
                "status": payload.get("status"),
                "error_type": payload.get("error_type"),
                "error_message": payload.get("error_message"),
                "turn_id": payload.get("turn_id"),
                "api_request_id": payload.get("api_request_id"),
                "ts": payload.get("ts", time.time()),
            }
            # Truncate large args/result
            if chunk["args"] and isinstance(chunk["args"], str):
                if len(chunk["args"]) > 1000:
                    chunk["args"] = chunk["args"][:1000] + "..."
            if chunk["result"] and isinstance(chunk["result"], str):
                if len(chunk["result"]) > 1000:
                    chunk["result"] = chunk["result"][:1000] + "..."

        _write_jsonl_line(state.file_handle, chunk)
        state.last_updated_at = time.time()

    logger.debug("Tool call %s (%s) for session %s", tool_call_id, payload.get("tool_name"), session_id)


def _subagent_start(ctx: Any, payload: dict) -> None:
    """Write subagent start chunk."""
    session_id = payload.get("session_id", "")
    task_id = payload.get("task_id")
    subagent_label = payload.get("label", "")
    key = _session_key(session_id, task_id)

    with _STATE_LOCK:
        state = _TRACE_STATE.get(key)
        if not state:
            return

        started_at = payload.get("started_at", time.time())
        if _use_otel_format():
            chunk = build_subagent_span(
                session_id=session_id,
                label=subagent_label,
                started_at=started_at,
            )
        else:
            chunk = {
                "type": "chunk",
                "kind": "subagent_span",
                "phase": "start",
                "session_id": session_id,
                "subagent_label": subagent_label,
                "task_index": payload.get("task_index"),
                "task_count": payload.get("task_count"),
                "started_at": started_at,
                "input_tokens": payload.get("input_tokens"),
                "output_tokens": payload.get("output_tokens"),
                "api_calls": payload.get("api_calls"),
            }
        _write_jsonl_line(state.file_handle, chunk)

        state.subagent_ids[subagent_label] = {
            "started_at": started_at,
        }
        state.last_updated_at = time.time()

    logger.debug("Subagent %s started for session %s", subagent_label, session_id)


def _subagent_stop(ctx: Any, payload: dict) -> None:
    """Write subagent stop chunk."""
    session_id = payload.get("session_id", "")
    task_id = payload.get("task_id")
    subagent_label = payload.get("label", "")
    key = _session_key(session_id, task_id)

    with _STATE_LOCK:
        state = _TRACE_STATE.get(key)
        if not state:
            return

        span_info = state.subagent_ids.pop(subagent_label, {})
        started_at = span_info.get("started_at", payload.get("started_at"))
        ended_at = payload.get("ended_at", time.time())
        duration_ms = int((ended_at - started_at) * 1000) if started_at else 0

        if _use_otel_format():
            chunk = build_subagent_span(
                session_id=session_id,
                label=subagent_label,
                started_at=started_at,
                ended_at=ended_at,
                duration_ms=duration_ms,
                status=payload.get("status"),
            )
        else:
            chunk = {
                "type": "chunk",
                "kind": "subagent_span",
                "phase": "stop",
                "session_id": session_id,
                "subagent_label": subagent_label,
                "started_at": started_at,
                "ended_at": ended_at,
                "duration_ms": duration_ms,
                "status": payload.get("status"),
                "output_tokens": payload.get("output_tokens"),
                "api_calls": payload.get("api_calls"),
            }
        _write_jsonl_line(state.file_handle, chunk)
        state.last_updated_at = time.time()

    logger.debug("Subagent %s stopped for session %s", subagent_label, session_id)


# ── Plugin Registration ──

def register(ctx: Any) -> None:
    """Register hooks with Hermes plugin system."""
    # Fail-open: if trace dir not writable, hooks are inert
    trace_dir = _ensure_trace_dir()
    if not trace_dir:
        logger.info("run-trace plugin disabled: trace directory not writable")
        return

    # Register hooks
    ctx.register_hook("on_session_start", _on_session_start)
    ctx.register_hook("on_session_end", _on_session_end)
    ctx.register_hook("pre_api_request", _pre_api_request)
    ctx.register_hook("post_api_request", _post_api_request)
    ctx.register_hook("post_tool_call", _post_tool_call)
    ctx.register_hook("subagent_start", _subagent_start)
    ctx.register_hook("subagent_stop", _subagent_stop)

    logger.info("run-trace plugin enabled: writing to %s", trace_dir)