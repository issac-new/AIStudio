"""style-charter — controlled-writing charter as a system-prompt section.

Bundled backend plugin (``kind: backend``), so it auto-loads with no
``plugins.enabled`` opt-in. ``register`` contributes one frozen prompt
section at position ``after_memory``: every NEW session prompt across every
profile carries the charter, which constrains chat replies, room messages,
kanban cards, commit messages and deliverable documents alike.

The charter text lives in ``style-charter.md`` next to this file — the single
source of truth shared with the sim harness (simharness mx-lib reads the same
file). A missing or unreadable charter file logs an error and registers
nothing: silent degradation would hide a broken deploy, so we are loud.
"""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

SECTION_ID = "swarmstudio.style-charter"
_CHARTER_PATH = Path(__file__).resolve().parent / "style-charter.md"


def _charter_text() -> str:
    return _CHARTER_PATH.read_text(encoding="utf-8").strip()


def register(ctx) -> None:
    """Register the charter section once. Called by the plugin loader."""
    try:
        text = _charter_text()
    except OSError as exc:
        logger.error("style-charter: %s unreadable (%s); no section registered", _CHARTER_PATH, exc)
        return
    if not text:
        logger.error("style-charter: %s is empty; no section registered", _CHARTER_PATH)
        return
    ctx.register_system_prompt_section(SECTION_ID, text, position="after_memory")
