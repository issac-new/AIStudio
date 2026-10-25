"""Outbound throttle for gateway-authored chat notices.

``_handle_message`` returns a string only for operational notices — ownership/
coordination refusals, drain notices, busy-path acknowledgements, slash-command
replies; conversational agent replies stream out-of-band and return ``None``.
In a multi-agent room an echoed notice is itself a new room message that
re-triggers every agent's dispatch, and each of those refusals echoes again:
a self-sustaining notification storm (run4 measured 120 messages in 2 minutes,
97 of them the identical "active session limit" text).

The capacity path no longer echoes at all (silent retry queue, patch 533). This
guard is the sink-level backstop for every other notice: identical texts dedup
inside ``dedup_seconds``, a per-chat sliding budget opens a cooldown announced
by a single digest line, and nothing here can block processing — a suppressed
notice only loses its echo. Settings: config.yaml ``gateway.outbound_notice_guard``.
"""

from __future__ import annotations

import hashlib
import threading
import time
from collections import OrderedDict, deque
from dataclasses import dataclass
from typing import Callable, Deque, Dict, Hashable, Optional, Tuple

# Parsing helpers shared with the inbound twin: one parser, two guards.
from gateway.bot_loop_guard import _as_bool, _as_positive, _as_positive_int

__all__ = [
    "OutboundNoticeGuard",
    "OutboundNoticeGuardSettings",
    "load_settings",
    "settings_from_config",
]


@dataclass(frozen=True)
class OutboundNoticeGuardSettings:
    enabled: bool = True
    dedup_seconds: float = 60.0
    max_notices: int = 8
    window_seconds: float = 60.0
    cooldown_seconds: float = 120.0
    max_tracked_texts: int = 64


def settings_from_config(cfg) -> OutboundNoticeGuardSettings:
    """Read ``gateway.outbound_notice_guard`` from a loaded config dict. Unusable values keep the default."""
    from hermes_cli.config import cfg_get

    block = cfg_get(cfg, "gateway", "outbound_notice_guard", default=None)
    if not isinstance(block, dict):
        return OutboundNoticeGuardSettings()
    defaults = OutboundNoticeGuardSettings()
    return OutboundNoticeGuardSettings(
        enabled=_as_bool(block.get("enabled"), defaults.enabled),
        dedup_seconds=_as_positive(block.get("dedup_seconds"), defaults.dedup_seconds),
        max_notices=_as_positive_int(block.get("max_notices"), defaults.max_notices),
        window_seconds=_as_positive(block.get("window_seconds"), defaults.window_seconds),
        cooldown_seconds=_as_positive(block.get("cooldown_seconds"), defaults.cooldown_seconds),
        max_tracked_texts=_as_positive_int(block.get("max_tracked_texts"), defaults.max_tracked_texts),
    )


def load_settings() -> OutboundNoticeGuardSettings:
    """Settings from the live config.yaml. Defaults when the config cannot be read."""
    try:
        from hermes_cli.config import load_config_readonly

        return settings_from_config(load_config_readonly())
    except Exception:
        return OutboundNoticeGuardSettings()


class OutboundNoticeGuard:
    """Per-chat throttle at the reply sink: identical-text dedup plus a sliding send
    budget whose trip opens a cooldown. Thread-safe; settings are re-read on every
    call so a config.yaml edit takes effect without a restart. The digest line is
    emitted exactly once per cooldown epoch and bypasses the budget by construction
    (it is returned to the caller, never re-admitted)."""

    def __init__(
        self,
        settings: Callable[[], OutboundNoticeGuardSettings] = load_settings,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._settings = settings
        self._clock = clock
        self._lock = threading.Lock()
        # target -> (text digest -> last seen ts); OrderedDict for LRU eviction.
        self._seen: Dict[Hashable, "OrderedDict[str, float]"] = {}
        # target -> timestamps of admitted notices inside the budget window.
        self._sent: Dict[Hashable, Deque[float]] = {}
        self._cooldown_until: Dict[Hashable, float] = {}
        # Suppressions since the last admitted notice (reset on every "ok").
        self._suppressed_since_admit: Dict[Hashable, int] = {}
        self._last_sweep = 0.0

    def decide(self, target: Hashable, text: str) -> Tuple[bool, Optional[str], str]:
        """Decide one outbound notice. Returns ``(send_original, digest_text, state)``;
        ``state`` is ``disabled``/``ok``/``deduped``/``tripped``/``cooldown``.
        ``tripped`` opens the cooldown and carries the epoch's single digest line."""
        settings = self._settings()
        if not settings.enabled:
            return True, None, "disabled"
        now = self._clock()
        digest = hashlib.sha1(text.strip().encode("utf-8", "replace")).hexdigest()
        with self._lock:
            self._sweep(now, settings)
            if self._cooldown_until.get(target, 0.0) > now:
                self._bump_suppressed(target)
                return False, None, "cooldown"
            seen = self._seen.setdefault(target, OrderedDict())
            last = seen.get(digest)
            if last is not None and now - last < settings.dedup_seconds:
                self._bump_suppressed(target)
                return False, None, "deduped"
            sent = self._sent.setdefault(target, deque())
            cutoff = now - settings.window_seconds
            while sent and sent[0] <= cutoff:
                sent.popleft()
            if len(sent) >= settings.max_notices:
                self._cooldown_until[target] = now + settings.cooldown_seconds
                suppressed = self._suppressed_since_admit.get(target, 0) + 1
                self._suppressed_since_admit[target] = suppressed
                seen[digest] = now
                self._evict_seen(seen, settings)
                return False, self._digest_line(suppressed, settings), "tripped"
            sent.append(now)
            seen[digest] = now
            self._evict_seen(seen, settings)
            self._suppressed_since_admit.pop(target, None)
            return True, None, "ok"

    def _bump_suppressed(self, target: Hashable) -> None:
        self._suppressed_since_admit[target] = self._suppressed_since_admit.get(target, 0) + 1

    @staticmethod
    def _evict_seen(seen: "OrderedDict[str, float]", settings: OutboundNoticeGuardSettings) -> None:
        while len(seen) > settings.max_tracked_texts:
            seen.popitem(last=False)

    @staticmethod
    def _digest_line(suppressed: int, settings: OutboundNoticeGuardSettings) -> str:
        return (
            f"⚠️ Gateway notice throttle active for this chat: {suppressed} repeated gateway "
            f"notice(s) suppressed; gateway notices resume in ~{settings.cooldown_seconds:.0f}s."
        )

    def _sweep(self, now: float, settings: OutboundNoticeGuardSettings) -> None:
        """Drop chats idle past every horizon at most once per window so memory stays bounded."""
        if now - self._last_sweep < settings.window_seconds:
            return
        self._last_sweep = now
        idle_cutoff = now - max(
            settings.window_seconds, settings.dedup_seconds, settings.cooldown_seconds)
        for key in [
            k for k, dq in self._sent.items()
            if (not dq or dq[-1] <= idle_cutoff) and self._cooldown_until.get(k, 0.0) <= now
        ]:
            del self._sent[key]
            self._seen.pop(key, None)
            self._suppressed_since_admit.pop(key, None)
        for key in [k for k, until in self._cooldown_until.items() if until <= idle_cutoff]:
            del self._cooldown_until[key]
