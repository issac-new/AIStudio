"""agent profile 五级来源 + 热重载判定面（kimi §五 C 表 P1 吸收，矩阵 §3.3）。

kimi 语义（自定义 agent profile 目录：五级来源 + watch 热重载 + --agent）：
- **五级来源**（高→低优先）：env 覆盖 > CLI 指定（--agent/HERMES_PROFILE）>
  项目级 config（repo 内 .hermes/profiles）> 全局 config（~/.hermes/profiles）>
  内置默认（built-in role 名册——衔接 404 agent-roster）。
- **watch 热重载**：profile 目录文件变更（mtime）→ needs_reload 判定（变化即重载，
  防抖窗内不重复触发）；重载动作由调用方执行（判定面纯函数先行）。

现状衔接：hermes 已有 profiles（HERMES_HOME/profiles + HERMES_CUSTOM 切换）——
本模块只补**热重载判定面**（五级合并解析+变更检测），不动既有加载器。
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Optional

DEFAULT_DEBOUNCE_MS = 300


@dataclass
class ProfileSources:
    """五级来源解析结果（高→低已合并；resolved 来自哪级留痕）。"""

    profile_id: str
    resolved_from: str  # 'env' | 'cli' | 'project' | 'global' | 'builtin'
    directory: Optional[str] = None  # profile 目录（watch 面）


def resolve_profile_sources(
    *,
    env_profile: Optional[str] = None,
    cli_profile: Optional[str] = None,
    project_profile: Optional[str] = None,
    global_profile: Optional[str] = None,
    builtin: str = "default",
) -> ProfileSources:
    """五级来源合并（kimi 优先级序）；每级命中即停（高优先级胜出）。"""
    if env_profile:
        return ProfileSources(env_profile, "env")
    if cli_profile:
        return ProfileSources(cli_profile, "cli")
    if project_profile:
        return ProfileSources(project_profile, "project")
    if global_profile:
        return ProfileSources(global_profile, "global")
    return ProfileSources(builtin, "builtin")


def resolve_profile_id(*, builtin: str = "default") -> ProfileSources:
    """从进程环境解析五级（HERMES_PROFILE=env/CLI 同源，其余留接口给加载器）。"""
    return resolve_profile_sources(
        env_profile=os.environ.get("HERMES_PROFILE_OVERRIDE") or None,
        cli_profile=os.environ.get("HERMES_PROFILE") or None,
        builtin=builtin,
    )


@dataclass
class ReloadWatch:
    """profile 目录热重载判定（mtime 比对+防抖；重载动作由调用方跑）。"""

    debounce_ms: int = DEFAULT_DEBOUNCE_MS
    _last_mtime: Optional[float] = None
    _last_fire: float = 0.0

    def observe(self, files: dict[str, float], now: Optional[float] = None) -> bool:
        """files={路径: mtime}；返回是否需要重载（变化且过防抖窗）。"""
        if not files:
            return False
        cur = max(files.values())
        now = time.time() if now is None else now
        changed = self._last_mtime is not None and cur > self._last_mtime
        first = self._last_mtime is None
        self._last_mtime = cur
        if first:
            return False  # 首观测只建基线
        if not changed:
            return False
        if (now - self._last_fire) * 1000 < self.debounce_ms:
            return False  # 防抖窗内不重复触发
        self._last_fire = now
        return True

    def reset(self) -> None:
        self._last_mtime = None
        self._last_fire = 0.0
