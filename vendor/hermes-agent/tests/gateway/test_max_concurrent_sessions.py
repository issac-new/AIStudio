"""Tests for the gateway max_concurrent_sessions active-session cap."""

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from gateway.config import GatewayConfig, Platform, PlatformConfig
from gateway.platforms.event import MessageEvent, MessageType
from gateway.run import GatewayRunner
from gateway.session import SessionSource, build_session_key


@pytest.fixture(autouse=True)
def _isolated_active_session_registry(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))


class _FakeAdapter:
    def __init__(self):
        self._pending_messages = {}
        self._active_sessions = {}

    async def send(self, chat_id, text, **kwargs):
        return None

    async def interrupt_session_activity(self, session_key, chat_id):
        event = self._active_sessions.get(session_key)
        if event is not None:
            event.set()


def _make_source(chat_id: str = "chat-1") -> SessionSource:
    return SessionSource(
        platform=Platform.TELEGRAM,
        chat_id=chat_id,
        chat_type="dm",
        user_id=f"user-{chat_id}",
    )


def _make_event(text: str = "hello", chat_id: str = "chat-1") -> MessageEvent:
    return MessageEvent(
        text=text,
        message_type=MessageType.TEXT,
        source=_make_source(chat_id),
    )


def _make_runner(max_concurrent_sessions: int | None = None) -> GatewayRunner:
    runner = object.__new__(GatewayRunner)
    runner.config = GatewayConfig(
        platforms={Platform.TELEGRAM: PlatformConfig(enabled=True, token="***")},
        max_concurrent_sessions=max_concurrent_sessions,
    )
    runner.adapters = {Platform.TELEGRAM: _FakeAdapter()}
    runner._running_agents = {}
    runner._running_agents_ts = {}
    runner._active_session_leases = {}
    runner._session_run_generation = {}
    runner._pending_messages = {}
    runner._pending_approvals = {}
    runner._voice_mode = {}
    runner._background_tasks = set()
    runner._draining = False
    runner._restart_requested = False
    runner._restart_task_started = False
    runner._restart_detached = False
    runner._restart_via_service = False
    runner._restart_drain_timeout = 0.0
    runner._stop_task = None
    runner._exit_code = None
    runner._busy_ack_ts = {}
    runner._busy_input_mode = "interrupt"
    runner._busy_text_mode = "interrupt"
    runner._queued_events = {}
    runner._update_runtime_status = MagicMock()
    runner._is_user_authorized = lambda _source: True
    runner.hooks = MagicMock()
    runner.hooks.emit = AsyncMock()
    runner.session_store = MagicMock()
    runner.delivery_router = MagicMock()
    return runner


def _occupy_session(runner: GatewayRunner, chat_id: str = "busy"):
    source = _make_source(chat_id)
    session_key = build_session_key(source)
    runner._running_agents[session_key] = MagicMock()
    runner._running_agents_ts[session_key] = time.time()
    return session_key


def _silence_global_gateway_hooks(monkeypatch):
    monkeypatch.setattr("hermes_cli.plugins.invoke_hook", lambda *args, **kwargs: [])
    monkeypatch.setattr("tools.slash_confirm.get_pending", lambda *args, **kwargs: None)
    monkeypatch.setattr("tools.slash_confirm.clear_if_stale", lambda *args, **kwargs: None)
    monkeypatch.setattr("tools.approval.has_blocking_approval", lambda *args, **kwargs: False)


def test_capacity_refusal_is_not_echoed_and_event_is_queued(monkeypatch):
    """Storm guard: a capacity refusal must never come back as chat text — a bot's
    "session limit" note posted into the room is a new room message that re-triggers
    every agent's dispatch, and each of those refusals echoes again (run4: 97 of 120
    room messages were limit notices). The rejected event is queued for retry instead."""
    _silence_global_gateway_hooks(monkeypatch)
    runner = _make_runner(max_concurrent_sessions=1)
    _occupy_session(runner, "busy")
    event = _make_event(chat_id="new")
    new_key = build_session_key(event.source)

    async def fail_if_agent_runs(self_inner, ev, src, qk, generation):
        raise AssertionError("_handle_message_with_agent should not run at capacity")

    with patch.object(GatewayRunner, "_handle_message_with_agent", fail_if_agent_runs):
        result = asyncio.run(runner._handle_message(event))

    assert result is None  # nothing to publish -> the feedback edge cannot close
    assert new_key not in runner._running_agents
    runner.session_store.get_or_create_session.assert_not_called()
    assert [entry[3] for entry in runner._capacity_retry_queue] == [new_key]
    # the retry pump was scheduled (asyncio.run cancels it at loop shutdown — existence
    # and queue contents are the contract)
    assert runner._capacity_retry_task is not None


def test_capacity_rejected_event_retries_when_slot_frees(monkeypatch):
    _silence_global_gateway_hooks(monkeypatch)
    runner = _make_runner(max_concurrent_sessions=1)
    busy_key = _occupy_session(runner, "busy")
    event = _make_event(chat_id="new")
    adapter = runner.adapters[Platform.TELEGRAM]
    runner.CAPACITY_RETRY_POLL_SEC = 0.02  # shrink the poll tick for the test
    re_dispatched = []

    async def fake_handle(ev):
        re_dispatched.append(ev)

    async def scenario():
        with patch.object(
            GatewayRunner, "_handle_message_with_agent",
            AsyncMock(side_effect=AssertionError("agent must not run at capacity")),
        ):
            assert await runner._handle_message(event) is None
        adapter.handle_message = fake_handle
        runner._delivery_adapter_for = lambda _source: adapter
        # free the slot before the pump's next poll
        runner._running_agents.pop(busy_key, None)
        runner._running_agents_ts.pop(busy_key, None)
        for _ in range(100):
            if re_dispatched:
                break
            await asyncio.sleep(0.02)

    asyncio.run(scenario())
    assert re_dispatched == [event]  # queued work is re-dispatched, never dropped
    assert runner._capacity_retry_queue == []


def test_capacity_retry_preserves_age_and_backs_off(monkeypatch):
    """Re-refused events keep their ORIGINAL first-refusal age (the 20min cap must
    survive the handle_message round trip) and re-enqueue with a backoff deadline so
    a cross-process saturation cannot spin the pump with zero delay."""
    _silence_global_gateway_hooks(monkeypatch)
    runner = _make_runner(max_concurrent_sessions=1)
    _occupy_session(runner, "busy")  # keep the pump in its sleep branch: it must not drain entries mid-test
    event = _make_event(chat_id="new")

    async def enqueue_twice():
        # enqueue needs a running loop (the pump is scheduled via create_task);
        # two entries for the same event model the cross-process refusal round trip
        assert runner._queue_capacity_retry(event, None, "new") is True
        assert runner._queue_capacity_retry(event, None, "new") is True

    asyncio.run(enqueue_twice())
    first = runner._capacity_retry_queue[0]
    second = runner._capacity_retry_queue[-1]
    assert second[0] == first[0]  # age anchored at the FIRST refusal
    assert second[4] > first[4]  # re-refusal backs off behind the first entry
    assert len(runner._capacity_retry_queue) == 2


def test_non_capacity_refusal_still_replies(monkeypatch):
    """Ownership/coordination refusals name an actionable conflict on THIS session and
    keep their reply; only capacity refusals are suppressed and queued."""
    from hermes_cli.active_sessions import SESSION_NOT_OWNED, ActiveSessionRefusal

    _silence_global_gateway_hooks(monkeypatch)
    runner = _make_runner(max_concurrent_sessions=1)
    event = _make_event(chat_id="new")
    refusal = ActiveSessionRefusal("session already owned by someone else", SESSION_NOT_OWNED)
    monkeypatch.setattr(
        GatewayRunner, "_claim_active_session_slot", lambda self, key, source: (None, refusal))

    with patch.object(
        GatewayRunner, "_handle_message_with_agent",
        AsyncMock(side_effect=AssertionError("agent must not run")),
    ):
        result = asyncio.run(runner._handle_message(event))

    assert result == "session already owned by someone else"
    assert getattr(runner, "_capacity_retry_queue", []) == []


def test_status_command_bypasses_active_session_limit(monkeypatch):
    _silence_global_gateway_hooks(monkeypatch)
    runner = _make_runner(max_concurrent_sessions=1)
    _occupy_session(runner, "busy")
    runner._handle_status_command = AsyncMock(return_value="status ok")

    result = asyncio.run(runner._handle_message(_make_event("/status", chat_id="new")))

    assert result == "status ok"
    runner._handle_status_command.assert_awaited_once()


