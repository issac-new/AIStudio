#!/usr/bin/env python3
"""Matrix room manager: create rooms, invite users, set aliases, send messages.

Usage:
    # Create room and invite users
    python matrix_room_manager.py create --name "My Room" --invite @user1:matrix.test,@user2:matrix.test

    # Invite user to existing room
    python matrix_room_manager.py invite --room '!room:matrix.test' --user @user:matrix.test

    # Set room alias
    python matrix_room_manager.py alias --room '!room:matrix.test' --alias '#my-room:matrix.test'

    # Send message to room
    python matrix_room_manager.py send --room '!room:matrix.test' --message "Hello!"

Environment:
    MATRIX_HOMESERVER (default: http://localhost:8008)
    MATRIX_ACCESS_TOKEN (required)
"""

import argparse
import asyncio
import json
import os
import sys
from urllib.parse import quote

import aiohttp


HOMESERVER = os.getenv("MATRIX_HOMESERVER", "http://localhost:8008").rstrip("/")
TOKEN=os.get..."MATRIX_ACCESS_TOKEN")

if not TOKEN:
    print("Error: MATRIX_ACCESS_TOKEN not set", file=sys.stderr)
    sys.exit(1)

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
}


def _encode_room(room_id: str) -> str:
    """URL-encode a room ID for use in API paths."""
    return quote(room_id, safe="")


async def create_room(
    name: str,
    topic: str = "",
    invitees: list[str] = None,
    preset: str = "private_chat",
    is_direct: bool = False,
) -> str:
    """Create a Matrix room and return the room ID."""
    url = f"{HOMESERVER}/_matrix/client/v3/createRoom"
    payload = {
        "name": name,
        "topic": topic or None,
        "invite": invitees or [],
        "preset": preset,
        "is_direct": is_direct,
    }
    # Remove None values
    payload = {k: v for k, v in payload.items() if v is not None}

    async with aiohttp.ClientSession() as session:
        async with session.post(url, headers=HEADERS, json=payload) as resp:
            data = await resp.json()
            if resp.status == 200:
                return data["room_id"]
            raise Exception(f"Create room failed ({resp.status}): {json.dumps(data)}")


async def invite_user(room_id: str, user_id: str) -> bool:
    """Invite a user to a room."""
    url = f"{HOMESERVER}/_matrix/client/v3/rooms/{_encode_room(room_id)}/invite"
    payload = {"user_id": user_id}

    async with aiohttp.ClientSession() as session:
        async with session.post(url, headers=HEADERS, json=payload) as resp:
            return resp.status == 200


async def set_alias(room_id: str, alias: str) -> bool:
    """Set a canonical alias for a room."""
    # 1. Create directory mapping
    encoded_alias = alias.replace("#", "%23").replace(":", "%3A")
    dir_url = f"{HOMESERVER}/_matrix/client/v3/directory/room/{encoded_alias}"
    dir_payload = {"room_id": room_id}

    async with aiohttp.ClientSession() as session:
        async with session.put(dir_url, headers=HEADERS, json=dir_payload) as resp:
            if resp.status not in (200, 409):  # 409 = alias already exists
                body = await resp.text()
                print(f"Warning: directory alias set failed ({resp.status}): {body}")

    # 2. Set canonical alias in room state
    state_url = f"{HOMESERVER}/_matrix/client/v3/rooms/{_encode_room(room_id)}/state/m.room.canonical_alias"
    state_payload = {"alias": alias}

    async with aiohttp.ClientSession() as session:
        async with session.put(state_url, headers=HEADERS, json=state_payload) as resp:
            return resp.status == 200


async def send_message(room_id: str, message: str) -> str:
    """Send a text message to a room. Returns event ID."""
    txn_id = f"script_{int(asyncio.get_event_loop().time() * 1000)}"
    url = f"{HOMESERVER}/_matrix/client/v3/rooms/{_encode_room(room_id)}/send/m.room.message/{txn_id}"
    payload = {"msgtype": "m.text", "body": message}

    async with aiohttp.ClientSession() as session:
        async with session.put(url, headers=HEADERS, json=payload) as resp:
            data = await resp.json()
            if resp.status == 200:
                return data.get("event_id")
            raise Exception(f"Send failed ({resp.status}): {json.dumps(data)}")


async def resolve_alias(alias: str) -> str:
    """Resolve a room alias to a room ID."""
    encoded = alias.replace("#", "%23").replace(":", "%3A")
    url = f"{HOMESERVER}/_matrix/client/v3/directory/room/{encoded}"

    async with aiohttp.ClientSession() as session:
        async with session.get(url, headers=HEADERS) as resp:
            data = await resp.json()
            if resp.status == 200:
                return data["room_id"]
            raise Exception(f"Resolve alias failed ({resp.status}): {json.dumps(data)}")


async def list_joined_rooms() -> list[str]:
    """List all rooms the user has joined."""
    url = f"{HOMESERVER}/_matrix/client/v3/joined_rooms"

    async with aiohttp.ClientSession() as session:
        async with session.get(url, headers=HEADERS) as resp:
            data = await resp.json()
            if resp.status == 200:
                return data.get("joined_rooms", [])
            raise Exception(f"List rooms failed ({resp.status}): {json.dumps(data)}")


# ── CLI ──────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(description="Matrix room manager")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # create
    create_parser = subparsers.add_parser("create", help="Create a new room")
    create_parser.add_argument("--name", required=True, help="Room name")
    create_parser.add_argument("--topic", default="", help="Room topic")
    create_parser.add_argument("--invite", default="", help="Comma-separated user IDs to invite")
    create_parser.add_argument("--preset", default="private_chat", choices=["private_chat", "public_chat", "trusted_private_chat"])
    create_parser.add_argument("--direct", action="store_true", help="Create as DM room")

    # invite
    invite_parser = subparsers.add_parser("invite", help="Invite user to room")
    invite_parser.add_argument("--room", required=True, help="Room ID")
    invite_parser.add_argument("--user", required=True, help="User ID to invite")

    # alias
    alias_parser = subparsers.add_parser("alias", help="Set room alias")
    alias_parser.add_argument("--room", required=True, help="Room ID")
    alias_parser.add_argument("--alias", required=True, help="Alias (e.g., #name:server.org)")

    # send
    send_parser = subparsers.add_parser("send", help="Send message to room")
    send_parser.add_argument("--room", required=True, help="Room ID or alias")
    send_parser.add_argument("--message", required=True, help="Message text")

    # resolve
    resolve_parser = subparsers.add_parser("resolve", help="Resolve alias to room ID")
    resolve_parser.add_argument("alias", help="Room alias (e.g., #name:server.org)")

    # list
    subparsers.add_parser("list", help="List joined rooms")

    args = parser.parse_args()

    async def run():
        if args.command == "create":
            invitees = [u.strip() for u in args.invite.split(",") if u.strip()] if args.invite else []
            room_id = await create_room(
                name=args.name,
                topic=args.topic,
                invitees=invitees,
                preset=args.preset,
                is_direct=args.direct,
            )
            print(f"Room created: {room_id}")
            if invitees:
                print(f"Invited: {', '.join(invitees)}")

        elif args.command == "invite":
            success = await invite_user(args.room, args.user)
            print(f"Invite {'succeeded' if success else 'failed'}")

        elif args.command == "alias":
            success = await set_alias(args.room, args.alias)
            print(f"Alias {'set' if success else 'failed'}")

        elif args.command == "send":
            # Resolve alias if needed
            room_id = args.room
            if room_id.startswith("#"):
                room_id = await resolve_alias(room_id)
                print(f"Resolved alias to: {room_id}")
            event_id = await send_message(room_id, args.message)
            print(f"Message sent: {event_id}")

        elif args.command == "resolve":
            room_id = await resolve_alias(args.alias)
            print(f"{args.alias} -> {room_id}")

        elif args.command == "list":
            rooms = await list_joined_rooms()
            print(f"Joined rooms ({len(rooms)}):")
            for r in rooms:
                print(f"  {r}")

    asyncio.run(run())


if __name__ == "__main__":
    main()
