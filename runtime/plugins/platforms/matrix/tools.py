"""Matrix room-ops agent tools: create a room, list joined rooms, invite members.

These close the gap where an Orchestrator agent had to ask a human to invite
collaborators: the platform adapter already held `invite_user()`, but nothing on
the agent-callable surface reached it. Delivery goes over the Client-Server API
with aiohttp (same as `_standalone_send`) rather than the live mautrix client, so
the tools work whether or not this profile's gateway is the calling process.

Credentials come from the profile's own secret scope and are never accepted as
tool arguments — a token must not reach argv, tool args, or logs.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any
from urllib.parse import quote

from gateway.platforms._shared import get_scoped_secret

logger = logging.getLogger(__name__)

_REQUEST_TIMEOUT_SECONDS = 30
_MAX_INVITES_PER_CALL = 50
_MAX_MEMBER_REPORT = 40

_MXID_RE = re.compile(r"^@[A-Za-z0-9._\-/=+]+:[A-Za-z0-9.\-]+(?::\d+)?$")
_ROOM_REF_RE = re.compile(r"^[!#][A-Za-z0-9._\-/=+]+:[A-Za-z0-9.\-]+(?::\d+)?$")
_PRESETS = ("private_chat", "trusted_private_chat", "public_chat")


def _flag(name: str) -> bool:
    """Boolean gateway setting, read through the same scope as the credentials."""
    return str(get_scoped_secret(name, "") or "").strip().lower() in ("1", "true", "yes", "on")


def _creds() -> tuple[str, str, str] | None:
    """Resolve (homeserver, access_token, user_id), preferring the live adapter.

    Inside a gateway the adapter already holds this profile's credentials — it
    resolved them from ``config.extra`` or its own secret scope at connect time —
    so borrowing them keeps a secondary profile from reaching the default
    profile's homeserver. Out of process (cron, CLI) there is no adapter and the
    scope is the only source.
    """
    adapter = _live_matrix_adapter()
    if adapter is not None:
        homeserver = str(getattr(adapter, "_homeserver", "") or "").rstrip("/")
        token = str(getattr(adapter, "_access_token", "") or "")
        if homeserver and token:
            return homeserver, token, str(getattr(adapter, "_user_id", "") or "")

    homeserver = (get_scoped_secret("MATRIX_HOMESERVER", "", external_fallback=True) or "").rstrip("/")
    token = get_scoped_secret("MATRIX_ACCESS_TOKEN", "", external_fallback=True) or ""
    user_id = get_scoped_secret("MATRIX_USER_ID", "", external_fallback=True) or ""
    if not homeserver or not token:
        return None
    return homeserver, token, user_id


def _live_matrix_adapter():
    """The gateway's authenticated adapter for this profile, or None when standalone.

    Reusing it means credentials, join rules and E2EE state all come from the
    connection the gateway already made — the tool never handles a token. Under
    multiplexing this must be the *active profile's* adapter, which is exactly
    what ``_live_adapter`` resolves (a bare ``runner.adapters`` hit would borrow
    the default profile's identity).
    """
    try:
        from gateway.config import Platform
        from tools.send_message_senders import _live_adapter
    except Exception:  # noqa: BLE001 - processes without a gateway are common
        return None
    try:
        _, adapter = _live_adapter(Platform.MATRIX, lookup_failed_warning=(
            "Matrix: live gateway adapter lookup failed; room-ops will use the Client-Server API"))
    except Exception:  # noqa: BLE001 - no runner in this process
        return None
    return adapter


def _room_ops_available() -> bool:
    """check_fn: expose the tools only when Matrix credentials exist. Fail closed."""
    try:
        return _creds() is not None
    except Exception:  # noqa: BLE001
        return False


def _error(message: str) -> str:
    """Tool failure envelope.

    Handlers must return a JSON *string* per the tool registry contract; the
    platform's ``send_error`` helper returns a dict, which suits the
    standalone-sender path but not this one. Keep messages concise and
    token-free — an http/aiohttp exception string can carry a signed URL.
    """
    return json.dumps({"error": message}, ensure_ascii=False)


async def _cs_request(homeserver: str, token: str, method: str, path: str,
                      body: dict | None = None) -> tuple[int, Any]:
    """One Client-Server API call. Returns (status, parsed json body).

    The body is a dict for most endpoints but a bare list for room `/state`, so
    callers must not assume a mapping.
    """
    import aiohttp

    headers = {"Authorization": f"Bearer {token}"}
    url = f"{homeserver}{path}"

    async def _do() -> tuple[int, Any]:
        async with aiohttp.ClientSession() as session:
            async with session.request(method, url, headers=headers,
                                       json=body if body is not None else None) as resp:
                try:
                    data = await resp.json()
                except Exception:  # noqa: BLE001 - non-JSON error pages are not fatal
                    data = {}
                return resp.status, data

    try:
        # wait_for rather than aiohttp.ClientTimeout: this may run under
        # run_coroutine_threadsafe, where a timeout context manager is not task-bound.
        return await asyncio.wait_for(_do(), timeout=_REQUEST_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        return 0, {"error": f"Matrix API timeout ({_REQUEST_TIMEOUT_SECONDS}s)"}


async def _joined_rooms(homeserver: str, token: str) -> list[str] | None:
    status, data = await _cs_request(homeserver, token, "GET", "/_matrix/client/v3/joined_rooms")
    if status != 200 or not isinstance(data, dict):
        return None
    return [r for r in data.get("joined_rooms", []) if isinstance(r, str)]


async def matrix_room_list(args: dict | None = None, **_: Any) -> str:
    """List the rooms this Matrix account has joined, with names and current members."""
    creds = _creds()
    if not creds:
        return _error("Matrix not configured (MATRIX_HOMESERVER, MATRIX_ACCESS_TOKEN required)")
    homeserver, token, _ = creds

    rooms = await _joined_rooms(homeserver, token)
    if rooms is None:
        return _error("Could not list joined rooms from the homeserver")

    out = []
    for room_id in rooms:
        path = f"/_matrix/client/v3/rooms/{quote(room_id, safe='')}"
        # `/state/<type>` returns the event content directly; the untyped `/state`
        # form returns a bare list of events, which is easy to mis-read as a dict.
        _, name_content = await _cs_request(homeserver, token, "GET", f"{path}/state/m.room.name")
        status, members = await _cs_request(homeserver, token, "GET", f"{path}/joined_members")
        joined = list(members.get("joined", {})) if status == 200 and isinstance(members, dict) else []
        out.append({
            "room_id": room_id,
            "name": (name_content.get("name") or "") if isinstance(name_content, dict) else "",
            "member_count": len(joined),
            "members": joined[:_MAX_MEMBER_REPORT],
        })

    return json.dumps({"count": len(out), "rooms": out}, ensure_ascii=False)


async def _invite_via_adapter(adapter: Any, room_id: str, users: list[str]) -> str:
    """Invite through the gateway's authenticated connection.

    ``invite_user`` reports only success/failure, so a refusal is attributed to the
    homeserver rather than dressed up as a reason the tool does not actually have.
    """
    self_id = str(getattr(adapter, "_user_id", "") or "")
    invited, failed = [], []
    for user in users:
        if self_id and user.lower() == self_id.lower():
            invited.append({"user": user, "result": "already this account"})
            continue
        if await adapter.invite_user(room_id, user):
            invited.append({"user": user, "result": "invited"})
        else:
            failed.append({"user": user,
                           "reason": "homeserver refused the invite (check this account's "
                                     "room membership and power level)"})
    return json.dumps({"room_id": room_id, "invited": invited, "failed": failed,
                       "ok": not failed}, ensure_ascii=False)


async def matrix_room_invite(args: dict | None = None, **_: Any) -> str:
    """Invite one or more Matrix users into a room this account has joined."""
    params = args or {}
    room_id = str(params.get("room_id", "")).strip()
    raw_users = params.get("users") or params.get("user_id") or []
    if isinstance(raw_users, str):
        raw_users = [u.strip() for u in re.split(r"[,\s]+", raw_users) if u.strip()]
    if not _ROOM_REF_RE.match(room_id):
        return _error("room_id must be a Matrix room ID (!...) or alias (#...)")
    if not isinstance(raw_users, list) or not raw_users:
        return _error("users must be a non-empty list of Matrix user IDs")
    if len(raw_users) > _MAX_INVITES_PER_CALL:
        return _error(f"users exceeds the {_MAX_INVITES_PER_CALL}-per-call limit")

    # Validate every ID before touching the network: a malformed ID should report
    # itself rather than be masked by an unrelated room-membership error.
    users = [str(u).strip() for u in raw_users]
    bad = [u for u in users if not _MXID_RE.match(u)]
    if bad:
        return _error(f"invalid Matrix user ID(s): {', '.join(bad)}")

    adapter = _live_matrix_adapter()
    if adapter is not None:
        return await _invite_via_adapter(adapter, room_id, users)

    creds = _creds()
    if not creds:
        return _error("Matrix not configured (MATRIX_HOMESERVER, MATRIX_ACCESS_TOKEN required)")
    homeserver, token, self_id = creds

    joined = await _joined_rooms(homeserver, token)
    if joined is None:
        return _error("Invite refused: the homeserver did not confirm this account's rooms")
    if room_id not in joined:
        return _error(f"This account is not joined to {room_id}; inviting would fail anyway")

    invited, failed = [], []
    for user in users:
        if user.lower() == self_id.lower():
            invited.append({"user": user, "result": "already this account"})
            continue
        status, data = await _cs_request(
            homeserver, token, "POST",
            f"/_matrix/client/v3/rooms/{quote(room_id, safe='')}/invite",
            {"user_id": user})
        if status == 200:
            invited.append({"user": user, "result": "invited"})
        else:
            reason = data.get("errcode") or f"HTTP {status}"
            detail = data.get("error") or ""
            failed.append({"user": user, "reason": f"{reason} {detail}".strip()})

    return json.dumps({"room_id": room_id, "invited": invited, "failed": failed,
                       "ok": not failed}, ensure_ascii=False)


async def matrix_room_create(args: dict | None = None, **_: Any) -> str:
    """Create a named room, optionally inviting members in the same call."""
    params = args or {}
    name = str(params.get("name", "")).strip()
    topic = str(params.get("topic", "")).strip()
    preset = str(params.get("preset", "private_chat")).strip() or "private_chat"
    invite = params.get("invite") or []
    if isinstance(invite, str):
        invite = [u.strip() for u in re.split(r"[,\s]+", invite) if u.strip()]
    if not name:
        return _error("name is required")
    if preset not in _PRESETS:
        return _error(f"preset must be one of {', '.join(_PRESETS)}")
    if not isinstance(invite, list):
        return _error("invite must be a list of Matrix user IDs")
    if len(invite) > _MAX_INVITES_PER_CALL:
        return _error(f"invite exceeds the {_MAX_INVITES_PER_CALL}-per-call limit")

    bad = [u for u in invite if not _MXID_RE.match(str(u).strip())]
    if bad:
        return _error(f"invalid Matrix user ID(s): {', '.join(bad)}")
    users = [str(u).strip() for u in invite]

    # Same gate the adapter enforces, so the two paths cannot disagree.
    if preset == "public_chat" and not _flag("MATRIX_ALLOW_PUBLIC_ROOMS"):
        return _error("public_chat is refused unless MATRIX_ALLOW_PUBLIC_ROOMS=true is set on this gateway")

    adapter = _live_matrix_adapter()
    if adapter is not None:
        room_id = await adapter.create_room(name=name, topic=topic, invite=users, preset=preset)
        if not room_id:
            return _error("createRoom refused; see the gateway log for the homeserver error")
        return json.dumps({"ok": True, "room_id": room_id, "name": name,
                           "invited": len(users)}, ensure_ascii=False)

    creds = _creds()
    if not creds:
        return _error("Matrix not configured (MATRIX_HOMESERVER, MATRIX_ACCESS_TOKEN required)")
    homeserver, token, _ = creds

    body: dict[str, Any] = {"name": name, "preset": preset, "invite": users}
    if topic:
        body["topic"] = topic
    visibility = str(get_scoped_secret("MATRIX_ROOM_OPS_VISIBILITY", "") or "").strip()
    if visibility in ("private", "world_readable"):
        body["visibility"] = visibility

    status, data = await _cs_request(homeserver, token, "POST", "/_matrix/client/v3/createRoom", body)
    if status != 200:
        return _error(f"createRoom failed: {data.get('errcode') or f'HTTP {status}'} "
                      f"{data.get('error') or ''}".strip())
    return json.dumps({"ok": True, "room_id": data.get("room_id"), "name": name,
                       "invited": len(users)}, ensure_ascii=False)


_TOOLS: dict[str, tuple] = {
    "matrix_room_invite": (
        matrix_room_invite,
        "Invite Matrix users into a room the assistant is already a member of. Use after "
        "splitting a requirement into per-owner tasks so each owner's account receives the "
        "assignment in the shared room. Accepts a list of user IDs; reports per-user results.",
        {"room_id": {"type": "string", "description": "Target room ID (!...) or alias (#...)."},
         "users": {"type": "array", "items": {"type": "string"},
                   "description": "Matrix user IDs to invite, e.g. ['@chen:matrix.test']."}},
        ["room_id", "users"],
        "📨",
    ),
    "matrix_room_create": (
        matrix_room_create,
        "Create a Matrix room (optionally named and with members invited in the same call). "
        "Use for a per-requirement discussion room or a per-task tracking room.",
        {"name": {"type": "string", "description": "Room display name."},
         "topic": {"type": "string", "description": "Optional room topic / purpose line."},
         "invite": {"type": "array", "items": {"type": "string"},
                    "description": "Matrix user IDs to invite on creation."},
         "preset": {"type": "string", "enum": list(_PRESETS),
                    "description": "Default: private_chat."}},
        ["name"],
        "🏠",
    ),
    "matrix_room_list": (
        matrix_room_list,
        "List the Matrix rooms this account has joined, with names. Use to locate an existing "
        "requirement room before creating a duplicate.",
        {},
        [],
        "📋",
    ),
}


def register_tools(ctx) -> None:
    """Register the room-ops tools into the ``matrix`` toolset (credentials-gated)."""
    for name, (handler, description, properties, required, emoji) in _TOOLS.items():
        parameters: dict[str, Any] = {"type": "object", "properties": properties}
        if required:
            parameters["required"] = required
        schema = {"name": name, "description": description, "parameters": parameters}
        ctx.register_tool(name=name, toolset="matrix", handler=handler, description=description,
                          schema=schema, emoji=emoji, check_fn=_room_ops_available, is_async=True)
