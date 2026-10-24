"""Deterministic middle-turn extraction: messages -> typed KnowledgeNodes. Zero LLM calls.

Patterns are anchored to real Hermes session shapes (English + Chinese operator
traffic, file paths, tool verbs, constraint phrasing). Deterministic and cheap:
same input always yields the same nodes.
"""

from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional, Tuple

try:  # pure-stdlib fallback when the sibling module is imported standalone
    from .dag import KnowledgeNode, anchor_fallback, anchor_uid, node_key, now
except ImportError:  # pragma: no cover
    from dag import KnowledgeNode, anchor_fallback, anchor_uid, node_key, now  # type: ignore

# A turn = user prompt + assistant answer + optional tool call/result run.
_TOOL_PAIR = (
    ("role", "assistant", "tool_calls"), ("role", "tool", "content"),
)

_DECISION = re.compile(
    r"\b(decided|decision|choose|chose|we(?:'| a)re going (?:with|to)|going with|settle(?:d)? on|"
    r"approved|rejected|selected|picked|will use|should use|plan to|top priority|"
    r"determine|agreed|conclusion is)\b", re.IGNORECASE)
_DECISION_CN = re.compile(
    r"(决定|拍板|定了|选定|确定(采用|使用|方案)?|选择(了)?|采纳|批准|否决|优先|结论(是|：|:))")
_CONSTRAINT = re.compile(
    r"\b(must not|must (?:be|use|run|stay|keep)|do not|don't|never |forbidden|prohibited|"
    r"required to|has to|need to|constraint|boundary|only (?:use|via|through)|"
    r"make sure|ensure that|no longer|deprecated)\b", re.IGNORECASE)
_CONSTRAINT_CN = re.compile(
    r"(不能|不准|禁止|必须|务必|约束|边界|不得|不许|只能(通过|用|经)|一定要|严禁|别再|避免)")
_FACT = re.compile(
    r"\b(is actually|actually (?:is|was|are)|turns out|it is|there (?:is|are)|contains|located at|"
    r"named|version is|caused by|results? in|fixed|broken|failing|passing|"
    r"fact|note)\b\s*:?", re.IGNORECASE)
_FACT_CN = re.compile(r"(实际(上)?是|发现|查明|原因(是)?|结果(是)?|位于|当前(版本|状态)|已修复|已通过|失败)")
# Artifact: file paths (POSIX abs or repo-relative), URLs, refs like t_xxx / #12345.
_ARTIFACT = re.compile(
    r"(?<![\w/])(/(?:Users|home|tmp|var|opt|etc)/[\w.\-/@+]+"
    r"|\b[\w.\-]+(?:/[\w.\-]+)+\.(?:py|md|json|yaml|yml|toml|sh|ts|tsx|js|rs|go|sql|txt|log)\b"
    r"|\bhttps?://[^\s)>\]]+"
    r"|\bt_[0-9a-f]{6,}\b|#\d{3,}\b)", re.IGNORECASE)

# Sentence split keeps terminal punctuation; CJK-safe.
_SENT_SPLIT = re.compile(r"(?<=[。．.!?！？\n])\s*")
_TOOL_VERBS = re.compile(r"\b(read|write|edit|ran|run|grep|search|list|install|deploy|build|test)\b", re.IGNORECASE)


def _clean(text: str, cap: int = 400) -> str:
    text = re.sub(r"\s+", " ", (text or "").strip())
    return text if len(text) <= cap else text[: cap - 1].rstrip() + "…"


def _sentences(text: str) -> List[str]:
    return [s.strip() for s in _SENT_SPLIT.split(text or "") if s and s.strip()]


def _class_of(sentence: str) -> Optional[str]:
    if _CONSTRAINT.search(sentence) or _CONSTRAINT_CN.search(sentence):
        return "constraint"
    if _DECISION.search(sentence) or _DECISION_CN.search(sentence):
        return "decision"
    if _ARTIFACT.search(sentence):
        return "artifact"
    if _FACT.search(sentence) or _FACT_CN.search(sentence):
        return "fact"
    return None


def _node_turn_range(start: int, end: int) -> str:
    return f"{start}-{max(start, end - 1)}"


def _make_node(ntype: str, content: str, anchors: List[Dict[str, Any]], turns: str) -> KnowledgeNode:
    return KnowledgeNode(type=ntype, content=_clean(content), anchors=anchors, turns=turns)


def _user_decision_nodes(msg: Dict[str, Any], anchor: Dict[str, Any], turns: str) -> List[KnowledgeNode]:
    """User messages: instructions/decisions/constraints matter most — keep whole-message nodes."""
    text = msg.get("content") if isinstance(msg.get("content"), str) else ""
    if not text:
        return []
    nodes: List[KnowledgeNode] = []
    for sent in _sentences(text):
        cls = _class_of(sent) or ("constraint" if len(sent) < 240 else None)
        if cls == "constraint" or cls == "decision":
            nodes.append(_make_node(cls, sent, [anchor], turns))
    if not nodes and text.strip():
        nodes.append(_make_node("fact", text, [anchor], turns))
    return nodes[:4]


def _assistant_nodes(msg: Dict[str, Any], anchor: Dict[str, Any], turns: str) -> List[KnowledgeNode]:
    text = msg.get("content") if isinstance(msg.get("content"), str) else ""
    nodes: List[KnowledgeNode] = []
    if text:
        for sent in _sentences(text):
            cls = _class_of(sent)
            if cls:
                nodes.append(_make_node(cls, sent, [anchor], turns))
    for tc in msg.get("tool_calls") or []:
        if isinstance(tc, dict):
            fn = ((tc.get("function") or {}).get("name") or "").strip()
            if fn:
                nodes.append(_make_node(
                    "artifact", f"tool call: {fn}", [anchor], turns))
    return nodes[:6]


def _tool_nodes(msg: Dict[str, Any], anchor: Dict[str, Any], turns: str) -> List[KnowledgeNode]:
    text = msg.get("content") if isinstance(msg.get("content"), str) else ""
    if not text:
        return []
    nodes: List[KnowledgeNode] = []
    paths = list(dict.fromkeys(m.group(0) for m in _ARTIFACT.finditer(text)))[:3]
    first = _clean(text.splitlines()[0] if text.splitlines() else "", 160)
    if _TOOL_VERBS.search(text) or paths or first:
        label = f"tool result: {first}"
        if paths:
            label += f"  (paths: {', '.join(paths)})"
        nodes.append(_make_node("artifact", label, [anchor], turns))
    for sent in _sentences(text):
        if _class_of(sent) in ("constraint", "decision"):
            nodes.append(_make_node(_class_of(sent), sent, [anchor], turns))
    return nodes[:3]


def extract_nodes(messages: Iterable[Dict[str, Any]], start_turn_index: int = 0,
                  ) -> Tuple[List[KnowledgeNode], int]:
    """Extract nodes from middle messages; returns (nodes, n_source_messages).

    Groups messages into turns (user .. up to next user); one anchor per source
    message. turn indices are positions in the *input* slice (0-based).
    """
    nodes: List[KnowledgeNode] = []
    msgs = [m for m in messages if isinstance(m, dict)]
    turn = start_turn_index
    i = 0
    while i < len(msgs):
        if msgs[i].get("role") != "user":
            # Stray non-user start (mid-conversation slice): fold into current turn.
            pass
        start_i = i
        j = i + 1
        while j < len(msgs) and msgs[j].get("role") != "user":
            j += 1
        turn_msgs = msgs[start_i:j]
        turns = _node_turn_range(turn, turn + len(turn_msgs) // 2 or 1)
        for m in turn_msgs:
            uid = m.get("message_uid") if isinstance(m.get("message_uid"), str) else None
            content = m.get("content") if isinstance(m.get("content"), str) else ""
            anchor = anchor_uid(uid) if uid else anchor_fallback(i, str(m.get("role", "")), content)
            role = m.get("role")
            if role == "user":
                nodes.extend(_user_decision_nodes(m, anchor, turns))
            elif role == "assistant":
                nodes.extend(_assistant_nodes(m, anchor, turns))
            elif role == "tool":
                nodes.extend(_tool_nodes(m, anchor, turns))
        turn += 1
        i = j
    return nodes, len(msgs)


def build_digest_message(nodes: List[KnowledgeNode], middle_count: int, head_count: int,
                         tail_count: int,
                         digest_lines: List[str], omitted: int,
                         focus_topic: Optional[str] = None,
                         recover_hint: str = "") -> Dict[str, Any]:
    """The structural replacement message for the compressed middle."""
    lines = digest_lines or ["(no salient nodes extracted — middle contained routine chatter)"]
    tail_note = f"\n… and {omitted} more low-weight nodes (use lcm_recall to surface them)." if omitted else ""
    focus_note = f"\nFocus topic: {focus_topic} — related nodes are weight-boosted." if focus_topic else ""
    recover_note = f"\n{recover_hint}" if recover_hint else ""
    body = (
        "[LCM structural memory] The middle of this conversation was compiled into typed nodes "
        "(D=decision, C=constraint, F=fact, A=artifact). Original text is recoverable via anchors "
        "(uid=<stable message id>, fb#<index>:<role>:<sha12> degraded anchor) with lcm_recall, "
        "or by replaying the session DB in full.\n\n"
        + "\n".join(lines) + tail_note + focus_note + recover_note
        + f"\n\n[LCM stats] middle messages compiled: {middle_count}; head kept: {head_count}; "
          f"tail kept: {tail_count}."  # rough size only: estimate via validators.estimate_messages_tokens
    )
    return {
        "role": "user",
        "content": body,
    }
