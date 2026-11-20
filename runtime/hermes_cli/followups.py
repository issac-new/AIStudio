"""Agent 自设 follow-up 定时器（Always-on Agents 吸收 P3，2026-11-16）。

语义来源（Anthropic《Building always-on agents》定时器）：follow-up 是 agent 给自己
设的一次性提醒（“一小时后检查对方是否回复”），与用户日程（cron）分开治理。到期后
**不新开会话**，而是唤醒原会话继续——这是与 cron 一次性任务的本质区别。

存储：SessionDB ``state_meta``，键 ``followup:<id>``（JSON）；扫描走
``list_meta_prefix``（与 /loop 同构，loops.py:307）。单一写者假设同 /loop：网关是
唯一 watcher；跨进程并发由 active-session lease 兜底。

状态机：active → firing（claim，attempts+1）→ fired / failed；cancelled 为终态。
崩溃恢复：watcher 启动时把超过 5 分钟仍 firing 的行重置为 active（at-most-once 注入
的代价是可能丢一次，rather than 无限重放）。
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from dataclasses import asdict, dataclass, field
from typing import Any, Optional

logger = logging.getLogger(__name__)

_META_PREFIX = "followup:"
MAX_ACTIVE_PER_SESSION = 20
MAX_PROMPT_CHARS = 2000
MIN_DELAY_SECONDS = 60
MAX_DELAY_SECONDS = 30 * 86400
STALE_FIRING_SECONDS = 300


@dataclass
class FollowupState:
    """一条 follow-up 的持久状态。"""

    id: str
    session_id: str
    prompt: str
    status: str = "active"  # active | firing | fired | cancelled | failed
    created_at: float = 0.0
    due_at: float = 0.0
    fired_at: float = 0.0
    attempts: int = 0
    last_error: str = ""
    # 网关路由（platform/chat_id/chat_type/thread_id/user_id/user_name/scope_id），
    # 创建时捕获；空 route = CLI/TUI 无路由，watcher 不注入。
    route: dict[str, str] = field(default_factory=dict)

    def to_json(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False)

    @classmethod
    def from_json(cls, raw: str) -> "FollowupState":
        data = json.loads(raw)
        route = data.get("route")
        return cls(
            id=str(data.get("id", "")),
            session_id=str(data.get("session_id", "")),
            prompt=str(data.get("prompt", "")),
            status=str(data.get("status", "active")),
            created_at=float(data.get("created_at") or 0.0),
            due_at=float(data.get("due_at") or 0.0),
            fired_at=float(data.get("fired_at") or 0.0),
            attempts=int(data.get("attempts") or 0),
            last_error=str(data.get("last_error") or ""),
            route={str(k): str(v) for k, v in route.items() if v} if isinstance(route, dict) else {},
        )


def _meta_key(followup_id: str) -> str:
    return f"{_META_PREFIX}{followup_id}"


def _get_session_db() -> Optional[Any]:
    """与 goals/loops 共用同一 SessionDB 连接（冷启动 bootstrap 不在 watcher 线程跑）。"""
    try:
        from hermes_cli.goals import _get_session_db as _goals_db
    except Exception as exc:  # pragma: no cover - defensive
        logger.debug("Followups: SessionDB bootstrap failed (%s)", exc)
        return None
    return _goals_db()


def _db_op(label: str, fn, default=None):
    try:
        return fn()
    except Exception as exc:  # pragma: no cover - defensive
        logger.debug("Followups: %s failed: %s", label, exc)
        return default


def _parse(raw: str, followup_id: str = "") -> Optional[FollowupState]:
    try:
        state = FollowupState.from_json(raw)
    except Exception as exc:
        if followup_id:
            logger.warning("Followups: could not parse stored follow-up %s: %s", followup_id, exc)
        return None
    return state if state.id else None


def _save(state: FollowupState) -> bool:
    db = _get_session_db()
    if db is None:
        return False
    try:
        db.state_meta.set(_meta_key(state.id), state.to_json())
        return True
    except Exception as exc:  # pragma: no cover - defensive
        logger.debug("Followups: set_meta failed: %s", exc)
        return False


def _iter_stored() -> list[FollowupState]:
    db = _get_session_db()
    if db is None:
        return []
    entries = _db_op("list_meta_prefix", lambda: db.state_meta.list_prefix(_META_PREFIX), []) or []
    out: list[FollowupState] = []
    for entry in entries:
        key, raw = entry.key, entry.value
        fid = key[len(_META_PREFIX):]
        state = _parse(raw, fid) if fid and raw else None
        if state is not None:
            out.append(state)
    return out


def capture_route() -> Optional[dict[str, str]]:
    """从当前回合的会话环境捕获可回访路由；无 platform/chat_id（CLI/TUI）= None。"""
    from gateway.session_context import get_session_env

    platform = (get_session_env("HERMES_SESSION_PLATFORM", "") or "").strip()
    chat_id = (get_session_env("HERMES_SESSION_CHAT_ID", "") or "").strip()
    if not (platform and chat_id):
        return None
    route = {
        "platform": platform,
        "chat_id": chat_id,
        "chat_type": (get_session_env("HERMES_SESSION_CHAT_TYPE", "") or "").strip(),
        "thread_id": (get_session_env("HERMES_SESSION_THREAD_ID", "") or "").strip(),
        "user_id": (get_session_env("HERMES_SESSION_USER_ID", "") or "").strip(),
        "user_name": (get_session_env("HERMES_SESSION_USER_NAME", "") or "").strip(),
        "scope_id": (get_session_env("HERMES_SESSION_SCOPE_ID", "") or "").strip(),
    }
    return {k: v for k, v in route.items() if v}


def create_followup(
    session_id: str,
    prompt: str,
    delay_seconds: float,
    route: Optional[dict[str, str]] = None,
    now: Optional[float] = None,
) -> FollowupState:
    """创建一条 follow-up（校验失败抛 ValueError，由工具层转成用户可见错误）。"""
    if not session_id:
        raise ValueError("session_id 缺失")
    text = (prompt or "").strip()
    if not text:
        raise ValueError("prompt 必填")
    if len(text) > MAX_PROMPT_CHARS:
        raise ValueError(f"prompt 超长（>{MAX_PROMPT_CHARS} 字符）")
    delay = float(delay_seconds)
    if not (MIN_DELAY_SECONDS <= delay <= MAX_DELAY_SECONDS):
        raise ValueError(f"delay 须在 {MIN_DELAY_SECONDS}s..{MAX_DELAY_SECONDS}s 之间")
    if not route:
        raise ValueError("当前会话没有可回访路由（CLI/TUI）；请改用 cronjob_manage 创建独立任务")
    active = [s for s in _iter_stored() if s.session_id == session_id and s.status in ("active", "firing")]
    if len(active) >= MAX_ACTIVE_PER_SESSION:
        raise ValueError(f"同一会话活跃 follow-up 已达上限 {MAX_ACTIVE_PER_SESSION}")

    at = now if now is not None else time.time()
    state = FollowupState(
        id=uuid.uuid4().hex[:12],
        session_id=session_id,
        prompt=text,
        created_at=at,
        due_at=at + delay,
        route=dict(route),
    )
    if not _save(state):
        raise ValueError("follow-up 存储不可用（SessionDB 未就绪）")
    logger.info("Followup created %s for session %s due in %.0fs", state.id, session_id, delay)
    return state


def list_followups(session_id: str) -> list[FollowupState]:
    return [s for s in _iter_stored() if s.session_id == session_id]


def list_due_followups(now: Optional[float] = None) -> list[FollowupState]:
    at = now if now is not None else time.time()
    return [s for s in _iter_stored() if s.status == "active" and 0 < s.due_at <= at]


def claim_followup(followup_id: str) -> Optional[FollowupState]:
    """active → firing（attempts+1）；已被别人 claim/非 active 返回 None。"""
    for s in _iter_stored():
        if s.id != followup_id:
            continue
        if s.status != "active":
            return None
        s.status = "firing"
        s.attempts += 1
        return s if _save(s) else None
    return None


def mark_fired(followup_id: str, now: Optional[float] = None) -> Optional[FollowupState]:
    at = now if now is not None else time.time()
    for s in _iter_stored():
        if s.id != followup_id:
            continue
        s.status = "fired"
        s.fired_at = at
        s.last_error = ""
        return s if _save(s) else None
    return None


def release_followup(followup_id: str, error: str = "", max_attempts: int = 3) -> Optional[FollowupState]:
    """注入失败：未到上限回 active（下一 tick 重试），到上限转 failed（死信）。"""
    for s in _iter_stored():
        if s.id != followup_id:
            continue
        s.last_error = (error or "")[:300]
        s.status = "failed" if s.attempts >= max_attempts else "active"
        return s if _save(s) else None
    return None


def cancel_followup(followup_id: str, session_id: Optional[str] = None) -> bool:
    for s in _iter_stored():
        if s.id != followup_id:
            continue
        if session_id is not None and s.session_id != session_id:
            return False
        if s.status in ("fired", "cancelled"):
            return False
        s.status = "cancelled"
        return _save(s)
    return False


def recover_stale_firing(now: Optional[float] = None, older_than_seconds: float = STALE_FIRING_SECONDS) -> int:
    """watcher 启动自愈：把崩溃遗留的 firing 行重置为 active（超时窗口外）。"""
    at = now if now is not None else time.time()
    fixed = 0
    for s in _iter_stored():
        if s.status != "firing":
            continue
        # firing 没有单独时间戳，用 due_at 近似（claim 发生在到期后）。
        if at - s.due_at >= older_than_seconds:
            s.status = "active"
            if _save(s):
                fixed += 1
    if fixed:
        logger.info("Followups: recovered %d stale firing row(s)", fixed)
    return fixed


def store_has_active_followup(db: Any) -> bool:
    """idle gate：该库有 active/firing 行（或无法解析的未知行）→ True。"""
    for entry in db.state_meta.list_prefix(_META_PREFIX):
        raw = entry.value
        state = _parse(raw, entry.key[len(_META_PREFIX):]) if raw else None
        if state is None or state.status in ("active", "firing"):
            return True
    return False
