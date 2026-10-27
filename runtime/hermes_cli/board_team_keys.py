"""板级团队键选择（单一源）。

``board.json`` 有两个历史键：
- ``profiles``：dispatcher team-fence 契约键（早期围栏只认它）
- ``profile_scope``：板生命周期/创建入口实际写入的键（live 板实测）
两者都表示「这块板挂哪些 agent」，围栏必须同源识别；``profiles`` 优先，
缺失才回落 ``profile_scope``。非 dict / 两键皆缺 → ``None``（无围栏）。
"""

from __future__ import annotations

from typing import Any, Optional


def team_raw(meta: Any) -> Optional[Any]:
    if not isinstance(meta, dict):
        return None
    raw = meta.get("profiles")
    if raw is None:
        raw = meta.get("profile_scope")
    return raw
