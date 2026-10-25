"""会话轮换（603）：纯判定三判据、report/auto 两档、冷却窗、让位耗尽路径。"""
import asyncio
import zoneinfo  # noqa: F401 预导入：本机 venv 标准库位于真实 hermes home 下，护栏窗口内
                 # 惰性导入会被 home_io_guard 误伤并级联炸掉报告器（同 602 测试）。
from types import SimpleNamespace

import pytest

from gateway import session_rotation as sr
from gateway.session_rotation import DEFAULTS, should_rotate


@pytest.fixture(autouse=True)
def _isolate(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    monkeypatch.delenv("HERMES_SESSION_ROTATION", raising=False)
    sr.reset_book()
    from gateway import session_telemetry as st
    st.reset_state()
    yield
    sr.reset_book()
    st.reset_state()


def _entry(**kw):
    base = {"turns": 10, "cum_api_calls": 50, "watermark_pct": 40.0, "empty_streak": 0}
    base.update(kw)
    return base


def test_no_rotation_on_healthy_session():
    assert should_rotate(_entry(), DEFAULTS, {}).rotate is False


def test_reason_cumulative_api_calls():
    d = should_rotate(_entry(cum_api_calls=401), DEFAULTS, {})
    assert d.rotate and d.reason == "cumulative-api-calls"


def test_reason_watermark_streak_needs_consecutive():
    book = {}
    assert should_rotate(_entry(watermark_pct=90.0), DEFAULTS, book).rotate is False
    d = should_rotate(_entry(watermark_pct=88.0), DEFAULTS, book)
    assert d.rotate and d.reason == "watermark-stuck"
    # 中途回落清零
    book2 = {}
    should_rotate(_entry(watermark_pct=90.0), DEFAULTS, book2)
    assert should_rotate(_entry(watermark_pct=50.0), DEFAULTS, book2).rotate is False
    assert should_rotate(_entry(watermark_pct=90.0), DEFAULTS, book2).rotate is False


def test_reason_empty_streak():
    d = should_rotate(_entry(empty_streak=8), DEFAULTS, {})
    assert d.rotate and d.reason == "empty-streak"


def test_cooldown_window_suppresses():
    book = {"last_rotation_turn": 10}
    # turns=11 与上次轮换同冷却窗内（cooldown 5）——即使判据命中也不轮换
    assert should_rotate(_entry(turns=11, cum_api_calls=401), DEFAULTS, book).rotate is False
    assert should_rotate(_entry(turns=15, cum_api_calls=401), DEFAULTS, book).rotate is False
    assert should_rotate(_entry(turns=16, cum_api_calls=401), DEFAULTS, book).rotate is True


def test_missing_entry_is_noop():
    assert should_rotate(None, DEFAULTS, {}).rotate is False


class _FakeStore:
    def __init__(self):
        self.reset_called = []

    async def reset_session(self, key, display_name=None):
        self.reset_called.append(key)
        return SimpleNamespace(session_key=key, session_id="fresh")


def _fake_gateway(monkeypatch, mode):
    monkeypatch.setenv("HERMES_SESSION_ROTATION", mode)
    gw = SimpleNamespace(
        async_session_store=_FakeStore(),
        _evict_cached_agent=lambda k: None,
        _clear_conversation_scope=lambda k, reason=None: None,
        _sync_telegram_topic_binding=lambda *a, **kw: None,
    )
    return gw


def _seed_state(monkeypatch, tmp_path, **kw):
    from gateway import session_telemetry as st
    st._STATE["k1"] = _entry(**kw)
    return st


@pytest.mark.asyncio
async def test_report_mode_notice_without_reset(tmp_path, monkeypatch):
    st = _seed_state(monkeypatch, tmp_path, cum_api_calls=401)
    gw = _fake_gateway(monkeypatch, "report")
    response, entry = await sr.maybe_rotate_session(
        gw, {"api_calls": 1}, "ok", SimpleNamespace(session_key="k1"), "k1", None)
    assert gw.async_session_store.reset_called == []
    assert "session rotation recommended" in response
    assert "cumulative-api-calls" in response
    assert st._STATE["k1"]["rotations"] == 1
    assert st._STATE["k1"]["last_rotation_reason"] == "report:cumulative-api-calls"


@pytest.mark.asyncio
async def test_auto_mode_uses_exhaustion_funnel(tmp_path, monkeypatch):
    st = _seed_state(monkeypatch, tmp_path, cum_api_calls=401)
    gw = _fake_gateway(monkeypatch, "auto")
    response, entry = await sr.maybe_rotate_session(
        gw, {"api_calls": 1}, "ok", SimpleNamespace(session_key="k1"), "k1", None)
    assert gw.async_session_store.reset_called == ["k1"]
    assert "session rotated" in response
    assert entry.session_id == "fresh"  # 换成新条目
    assert st._STATE["k1"]["last_rotation_reason"] == "auto:cumulative-api-calls"


@pytest.mark.asyncio
async def test_exhaustion_path_takes_precedence(tmp_path, monkeypatch):
    _seed_state(monkeypatch, tmp_path, cum_api_calls=401)
    gw = _fake_gateway(monkeypatch, "auto")
    response, entry = await sr.maybe_rotate_session(
        gw, {"api_calls": 1, "compression_exhausted": True}, "ok",
        SimpleNamespace(session_key="k1"), "k1", None)
    assert gw.async_session_store.reset_called == []
    assert response == "ok"


@pytest.mark.asyncio
async def test_off_mode_and_fail_soft(tmp_path, monkeypatch):
    _seed_state(monkeypatch, tmp_path, cum_api_calls=401)
    gw = _fake_gateway(monkeypatch, "off")
    response, _ = await sr.maybe_rotate_session(
        gw, {"api_calls": 1}, "ok", SimpleNamespace(session_key="k1"), "k1", None)
    assert response == "ok"
    # 崩溃面也不冒泡（auto 档 + 缺方法的残缺网关）
    monkeypatch.setenv("HERMES_SESSION_ROTATION", "auto")
    bad = SimpleNamespace(async_session_store=None)
    response, _ = await sr.maybe_rotate_session(
        bad, {"api_calls": 1}, "ok", SimpleNamespace(session_key="k1"), "k1", None)
    assert response == "ok"


def test_wiring_run_turn_calls_rotation():
    from pathlib import Path
    import gateway.run_turn as rt
    source = Path(rt.__file__).read_text(encoding="utf-8")
    assert "from gateway.session_rotation import maybe_rotate_session" in source


def test_iter_cap_exit_triggers_rotation():
    """611（run16 实证）：迭代上限出口=第四触发——回合在 max_iterations 耗尽处
    结束（遥测记 turn_hit_iter_cap）即建议轮换；冷却窗照常适用。run16 21:18
    fanfan G5 修订会话死于 60/60 上限、60 分钟无人接管的机制化根治。"""
    import gateway.session_rotation as sr
    d = sr.should_rotate({"turn_hit_iter_cap": True}, sr.DEFAULTS, {})
    assert d.rotate is True and d.reason == "iteration-cap-exit"
    # 三老判据不动：无标记+低水位+低调用数=不轮换
    assert sr.should_rotate({"cum_api_calls": 10}, sr.DEFAULTS, {}).rotate is False
    # 冷却窗内不重复触发
    d2 = sr.should_rotate({"turn_hit_iter_cap": True}, sr.DEFAULTS,
                          {"last_rotation_turn": 1})
    # turns 缺省 0-1<=5 → 冷却内不轮换
    assert d2.rotate is False
