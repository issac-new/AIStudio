"""OpenAI message-sequence validation for LCM compress() output.

The host treats the returned list as the new request transcript: role sequence
must be legal and tool messages must stay attached to their owning assistant
``tool_calls``. Also hosts the rough token estimator (chars/4, host-consistent).
"""

from __future__ import annotations

import json
from typing import Any, Dict, Iterable, List, Optional, Tuple

CHARS_PER_TOKEN = 4
_VALID_ROLES = ("system", "user", "assistant", "tool", "developer")


def estimate_tokens(text: str) -> int:
    return len(text or "") // CHARS_PER_TOKEN


def estimate_messages_tokens(messages: Iterable[Dict[str, Any]]) -> int:
    """Rough transcript size in tokens, mirroring the host's chars/4 estimator."""
    total = 0
    for m in messages:
        if not isinstance(m, dict):
            continue
        content = m.get("content")
        if isinstance(content, str):
            total += estimate_tokens(content)
        elif content is not None:
            try:
                total += estimate_tokens(json.dumps(content, ensure_ascii=False))
            except Exception:
                total += estimate_tokens(str(content))
        for tc in m.get("tool_calls") or []:
            try:
                total += estimate_tokens(json.dumps(tc, ensure_ascii=False))
            except Exception:
                pass
    return total


def validate_message_list(messages: List[Dict[str, Any]]) -> Tuple[bool, str]:
    """Structural legality of a compress() output; (ok, reason).

    Checks: non-empty list of dicts, known roles, tool messages have
    ``tool_call_id`` and are preceded (same turn) by an assistant message whose
    ``tool_calls`` cover that id. system/developer only at position 0.
    """
    if not isinstance(messages, list) or not messages:
        return False, "empty or non-list output"
    open_ids: set[str] = set()
    for i, m in enumerate(messages):
        if not isinstance(m, dict):
            return False, f"index {i}: non-dict message"
        role = m.get("role")
        if role not in _VALID_ROLES:
            return False, f"index {i}: invalid role {role!r}"
        if role in ("system", "developer") and i != 0:
            return False, f"index {i}: {role} message outside position 0"
        if role == "assistant":
            tcs = m.get("tool_calls")
            if tcs:
                if not isinstance(tcs, list):
                    return False, f"index {i}: tool_calls not a list"
                for tc in tcs:
                    if not isinstance(tc, dict) or not (tc.get("function") or {}).get("name"):
                        return False, f"index {i}: malformed tool_call entry"
                    if tc.get("id"):
                        open_ids.add(tc["id"])
            # An assistant with NO tool_calls closes any dangling expectation
            # only if it carries content; keep open_ids otherwise (streamed
            # multi-assistant turns are rare but legal).
            if not tcs and m.get("content"):
                open_ids.clear()
        elif role == "tool":
            tcid = m.get("tool_call_id")
            if not isinstance(tcid, str) or not tcid:
                return False, f"index {i}: tool message without tool_call_id"
            if tcid not in open_ids:
                return False, f"index {i}: orphan tool message (no open tool_call id {tcid!r})"
            open_ids.discard(tcid)
    if open_ids:
        return False, f"trailing assistant tool_calls without results: {sorted(open_ids)[:3]}"
    return True, "ok"


def align_tail_start(messages: List[Dict[str, Any]], start: int) -> int:
    """Move a tail boundary LEFT until messages[start:] begins on safe ground.

    Safe = user/assistant without tool_calls. A tool message must keep its owner;
    an assistant with tool_calls must keep all its results inside the tail.
    """
    n = len(messages)
    start = max(0, min(start, n))
    while 0 < start < n:
        role = messages[start].get("role")
        if role == "tool":
            start -= 1
            continue
        if role == "assistant" and messages[start].get("tool_calls"):
            # Keep this assistant + all its results together in the tail.
            j = start + 1
            need: set[str] = set()
            for tc in messages[start].get("tool_calls") or []:
                if isinstance(tc, dict) and tc.get("id"):
                    need.add(tc["id"])
            while j < n and need:
                if messages[j].get("role") == "tool" and messages[j].get("tool_call_id") in need:
                    need.discard(messages[j].get("tool_call_id"))
                elif messages[j].get("role") == "assistant":
                    break
                j += 1
            if not need:
                return start  # results complete within tail: safe boundary
            start -= 1
            continue
        return start
    return max(0, start)


def align_head_end(messages: List[Dict[str, Any]], end: int) -> int:
    """Move a head boundary RIGHT until the head is a complete tool group.

    If messages[end-1] is an assistant with unanswered tool_calls, extend past
    the results; if messages[end] lands inside another run, stop there.
    """
    n = len(messages)
    end = max(1, min(end, n))
    while end < n:
        last = messages[end - 1]
        if last.get("role") == "assistant" and last.get("tool_calls"):
            need: set[str] = set()
            for tc in last.get("tool_calls") or []:
                if isinstance(tc, dict) and tc.get("id"):
                    need.add(tc["id"])
            j = end
            while j < n and need:
                if messages[j].get("role") == "tool" and messages[j].get("tool_call_id") in need:
                    need.discard(messages[j].get("tool_call_id"))
                    j += 1
                    continue
                break
            # Boundary moves past the results whether or not all were found:
            # an unanswered call at the head edge keeps its (partial) results
            # on the same side — the middle never starts mid-group.
            end = j
            continue
        return end
    return min(end, n)


def find_last_user_index(messages: List[Dict[str, Any]]) -> int:
    for i in range(len(messages) - 1, -1, -1):
        if messages[i].get("role") == "user":
            return i
    return -1
