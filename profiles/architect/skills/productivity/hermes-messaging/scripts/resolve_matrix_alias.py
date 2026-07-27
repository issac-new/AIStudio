#!/usr/bin/env python3
"""Resolve a Matrix room alias to a room ID.

Usage:
    python resolve_matrix_alias.py #room01:matrix.test
    python resolve_matrix_alias.py #room01:matrix.test --homeserver http://localhost:8008

Requires MATRIX_ACCESS_TOKEN env var or --token argument.
"""

import argparse
import asyncio
import os
import sys

import aiohttp


async def resolve_alias(homeserver: str, token: str, alias: str) -> str:
    """Resolve a Matrix room alias to a room ID.

    Args:
        homeserver: Matrix homeserver URL (e.g., http://localhost:8008)
        token: Matrix access token
        alias: Room alias (e.g., #room01:matrix.test)

    Returns:
        Room ID (e.g., !<matrix-room-id>:matrix.test)

    Raises:
        Exception: If resolution fails
    """
    # URL-encode the alias for the API path
    encoded = alias.replace("#", "%23").replace(":", "%3A")
    url = f"{homeserver.rstrip('/')}/_matrix/client/v3/directory/room/{encoded}"
    headers = {"Authorization": f"Bearer {token}"}

    async with aiohttp.ClientSession() as session:
        async with session.get(url, headers=headers) as resp:
            if resp.status == 200:
                data = await resp.json()
                return data["room_id"]
            else:
                body = await resp.text()
                raise Exception(f"HTTP {resp.status}: {body}")


def main():
    parser = argparse.ArgumentParser(description="Resolve Matrix room alias to room ID")
    parser.add_argument("alias", help="Room alias (e.g., #room01:matrix.test)")
    parser.add_argument(
        "--homeserver",
        default=os.getenv("MATRIX_HOMESERVER", "http://localhost:8008"),
        help="Matrix homeserver URL (default: MATRIX_HOMESERVER env or http://localhost:8008)",
    )
    parser.add_argument(
        "--token",
        default=os.getenv("MATRIX_ACCESS_TOKEN"),
        help="Matrix access token (default: MATRIX_ACCESS_TOKEN env)",
    )
    args = parser.parse_args()

    if not args.token:
        print("Error: MATRIX_ACCESS_TOKEN not set. Provide via --token or env var.", file=sys.stderr)
        sys.exit(1)

    try:
        room_id = asyncio.run(resolve_alias(args.homeserver, args.token, args.alias))
        print(f"Alias:    {args.alias}")
        print(f"Room ID:  {room_id}")
        print(f"\nUse with send_message:")
        print(f'  {{"target": "matrix:{room_id}", "message": "your message"}}')
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
