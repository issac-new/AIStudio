"""
Matrix Chat Info Plugin
=======================

Patches the Matrix adapter at gateway startup to:

1. Expand ``get_chat_info()`` to also return the room topic (``m.room.topic``).
2. Override ``_resolve_message_context()`` to call ``get_chat_info()`` and pass
   ``chat_name``, ``chat_topic``, **and** ``message_id=event_id`` into
   ``build_source()``.
3. Override ``build_session_context_prompt()`` to inject ``**Room ID:**`` and
   ``**Event ID:**`` lines into the session context for Matrix messages, so the
   orchestrator LLM can construct accurate tenant values.

This runs once per gateway start. Survives ``hermes update`` because the
plugin lives in the profile's plugin directory, not in site-packages.

If the upstream Matrix adapter changes shape in a future Hermes release,
patches log a warning and skip — they never crash the gateway.
"""

from __future__ import annotations

import logging
import re
import types

logger = logging.getLogger("plugins.matrix-chat-info")

# Modules we may patch.
_TARGET_MODULE_MATRIX = "gateway.platforms.matrix"
_TARGET_MODULE_SESSION = "gateway.session"

# Sentinel so we can detect if our overrides are already installed.
_SENTINEL_ATTR = "_hermes_matrix_chat_info_patched"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _strip_homeserver(chat_id: str) -> str:
    """Remove the homeserver suffix from a Matrix room/user ID.

    ``!abc123:matrix.test`` → ``!abc123``
    ``@user:matrix.test`` → ``@user``
    """
    # Match the last colon segment that looks like a hostname (contains a dot
    # or is a plain tld).  Room/user IDs may also be bare without colon.
    m = re.search(r"^(.+):[^:]+?\.[^:]+$", chat_id)
    if m:
        return m.group(1)
    return chat_id

# ---------------------------------------------------------------------------
# Patch 1: get_chat_info — add topic
# ---------------------------------------------------------------------------

def _patch_get_chat_info(original_method):
    """Wrap ``get_chat_info`` to also return the room *topic*."""

    async def patched_get_chat_info(self, chat_id: str) -> dict:
        result = await original_method(self, chat_id)
        if not isinstance(result, dict):
            return result
        topic = None
        if self._client:
            from mautrix.types import RoomID

            try:
                topic_evt = await self._client.get_state_event(
                    RoomID(chat_id), "m.room.topic",
                )
                if topic_evt and hasattr(topic_evt, "topic") and topic_evt.topic:
                    topic = topic_evt.topic
            except Exception:
                pass
        result["topic"] = topic
        return result

    return patched_get_chat_info


# ---------------------------------------------------------------------------
# Patch 2: _resolve_message_context — pass chat_name, chat_topic, message_id
# ---------------------------------------------------------------------------

def _patch_resolve_message_context(original_method):
    """Wrap ``_resolve_message_context`` to inject ``chat_name``,
    ``chat_topic``, and ``message_id`` into the source."""

    async def patched_resolve_message_context(
        self, room_id, sender, event_id, body, source_content, relates_to,
    ):
        result = await original_method(
            self, room_id, sender, event_id, body, source_content, relates_to,
        )
        if result is None:
            return None
        body, is_dm, chat_type, thread_id, display_name, source = result

        # Fetch room name + topic.
        chat_info = await self.get_chat_info(room_id)
        room_name = chat_info.get("name") or None
        room_topic = chat_info.get("topic") or None

        # Rebuild source with chat_name, chat_topic, AND message_id.
        source = self.build_source(
            chat_id=room_id,
            chat_name=room_name,
            chat_type=chat_type,
            user_id=sender,
            user_name=display_name,
            thread_id=thread_id,
            chat_topic=room_topic,
            message_id=event_id,             # ← makes event_id available in SessionSource
        )
        return body, is_dm, chat_type, thread_id, display_name, source

    return patched_resolve_message_context


# ---------------------------------------------------------------------------
# Patch 3: build_session_context_prompt — inject **Room ID:** / **Event ID:**
# ---------------------------------------------------------------------------

def _patch_build_session_context_prompt(original_func):
    """Wrap ``build_session_context_prompt`` so that for Matrix messages the
    context also includes ``**Room ID:**`` and ``**Event ID:**`` lines.

    The orchestrator LLM reads these lines to construct the tenant value.
    """

    def patched(context, *, redact_pii=False):
        result = original_func(context, redact_pii=redact_pii)
        src = context.source
        # Only inject for Matrix.
        if src.platform.value != "matrix":
            return result

        extra_lines = []

        # --- Room ID (without homeserver) ---
        if src.chat_id:
            room_id = _strip_homeserver(src.chat_id)
            extra_lines.append(f"**Room ID:** {room_id}")

        # --- Event ID ---
        # Prefer message_id (explicitly set via build_source(message_id=event_id)).
        # Fall back to thread_id (auto_thread sets thread_id = event_id).
        event_id = src.message_id or src.thread_id
        if event_id:
            extra_lines.append(f"**Event ID:** {event_id}")

        if not extra_lines:
            return result

        # Split into lines and inject after the **Source:** line.
        lines = result.split("\n")
        for i, line in enumerate(lines):
            if line.startswith("**Source:"):
                insert_pos = i + 1
                for j, extra in enumerate(extra_lines):
                    lines.insert(insert_pos + j, extra)
                break

        return "\n".join(lines)

    return patched


# ---------------------------------------------------------------------------
# Installer
# ---------------------------------------------------------------------------

def _install_patch():
    """Apply all monkey-patches."""

    # --- Patch from gateway.session ---
    try:
        import importlib
        sess_mod = importlib.import_module(_TARGET_MODULE_SESSION)
    except Exception as exc:
        logger.warning(
            "matrix-chat-info: cannot import %s (%s); session-context patch skipped.",
            _TARGET_MODULE_SESSION, exc,
        )
        sess_mod = None

    if sess_mod is not None:
        orig_build = getattr(sess_mod, "build_session_context_prompt", None)
        if orig_build is None:
            logger.warning(
                "matrix-chat-info: build_session_context_prompt not found in %s; "
                "session-context patch skipped.",
                _TARGET_MODULE_SESSION,
            )
        else:
            setattr(
                sess_mod,
                "build_session_context_prompt",
                _patch_build_session_context_prompt(orig_build),
            )
            logger.info("matrix-chat-info: patched build_session_context_prompt")

    # --- Patch from gateway.platforms.matrix ---
    import importlib

    try:
        mod = importlib.import_module(_TARGET_MODULE_MATRIX)
    except Exception as exc:
        logger.warning(
            "matrix-chat-info: cannot import %s (%s); patch skipped — "
            "upstream layout may have changed.",
            _TARGET_MODULE_MATRIX, exc,
        )
        return

    # Locate the adapter class.
    adapter_cls = None
    for name in dir(mod):
        obj = getattr(mod, name, None)
        if isinstance(obj, type) and "MatrixAdapter" in (getattr(obj, "__name__", "")):
            adapter_cls = obj
            break
    if adapter_cls is None:
        logger.warning(
            "matrix-chat-info: MatrixAdapter not found in %s; patch skipped.",
            _TARGET_MODULE_MATRIX,
        )
        return

    # Guard: don't patch twice.
    if getattr(adapter_cls, _SENTINEL_ATTR, False):
        logger.debug("matrix-chat-info: already patched — skipping.")
        return

    patches_applied = 0

    # --- Patch get_chat_info ---
    orig_get = getattr(adapter_cls, "get_chat_info", None)
    if orig_get is None:
        logger.warning("matrix-chat-info: get_chat_info not found; skipping.")
    else:
        setattr(adapter_cls, "get_chat_info", _patch_get_chat_info(orig_get))
        patches_applied += 1

    # --- Patch _resolve_message_context ---
    orig_resolve = getattr(adapter_cls, "_resolve_message_context", None)
    if orig_resolve is None:
        logger.warning(
            "matrix-chat-info: _resolve_message_context not found; skipping."
        )
    else:
        setattr(
            adapter_cls,
            "_resolve_message_context",
            _patch_resolve_message_context(orig_resolve),
        )
        patches_applied += 1

    # Mark patched.
    setattr(adapter_cls, _SENTINEL_ATTR, True)

    if patches_applied >= 2:
        logger.info(
            "matrix-chat-info: %d patches applied to %s.MatrixAdapter + session prompt.",
            patches_applied,
            _TARGET_MODULE_MATRIX,
        )
    else:
        logger.warning(
            "matrix-chat-info: only %d/2 patches applied to %s.MatrixAdapter.",
            patches_applied,
            _TARGET_MODULE_MATRIX,
        )


def register(ctx):
    """Called by the Hermes plugin system after import.  The patch is already
    applied at module import time (via the top-level ``_install_patch()``
    call); this is a no-op hook."""
    logger.info(
        "matrix-chat-info: registered (patches applied at import time)."
    )


# Auto-install on import.
_install_patch()
