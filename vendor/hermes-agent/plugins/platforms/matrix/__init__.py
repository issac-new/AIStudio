"""Matrix plugin: registers the inbound platform adapter and the room-ops agent tools
(`matrix_room_create` / `matrix_room_invite` / `matrix_room_list`) through PluginContext."""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

__all__ = ["register"]


def register(ctx) -> None:
    """Plugin entry point. Room-ops tools register even if the adapter import fails,
    so scripts and cron-driven turns can still manage rooms without a live gateway."""
    try:
        from .tools import register_tools
        register_tools(ctx)
    except Exception:  # noqa: BLE001 - a tools failure must not drop the platform
        logger.warning("Matrix: failed to register room-ops tools", exc_info=True)
    from .adapter import register as _register_platform
    _register_platform(ctx)
