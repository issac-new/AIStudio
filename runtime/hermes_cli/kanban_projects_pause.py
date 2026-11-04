"""项目暂停状态读取器（732：项目暂停拦机器派单）。

Node 侧把项目生命周期写进 ``<kanban_root>/projects-state.json``
（结构 ``{"version": 1, "projects": {id: {"status": "active"|"paused"|"completed", ...}}}``），
本模块只读该文件，向派单面提供「哪些项目处于 paused」。读取一律
fail-open：文件缺失 / JSON 损坏 / 任何异常都返回空集——暂停面自身的
故障不得拖垮派单主链路。mtime 缓存：文件未变不重读、不重打日志。
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# 模块级缓存：path 字符串 -> (stat 键, paused 集)。stat 键为 (mtime_ns, size)，
# 文件缺席时为 None——持续缺席也命中缓存，debug 日志只在状态变化时打一次。
_PAUSE_CACHE: dict[str, tuple[Optional[tuple[int, int]], frozenset[str]]] = {}


def _pause_state_path() -> Path:
    """``<kanban_root>/projects-state.json``；kanban_root 复用 kanban_db.kanban_home()
    （HERMES_KANBAN_HOME → 默认根），与派单侧板解析同根。延迟导入避免与
    kanban_db 家族的模块装载顺序耦合。"""
    from hermes_cli.kanban_db import kanban_home
    return kanban_home() / "projects-state.json"


def _read_paused(path: Path) -> frozenset[str]:
    """读文件取 status=='paused' 的项目 id 集；缺文件/坏 JSON/IO 异常 → 空集。"""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001 - fail-open：暂停面故障不拦派单
        logger.debug("kanban projects pause: 读取 %s 失败，按无暂停处理（%s）", path, exc)
        return frozenset()
    projects = data.get("projects") if isinstance(data, dict) else None
    if not isinstance(projects, dict):
        return frozenset()
    return frozenset(
        str(pid) for pid, info in projects.items()
        if isinstance(info, dict) and info.get("status") == "paused"
    )


def paused_project_ids() -> frozenset[str]:
    """当前处于 paused 的项目 id 集（mtime 缓存；任何读取异常 → 空集）。"""
    path = _pause_state_path()
    key = str(path)
    try:
        st = path.stat()
        stat_key: Optional[tuple[int, int]] = (st.st_mtime_ns, st.st_size)
    except OSError:
        stat_key = None
    cached = _PAUSE_CACHE.get(key)
    if cached is not None and cached[0] == stat_key:
        return cached[1]
    paused = _read_paused(path)
    _PAUSE_CACHE[key] = (stat_key, paused)
    return paused


def is_project_paused(project_id: Optional[str]) -> bool:
    """project_id 是否处于 paused；None/空串一律 False（无项目归属的卡不受项目暂停约束）。"""
    if not project_id:
        return False
    return project_id in paused_project_ids()
