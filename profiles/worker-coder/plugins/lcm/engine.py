"""LCMEngine — Lossless Context Management context-engine plugin for Hermes.

Strategy (deterministic, zero LLM calls):
- Head (system + first turns) and tail (recent work window) are kept verbatim.
- Middle turns are compiled into typed knowledge nodes (decision/constraint/
  fact/artifact) with anchors back to the original messages (stable host
  ``message_uid`` when present, ``(index, role, sha1[:12])`` fallback otherwise).
- Nodes persist as a JSON DAG under the profile cache dir; later compressions
  merge incrementally; manual ``/compress <focus>`` weight-boosts related nodes.
- Guard rails mirror the built-in compressor's anti-loop semantics: cooldown
  after each pass, structural no-op backoff, ineffective-strike circuit breaker.

Losslessness: nodes only *reference* the middle; the session DB keeps every
original message (compaction archives are retained), so full fidelity is one
replay away (``hermes sessions`` / SessionDB.get_messages(include_compacted=True)).
"""

from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

from agent.context_engine import ContextEngine

from .dag import DAGState, format_digest_lines
from .digest import build_digest_message, extract_nodes
from .validators import (
    align_head_end,
    align_tail_start,
    estimate_messages_tokens,
    find_last_user_index,
    validate_message_list,
)

logger = logging.getLogger("lcm")

_STATE_FILENAME = "lcm-dag.json"


class LCMEngine(ContextEngine):
    """ContextEngine implementation: structural node compilation instead of
    lossy summarization. See module docstring."""

    def __init__(self, context_length: int = 0, threshold_percent: Optional[float] = None,
                 protect_first_n: int = 3, protect_last_n: int = 6,
                 state_dir: Optional[str] = None, min_middle_messages: int = 6,
                 min_gain_ratio: float = 0.02, min_gain_tokens: int = 400,
                 cooldown_seconds: float = 45.0, noop_backoff_seconds: float = 60.0,
                 max_ineffective: int = 2) -> None:
        self.context_length = context_length
        if threshold_percent is not None:
            self.threshold_percent = float(threshold_percent)
        self.threshold_tokens = int(self.context_length * self.threshold_percent) if self.context_length else 0
        self.protect_first_n = protect_first_n
        self.protect_last_n = protect_last_n
        # False keeps routine background compaction quiet; warnings/errors and
        # manual /compress still surface (ABC default is True).
        self.emit_automatic_compaction_status = False
        self.min_middle_messages = min_middle_messages
        self.min_gain_ratio = min_gain_ratio
        self.min_gain_tokens = min_gain_tokens
        self._cooldown_seconds = cooldown_seconds
        self._noop_backoff_seconds = noop_backoff_seconds
        self._max_ineffective = max_ineffective

        # Mutable state guarded by _lock (compress may run on pool threads).
        self._lock = threading.RLock()
        self._state = DAGState()
        self._state_path: Optional[str] = None
        self._conversation_key: Optional[str] = None
        self._session_id: Optional[str] = None
        self._noop_backoff_until = 0.0
        self._ineffective_count = 0
        self._last_compress_at = 0.0
        # -1 = "compress just ran, awaiting real usage" (host sentinel #36718 semantics).
        self._awaiting_real_usage = False

    # ------------------------------------------------------------------ name
    @property
    def name(self) -> str:
        return "lcm"

    # -------------------------------------------------------------- lifecycle
    def on_session_start(self, session_id: str, **kwargs: Any) -> None:
        with self._lock:
            self._session_id = session_id
            self._conversation_key = kwargs.get("conversation_id") or session_id
            self._awaiting_real_usage = False
            base = self._default_state_dir(kwargs)
            self._state_path = os.path.join(base, _STATE_FILENAME)
            loaded = DAGState.load(self._state_path)
            self._state = loaded if loaded is not None else DAGState(
                conversation_key=self._conversation_key)
            if self._conversation_key and not self._state.conversation_key:
                self._state.conversation_key = self._conversation_key
            logger.info("LCM session start sid=%s key=%s nodes=%d",
                        session_id, self._conversation_key, len(self._state.nodes))

    def _default_state_dir(self, kwargs: Dict[str, Any]) -> str:
        # <get_hermes_home()>/cache/lcm/<conversation-slug>/. Under a profile run,
        # HERMES_HOME already IS the profile home (~/.hermes/profiles/<name>), so
        # this lands in the profile cache dir as the task spec requires.
        try:
            from hermes_constants import get_hermes_home
            hermes_home = str(get_hermes_home())
        except Exception:
            hermes_home = kwargs.get("hermes_home") or os.environ.get("HERMES_HOME") \
                or os.path.join(os.path.expanduser("~"), ".hermes")
        slug = "".join(c if c.isalnum() or c in "-_." else "_" for c in (self._conversation_key or "default"))[:80]
        return os.path.join(hermes_home, "cache", "lcm", slug or "default")

    def on_session_end(self, session_id: str, messages: List[Dict[str, Any]]) -> None:
        self.save_state(reason="session_end")

    def on_session_reset(self) -> None:
        # /new or /reset: per-session counters reset; durable node DAG survives
        # (it is keyed by conversation, not session — rotation keeps knowledge).
        with self._lock:
            self.last_prompt_tokens = 0
            self.last_completion_tokens = 0
            self.last_total_tokens = 0
            self.compression_count = 0
            self._awaiting_real_usage = False
            self._noop_backoff_until = 0.0
            self._ineffective_count = 0
            self._last_compress_at = 0.0

    def clone_for_agent(self) -> "LCMEngine":
        """Fresh engine sharing the durable on-disk state; copies budget state only.
        (The plugin system holds ONE shared instance; each agent gets its own.)"""
        with self._lock:
            clone = LCMEngine(
                context_length=self.context_length,
                threshold_percent=self.threshold_percent if hasattr(self, "_config_threshold_percent") else self.threshold_percent,
                protect_first_n=self.protect_first_n,
                protect_last_n=self.protect_last_n,
                state_dir=self._state_path and os.path.dirname(self._state_path),
                min_middle_messages=self.min_middle_messages,
                min_gain_ratio=self.min_gain_ratio,
                min_gain_tokens=self.min_gain_tokens,
                cooldown_seconds=self._cooldown_seconds,
                noop_backoff_seconds=self._noop_backoff_seconds,
                max_ineffective=self._max_ineffective,
            )
            clone.last_prompt_tokens = self.last_prompt_tokens
            clone.last_completion_tokens = self.last_completion_tokens
            clone.last_total_tokens = self.last_total_tokens
            clone.threshold_tokens = self.threshold_tokens
            clone.compression_count = self.compression_count
            clone.model_thresholds = getattr(self, "model_thresholds", {})
            # Durable state: same on-disk path; in-memory copy via dict snapshot
            # (deepcopy would trip on the RLock inside DAGState).
            clone._session_id = self._session_id
            clone._conversation_key = self._conversation_key
            clone._state_path = self._state_path
            clone._state = DAGState.from_dict(self._state.to_dict())
            return clone

    # ------------------------------------------------------------------ usage
    def update_from_response(self, usage: Dict[str, Any]) -> None:
        if not isinstance(usage, dict):
            return
        with self._lock:
            self.last_prompt_tokens = int(usage.get("prompt_tokens") or 0)
            self.last_completion_tokens = int(usage.get("completion_tokens") or 0)
            self.last_total_tokens = int(usage.get("total_tokens")
                                         or (self.last_prompt_tokens + self.last_completion_tokens))
            if self.last_prompt_tokens > 0:
                self._awaiting_real_usage = False

    # ---------------------------------------------------------------- triggers
    def should_compress(self, prompt_tokens: Optional[int] = None) -> bool:
        ok, _ = self.should_compress_info(prompt_tokens)
        return ok

    def should_compress_info(self, prompt_tokens: Optional[int] = None) -> Tuple[bool, Optional[str]]:
        with self._lock:
            now = time.monotonic()
            if self._noop_backoff_until > now:
                return False, "structural no-op backoff active (last pass freed nothing)"
            if self._ineffective_count >= self._max_ineffective:
                return False, (f"ineffective-compression breaker armed "
                               f"({self._ineffective_count} passes with no meaningful gain)")
            if self._awaiting_real_usage:
                return False, "awaiting real usage after last compression"
            if self._last_compress_at and (now - self._last_compress_at) < self._cooldown_seconds:
                return False, f"cooldown ({int(self._cooldown_seconds - (now - self._last_compress_at))}s left)"
            tokens = prompt_tokens if prompt_tokens is not None else self.last_prompt_tokens
            if self.threshold_tokens <= 0 or tokens <= 0:
                return False, None
            return tokens >= self.threshold_tokens, None

    def should_compress_preflight(self, messages: List[Dict[str, Any]]) -> bool:
        # chars/4 rough check before the API call; host may defer to real usage.
        if self.threshold_tokens <= 0:
            return False
        return estimate_messages_tokens(messages) >= self.threshold_tokens

    def should_defer_preflight_to_real_usage(self, rough_tokens: int) -> bool:
        with self._lock:
            if self._awaiting_real_usage:
                return False  # compression just ran; rough estimate is the only signal
            if self.last_prompt_tokens > 0:
                return True  # trust recent real usage over the noisy estimate
        return False

    def has_content_to_compress(self, messages: List[Dict[str, Any]]) -> bool:
        middle = self._middle_slice(messages)[0]
        return len(middle) >= 2

    # ---------------------------------------------------------------- compress
    def compress(self, messages: List[Dict[str, Any]], current_tokens: Optional[int] = None,
                 focus_topic: Optional[str] = None, force: bool = False,
                 memory_context: str = "") -> List[Dict[str, Any]]:
        """Compile the middle into a structural digest; head/tail stay verbatim.

        Failure semantics: on any guard trip or internal error, return the input
        unchanged (host falls back gracefully — never worse than no engine).
        """
        try:
            return self._compress_inner(messages, current_tokens, focus_topic, force, memory_context)
        except Exception:
            logger.exception("LCM compress failed; returning transcript unchanged")
            return messages if isinstance(messages, list) else []

    def _compress_inner(self, messages: List[Dict[str, Any]], current_tokens: Optional[int],
                        focus_topic: Optional[str], force: bool,
                        memory_context: str) -> List[Dict[str, Any]]:
        if not isinstance(messages, list) or not messages:
            return messages if isinstance(messages, list) else []

        middle, head_end, tail_start = self._middle_slice(messages)
        if len(middle) < 2 or len(middle) < self.min_middle_messages:
            # Transcript shape leaves nothing compilable: structural no-op.
            self._arm_noop_backoff()
            return messages

        input_est = estimate_messages_tokens(middle)
        nodes, n_src = extract_nodes(middle)
        added, reinforced = self._state.merge(nodes, focus_topic)
        # Persist extracted knowledge regardless of the gain verdict: the nodes
        # are real observations about this conversation; a subsequent pass
        # re-merges them idempotently (dedupe by key).
        self.save_state(reason=f"merge:+{added}/~{reinforced}")
        lines, omitted = format_digest_lines(nodes)
        digest = build_digest_message(
            nodes, middle_count=len(middle), head_count=head_end,
            tail_count=len(messages) - tail_start,
            digest_lines=lines, omitted=omitted, focus_topic=focus_topic,
        )

        candidate = list(messages[:head_end]) + [digest] + list(messages[tail_start:])
        ok, why = validate_message_list(candidate)
        if not ok:
            # Never publish an illegal sequence: treat as structural no-op.
            logger.warning("LCM candidate invalid (%s); no-op backoff armed", why)
            self._arm_noop_backoff()
            return messages

        output_est = estimate_messages_tokens(candidate)
        gain = input_est - output_est
        meaningful = gain >= self.min_gain_tokens or (
            input_est > 0 and gain >= input_est * self.min_gain_ratio)
        if gain <= 0 or not meaningful:
            self._register_ineffective(force)
            return messages

        # Commit: counters, cooldown, persist. (Host thread contract: the list
        # we return is a private snapshot; persistence happens here, before
        # returning, so a host timeout after this point loses nothing durable.)
        with self._lock:
            self.compression_count += 1
            self._state.compression_count = self.compression_count
            self._last_compress_at = time.monotonic()
            self._awaiting_real_usage = True
            # Post-compression request rides near the threshold; set the sentinel
            # low so the next real usage re-arms normal judgement.
            self.last_prompt_tokens = 0
        self.save_state(reason=f"compress:+{added}/~{reinforced}")
        return candidate

    # ------------------------------------------------------------------ slices
    def _middle_slice(self, messages: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], int, int]:
        """(middle, head_end, tail_start) with tool-group alignment applied."""
        n = len(messages)
        # Skip leading system prompt(s) and contentless records; head protection
        # counts content-bearing non-system messages after that (ABC semantics).
        first_content = 0
        while first_content < n and (
            messages[first_content].get("role") == "system"
            or not messages[first_content].get("content")
        ):
            first_content += 1
        head_end = first_content + self.protect_first_n
        last_user = find_last_user_index(messages)
        tail_start = max(0, last_user - self.protect_last_n + 1) if last_user >= 0 else n
        if tail_start <= head_end:
            tail_start = min(n, head_end + 1)
        tail_start = align_tail_start(messages, tail_start)
        head_end = align_head_end(messages, head_end)
        if head_end >= tail_start:
            return [], head_end, tail_start
        return messages[head_end:tail_start], head_end, tail_start

    # --------------------------------------------------------------- breakers
    def _arm_noop_backoff(self) -> None:
        with self._lock:
            self._noop_backoff_until = time.monotonic() + self._noop_backoff_seconds

    def _register_ineffective(self, force: bool) -> None:
        with self._lock:
            if force:
                return  # manual /compress: never strike
            self._ineffective_count += 1
            self._last_compress_at = time.monotonic()

    # -------------------------------------------------------------- persistence
    def save_state(self, reason: str = "") -> bool:
        with self._lock:
            state, path = self._state, self._state_path
        if state is None or not path:
            return False
        ok = state.save(path)
        if ok:
            logger.debug("LCM state saved (%s): %s nodes=%d", reason, path, len(state.nodes))
        else:
            logger.warning("LCM state save failed (%s): %s", reason, path)
        return ok

    # ------------------------------------------------------------------- tools
    def get_tool_schemas(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "lcm_recall",
                "description": (
                    "Search the LCM structural memory (typed nodes with anchors to original "
                    "messages compiled out of the compressed middle). Returns matching nodes "
                    "with their anchor ids; feed an anchor uid into lcm_recall to re-read the "
                    "node. Original verbatim text lives in the session DB."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Keywords to match nodes"},
                        "limit": {"type": "integer", "description": "Max results (default 5)"},
                    },
                    "required": ["query"],
                },
            },
            {
                "name": "lcm_status",
                "description": "LCM engine status: node counts by type, compression passes, state file path.",
                "parameters": {"type": "object", "properties": {}},
            },
        ]

    def handle_tool_call(self, name: str, args: Dict[str, Any], **kwargs: Any) -> str:
        import json as _json
        try:
            if name == "lcm_recall":
                query = str((args or {}).get("query", ""))
                limit = int((args or {}).get("limit") or 5)
                hits = self._state.search(query, limit=limit)
                return _json.dumps({
                    "results": [
                        {
                            "type": n.type, "content": n.content, "weight": n.weight,
                            "anchors": n.anchor_ids(), "turns": n.turns,
                        }
                        for n in hits
                    ],
                    "total_nodes": len(self._state.nodes),
                    "hint": "anchors reference original messages; verbatim text is in the session DB",
                }, ensure_ascii=False)
            if name == "lcm_status":
                with self._lock:
                    return _json.dumps({
                        "engine": self.name,
                        "nodes": self._state.counts_by_type(),
                        "total_nodes": len(self._state.nodes),
                        "compression_count": self.compression_count,
                        "threshold_tokens": self.threshold_tokens,
                        "context_length": self.context_length,
                        "state_path": self._state_path,
                        "ineffective_count": self._ineffective_count,
                        "noop_backoff_until_in": max(0.0, self._noop_backoff_until - time.monotonic()),
                    }, ensure_ascii=False)
            return _json.dumps({"error": f"Unknown context engine tool: {name}"})
        except Exception as exc:
            return _json.dumps({"error": f"lcm tool failure: {exc}"})

    # ------------------------------------------------------------------ status
    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            last_prompt = max(self.last_prompt_tokens, 0)
            return {
                "last_prompt_tokens": last_prompt,
                "threshold_tokens": self.threshold_tokens,
                "context_length": self.context_length,
                "usage_percent": min(100, last_prompt / self.context_length * 100) if self.context_length else 0,
                "compression_count": self.compression_count,
                "lcm_nodes": len(self._state.nodes),
                "lcm_ineffective": self._ineffective_count,
            }
