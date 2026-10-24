"""
OTel (OpenTelemetry) span formatter for run-trace plugin.

Aligns JSONL output with OpenTelemetry GenAI semantic conventions,
enabling direct import into Jaeger, Langfuse, Grafana, etc.

@see AgentScope src/agentscope/middleware/_tracing/_attributes.py (SpanAttributes)
@see https://opentelemetry.io/docs/specs/semconv/gen-ai/
"""
from __future__ import annotations

import json
import time
from typing import Any, Dict, Optional


# ── OTel Span Attributes (对齐 AgentScope SpanAttributes enum) ──

class SpanAttributes:
    """GenAI semantic convention attribute keys."""

    # Common
    GEN_AI_CONVERSATION_ID = "gen_ai.conversation.id"
    GEN_AI_OPERATION_NAME = "gen_ai.operation.name"
    GEN_AI_PROVIDER_NAME = "gen_ai.provider.name"

    # Request
    GEN_AI_REQUEST_MODEL = "gen_ai.request.model"
    GEN_AI_REQUEST_TEMPERATURE = "gen_ai.request.temperature"
    GEN_AI_REQUEST_TOP_P = "gen_ai.request.top_p"
    GEN_AI_REQUEST_MAX_TOKENS = "gen_ai.request.max_tokens"

    # Response
    GEN_AI_RESPONSE_ID = "gen_ai.response.id"
    GEN_AI_RESPONSE_FINISH_REASONS = "gen_ai.response.finish_reasons"

    # Usage
    GEN_AI_USAGE_INPUT_TOKENS = "gen_ai.usage.input_tokens"
    GEN_AI_USAGE_OUTPUT_TOKENS = "gen_ai.usage.output_tokens"

    # Tool
    GEN_AI_TOOL_CALL_ID = "gen_ai.tool_call.id"
    GEN_AI_TOOL_NAME = "gen_ai.tool.name"
    GEN_AI_TOOL_CALL_ARGUMENTS = "gen_ai.tool_call.arguments"
    GEN_AI_TOOL_CALL_RESULT = "gen_ai.tool_call.result"

    # AgentScope custom (our extensions)
    AGENTSCOPE_REPLY_ID = "agentscope.agent.reply_id"
    AGENTSCOPE_SESSION_ID = "agentscope.session.id"
    AGENTSCOPE_TASK_ID = "agentscope.task.id"


class OperationName:
    CHAT = "chat"
    INVOKE_AGENT = "invoke_agent"
    EXECUTE_TOOL = "execute_tool"


class SpanKind:
    INTERNAL = "INTERNAL"
    CLIENT = "CLIENT"
    SERVER = "SERVER"


class StatusCode:
    OK = "OK"
    ERROR = "ERROR"
    UNSET = "UNSET"


# ── Span builders ──

def _us(ms: float) -> int:
    """Convert milliseconds to microseconds (OTel convention)."""
    return int(ms * 1000)


def _status(code: str, message: Optional[str] = None) -> Dict[str, Any]:
    s: Dict[str, Any] = {"code": code}
    if message:
        s["message"] = message
    return s


def build_session_span(session_id: str, task_id: Optional[str], started_at: float, model: Optional[str] = None, provider: Optional[str] = None) -> Dict[str, Any]:
    """Build the root trace span for a session (header)."""
    attrs = {
        SpanAttributes.GEN_AI_OPERATION_NAME: OperationName.INVOKE_AGENT,
        SpanAttributes.AGENTSCOPE_SESSION_ID: session_id,
    }
    if task_id:
        attrs[SpanAttributes.AGENTSCOPE_TASK_ID] = task_id
    if model:
        attrs[SpanAttributes.GEN_AI_REQUEST_MODEL] = model
    if provider:
        attrs[SpanAttributes.GEN_AI_PROVIDER_NAME] = provider
    return {
        "traceId": session_id,
        "spanId": f"session-{session_id}",
        "parentSpanId": None,
        "name": f"agent session {session_id}",
        "kind": SpanKind.SERVER,
        "startTime": _us(started_at),
        "attributes": attrs,
        "status": _status(StatusCode.UNSET),
        "otelFormat": True,
    }


def build_llm_span(
    session_id: str,
    api_request_id: str,
    model: Optional[str],
    provider: Optional[str],
    started_at: float,
    ended_at: Optional[float] = None,
    duration_ms: Optional[float] = None,
    usage: Optional[Dict] = None,
    finish_reason: Optional[str] = None,
    parent_span_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Build an LLM call span (chunk: llm_span)."""
    attrs = {
        SpanAttributes.GEN_AI_OPERATION_NAME: OperationName.CHAT,
        SpanAttributes.GEN_AI_CONVERSATION_ID: session_id,
    }
    if model:
        attrs[SpanAttributes.GEN_AI_REQUEST_MODEL] = model
    if provider:
        attrs[SpanAttributes.GEN_AI_PROVIDER_NAME] = provider
    if usage:
        attrs[SpanAttributes.GEN_AI_USAGE_INPUT_TOKENS] = usage.get("input_tokens", 0)
        attrs[SpanAttributes.GEN_AI_USAGE_OUTPUT_TOKENS] = usage.get("output_tokens", 0)
    if finish_reason:
        attrs[SpanAttributes.GEN_AI_RESPONSE_FINISH_REASONS] = [finish_reason]

    end_time = _us(ended_at) if ended_at else None
    span: Dict[str, Any] = {
        "traceId": session_id,
        "spanId": api_request_id,
        "parentSpanId": parent_span_id or f"session-{session_id}",
        "name": f"chat {model or 'llm'}",
        "kind": SpanKind.CLIENT,
        "startTime": _us(started_at),
        "attributes": attrs,
        "status": _status(StatusCode.UNSET),
        "otelFormat": True,
    }
    if end_time:
        span["endTime"] = end_time
        if duration_ms is not None:
            span["durationMs"] = int(duration_ms)
        span["status"] = _status(StatusCode.OK if finish_reason != "error" else StatusCode.ERROR)
    return span


def build_tool_span(
    session_id: str,
    tool_call_id: str,
    tool_name: Optional[str],
    args: Any = None,
    result: Any = None,
    duration_ms: Optional[float] = None,
    status: Optional[str] = None,
    error_message: Optional[str] = None,
    started_at: Optional[float] = None,
    parent_span_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Build a tool execution span (chunk: tool_span)."""
    attrs = {
        SpanAttributes.GEN_AI_OPERATION_NAME: OperationName.EXECUTE_TOOL,
        SpanAttributes.GEN_AI_CONVERSATION_ID: session_id,
    }
    if tool_name:
        attrs[SpanAttributes.GEN_AI_TOOL_NAME] = tool_name
    if tool_call_id:
        attrs[SpanAttributes.GEN_AI_TOOL_CALL_ID] = tool_call_id
    if args is not None:
        attrs[SpanAttributes.GEN_AI_TOOL_CALL_ARGUMENTS] = _truncate(str(args), 1000)
    if result is not None:
        attrs[SpanAttributes.GEN_AI_TOOL_CALL_RESULT] = _truncate(str(result), 1000)

    span: Dict[str, Any] = {
        "traceId": session_id,
        "spanId": tool_call_id,
        "parentSpanId": parent_span_id or f"session-{session_id}",
        "name": f"execute_tool {tool_name or 'unknown'}",
        "kind": SpanKind.INTERNAL,
        "startTime": _us(started_at or time.time()),
        "attributes": attrs,
        "status": _status(StatusCode.UNSET),
        "otelFormat": True,
    }
    if duration_ms is not None:
        span["endTime"] = span["startTime"] + int(duration_ms * 1000)
        span["durationMs"] = int(duration_ms)
    if status == "error":
        span["status"] = _status(StatusCode.ERROR, error_message or "tool failed")
    elif status == "ok":
        span["status"] = _status(StatusCode.OK)
    return span


def build_subagent_span(
    session_id: str,
    label: str,
    started_at: float,
    ended_at: Optional[float] = None,
    duration_ms: Optional[float] = None,
    status: Optional[str] = None,
    parent_span_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Build a subagent span (chunk: subagent_span)."""
    span_id = f"subagent-{label}-{int(started_at * 1000)}"
    span: Dict[str, Any] = {
        "traceId": session_id,
        "spanId": span_id,
        "parentSpanId": parent_span_id or f"session-{session_id}",
        "name": f"subagent {label}",
        "kind": SpanKind.INTERNAL,
        "startTime": _us(started_at),
        "attributes": {
            SpanAttributes.GEN_AI_OPERATION_NAME: OperationName.INVOKE_AGENT,
            SpanAttributes.GEN_AI_CONVERSATION_ID: session_id,
            "agentscope.subagent.label": label,
        },
        "status": _status(StatusCode.UNSET),
        "otelFormat": True,
    }
    if ended_at:
        span["endTime"] = _us(ended_at)
    if duration_ms is not None:
        span["durationMs"] = int(duration_ms)
    if status == "error":
        span["status"] = _status(StatusCode.ERROR)
    elif status == "ok":
        span["status"] = _status(StatusCode.OK)
    return span


def build_trailer_span(session_id: str, ended_at: float, duration_ms: int, outcome: Optional[str] = None, error: Optional[str] = None) -> Dict[str, Any]:
    """Build the trailer span marking session end."""
    return {
        "traceId": session_id,
        "spanId": f"session-{session_id}",
        "name": f"agent session {session_id} (end)",
        "kind": SpanKind.SERVER,
        "startTime": _us(ended_at),
        "endTime": _us(ended_at),
        "durationMs": duration_ms,
        "attributes": {
            SpanAttributes.GEN_AI_OPERATION_NAME: OperationName.INVOKE_AGENT,
            SpanAttributes.AGENTSCOPE_SESSION_ID: session_id,
            "agentscope.session.outcome": outcome or "unknown",
        },
        "status": _status(StatusCode.ERROR if error else StatusCode.OK, error),
        "otelFormat": True,
        "isTrailer": True,
    }


def _truncate(s: str, max_len: int = 1000) -> str:
    return s[:max_len] + "..." if len(s) > max_len else s
