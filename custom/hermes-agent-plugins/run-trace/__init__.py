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

# ── 2026-10-17 调用约定修复（run20 复盘 A7 数据面）──
# 核心 invoke_hook 按 **kwargs 展开调用回调（plugins_dispatch._hook_callback_kwargs：
# 窄签名按形参名切片）；旧签名 (ctx, payload) 切片恒空 dict → callback() TypeError →
# fail-open 静默吞 = 631 份轨迹全空壳零 span 的根因（探针插件实证：KW 版被调、
# (ctx,payload) 版零调用）。本文件全部回调改为 kwargs 形参 + 重组 payload dict，
# 函数体零改动（payload.get 全部照旧）。


# Default trace directory
_DEFAULT_TRACE_DIR = Path.home() / ".hermes" / "traces"

# Thread-safe state
_STATE_LOCK = threading.Lock()
_SESSION_FILES: Dict[str, Any] = {}  # session_id -> file handle
_TRACE_STATE: Dict[str, TraceSession] = {}
# session_id -> state key（api/tool 钩子的 task_id 与 session_start 时不一致的场景：
# header 记 task_id=null 而 effective_task_id 已定，精确键查不到会把 span 全丢——
# 627 份线上轨迹全空壳的根因。按 session_id 兜底定位同一会话。）
_SESSION_KEY_INDEX: Dict[str, str] = {}
_MAX_STATE_ENTRIES = 256


@dataclass
class TraceSession:
    """Per-session trace state."""
    session_id: str
    file_path: Path
    task_id: Optional[str] = None
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


def _lookup_state(session_id: str, task_id: Optional[str]) -> Optional["TraceSession"]:
    """按精确键查会话态；查不到按 session_id 兜底（api/tool 钩子的 task_id 与
    session_start 时不同是常态——header 常记 null 而 effective_task_id 已定，
    精确键 miss 会把 span 全部静默丢弃）。"""
    state = _TRACE_STATE.get(_session_key(session_id, task_id))
    if state:
        return state
    key = _SESSION_KEY_INDEX.get(session_id)
    if key:
        return _TRACE_STATE.get(key)
    return None


# ── Hook Handlers ──

def _on_session_start(collab_event_id: Any = None, model: Any = None, provider: Any = None, session_id: Any = None, source: Any = None, started_at: Any = None, task_id: Any = None, **_kw: Any) -> None:
    payload: dict = dict(_kw)
    payload.update({'collab_event_id': collab_event_id, 'model': model, 'provider': provider, 'session_id': session_id, 'source': source, 'started_at': started_at, 'task_id': task_id})
    payload = {k: v for k, v in payload.items() if v is not None or k in _kw}
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
                collab_event_id=payload.get("collab_event_id"),
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
        _SESSION_KEY_INDEX[session_id] = key
        _SESSION_FILES[session_id] = file_handle

    logger.debug("Started trace session %s", session_id)


def _on_session_end(ended_at: Any = None, error: Any = None, outcome: Any = None, session_id: Any = None, summary: Any = None, task_id: Any = None, **_kw: Any) -> None:
    payload: dict = dict(_kw)
    payload.update({'ended_at': ended_at, 'error': error, 'outcome': outcome, 'session_id': session_id, 'summary': summary, 'task_id': task_id})
    payload = {k: v for k, v in payload.items() if v is not None or k in _kw}
    """Write trailer, close file."""
    session_id = payload.get("session_id", "")
    task_id = payload.get("task_id")

    with _STATE_LOCK:
        # end 钩子的 task_id 与 start 时不一致是常态（header 常记 null 而
        # effective_task_id 已定）——精确键 pop 落空会连带跳过 trailer 落盘、
        # 句柄关闭与索引清理（与 api/tool 钩子同型的键错配，_lookup_state 兜底）。
        exact_key = _session_key(session_id, task_id)
        key = exact_key if _TRACE_STATE.get(exact_key) else _SESSION_KEY_INDEX.get(session_id)
        state = _TRACE_STATE.pop(key, None) if key else None
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
        if _SESSION_KEY_INDEX.get(session_id) == key:
            _SESSION_KEY_INDEX.pop(session_id, None)

    logger.debug("Ended trace session %s", session_id)


def _pre_api_request(api_call_count: Any = None, api_request_id: Any = None, collab_event_id: Any = None, model: Any = None, provider: Any = None, request_messages: Any = None, session_id: Any = None, started_at: Any = None, task_id: Any = None, turn_id: Any = None, **_kw: Any) -> None:
    payload: dict = dict(_kw)
    payload.update({'api_call_count': api_call_count, 'api_request_id': api_request_id, 'collab_event_id': collab_event_id, 'model': model, 'provider': provider, 'request_messages': request_messages, 'session_id': session_id, 'started_at': started_at, 'task_id': task_id, 'turn_id': turn_id})
    payload = {k: v for k, v in payload.items() if v is not None or k in _kw}
    """Write LLM span start chunk."""
    session_id = payload.get("session_id", "")
    task_id = payload.get("task_id")
    api_request_id = payload.get("api_request_id", "")
    key = _session_key(session_id, task_id)

    with _STATE_LOCK:
        state = _lookup_state(session_id, task_id)
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
                collab_event_id=payload.get("collab_event_id"),
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


def _post_api_request(api_duration: Any = None, api_request_id: Any = None, collab_event_id: Any = None, ended_at: Any = None, finish_reason: Any = None, first_chunk_at: Any = None, model: Any = None, provider: Any = None, response: Any = None, session_id: Any = None, started_at: Any = None, task_id: Any = None, turn_id: Any = None, usage: Any = None, **_kw: Any) -> None:
    payload: dict = dict(_kw)
    payload.update({'api_duration': api_duration, 'api_request_id': api_request_id, 'collab_event_id': collab_event_id, 'ended_at': ended_at, 'finish_reason': finish_reason, 'first_chunk_at': first_chunk_at, 'model': model, 'provider': provider, 'response': response, 'session_id': session_id, 'started_at': started_at, 'task_id': task_id, 'turn_id': turn_id, 'usage': usage})
    payload = {k: v for k, v in payload.items() if v is not None or k in _kw}
    """Write LLM span end chunk with usage."""
    session_id = payload.get("session_id", "")
    task_id = payload.get("task_id")
    api_request_id = payload.get("api_request_id", "")
    key = _session_key(session_id, task_id)

    with _STATE_LOCK:
        state = _lookup_state(session_id, task_id)
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
                collab_event_id=payload.get("collab_event_id"),
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
            # TTFT：上游 0.21.7 post_api_request 已携带 first_chunk_at（epoch s，
            # 非流式/无分片为 None）——TTFB=first_chunk_at-started_at，落双字段名
            # 兼容消费面（eval 门禁读 first_token_ms）。
            first_chunk_at = payload.get("first_chunk_at")
            try:
                if first_chunk_at is not None and started_at:
                    _ttft_ms = int(round((float(first_chunk_at) - float(started_at)) * 1000))
                    if _ttft_ms >= 0:
                        chunk["first_token_ms"] = _ttft_ms
                        chunk["ttft_ms"] = _ttft_ms
            except (TypeError, ValueError):
                pass
            # Truncate large response previews
            if chunk["response_preview"] and isinstance(chunk["response_preview"], str):
                if len(chunk["response_preview"]) > 500:
                    chunk["response_preview"] = chunk["response_preview"][:500] + "..."

        _write_jsonl_line(state.file_handle, chunk)
        state.last_updated_at = time.time()

    logger.debug("Post API request %s for session %s", api_request_id, session_id)


def _post_tool_call(api_request_id: Any = None, args: Any = None, collab_event_id: Any = None, duration_ms: Any = None, error_message: Any = None, error_type: Any = None, result: Any = None, session_id: Any = None, status: Any = None, task_id: Any = None, tool_call_id: Any = None, tool_name: Any = None, ts: Any = None, turn_id: Any = None, **_kw: Any) -> None:
    payload: dict = dict(_kw)
    payload.update({'api_request_id': api_request_id, 'args': args, 'collab_event_id': collab_event_id, 'duration_ms': duration_ms, 'error_message': error_message, 'error_type': error_type, 'result': result, 'session_id': session_id, 'status': status, 'task_id': task_id, 'tool_call_id': tool_call_id, 'tool_name': tool_name, 'ts': ts, 'turn_id': turn_id})
    payload = {k: v for k, v in payload.items() if v is not None or k in _kw}
    """Write tool chunk with duration, args, result."""
    session_id = payload.get("session_id", "")
    task_id = payload.get("task_id")
    tool_call_id = payload.get("tool_call_id", "")
    key = _session_key(session_id, task_id)

    with _STATE_LOCK:
        state = _lookup_state(session_id, task_id)
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
                collab_event_id=payload.get("collab_event_id"),
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


def _subagent_start(api_calls: Any = None, collab_event_id: Any = None, input_tokens: Any = None, label: Any = None, output_tokens: Any = None, session_id: Any = None, started_at: Any = None, task_count: Any = None, task_id: Any = None, task_index: Any = None, **_kw: Any) -> None:
    payload: dict = dict(_kw)
    payload.update({'api_calls': api_calls, 'collab_event_id': collab_event_id, 'input_tokens': input_tokens, 'label': label, 'output_tokens': output_tokens, 'session_id': session_id, 'started_at': started_at, 'task_count': task_count, 'task_id': task_id, 'task_index': task_index})
    payload = {k: v for k, v in payload.items() if v is not None or k in _kw}
    """Write subagent start chunk."""
    session_id = payload.get("session_id", "")
    task_id = payload.get("task_id")
    subagent_label = payload.get("label", "")
    key = _session_key(session_id, task_id)

    with _STATE_LOCK:
        state = _lookup_state(session_id, task_id)
        if not state:
            return

        started_at = payload.get("started_at", time.time())
        if _use_otel_format():
            chunk = build_subagent_span(
                session_id=session_id,
                label=subagent_label,
                started_at=started_at,
                collab_event_id=payload.get("collab_event_id"),
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


def _subagent_stop(api_calls: Any = None, collab_event_id: Any = None, ended_at: Any = None, label: Any = None, output_tokens: Any = None, session_id: Any = None, started_at: Any = None, status: Any = None, task_id: Any = None, **_kw: Any) -> None:
    payload: dict = dict(_kw)
    payload.update({'api_calls': api_calls, 'collab_event_id': collab_event_id, 'ended_at': ended_at, 'label': label, 'output_tokens': output_tokens, 'session_id': session_id, 'started_at': started_at, 'status': status, 'task_id': task_id})
    payload = {k: v for k, v in payload.items() if v is not None or k in _kw}
    """Write subagent stop chunk."""
    session_id = payload.get("session_id", "")
    task_id = payload.get("task_id")
    subagent_label = payload.get("label", "")
    key = _session_key(session_id, task_id)

    with _STATE_LOCK:
        state = _lookup_state(session_id, task_id)
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
                collab_event_id=payload.get("collab_event_id"),
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