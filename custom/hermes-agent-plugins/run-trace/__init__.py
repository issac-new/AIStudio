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

import hashlib
import json
import logging
import os
import re
import threading
import time
import uuid
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

# ── 2026-11-12 ai-agent-handbook 吸收：执行语义与证据链（schema 1.2）──
# 只增不改：旧消费面继续读 kind/phase；新消费面读 span_kind/span_phase。
# 词表取自手册第 13 章 13 节点执行语义；本运行时没有独立 RETRIEVAL/MEMORY/GUARDRAIL
# 火点，缺失即不产出，不用别的 span 冒充。
SCHEMA_VERSION = "1.2.0"
SPAN_KINDS = frozenset({
    "entry", "step", "llm", "tool", "retrieval", "memory",
    "guardrail", "compaction", "hitl", "interrupt", "context",
})

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
    # 2026-11-12：trace/attempt/span 序号（schema 1.2 的关联锚点）。
    trace_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    attempt: int = 0
    span_seq: int = 0
    step_seq: int = 0
    api_request_ids: Dict[str, dict] = field(default_factory=dict)  # api_request_id -> span info
    tool_call_ids: Dict[str, dict] = field(default_factory=dict)  # tool_call_id -> span info
    subagent_ids: Dict[str, dict] = field(default_factory=dict)  # subagent label -> span info
    pending_steps: Dict[str, dict] = field(default_factory=dict)  # turn_id -> step span info
    pending_hitl: Dict[str, dict] = field(default_factory=dict)  # request_id -> hitl span info
    last_updated_at: float = field(default_factory=time.time)
    # 三层保留决策用的会话内累计（2026-10-19 观测层轮）：
    # had_error=任一路径出错（api_request_error/tool error/trailer error）→ 第一层全量保留；
    # total_tokens=post span usage input+output 累计 → 第三层高成本尾部保留阈值判定。
    had_error: bool = False
    total_tokens: int = 0


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
    """Write a single JSONL line. 每行统一补 profile 身份（2026-10-24 清账批 D14，
    byProfile token 分桶的数据面；显式已带字段不覆盖）。"""
    if _PROFILE:
        data.setdefault("profile", _PROFILE)
    try:
        line = json.dumps(data, ensure_ascii=False) + "\n"
        file_handle.write(line)
        file_handle.flush()
    except Exception as exc:
        logger.warning("Failed to write JSONL line: %s", exc)


def _sha256_text(value: Any) -> Optional[str]:
    """稳定哈希：str 原样；容器按 sort_keys JSON；不可序列化退回 str。"""
    if value is None:
        return None
    if not isinstance(value, (str, bytes)):
        try:
            value = json.dumps(value, sort_keys=True, ensure_ascii=False, default=str)
        except Exception:
            value = str(value)
    if isinstance(value, str):
        value = value.encode("utf-8", "replace")
    return hashlib.sha256(value).hexdigest()


def _approx_tokens(value: Any) -> Optional[int]:
    """粗估 token：仅用于 manifest 计量，不冒充 provider usage。"""
    if value is None:
        return None
    if not isinstance(value, str):
        try:
            value = json.dumps(value, ensure_ascii=False, default=str)
        except Exception:
            value = str(value)
    return max(1, len(value) // 4) if value else 0


def _llm_attempt_id(api_request_id: str, retry_count: Any) -> str:
    """物理尝试 id：api_request_id 是逻辑调用，retry_count 区分重试。"""
    try:
        retry = int(retry_count or 0)
    except (TypeError, ValueError):
        retry = 0
    return f"{api_request_id or 'llm'}:r{retry}"


def _enrich_span(
    chunk: dict,
    state: "TraceSession",
    span_kind: str,
    span_phase: str,
    *,
    task_id: Optional[str] = None,
    turn_id: Optional[str] = None,
    status: Optional[str] = None,
    started_at: Optional[float] = None,
    ended_at: Optional[float] = None,
    attempt_id: Optional[str] = None,
) -> dict:
    """补齐 schema 1.2 必填关联字段（单点，不改旧字段语义）。"""
    chunk.setdefault("schema_version", SCHEMA_VERSION)
    chunk.setdefault("span_kind", span_kind)
    chunk.setdefault("span_phase", span_phase)
    chunk.setdefault("trace_id", state.trace_id)
    chunk.setdefault("session_id", state.session_id)
    if task_id is not None:
        chunk["task_id"] = task_id
    elif "task_id" not in chunk:
        chunk["task_id"] = state.task_id
    if turn_id is not None:
        chunk["turn_id"] = turn_id
    chunk.setdefault("attempt_id", attempt_id or f"{state.trace_id}:a{state.attempt}")
    chunk.setdefault("status", status or ("started" if span_phase in ("pre", "start", "request") else "ok"))
    if started_at is not None and chunk.get("started_at") is None:
        chunk["started_at"] = started_at
    if ended_at is not None:
        chunk["ended_at"] = ended_at
    chunk.setdefault("span_seq", state.span_seq)
    state.span_seq += 1
    return chunk


def _build_context_manifest(
    payload: dict,
    state: "TraceSession",
    *,
    session_id: str,
    task_id: Optional[str],
    turn_id: Optional[str],
    api_request_id: str,
) -> dict:
    """Context Manifest：记录模型这次实际看见的来源、版本、规模与指纹。

    只存哈希与计量，不复制正文（正文已在 request_messages 中）。所有字段来自
    pre_api_request 的真实载荷，缺什么就缺什么，不用默认值冒充。
    """
    system_prompt = payload.get("system_prompt")
    messages = payload.get("request_messages")
    request = payload.get("request") if isinstance(payload.get("request"), dict) else {}
    tools = request.get("tools") if isinstance(request, dict) else None
    model = payload.get("model")
    provider = payload.get("provider")
    permission_mode = _env("HERMES_RUN_TRACE_PERMISSION_MODE") or None
    trust_level = _env("HERMES_RUN_TRACE_CONTEXT_TRUST") or "runtime"

    sources = []

    def add(source_type: str, value: Any, scope: str, token_count: Optional[int], reason: str) -> None:
        digest = _sha256_text(value)
        if digest is None:
            return
        sources.append({
            "source_type": source_type,
            "scope": scope,
            "content_hash": f"sha256:{digest}",
            "token_count": token_count,
            "trust_level": trust_level,
            "permission_basis": permission_mode,
            "selected_reason": reason,
        })

    add("system_prompt", system_prompt, "session", _approx_tokens(system_prompt), "system_prompt_parts")
    add("conversation", messages, "session",
        payload.get("approx_input_tokens") or _approx_tokens(messages), "request_messages")
    add("tools", tools, "session", None, "tool_definitions")

    fingerprint = _sha256_text({
        "model": model,
        "provider": provider,
        "system_prompt": _sha256_text(system_prompt),
        "messages": _sha256_text(messages),
        "tools": _sha256_text(tools),
    })
    manifest = {
        "type": "chunk",
        "kind": "context_manifest",
        "span_kind": "context",
        "span_phase": "snapshot",
        "schema_version": SCHEMA_VERSION,
        "manifest_version": "1.0",
        "trace_id": state.trace_id,
        "session_id": session_id,
        "task_id": task_id if task_id is not None else state.task_id,
        "turn_id": turn_id,
        "api_request_id": api_request_id,
        "attempt_id": _llm_attempt_id(api_request_id, payload.get("retry_count")),
        "model": model,
        "provider": provider,
        "message_count": payload.get("message_count"),
        "tool_count": payload.get("tool_count"),
        "approx_input_tokens": payload.get("approx_input_tokens"),
        "request_char_count": payload.get("request_char_count"),
        "sources": sources,
        "context_fingerprint": f"sha256:{fingerprint}" if fingerprint else None,
        "generated_at": time.time(),
        "span_seq": state.span_seq,
    }
    state.span_seq += 1
    return manifest


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

# reasoning/thinking 标签集（与上游 turn_response_intake._RELAY_THINKING 同款：
# REASONING_SCRATCHPAD / think / reasoning）。文章③「reasoning 与主回答分开记录」。
_REASONING_BLOCK_RE = re.compile(
    r"<(?:REASONING_SCRATCHPAD|think|reasoning)>(.*?)</(?:REASONING_SCRATCHPAD|think|reasoning)>",
    re.DOTALL | re.IGNORECASE,
)
_REASONING_TAG_RE = re.compile(r"</?(?:REASONING_SCRATCHPAD|think|reasoning)>", re.IGNORECASE)


def _env_int(name: str, default: int) -> int:
    raw = _env(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    raw = _env(name)
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _sample_rate() -> float:
    """头部采样率（第二层）。默认 1.0=全留，不破坏既有消费面。"""
    return min(1.0, max(0.0, _env_float("HERMES_RUN_TRACE_SAMPLE_RATE", 1.0)))


def _tail_tokens() -> int:
    """尾部保留 token 阈值（第三层）。默认 0=禁用。"""
    return max(0, _env_int("HERMES_RUN_TRACE_TAIL_TOKENS", 0))


def _reasoning_max_chars() -> int:
    return max(200, _env_int("HERMES_RUN_TRACE_REASONING_CHARS", 2000))


def _correlation_fields() -> Dict[str, Optional[str]]:
    """横贯关联字段（文章⑤）：user/prompt 模板版本由部署侧 env 注入，缺省 None 不猜。"""
    return {
        "user_id": _env("HERMES_RUN_TRACE_USER_ID") or None,
        "prompt_template": _env("HERMES_RUN_TRACE_PROMPT_TEMPLATE") or None,
        "prompt_version": _env("HERMES_RUN_TRACE_PROMPT_VERSION") or None,
        "profile": _detect_profile(),
    }


def _detect_profile() -> Optional[str]:
    """profile 身份（2026-10-24 清账批 D14）：显式 env 优先；否则 HERMES_HOME 基名
    （插件按 profile home 部署是既有事实——mx-enable-run-trace.sh）；根 home 归
    'root'。推不出=None（存量进程无 home 语境时如实缺省，不猜）。"""
    explicit = _env("HERMES_RUN_TRACE_PROFILE")
    if explicit:
        return explicit
    home = _env("HERMES_HOME")
    if home:
        base = home.rstrip("/").rsplit("/", 1)[-1]
        if base:
            return "root" if base in (".hermes", "hermes") else base
    return None


_PROFILE = _detect_profile()


def _split_reasoning(text: str) -> tuple:
    """(清洗后正文, reasoning 文本或 None)。无标签时 reasoning 为 None。"""
    if not isinstance(text, str) or not text:
        return text, None
    blocks = _REASONING_BLOCK_RE.findall(text)
    if not blocks:
        return text, None
    cleaned = _REASONING_BLOCK_RE.sub("", text)
    cleaned = _REASONING_TAG_RE.sub("", cleaned).strip()
    reasoning = "\n".join(b.strip() for b in blocks if b.strip())
    return cleaned, reasoning or None


def _response_text(response: Any) -> Optional[str]:
    """response 载荷形态归一：dict（上游 sanitize 后）取 assistant_message.content；str 原样。"""
    if isinstance(response, dict):
        msg = response.get("assistant_message")
        if isinstance(msg, dict):
            content = msg.get("content")
            if isinstance(content, str):
                return content
        return json.dumps(response, ensure_ascii=False)[:2000]
    if isinstance(response, str):
        return response
    return None


def _session_sample_bucket(session_id: str) -> float:
    """session_id 稳定哈希 → [0,1) 桶位。sha1 跨进程稳定（Python hash() 加盐不可用）。"""
    digest = hashlib.sha1(session_id.encode("utf-8", "replace")).digest()
    return int.from_bytes(digest[:8], "big") / float(1 << 64)


def _retention_decision(state: "TraceSession", trailer_error: Any) -> Dict[str, Any]:
    """三层混合保留决策（文章「落地指南」采样策略的会话末变体）：

    ① 错误全量：任一路径出错（api 错误/工具 error/trailer error）必留——负例是
       评估与调试最有价值的样本；② 成功会话头部采样：按 session_id 稳定哈希，
       比率 HERMES_RUN_TRACE_SAMPLE_RATE（默认 1.0 全留）；③ 高成本尾部：未命中
       采样但总 token ≥ HERMES_RUN_TRACE_TAIL_TOKENS（默认 0=禁用）仍留。
    """
    rate = _sample_rate()
    tail = _tail_tokens()
    if state.had_error or trailer_error:
        return {"kept": True, "reason": "error-full", "sample_rate": rate,
                "tail_tokens": tail, "total_tokens": state.total_tokens}
    bucket = _session_sample_bucket(state.session_id)
    if bucket < rate:
        return {"kept": True, "reason": "head-sample", "sample_rate": rate,
                "bucket": round(bucket, 6), "total_tokens": state.total_tokens}
    if tail > 0 and state.total_tokens >= tail:
        return {"kept": True, "reason": "tail-cost", "sample_rate": rate,
                "tail_tokens": tail, "bucket": round(bucket, 6),
                "total_tokens": state.total_tokens}
    return {"kept": False, "reason": "sampled-out", "sample_rate": rate,
            "bucket": round(bucket, 6), "total_tokens": state.total_tokens}


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
        corr = _correlation_fields()
        trace_id = uuid.uuid4().hex
        if _use_otel_format():
            header = build_session_span(
                session_id=session_id,
                task_id=task_id,
                started_at=started_at,
                model=payload.get("model"),
                provider=payload.get("provider"),
                collab_event_id=payload.get("collab_event_id"),
                correlation=corr,
            )
        else:
            header = {
                "type": "header",
                "version": "1.2.0",
                "schema_version": SCHEMA_VERSION,
                "trace_id": trace_id,
                "attempt": 0,
                "session_id": session_id,
                "task_id": task_id,
                "started_at": started_at,
                "model": payload.get("model"),
                "provider": payload.get("provider"),
                "source": payload.get("source", "hermes-agent"),
                **corr,
            }
        _write_jsonl_line(file_handle, header)

        # Store state
        state = TraceSession(
            session_id=session_id,
            task_id=task_id,
            file_path=file_path,
            file_handle=file_handle,
            started_at=started_at,
            trace_id=trace_id,
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
        # 三层混合保留决策（2026-10-19 观测层轮）：先算决策写进 trailer，未保留再删文件。
        decision = _retention_decision(state, payload.get("error"))
        if _use_otel_format():
            trailer = build_trailer_span(
                session_id=session_id,
                ended_at=ended_at,
                duration_ms=duration_ms,
                outcome=payload.get("outcome"),
                error=payload.get("error"),
                sampling=decision,
            )
        else:
            trailer = {
                "type": "trailer",
                "schema_version": SCHEMA_VERSION,
                "trace_id": state.trace_id,
                "session_id": session_id,
                "ended_at": ended_at,
                "duration_ms": duration_ms,
                "outcome": payload.get("outcome"),
                "error": payload.get("error"),
                "summary": payload.get("summary"),
                "sampling": decision,
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

        # 未命中保留的会话删文件（决策已写进 trailer 随行留痕，删除前已 flush/close）。
        if not decision["kept"]:
            try:
                state.file_path.unlink(missing_ok=True)
            except Exception as exc:
                logger.warning("Failed to discard sampled-out trace %s: %s", state.file_path, exc)

    logger.debug("Ended trace session %s", session_id)


def _pre_api_request(api_call_count: Any = None, api_request_id: Any = None, collab_event_id: Any = None, model: Any = None, provider: Any = None, request_messages: Any = None, session_id: Any = None, started_at: Any = None, task_id: Any = None, turn_id: Any = None, retry_count: Any = None, system_prompt: Any = None, message_count: Any = None, tool_count: Any = None, approx_input_tokens: Any = None, request_char_count: Any = None, request: Any = None, **_kw: Any) -> None:
    payload: dict = dict(_kw)
    payload.update({'api_call_count': api_call_count, 'api_request_id': api_request_id, 'collab_event_id': collab_event_id, 'model': model, 'provider': provider, 'request_messages': request_messages, 'session_id': session_id, 'started_at': started_at, 'task_id': task_id, 'turn_id': turn_id, 'retry_count': retry_count, 'system_prompt': system_prompt, 'message_count': message_count, 'tool_count': tool_count, 'approx_input_tokens': approx_input_tokens, 'request_char_count': request_char_count, 'request': request})
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
                "call_id": api_request_id,
                "turn_id": payload.get("turn_id"),
                "model": payload.get("model"),
                "provider": payload.get("provider"),
                "started_at": started_at,
                "api_call_count": payload.get("api_call_count"),
                "request_messages": payload.get("request_messages"),
            }
            _enrich_span(
                chunk, state, "llm", "pre",
                task_id=payload.get("task_id"), turn_id=payload.get("turn_id"),
                status="running", started_at=started_at,
                attempt_id=_llm_attempt_id(api_request_id, payload.get("retry_count")),
            )
        _write_jsonl_line(state.file_handle, chunk)

        # Context Manifest：与 LLM span 同请求落盘，回答「模型这次看见了什么」。
        if not _use_otel_format():
            manifest = _build_context_manifest(
                payload, state,
                session_id=session_id, task_id=payload.get("task_id"),
                turn_id=payload.get("turn_id"), api_request_id=api_request_id,
            )
            _write_jsonl_line(state.file_handle, manifest)

        # Track span for post handler
        state.api_request_ids[api_request_id] = {
            "started_at": started_at,
            "model": payload.get("model"),
            "attempt_id": _llm_attempt_id(api_request_id, payload.get("retry_count")),
        }
        state.last_updated_at = time.time()

    logger.debug("Pre API request %s for session %s", api_request_id, session_id)


def _post_api_request(api_duration: Any = None, api_request_id: Any = None, collab_event_id: Any = None, ended_at: Any = None, finish_reason: Any = None, first_chunk_at: Any = None, model: Any = None, provider: Any = None, response: Any = None, session_id: Any = None, started_at: Any = None, task_id: Any = None, turn_id: Any = None, usage: Any = None, retry_count: Any = None, **_kw: Any) -> None:
    payload: dict = dict(_kw)
    payload.update({'api_duration': api_duration, 'api_request_id': api_request_id, 'collab_event_id': collab_event_id, 'ended_at': ended_at, 'finish_reason': finish_reason, 'first_chunk_at': first_chunk_at, 'model': model, 'provider': provider, 'response': response, 'session_id': session_id, 'started_at': started_at, 'task_id': task_id, 'turn_id': turn_id, 'usage': usage, 'retry_count': retry_count})
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
            # reasoning 与主回答分离记录（2026-10-19 观测层轮，文章③）：
            # 上游 response 载荷是 dict（assistant_message.content 含 <think> 等标签块），
            # 抽标签块独立落 reasoning_preview，正文清洗后存 response_preview。
            raw_text = _response_text(payload.get("response"))
            cleaned_text, reasoning_text = _split_reasoning(raw_text) if raw_text else (raw_text, None)
            chunk = {
                "type": "chunk",
                "kind": "llm_span",
                "phase": "post",
                "session_id": session_id,
                "api_request_id": api_request_id,
                "call_id": api_request_id,
                "turn_id": payload.get("turn_id"),
                "model": payload.get("model"),
                "provider": payload.get("provider"),
                "started_at": started_at,
                "ended_at": ended_at,
                "duration_ms": duration_ms,
                "finish_reason": payload.get("finish_reason"),
                "usage": payload.get("usage"),
                "response_preview": cleaned_text,
                "retry_count": payload.get("retry_count"),
            }
            if reasoning_text:
                _max = _reasoning_max_chars()
                chunk["reasoning_preview"] = (
                    reasoning_text[:_max] + "..." if len(reasoning_text) > _max else reasoning_text
                )
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

            _enrich_span(
                chunk, state, "llm", "post",
                task_id=payload.get("task_id"), turn_id=payload.get("turn_id"),
                status="ok", started_at=started_at, ended_at=ended_at,
                attempt_id=span_info.get("attempt_id") or _llm_attempt_id(api_request_id, payload.get("retry_count")),
            )
        if _use_otel_format():
            # OTel 路径同样补关联字段（其 span schema 独立，只加通用关联键）。
            _enrich_span(
                chunk, state, "llm", "post",
                task_id=payload.get("task_id"), turn_id=payload.get("turn_id"),
                status="ok", started_at=started_at, ended_at=ended_at,
                attempt_id=span_info.get("attempt_id") or _llm_attempt_id(api_request_id, payload.get("retry_count")),
            )
        _write_jsonl_line(state.file_handle, chunk)
        # 第三层尾部保留判定的 token 累计（usage 拆分含 cache/reasoning，全部计入成本体量）。
        usage = payload.get("usage")
        if isinstance(usage, dict):
            for k in ("input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens", "reasoning_tokens"):
                v = usage.get(k)
                if isinstance(v, (int, float)) and v > 0:
                    state.total_tokens += int(v)
        state.last_updated_at = time.time()

    logger.debug("Post API request %s for session %s", api_request_id, session_id)


def _pre_tool_call(api_request_id: Any = None, args: Any = None, conversation_id: Any = None, session_id: Any = None, task_id: Any = None, tool_call_id: Any = None, tool_name: Any = None, turn_id: Any = None, **_kw: Any) -> None:
    payload: dict = dict(_kw)
    payload.update({'api_request_id': api_request_id, 'args': args, 'conversation_id': conversation_id, 'session_id': session_id, 'task_id': task_id, 'tool_call_id': tool_call_id, 'tool_name': tool_name, 'turn_id': turn_id})
    payload = {k: v for k, v in payload.items() if v is not None or k in _kw}
    """Write tool span start（2026-11-12：补「开始」时刻，旧插件只有结束）。"""
    session_id = payload.get("session_id", "")
    task_id = payload.get("task_id")
    tool_call_id = payload.get("tool_call_id", "")
    if not tool_call_id:
        return

    with _STATE_LOCK:
        state = _lookup_state(session_id, task_id)
        if not state:
            return
        started_at = time.time()
        chunk = {
            "type": "chunk",
            "kind": "tool_span",
            "span_kind": "tool",
            "span_phase": "start",
            "session_id": session_id,
            "tool_call_id": tool_call_id,
            "tool_name": payload.get("tool_name"),
            "args": payload.get("args"),
            "turn_id": payload.get("turn_id"),
            "api_request_id": payload.get("api_request_id"),
            "started_at": started_at,
            "status": "running",
            "ts": started_at,
        }
        if chunk["args"] and isinstance(chunk["args"], str) and len(chunk["args"]) > 1000:
            chunk["args"] = chunk["args"][:1000] + "..."
        _enrich_span(
            chunk, state, "tool", "start",
            task_id=task_id, turn_id=payload.get("turn_id"),
            status="running", started_at=started_at,
        )
        _write_jsonl_line(state.file_handle, chunk)
        state.tool_call_ids[tool_call_id] = {"started_at": started_at}
        state.last_updated_at = time.time()

    logger.debug("Tool call %s (%s) started for session %s", tool_call_id, payload.get("tool_name"), session_id)


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

        span_info = state.tool_call_ids.pop(tool_call_id, {})
        started_at = span_info.get("started_at") or payload.get("ts") or time.time()
        ended_at = time.time()
        duration_ms = payload.get("duration_ms")
        if duration_ms is None:
            duration_ms = int((ended_at - started_at) * 1000) if started_at else 0

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
                "ts": payload.get("ts", started_at),
                "started_at": started_at,
                "ended_at": ended_at,
            }
            # Truncate large args/result
            if chunk["args"] and isinstance(chunk["args"], str):
                if len(chunk["args"]) > 1000:
                    chunk["args"] = chunk["args"][:1000] + "..."
            if chunk["result"] and isinstance(chunk["result"], str):
                if len(chunk["result"]) > 1000:
                    chunk["result"] = chunk["result"][:1000] + "..."

            _enrich_span(
                chunk, state, "tool", "end",
                task_id=task_id, turn_id=payload.get("turn_id"),
                status="error" if (payload.get("status") == "error" or payload.get("error_message")) else "ok",
                started_at=started_at, ended_at=ended_at,
            )
        if _use_otel_format():
            _enrich_span(
                chunk, state, "tool", "end",
                task_id=task_id, turn_id=payload.get("turn_id"),
                status="error" if (payload.get("status") == "error" or payload.get("error_message")) else "ok",
                started_at=started_at, ended_at=ended_at,
            )
        _write_jsonl_line(state.file_handle, chunk)
        if payload.get("status") == "error" or payload.get("error_message"):
            state.had_error = True
        state.last_updated_at = time.time()

    logger.debug("Tool call %s (%s) for session %s", tool_call_id, payload.get("tool_name"), session_id)


def _pre_llm_call(conversation_history: Any = None, is_first_turn: Any = None, model: Any = None, platform: Any = None, session_id: Any = None, task_id: Any = None, turn_id: Any = None, user_message: Any = None, **_kw: Any) -> None:
    payload: dict = dict(_kw)
    payload.update({'conversation_history': conversation_history, 'is_first_turn': is_first_turn, 'model': model, 'platform': platform, 'session_id': session_id, 'task_id': task_id, 'turn_id': turn_id, 'user_message': user_message})
    payload = {k: v for k, v in payload.items() if v is not None or k in _kw}
    """Step span start：本运行时 step = 一次模型回合（turn），不是 ReAct 子步。"""
    session_id = payload.get("session_id", "")
    task_id = payload.get("task_id")
    turn_id = payload.get("turn_id")
    with _STATE_LOCK:
        state = _lookup_state(session_id, task_id)
        if not state:
            return
        started_at = time.time()
        state.step_seq += 1
        chunk = {
            "type": "chunk",
            "kind": "step_span",
            "span_kind": "step",
            "span_phase": "start",
            "step_semantics": "model_turn",
            "step_index": state.step_seq,
            "session_id": session_id,
            "task_id": task_id,
            "turn_id": turn_id,
            "model": payload.get("model"),
            "platform": payload.get("platform"),
            "is_first_turn": payload.get("is_first_turn"),
            "history_message_count": len(payload.get("conversation_history") or []),
            "user_message_chars": len(payload.get("user_message") or "") if isinstance(payload.get("user_message"), str) else None,
            "started_at": started_at,
            "status": "running",
        }
        _enrich_span(
            chunk, state, "step", "start",
            task_id=task_id, turn_id=turn_id, status="running", started_at=started_at,
        )
        _write_jsonl_line(state.file_handle, chunk)
        if turn_id:
            state.pending_steps[turn_id] = {"started_at": started_at, "step_index": state.step_seq}
        state.last_updated_at = time.time()


def _post_llm_call(assistant_response: Any = None, conversation_history: Any = None, model: Any = None, platform: Any = None, session_id: Any = None, task_id: Any = None, turn_id: Any = None, **_kw: Any) -> None:
    payload: dict = dict(_kw)
    payload.update({'assistant_response': assistant_response, 'conversation_history': conversation_history, 'model': model, 'platform': platform, 'session_id': session_id, 'task_id': task_id, 'turn_id': turn_id})
    payload = {k: v for k, v in payload.items() if v is not None or k in _kw}
    """Step span end：只记计量，不复制回答正文（正文已在 LLM span 预览）。"""
    session_id = payload.get("session_id", "")
    task_id = payload.get("task_id")
    turn_id = payload.get("turn_id")
    with _STATE_LOCK:
        state = _lookup_state(session_id, task_id)
        if not state:
            return
        span_info = state.pending_steps.pop(turn_id, {}) if turn_id else {}
        started_at = span_info.get("started_at") or time.time()
        ended_at = time.time()
        chunk = {
            "type": "chunk",
            "kind": "step_span",
            "span_kind": "step",
            "span_phase": "end",
            "step_semantics": "model_turn",
            "step_index": span_info.get("step_index"),
            "session_id": session_id,
            "task_id": task_id,
            "turn_id": turn_id,
            "model": payload.get("model"),
            "platform": payload.get("platform"),
            "history_message_count": len(payload.get("conversation_history") or []),
            "response_chars": len(payload.get("assistant_response") or "") if isinstance(payload.get("assistant_response"), str) else None,
            "started_at": started_at,
            "ended_at": ended_at,
            "duration_ms": int((ended_at - started_at) * 1000),
            "status": "ok",
        }
        _enrich_span(
            chunk, state, "step", "end",
            task_id=task_id, turn_id=turn_id, status="ok", started_at=started_at, ended_at=ended_at,
        )
        _write_jsonl_line(state.file_handle, chunk)
        state.last_updated_at = time.time()


def _post_compaction(after_tokens: Any = None, before_tokens: Any = None, kind: Any = None, messages_removed: Any = None, old_session_id: Any = None, reason: Any = None, session_id: Any = None, **_kw: Any) -> None:
    payload: dict = dict(_kw)
    payload.update({'after_tokens': after_tokens, 'before_tokens': before_tokens, 'kind': kind, 'messages_removed': messages_removed, 'old_session_id': old_session_id, 'reason': reason, 'session_id': session_id})
    payload = {k: v for k, v in payload.items() if v is not None or k in _kw}
    """Compaction span：压缩前后 token 与移除条数，供 Context Manifest 与成本归因。"""
    session_id = payload.get("session_id", "")
    with _STATE_LOCK:
        state = _lookup_state(session_id, None)
        if not state:
            return
        now = time.time()
        chunk = {
            "type": "chunk",
            "kind": "compaction_span",
            "span_kind": "compaction",
            "span_phase": "end",
            "session_id": session_id,
            "old_session_id": payload.get("old_session_id") or None,
            "compaction_kind": payload.get("kind"),
            "reason": payload.get("reason"),
            "before_tokens": payload.get("before_tokens"),
            "after_tokens": payload.get("after_tokens"),
            "messages_removed": payload.get("messages_removed"),
            "started_at": now,
            "ended_at": now,
            "status": "ok",
        }
        _enrich_span(chunk, state, "compaction", "end", status="ok", started_at=now, ended_at=now)
        _write_jsonl_line(state.file_handle, chunk)
        state.last_updated_at = now


def _on_human_input_request(kind: Any = None, platform: Any = None, prompt: Any = None, request_id: Any = None, session_id: Any = None, session_key: Any = None, **_kw: Any) -> None:
    payload: dict = dict(_kw)
    payload.update({'kind': kind, 'platform': platform, 'prompt': prompt, 'request_id': request_id, 'session_id': session_id, 'session_key': session_key})
    payload = {k: v for k, v in payload.items() if v is not None or k in _kw}
    """HITL waiting：跨请求恢复的边界标记；不落 prompt 正文，只落计量。"""
    session_id = payload.get("session_id", "")
    request_id = payload.get("request_id", "")
    if not session_id or not request_id:
        return
    with _STATE_LOCK:
        state = _lookup_state(session_id, None)
        if not state:
            return
        now = time.time()
        chunk = {
            "type": "chunk",
            "kind": "hitl_span",
            "span_kind": "hitl",
            "span_phase": "waiting",
            "session_id": session_id,
            "request_id": request_id,
            "hitl_kind": payload.get("kind"),
            "platform": payload.get("platform"),
            "prompt_chars": len(payload.get("prompt") or "") if isinstance(payload.get("prompt"), str) else None,
            "started_at": now,
            "status": "waiting",
            "trace_boundary": "interrupt",
            "linked_trace_id": state.trace_id,
        }
        _enrich_span(chunk, state, "hitl", "waiting", status="waiting", started_at=now)
        _write_jsonl_line(state.file_handle, chunk)
        state.pending_hitl[request_id] = {"started_at": now}
        state.last_updated_at = now


def _on_human_input_resolved(outcome: Any = None, request_id: Any = None, session_id: Any = None, **_kw: Any) -> None:
    payload: dict = dict(_kw)
    payload.update({'outcome': outcome, 'request_id': request_id, 'session_id': session_id})
    payload = {k: v for k, v in payload.items() if v is not None or k in _kw}
    """HITL resolved：同一 request_id 闭合等待窗，并标明恢复关联。"""
    session_id = payload.get("session_id", "")
    request_id = payload.get("request_id", "")
    if not session_id or not request_id:
        return
    with _STATE_LOCK:
        state = _lookup_state(session_id, None)
        if not state:
            return
        span_info = state.pending_hitl.pop(request_id, {})
        started_at = span_info.get("started_at") or time.time()
        ended_at = time.time()
        chunk = {
            "type": "chunk",
            "kind": "hitl_span",
            "span_kind": "hitl",
            "span_phase": "resolved",
            "session_id": session_id,
            "request_id": request_id,
            "outcome": payload.get("outcome"),
            "started_at": started_at,
            "ended_at": ended_at,
            "duration_ms": int((ended_at - started_at) * 1000),
            "status": "ok",
            "trace_boundary": "resume",
            "linked_trace_id": state.trace_id,
        }
        _enrich_span(chunk, state, "hitl", "resolved", status="ok", started_at=started_at, ended_at=ended_at)
        _write_jsonl_line(state.file_handle, chunk)
        state.last_updated_at = ended_at


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


def _on_api_request_error(api_duration: Any = None, api_request_id: Any = None, ended_at: Any = None, error: Any = None, max_retries: Any = None, model: Any = None, provider: Any = None, retry_count: Any = None, retryable: Any = None, session_id: Any = None, started_at: Any = None, status_code: Any = None, task_id: Any = None, turn_id: Any = None, **_kw: Any) -> None:
    payload: dict = dict(_kw)
    payload.update({'api_duration': api_duration, 'api_request_id': api_request_id, 'ended_at': ended_at, 'error': error, 'max_retries': max_retries, 'model': model, 'provider': provider, 'retry_count': retry_count, 'retryable': retryable, 'session_id': session_id, 'started_at': started_at, 'status_code': status_code, 'task_id': task_id, 'turn_id': turn_id})
    payload = {k: v for k, v in payload.items() if v is not None or k in _kw}
    """Write LLM error chunk（2026-10-19 观测层轮）。

    上游失败请求走 api_request_error 钩子（turn_response_intake/api_request_hooks），
    本插件此前未订阅——429 率/错误率指标与第一层「错误全量保留」都依赖此 span。
    """
    session_id = payload.get("session_id", "")
    task_id = payload.get("task_id")
    api_request_id = payload.get("api_request_id", "")

    with _STATE_LOCK:
        state = _lookup_state(session_id, task_id)
        if not state:
            return

        started_at = payload.get("started_at")
        ended_at = payload.get("ended_at", time.time())
        duration_ms = (
            int((ended_at - started_at) * 1000) if started_at
            else int((payload.get("api_duration") or 0) * 1000)
        )
        error = payload.get("error") if isinstance(payload.get("error"), dict) else {}
        chunk = {
            "type": "chunk",
            "kind": "llm_span",
            "phase": "error",
            "session_id": session_id,
            "api_request_id": api_request_id,
            "call_id": api_request_id,
            "turn_id": payload.get("turn_id"),
            "model": payload.get("model"),
            "provider": payload.get("provider"),
            "started_at": started_at,
            "ended_at": ended_at,
            "duration_ms": duration_ms,
            "status": "error",
            "status_code": payload.get("status_code"),
            "retry_count": payload.get("retry_count"),
            "retryable": payload.get("retryable"),
            "error_type": error.get("type"),
            "error_message": (error.get("message") or "")[:500] or None,
        }
        _enrich_span(
            chunk, state, "llm", "error",
            task_id=task_id, turn_id=payload.get("turn_id"),
            status="error", started_at=started_at, ended_at=ended_at,
            attempt_id=_llm_attempt_id(api_request_id, payload.get("retry_count")),
        )
        _write_jsonl_line(state.file_handle, chunk)
        state.had_error = True
        state.last_updated_at = time.time()

    logger.debug("API request error %s for session %s", api_request_id, session_id)


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
    ctx.register_hook("api_request_error", _on_api_request_error)
    ctx.register_hook("pre_tool_call", _pre_tool_call)
    ctx.register_hook("post_tool_call", _post_tool_call)
    ctx.register_hook("pre_llm_call", _pre_llm_call)
    ctx.register_hook("post_llm_call", _post_llm_call)
    ctx.register_hook("post_compaction", _post_compaction)
    ctx.register_hook("on_human_input_request", _on_human_input_request)
    ctx.register_hook("on_human_input_resolved", _on_human_input_resolved)
    ctx.register_hook("subagent_start", _subagent_start)
    ctx.register_hook("subagent_stop", _subagent_stop)

    logger.info("run-trace plugin enabled: writing to %s", trace_dir)