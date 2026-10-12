"""会话轮换策略（长会话治理 603）：按遥测水位判定"该换会话了"，防止长会话质量衰减固化。

三类触发判据（全部来自 602 遥测累计态，进程内、随网关存续）：
- ``cum_api_calls`` 累计迭代数超限（默认 400）——注意力稀释的机械代理指标；
- ``watermark_streak`` 连续 N 回合（默认 2）上下文水位 ≥85% 且压缩没能压下来——
  压缩失效场景（与 run_turn 既有 hygiene 阈值同口径，但那是"压缩前预压"，这里是
  "压完仍高"的轮换信号）；
- ``empty_streak`` 连续 N 回合（默认 8）有 API 调用但零工具零产出——空转停滞。

两档执行（默认 report，推演轮验证后翻 auto）：
- **report**：只追加一条建议通知 + 记轮换计数（602 sidecar 可见），不动会话——
  影子验证档；
- **auto**：完全复用压缩耗尽漏斗（reset_session + _evict_cached_agent +
  _clear_conversation_scope + 用户通知）， Telegram topic 绑定同步同款；
  交接检查点由 604 在本模块接入（轮换前落检查点，新会话冷启动可读）。

防风暴：轮换后 ``cooldown_turns``（默认 5）回合内不再触发；compression_exhausted /
compression_deferred 回合让位给既有耗尽复位路径（不双重复位）。

配置：config.yaml ``session_rotation:`` 节（mode/max_session_api_calls/watermark_pct/
watermark_streak/empty_streak_limit/cooldown_turns）；环境变量
``HERMES_SESSION_ROTATION=off|report|auto`` 覆盖 mode（推演轮翻转用）。
"""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import suppress
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

VALID_MODES = ("off", "report", "auto")

DEFAULTS = {
    "mode": "report",
    "max_session_api_calls": 400,
    "watermark_pct": 0.85,
    "watermark_streak": 2,
    "empty_streak_limit": 8,
    "cooldown_turns": 5,
}

# 进程内轮换簿记：session_key -> {"last_watermarks": [...], "last_rotation_turn": int}
_BOOK: Dict[str, Dict[str, Any]] = {}

REPORT_NOTICE = (
    "\n\n[session rotation recommended] This session has hit a long-session health "
    "limit ({reason}). Auto-rotation is disabled (report mode); consider /new to "
    "start fresh with a handoff checkpoint."
)
AUTO_NOTICE = (
    "\n\n[session rotated] This session hit a long-session health limit ({reason}) "
    "and was rotated to a fresh session; a handoff checkpoint was persisted."
)


@dataclass
class RotationDecision:
    rotate: bool
    reason: str = ""


def _load_settings(gateway: Any) -> Dict[str, Any]:
    cfg = dict(DEFAULTS)
    with suppress(Exception):
        from gateway.run import _load_gateway_config
        data = _load_gateway_config() or {}
        section = data.get("session_rotation")
        if isinstance(section, dict):
            for key in ("max_session_api_calls", "watermark_streak", "empty_streak_limit", "cooldown_turns"):
                with suppress(TypeError, ValueError):
                    value = int(section.get(key, cfg[key]))
                    if value > 0:
                        cfg[key] = value
            with suppress(TypeError, ValueError):
                pct = float(section.get("watermark_pct", cfg["watermark_pct"]))
                if 0.1 <= pct <= 1.0:
                    cfg["watermark_pct"] = pct
            mode = str(section.get("mode", "")).strip().lower()
            if mode in VALID_MODES:
                cfg["mode"] = mode
    env_mode = os.environ.get("HERMES_SESSION_ROTATION", "").strip().lower()
    if env_mode in VALID_MODES:
        cfg["mode"] = env_mode
    return cfg


def should_rotate(entry: Optional[Dict[str, Any]], settings: Dict[str, Any],
                  book: Dict[str, Any]) -> RotationDecision:
    """纯判定（可测）：entry 为 602 遥测条目；book 为本模块簿记。"""
    if not isinstance(entry, dict):
        return RotationDecision(False)
    reason = ""

    if _int(entry.get("cum_api_calls")) >= settings["max_session_api_calls"]:
        reason = "cumulative-api-calls"

    watermark = entry.get("watermark_pct")
    last_marks = book.setdefault("last_watermarks", [])
    if isinstance(watermark, (int, float)) and watermark >= settings["watermark_pct"] * 100:
        last_marks.append(float(watermark))
    else:
        last_marks.clear()
    del last_marks[:-settings["watermark_streak"]]
    if not reason and len(last_marks) >= settings["watermark_streak"]:
        reason = "watermark-stuck"

    if not reason and _int(entry.get("empty_streak")) >= settings["empty_streak_limit"]:
        reason = "empty-streak"

    # 611（run16 实证）：迭代上限出口触发——回合在 agent.max_iterations 耗尽处结束
    # （max_iterations_reached），任务多半进行到一半；auto 档即刻轮换+604 移交
    # 检查点=运行时原生续作（run16 靠监控手工续作令 60 分钟的机制化替代）。
    if not reason and entry.get("turn_hit_iter_cap"):
        reason = "iteration-cap-exit"

    if not reason:
        return RotationDecision(False)

    # 冷却窗：上次轮换后 N 回合内不再触发（防轮换风暴）
    turns = _int(entry.get("turns"))
    if turns - _int(book.get("last_rotation_turn")) <= settings["cooldown_turns"] \
            and _int(book.get("last_rotation_turn")) > 0:
        return RotationDecision(False)
    return RotationDecision(True, reason)


def _int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


async def maybe_rotate_session(
    gateway: Any, agent_result: Any, response: str, session_entry: Any,
    session_key: str, source: Any,
) -> Tuple[str, Any]:
    """回合后钩子（run_turn.py 一处两行调用）；返回 (response, session_entry)。

    compression_exhausted / compression_deferred 回合让位给既有耗尽复位路径；
    全函数 fail-soft：轮换面故障绝不冒泡进回合路径。
    """
    try:
        if not session_key or not isinstance(agent_result, dict):
            return response, session_entry
        if agent_result.get("compression_exhausted") or agent_result.get("compression_deferred"):
            return response, session_entry

        settings = _load_settings(gateway)
        mode = settings["mode"]
        if mode == "off":
            return response, session_entry

        from gateway.session_telemetry import _STATE, note_rotation
        entry = _STATE.get(session_key)
        book = _BOOK.setdefault(session_key, {})
        decision = should_rotate(entry, settings, book)
        if not decision.rotate:
            return response, session_entry
        book["last_rotation_turn"] = _int((entry or {}).get("turns"))
        reason = decision.reason

        if mode == "report":
            note_rotation(session_key, reason=f"report:{reason}")
            logger.info(
                "Session rotation recommended for %s (%s); auto-rotate disabled (report mode).",
                session_key, reason,
            )
            return (response or "") + REPORT_NOTICE.format(reason=reason), session_entry

        # auto：复用压缩耗尽漏斗（reset + evict + 清会话作用域 + 通知）；
        # 轮换前落交接检查点（604），轮换后把检查点 note 挂给新会话首回合 sidecar。
        logger.info("Auto-rotating session %s (long-session limit: %s).", session_key, reason)
        note_rotation(session_key, reason=f"auto:{reason}")
        checkpoint_note = ""
        with suppress(Exception):
            from agent.handoff_checkpoint import (
                build_checkpoint_note, checkpoint_from_turn, write_checkpoint,
            )
            record = checkpoint_from_turn(session_key, session_entry, agent_result, entry, reason)
            if write_checkpoint(session_key, "rotation", record) is not None:
                checkpoint_note = build_checkpoint_note(record)
        new_entry = await gateway.async_session_store.reset_session(session_key)
        gateway._evict_cached_agent(session_key)
        gateway._clear_conversation_scope(session_key, reason=f"long_session_rotation:{reason}")
        if new_entry is not None:
            session_entry = new_entry
            with suppress(Exception):
                await asyncio.to_thread(
                    gateway._sync_telegram_topic_binding, source, session_entry,
                    reason="long-session-rotation",
                )
        if checkpoint_note:
            with suppress(Exception):
                gateway._set_pending_turn_sidecar_notes(session_key, [checkpoint_note])
        return (response or "") + AUTO_NOTICE.format(reason=reason), session_entry
    except Exception:  # noqa: BLE001 - 轮换面故障绝不冒泡
        logger.warning("session rotation check failed", exc_info=True)
        return response, session_entry


def reset_book() -> None:
    """测试隔离：清进程内簿记。"""
    _BOOK.clear()
