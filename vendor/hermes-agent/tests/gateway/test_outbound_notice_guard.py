"""Tests for the outbound notice throttle (gateway-authored chat notices).

Storm signature (run4): an echoed refusal is itself a room message that re-triggers
every agent's dispatch; the same notice comes back multiplied (120 messages / 2 min,
97 identical "active session limit" texts). The capacity path is silent since patch
533 — these tests pin the sink-level backstop for every other notice."""

import asyncio
from types import SimpleNamespace

import pytest

from gateway.config import Platform
from gateway.outbound_notice_guard import (
    OutboundNoticeGuard,
    OutboundNoticeGuardSettings,
    settings_from_config,
)
from gateway.platforms.base import BasePlatformAdapter
from gateway.platforms.event import MessageEvent, MessageType
from gateway.session import SessionSource

LIMIT_TEXT = "Hermes is at the active session limit (4/4). Try again once a session finishes."

SETTINGS = OutboundNoticeGuardSettings(
    enabled=True, dedup_seconds=60.0, max_notices=8,
    window_seconds=60.0, cooldown_seconds=120.0, max_tracked_texts=64)


class FakeClock:
    def __init__(self, now: float = 1000.0):
        self.now = now

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def _guard(settings: OutboundNoticeGuardSettings = SETTINGS, clock: FakeClock = None):
    return OutboundNoticeGuard(settings=lambda: settings, clock=clock or FakeClock())


def _make_event(chat_id: str = "chat-1") -> MessageEvent:
    return MessageEvent(
        text="hello",
        message_type=MessageType.TEXT,
        source=SessionSource(
            platform=Platform.TELEGRAM, chat_id=chat_id, chat_type="dm", user_id="user-1"),
    )


# --- Guard unit tests ---------------------------------------------------------

def test_identical_text_dedups_inside_window_then_recovers():
    clock = FakeClock()
    guard = _guard(clock=clock)
    assert guard.decide("t", LIMIT_TEXT) == (True, None, "ok")
    assert guard.decide("t", LIMIT_TEXT) == (False, None, "deduped")
    assert guard.decide("t", LIMIT_TEXT) == (False, None, "deduped")
    clock.advance(60.1)
    assert guard.decide("t", LIMIT_TEXT) == (True, None, "ok")


def test_distinct_texts_trip_budget_with_single_digest_line():
    clock = FakeClock()
    guard = _guard(settings=OutboundNoticeGuardSettings(
        enabled=True, dedup_seconds=60.0, max_notices=3,
        window_seconds=60.0, cooldown_seconds=120.0, max_tracked_texts=64), clock=clock)
    for i in range(3):
        assert guard.decide("t", f"notice {i}")[0] is True
    send, digest, state = guard.decide("t", "notice 3")
    assert (send, state) == (False, "tripped")
    assert digest is not None and "1" in digest and "120s" in digest
    # Exactly one digest per cooldown epoch; everything else is silent.
    assert guard.decide("t", "notice 4") == (False, None, "cooldown")
    assert guard.decide("t", "notice 5") == (False, None, "cooldown")
    clock.advance(120.1)  # cooldown longer than the budget window: fresh budget.
    send, digest, state = guard.decide("t", "notice 6")
    assert (send, digest, state) == (True, None, "ok")


def test_suppressed_counter_resets_on_admitted_notice():
    clock = FakeClock()
    guard = _guard(settings=OutboundNoticeGuardSettings(
        enabled=True, dedup_seconds=60.0, max_notices=2,
        window_seconds=60.0, cooldown_seconds=120.0, max_tracked_texts=64), clock=clock)
    guard.decide("t", "a")
    guard.decide("t", "a")            # deduped: suppressed=1
    guard.decide("t", "b")            # admitted (2/2): counter resets
    _, digest, _ = guard.decide("t", "c")  # trips: only this one suppressed so far
    assert digest is not None and "1 repeated" in digest
    # Without the reset the earlier deduped "a" would count up to "2 repeated".


def test_targets_are_independent():
    guard = _guard()
    for i in range(8):                 # distinct texts: exhaust chat-a's budget
        guard.decide("chat-a", f"notice {i}")
    assert guard.decide("chat-a", "one more")[2] in ("tripped", "cooldown")
    assert guard.decide("chat-b", "notice 0") == (True, None, "ok")


def test_disabled_setting_sends_everything():
    guard = _guard(settings=OutboundNoticeGuardSettings(enabled=False))
    for _ in range(50):
        assert guard.decide("t", LIMIT_TEXT) == (True, None, "disabled")


def test_tracked_texts_are_bounded():
    clock = FakeClock()
    guard = _guard(settings=OutboundNoticeGuardSettings(
        enabled=True, dedup_seconds=60.0, max_notices=1000,
        window_seconds=60.0, cooldown_seconds=120.0, max_tracked_texts=2), clock=clock)
    guard.decide("t", "a")
    guard.decide("t", "b")
    guard.decide("t", "c")            # evicts "a" (LRU)
    assert guard.decide("t", "a")[2] == "ok"       # no longer tracked
    # Re-admitting "a" evicts "b"; "c" survives and still dedups.
    assert guard.decide("t", "c")[2] == "deduped"


def test_storm_signature_identical_texts_cannot_amplify():
    """run4 replayed: 97 identical limit notices inside two minutes.
    The room sees exactly the first one — no digest, no echoes."""
    guard = _guard()
    sends = sum(1 for _ in range(97) if guard.decide("room", LIMIT_TEXT)[0])
    digests = sum(1 for _ in range(97) if guard.decide("room", LIMIT_TEXT)[1])
    assert sends == 1
    assert digests == 0


def test_storm_signature_distinct_texts_are_budget_capped():
    """Even non-identical notices (ownership texts naming different sessions) are
    capped: 8 originals + one digest line land in the room, the rest is silence."""
    guard = _guard()
    sent, digests, suppressed = 0, 0, 0
    for i in range(97):
        send, digest, _ = guard.decide("room", f"conflict on session-{i}: held by user-{i}")
        sent += bool(send)
        digests += digest is not None
        suppressed += not send and digest is None
    assert sent == 8
    assert digests == 1
    assert suppressed == 88


def test_settings_from_config_reads_block_and_keeps_defaults():
    settings = settings_from_config(
        {"gateway": {"outbound_notice_guard": {"max_notices": "3", "enabled": False, "bogus": 1}}})
    assert settings.enabled is False
    assert settings.max_notices == 3
    assert settings.dedup_seconds == 60.0  # untouched keys keep defaults
    assert settings_from_config({}).enabled is True
    assert settings_from_config({"gateway": {}}).max_notices == 8


# --- Sink wiring (BasePlatformAdapter) ---------------------------------------

class _SinkStub(BasePlatformAdapter):
    # Same trick as test_approval_boundary/_multiplex_*: clear the abstract surface so the
    # send-sink methods can be exercised on a bare instance without platform plumbing.
    pass


_SinkStub.__abstractmethods__ = frozenset()


def _bare_adapter() -> BasePlatformAdapter:
    adapter = _SinkStub.__new__(_SinkStub)
    adapter.platform = Platform.TELEGRAM  # ``name`` derives from this (read-only property)
    return adapter


def test_helper_throttles_and_returns_digest():
    clock = FakeClock()
    adapter = _bare_adapter()
    adapter._outbound_notice_guard = _guard(clock=clock)
    event = _make_event()
    assert adapter._apply_outbound_notice_throttle(event, LIMIT_TEXT) == LIMIT_TEXT
    assert adapter._apply_outbound_notice_throttle(event, LIMIT_TEXT) is None


def test_helper_fails_open():
    class _Broken:
        def decide(self, *_a, **_k):
            raise RuntimeError("boom")

    adapter = _bare_adapter()
    adapter._outbound_notice_guard = _Broken()
    assert adapter._apply_outbound_notice_throttle(_make_event(), LIMIT_TEXT) == LIMIT_TEXT


def test_inline_reply_sink_suppresses_echoed_notices():
    """End-to-end at the dispatch sink: five identical handler replies produce one
    send — the echo feedback edge a storm needs is severed at the sink itself."""
    adapter = _bare_adapter()
    clock = FakeClock()
    adapter._outbound_notice_guard = _guard(clock=clock)
    sent = []

    async def _record_send(**kwargs):
        sent.append(kwargs["content"])
        return SimpleNamespace(success=True, message_id="m1")

    adapter._send_with_retry = _record_send

    async def _handler(_event):
        return LIMIT_TEXT

    adapter._message_handler = _handler

    async def _scenario():
        for _ in range(5):
            await adapter._dispatch_inline_reply(_make_event())

    asyncio.run(_scenario())
    assert sent == [LIMIT_TEXT]
