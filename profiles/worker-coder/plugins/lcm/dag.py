"""LCM knowledge DAG: typed nodes with verbatim-recoverable anchors + atomic JSON persistence.

Node types: decision / constraint / fact / artifact.
Anchors reference the original messages (stable host-issued ``message_uid``, or an
``(index, role, sha1[:12])`` fallback triple), so the full original text stays
recoverable from the session DB — the losslessness guarantee of LCM.

Persistence is atomic (tmp file + ``os.replace``) and crash-safe: a corrupt or
missing file loads as a fresh empty state, never an exception.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Tuple

NODE_TYPES = ("decision", "constraint", "fact", "artifact")
_STATE_VERSION = 1
_TYPE_PREFIX = {"decision": "D", "constraint": "C", "fact": "F", "artifact": "A"}
# Digest display priority when the node line budget is tight.
_TYPE_PRIORITY = {"constraint": 0, "decision": 1, "artifact": 2, "fact": 3}


def now() -> float:
    return time.time()


def content_sha1(text: str) -> str:
    return hashlib.sha1((text or "").encode("utf-8", "replace")).hexdigest()


def anchor_uid(uid: str) -> Dict[str, Any]:
    """Anchor backed by the host-issued stable message uid (preferred)."""
    return {"kind": "uid", "uid": uid}


def anchor_fallback(index: int, role: str, text: str) -> Dict[str, Any]:
    """Degraded anchor when no host uid exists: (index, role, sha1[:12])."""
    return {"kind": "fallback", "index": index, "role": role, "sha1": content_sha1(text)[:12]}


def node_key(node_type: str, anchors: List[Dict[str, Any]]) -> str:
    """Stable dedupe key: type + canonical anchor set (order-insensitive)."""
    canon = json.dumps(
        sorted((a.get("kind", ""), str(a.get("uid") or a.get("sha1") or ""))
               for a in anchors),
        ensure_ascii=False, sort_keys=True, separators=(",", ":"),
    )
    return hashlib.sha1(f"{node_type}|{canon}".encode("utf-8")).hexdigest()[:24]


@dataclass
class KnowledgeNode:
    type: str
    content: str
    anchors: List[Dict[str, Any]] = field(default_factory=list)
    key: str = ""
    weight: float = 1.0
    turns: str = ""
    created_at: float = 0.0
    updated_at: float = 0.0

    def __post_init__(self) -> None:
        if self.type not in NODE_TYPES:
            self.type = "fact"
        if not self.key:
            self.key = node_key(self.type, self.anchors)
        if not self.created_at:
            self.created_at = now()
        if not self.updated_at:
            self.updated_at = self.created_at

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.type, "content": self.content, "anchors": self.anchors,
            "key": self.key, "weight": round(self.weight, 3), "turns": self.turns,
            "created_at": self.created_at, "updated_at": self.updated_at,
        }

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "KnowledgeNode":
        return cls(
            type=str(d.get("type", "fact")), content=str(d.get("content", "")),
            anchors=[a for a in d.get("anchors", []) if isinstance(a, dict)],
            key=str(d.get("key", "")) or None,
            weight=float(d.get("weight", 1.0)), turns=str(d.get("turns", "")),
            created_at=float(d.get("created_at", 0.0)), updated_at=float(d.get("updated_at", 0.0)),
        )

    def anchor_ids(self) -> List[str]:
        """Human-readable anchor tokens for digest lines / recall output."""
        out = []
        for a in self.anchors:
            if a.get("kind") == "uid" and a.get("uid"):
                out.append(f"uid={a['uid'][:12]}")
            else:
                out.append(f"fb#{a.get('index', '?')}:{a.get('role', '?')}:{a.get('sha1', '')}")
        return out

    def reinforce(self, extra_anchors: Iterable[Dict[str, Any]], turns: str = "") -> bool:
        """Merge a re-observation of the same node; True when anchors grew."""
        known = {(a.get("kind"), str(a.get("uid") or a.get("sha1") or "")) for a in self.anchors}
        grew = False
        for a in extra_anchors:
            ident = (a.get("kind"), str(a.get("uid") or a.get("sha1") or ""))
            if ident not in known:
                self.anchors.append(a)
                known.add(ident)
                grew = True
        self.weight = round(min(self.weight + 0.5, 10.0), 3)
        self.updated_at = now()
        if turns and not self.turns:
            self.turns = turns
        elif turns and turns.split("-")[0] < self.turns.split("-")[0]:
            self.turns = f"{turns.split('-')[0]}-{self.turns.split('-')[-1]}"
        return grew


_TOKEN_SPLIT = re.compile(r"[^0-9A-Za-z\u4e00-\u9fff]+")


def tokenize(text: str) -> List[str]:
    """Lowercase alnum tokens + CJK bigrams — deterministic matching for focus/recall."""
    text = text or ""
    raw = [t.lower() for t in _TOKEN_SPLIT.split(text) if t]
    out = list(raw)
    for t in raw:
        if re.fullmatch(r"[\u4e00-\u9fff]+", t) and len(t) > 1:
            out.extend(t[i:i + 2] for i in range(len(t) - 1))
    return out


def overlap(a: List[str], b: List[str]) -> float:
    if not a or not b:
        return 0.0
    bs = set(b)
    hits = sum(1 for t in set(a) if t in bs)
    return hits / max(1, len(set(a)))


class DAGState:
    """In-memory node graph + atomic JSON persistence, one file per conversation key."""

    def __init__(self, conversation_key: str = "") -> None:
        self.conversation_key = conversation_key
        self.nodes: List[KnowledgeNode] = []
        self.focus_topic: Optional[str] = None
        self.compression_count = 0
        self._by_key: Dict[str, KnowledgeNode] = {}
        self._lock = threading.RLock()

    # -- mutation ----------------------------------------------------------
    def merge(self, new_nodes: List[KnowledgeNode], focus_topic: Optional[str] = None,
              ) -> Tuple[int, int]:
        """Merge digest nodes: dedupe by key, reinforce repeats. Returns (added, reinforced)."""
        added = reinforced = 0
        with self._lock:
            if focus_topic and focus_topic != self.focus_topic:
                self.focus_topic = focus_topic
                self.apply_focus(focus_topic)
            for n in new_nodes:
                existing = self._by_key.get(n.key)
                if existing is None:
                    self._by_key[n.key] = n
                    self.nodes.append(n)
                    added += 1
                else:
                    existing.reinforce(n.anchors, n.turns)
                    reinforced += 1
        return added, reinforced

    def apply_focus(self, topic: str) -> None:
        """Weight-boost nodes overlapping the focus topic (manual /compress <focus>)."""
        toks = tokenize(topic)
        if not toks:
            return
        with self._lock:
            for n in self.nodes:
                if overlap(tokenize(n.content), toks) >= 0.2:
                    n.weight = round(min(n.weight + 1.0, 10.0), 3)
                    n.updated_at = now()

    # -- query -------------------------------------------------------------
    def search(self, query: str, limit: int = 5) -> List[KnowledgeNode]:
        toks = tokenize(query)
        if not toks:
            return []
        with self._lock:
            scored = [(overlap(tokenize(n.content), toks) * 2 + n.weight / 10.0, n)
                      for n in self.nodes]
        scored = [s for s in scored if s[0] > 0.1]
        scored.sort(key=lambda p: (-p[0], p[1].created_at))
        return [n for _, n in scored[:max(1, int(limit))]]

    def counts_by_type(self) -> Dict[str, int]:
        out: Dict[str, int] = {}
        with self._lock:
            for n in self.nodes:
                out[n.type] = out.get(n.type, 0) + 1
        return out

    # -- (de)serialization ---------------------------------------------------
    def to_dict(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "version": _STATE_VERSION,
                "conversation_key": self.conversation_key,
                "focus_topic": self.focus_topic,
                "compression_count": self.compression_count,
                "updated_at": now(),
                "nodes": [n.to_dict() for n in self.nodes],
            }

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "DAGState":
        st = cls(conversation_key=str(d.get("conversation_key", "")))
        st.focus_topic = d.get("focus_topic") or None
        st.compression_count = int(d.get("compression_count", 0) or 0)
        for nd in d.get("nodes", []):
            try:
                n = KnowledgeNode.from_dict(nd)
                st._by_key[n.key] = n
                st.nodes.append(n)
            except Exception:
                continue
        return st

    # -- persistence ---------------------------------------------------------
    def save(self, path: Optional[str]) -> bool:
        """Atomic write (tmp + os.replace). False when path is None or the write fails."""
        if not path:
            return False
        try:
            with self._lock:
                payload = json.dumps(self.to_dict(), ensure_ascii=False, indent=1)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            fd, tmp = tempfile.mkstemp(prefix=".lcm-", suffix=".tmp",
                                       dir=os.path.dirname(path))
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as f:
                    f.write(payload)
                    f.flush()
                    os.fsync(f.fileno())
                os.replace(tmp, path)
            except Exception:
                try:
                    os.unlink(tmp)
                except OSError:
                    pass
                raise
            return True
        except Exception:
            return False

    @classmethod
    def load(cls, path: Optional[str]) -> Optional["DAGState"]:
        """Load persisted state; None (fresh) when missing/corrupt — never raises."""
        if not path or not os.path.isfile(path):
            return None
        try:
            with open(path, encoding="utf-8") as f:
                d = json.load(f)
            if not isinstance(d, dict):
                return None
            return cls.from_dict(d)
        except Exception:
            return None


def format_digest_lines(nodes: List[KnowledgeNode], *, max_nodes: int = 150,
                        content_cap_default: int = 120, content_cap_heavy: int = 240,
                        ) -> Tuple[List[str], int]:
    """Render node lines for the digest message: priority type order then weight.

    Returns (lines, omitted_count). Heavy nodes (weight >= 2) get a longer cap.
    """
    ordered = sorted(nodes, key=lambda n: (_TYPE_PRIORITY.get(n.type, 9), -n.weight, n.created_at))
    lines: List[str] = []
    omitted = 0
    for n in ordered:
        if len(lines) >= max_nodes:
            omitted += 1
            continue
        cap = content_cap_heavy if n.weight >= 2 else content_cap_default
        text = " ".join((n.content or "").split())
        if len(text) > cap:
            text = text[: cap - 1].rstrip() + "…"
        prefix = _TYPE_PREFIX.get(n.type, "?")
        anchors = ",".join(n.anchor_ids()[:3]) or "-"
        lines.append(f"[{prefix}] {text}  <anchors: {anchors}>")
    return lines, omitted
