"""会话遥测 sidecar（长会话治理 602）：每回合后把会话健康画像落到
``<HERMES_HOME>/runtime/sessions-telemetry.json``，供 studio 集群巡检消费
（D9 上下文水位 / D10 回合节奏 / D11 环检测信号）。

设计要点：
- **fail-open**：遥测失败只 warn，绝不影响回合路径（遥测是旁路，不是门禁）。
- **进程内累计 + 落盘快照**：turns / cum_api_calls / 空转连击 / 轮换计数在模块态
  累计（网关进程拥有会话），每次记录后原子写盘（tmp+rename），LRU 有界 64 会话。
- **多 profile 感知**：落盘路径按调用时的 hermes home 解析（multiplex 网关每个
  profile 各得一份 sidecar）。
- **消费方零耦合**：studio 侧 fail-soft 读文件（同 capacity_retry.json 约定，
  10 分钟陈旧度语义由消费方判定）。
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
import time
from contextlib import suppress
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

SIDECAR_NAME = "sessions-telemetry.json"
MAX_SESSIONS = 64
_STALE_RESET_SEC = 7 * 24 * 3600  # 一周无更新即整条淘汰（防陈旧会话占坑）

# 进程内累计态：session_key -> dict（turns/cum_api_calls/empty_streak/rotations/…）
_STATE: Dict[str, Dict[str, Any]] = {}


def _sidecar_path() -> Optional[Path]:
    try:
        from hermes_constants import get_hermes_home
        runtime_dir = get_hermes_home() / "runtime"
        runtime_dir.mkdir(parents=True, exist_ok=True)
        return runtime_dir / SIDECAR_NAME
    except Exception:  # noqa: BLE001
        return None


def _atomic_write_json(path: Path, payload: Dict[str, Any]) -> None:
    fd, tmp_name = tempfile.mkstemp(dir=str(path.parent), prefix=".sessions-telemetry.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as tmp:
            json.dump(payload, tmp, ensure_ascii=False)
        os.replace(tmp_name, path)
    except Exception:  # noqa: BLE001
        with suppress(OSError):
            os.unlink(tmp_name)
        raise


def _cached_agent(gateway: Any, session_key: str) -> Any:
    """从网关代理缓存取当前 agent 实例（读心跳/runaway 计数用）；锁内快读，失败返 None。"""
    cache = getattr(gateway, "_agent_cache", None)
    if not isinstance(cache, dict):
        return None
    lock = getattr(gateway, "_agent_cache_lock", None)
    try:
        if lock is not None:
            with lock:
                entry = cache.get(session_key)
        else:
            entry = cache.get(session_key)
        return entry[0] if entry else None
    except Exception:  # noqa: BLE001
        return None


def _agent_health_counters(agent: Any) -> Dict[str, Any]:
    """心跳（601）与 runaway（401/605）计数；agent 缺席/属性缺席一律 fail-open。"""
    out: Dict[str, Any] = {}
    with suppress(Exception):
        from agent.rule_heartbeat import heartbeat_counters
        out["heartbeat"] = heartbeat_counters(agent)
    guard = getattr(agent, "_runaway_guard", None)
    last = getattr(agent, "_last_runaway_signal", None)
    if last is not None:
        out["runaway"] = {
            "signal": getattr(last, "signal", None),
            "tool": getattr(last, "tool", None),
            "count": getattr(last, "count", None),
            "decisions": getattr(agent, "_runaway_decisions", 0),
        }
    elif guard is not None:
        out["runaway"] = {"signal": None, "decisions": getattr(agent, "_runaway_decisions", 0)}
    return out


def _int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def note_rotation(session_key: str, reason: str = "") -> None:
    """轮换计数（603 调用；report/auto 两档都计）。ts 必补——缺席会被陈旧淘汰立即清除。"""
    entry = _STATE.setdefault(session_key, {})
    entry["rotations"] = _int(entry.get("rotations")) + 1
    entry["last_rotation_reason"] = reason or entry.get("last_rotation_reason", "")
    entry["ts"] = time.time()
    _flush_entry(session_key, entry)


def _flush_entry(session_key: str, entry: Dict[str, Any]) -> None:
    path = _sidecar_path()
    if path is None:
        return
    with suppress(Exception):
        existing: Dict[str, Any] = {}
        if path.is_file():
            existing = json.loads(path.read_text(encoding="utf-8")) or {}
        existing[session_key] = entry
        # LRU 有界 + 陈旧淘汰（ts 缺席的条目不参与淘汰判定——防自清除）
        now = time.time()
        for key in list(existing.keys()):
            if isinstance(existing.get(key), dict):
                ts = existing[key].get("ts")
                if isinstance(ts, (int, float)) and now - float(ts) > _STALE_RESET_SEC:
                    del existing[key]
        while len(existing) > MAX_SESSIONS:
            oldest = min(existing.items(), key=lambda kv: float(kv[1].get("ts", 0)) if isinstance(kv[1], dict) else 0)
            del existing[oldest[0]]
        _atomic_write_json(path, existing)


def record_turn_telemetry(
    gateway: Any, session_entry: Any, agent_result: Any, source: Any,
) -> None:
    """回合后钩子（run_turn.py 调用，一处一行）；全函数 fail-open。"""
    try:
        if session_entry is None or not isinstance(agent_result, dict):
            return
        session_key = getattr(session_entry, "session_key", "") or ""
        if not session_key:
            return
        api_calls = _int(agent_result.get("api_calls"))
        final_response = agent_result.get("final_response") or agent_result.get("error") or ""
        tools = agent_result.get("tools") or []
        empty_turn = api_calls > 0 and not tools and not str(final_response).strip()

        prompt_tokens = _int(agent_result.get("last_prompt_tokens"))
        context_length = _int(agent_result.get("context_length"))
        watermark_pct = round(prompt_tokens * 100.0 / context_length, 1) if context_length > 0 else None

        entry = _STATE.setdefault(session_key, {})
        entry["turns"] = _int(entry.get("turns")) + 1
        entry["cum_api_calls"] = _int(entry.get("cum_api_calls")) + api_calls
        entry["empty_streak"] = _int(entry.get("empty_streak")) + 1 if empty_turn else 0
        entry["ts"] = time.time()
        entry["session_id"] = getattr(session_entry, "session_id", "")
        entry["platform"] = getattr(getattr(source, "platform", None), "value", "") or ""
        entry["model"] = agent_result.get("model")
        entry["last_prompt_tokens"] = prompt_tokens
        entry["context_length"] = context_length
        entry["watermark_pct"] = watermark_pct
        entry["turn_api_calls"] = api_calls
        entry["session_total_tokens"] = _int(getattr(session_entry, "total_tokens", 0))
        entry["session_output_tokens"] = _int(getattr(session_entry, "output_tokens", 0))

        agent = _cached_agent(gateway, session_key)
        entry.update(_agent_health_counters(agent))
        # 611（run16 实证）：本回合撞会话迭代上限标记——agent.max_iterations 耗尽
        # （Turn ended: max_iterations_reached）时 api_calls==上限，run16 21:18 该
        # 形态 60 分钟无人接管（603 三判据全不咬：60 调用 << 400 阈值）。轮换件消费。
        _iter_cap = _int(getattr(agent, "max_iterations", 0))
        entry["turn_hit_iter_cap"] = bool(_iter_cap and api_calls >= _iter_cap)
        entry["rotations"] = _int(entry.get("rotations"))
        _flush_entry(session_key, entry)
    except Exception:  # noqa: BLE001 - 遥测旁路绝不冒泡
        logger.debug("session telemetry record failed", exc_info=True)


def read_state(session_key: str = "") -> Any:
    """测试/诊断读数：无参返整个 sidecar dict，有参返该会话条目。"""
    path = _sidecar_path()
    if path is None or not path.is_file():
        return {} if not session_key else None
    with suppress(Exception):
        data = json.loads(path.read_text(encoding="utf-8")) or {}
        return data.get(session_key) if session_key else data
    return {} if not session_key else None


def reset_state() -> None:
    """测试隔离：清进程内累计态（不动磁盘）。"""
    _STATE.clear()
